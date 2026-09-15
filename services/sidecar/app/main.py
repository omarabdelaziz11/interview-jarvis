from contextlib import asynccontextmanager
import os
import secrets
import threading

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse

from app.audio_capture import AudioDeviceError, SESSION
from app.devices import list_devices
from app.schema import (
    DevicesResponse,
    HealthResponse,
    ListenStatusResponse,
    StartListenRequest,
    TranscriptResponse,
)
from app.transcribe import transcribe, warm_model, whisper_ready

EXPECTED_TOKEN = (os.environ.get("JARVIS_SIDECAR_TOKEN") or "").strip()


def require_sidecar_token(
    authorization: str | None = Header(default=None),
    x_jarvis_token: str | None = Header(default=None, alias="X-Jarvis-Token"),
) -> None:
    """Require the shared secret when JARVIS_SIDECAR_TOKEN is set."""
    if not EXPECTED_TOKEN:
        return
    bearer = ""
    if isinstance(authorization, str) and authorization.lower().startswith("bearer "):
        bearer = authorization[7:].strip()
    provided = bearer or (x_jarvis_token or "").strip()
    if not provided or not secrets.compare_digest(provided, EXPECTED_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    threading.Thread(target=warm_model, daemon=True, name="whisper-warmup").start()
    yield


app = FastAPI(title="Jarvis Sidecar", lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health(_auth: None = Depends(require_sidecar_token)) -> HealthResponse:
    return HealthResponse(ok=True, whisper_ready=whisper_ready())


@app.get("/devices", response_model=DevicesResponse)
def devices(_auth: None = Depends(require_sidecar_token)) -> DevicesResponse:
    return list_devices()


@app.get("/listen/status", response_model=ListenStatusResponse)
def listen_status(_auth: None = Depends(require_sidecar_token)) -> ListenStatusResponse:
    return ListenStatusResponse(**SESSION.status())


@app.post("/listen/start")
def listen_start(
    body: StartListenRequest,
    _auth: None = Depends(require_sidecar_token),
) -> dict[str, str]:
    try:
        SESSION.start(
            mic_device_id=body.mic_device_id,
            loopback_device_id=body.loopback_device_id,
            max_seconds=body.max_seconds,
            endpointing=body.endpointing,
            silence_ms=body.silence_ms,
            speech_rms=body.speech_rms,
            min_speech_ms=body.min_speech_ms,
        )
    except AudioDeviceError as error:
        raise HTTPException(
            status_code=400,
            detail="Could not open selected audio device",
        ) from error
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    return {"status": "listening"}


@app.post("/listen/stop", response_model=TranscriptResponse)
def listen_stop(_auth: None = Depends(require_sidecar_token)) -> TranscriptResponse | JSONResponse:
    try:
        audio, sample_rate, duration = SESSION.stop()
    except Exception:
        return JSONResponse(
            status_code=500,
            content={"error": "Transcription failed"},
        )
    for attempt in range(2):
        try:
            text = transcribe(audio, sample_rate)
            return TranscriptResponse(text=text, duration_sec=duration)
        except Exception:
            if attempt == 1:
                return JSONResponse(
                    status_code=500,
                    content={"error": "Transcription failed"},
                )

    raise RuntimeError("unreachable")


def run() -> None:
    import uvicorn

    uvicorn.run("app.main:app", host="127.0.0.1", port=8765, reload=False)


if __name__ == "__main__":
    run()
