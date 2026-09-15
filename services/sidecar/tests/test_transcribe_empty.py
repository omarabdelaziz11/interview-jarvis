import numpy as np

from app.transcribe import is_silence


def test_is_silence_true_for_zeros():
    assert is_silence(np.zeros(16000, dtype=np.float32)) is True


def test_is_silence_false_for_loud():
    audio = np.ones(16000, dtype=np.float32) * 0.2
    assert is_silence(audio) is False
