"""Run an isolated zero-site fixture: python -m backend.dev.run_fixture_portal."""
import uvicorn
from backend.tests.support.portal_factory import create_fixture_app

if __name__ == "__main__":
    uvicorn.run(create_fixture_app(), host="127.0.0.1", port=8000)
