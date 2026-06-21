const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { AetherKnowledgeService, detectVersion, friendlyAccountError, repairMojibake } = require('./knowledge-service.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-knowledge-test-'));
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

test('能够修复常见中文乱码', () => {
  const broken = Buffer.from('原神配队攻略', 'utf8').toString('latin1');
  assert.equal(repairMojibake(broken), '原神配队攻略');
});

test('外部来源只在正文明确写出时标记版本', () => {
  assert.equal(detectVersion('原神 6.6 版本配队攻略'), '6.6 版本');
  assert.equal(detectVersion('一篇没有版本信息的攻略'), '版本未标注');
});

test('账号同步错误会转换为玩家可读中文', () => {
  assert.match(friendlyAccountError(new Error('fetch failed')), /网络连接暂不可用/);
  assert.match(friendlyAccountError(new Error('Enka 返回 404')), /没有找到/);
});

test('全新数据目录能够直接创建 SQLite', () => {
  const dbFile = path.join(root, 'fresh', 'nested', 'aether.sqlite');
  const service = createService({ dbFile });
  assert.equal(fs.existsSync(dbFile), true);
  assert.equal(service.status().knowledgeEntries, 0);
});

test('原神与星铁账号、角色状态相互隔离', async () => {
  const service = createService({
    dbFile: path.join(root, 'accounts.sqlite'),
    fetchImpl: async url => {
      if (url.includes('/hsr/')) {
        return response({ detailInfo: { nickname: '开拓者', avatarDetailList: [{ avatarId: 1001, name: '三月七', level: 80, rank: 1 }] } });
      }
      if (url.endsWith('/characters.json')) return response({ 10000046: { NameTextMapHash: 123 } });
      if (url.endsWith('/loc.json')) return response({ 'zh-cn': { 123: '胡桃' } });
      return response({
        playerInfo: { nickname: '旅行者' },
        avatarInfoList: [{ avatarId: 10000046, propMap: { 4001: { ival: '90' } }, talentIdList: [1, 2], fightPropMap: { 2001: 1800 } }],
      });
    },
  });
  const genshin = service.connectAccount({ game: 'genshin', uid: '100000001' });
  const starrail = service.connectAccount({ game: 'starrail', uid: '800000001' });
  await service.syncAccount(genshin.id);
  await service.syncAccount(starrail.id);
  assert.equal(service.getAccountContext('genshin').account.nickname, '旅行者');
  assert.equal(service.getAccountContext('starrail').account.nickname, '开拓者');
  assert.equal(service.getAccountContext('genshin').characters[0].level, 90);
  assert.equal(service.getAccountContext('genshin').characters[0].name, '胡桃');
  assert.equal(service.getAccountContext('starrail').characters[0].name, '三月七');
  assert.equal(service.db.prepare('SELECT COUNT(*) AS count FROM character_snapshots').get().count, 2);
  await service.syncAccount(genshin.id);
  assert.equal(service.db.prepare('SELECT COUNT(*) AS count FROM character_snapshots WHERE account_id = ?').get(genshin.id).count, 2);
});

test('导入知识包会立即写入 SQLite 检索层', () => {
  const service = createService({ dbFile: path.join(root, 'import.sqlite') });
  const imported = service.importEntries([
    { id: 'imported-card', game: '原神', title: '测试配队卡', tags: ['测试配队'], content: '这是一条可立即检索的新知识。' },
  ], '测试版本');
  assert.equal(imported, 1);
  assert.equal(service.searchLocal('测试配队', 'genshin', 'roster')[0].version, '测试版本');
});

test('攻略类本地弱命中仍会联网，web 空时不保留泛来源', async () => {
  let calls = 0;
  const service = createService({
    dbFile: path.join(root, 'local.sqlite'),
    tavilyKey: 'test-key',
    seedEntries: [
      { id: 'a', game: '原神', title: '配队循环', tags: ['配队'], content: '配队需要检查循环。' },
      { id: 'b', game: '原神', title: '配队生存', tags: ['配队'], content: '配队需要保留生存位。' },
    ],
    fetchImpl: async () => {
      calls += 1;
      return response({});
    },
  });
  const result = await service.retrieve({ query: '配队基础', game: 'genshin', scene: 'roster' });
  assert.equal(result.webTriggered, true);
  assert.equal(result.webUsed, false);
  assert.equal(result.matchMode, 'low-match-web-empty');
  assert.equal(result.hits.length, 0);
  assert.ok(calls >= 1);
});

test('Tavily 检索会过滤搜索页并保留可追溯来源', async () => {
  const longGuide = `原神菈乌玛配队养成攻略：${'菈乌玛配队需要检查月绽放、水草触发、角色循环和生存位置。'.repeat(30)}`;
  const service = createService({
    dbFile: path.join(root, 'web.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async url => {
      if (url.endsWith('/search')) {
        return response({
          request_id: 'search-request',
          results: [
            { title: '原神配队搜索', url: 'https://search.bilibili.com/all?keyword=test' },
            { title: '中文prompt精选', url: 'https://langgptai.example.com/wonderful-prompts' },
            { title: '原神菈乌玛配队攻略', url: 'https://www.gamersky.com/handbook/202509/2012417.shtml' },
          ],
        });
      }
      return response({
        request_id: 'extract-request',
        results: [
          { url: 'https://search.bilibili.com/all?keyword=test', raw_content: longGuide },
          { url: 'https://langgptai.example.com/wonderful-prompts', raw_content: '这是一篇提示词文章。'.repeat(80) },
          { url: 'https://www.gamersky.com/handbook/202509/2012417.shtml', raw_content: longGuide },
        ],
        failed_results: [],
      });
    },
  });
  const result = await service.retrieve({ query: '当前菈乌玛配队怎么选', game: 'genshin', scene: 'roster', selectedCharacter: '菈乌玛' });
  assert.equal(result.citations.length, 1);
  assert.equal(result.citations[0].url, 'https://www.gamersky.com/handbook/202509/2012417.shtml');
  assert.ok(result.filteredSources.some(item => /搜索结果页/.test(item.reason)));
  assert.ok(result.filteredSources.some(item => /低质量|无关/.test(item.reason)));
  assert.deepEqual(result.tavilyRequestIds, ['search-request', 'extract-request']);
});

test('污染来源不会进入 citations 或 knowledge_cards', async () => {
  const guide = `原神基尼奇配队养成攻略：${'基尼奇配队需要稳定燃烧环境、检查元素战技输出、队伍循环和生存位。'.repeat(28)}`;
  const service = createService({
    dbFile: path.join(root, 'polluted.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async url => {
      if (url.endsWith('/search')) {
        return response({
          request_id: 'search-polluted',
          results: [
            { title: 'langgptai/wonderful-prompts: 中文prompt精选', url: 'https://github.com/langgptai/wonderful-prompts' },
            { title: '新功能和公告-Google Ads帮助', url: 'https://support.google.com/google-ads/announcements/9048699' },
            { title: '原神基尼奇配队攻略', url: 'https://www.gamersky.com/handbook/202509/2012417.shtml' },
          ],
        });
      }
      return response({
        request_id: 'extract-polluted',
        results: [
          { url: 'https://github.com/langgptai/wonderful-prompts', raw_content: 'ChatGPT prompt 使用指南。'.repeat(100) },
          { url: 'https://support.google.com/google-ads/announcements/9048699', raw_content: 'Google Ads 广告帮助公告。'.repeat(100) },
          { url: 'https://www.gamersky.com/handbook/202509/2012417.shtml', raw_content: guide },
        ],
        failed_results: [],
      });
    },
  });
  const result = await service.retrieve({ query: '基尼奇配队攻略', game: 'genshin', scene: 'roster', selectedCharacter: '基尼奇' });
  assert.equal(result.citations.length, 1);
  assert.ok(result.citations.every(item => !/prompt|Google Ads|google-ads/i.test(`${item.title} ${item.url}`)));
  const dirtyHits = service.searchLocal('wonderful prompts Google Ads', 'genshin', 'roster')
    .filter(item => /wonderful-prompts|Google Ads|google-ads|prompt/i.test(`${item.title} ${item.content} ${item.sourceUrl || ''}`));
  assert.equal(dirtyHits.length, 0);
});

test('精选源充足时不会触发开放全网兜底', async () => {
  const calls = [];
  const guide = `原神菈乌玛配队养成攻略：${'菈乌玛配队需要稳定草水触发、月绽放循环和治疗位。'.repeat(30)}`;
  const service = createService({
    dbFile: path.join(root, 'preferred-only.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async (url, options = {}) => {
      const body = JSON.parse(options.body || '{}');
      calls.push({ url, body });
      if (url.endsWith('/search')) {
        return response({
          request_id: `search-${calls.length}`,
          results: [
            { title: '原神菈乌玛配队攻略', url: 'https://www.gamersky.com/handbook/202509/2012417.shtml' },
            { title: 'Genshin Impact Lauma Quick Guide', url: 'https://keqingmains.com/q/lauma-quickguide/' },
          ],
        });
      }
      return response({
        request_id: 'extract-preferred',
        results: [
          { url: 'https://www.gamersky.com/handbook/202509/2012417.shtml', raw_content: guide },
          { url: 'https://keqingmains.com/q/lauma-quickguide/', raw_content: `Genshin Impact Lauma build guide. ${guide}` },
        ],
        failed_results: [],
      });
    },
  });
  const result = await service.retrieve({ query: '当前菈乌玛配队怎么选', game: 'genshin', scene: 'roster', selectedCharacter: '菈乌玛' });
  assert.equal(result.citations.length, 2);
  assert.equal(calls.filter(item => item.url.endsWith('/search')).length, 4);
  assert.ok(result.citations.every(item => item.sourceTier === 'preferred'));
});

test('原神与星铁知识按游戏隔离', () => {
  const service = createService({
    dbFile: path.join(root, 'game-isolation.sqlite'),
    seedEntries: [
      { id: 'g', game: '原神', title: '原神配队', tags: ['配队'], content: '原神队伍需要元素反应和生存位。' },
      { id: 's', game: '崩坏：星穹铁道', title: '星铁配队', tags: ['配队'], content: '星铁队伍需要速度顺序和战技点循环。' },
    ],
  });
  assert.ok(service.searchLocal('配队', 'genshin', 'roster').every(item => item.game !== '崩坏：星穹铁道'));
  assert.ok(service.searchLocal('配队', 'starrail', 'roster').every(item => item.game !== '原神'));
});

test('知识库重建会清理旧卡片和搜索缓存但保留账号', () => {
  const service = createService({
    dbFile: path.join(root, 'replace-knowledge.sqlite'),
    seedEntries: [
      { id: 'old-card', game: '原神', title: '旧卡片', tags: ['旧'], content: '旧知识内容。' },
    ],
  });
  service.connectAccount({ game: 'genshin', uid: '100000002' });
  service.putSearchCache('old-cache', { hits: [{ title: '旧缓存' }] }, ['request-old']);
  service.replaceKnowledgeEntries([
    { id: 'new-card', game: '崩坏：星穹铁道', title: '新卡片', tags: ['新'], content: '新知识内容。', sourceTier: 'curated' },
  ], '2026.06.15-curated-rag');
  assert.equal(service.status().accountCount, 1);
  assert.equal(service.status().knowledgeEntries, 1);
  assert.equal(service.searchLocal('旧卡片', 'genshin', 'gear').length, 0);
  assert.equal(service.searchLocal('新卡片', 'starrail', 'gear')[0].version, '2026.06.15-curated-rag');
  assert.equal(service.db.prepare('SELECT COUNT(*) AS count FROM search_cache').get().count, 0);
});

test('知识库状态返回分游戏和来源层级统计', () => {
  const service = createService({
    dbFile: path.join(root, 'knowledge-stats.sqlite'),
    seedEntries: [
      { id: 'g-local', game: '原神', title: '原神本地', tags: ['配队'], content: '原神本地卡。', sourceTier: 'local' },
      { id: 'g-curated', game: '原神', title: '原神精选', tags: ['配队'], content: '原神精选卡。', sourceTier: 'curated' },
      { id: 's-curated', game: '崩坏：星穹铁道', title: '星铁精选', tags: ['配队'], content: '星铁精选卡。', sourceTier: 'curated' },
    ],
  });
  const status = service.status();
  assert.deepEqual(status.partitions.find(item => item.game === '原神').tiers, { curated: 1, local: 1 });
  assert.equal(status.partitions.find(item => item.game === '崩坏：星穹铁道').count, 1);
  assert.equal(status.sourceTiers.find(item => item.tier === 'curated').count, 2);
});

test('低质量 fallback 社区或视频来源不会进入兜底知识库', async () => {
  const guide = `原神基尼奇配队养成攻略：${'基尼奇配队需要稳定燃烧环境、检查元素战技输出、队伍循环和生存位。'.repeat(28)}`;
  const service = createService({
    dbFile: path.join(root, 'low-quality-fallback.sqlite'),
    tavilyKey: 'test-key',
    fetchImpl: async url => {
      if (url.endsWith('/search')) {
        return response({
          request_id: 'search-low-quality',
          results: [
            { title: '原神基尼奇 Reddit 讨论', url: 'https://www.reddit.com/r/Genshin_Impact/comments/test' },
            { title: '原神基尼奇 Youtube 视频', url: 'https://www.youtube.com/watch?v=test' },
            { title: '原神基尼奇配队攻略', url: 'https://www.gamersky.com/handbook/202509/2012417.shtml' },
          ],
        });
      }
      return response({
        request_id: 'extract-low-quality',
        results: [
          { url: 'https://www.reddit.com/r/Genshin_Impact/comments/test', raw_content: guide },
          { url: 'https://www.youtube.com/watch?v=test', raw_content: guide },
          { url: 'https://www.gamersky.com/handbook/202509/2012417.shtml', raw_content: guide },
        ],
        failed_results: [],
      });
    },
  });
  const result = await service.retrieve({ query: '基尼奇配队攻略', game: 'genshin', scene: 'roster', selectedCharacter: '基尼奇' });
  assert.ok(result.citations.every(item => !/reddit|youtube/i.test(item.url)));
  assert.ok(result.filteredSources.some(item => /低质量社区或视频来源/.test(item.reason)));
});
