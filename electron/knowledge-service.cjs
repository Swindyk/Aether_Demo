const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DAY_MS = 24 * 60 * 60 * 1000;
const nowId = prefix => `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
const json = value => JSON.stringify(value ?? {});
const parseJson = (value, fallback) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const GAME_LABELS = {
  genshin: '原神',
  starrail: '崩坏：星穹铁道',
};

const GAME_ALIASES = {
  genshin: ['原神', 'genshin', 'genshin impact'],
  starrail: ['崩坏：星穹铁道', '星穹铁道', '星铁', 'honkai star rail', 'star rail', 'hsr'],
};

const QUERY_HINTS = [
  '洛恩', '玛薇卡', '千冶·刃', '千冶', '二相乐园', '观览云岛站', '勇锐魁杰试炼战记',
  '黑曜秘典', '风起之日', '灾悔', '焚曜千阳', '无量忿怒', '拾骨地', '名冶',
  '毕业', '毕业面板', '面板参考', '配队', '阵容推荐', '队伍', '光锥', '遗器', '圣遗物',
  '主词条', '副词条', '宝箱', '尘灵', '格挡', '限时活动', '活动攻略', 'topic_id',
  '双爆', '暴击率', '暴击伤害', '圣遗物', '遗器', '装备', '词条', '配队', '阵容', '循环',
  '基尼奇', '撼地者', '深境螺旋', '上半', '下半', '破盾', '生存位',
  '菈乌玛', '拉乌玛', 'Lauma', '月绽放', '妮露', '纳西妲', '元素精通', '毕业面板',
  '剧情', '防剧透', 'NPC', '人物关系', '探索', '地图', '路线', '解谜', '卡点',
  '主词条', '副词条', '冒险等阶', '世界等级', '魔神任务', '传说任务', '世界任务', '委托任务', '宝箱', '成就', '地图工具', '地灵龛',
  '光锥', '命途', '叠影', '遗器', '位面饰品', '开拓等级', '均衡等级', '开拓任务', '开拓续闻', '同行任务', '冒险任务',
  '模拟宇宙', '祝福', '奇物', '忘却之庭', '混沌回忆', '虚构叙事', '末日幻影', '战利品',
  '自动点击', '自动操作', '游戏内存', '读取内存', '抓包', '封包', '截图', 'OCR', '视觉',
];

const TRUSTED_GUIDE_DOMAINS = [
  'keqingmains.com',
  'hsr.keqingmains.com',
  'prydwen.gg',
  'gamersky.com',
  'miyoushe.com',
  'bbs.mihoyo.com',
  'baike.mihoyo.com',
  'hoyolab.com',
  'bilibili.com',
  '17173.com',
  'zhihu.com',
  'game8.co',
];

const PREFERRED_GUIDE_DOMAINS = {
  genshin: [
    'keqingmains.com',
    'miyoushe.com',
    'bbs.mihoyo.com',
    'baike.mihoyo.com',
    'hoyolab.com',
    'gamersky.com',
    '17173.com',
    'game8.co',
  ],
  starrail: [
    'prydwen.gg',
    'hsr.keqingmains.com',
    'keqingmains.com',
    'miyoushe.com',
    'bbs.mihoyo.com',
    'hoyolab.com',
    'game8.co',
  ],
};

const LOW_QUALITY_FALLBACK_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'reddit.com',
];

const SOURCE_TIER_WEIGHT = {
  curated: 4,
  preferred: 3,
  community: 2,
  fallback: 1,
  local: 1.5,
};

const BLOCKED_SOURCE_PATTERNS = [
  /langgptai|wonderful-prompts|prompt/i,
  /support\.google\.com|ads\.google|googleads/i,
  /google\s*ads|广告帮助|营销帮助|adwords/i,
  /chatgpt|openai|提示词|prompt\s*(guide|template|engineering)/i,
  /search\.bilibili\.com/i,
  /\/search[/?#]/i,
];

const GUIDE_KEYWORDS = ['配队', '养成', '毕业面板', '面板', '攻略', 'build', 'team', 'guide', 'teams', 'stats'];
const SCENE_KEYWORDS = {
  team: ['配队', '阵容', '阵容推荐', '队伍', '循环', 'topic_id', 'topicDetail', 'team', 'teams', 'composition'],
  event: ['活动', '限时活动', '活动攻略', '奖励', '原石', '格挡', '挑战', '试炼', '勇锐魁杰试炼战记'],
  gear: ['装备', '武器', '圣遗物', '遗器', '词条', '主词条', '副词条', '光锥', '命途', '叠影', '位面饰品', 'build', 'artifact', 'relic', 'light cone'],
  roster: ['配队', '阵容', '循环', '模拟宇宙', '祝福', '奇物', '忘却之庭', '混沌回忆', '虚构叙事', '末日幻影', 'team', 'teams', 'composition'],
  story: ['剧情', '任务', '人物', '防剧透', '魔神任务', '传说任务', '世界任务', '开拓任务', '同行任务', '冒险任务', 'story', 'quest'],
  explore: ['探索', '地图', '路线', '解谜', '宝箱', '成就', '地图工具', '战利品', '冒险等阶', '世界等级', 'puzzle', 'exploration', 'map'],
};

const normalizeCharacterName = value => String(value || '')
  .replace(/拉乌玛/g, '菈乌玛')
  .trim();

const characterAliases = value => {
  const name = normalizeCharacterName(value);
  if (!name) return [];
  if (/菈乌玛|Lauma/i.test(name)) return ['菈乌玛', '拉乌玛', 'Lauma'];
  return [name];
};

const inferGame = text => {
  const value = String(text || '');
  if (/星穹铁道|星铁|star\s*rail|hsr/i.test(value)) return 'starrail';
  if (/原神|genshin/i.test(value)) return 'genshin';
  return undefined;
};

const meaningfulChinese = value => (String(value || '').match(/[\u3400-\u9fff]/g) || []).length;

const repairMojibake = value => {
  const text = String(value || '');
  if (!/[Ãåäæçéèïð]/i.test(text)) return text;
  const repaired = Buffer.from(text, 'latin1').toString('utf8');
  return meaningfulChinese(repaired) > meaningfulChinese(text) ? repaired : text;
};

const compactText = (value, limit = 1200) => repairMojibake(value)
  .replace(/\s+/g, ' ')
  .replace(/[\u0000-\u001f]+/g, ' ')
  .trim()
  .slice(0, limit);

const domainOf = value => {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const gameKeyFromLabel = value => {
  const text = String(value || '').toLowerCase();
  if (/starrail|星穹铁道|星铁|honkai/.test(text)) return 'starrail';
  if (/genshin|原神/.test(text)) return 'genshin';
  return value === 'starrail' || value === 'genshin' ? value : '';
};

const domainMatches = (domain, list = []) => list.some(item => domain === item || domain.endsWith(`.${item}`));

const includesAny = (text, words = []) => words.some(word => {
  const value = String(word || '').trim();
  return value && new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text);
});

const isPollutedText = value => BLOCKED_SOURCE_PATTERNS.some(pattern => pattern.test(String(value || '')));

const isLowQualityFallbackSource = value => {
  const text = String(value || '');
  const domain = domainOf(text);
  return LOW_QUALITY_FALLBACK_DOMAINS.some(item => domain === item || domain.endsWith(`.${item}`) || text.includes(item));
};

const sourceTierWeight = value => SOURCE_TIER_WEIGHT[value] || 0;

const guideKeywordsFor = scene => [...GUIDE_KEYWORDS, ...(SCENE_KEYWORDS[scene] || [])];

const makeGuideCardContent = (raw, context = {}) => {
  const text = compactText(raw, 2400);
  const keywords = [
    ...(GAME_ALIASES[context.game] || []),
    ...characterAliases(context.selectedCharacter),
    ...guideKeywordsFor(context.scene),
  ].filter(Boolean);
  const sentences = text
    .split(/(?<=[。！？.!?])\s+|[\r\n]+/)
    .map(item => compactText(item, 260))
    .filter(item => item.length > 24);
  const selected = sentences
    .filter(sentence => !isPollutedText(sentence) && (!keywords.length || includesAny(sentence, keywords)))
    .slice(0, 8);
  const fallback = sentences.filter(sentence => !isPollutedText(sentence)).slice(0, 6);
  return compactText((selected.length ? selected : fallback).join(' '), 900);
};

const authorFrom = (title, url) => {
  const domain = domainOf(url);
  if (domain.includes('bilibili.com')) return 'Bilibili 创作者';
  if (domain.includes('reddit.com')) return 'Reddit 社区';
  if (domain.includes('game8.co')) return 'Game8';
  if (domain.includes('ign.com')) return 'IGN';
  if (domain.includes('17173.com')) return '17173';
  return compactText(title, 60) || domain || '公开来源';
};

const detectVersion = value => {
  const match = String(value || '').match(/(?:版本|version|ver\.?|v)\s*([0-9]+\.[0-9]+)|([0-9]+\.[0-9]+)\s*(?:版本|version|ver\.?)/i);
  return match ? `${match[1] || match[2]} 版本` : '版本未标注';
};

const friendlyAccountError = value => {
  const message = String(value?.message || value || '');
  if (/Enka 返回 404/i.test(message)) return '没有找到该 UID 的公开角色展示，请先在游戏内公开角色信息';
  if (/Enka 返回 429/i.test(message)) return '公开账号服务请求较多，请稍后再更新';
  if (/fetch failed|ECONN|ENOTFOUND|ETIMEDOUT|abort/i.test(message)) return '网络连接暂不可用，请稍后再更新';
  return compactText(message, 180) || '公开账号同步暂未完成';
};

const englishQuery = (query, game, scene) => {
  let result = String(query || '')
    .replace(/原神/g, 'Genshin Impact')
    .replace(/崩坏：?星穹铁道|星穹铁道|星铁/g, 'Honkai Star Rail')
    .replace(/配队|阵容/g, 'team composition')
    .replace(/装备|武器|圣遗物|遗器/g, 'build weapon artifact')
    .replace(/探索|解谜|卡点/g, 'exploration puzzle guide')
    .replace(/攻略/g, 'guide');
  if (meaningfulChinese(result) > 2) {
    result = `${GAME_LABELS[game] || ''} ${scene === 'roster' ? 'team composition' : scene === 'gear' ? 'build guide' : scene === 'explore' ? 'exploration puzzle guide' : 'guide'}`;
  }
  return result.trim();
};

class AetherKnowledgeService {
  constructor(options) {
    const dbFile = options.dbFile || path.join(options.dataDir, 'aether.sqlite');
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    this.db = new DatabaseSync(dbFile);
    this.fetchImpl = options.fetchImpl || fetch;
    this.tavilyKey = options.tavilyKey || '';
    this.enkaBaseUrl = options.enkaBaseUrl || 'https://enka.network/api';
    this.enkaStaticBaseUrl = options.enkaStaticBaseUrl || 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store';
    this.tavilyBaseUrl = options.tavilyBaseUrl || 'https://api.tavily.com';
    this.seedEntries = Array.isArray(options.seedEntries) ? options.seedEntries : [];
    this.seedVersion = options.seedVersion || '内置知识包';
    this.replaceSeedEntries = Boolean(options.replaceSeedEntries);
    this.init();
  }

  init() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY, game TEXT NOT NULL, uid TEXT NOT NULL, label TEXT NOT NULL,
        nickname TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
        synced_at INTEGER, error TEXT NOT NULL DEFAULT '', UNIQUE(game, uid)
      );
      CREATE TABLE IF NOT EXISTS characters (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, game TEXT NOT NULL, character_id TEXT NOT NULL,
        name TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL DEFAULT 0,
        equipment_summary TEXT NOT NULL DEFAULT '', properties_json TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1, observed_at INTEGER NOT NULL,
        UNIQUE(account_id, character_id)
      );
      CREATE TABLE IF NOT EXISTS character_snapshots (
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, game TEXT NOT NULL, character_id TEXT NOT NULL,
        name TEXT NOT NULL, level INTEGER NOT NULL DEFAULT 0, rank INTEGER NOT NULL DEFAULT 0,
        equipment_summary TEXT NOT NULL DEFAULT '', properties_json TEXT NOT NULL DEFAULT '{}',
        source TEXT NOT NULL, observed_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sources (
        id TEXT PRIMARY KEY, url TEXT NOT NULL UNIQUE, title TEXT NOT NULL DEFAULT '',
        author TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, domain TEXT NOT NULL DEFAULT '',
        version TEXT NOT NULL DEFAULT '当前版本', fetched_at INTEGER NOT NULL, status TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS knowledge_cards (
        id TEXT PRIMARY KEY, game TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]', source_id TEXT, version TEXT NOT NULL DEFAULT '当前版本',
        confidence REAL NOT NULL DEFAULT 0.7, updated_at INTEGER NOT NULL,
        UNIQUE(game, title, source_id)
      );
      CREATE TABLE IF NOT EXISTS search_cache (
        query_key TEXT PRIMARY KEY, payload_json TEXT NOT NULL, request_ids_json TEXT NOT NULL DEFAULT '[]',
        expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY, kind TEXT NOT NULL, target TEXT NOT NULL, status TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL
      );
    `);
    this.ensureColumn('sources', 'source_tier', "TEXT NOT NULL DEFAULT 'local'");
    this.ensureColumn('knowledge_cards', 'topic', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('knowledge_cards', 'character', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('knowledge_cards', 'scene', "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn('knowledge_cards', 'source_tier', "TEXT NOT NULL DEFAULT 'local'");
    this.ensureColumn('knowledge_cards', 'semantic_score', 'REAL NOT NULL DEFAULT 0');
    this.ensureColumn('knowledge_cards', 'embedding_score', 'REAL NOT NULL DEFAULT 0');
    this.ftsReady = false;
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_cards_fts
        USING fts5(id UNINDEXED, game, title, content, tags);
      `);
      this.ftsReady = true;
    } catch {
      this.ftsReady = false;
    }
    if (this.replaceSeedEntries) {
      this.replaceKnowledgeEntries(this.seedEntries, this.seedVersion);
    } else {
      this.purgePollutedKnowledge();
      this.importEntries(this.seedEntries, this.seedVersion);
    }
  }

  ensureColumn(table, column, definition) {
    const exists = this.db.prepare(`PRAGMA table_info(${table})`).all()
      .some(item => item.name === column);
    if (!exists) this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }

  rebuildFts() {
    if (!this.ftsReady) return;
    try {
      this.db.prepare('DELETE FROM knowledge_cards_fts').run();
      const rows = this.db.prepare('SELECT * FROM knowledge_cards').all();
      for (const row of rows) {
        this.upsertFtsCard({
          id: row.id,
          game: row.game,
          title: row.title,
          content: row.content,
          tags: parseJson(row.tags_json, []).join(' '),
        });
      }
    } catch {
      this.ftsReady = false;
    }
  }

  purgePollutedKnowledge() {
    const deleteCard = this.db.prepare('DELETE FROM knowledge_cards WHERE id = ?');
    const deleteFts = this.ftsReady ? this.db.prepare('DELETE FROM knowledge_cards_fts WHERE id = ?') : null;
    const pollutedCards = this.db.prepare(`
      SELECT k.id, k.title, k.content, k.source_tier, s.url, s.title AS source_title, s.author,
        COALESCE(s.source_tier, k.source_tier, 'local') AS effective_tier
      FROM knowledge_cards k LEFT JOIN sources s ON s.id = k.source_id
    `).all()
      .filter(row => isPollutedText(`${row.title} ${row.content} ${row.url || ''} ${row.source_title || ''} ${row.author || ''}`)
        || (row.effective_tier === 'fallback' && isLowQualityFallbackSource(`${row.url || ''} ${row.title} ${row.content}`)))
      .map(row => row.id);
    for (const id of pollutedCards) {
      deleteCard.run(id);
      if (deleteFts) {
        try { deleteFts.run(id); } catch { this.ftsReady = false; }
      }
    }

    const pollutedSourceIds = this.db.prepare('SELECT id, url, title, author, source_tier FROM sources').all()
      .filter(row => isPollutedText(`${row.url} ${row.title} ${row.author}`)
        || (row.source_tier === 'fallback' && isLowQualityFallbackSource(`${row.url} ${row.title} ${row.author}`)))
      .map(row => row.id);
    for (const sourceId of pollutedSourceIds) {
      const rows = this.db.prepare('SELECT id FROM knowledge_cards WHERE source_id = ?').all(sourceId);
      for (const row of rows) {
        deleteCard.run(row.id);
        if (deleteFts) {
          try { deleteFts.run(row.id); } catch { this.ftsReady = false; }
        }
      }
      this.db.prepare('DELETE FROM sources WHERE id = ?').run(sourceId);
    }

    this.db.prepare('DELETE FROM search_cache WHERE expires_at <= ?').run(Date.now());
    for (const marker of ['wonderful-prompts', 'Google Ads', 'google-ads', '广告帮助', 'prompt']) {
      this.db.prepare('DELETE FROM search_cache WHERE payload_json LIKE ?').run(`%${marker}%`);
    }
    this.rebuildFts();
  }

  clearKnowledgeTables() {
    this.db.prepare('DELETE FROM knowledge_cards').run();
    this.db.prepare('DELETE FROM sources').run();
    this.db.prepare('DELETE FROM search_cache').run();
    if (this.ftsReady) {
      try {
        this.db.prepare('DELETE FROM knowledge_cards_fts').run();
      } catch {
        this.ftsReady = false;
      }
    }
  }

  replaceKnowledgeEntries(entries, version = '本地知识包') {
    this.clearKnowledgeTables();
    const imported = this.importEntries(entries, version);
    this.purgePollutedKnowledge();
    return imported;
  }

  upsertFtsCard(card) {
    if (!this.ftsReady) return;
    try {
      this.db.prepare('DELETE FROM knowledge_cards_fts WHERE id = ?').run(card.id);
      this.db.prepare('INSERT INTO knowledge_cards_fts (id, game, title, content, tags) VALUES (?, ?, ?, ?, ?)')
        .run(card.id, card.game, card.title, card.content, card.tags || '');
    } catch {
      this.ftsReady = false;
    }
  }

  ftsQuery(query, scene) {
    const sceneTerms = {
      team: '配队 阵容 队伍 循环 阵容推荐 topic_id topicDetail',
      event: '活动 限时活动 奖励 原石 格挡 挑战 试炼 勇锐魁杰试炼战记',
      gear: '装备 武器 圣遗物 遗器 词条',
      roster: '配队 阵容 循环',
      story: '剧情 防剧透 NPC',
      explore: '探索 地图 路线 解谜 卡点',
    };
    const raw = `${query} ${sceneTerms[scene] || ''}`;
    const terms = raw
      .split(/[\s，。！？、；：/|]+/)
      .map(term => term.replace(/["'*:()]/g, '').trim())
      .filter(term => term.length > 1)
      .concat(QUERY_HINTS.filter(term => raw.includes(term)))
      .filter((term, index, all) => all.indexOf(term) === index)
      .slice(0, 12);
    return terms.map(term => `"${term}"`).join(' OR ');
  }

  importEntries(entries, version = '本地知识包') {
    const insert = this.db.prepare(`
      INSERT INTO knowledge_cards
      (id, game, title, content, tags_json, source_id, version, confidence, updated_at,
       topic, character, scene, source_tier, semantic_score, embedding_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        game = excluded.game, title = excluded.title, content = excluded.content,
        tags_json = excluded.tags_json, source_id = excluded.source_id, version = excluded.version,
        confidence = excluded.confidence, updated_at = excluded.updated_at,
        topic = excluded.topic, character = excluded.character, scene = excluded.scene,
        source_tier = excluded.source_tier, semantic_score = excluded.semantic_score,
        embedding_score = excluded.embedding_score
    `);
    let imported = 0;
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (!entry?.title || !entry?.content) continue;
      const id = entry.id || crypto.createHash('sha1').update(`${entry.game || '通用'}|${entry.title}`).digest('hex');
      const gameKey = gameKeyFromLabel(entry.game);
      const sourceTier = entry.sourceTier || (entry.sourceUrl ? 'curated' : 'local');
      let sourceId = null;
      if (entry.sourceUrl) {
        sourceId = crypto.createHash('sha1').update(entry.sourceUrl).digest('hex');
        this.db.prepare(`
          INSERT INTO sources (id, url, title, author, kind, domain, version, fetched_at, status, metadata_json, source_tier)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', '{}', ?)
          ON CONFLICT(url) DO UPDATE SET title = excluded.title, author = excluded.author,
            kind = excluded.kind, version = excluded.version, fetched_at = excluded.fetched_at,
            status = 'ready', source_tier = excluded.source_tier
        `).run(
          sourceId,
          entry.sourceUrl,
          compactText(entry.sourceTitle || entry.title, 100),
          compactText(entry.author || authorFrom(entry.title, entry.sourceUrl), 80),
          entry.sourceType || 'community',
          domainOf(entry.sourceUrl),
          entry.sourceVersion || entry.version || version,
          Date.now(),
          sourceTier,
        );
      }
      insert.run(
        id,
        entry.game || '通用',
        compactText(entry.title, 100),
        compactText(entry.content, 1200),
        json(entry.tags || []),
        sourceId,
        version,
        Number(entry.confidence || 0.95),
        Date.now(),
        compactText(entry.topic || entry.title, 80),
        compactText(entry.character || '', 40),
        compactText(entry.scene || '', 30),
        sourceTier,
        Number(entry.semanticScore || 0),
        Number(entry.embeddingScore || 0),
      );
      this.upsertFtsCard({
        id,
        game: entry.game || '通用',
        title: compactText(entry.title, 100),
        content: compactText(entry.content, 1200),
        tags: [
          ...(Array.isArray(entry.tags) ? entry.tags : []),
          entry.topic,
          entry.character,
          entry.scene,
          gameKey,
        ].filter(Boolean).join(' '),
      });
      imported += 1;
    }
    return imported;
  }

  status() {
    const knowledgeEntries = this.db.prepare('SELECT COUNT(*) AS count FROM knowledge_cards').get().count;
    const accountCount = this.db.prepare('SELECT COUNT(*) AS count FROM accounts').get().count;
    const byGameRows = this.db.prepare(`
      SELECT game, COUNT(*) AS count
      FROM knowledge_cards
      GROUP BY game
      ORDER BY game
    `).all();
    const byTierRows = this.db.prepare(`
      SELECT source_tier AS tier, COUNT(*) AS count
      FROM knowledge_cards
      GROUP BY source_tier
      ORDER BY count DESC, tier
    `).all();
    const tierByGameRows = this.db.prepare(`
      SELECT game, source_tier AS tier, COUNT(*) AS count
      FROM knowledge_cards
      GROUP BY game, source_tier
      ORDER BY game, tier
    `).all();
    const partitions = byGameRows.map(row => ({
      game: row.game,
      count: row.count,
      tiers: tierByGameRows
        .filter(item => item.game === row.game)
        .reduce((result, item) => ({ ...result, [item.tier || 'local']: item.count }), {}),
    }));
    return {
      knowledgeEntries,
      accountCount,
      tavilyConfigured: Boolean(this.tavilyKey),
      partitions,
      sourceTiers: byTierRows.map(row => ({ tier: row.tier || 'local', count: row.count })),
    };
  }

  listAccounts() {
    const rows = this.db.prepare(`
      SELECT a.*, COUNT(c.id) AS character_count
      FROM accounts a LEFT JOIN characters c ON c.account_id = a.id
      GROUP BY a.id ORDER BY a.active DESC, a.synced_at DESC
    `).all();
    return rows.map(row => ({
      id: row.id,
      game: row.game,
      uid: row.uid,
      label: row.label,
      nickname: row.nickname,
      active: Boolean(row.active),
      characterCount: Number(row.character_count || 0),
      syncedAt: row.synced_at || undefined,
      error: row.error || undefined,
    }));
  }

  connectAccount(input) {
    const game = input.game === 'starrail' ? 'starrail' : 'genshin';
    const uid = String(input.uid || '').replace(/\D/g, '').slice(0, 12);
    if (uid.length < 6) throw new Error('请输入有效的游戏 UID');
    const existing = this.db.prepare('SELECT id FROM accounts WHERE game = ? AND uid = ?').get(game, uid);
    const id = existing?.id || nowId('account');
    this.db.prepare(`
      INSERT INTO accounts (id, game, uid, label, active)
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT(game, uid) DO UPDATE SET label = excluded.label, active = 1
    `).run(id, game, uid, compactText(input.label, 30) || GAME_LABELS[game]);
    return this.listAccounts().find(account => account.id === id);
  }

  removeAccount(accountId) {
    this.db.prepare('DELETE FROM character_snapshots WHERE account_id = ?').run(accountId);
    this.db.prepare('DELETE FROM characters WHERE account_id = ?').run(accountId);
    this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
  }

  async getGenshinCharacterNames() {
    if (this.genshinCharacterNames) return this.genshinCharacterNames;
    try {
      const [charactersResponse, localeResponse] = await Promise.all([
        this.fetchImpl(`${this.enkaStaticBaseUrl}/characters.json`),
        this.fetchImpl(`${this.enkaStaticBaseUrl}/loc.json`),
      ]);
      if (!charactersResponse.ok || !localeResponse.ok) throw new Error('结构化角色数据暂不可用');
      const [characters, locale] = await Promise.all([
        charactersResponse.text().then(JSON.parse),
        localeResponse.text().then(JSON.parse),
      ]);
      const chinese = locale['zh-cn'] || {};
      this.genshinCharacterNames = Object.fromEntries(Object.entries(characters).map(([id, item]) => [
        id,
        chinese[String(item.NameTextMapHash)] || '',
      ]).filter(([, name]) => name));
    } catch {
      this.genshinCharacterNames = {};
    }
    return this.genshinCharacterNames;
  }

  parseGenshin(account, payload, characterNames = {}) {
    const avatars = Array.isArray(payload.avatarInfoList) ? payload.avatarInfoList : [];
    return {
      nickname: payload.playerInfo?.nickname || '',
      characters: avatars.map(avatar => {
        const weapon = (avatar.equipList || []).find(item => item.weapon);
        const props = avatar.fightPropMap || {};
        return {
          characterId: String(avatar.avatarId),
          name: characterNames[String(avatar.avatarId)] || `角色 ${avatar.avatarId}`,
          level: Number(avatar.propMap?.['4001']?.ival || 0),
          rank: Array.isArray(avatar.talentIdList) ? avatar.talentIdList.length : 0,
          equipmentSummary: weapon ? `武器 ${weapon.itemId} · ${weapon.weapon.level || 0} 级` : '未公开武器',
          properties: {
            生命值: Math.round(Number(props['2000'] || 0)),
            攻击力: Math.round(Number(props['2001'] || 0)),
            防御力: Math.round(Number(props['2002'] || 0)),
            暴击率: Math.round(Number(props['20'] || 0) * 1000) / 10,
            暴击伤害: Math.round(Number(props['22'] || 0) * 1000) / 10,
            充能效率: Math.round(Number(props['23'] || 0) * 1000) / 10,
          },
        };
      }),
    };
  }

  parseStarrail(account, payload) {
    const detail = payload.detailInfo || payload;
    const avatars = detail.avatarDetailList || detail.avatarList || payload.avatarDetailList || [];
    return {
      nickname: detail.playerDetailInfo?.nickname || detail.nickname || '',
      characters: avatars.map(avatar => ({
        characterId: String(avatar.avatarId || avatar.id),
        name: avatar.name || `角色 ${avatar.avatarId || avatar.id}`,
        level: Number(avatar.level || avatar.avatarLevel || 0),
        rank: Number(avatar.rank || avatar.rankLevel || 0),
        equipmentSummary: avatar.equipment?.tid ? `光锥 ${avatar.equipment.tid} · ${avatar.equipment.level || 0} 级` : '未公开光锥',
        properties: avatar.properties || avatar.stats || {},
      })),
    };
  }

  async syncAccount(accountId) {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
    if (!row) throw new Error('找不到该游戏账号');
    const url = row.game === 'starrail'
      ? `${this.enkaBaseUrl}/hsr/uid/${row.uid}`
      : `${this.enkaBaseUrl}/uid/${row.uid}`;
    try {
      const response = await this.fetchImpl(url, { headers: { 'User-Agent': 'AetherGameCompanion/1.0' } });
      const text = await response.text();
      if (!response.ok) throw new Error(`Enka 返回 ${response.status}：${compactText(text, 120)}`);
      const payload = JSON.parse(text);
      const characterNames = row.game === 'genshin' ? await this.getGenshinCharacterNames() : {};
      const parsed = row.game === 'starrail' ? this.parseStarrail(row, payload) : this.parseGenshin(row, payload, characterNames);
      const observedAt = Date.now();
      const upsert = this.db.prepare(`
        INSERT INTO characters
        (id, account_id, game, character_id, name, level, rank, equipment_summary, properties_json, source, confidence, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enka', 1, ?)
        ON CONFLICT(account_id, character_id) DO UPDATE SET
          name = excluded.name, level = excluded.level, rank = excluded.rank,
          equipment_summary = excluded.equipment_summary, properties_json = excluded.properties_json,
          source = 'enka', confidence = 1, observed_at = excluded.observed_at
      `);
      const snapshot = this.db.prepare(`
        INSERT INTO character_snapshots
        (id, account_id, game, character_id, name, level, rank, equipment_summary, properties_json, source, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'enka', ?)
      `);
      for (const character of parsed.characters) {
        upsert.run(
          `${row.id}:${character.characterId}`, row.id, row.game, character.characterId,
          character.name, character.level, character.rank, character.equipmentSummary,
          json(character.properties), observedAt,
        );
        snapshot.run(
          nowId('snapshot'), row.id, row.game, character.characterId, character.name,
          character.level, character.rank, character.equipmentSummary, json(character.properties), observedAt,
        );
      }
      this.db.prepare('UPDATE accounts SET nickname = ?, synced_at = ?, error = ? WHERE id = ?')
        .run(parsed.nickname, observedAt, '', row.id);
      this.log('enka', row.uid, 'done', `同步 ${parsed.characters.length} 个公开角色`);
    } catch (error) {
      const message = friendlyAccountError(error);
      this.db.prepare('UPDATE accounts SET error = ? WHERE id = ?').run(message, row.id);
      this.log('enka', row.uid, 'error', message);
      throw new Error(message);
    }
    return this.listAccounts().find(account => account.id === row.id);
  }

  getAccountContext(game, visibleRoster = []) {
    const account = this.listAccounts().find(item => item.active && (!game || item.game === game));
    if (!account) return { characters: [], summary: '未连接公开游戏账号。' };
    const characters = this.db.prepare('SELECT * FROM characters WHERE account_id = ? ORDER BY level DESC, observed_at DESC LIMIT 20')
      .all(account.id)
      .map(row => ({
        id: row.id,
        accountId: row.account_id,
        game: row.game,
        characterId: row.character_id,
        name: row.name,
        level: row.level,
        rank: row.rank,
        equipmentSummary: row.equipment_summary,
        properties: parseJson(row.properties_json, {}),
        source: row.source,
        confidence: row.confidence,
        observedAt: row.observed_at,
      }));
    const summary = characters.length
      ? `${account.nickname || account.label} 的公开展示包含 ${characters.length} 个角色：${characters.slice(0, 8).map(item => `${item.name} ${item.level}级`).join('、')}。`
      : `${account.nickname || account.label} 已连接，但还没有同步到公开角色。`;
    const rosterNames = visibleRoster.map(normalizeCharacterName).filter(Boolean);
    const visibleRosterMatched = rosterNames.filter(name => characters.some(character => normalizeCharacterName(character.name) === name));
    const ownedCandidates = characters
      .filter(character => character.level >= 70)
      .map(character => character.name)
      .slice(0, 12);
    return { account, characters, summary, visibleRosterMatched, ownedCandidates };
  }

  searchLocal(query, game, scene, limit = 5) {
    const gameLabel = GAME_LABELS[game] || game || null;
    const rawQuery = `${query} ${scene || ''}`.toLowerCase();
    const directTerms = rawQuery.split(/[\s，。！？、；：/|]+/)
      .filter(term => term.length > 1)
      .concat(QUERY_HINTS.filter(term => rawQuery.includes(term)))
      .filter((term, index, all) => all.indexOf(term) === index);
    const compactEntity = value => String(value || '')
      .toLowerCase()
      .replace(/[\s·・:：|丨/\\\-()[\]{}"'`~!@#$%^&*_+=,，。！？；;]+/g, '');
    const scoreRow = row => {
      const tags = parseJson(row.tags_json || '[]', []);
      const haystack = `${row.game} ${row.title} ${row.content} ${row.tags_json || ''} ${row.topic || ''} ${row.character || ''} ${row.scene || ''}`.toLowerCase();
      const directScore = directTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 1.5 : 0), 0);
      const rawCompact = compactEntity(rawQuery);
      const entityTerms = [row.character, row.topic, row.title, ...tags]
        .map(compactEntity)
        .filter(term => term.length >= 2 && term.length <= 32);
      const entityBoost = entityTerms.some(term => rawCompact.includes(term) || (rawCompact.length >= 2 && term.includes(rawCompact)))
        ? 6
        : 0;
      const titleTermBoost = directTerms.reduce((sum, term) => {
        const compactTerm = compactEntity(term);
        return compactTerm && compactEntity(`${row.title || ''} ${row.character || ''} ${row.topic || ''}`).includes(compactTerm)
          ? sum + 2
          : sum;
      }, 0);
      const sceneBoost = row.scene && scene && row.scene === scene ? 2 : 0;
      return directScore
        + titleTermBoost
        + entityBoost
        + sceneBoost
        + sourceTierWeight(row.source_tier || row.sourceTier || 'local')
        + Number(row.confidence || 0)
        + Number(row.semantic_score || 0)
        + Number(row.embedding_score || 0);
    };
    const toHit = (row, score) => ({
      id: row.id,
      game: row.game,
      title: row.title,
      content: row.content,
      score,
      sourceUrl: row.source_url || undefined,
      sourceTitle: row.source_title || undefined,
      author: row.author || undefined,
      version: row.version,
      updatedAt: row.updated_at,
      sourceType: row.source_type || 'local',
      sourceTier: row.source_tier || 'local',
      topic: row.topic || undefined,
      character: row.character || undefined,
      scene: row.scene || undefined,
      semanticScore: Number(row.semantic_score || 0),
      embeddingScore: Number(row.embedding_score || 0),
    });
    if (this.ftsReady) {
      const matchQuery = this.ftsQuery(query, scene);
      if (matchQuery) {
        try {
          const rows = this.db.prepare(`
            SELECT k.*, s.url AS source_url, s.title AS source_title, s.author, s.kind AS source_type,
              COALESCE(s.source_tier, k.source_tier, 'local') AS source_tier,
              bm25(knowledge_cards_fts) AS bm25_score
            FROM knowledge_cards_fts
            JOIN knowledge_cards k ON k.id = knowledge_cards_fts.id
            LEFT JOIN sources s ON s.id = k.source_id
            WHERE knowledge_cards_fts MATCH ?
              AND (? IS NULL OR k.game = ? OR k.game = '通用')
            ORDER BY bm25_score ASC
            LIMIT ?
          `).all(matchQuery, gameLabel, gameLabel, limit);
          if (rows.length) {
            return rows
              .map(row => toHit(row, Math.max(1, 12 - Number(row.bm25_score || 0)) + scoreRow(row)))
              .sort((a, b) => b.score - a.score);
          }
        } catch {
          this.ftsReady = false;
        }
      }
    }
    const sceneTerms = {
      team: '配队 阵容 队伍 循环 阵容推荐 topic_id topicDetail',
      event: '活动 限时活动 奖励 原石 格挡 挑战 试炼 勇锐魁杰试炼战记',
      gear: '装备 武器 圣遗物 遗器 词条',
      roster: '配队 阵容 循环',
      story: '剧情 防剧透 NPC',
      explore: '探索 地图 路线 解谜 卡点',
    };
    const raw = `${query} ${sceneTerms[scene] || ''}`.toLowerCase();
    const rows = this.db.prepare(`
      SELECT k.*, s.url AS source_url, s.title AS source_title, s.author, s.kind AS source_type,
        COALESCE(s.source_tier, k.source_tier, 'local') AS source_tier
      FROM knowledge_cards k LEFT JOIN sources s ON s.id = k.source_id
      WHERE (? IS NULL OR k.game = ? OR k.game = '通用')
    `).all(gameLabel, gameLabel);
    return rows.map(row => {
      const haystack = `${row.game} ${row.title} ${row.content} ${row.tags_json}`.toLowerCase();
      const directScore = directTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 2 : 0), 0)
        + (raw.includes(String(row.title).toLowerCase()) ? 5 : 0);
      return toHit(row, directScore > 0 ? directScore + scoreRow(row) : 0);
    }).filter(item => item.score > 1).sort((a, b) => b.score - a.score).slice(0, limit);
  }

  cacheKey(query, game, scene, context = {}) {
    return crypto.createHash('sha256').update(`${game || ''}|${scene || ''}|${normalizeCharacterName(context.selectedCharacter || '')}|${query}`).digest('hex');
  }

  getSearchCache(key) {
    const row = this.db.prepare('SELECT * FROM search_cache WHERE query_key = ? AND expires_at > ?').get(key, Date.now());
    if (!row) return undefined;
    return { payload: parseJson(row.payload_json, {}), requestIds: parseJson(row.request_ids_json, []) };
  }

  putSearchCache(key, payload, requestIds) {
    this.db.prepare(`
      INSERT INTO search_cache (query_key, payload_json, request_ids_json, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(query_key) DO UPDATE SET payload_json = excluded.payload_json,
      request_ids_json = excluded.request_ids_json, expires_at = excluded.expires_at, created_at = excluded.created_at
    `).run(key, json(payload), json(requestIds), Date.now() + DAY_MS, Date.now());
  }

  async tavily(endpoint, body) {
    if (!this.tavilyKey) throw new Error('未配置 Tavily API key');
    const response = await this.fetchImpl(`${this.tavilyBaseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.tavilyKey}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Tavily ${endpoint} 返回 ${response.status}：${compactText(text, 160)}`);
    return JSON.parse(text);
  }

  guideQueries(query, game, scene, context = {}) {
    const selected = normalizeCharacterName(context.selectedCharacter || '');
    const aliases = characterAliases(selected);
    const base = [
      `${GAME_LABELS[game] || ''} ${query}`.trim(),
      englishQuery(query, game, scene),
    ];
    if (aliases.length && (scene === 'gear' || scene === 'roster' || /配队|阵容|养成|面板|毕业|build|team/i.test(query))) {
      base.push(`原神 ${aliases[0]} 配队 养成 毕业面板`);
      base.push(`${aliases.find(item => /^[A-Za-z]/.test(item)) || aliases[0]} build teams KQM`);
    }
    return [...new Set(base.filter(Boolean))];
  }

  sourceRelevance(result, context = {}, options = {}) {
    const url = result.url || '';
    const domain = domainOf(url);
    const text = `${result.title || ''} ${result.raw_content || ''} ${url}`;
    const game = context.game || inferGame(text);
    const gameAliases = GAME_ALIASES[game] || [];
    const preferredDomains = PREFERRED_GUIDE_DOMAINS[game] || TRUSTED_GUIDE_DOMAINS;
    if (/search\.bilibili\.com|\/search[/?#]/i.test(url)) {
      return { accepted: false, reason: '搜索结果页不进入知识库' };
    }
    if (isPollutedText(`${url} ${text}`)) {
      return { accepted: false, reason: '无关或低质量页面' };
    }
    const isPreferred = domainMatches(domain, preferredDomains);
    const isTrusted = domainMatches(domain, TRUSTED_GUIDE_DOMAINS);
    if (!isPreferred && options.allowFallback && isLowQualityFallbackSource(url)) {
      return { accepted: false, reason: '低质量社区或视频来源不进入兜底知识库' };
    }
    if (!isPreferred && !options.allowFallback) {
      return { accepted: false, reason: '非精选攻略来源' };
    }
    if (!isPreferred && options.allowFallback && !isTrusted && !includesAny(text, gameAliases)) {
      return { accepted: false, reason: '全网兜底未同时命中游戏名' };
    }
    if (!isPreferred && gameAliases.length && !includesAny(text, gameAliases)) {
      return { accepted: false, reason: '页面未命中当前游戏' };
    }
    const aliases = characterAliases(context.selectedCharacter);
    if (aliases.length && !aliases.some(alias => new RegExp(alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text))) {
      return { accepted: false, reason: '页面未命中当前角色' };
    }
    const sceneKeywords = guideKeywordsFor(context.scene);
    if ((context.scene === 'gear' || context.scene === 'roster') && !includesAny(text, sceneKeywords)) {
      return { accepted: false, reason: '页面不是养成或配队攻略' };
    }
    return { accepted: true, reason: '', sourceTier: isPreferred ? 'preferred' : 'fallback' };
  }

  evaluateExtract(result, context = {}, options = {}) {
    const url = result.url || '';
    const title = compactText(result.title, 120);
    const content = compactText(result.raw_content, 1800);
    const relevance = this.sourceRelevance({ ...result, title, raw_content: content }, context, options);
    if (!relevance.accepted) return relevance;
    if (/search\.bilibili\.com/i.test(url)) return { accepted: false, reason: '搜索结果页不进入知识库' };
    if (content.length < 260) return { accepted: false, reason: '正文信息不足' };
    if (/bilibili\.com\/video/i.test(url) && content.length < 700) return { accepted: false, reason: '视频页没有足够简介或字幕' };
    if (meaningfulChinese(content) === 0 && !/[A-Za-z]{30}/.test(content)) return { accepted: false, reason: '正文无法识别' };
    return { accepted: true, title, content, sourceTier: relevance.sourceTier };
  }

  saveWebCard(game, result, searchTitle, context = {}) {
    const url = result.url;
    const sourceId = crypto.createHash('sha1').update(url).digest('hex');
    const title = compactText(result.title || searchTitle || domainOf(url), 100);
    const gameKey = game || context.game || inferGame(`${title} ${result.raw_content}`) || '';
    const sourceTier = result.sourceTier || 'fallback';
    const content = makeGuideCardContent(result.raw_content, { ...context, game: gameKey });
    const sourceType = /reddit|bilibili|hoyolab/i.test(url) ? 'community' : 'web';
    const version = detectVersion(`${title} ${content}`);
    this.db.prepare(`
      INSERT INTO sources (id, url, title, author, kind, domain, version, fetched_at, status, metadata_json, source_tier)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ready', '{}', ?)
      ON CONFLICT(url) DO UPDATE SET title = excluded.title, author = excluded.author,
        version = excluded.version, fetched_at = excluded.fetched_at, status = 'ready',
        source_tier = excluded.source_tier
    `).run(sourceId, url, title, authorFrom(title, url), sourceType, domainOf(url), version, Date.now(), sourceTier);
    const cardId = crypto.createHash('sha1').update(`${gameKey}|${url}`).digest('hex');
    this.db.prepare(`
      INSERT INTO knowledge_cards
      (id, game, title, content, tags_json, source_id, version, confidence, updated_at,
       topic, character, scene, source_tier, semantic_score, embedding_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
      ON CONFLICT(game, title, source_id) DO UPDATE SET content = excluded.content,
      version = excluded.version, updated_at = excluded.updated_at, source_tier = excluded.source_tier
    `).run(
      cardId,
      GAME_LABELS[gameKey] || gameKey || '通用',
      title,
      content,
      json([context.scene, context.selectedCharacter, sourceTier].filter(Boolean)),
      sourceId,
      version,
      sourceTier === 'preferred' ? 0.88 : 0.66,
      Date.now(),
      compactText(searchTitle || title, 80),
      compactText(context.selectedCharacter || '', 40),
      compactText(context.scene || '', 30),
      sourceTier,
    );
    this.upsertFtsCard({
      id: cardId,
      game: GAME_LABELS[gameKey] || gameKey || '通用',
      title,
      content,
      tags: [context.scene, context.selectedCharacter, sourceTier].filter(Boolean).join(' '),
    });
    return {
      id: cardId,
      game: GAME_LABELS[gameKey] || gameKey || '通用',
      title,
      content,
      score: sourceTier === 'preferred' ? 6 : 3,
      sourceUrl: url,
      sourceTitle: title,
      author: authorFrom(title, url),
      version,
      updatedAt: Date.now(),
      sourceType,
      sourceTier,
      topic: searchTitle || title,
      character: context.selectedCharacter || undefined,
      scene: context.scene || undefined,
      semanticScore: 0,
      embeddingScore: 0,
    };
  }

  async searchWeb(query, game, scene, context = {}) {
    const key = this.cacheKey(query, game, scene, context);
    const cached = this.getSearchCache(key);
    if (cached) return { ...cached.payload, tavilyRequestIds: cached.requestIds, fromCache: true };
    const queries = this.guideQueries(query, game, scene, context);
    const requestIds = [];
    const runSearch = async allowFallback => {
      const searchPayloads = await Promise.all(queries.map(value => this.tavily('search', {
        query: value,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      })));
      requestIds.push(...searchPayloads.map(item => item.request_id).filter(Boolean));
      const candidates = [];
      for (const payload of searchPayloads) {
        for (const result of payload.results || []) {
          if (!candidates.some(item => item.url === result.url)) candidates.push(result);
        }
      }
      const candidateChecks = candidates.map(item => ({ item, relevance: this.sourceRelevance(item, { ...context, game, scene }, { allowFallback }) }));
      return {
        selected: candidateChecks
          .filter(({ relevance }) => relevance.accepted)
          .map(({ item, relevance }) => ({ ...item, sourceTier: relevance.sourceTier }))
          .slice(0, 5),
        filtered: candidateChecks
          .filter(({ relevance }) => !relevance.accepted)
          .map(({ item, relevance }) => ({ url: item.url || '', title: compactText(item.title, 100), reason: relevance.reason })),
      };
    };
    const preferred = await runSearch(false);
    let selected = preferred.selected;
    const searchFilteredSources = [...preferred.filtered];
    if (selected.length < 2) {
      const fallback = await runSearch(true);
      searchFilteredSources.push(...fallback.filtered);
      selected = [
        ...selected,
        ...fallback.selected.filter(item => !selected.some(existing => existing.url === item.url)),
      ].slice(0, 5);
    }
    const uniqueRequestIds = [...new Set(requestIds)];
    if (!selected.length) return { hits: [], citations: [], filteredSources: searchFilteredSources, tavilyRequestIds: requestIds, fromCache: false };
    const extraction = await this.tavily('extract', {
      urls: selected.map(item => item.url),
      query,
      chunks_per_source: 2,
      extract_depth: 'basic',
      format: 'text',
    });
    if (extraction.request_id && !uniqueRequestIds.includes(extraction.request_id)) uniqueRequestIds.push(extraction.request_id);
    const filteredSources = [...searchFilteredSources];
    const hits = [];
    const contentHashes = new Set();
    for (const extracted of extraction.results || []) {
      const search = selected.find(item => item.url === extracted.url) || {};
      const evaluated = this.evaluateExtract({ ...extracted, title: search.title }, { ...context, game, scene }, { allowFallback: search.sourceTier === 'fallback' });
      if (!evaluated.accepted) {
        filteredSources.push({ url: extracted.url, title: compactText(search.title, 100), reason: evaluated.reason });
        continue;
      }
      const contentHash = crypto.createHash('sha1').update(compactText(extracted.raw_content, 900)).digest('hex');
      if (contentHashes.has(contentHash)) {
        filteredSources.push({ url: extracted.url, title: compactText(search.title, 100), reason: '与已采用来源正文重复' });
        continue;
      }
      contentHashes.add(contentHash);
      hits.push(this.saveWebCard(game, { ...extracted, title: search.title, sourceTier: evaluated.sourceTier || search.sourceTier }, search.title, { ...context, game, scene }));
    }
    for (const failed of extraction.failed_results || []) {
      filteredSources.push({ url: failed.url || '', title: '', reason: failed.error || '网页提取失败' });
    }
    const citations = hits.map(item => ({
      id: item.id,
      title: item.sourceTitle || item.title,
      url: item.sourceUrl,
      author: item.author || '公开来源',
      version: item.version || '当前版本',
      updatedAt: item.updatedAt || Date.now(),
      sourceType: item.sourceType || 'web',
      sourceTier: item.sourceTier || 'fallback',
    }));
    const payload = { hits, citations, filteredSources };
    this.putSearchCache(key, payload, uniqueRequestIds);
    return { ...payload, tavilyRequestIds: uniqueRequestIds, fromCache: false };
  }

  async retrieve(input) {
    const game = input.game || inferGame(`${input.query} ${input.sourceName || ''}`);
    const context = {
      game,
      selectedCharacter: normalizeCharacterName(input.selectedCharacter || ''),
      visibleRoster: Array.isArray(input.visibleRoster) ? input.visibleRoster.map(normalizeCharacterName).filter(Boolean) : [],
      activeTeamCandidates: Array.isArray(input.activeTeamCandidates) ? input.activeTeamCandidates.map(normalizeCharacterName).filter(Boolean) : [],
      scene: input.scene,
    };
    const searchQuery = [
      input.query,
      context.selectedCharacter,
      ...context.visibleRoster.slice(0, 4),
      input.scene === 'roster' || input.scene === 'gear' ? '配队 养成 毕业面板' : '',
    ].filter(Boolean).join(' ');
    const localHits = this.searchLocal(searchQuery, game, input.scene, 5);
    const accountContext = this.getAccountContext(game, context.visibleRoster);
    const needsFreshWeb = input.allowWeb !== false
      && Boolean(this.tavilyKey)
      && (localHits.length < 2 || /当前|最新|版本|本期|今天|毕业面板|面板|配队攻略|养成攻略/.test(input.query || ''));
    let web = { hits: [], citations: [], filteredSources: [], tavilyRequestIds: [], fromCache: false };
    if (needsFreshWeb) web = await this.searchWeb(searchQuery, game, input.scene, context);
    const hits = [...localHits, ...web.hits].slice(0, 8);
    const localCitations = localHits.filter(item => item.sourceUrl).map(item => ({
      id: item.id,
      title: item.sourceTitle || item.title,
      url: item.sourceUrl,
      author: item.author || '公开来源',
      version: item.version || '当前版本',
      updatedAt: item.updatedAt || Date.now(),
      sourceType: item.sourceType || 'local',
      sourceTier: item.sourceTier || 'local',
    }));
    const retrievalSource = [
      ...(accountContext.account ? ['account'] : []),
      ...(localHits.length ? ['local'] : []),
      ...(web.hits.some(item => item.sourceType === 'community') ? ['community'] : []),
      ...(web.hits.some(item => item.sourceType === 'web') ? ['web'] : []),
    ];
    return {
      query: input.query,
      game,
      hits,
      citations: [...localCitations, ...web.citations].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index),
      filteredSources: web.filteredSources,
      retrievalSource: [...new Set(retrievalSource)],
      tavilyRequestIds: web.tavilyRequestIds,
      fromCache: web.fromCache,
      accountContext,
    };
  }

  log(kind, target, status, detail) {
    this.db.prepare('INSERT INTO sync_log (id, kind, target, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nowId('sync'), kind, target, status, compactText(detail, 500), Date.now());
  }

  close() {
    this.db.close();
  }
}

module.exports = {
  AetherKnowledgeService,
  compactText,
  inferGame,
  repairMojibake,
  detectVersion,
  friendlyAccountError,
};
