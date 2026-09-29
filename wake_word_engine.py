"""
Módulo WakeWordEngine: Detección de Wake Word desacoplada usando Picovoice Porcupine y PyAudio.
Diseñado para ejecutarse en segundo plano (Daemon Thread) sin bloquear la interfaz de usuario.
"""

import inspect
import logging
import struct
import threading
from typing import Callable, List, Optional

logger = logging.getLogger(__name__)


class WakeWordEngine:
    """
    Motor desacoplado para la detección de palabras de activación (Wake Word).
    
    Encapsula la captura de audio con PyAudio y el reconocimiento acústico
    con Picovoice Porcupine en un hilo en segundo plano (Daemon Thread).
    """

    def __init__(
        self,
        access_key: str,
        keywords: Optional[List[str]] = None,
        keyword_paths: Optional[List[str]] = None,
        sensitivities: Optional[List[float]] = None,
        on_keyword_detected: Optional[Callable[..., None]] = None,
        input_device_index: Optional[int] = None,
    ):
        """
        Inicializa la configuración de WakeWordEngine.

        :param access_key: Clave de acceso de Picovoice Console.
        :param keywords: Lista de palabras clave predefinidas (ej. ["jarvis", "picovoice", "porcupine"]).
        :param keyword_paths: Rutas a archivos personalizados de palabra clave (.ppn).
        :param sensitivities: Sensibilidad de detección (flotante entre 0.0 y 1.0 por cada keyword).
        :param on_keyword_detected: Callback invocado al detectar la palabra clave.
        :param input_device_index: Índice del dispositivo de audio de entrada (None para default).
        """
        self.access_key = access_key
        self.keywords = keywords or (["jarvis"] if not keyword_paths else None)
        self.keyword_paths = keyword_paths
        self.sensitivities = sensitivities
        self.on_keyword_detected = on_keyword_detected
        self.input_device_index = input_device_index

        # Referencias a librerías y recursos de hardware
        self._porcupine = None
        self._pyaudio = None
        self._audio_stream = None

        # Control de hilos y ciclo de vida
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._is_running = False
        self._lock = threading.Lock()

    def _init_audio_and_porcupine(self) -> None:
        """Inicializa las instancias nativas de Porcupine y PyAudio."""
        try:
            import pvporcupine
            import pyaudio
        except ImportError as e:
            raise ImportError(
                "Faltan dependencias necesarias. Instálalas ejecutando: "
                "pip install pvporcupine pyaudio"
            ) from e

        if not self.access_key or self.access_key.strip() == "":
            raise ValueError(
                "Picovoice AccessKey requerida. "
                "Obtén una gratuita en https://console.picovoice.ai/"
            )

        # 1. Inicializar Porcupine
        porcupine_kwargs = {"access_key": self.access_key}
        if self.keyword_paths:
            porcupine_kwargs["keyword_paths"] = self.keyword_paths
        elif self.keywords:
            porcupine_kwargs["keywords"] = self.keywords

        if self.sensitivities:
            porcupine_kwargs["sensitivities"] = self.sensitivities

        self._porcupine = pvporcupine.create(**porcupine_kwargs)

        # 2. Inicializar PyAudio y abrir flujo de entrada
        self._pyaudio = pyaudio.PyAudio()
        self._audio_stream = self._pyaudio.open(
            rate=self._porcupine.sample_rate,
            channels=1,
            format=pyaudio.paInt16,
            input=True,
            frames_per_buffer=self._porcupine.frame_length,
            input_device_index=self.input_device_index,
        )

    def _audio_loop(self) -> None:
        """
        Bucle de lectura y procesamiento de audio ejecutado en el hilo Daemon.
        """
        frame_length = self._porcupine.frame_length

        try:
            while not self._stop_event.is_set():
                # Lectura de tramas PCM del micrófono (sin lanzar excepciones en desbordamiento de búfer)
                try:
                    pcm_bytes = self._audio_stream.read(
                        frame_length,
                        exception_on_overflow=False
                    )
                except Exception as read_err:
                    if self._stop_event.is_set():
                        break
                    logger.warning(f"Error leyendo flujo de audio: {read_err}")
                    continue

                if not pcm_bytes:
                    continue

                # Desempaquetado a enteros con signo de 16 bits
                pcm = struct.unpack_from(f"{frame_length}h", pcm_bytes)

                # Procesamiento por Porcupine
                keyword_index = self._porcupine.process(pcm)

                # Si keyword_index >= 0, se detectó una palabra clave
                if keyword_index >= 0:
                    self._dispatch_callback(keyword_index)

        except Exception as e:
            if not self._stop_event.is_set():
                logger.error(f"Error en el hilo de escucha WakeWord: {e}", exc_info=True)
        finally:
            self._cleanup_resources()

    def _dispatch_callback(self, keyword_index: int) -> None:
        """Ejecuta el callback desacoplado de manera segura."""
        if not self.on_keyword_detected or not callable(self.on_keyword_detected):
            return

        try:
            # Inspección dinámica para aceptar callbacks con o sin argumentos
            sig = inspect.signature(self.on_keyword_detected)
            if len(sig.parameters) == 0:
                self.on_keyword_detected()
            else:
                self.on_keyword_detected(keyword_index)
        except Exception as cb_err:
            logger.error(f"Excepción en el callback 'on_keyword_detected': {cb_err}", exc_info=True)

    def start(self) -> None:
        """
        Inicia el motor de detección en un hilo Daemon en segundo plano.
        No bloquea el hilo llamador ni el bucle de eventos de la UI.
        """
        with self._lock:
            if self._is_running:
                logger.warning("WakeWordEngine ya se encuentra en ejecución.")
                return

            self._stop_event.clear()
            self._init_audio_and_porcupine()

            self._thread = threading.Thread(
                target=self._audio_loop,
                name="WakeWordEngine-DaemonThread",
                daemon=True,
            )
            self._is_running = True
            self._thread.start()
            logger.info("WakeWordEngine iniciado correctamente en hilo Daemon.")

    def stop(self) -> None:
        """
        Detiene el hilo de fondo de manera segura y libera los recursos de audio y Porcupine.
        """
        with self._lock:
            if not self._is_running and self._audio_stream is None:
                return

            self._stop_event.set()
            self._is_running = False

        # Esperar a que el hilo termine si no somos el mismo hilo
        if self._thread and self._thread.is_alive() and threading.current_thread() != self._thread:
            self._thread.join(timeout=1.5)
            self._thread = None

        self._cleanup_resources()
        logger.info("WakeWordEngine detenido y recursos liberados.")

    def _cleanup_resources(self) -> None:
        """Cierre y liberación ordenada de recursos nativos (close, terminate, delete)."""
        # 1. Cerrar flujo de audio
        if self._audio_stream is not None:
            try:
                self._audio_stream.stop_stream()
            except Exception:
                pass
            try:
                self._audio_stream.close()
            except Exception:
                pass
            self._audio_stream = None

        # 2. Terminar PyAudio
        if self._pyaudio is not None:
            try:
                self._pyaudio.terminate()
            except Exception:
                pass
            self._pyaudio = None

        # 3. Eliminar instancia nativa de Porcupine
        if self._porcupine is not None:
            try:
                self._porcupine.delete()
            except Exception:
                pass
            self._porcupine = None

    @property
    def is_running(self) -> bool:
        """Indica si el motor está actualmente escuchando."""
        return self._is_running and (self._thread.is_alive() if self._thread else False)

    def __enter__(self):
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop()
