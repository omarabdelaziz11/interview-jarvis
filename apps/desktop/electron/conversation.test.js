const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const conversation = require('./conversation');
const { systemFor } = require('./prompts');
const { chat } = require('./openai-client');

describe('conversation', () => {
  beforeEach(() => {
    conversation.clear();
    conversation.setMode('jarvis');
  });

  it('stores defensive message snapshots', () => {
    conversation.appendUser('  Hello  ');
    conversation.appendAssistant('Hi');

    const messages = conversation.getMessages();
    messages[0].content = 'changed';

    assert.deepEqual(conversation.getMessages(), [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ]);
  });

  it('caps history to the last 20 messages', () => {
    for (let index = 0; index < 22; index += 1) {
      conversation.appendUser(`message-${index}`);
    }

    const messages = conversation.getMessages();
    assert.equal(messages.length, 20);
    assert.equal(messages[0].content, 'message-2');
    assert.equal(messages.at(-1).content, 'message-21');
  });

  it('validates messages and modes', () => {
    assert.throws(() => conversation.appendUser('   '), /non-empty/);
    assert.throws(() => conversation.setMode('invalid'), /mode/i);

    conversation.setMode('interview');
    assert.equal(conversation.getMode(), 'interview');
  });

  it('clears messages without resetting the mode', () => {
    conversation.setMode('interview');
    conversation.appendUser('question');
    conversation.clear();

    assert.deepEqual(conversation.getMessages(), []);
    assert.equal(conversation.getMode(), 'interview');
  });
});

describe('systemFor', () => {
  it('returns mode-specific instructions', () => {
    assert.match(systemFor('jarvis'), /desktop assistant/i);
    assert.match(systemFor('interview'), /ONLY the words the candidate should speak/i);
    assert.match(systemFor('interview'), /Do not narrate/i);
    assert.notEqual(systemFor('jarvis'), systemFor('interview'));
  });
});

describe('openai chat', () => {
  it('sends system and conversation messages and trims the answer', async () => {
    let request;
    const client = {
      chat: {
        completions: {
          create: async (value) => {
            request = value;
            return { choices: [{ message: { content: '  Answer  ' } }] };
          },
        },
      },
    };

    const result = await chat(client, {
      model: 'gpt-test',
      system: 'System prompt',
      messages: [{ role: 'user', content: 'Question' }],
    });

    assert.equal(result, 'Answer');
    assert.deepEqual(request, {
      model: 'gpt-test',
      messages: [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Question' },
      ],
      temperature: 0.5,
    });
  });

  it('returns an empty string when the response has no text', async () => {
    const client = {
      chat: {
        completions: {
          create: async () => ({ choices: [] }),
        },
      },
    };

    assert.equal(
      await chat(client, { model: 'gpt-test', system: 'Prompt', messages: [] }),
      '',
    );
  });
});
