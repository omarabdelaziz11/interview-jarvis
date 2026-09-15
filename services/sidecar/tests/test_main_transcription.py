import numpy as np
from fastapi.testclient import TestClient

import app.main as main

client = TestClient(main.app)


def test_listen_stop_returns_transcript(monkeypatch):
    audio = np.ones(16000, dtype=np.float32) * 0.2
    monkeypatch.setattr(main.SESSION, "stop", lambda: (audio, 16000, 1.0))
    monkeypatch.setattr(main, "transcribe", lambda data, rate: "hello")

    response = client.post("/listen/stop")

    assert response.status_code == 200
    assert response.json() == {"text": "hello", "duration_sec": 1.0}


def test_listen_stop_retries_transcription_once(monkeypatch):
    audio = np.ones(16000, dtype=np.float32) * 0.2
    attempts = 0

    def flaky_transcribe(data, rate):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise RuntimeError("temporary failure")
        return "recovered"

    monkeypatch.setattr(main.SESSION, "stop", lambda: (audio, 16000, 1.0))
    monkeypatch.setattr(main, "transcribe", flaky_transcribe)

    response = client.post("/listen/stop")

    assert response.status_code == 200
    assert response.json()["text"] == "recovered"
    assert attempts == 2


def test_listen_stop_returns_error_after_retry(monkeypatch):
    audio = np.ones(16000, dtype=np.float32) * 0.2
    attempts = 0

    def failing_transcribe(data, rate):
        nonlocal attempts
        attempts += 1
        raise RuntimeError("model unavailable")

    monkeypatch.setattr(main.SESSION, "stop", lambda: (audio, 16000, 1.0))
    monkeypatch.setattr(main, "transcribe", failing_transcribe)

    response = client.post("/listen/stop")

    assert response.status_code == 500
    assert response.json() == {"error": "model unavailable"}
    assert attempts == 2


def test_health_reports_whisper_readiness(monkeypatch):
    monkeypatch.setattr(main, "whisper_ready", lambda: True)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["whisper_ready"] is True
