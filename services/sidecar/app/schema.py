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


class TranscriptResponse(BaseModel):
    text: str
    duration_sec: float


class ErrorResponse(BaseModel):
    error: str
