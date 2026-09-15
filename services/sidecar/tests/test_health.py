from fastapi.testclient import TestClient
import app.transcribe as transcribe_module
from app.main import app

client = TestClient(app)


def test_health_ok():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "whisper_ready" in body


def test_health_does_not_load_whisper_model(monkeypatch):
    transcribe_module._model = None

    def unexpected_load():
        raise AssertionError("health must not load Whisper")

    monkeypatch.setattr(transcribe_module, "get_model", unexpected_load)

    r = client.get("/health")

    assert r.status_code == 200
    assert r.json()["whisper_ready"] is False
