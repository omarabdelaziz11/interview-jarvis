const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  OVERLAY_ERRORS,
  openAiErrorMessage,
  sidecarErrorMessage,
} = require('./errors');

describe('overlay error mapping', () => {
  it('maps OpenAI authentication and rate-limit errors', () => {
    assert.equal(openAiErrorMessage({ status: 401 }), OVERLAY_ERRORS.invalidKey);
    assert.equal(openAiErrorMessage({ response: { status: 429 } }), OVERLAY_ERRORS.rateLimited);
    assert.equal(openAiErrorMessage(new Error('network')), OVERLAY_ERRORS.openAi);
  });

  it('maps device, transcription, and unavailable sidecar errors', () => {
    assert.equal(
      sidecarErrorMessage({ status: 500, detail: 'Error querying input device' }, 'start'),
      OVERLAY_ERRORS.noDevices,
    );
    assert.equal(
      sidecarErrorMessage({ status: 500, detail: 'Whisper failed' }, 'stop'),
      OVERLAY_ERRORS.transcription,
    );
    assert.equal(
      sidecarErrorMessage(new Error('Sidecar request timed out after 120000ms'), 'stop'),
      OVERLAY_ERRORS.transcription,
    );
    assert.equal(
      sidecarErrorMessage(new TypeError('fetch failed'), 'start'),
      OVERLAY_ERRORS.sidecarDown,
    );
  });
});
