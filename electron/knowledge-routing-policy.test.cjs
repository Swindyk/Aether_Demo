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

test('任务章节进度追问会提取行动目标并走 web-first', async () => {
  const calls = [];
  const service = createService({
    dbFile: path.join(root, 'quest-progress-web.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      calls.push({ url, body });
      if (url.endsWith('/search')) {
        return response({
          request_id: 'quest-search',
          results: [
            {
              title: '原神 前往国境线 任务流程',
              url: 'https://wiki.biligame.com/ys/%E4%BB%BB%E5%8A%A1',
            },
          ],
        });
      }
      return response({
        request_id: 'quest-extract',
        results: [
          {
            url: 'https://wiki.biligame.com/ys/%E4%BB%BB%E5%8A%A1',
            raw_content: `原神任务攻略：前往国境线是魔神任务中的行动目标，可结合任务标题、章节名、任务链步骤判断剧情进度和剩余流程。${'任务章节进度说明。'.repeat(80)}`,
          },
        ],
        failed_results: [],
      });
    },
  });

  const result = await service.retrieve({
    query: '你网上搜不到“原神+前往国境线”这个关键词吗？结合最新章节总数任务数推测还剩多久',
    game: 'genshin',
    scene: 'story',
    allowWeb: true,
    context: {
      summary: '旅行者在沙漠/峡谷地形中，当前剧情目标为前往国境线，目标距离约325米。',
      facts: ['当前任务目标：前往国境线'],
    },
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.webUsed, true);
  assert.equal(result.retrievalPolicy, 'web-first');
  assert.equal(result.guideIntent, 'quest');
  assert.ok(result.webQueries.some(query => query.includes('前往国境线')));
  assert.ok(calls.some(item => item.url.endsWith('/search') && item.body.query.includes('前往国境线')));
});

test('深渊 Boss 复杂问题会同时生成机制和队伍检索面', async () => {
  const calls = [];
  const service = createService({
    dbFile: path.join(root, 'abyss-multi-facet-web.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, body: JSON.parse(options.body || '{}') });
      return response({ request_id: 'search-empty', results: [] });
    },
  });

  const result = await service.retrieve({
    query: '这2个boss机制是什么，怎么打，这期新深渊有什么推荐队伍，上半下半怎么分',
    game: 'genshin',
    scene: 'roster',
    allowWeb: true,
    context: {
      summary: '第12层第3间，上半守望者·堕天，下半灵觉隐修的迷者。',
      facts: ['上半：守望者·堕天', '下半：灵觉隐修的迷者'],
    },
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.retrievalPolicy, 'manual-fallback');
  assert.equal(result.guideIntent, 'abyss/endgame');
  assert.ok(result.webQueries.some(query => /机制|抗性|弱点|破盾/.test(query)));
  assert.ok(result.webQueries.some(query => /推荐队伍|阵容|上半|下半/.test(query)));
  const searched = calls.filter(item => item.url.endsWith('/search')).map(item => item.body.query).join('\n');
  assert.match(searched, /机制|抗性|弱点|破盾/);
  assert.match(searched, /推荐队伍|阵容|上半|下半/);
});

test('装备养成问题会生成毕业面板和词条检索面', async () => {
  const service = createService({
    dbFile: path.join(root, 'build-facet-web.sqlite'),
    tavilyKey: undefined,
  });
  const result = await service.retrieve({
    query: '这个角色武器要不要换，圣遗物词条怎么配，毕业面板多少',
    game: 'genshin',
    scene: 'gear',
    allowWeb: true,
    selectedCharacter: '芙宁娜',
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.guideIntent, 'build');
  assert.ok(result.searchHints?.queryHints?.length);
  assert.ok(result.webQueries.some(query => /装备|武器|圣遗物|词条|毕业面板/.test(query)));
});

test('探索卡点问题会生成路线和位置检索面', async () => {
  const service = createService({
    dbFile: path.join(root, 'exploration-facet-web.sqlite'),
    tavilyKey: undefined,
  });
  const result = await service.retrieve({
    query: '这个机关怎么开，宝箱在哪，路线怎么走',
    game: 'starrail',
    scene: 'explore',
    allowWeb: true,
    context: {
      summary: '地图上可见机关和宝箱标记。',
      facts: ['可见机关', '目标附近有宝箱'],
    },
  });

  assert.equal(result.webTriggered, true);
  assert.equal(result.guideIntent, 'exploration');
  assert.ok(result.webQueries.some(query => /探索|路线|解谜|位置|宝箱|机关/.test(query)));
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
