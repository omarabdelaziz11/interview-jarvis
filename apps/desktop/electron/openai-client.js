const OpenAI = require('openai');

function createClient(apiKey) {
  return new OpenAI({ apiKey });
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
