import numpy as np

from app.audio_capture import chunk_rms


def test_chunk_rms_zero_for_silence():
    assert chunk_rms(np.zeros(1000, dtype=np.float32)) == 0.0


def test_chunk_rms_positive_for_signal():
    audio = np.ones(1000, dtype=np.float32) * 0.5
    assert chunk_rms(audio) > 0.4
