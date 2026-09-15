from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse

from app.audio_capture import SESSION
from app.devices import list_devices
from app.schema import (
    DevicesResponse,
    HealthResponse,
    StartListenRequest,
    TranscriptResponse,
)
from app.transcribe import transcribe, whisper_ready

app = FastAPI(title="Jarvis Sidecar")


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, whisper_ready=whisper_ready())


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
def listen_stop() -> TranscriptResponse | JSONResponse:
    audio, sample_rate, duration = SESSION.stop()
    for attempt in range(2):
        try:
            text = transcribe(audio, sample_rate)
            return TranscriptResponse(text=text, duration_sec=duration)
        except Exception as error:
            if attempt == 1:
                return JSONResponse(
                    status_code=500,
                    content={"error": str(error)},
                )

    raise RuntimeError("unreachable")


def run() -> None:
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
