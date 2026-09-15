const OpenAI = require('openai');

function createClient(apiKey) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new TypeError('OpenAI API key is required');
  }
  return new OpenAI({ apiKey: apiKey.trim() });
}

async function chat(client, { model, system, messages }) {
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'system', content: system }, ...messages],
    temperature: 0.5,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

module.exports = { createClient, chat };
