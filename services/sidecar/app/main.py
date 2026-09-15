from fastapi import FastAPI, HTTPException

from app.audio_capture import SESSION
from app.devices import list_devices
from app.schema import (
    DevicesResponse,
    HealthResponse,
    StartListenRequest,
    TranscriptResponse,
)

app = FastAPI(title="Jarvis Sidecar")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, whisper_ready=False)


@app.get("/devices", response_model=DevicesResponse)
def devices() -> DevicesResponse:
    return list_devices()


@app.post("/listen/start")
def listen_start(body: StartListenRequest) -> dict[str, str]:
    try:
        SESSION.start(
            mic_device_id=body.mic_device_id,
            loopback_device_id=body.loopback_device_id,
            max_seconds=body.max_seconds,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"status": "listening"}


@app.post("/listen/stop", response_model=TranscriptResponse)
def listen_stop() -> TranscriptResponse:
    _audio, _sample_rate, duration = SESSION.stop()
    return TranscriptResponse(text="", duration_sec=duration)


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
