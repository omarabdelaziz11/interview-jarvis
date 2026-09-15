const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { FALLBACK_MODEL, PRIMARY_MODEL, synthesize } = require('./tts');

function audioResponse(bytes) {
  return {
    async arrayBuffer() {
      return Uint8Array.from(bytes).buffer;
    },
  };
}

describe('synthesize', () => {
  it('uses the primary OpenAI speech model and returns base64 audio', async () => {
    const calls = [];
    const client = {
      audio: {
        speech: {
          async create(request, options) {
            calls.push({ request, options });
            return audioResponse([1, 2, 3]);
          },
        },
      },
    };
    const signal = new AbortController().signal;

    const result = await synthesize(client, ' Hello ', 'nova', { signal });

    assert.equal(result, 'AQID');
    assert.deepEqual(calls, [
      {
        request: {
          model: PRIMARY_MODEL,
          voice: 'nova',
          input: 'Hello',
          response_format: 'mp3',
        },
        options: { signal },
      },
    ]);
  });

  it('falls back to tts-1 when the primary model fails', async () => {
    const models = [];
    const client = {
      audio: {
        speech: {
          async create({ model }) {
            models.push(model);
            if (model === PRIMARY_MODEL) throw new Error('model unavailable');
            return audioResponse([4, 5]);
          },
        },
      },
    };

    assert.equal(await synthesize(client, 'Fallback please'), 'BAU=');
    assert.deepEqual(models, [PRIMARY_MODEL, FALLBACK_MODEL]);
  });

  it('does not retry an aborted request', async () => {
    let calls = 0;
    const controller = new AbortController();
    const client = {
      audio: {
        speech: {
          async create() {
            calls += 1;
            controller.abort();
            const error = new Error('aborted');
            error.name = 'AbortError';
            throw error;
          },
        },
      },
    };

    await assert.rejects(
      synthesize(client, 'Stop', 'alloy', { signal: controller.signal }),
      { name: 'AbortError' },
    );
    assert.equal(calls, 1);
  });
});
