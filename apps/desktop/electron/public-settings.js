function toPublicSettings(settings) {
  const { apiKey, ...preferences } = settings || {};
  return {
    ...preferences,
    apiKey: '',
    hasApiKey: typeof apiKey === 'string' && apiKey.trim().length > 0,
  };
}

module.exports = { toPublicSettings };
