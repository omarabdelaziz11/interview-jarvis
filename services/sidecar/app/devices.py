import sounddevice as sd

from app.audio_capture import PYAUDIO_DEVICE_PREFIX
from app.schema import DeviceInfo, DevicesResponse


def list_devices() -> DevicesResponse:
    devices = _list_sounddevice_inputs()
    devices.extend(_list_wasapi_loopbacks())
    return DevicesResponse(devices=devices)


def _list_sounddevice_inputs() -> list[DeviceInfo]:
    devices: list[DeviceInfo] = []
    hostapis = sd.query_hostapis()
    wasapi_index = next(
        (i for i, host in enumerate(hostapis) if "WASAPI" in host["name"]),
        None,
    )

    for idx, device in enumerate(sd.query_devices()):
        name = str(device["name"])
        max_input_channels = int(device["max_input_channels"])
        if max_input_channels <= 0:
            continue

        normalized_name = name.lower()
        is_wasapi = (
            wasapi_index is not None and device["hostapi"] == wasapi_index
        )
        is_loopback = (
            is_wasapi
            and (
                "loopback" in normalized_name
                or "[loopback]" in normalized_name
            )
        ) or any(
            marker in normalized_name
            for marker in ("stereo mix", "what u hear", "wave out")
        )
        devices.append(
            DeviceInfo(
                id=idx,
                name=name,
                kind="loopback" if is_loopback else "mic",
            )
        )

    return devices


def _list_wasapi_loopbacks() -> list[DeviceInfo]:
    try:
        import pyaudiowpatch as pyaudio
    except ImportError:
        return []

    client = pyaudio.PyAudio()
    try:
        # PyAudioWPatch creates input-capable duplicates of WASAPI render
        # endpoints, so these IDs can capture default speakers directly.
        return [
            DeviceInfo(
                id=f"{PYAUDIO_DEVICE_PREFIX}{int(device['index'])}",
                name=str(device["name"]),
                kind="loopback",
            )
            for device in client.get_loopback_device_info_generator()
            if int(device.get("maxInputChannels", 0)) > 0
        ]
    finally:
        client.terminate()
