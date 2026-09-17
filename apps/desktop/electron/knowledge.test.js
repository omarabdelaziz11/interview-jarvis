const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { truncateText, KNOWLEDGE_MAX_CHARS } = require('./knowledge');
const { withKnowledge } = require('./prompts');

describe('knowledge truncateText', () => {
  it('returns empty for blank input', () => {
    assert.deepEqual(truncateText('   '), { text: '', truncated: false });
  });

  it('keeps short text intact', () => {
    assert.deepEqual(truncateText('hello architecture'), {
      text: 'hello architecture',
      truncated: false,
    });
  });

  it('truncates long text to the cap', () => {
    const input = 'a'.repeat(KNOWLEDGE_MAX_CHARS + 50);
    const result = truncateText(input);
    assert.equal(result.text.length, KNOWLEDGE_MAX_CHARS);
    assert.equal(result.truncated, true);
  });
});

describe('withKnowledge', () => {
  it('returns base system when knowledge is empty', () => {
    assert.equal(withKnowledge('Base system.', ''), 'Base system.');
    assert.equal(withKnowledge('Base system.', null), 'Base system.');
  });

  it('appends a knowledge block when text is present', () => {
    const result = withKnowledge('Base system.', 'Our API uses Postgres.');
    assert.match(result, /^Base system\./);
    assert.match(result, /Knowledge document/i);
    assert.match(result, /Our API uses Postgres/);
  });
});
