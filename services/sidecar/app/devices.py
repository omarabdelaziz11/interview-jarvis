import sounddevice as sd

from app.schema import DeviceInfo, DevicesResponse


def list_devices() -> DevicesResponse:
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

    return DevicesResponse(devices=devices)
