const OVERLAY_ERRORS = Object.freeze({
  noDevices: 'Pick mic/loopback in Settings',
  transcription: 'Transcription failed — try again',
  invalidKey: 'Invalid key — open Settings',
  rateLimited: 'Rate limited — wait and retry',
  sidecarDown: 'Audio engine reconnecting…',
  silence: 'Nothing heard',
  openAi: 'Could not get an answer. Check Settings and try again.',
});

function openAiErrorMessage(error) {
  const status = Number(error?.status ?? error?.response?.status);
  if (status === 401) return OVERLAY_ERRORS.invalidKey;
  if (status === 429) return OVERLAY_ERRORS.rateLimited;
  return OVERLAY_ERRORS.openAi;
}

function sidecarErrorMessage(error, operation) {
  const detail = String(error?.detail ?? error?.message ?? '');
  if (
    operation === 'start' &&
    /device|input|wasapi|portaudio/i.test(detail)
  ) {
    return OVERLAY_ERRORS.noDevices;
  }
  if (
    operation === 'stop' &&
    (Number(error?.status) >= 500 || /timed out/i.test(detail))
  ) {
    return OVERLAY_ERRORS.transcription;
  }
  return OVERLAY_ERRORS.sidecarDown;
}

module.exports = { OVERLAY_ERRORS, openAiErrorMessage, sidecarErrorMessage };
