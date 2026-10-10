"""camOS production ASGI entrypoint."""

from backend.app.app_factory import create_app

app = create_app()
