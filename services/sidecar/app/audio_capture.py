from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np
import sounddevice as sd


SAMPLE_RATE = 16000


def mix_to_mono(audio: np.ndarray) -> np.ndarray:
    if audio.ndim == 1:
        return audio.astype(np.float32, copy=False)
    return audio.mean(axis=1).astype(np.float32)


def mix_streams(mic: np.ndarray, loopback: np.ndarray) -> np.ndarray:
    mic_mono = mix_to_mono(mic)
    loopback_mono = mix_to_mono(loopback)
    sample_count = min(len(mic_mono), len(loopback_mono))
    return np.clip(
        mic_mono[:sample_count] + loopback_mono[:sample_count],
        -1.0,
        1.0,
    ).astype(np.float32, copy=False)


class AudioSession:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._recording = False
        self._mic_chunks: list[np.ndarray] = []
        self._loopback_chunks: list[np.ndarray] = []
        self._streams: list[Any] = []
        self._started_at = 0.0
        self._timer: threading.Timer | None = None

    @property
    def recording(self) -> bool:
        return self._recording

    def start(
        self,
        mic_device_id: int | None,
        loopback_device_id: int | None,
        max_seconds: int = 180,
    ) -> None:
        with self._lock:
            if self._recording:
                raise RuntimeError("already listening")

            self._mic_chunks = []
            self._loopback_chunks = []
            self._started_at = time.time()
            self._recording = True

            try:
                if mic_device_id is not None or loopback_device_id is None:
                    self._streams.append(
                        self._open_stream(mic_device_id, self._mic_chunks)
                    )
                if loopback_device_id is not None:
                    self._streams.append(
                        self._open_stream(
                            loopback_device_id,
                            self._loopback_chunks,
                        )
                    )
                for stream in self._streams:
                    stream.start()
            except Exception:
                self._recording = False
                self._close_streams()
                raise

            self._timer = threading.Timer(max_seconds, self._auto_stop)
            self._timer.daemon = True
            self._timer.start()

    def _open_stream(
        self,
        device_id: int | None,
        chunks: list[np.ndarray],
    ) -> Any:
        def callback(indata, frames, time_info, status):  # noqa: ARG001
            if self._recording:
                chunks.append(indata.copy())

        return sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=1,
            dtype="float32",
            device=device_id,
            callback=callback,
        )

    def _auto_stop(self) -> None:
        try:
            if self._recording:
                self.stop()
        except Exception:
            pass

    def _close_streams(self) -> None:
        for stream in self._streams:
            try:
                stream.stop()
            finally:
                stream.close()
        self._streams = []

    def stop(self) -> tuple[np.ndarray, int, float]:
        with self._lock:
            if not self._recording and not (
                self._mic_chunks or self._loopback_chunks
            ):
                return np.zeros(0, dtype=np.float32), SAMPLE_RATE, 0.0

            self._recording = False
            if self._timer is not None:
                self._timer.cancel()
                self._timer = None
            self._close_streams()

            duration = (
                time.time() - self._started_at if self._started_at else 0.0
            )
            mic = self._concatenate(self._mic_chunks)
            loopback = self._concatenate(self._loopback_chunks)
            self._mic_chunks = []
            self._loopback_chunks = []

            if mic.size and loopback.size:
                audio = mix_streams(mic, loopback)
            elif mic.size:
                audio = mix_to_mono(mic)
            else:
                audio = mix_to_mono(loopback)
            return audio, SAMPLE_RATE, duration

    @staticmethod
    def _concatenate(chunks: list[np.ndarray]) -> np.ndarray:
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks, axis=0)


SESSION = AudioSession()
