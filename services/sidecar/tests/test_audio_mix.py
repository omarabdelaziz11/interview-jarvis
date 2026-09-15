import time

import numpy as np

from app.audio_capture import (
    SAMPLE_RATE,
    AudioSession,
    mix_streams,
    mix_to_mono,
    resample_audio,
)


def test_mix_to_mono_averages_channels():
    # shape (samples, 2)
    stereo = np.array([[1.0, -1.0], [0.5, 0.5]], dtype=np.float32)
    mono = mix_to_mono(stereo)
    assert mono.shape == (2,)
    assert abs(float(mono[0]) - 0.0) < 1e-6
    assert abs(float(mono[1]) - 0.5) < 1e-6


def test_mix_to_mono_passthrough():
    mono_in = np.array([0.1, 0.2], dtype=np.float32)
    out = mix_to_mono(mono_in)
    assert out.shape == (2,)
    assert abs(float(out[0]) - 0.1) < 1e-6


def test_mix_streams_uses_shortest_buffer_and_clips():
    mic = np.array([0.75, -0.75, 0.25], dtype=np.float32)
    loopback = np.array([0.75, -0.75], dtype=np.float32)

    mixed = mix_streams(mic, loopback)

    np.testing.assert_array_equal(
        mixed,
        np.array([1.0, -1.0], dtype=np.float32),
    )


def test_resample_audio_converts_device_rate_to_whisper_rate():
    audio = np.linspace(-1.0, 1.0, 480, dtype=np.float32)

    resampled = resample_audio(audio, source_rate=48000)

    assert resampled.dtype == np.float32
    assert len(resampled) == 160


def test_auto_stop_stashes_audio_until_stop_consumes_it():
    session = AudioSession()
    captured = np.array([[0.1], [0.2], [0.3]], dtype=np.float32)
    session._recording = True
    session._started_at = time.time() - 0.1
    session._mic_sample_rate = SAMPLE_RATE
    session._mic_chunks = [captured]

    session._auto_stop()
    audio, sample_rate, duration = session.stop()

    np.testing.assert_array_equal(audio, captured[:, 0])
    assert sample_rate == SAMPLE_RATE
    assert duration > 0


def test_default_mic_opens_when_loopback_is_selected(monkeypatch):
    session = AudioSession()
    opened_devices = []

    class FakeStream:
        def start(self):
            pass

        def stop(self):
            pass

        def close(self):
            pass

    def fake_open_stream(device_id, chunks):
        opened_devices.append(device_id)
        return FakeStream(), SAMPLE_RATE

    monkeypatch.setattr(session, "_open_stream", fake_open_stream)

    session.start(mic_device_id=None, loopback_device_id="pyaudio:7")
    session.stop()

    assert opened_devices == [None, "pyaudio:7"]
