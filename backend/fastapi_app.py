"""camOS FastAPI Application entrypoint."""

from __future__ import annotations

import os

from backend.app.app_factory import create_app

app = create_app()


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
