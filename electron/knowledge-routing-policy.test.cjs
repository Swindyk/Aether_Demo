const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AetherKnowledgeService } = require('./knowledge-service.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-knowledge-routing-'));
const services = [];

const createService = options => {
  const service = new AetherKnowledgeService(options);
  services.push(service);
  return service;
};

const response = (payload, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => JSON.stringify(payload),
});

test.after(() => {
  services.forEach(service => service.close());
  fs.rmSync(root, { recursive: true, force: true });
});

test('低匹配结果走 web 兜底检索', async () => {
  const calls = [];
  const longGuide = `近期活动版本更新后推荐的探索与配队思路说明：请先确认当前场景、目标与队伍可见事实，再决定后续操作，避免误导。`.repeat(20);
  const service = createService({
    dbFile: path.join(root, 'fallback-web.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: JSON.parse(options.body || '{}') });
      if (url.endsWith('/search')) {
        return response({
          request_id: 'search-ok',
          results: [
            {
              title: '星穹铁道攻略索引',
              url: 'https://www.miyoushe.com/sr/topicDetail/44',
            },
          ],
        });
      }
      return response({
        request_id: 'extract-ok',
        results: [
          {
            url: 'https://www.miyoushe.com/sr/topicDetail/44',
            raw_content: longGuide,
          },
        ],
        failed_results: [],
      });
    },
  });

  const result = await service.retrieve({
    query: '这张图里有什么细节我看不懂，帮我讲讲',
    game: 'starrail',
    scene: 'explore',
    sourceName: '截图',
    allowWeb: true,
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.webUsed, true);
  assert.equal(result.matchMode, 'web-first');
  assert.equal(result.retrievalPolicy, 'web-first');
  assert.equal(result.guideIntent, 'exploration');
  assert.equal(result.hits.length, 1);
  assert.ok(calls.filter(item => item.url.endsWith('/search')).length >= 1);
  assert.ok(calls.filter(item => item.url.endsWith('/extract')).length >= 1);
});

test('用户显式要求「更新」时触发 web，但无可用 web 来源返回降级态', async () => {
  const calls = [];
  const service = createService({
    dbFile: path.join(root, 'explicit-web-empty.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: JSON.parse(options.body || '{}') });
      return response({ request_id: 'search-empty', results: [] });
    },
  });

  const result = await service.retrieve({
    query: '这个角色更新后最新版本有变动吗，给我查一下更新信息',
    game: 'genshin',
    scene: 'gear',
    sourceName: '用户提问',
    allowWeb: true,
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.webUsed, false);
  assert.equal(result.matchMode, 'low-match-web-empty');
  assert.ok(calls.filter(item => item.url.endsWith('/search')).length >= 1);
  assert.equal(calls.filter(item => item.url.endsWith('/extract')).length, 0);
});

test('allowWeb=false 时即便低匹配也不允许走 web', async () => {
  const service = createService({
    dbFile: path.join(root, 'no-web.sqlite'),
    tavilyKey: 'test-key',
  });
  const result = await service.retrieve({
    query: '这张图里的机制我不确定',
    game: 'starrail',
    scene: 'story',
    allowWeb: false,
  });

  assert.equal(result.webTriggered, false);
  assert.equal(result.matchMode, 'low-match-no-web');
  assert.equal(result.webUsed, false);
  assert.equal(result.hits.length, 0);
});

test('非游戏场景下仍可基于显式联网意图触发 web 检索', async () => {
  const calls = [];
  const service = createService({
    dbFile: path.join(root, 'non-game-web-explicit.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: JSON.parse(options.body || '{}') });
      return response({
        request_id: 'search-extra',
        results: [],
      });
    },
  });
  const result = await service.retrieve({
    query: '这个活动里守望者·鉴天有什么机制和弱点？我先想确认下',
    sourceName: '游戏截图',
    allowWeb: true,
  });
  assert.equal(result.webSearchRequired, true);
  assert.equal(result.webTriggered, true);
  assert.equal(result.matchMode, 'low-match-web-empty');
  assert.equal(calls.some(item => item.url.endsWith('/search')), true);
});


test('未配置 tavily 时返回手动检索提示', async () => {
  const calls = [];
  const service = createService({
    dbFile: path.join(root, 'web-unavailable-hint.sqlite'),
    tavilyKey: undefined,
    fetchImpl: async () => {
      calls.push('should-not-call');
      return response({ request_id: 'bad', results: [] });
    },
  });
  const result = await service.retrieve({
    query: '这个 BOSS 机制是什么？',
    scene: 'explore',
    sourceName: '游戏截图',
    allowWeb: true,
  });
  assert.equal(result.webSearchUnavailableReason.includes('未配置'), true);
  assert.equal(result.webTriggered, true);
  assert.equal(result.webUsed, false);
  assert.equal(result.webSearchRequired, false);
  assert.equal(calls.length, 0);
  assert.ok(Array.isArray(result.searchHints?.queryHints));
});
