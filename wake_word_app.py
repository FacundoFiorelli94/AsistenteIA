"""
Script principal con Flet: Integración de WakeWordEngine.
Al recibir la señal del callback, actualiza un ft.Text en pantalla para indicar 'Escuchando...'.
"""

import os
import threading
import time
import flet as ft
from wake_word_engine import WakeWordEngine


def main(page: ft.Page):
    # Configuración básica de la ventana
    page.title = "Asistente IA - Detección Wake Word"
    page.window.width = 480
    page.window.height = 360
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.bgcolor = "#0F172A"

    # Elemento ft.Text que refleja el estado del asistente
    status_text = ft.Text(
        value="Esperando palabra clave...",
        size=24,
        weight=ft.FontWeight.W_600,
        color=ft.colors.BLUE_GREY_200,
        text_align=ft.TextAlign.CENTER,
    )

    status_icon = ft.Icon(
        name=ft.icons.MIC_NONE_ROUNDED,
        size=64,
        color=ft.colors.BLUE_GREY_400,
    )

    # Callback desacoplado que WakeWordEngine ejecuta en segundo plano
    def on_keyword_detected(keyword_index: int = 0):
        # 1. Actualización inmediata del ft.Text a "Escuchando..."
        status_text.value = "Escuchando..."
        status_text.color = ft.colors.GREEN_ACCENT_400
        status_icon.name = ft.icons.MIC_ROUNDED
        status_icon.color = ft.colors.GREEN_ACCENT_400
        page.update()

        # 2. Retorno automático a espera tras 3 segundos
        def auto_reset():
            time.sleep(3)
            status_text.value = "Esperando palabra clave..."
            status_text.color = ft.colors.BLUE_GREY_200
            status_icon.name = ft.icons.MIC_NONE_ROUNDED
            status_icon.color = ft.colors.BLUE_GREY_400
            page.update()

        threading.Thread(target=auto_reset, daemon=True).start()

    # Obtener Access Key de Picovoice desde variable de entorno o reemplazar manualmente
    access_key = os.environ.get("PICOVOICE_ACCESS_KEY", "TU_PICOVOICE_ACCESS_KEY")

    # Instanciación de la clase WakeWordEngine
    engine = WakeWordEngine(
        access_key=access_key,
        keywords=["jarvis"],  # Palabras clave por defecto: "jarvis", "picovoice", "porcupine"
        on_keyword_detected=on_keyword_detected,
    )

    # Inicio del hilo Daemon
    try:
        engine.start()
    except Exception as err:
        status_text.value = f"Configura PICOVOICE_ACCESS_KEY: {err}"
        status_text.size = 14
        status_text.color = ft.colors.AMBER_ACCENT_400

    # Gestión de ciclo de vida seguro al cerrar la aplicación
    def handle_window_event(e):
        if e.data == "close":
            engine.stop()
            page.window.destroy()

    page.window.prevent_close = True
    page.window.on_event = handle_window_event

    # Renderizado en pantalla
    page.add(
        ft.Column(
            controls=[status_icon, status_text],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=20,
        )
    )


if __name__ == "__main__":
    ft.app(target=main)
