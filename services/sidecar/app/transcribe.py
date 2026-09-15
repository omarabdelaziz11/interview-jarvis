from __future__ import annotations

import os
import threading

import numpy as np

_model = None
_lock = threading.Lock()


def is_silence(audio: np.ndarray, rms_threshold: float = 0.01) -> bool:
    if audio.size == 0:
        return True
    rms = float(np.sqrt(np.mean(np.square(audio), dtype=np.float64)))
    return rms < rms_threshold


def get_model():
    global _model
    with _lock:
        if _model is None:
            from faster_whisper import WhisperModel

            model_size = os.environ.get("WHISPER_MODEL", "small")
            device = os.environ.get("WHISPER_DEVICE", "cpu")
            compute = os.environ.get("WHISPER_COMPUTE", "int8")
            _model = WhisperModel(model_size, device=device, compute_type=compute)
        return _model


def whisper_ready() -> bool:
    return _model is not None


def warm_model() -> None:
    try:
        get_model()
    except Exception:
        # Transcription will retry loading and return a client-safe error.
        pass


def transcribe(audio: np.ndarray, sample_rate: int) -> str:
    if is_silence(audio):
        return ""
    model = get_model()
    language = os.environ.get("WHISPER_LANGUAGE", "en")
    segments, _info = model.transcribe(
        audio,
        language=language or "en",
        vad_filter=True,
    )
    parts = [seg.text.strip() for seg in segments if seg.text.strip()]
    return " ".join(parts).strip()
