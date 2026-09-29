"""
Asistente IA - Aplicación para Raspberry Pi con Pantalla Táctil de 7" (800x480 px)
Framework: Flet (Python)
Modo: Quiosco / Pantalla Completa
Tema: Dark Slate
"""

import os
import sys
import threading
import time
import flet as ft

# Intentar importar dependencias opcionales para STT/TTS o Gemini
try:
    from google import genai
    from google.genai import types
    HAS_GENAI = True
except ImportError:
    HAS_GENAI = False

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


def main(page: ft.Page):
    # -------------------------------------------------------------
    # 1. Configuración de Ventana y Pantalla (800x480 px Kiosk)
    # -------------------------------------------------------------
    page.title = "ASISTENTE IA"
    page.window.width = 800
    page.window.height = 480
    page.window.resizable = False
    # Para modo quiosco en Raspberry Pi, descomentar o mantener True:
    # page.window.full_screen = True
    page.window.frameless = False  # En Raspberry Pi setear True para quiosco puro
    
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.bgcolor = "#0F172A"  # Slate oscuro profundo
    page.padding = 16

    # Estado interno
    is_listening = False
    is_speaking = False

    # -------------------------------------------------------------
    # 2. Inicialización de Motores de Voz y LLM
    # -------------------------------------------------------------
    api_key = os.environ.get("GEMINI_API_KEY", "")
    ai_client = None
    if HAS_GENAI and api_key:
        try:
            ai_client = genai.Client(api_key=api_key)
        except Exception as e:
            print(f"Aviso: no se pudo iniciar Gemini Client: {e}")

    tts_engine = None
    if HAS_TTS:
        try:
            tts_engine = pyttsx3.init()
            tts_engine.setProperty('rate', 165)
            # Buscar voz en español si está disponible
            voices = tts_engine.getProperty('voices')
            for v in voices:
                if "spanish" in v.name.lower() or "es" in v.id.lower():
                    tts_engine.setProperty('voice', v.id)
                    break
        except Exception as e:
            print(f"Aviso TTS: {e}")

    # -------------------------------------------------------------
    # 3. Componentes de la Interfaz
    # -------------------------------------------------------------
    # Cabecera centrada
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
        "Listo para escuchar o recibir texto...",
        size=13,
        color="#94A3B8",
        italic=True
    )

    # Caja de respuestas elevada de 580x180 px con bordes redondeados (16px)
    texto_respuesta = ft.Text(
        "Toca el micrófono o escribe una consulta abajo. Las respuestas se generarán en tiempo real.",
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

    # Campo de texto (TextField) integrado
    input_prompt = ft.TextField(
        hint_text="Escribe tu consulta aquí...",
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
    # 4. Lógica de Respuesta y Procesamiento
    # -------------------------------------------------------------
    def hablar_texto(mensaje: str):
        nonlocal is_speaking
        if HAS_TTS and tts_engine:
            try:
                is_speaking = True
                tts_engine.say(mensaje)
                tts_engine.runAndWait()
            except Exception as e:
                print(f"Error reproduciendo audio: {e}")
            finally:
                is_speaking = False

    def generar_respuesta_llm(prompt_text: str):
        # 1. Si tenemos cliente Gemini configurado
        if ai_client:
            try:
                response = ai_client.models.generate_content(
                    model="gemini-3.8-flash",
                    contents=prompt_text,
                    config=types.GenerateContentConfig(
                        system_instruction=(
                            "Eres un asistente IA conciso y claro para una pantalla táctil de Raspberry Pi (800x480). "
                            "Responde en español de forma directa, útil y fácil de leer sin rodeos."
                        ),
                        temperature=0.7
                    )
                )
                return response.text.strip()
            except Exception as e:
                print(f"Error en Gemini API: {e}")
        
        # 2. Respuestas rápidas de contingencia / offline
        prompt_lower = prompt_text.lower()
        if any(w in prompt_lower for w in ["hola", "buen día", "buenas"]):
            return "¡Hola! Estoy listo para asistirte en la pantalla táctil de tu Raspberry Pi. ¿Qué necesitas?"
        elif any(w in prompt_lower for w in ["hora", "tiempo", "fecha"]):
            return f"Hora actual en el sistema: {time.strftime('%H:%M:%S')} - Fecha: {time.strftime('%d/%m/%Y')}."
        elif any(w in prompt_lower for w in ["pantalla", "resolucion", "hardware"]):
            return "Configurado para pantalla táctil oficial de 7 pulgadas con resolución 800x480 px y tema Dark Slate."
        else:
            return f"He recibido: '{prompt_text}'. El sistema está respondiendo con latencia mínima."

    def worker_procesar(texto: str):
        # Indicador de estado
        estado_voz.value = "Procesando respuesta..."
        estado_voz.color = "#60A5FA"
        texto_respuesta.value = "Pensando..."
        texto_respuesta.color = "#94A3B8"
        page.update()

        t_inicio = time.time()
        respuesta = generar_respuesta_llm(texto)
        latencia_ms = int((time.time() - t_inicio) * 1000)

        # Mostrar respuesta
        texto_respuesta.value = respuesta
        texto_respuesta.color = "#F8FAFC"
        estado_voz.value = f"Listo · Respuesta generada en {latencia_ms}ms"
        estado_voz.color = "#94A3B8"
        page.update()

        # Opcional: leer por voz en segundo plano
        if HAS_TTS:
            threading.Thread(target=hablar_texto, args=(respuesta,), daemon=True).start()

    def procesar_consulta(texto: str):
        if not texto or not texto.strip():
            return
        input_prompt.value = ""
        page.update()
        threading.Thread(target=worker_procesar, args=(texto.strip(),), daemon=True).start()

    # -------------------------------------------------------------
    # 5. Captura de Voz (Speech to Text)
    # -------------------------------------------------------------
    def worker_escuchar():
        nonlocal is_listening
        if not HAS_SR:
            estado_voz.value = "Módulo SpeechRecognition no instalado (pip install SpeechRecognition pyaudio)"
            estado_voz.color = "#F87171"
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()
            is_listening = False
            return

        r = sr.Recognizer()
        try:
            with sr.Microphone() as source:
                r.adjust_for_ambient_noise(source, duration=0.6)
                audio = r.listen(source, timeout=5, phrase_time_limit=8)
                estado_voz.value = "Transcribiendo voz..."
                page.update()
                transcripcion = r.recognize_google(audio, language="es-ES")
                input_prompt.value = transcripcion
                page.update()
                procesar_consulta(transcripcion)
        except Exception as err:
            estado_voz.value = f"No se detectó audio ({err.__class__.__name__})"
            estado_voz.color = "#94A3B8"
        finally:
            is_listening = False
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()

    def toggle_microfono(e):
        nonlocal is_listening
        if is_listening:
            is_listening = False
            estado_voz.value = "Escucha cancelada."
            boton_mic.bgcolor = "#1E293B"
            boton_mic.icon_color = "#3B82F6"
            page.update()
            return

        is_listening = True
        estado_voz.value = "Escuchando voz por micrófono..."
        estado_voz.color = "#EF4444"
        boton_mic.bgcolor = "#3B82F6"
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
        tooltip="Hablar (Táctil)",
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

    # Contenedor principal de la interfaz
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
