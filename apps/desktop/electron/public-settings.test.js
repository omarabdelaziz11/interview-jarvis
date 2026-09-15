const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toPublicSettings } = require('./public-settings');

describe('public settings', () => {
  it('reports key presence without exposing the key', () => {
    const result = toPublicSettings({ apiKey: 'sk-secret', model: 'gpt-4o-mini' });

    assert.deepEqual(result, {
      apiKey: '',
      hasApiKey: true,
      model: 'gpt-4o-mini',
    });
  });

  it('reports when no key is configured', () => {
    assert.equal(toPublicSettings({ apiKey: '' }).hasApiKey, false);
  });
});
