import sys
from types import SimpleNamespace

from app import devices


class FakePyAudio:
    terminated = False

    def get_loopback_device_info_generator(self):
        yield {
            "index": 7,
            "name": "Speakers (Realtek) [Loopback]",
            "maxInputChannels": 2,
        }

    def terminate(self):
        self.terminated = True


def test_list_devices_exposes_pyaudio_wasapi_loopback(monkeypatch):
    client = FakePyAudio()
    monkeypatch.setitem(
        sys.modules,
        "pyaudiowpatch",
        SimpleNamespace(PyAudio=lambda: client),
    )
    monkeypatch.setattr(
        devices.sd,
        "query_hostapis",
        lambda: [{"name": "Windows WASAPI"}],
    )
    monkeypatch.setattr(
        devices.sd,
        "query_devices",
        lambda: [
            {
                "name": "Microphone",
                "max_input_channels": 1,
                "hostapi": 0,
            },
            {
                "name": "Speakers",
                "max_input_channels": 0,
                "hostapi": 0,
            },
        ],
    )

    response = devices.list_devices()

    assert [(device.id, device.kind) for device in response.devices] == [
        (0, "mic"),
        ("pyaudio:7", "loopback"),
    ]
    assert client.terminated
