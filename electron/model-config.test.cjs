const assert = require('node:assert/strict');
const test = require('node:test');
const { resolveModelConfig } = require('./model-config.cjs');

test('AETHER_LLM variables have highest priority', () => {
  const config = resolveModelConfig({
    AETHER_LLM_BASE_URL: 'http://127.0.0.1:8080/v1',
    AETHER_LLM_API_KEY: 'llm-key',
    AETHER_LLM_MODEL: 'gpt-5.5',
    AETHER_LLM_FAST_VISION_MODEL: 'gpt-5.5-fast',
    AETHER_LLM_WIRE: 'responses',
    AETHER_LLM_TIMEOUT_MS: '180000',
    AETHER_MODEL_API_KEY: 'legacy-key',
    AETHER_MODEL_BASE_URL: 'http://legacy.example/v1',
    AETHER_MODEL: 'legacy-model',
    OPENAI_API_KEY: 'openai-key',
    OPENAI_BASE_URL: 'http://openai.example/v1',
    OPENAI_MODEL: 'openai-model',
  });

  assert.equal(config.token, 'llm-key');
  assert.equal(config.tokenSource, 'env:AETHER_LLM_API_KEY');
  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(config.model, 'gpt-5.5');
  assert.equal(config.fastVisionModel, 'gpt-5.5-fast');
  assert.equal(config.apiWire, 'responses');
  assert.equal(config.timeoutMs, 180000);
  assert.equal(config.cloudDisabled, true);
});

test('legacy AETHER_MODEL variables remain compatible', () => {
  const config = resolveModelConfig({
    AETHER_MODEL_API_KEY: 'legacy-key',
    AETHER_MODEL_BASE_URL: 'http://127.0.0.1:8080/v1',
    AETHER_MODEL: 'gpt-5.5',
    AETHER_MODEL_WIRE: 'responses',
    AETHER_MODEL_TIMEOUT_MS: '90000',
  });

  assert.equal(config.token, 'legacy-key');
  assert.equal(config.tokenSource, 'env:AETHER_MODEL_API_KEY');
  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(config.model, 'gpt-5.5');
  assert.equal(config.apiWire, 'responses');
  assert.equal(config.timeoutMs, 90000);
});

test('OPENAI variables are compatibility fallback only', () => {
  const config = resolveModelConfig({
    OPENAI_API_KEY: 'openai-key',
    OPENAI_BASE_URL: 'http://127.0.0.1:8080/v1',
    OPENAI_MODEL: 'gpt-5.3-codex-spark',
    OPENAI_WIRE_API: 'responses',
  });

  assert.equal(config.token, 'openai-key');
  assert.equal(config.tokenSource, 'env:OPENAI_API_KEY');
  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(config.model, 'gpt-5.3-codex-spark');
  assert.equal(config.apiWire, 'responses');
});

test('Codex auth is not used as a fallback', () => {
  const config = resolveModelConfig({}, {
    codexAuth: { OPENAI_API_KEY: 'must-not-be-used' },
  });

  assert.equal(config.token, '');
  assert.equal(config.tokenSource, 'missing');
  assert.equal(config.apiBaseUrl, 'http://127.0.0.1:8080/v1');
  assert.equal(config.model, 'gpt-5.5');
});
