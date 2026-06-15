const DEFAULT_LOCAL_PROVIDER = 'Sub2Api';
const DEFAULT_LOCAL_MODEL = 'gpt-5.5';
const DEFAULT_LOCAL_BASE_URL = 'http://127.0.0.1:8080/v1';
const DEFAULT_LOCAL_WIRE = 'responses';

const clean = value => String(value || '').trim().replace(/^["']|["']$/g, '');
const cleanSecret = value => typeof value === 'string' ? clean(value) : '';
const firstClean = (...values) => values.map(clean).find(Boolean) || '';
const firstSecret = (...values) => values.map(cleanSecret).find(Boolean) || '';
const numberFrom = (...values) => {
  const value = values.map(clean).find(Boolean);
  return Number(value) || 0;
};

const tokenSource = env => {
  if (cleanSecret(env.AETHER_LLM_API_KEY)) return 'env:AETHER_LLM_API_KEY';
  if (cleanSecret(env.AETHER_MODEL_API_KEY)) return 'env:AETHER_MODEL_API_KEY';
  if (cleanSecret(env.OPENAI_API_KEY)) return 'env:OPENAI_API_KEY';
  return 'missing';
};

const resolveModelConfig = (env = {}) => {
  const token = firstSecret(env.AETHER_LLM_API_KEY, env.AETHER_MODEL_API_KEY, env.OPENAI_API_KEY);
  const model = firstClean(env.AETHER_LLM_MODEL, env.AETHER_MODEL, env.OPENAI_MODEL) || DEFAULT_LOCAL_MODEL;
  return {
    providerName: firstClean(env.AETHER_LLM_PROVIDER, env.AETHER_MODEL_PROVIDER, env.MODEL_PROVIDER) || DEFAULT_LOCAL_PROVIDER,
    token,
    model,
    fastVisionModel: firstClean(
      env.AETHER_LLM_FAST_VISION_MODEL,
      env.AETHER_FAST_VISION_MODEL,
      env.AETHER_LLM_MODEL,
      env.AETHER_MODEL,
      env.OPENAI_MODEL,
    ) || model,
    apiBaseUrl: firstClean(env.AETHER_LLM_BASE_URL, env.AETHER_MODEL_BASE_URL, env.OPENAI_BASE_URL) || DEFAULT_LOCAL_BASE_URL,
    apiUrl: firstClean(env.AETHER_LLM_API_URL, env.AETHER_MODEL_API_URL, env.OPENAI_API_URL),
    apiWire: firstClean(env.AETHER_LLM_WIRE, env.AETHER_MODEL_WIRE, env.OPENAI_WIRE_API) || DEFAULT_LOCAL_WIRE,
    timeoutMs: numberFrom(env.AETHER_LLM_TIMEOUT_MS, env.AETHER_MODEL_TIMEOUT_MS) || 180000,
    cloudDisabled: true,
    tokenSource: tokenSource(env),
  };
};

module.exports = {
  DEFAULT_LOCAL_BASE_URL,
  DEFAULT_LOCAL_MODEL,
  resolveModelConfig,
};
