from app.schema import HealthResponse, TranscriptResponse


def test_health_response_defaults():
    h = HealthResponse(ok=True, whisper_ready=False)
    assert h.ok is True
    assert h.whisper_ready is False


def test_transcript_response_fields():
    t = TranscriptResponse(text="hello", duration_sec=1.5)
    assert t.text == "hello"
    assert t.duration_sec == 1.5
