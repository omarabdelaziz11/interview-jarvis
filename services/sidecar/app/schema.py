from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    ok: bool = True
    whisper_ready: bool = False


class DeviceInfo(BaseModel):
    id: int | str
    name: str
    kind: str  # "mic" | "loopback"


class DevicesResponse(BaseModel):
    devices: list[DeviceInfo]


class StartListenRequest(BaseModel):
    mic_device_id: int | str | None = None
    loopback_device_id: int | str | None = None
    max_seconds: int = Field(default=180, ge=1, le=180)
    endpointing: bool = False
    silence_ms: int = Field(default=900, ge=300, le=5000)
    speech_rms: float = Field(default=0.02, ge=0.001, le=0.5)
    min_speech_ms: int = Field(default=250, ge=100, le=5000)


class ListenStatusResponse(BaseModel):
    recording: bool
    speech_detected: bool
    utterance_complete: bool


class TranscriptResponse(BaseModel):
    text: str
    duration_sec: float


class ErrorResponse(BaseModel):
    error: str
