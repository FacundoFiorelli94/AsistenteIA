"""
Script principal con Flet: Integración de WakeWordEngine.
Al recibir la señal del callback, actualiza un ft.Text en pantalla para indicar 'Escuchando...'.
Compatible tanto con ejecución de escritorio nativa como en navegador Web (localhost).
"""

import os
import sys
import threading
import time
import flet as ft
from wake_word_engine import WakeWordEngine

# Compatibilidad de enumeraciones y controles entre versiones de Flet (0.x y 1.0+)
Colors = getattr(ft, "Colors", getattr(ft, "colors", None))
Icons = getattr(ft, "Icons", getattr(ft, "icons", None))


def set_icon_visual(icon_ctrl: ft.Icon, new_icon, new_color=None):
    """Actualiza de forma compatible el icono y su color."""
    if hasattr(icon_ctrl, "icon"):
        icon_ctrl.icon = new_icon
    elif hasattr(icon_ctrl, "name"):
        icon_ctrl.name = new_icon

    if new_color is not None:
        icon_ctrl.color = new_color


def main(page: ft.Page):
    # Configuración de la página
    page.title = "Asistente IA - Detección Wake Word"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
    page.bgcolor = "#0F172A"

    # Propiedades de ventana (seguras para escritorio y navegador web)
    if hasattr(page, "window") and page.window:
        try:
            page.window.width = 520
            page.window.height = 420
        except Exception:
            pass

    # Elemento ft.Text que refleja el estado del asistente
    status_text = ft.Text(
        value="Esperando palabra clave...",
        size=24,
        weight=ft.FontWeight.W_600,
        color=Colors.BLUE_GREY_200,
        text_align=ft.TextAlign.CENTER,
    )

    # Icono de estado (usando el argumento posicional compatible)
    status_icon = ft.Icon(
        Icons.MIC_NONE_ROUNDED,
        size=64,
        color=Colors.BLUE_GREY_400,
    )

    # Callback desacoplado que WakeWordEngine ejecuta en segundo plano
    def on_keyword_detected(keyword_index: int = 0):
        # 1. Actualización inmediata del ft.Text a "Escuchando..."
        status_text.value = "Escuchando..."
        status_text.color = Colors.GREEN_ACCENT_400
        set_icon_visual(status_icon, Icons.MIC_ROUNDED, Colors.GREEN_ACCENT_400)
        page.update()

        # 2. Retorno automático a espera tras 3 segundos
        def auto_reset():
            time.sleep(3)
            status_text.value = "Esperando palabra clave..."
            status_text.color = Colors.BLUE_GREY_200
            set_icon_visual(status_icon, Icons.MIC_NONE_ROUNDED, Colors.BLUE_GREY_400)
            page.update()

        threading.Thread(target=auto_reset, daemon=True).start()

    # Obtener Access Key de Picovoice desde variable de entorno
    access_key = os.environ.get("PICOVOICE_ACCESS_KEY", "")
    engine = None

    if access_key and access_key.strip() and access_key != "TU_PICOVOICE_ACCESS_KEY":
        try:
            engine = WakeWordEngine(
                access_key=access_key,
                keywords=["jarvis"],
                on_keyword_detected=on_keyword_detected,
            )
            engine.start()
        except Exception as err:
            status_text.value = f"Aviso Micrófono/Key: {err}"
            status_text.size = 14
            status_text.color = Colors.AMBER_ACCENT_400
    else:
        # Modo demostración si aún no configuró la clave de Picovoice
        status_text.value = "Esperando palabra clave (Ingresa PICOVOICE_ACCESS_KEY)"
        status_text.size = 16
        status_text.color = Colors.BLUE_GREY_300

    # Gestión de ciclo de vida seguro al cerrar la aplicación
    def handle_window_event(e):
        if getattr(e, "data", None) == "close" and engine is not None:
            engine.stop()
            try:
                page.window.destroy()
            except Exception:
                pass

    if hasattr(page, "window") and page.window:
        try:
            page.window.prevent_close = True
            page.window.on_event = handle_window_event
        except Exception:
            pass

    # Botón auxiliar compatible para probar el callback visualmente
    ButtonClass = getattr(ft, "FilledButton", getattr(ft, "ElevatedButton", None))
    test_btn = ButtonClass(
        "Probar Detección (Simular Wake Word)",
        icon=Icons.PLAY_ARROW_ROUNDED,
        on_click=lambda _: on_keyword_detected(0),
    )

    # Renderizado en pantalla
    page.add(
        ft.Column(
            controls=[
                status_icon,
                status_text,
                ft.Container(height=10),
                test_btn,
            ],
            horizontal_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.CENTER,
            spacing=16,
        )
    )


def start():
    is_web = "--web" in sys.argv or os.environ.get("FLET_WEB", "0") == "1"
    port = int(os.environ.get("FLET_PORT", "8550"))

    # Compatibilidad para ejecutar con ft.run (Flet 1.0+) o ft.app (Flet 0.x)
    app_runner = getattr(ft, "run", getattr(ft, "app", None))
    app_view = getattr(ft, "AppView", None)

    if is_web:
        print(f"Iniciando interfaz Flet en http://localhost:{port} ...")
        if app_view:
            app_runner(main, view=app_view.WEB_BROWSER, port=port)
        else:
            app_runner(main, port=port)
    else:
        app_runner(main)


if __name__ == "__main__":
    start()
