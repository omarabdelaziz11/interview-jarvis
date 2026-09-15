from __future__ import annotations

import threading
import time
from typing import Any

import numpy as np
import sounddevice as sd

SAMPLE_RATE = 16000
DEFAULT_DEVICE_SAMPLE_RATE = 48000
PYAUDIO_DEVICE_PREFIX = "pyaudio:"


class AudioDeviceError(RuntimeError):
    pass


def resample_audio(
    audio: np.ndarray,
    source_rate: int,
    target_rate: int = SAMPLE_RATE,
) -> np.ndarray:
    mono = mix_to_mono(audio)
    if not mono.size or source_rate == target_rate:
        return mono
    output_size = max(1, round(len(mono) * target_rate / source_rate))
    source_positions = np.arange(len(mono), dtype=np.float64)
    target_positions = np.linspace(
        0,
        len(mono) - 1,
        output_size,
        dtype=np.float64,
    )
    return np.interp(target_positions, source_positions, mono).astype(np.float32)


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
        self._audio_clients: list[Any] = []
        self._mic_sample_rate = SAMPLE_RATE
        self._loopback_sample_rate = SAMPLE_RATE
        self._started_at = 0.0
        self._timer: threading.Timer | None = None
        self._last_result: tuple[np.ndarray, int, float] | None = None

    @property
    def recording(self) -> bool:
        return self._recording

    def start(
        self,
        mic_device_id: int | str | None,
        loopback_device_id: int | str | None,
        max_seconds: int = 180,
    ) -> None:
        with self._lock:
            if self._recording:
                raise RuntimeError("already listening")

            self._mic_chunks = []
            self._loopback_chunks = []
            self._last_result = None
            self._streams = []
            self._audio_clients = []
            self._started_at = time.time()
            self._recording = True

            try:
                if mic_device_id != "off":
                    stream, self._mic_sample_rate = self._open_stream(
                        mic_device_id,
                        self._mic_chunks,
                    )
                    self._streams.append(stream)
                if loopback_device_id is not None:
                    stream, self._loopback_sample_rate = self._open_stream(
                        loopback_device_id,
                        self._loopback_chunks,
                    )
                    self._streams.append(stream)
                for stream in self._streams:
                    if hasattr(stream, "start_stream"):
                        stream.start_stream()
                    else:
                        stream.start()
            except Exception as error:
                self._recording = False
                self._close_streams()
                raise AudioDeviceError("Could not open selected audio device") from error

            self._timer = threading.Timer(max_seconds, self._auto_stop)
            self._timer.daemon = True
            self._timer.start()

    def _open_stream(
        self,
        device_id: int | str | None,
        chunks: list[np.ndarray],
    ) -> tuple[Any, int]:
        if isinstance(device_id, str) and device_id.startswith(
            PYAUDIO_DEVICE_PREFIX
        ):
            return self._open_pyaudio_loopback(device_id, chunks)

        device = sd.query_devices(device_id, "input")
        sample_rate = _device_sample_rate(device)
        channels = max(1, int(device["max_input_channels"]))

        def callback(indata, frames, time_info, status):  # noqa: ARG001
            if self._recording:
                chunks.append(indata.copy())

        return sd.InputStream(
            samplerate=sample_rate,
            channels=channels,
            dtype="float32",
            device=device_id,
            callback=callback,
        ), sample_rate

    def _open_pyaudio_loopback(
        self,
        device_id: str,
        chunks: list[np.ndarray],
    ) -> tuple[Any, int]:
        try:
            import pyaudiowpatch as pyaudio
        except ImportError as error:
            raise RuntimeError(
                "PyAudioWPatch is required for WASAPI loopback capture"
            ) from error

        index = int(device_id.removeprefix(PYAUDIO_DEVICE_PREFIX))
        client = pyaudio.PyAudio()
        try:
            device = client.get_device_info_by_index(index)
            sample_rate = _device_sample_rate(device)
            channels = max(
                1,
                int(
                    device.get("maxInputChannels")
                    or device.get("maxOutputChannels")
                    or 1
                ),
            )

            def callback(in_data, frame_count, time_info, status):  # noqa: ARG001
                if self._recording and in_data:
                    samples = np.frombuffer(in_data, dtype=np.float32)
                    chunks.append(samples.reshape(-1, channels).copy())
                return None, pyaudio.paContinue

            # PyAudioWPatch exposes WASAPI render endpoints as real input
            # devices, unlike sounddevice builds without loopback settings.
            stream = client.open(
                format=pyaudio.paFloat32,
                channels=channels,
                rate=sample_rate,
                input=True,
                input_device_index=index,
                stream_callback=callback,
                start=False,
            )
        except Exception:
            client.terminate()
            raise
        self._audio_clients.append(client)
        return stream, sample_rate

    def _auto_stop(self) -> None:
        try:
            with self._lock:
                if self._recording:
                    self._last_result = self._finish_capture()
        except Exception:
            pass

    def _close_streams(self) -> None:
        for stream in self._streams:
            try:
                if hasattr(stream, "stop_stream"):
                    stream.stop_stream()
                else:
                    stream.stop()
            finally:
                stream.close()
        self._streams = []
        for client in self._audio_clients:
            client.terminate()
        self._audio_clients = []

    def stop(self) -> tuple[np.ndarray, int, float]:
        with self._lock:
            if self._last_result is not None:
                result = self._last_result
                self._last_result = None
                return result
            if not self._recording and not (
                self._mic_chunks or self._loopback_chunks
            ):
                return np.zeros(0, dtype=np.float32), SAMPLE_RATE, 0.0
            return self._finish_capture()

    def _finish_capture(self) -> tuple[np.ndarray, int, float]:
        self._recording = False
        if self._timer is not None:
            self._timer.cancel()
            self._timer = None
        self._close_streams()

        duration = time.time() - self._started_at if self._started_at else 0.0
        mic = resample_audio(
            self._concatenate(self._mic_chunks),
            self._mic_sample_rate,
        )
        loopback = resample_audio(
            self._concatenate(self._loopback_chunks),
            self._loopback_sample_rate,
        )
        self._mic_chunks = []
        self._loopback_chunks = []

        if mic.size and loopback.size:
            audio = mix_streams(mic, loopback)
        elif mic.size:
            audio = mic
        else:
            audio = loopback
        return audio, SAMPLE_RATE, duration

    @staticmethod
    def _concatenate(chunks: list[np.ndarray]) -> np.ndarray:
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks, axis=0)


def _device_sample_rate(device: Any) -> int:
    value = device.get("default_samplerate", device.get("defaultSampleRate"))
    try:
        sample_rate = int(float(value))
    except (TypeError, ValueError):
        return DEFAULT_DEVICE_SAMPLE_RATE
    return sample_rate if sample_rate > 0 else DEFAULT_DEVICE_SAMPLE_RATE


SESSION = AudioSession()
