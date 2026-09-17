function toPublicSettings(settings) {
  const { apiKey, ...preferences } = settings || {};
  return {
    ...preferences,
    apiKey: '',
    hasApiKey: typeof apiKey === 'string' && apiKey.trim().length > 0,
  };
}

function mergeKnowledgeMeta(publicSettings, knowledgeMeta) {
  return {
    ...publicSettings,
    ...(knowledgeMeta && typeof knowledgeMeta === 'object' ? knowledgeMeta : {}),
  };
}

module.exports = { toPublicSettings, mergeKnowledgeMeta };
