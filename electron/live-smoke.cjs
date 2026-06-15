const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, nativeImage } = require('electron');
const { AetherAgentRuntime } = require('./agent-runtime.cjs');
const { AetherKnowledgeService } = require('./knowledge-service.cjs');
const { resolveModelConfig } = require('./model-config.cjs');

const readEnv = file => {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(line => line.trim() && !line.trim().startsWith('#') && line.includes('='))
    .map(line => {
      const index = line.indexOf('=');
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
    }),
  );
};

app.whenReady().then(async () => {
  const root = path.resolve(__dirname, '..');
  const env = {
    ...readEnv(path.join(root, '.env')),
    ...readEnv(path.join(root, '.env.local')),
    ...process.env,
  };
  const modelConfig = resolveModelConfig(env);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-live-agent-'));
  const image = nativeImage.createFromPath(path.join(root, 'public', 'demo', 'genshin-weapon.png')).resize({ width: 1280 });
  const imageDataUrl = `data:image/jpeg;base64,${image.toJPEG(72).toString('base64')}`;
  const knowledgePack = JSON.parse(fs.readFileSync(path.join(root, 'electron', 'knowledge', 'game-knowledge.json'), 'utf8'));
  const knowledgeService = new AetherKnowledgeService({
    dataDir,
    dbFile: path.join(dataDir, 'aether.sqlite'),
    tavilyKey: env.TAVILY_API_KEY,
    seedEntries: knowledgePack.entries,
  });
  const runtime = new AetherAgentRuntime({
    dataDir,
    knowledgeFile: path.join(root, 'electron', 'knowledge', 'game-knowledge.json'),
    providerName: modelConfig.providerName,
    token: modelConfig.token,
    model: modelConfig.model,
    fastVisionModel: modelConfig.fastVisionModel,
    apiBaseUrl: modelConfig.apiBaseUrl,
    apiUrl: modelConfig.apiUrl,
    apiWire: modelConfig.apiWire,
    knowledgeService,
    timeoutMs: modelConfig.timeoutMs || 210000,
  });
  const account = knowledgeService.connectAccount({
    game: 'genshin',
    uid: env.LIVE_ENKA_UID || '100850016',
    label: '联网烟测账号',
  });
  let syncedAccount = account;
  try {
    syncedAccount = await knowledgeService.syncAccount(account.id);
  } catch (error) {
    syncedAccount = { ...account, error: error.message, characterCount: 0 };
  }
  const query = '当前原神配队怎样兼顾循环和生存？';
  let retrieval;
  try {
    retrieval = await knowledgeService.retrieve({ query, game: 'genshin', scene: 'roster' });
  } catch (error) {
    retrieval = {
      hits: knowledgeService.searchLocal(query, 'genshin', 'roster'),
      citations: [],
      filteredSources: [{ url: 'https://api.tavily.com', title: 'Tavily', reason: error.message }],
      retrievalSource: ['local', 'model'],
      tavilyRequestIds: [],
    };
  }
  const run = await runtime.run({
    query,
    persona: 'BALANCED',
    scene: 'gear',
    mode: 'scan',
    analysisMode: 'deep',
    sourceName: '内置场景：原神装备',
    imageDataUrl,
    imageHash: crypto.createHash('sha256').update(imageDataUrl).digest('hex'),
  });
  console.log(JSON.stringify({
    enka: {
      nickname: syncedAccount.nickname,
      characterCount: syncedAccount.characterCount,
    },
    retrieval: {
      hits: retrieval.hits.length,
      citations: retrieval.citations.length,
      filteredSources: retrieval.filteredSources.length,
      retrievalSource: retrieval.retrievalSource,
      tavilyRequestIds: retrieval.tavilyRequestIds,
    },
    source: run.source,
    model: run.model,
    requestId: run.requestId,
    latencyMs: run.metrics.latencyMs,
    retries: run.metrics.retries,
    game: run.observation.game,
    scene: run.observation.scene,
    summary: run.observation.summary,
    answer: run.answer,
    errors: run.errors,
  }, null, 2));
  knowledgeService.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
