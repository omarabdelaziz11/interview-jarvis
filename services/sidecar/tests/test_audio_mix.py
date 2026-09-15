import numpy as np

from app.audio_capture import mix_streams, mix_to_mono


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
