const PRIMARY_MODEL = 'gpt-4o-mini-tts';
const FALLBACK_MODEL = 'tts-1';

function normalizeText(text) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new TypeError('Speech text must be a non-empty string');
  }
  return text.trim();
}

async function requestSpeech(client, model, input, voice, signal) {
  const response = await client.audio.speech.create(
    {
      model,
      voice,
      input,
      response_format: 'mp3',
    },
    signal ? { signal } : undefined,
  );
  return Buffer.from(await response.arrayBuffer()).toString('base64');
}

async function synthesize(client, text, voice = 'alloy', options = {}) {
  if (!client?.audio?.speech?.create) {
    throw new TypeError('A valid OpenAI client is required');
  }

  const input = normalizeText(text);
  try {
    return await requestSpeech(client, PRIMARY_MODEL, input, voice, options.signal);
  } catch (error) {
    if (options.signal?.aborted || error?.name === 'AbortError') throw error;
    return requestSpeech(client, FALLBACK_MODEL, input, voice, options.signal);
  }
}

module.exports = {
  FALLBACK_MODEL,
  PRIMARY_MODEL,
  synthesize,
};
