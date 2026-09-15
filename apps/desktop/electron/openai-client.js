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

async function chatWithImage(client, { model, system, prompt, dataUrl }) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    throw new TypeError('dataUrl must be an image data URL');
  }

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    temperature: 0.4,
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

module.exports = { createClient, chat, chatWithImage };
