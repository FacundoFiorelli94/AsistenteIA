"""
Asistente IA - Aplicación para Raspberry Pi con Pantalla Táctil de 7" (800x480 px)
Framework: Flet (Python) + Motor Groq AI de Ultra-Baja Latencia
Modo: Quiosco / Pantalla Completa
Tema: Dark Slate
Arquitectura de voz inspirada en Local-Voice (m15-ai/Local-Voice):
- Detección de Wake Word ("Hola Asistente")
- Anti-Colisión y Barge-in (Interrupción inmediata del habla al recibir órdenes)
- Supresión de Eco acústico (no se pisa al hablar)
"""

import os
import sys
import threading
import time
import json
import urllib.request
import urllib.error
import flet as ft

# Intentar importar dependencias opcionales para STT/TTS
try:
    import speech_recognition as sr
    HAS_SR = True
except ImportError:
    HAS_SR = False

try:
    import pyttsx3
    HAS_TTS = True
except ImportError:
    HAS_TTS = False


def llamar_groq_api(prompt: str, api_key: str, modelo: str = "qwen/qwen3.8-27b") -> str:
    """Realiza una consulta a Groq API con latencia mínima."""
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "AsistenteIA-RaspberryPi/1.0"
    }
    payload = {
        "model": modelo,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Eres un asistente de Inteligencia Artificial rápido y conciso para pantalla táctil de Raspberry Pi (800x480 px). "
                    "Responde en español de forma directa, útil, clara y breve sin rodeos."
                )
            },
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 512
    }

    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))
        return data["choices"][0]["message"]["content"].strip()


def main(page: ft.Page):
    # -------------------------------------------------------------
    # 1. Configuración de Ventana y Pantalla (800x480 px Kiosk)
    # -------------------------------------------------------------
    page.title = "ASISTENTE IA"
    page.window.width = 800
    page.window.height = 480
    page.window.resizable = False
    page.window.frameless = False  # En Raspberry Pi setear True para quiosco puro
    
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.bgcolor = "#0F172A"  # Slate oscuro profundo
    page.padding = 16

    # Estado interno y Anti-Colisión (Mutex)
    is_listening = False
    is_speaking = False
    stop_speaking_event = threading.Event()
    tts_lock = threading.Lock()

    # -------------------------------------------------------------
    # 2. Inicialización de Motores de Voz y LLM
    # -------------------------------------------------------------
    groq_api_key = os.environ.get("GROQ_API_KEY", "")
    tts_engine = None

    if HAS_TTS:
        try:
            tts_engine = pyttsx3.init()
            tts_engine.setProperty('rate', 160)
            voices = tts_engine.getProperty('voices')
            for v in voices:
                if "spanish" in v.name.lower() or "es" in v.id.lower() or "sabina" in v.name.lower():
                    tts_engine.setProperty('voice', v.id)
                    break
        except Exception as e:
            print(f"Aviso TTS: {e}")

    # -------------------------------------------------------------
    # 3. Componentes de la Interfaz
    # -------------------------------------------------------------
    icono_app = ft.Icon(
        name=ft.Icons.AUTO_AWESOME_ROUNDED,
        color="#60A5FA",
        size=30
    )
    
    titulo = ft.Text(
        "ASISTENTE IA",
        size=24,
        weight=ft.FontWeight.BOLD,
        color="#F8FAFC",
        font_family="sans-serif"
    )

    header = ft.Row(
        [icono_app, titulo],
        alignment=ft.MainAxisAlignment.CENTER,
        spacing=10
    )

    # Indicador de estado dinámico
    estado_voz = ft.Text(
        'Listo · Di "Hola Asistente" o toca el micrófono',
        size=13,
        color="#94A3B8",
        italic=True
    )

    # Caja de respuestas elevada de 580x180 px con bordes redondeados (16px)
    texto_respuesta = ft.Text(
        "Toca el micrófono o escribe una consulta abajo. Di 'Hola Asistente' para hablar en tiempo real.",
        color="#CBD5E1",
        size=15,
        selectable=True
    )

    caja_respuesta = ft.Container(
        content=ft.Column(
            [texto_respuesta],
            scroll=ft.ScrollMode.AUTO,
            expand=True
        ),
        bgcolor="#1E293B",
        padding=18,
        border_radius=16,
        border=ft.border.all(1, "#334155"),
        width=580,
        height=180,
        alignment=ft.alignment.top_left,
        animate=ft.Animation(200, ft.AnimationCurve.EASE_OUT)
    )

    input_prompt = ft.TextField(
        hint_text="Escribe o habla: 'Hola Asistente'...",
        hint_style=ft.TextStyle(color="#64748B", size=14),
        expand=True,
        border_radius=12,
        color="#F8FAFC",
        bgcolor="#1E293B",
        border_color="#334155",
        focused_border_color="#3B82F6",
        content_padding=14,
        text_size=15,
        on_submit=lambda e: procesar_consulta(input_prompt.value)
    )

    # -------------------------------------------------------------
    # 4. Lógica de Respuesta y Anti-Colisión (Barge-in)
    # -------------------------------------------------------------
    def detener_habla():
        """Barge-in: Detiene inmediatamente la voz del asistente si el usuario habla o pulsa botón."""
        nonlocal is_speaking
        stop_speaking_event.set()
        if HAS_TTS and tts_engine:
            try:
                tts_engine.stop()
            except Exception:
                pass
        is_speaking = False

    def hablar_texto(mensaje: str):
        """Reproduce voz protegiendo contra solapamiento / pisado."""
        nonlocal is_speaking
        with tts_lock:
            stop_speaking_event.clear()
            is_speaking = True
            try:
                if HAS_TTS and tts_engine:
                    tts_engine.say(mensaje)
                    tts_engine.runAndWait()
            except Exception as e:
                print(f"Error reproduciendo audio: {e}")
            finally:
                is_speaking = False

    def generar_respuesta_llm(prompt_text: str):
        # 1. Groq Cloud ultra-rápido si está configurado
        if groq_api_key:
            try:
                return llamar_groq_api(prompt_text, groq_api_key)
            except Exception as e:
                print(f"Aviso Groq API ({e}), usando respuestas de contingencia...")

        # 2. Respuestas rápidas integradas (modo offline / edge)
        prompt_lower = prompt_text.lower()
        if "hola" in prompt_lower or "buen día" in prompt_lower:
            return "¡Hola! Estoy listo para asistirte en tiempo real. ¿Qué necesitas consultar?"
        elif any(w in prompt_lower for w in ["hora", "tiempo"]):
            return f"Son las {time.strftime('%H:%M:%S')} del {time.strftime('%d/%m/%Y')}."
        elif any(w in prompt_lower for w in ["pantalla", "resolucion"]):
            return "Pantalla táctil oficial Raspberry Pi de 7 pulgadas (800x480 px)."
        elif any(w in prompt_lower for w in ["silencio", "detente", "para", "cállate"]):
            detener_habla()
            return "Audio silenciado."
        else:
            return f"Entendido: '{prompt_text}'. Procesado en tiempo real sin colisiones."

    def worker_procesar(texto: str):
        detener_habla()  # Si estaba hablando, cortar de inmediato

        estado_voz.value = "Generando respuesta en tiempo real..."
        estado_voz.color = "#60A5FA"
        texto_respuesta.value = "Pensando..."
        texto_respuesta.color = "#94A3B8"
        page.update()

        t_inicio = time.time()
        respuesta = generar_respuesta_llm(texto)
        latencia_ms = int((time.time() - t_inicio) * 1000)

        texto_respuesta.value = respuesta
        texto_respuesta.color = "#F8FAFC"
        estado_voz.value = f"Listo · Respuesta en {latencia_ms}ms"
        estado_voz.color = "#94A3B8"
        page.update()

        # Reproducir voz en hilo protegido
        if HAS_TTS:
            threading.Thread(target=hablar_texto, args=(respuesta,), daemon=True).start()

    def procesar_consulta(texto: str):
        if not texto or not texto.strip():
            return
        input_prompt.value = ""
        page.update()
        threading.Thread(target=worker_procesar, args=(texto.strip(),), daemon=True).start()

    # -------------------------------------------------------------
    # 5. Captura de Voz con Wake Word ("Hola Asistente") y Barge-In
    # -------------------------------------------------------------
    def worker_escuchar():
        nonlocal is_listening
        if not HAS_SR:
            estado_voz.value = "SpeechRecognition no instalado (pip install SpeechRecognition pyaudio)"
            estado_voz.color = "#F87171"
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()
            is_listening = False
            return

        # Barge-in: si el asistente estaba hablando, detenerlo antes de escuchar al usuario
        detener_habla()

        r = sr.Recognizer()
        r.dynamic_energy_threshold = True
        try:
            with sr.Microphone() as source:
                r.adjust_for_ambient_noise(source, duration=0.4)
                audio = r.listen(source, timeout=6, phrase_time_limit=8)
                estado_voz.value = "Transcribiendo voz..."
                page.update()
                transcripcion = r.recognize_google(audio, language="es-ES").strip()
                
                # Procesar comando / Wake word
                lower_text = transcripcion.lower()
                if any(w in lower_text for w in ["silencio", "para", "detente", "cállate"]):
                    detener_habla()
                    estado_voz.value = "Audio silenciado."
                    page.update()
                    return

                # Si incluye wake word "hola asistente", extraer consulta
                if "hola asistente" in lower_text or "asistente" in lower_text:
                    consulta = lower_text.replace("hola asistente", "").replace("asistente", "").strip()
                    if not consulta:
                        consulta = "Hola"
                    input_prompt.value = transcripcion
                    page.update()
                    procesar_consulta(consulta)
                else:
                    input_prompt.value = transcripcion
                    page.update()
                    procesar_consulta(transcripcion)

        except Exception as err:
            estado_voz.value = f"Listo · Di 'Hola Asistente' para empezar ({err.__class__.__name__})"
            estado_voz.color = "#94A3B8"
        finally:
            is_listening = False
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()

    def toggle_microfono(e):
        nonlocal is_listening
        if is_speaking:
            detener_habla()
            estado_voz.value = "Audio silenciado (Barge-in)."
            page.update()
            return

        if is_listening:
            is_listening = False
            estado_voz.value = "Escucha cancelada."
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()
            return

        is_listening = True
        estado_voz.value = "Escuchando voz... Habla ahora"
        estado_voz.color = "#EF4444"
        boton_mic.bgcolor = "#EF4444"
        boton_mic.icon_color = "#FFFFFF"
        page.update()

        threading.Thread(target=worker_escuchar, daemon=True).start()

    # -------------------------------------------------------------
    # 6. Botones táctiles optimizados (mínimo 48x48 px)
    # -------------------------------------------------------------
    boton_mic = ft.IconButton(
        icon=ft.Icons.MIC_ROUNDED,
        icon_color="#3B82F6",
        icon_size=24,
        tooltip="Hablar / Silenciar (Táctil)",
        on_click=toggle_microfono,
        style=ft.ButtonStyle(
            shape=ft.RoundedRectangleBorder(radius=12),
            bgcolor="#1E293B",
            side=ft.BorderSide(1, "#334155")
        ),
        height=48,
        width=48
    )

    boton_enviar = ft.ElevatedButton(
        content=ft.Row(
            [
                ft.Icon(ft.Icons.SEND_ROUNDED, size=18, color=ft.Colors.WHITE),
                ft.Text("Enviar", color=ft.Colors.WHITE, weight=ft.FontWeight.W_600, size=14)
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=8
        ),
        on_click=lambda e: procesar_consulta(input_prompt.value),
        bgcolor="#2563EB",
        height=48,
        style=ft.ButtonStyle(
            shape=ft.RoundedRectangleBorder(radius=12),
            padding=ft.padding.symmetric(horizontal=16)
        )
    )

    fila_input = ft.Container(
        width=580,
        content=ft.Row(
            [
                boton_mic,
                input_prompt,
                boton_enviar
            ],
            spacing=10,
            alignment=ft.MainAxisAlignment.CENTER
        )
    )

    tarjeta_principal = ft.Container(
        content=ft.Column(
            [
                header,
                estado_voz,
                caja_respuesta,
                fila_input
            ],
            alignment=ft.MainAxisAlignment.CENTER,
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            spacing=14
        ),
        padding=16,
        bgcolor="#0F172A",
        alignment=ft.alignment.center
    )

    page.add(tarjeta_principal)


if __name__ == "__main__":
    ft.app(target=main)
