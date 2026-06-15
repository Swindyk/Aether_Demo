const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const GAME_DIRS = {
  genshin: '原神',
  starrail: '崩坏：星穹铁道',
  common: '通用',
};

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
};

const compactText = (value, limit = 1600) => String(value || '')
  .replace(/\r\n/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim()
  .slice(0, limit);

const stripQuotes = value => String(value || '').trim().replace(/^["']|["']$/g, '');

const parseValue = value => {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\[.*\]$/.test(text)) {
    return text.slice(1, -1)
      .split(',')
      .map(item => stripQuotes(item))
      .filter(Boolean);
  }
  if (/^(true|false)$/i.test(text)) return /^true$/i.test(text);
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return stripQuotes(text);
};

const parseFrontMatter = text => {
  const match = String(text || '').match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return undefined;
  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#') || !clean.includes(':')) continue;
    const index = clean.indexOf(':');
    metadata[clean.slice(0, index).trim()] = parseValue(clean.slice(index + 1));
  }
  return { metadata, body: match[2] || '' };
};

const defaultGameFromPath = file => {
  const parts = path.normalize(file).split(path.sep).map(part => part.toLowerCase());
  const key = Object.keys(GAME_DIRS).find(item => parts.includes(item));
  return key ? GAME_DIRS[key] : '通用';
};

const normalizeCard = (card, fallback = {}) => {
  const content = compactText(card.content || fallback.content || '', 1800);
  const title = compactText(card.title || fallback.title || '', 120);
  if (!title || !content) return undefined;
  const game = card.game || fallback.game || '通用';
  const id = card.id || crypto.createHash('sha1').update(`${game}|${title}|${content}`).digest('hex');
  return {
    id,
    game,
    topic: card.topic || title,
    character: card.character || '',
    scene: card.scene || fallback.scene || 'unknown',
    title,
    tags: Array.isArray(card.tags) ? card.tags : [],
    content,
    sourceUrl: card.sourceUrl || '',
    sourceTitle: card.sourceTitle || card.title || title,
    author: card.author || '',
    sourceType: card.sourceType || (card.sourceUrl ? 'community' : 'local'),
    sourceTier: card.sourceTier || fallback.sourceTier || (card.sourceUrl ? 'curated' : 'local'),
    version: card.version || fallback.version || '当前版本',
    updatedAt: card.updatedAt || fallback.updatedAt,
    confidence: Number(card.confidence || fallback.confidence || 0.95),
    semanticScore: Number(card.semanticScore || 0),
    embeddingScore: Number(card.embeddingScore || 0),
  };
};

const loadMarkdownCards = file => {
  const parsed = parseFrontMatter(fs.readFileSync(file, 'utf8'));
  if (!parsed) return [];
  const fallback = {
    game: defaultGameFromPath(file),
    title: path.basename(file, path.extname(file)).replace(/[-_]+/g, ' '),
    content: parsed.body,
  };
  const card = normalizeCard({ ...parsed.metadata, content: parsed.metadata.content || parsed.body }, fallback);
  return card ? [card] : [];
};

const loadTextCards = file => {
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const titleLine = lines.find(line => line.startsWith('# '));
  const title = titleLine ? titleLine.replace(/^#\s+/, '') : path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ');
  const content = raw.replace(/^#\s+.*$/m, '').trim();
  const card = normalizeCard({ title, content, sourceTier: 'local' }, { game: defaultGameFromPath(file) });
  return card ? [card] : [];
};

const normalizePack = (raw, fallback = {}) => {
  if (Array.isArray(raw)) {
    return {
      version: fallback.version || `local-import-${new Date().toISOString().slice(0, 10)}`,
      updatedAt: fallback.updatedAt || new Date().toISOString(),
      entries: raw.map(entry => normalizeCard(entry, fallback)).filter(Boolean),
    };
  }
  if (raw && Array.isArray(raw.entries)) {
    return {
      version: raw.version || fallback.version || `local-import-${new Date().toISOString().slice(0, 10)}`,
      updatedAt: raw.updatedAt || fallback.updatedAt || new Date().toISOString(),
      entries: raw.entries.map(entry => normalizeCard(entry, fallback)).filter(Boolean),
    };
  }
  const card = normalizeCard(raw || {}, fallback);
  return {
    version: fallback.version || raw?.version || `local-import-${new Date().toISOString().slice(0, 10)}`,
    updatedAt: fallback.updatedAt || raw?.updatedAt || new Date().toISOString(),
    entries: card ? [card] : [],
  };
};

const loadJsonCards = file => {
  const raw = readJson(file, undefined);
  if (!raw) return [];
  return normalizePack(raw, { game: defaultGameFromPath(file) }).entries;
};

const loadKnowledgeFile = file => {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.md') {
    const entries = loadMarkdownCards(file);
    return normalizePack(entries);
  }
  if (ext === '.txt') {
    const entries = loadTextCards(file);
    return normalizePack(entries);
  }
  const raw = readJson(file, undefined);
  if (!raw) throw new Error('知识包格式无效，无法读取文件');
  return normalizePack(raw, { game: defaultGameFromPath(file) });
};

const compileKnowledgeCorpus = corpusDir => {
  if (!fs.existsSync(corpusDir)) return { entries: [], files: [] };
  const files = [];
  const entries = [];
  const visit = dir => {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, item.name);
      if (item.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.(json|md|txt)$/i.test(item.name)) continue;
      if (/readme/i.test(item.name)) continue;
      files.push(full);
      const ext = path.extname(full).toLowerCase();
      const next = ext === '.md' ? loadMarkdownCards(full)
        : ext === '.txt' ? loadTextCards(full)
          : loadJsonCards(full);
      entries.push(...next);
    }
  };
  visit(corpusDir);
  return { entries, files };
};

const mergeEntries = (...groups) => {
  const map = new Map();
  for (const group of groups) {
    for (const entry of group || []) {
      if (!entry?.id) continue;
      map.set(entry.id, entry);
    }
  }
  return [...map.values()];
};

const loadBundledKnowledgePack = bundledDir => {
  const bundledPath = path.join(bundledDir, 'knowledge', 'game-knowledge.json');
  const corpusDir = path.join(bundledDir, 'knowledge', 'corpus');
  const canonical = normalizePack(readJson(bundledPath, { version: '空知识库', entries: [] }));
  const corpus = compileKnowledgeCorpus(corpusDir);
  const entries = mergeEntries(canonical.entries, corpus.entries);
  return {
    version: canonical.version,
    updatedAt: canonical.updatedAt,
    entries,
    bundledPath,
    corpusDir,
    corpusFiles: corpus.files,
    corpusEntries: corpus.entries.length,
  };
};

const stableEntries = pack => (Array.isArray(pack?.entries) ? pack.entries : [])
  .map(entry => ({
    id: entry.id,
    game: entry.game,
    title: entry.title,
    content: entry.content,
    sourceUrl: entry.sourceUrl || '',
    sourceTier: entry.sourceTier || '',
    version: entry.version || '',
  }))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const knowledgeHash = pack => crypto
  .createHash('sha256')
  .update(JSON.stringify({ version: pack?.version || '', entries: stableEntries(pack) }))
  .digest('hex');

const portablePack = pack => ({
  version: pack?.version || '未知',
  updatedAt: pack?.updatedAt || new Date().toISOString(),
  entries: Array.isArray(pack?.entries) ? pack.entries : [],
});

const versionDate = value => {
  const match = String(value || '').match(/(\d{4})[.-](\d{2})[.-](\d{2})/);
  if (!match) return 0;
  return Number(`${match[1]}${match[2]}${match[3]}`);
};

const shouldSyncRuntimePack = (runtimePack, bundledPack) => {
  if (!runtimePack || !Array.isArray(runtimePack.entries)) return { sync: true, reason: 'missing-runtime-pack' };
  const runtimeDate = versionDate(runtimePack.version);
  const bundledDate = versionDate(bundledPack.version);
  if (bundledDate && runtimeDate && bundledDate > runtimeDate) return { sync: true, reason: 'bundled-version-newer' };
  if (bundledDate && runtimeDate && bundledDate === runtimeDate && knowledgeHash(runtimePack) !== knowledgeHash(bundledPack)) {
    return { sync: true, reason: 'same-date-content-different' };
  }
  if ((runtimePack.version || '') === (bundledPack.version || '') && knowledgeHash(runtimePack) !== knowledgeHash(bundledPack)) {
    return { sync: true, reason: 'same-version-content-different' };
  }
  return { sync: false, reason: runtimeDate > bundledDate ? 'runtime-version-newer' : 'runtime-pack-current' };
};

const syncRuntimeKnowledgePack = ({ bundledDir, runtimeFile }) => {
  const bundled = loadBundledKnowledgePack(bundledDir);
  const runtime = fs.existsSync(runtimeFile) ? normalizePack(readJson(runtimeFile, { entries: [] })) : undefined;
  const decision = shouldSyncRuntimePack(runtime, bundled);
  if (decision.sync) writeJson(runtimeFile, portablePack(bundled));
  const current = decision.sync ? portablePack(bundled) : (runtime || portablePack(bundled));
  return {
    pack: current,
    updated: decision.sync,
    reason: decision.reason,
    runtimeVersionBefore: runtime?.version || '',
    runtimeVersion: current.version,
    bundledVersion: bundled.version,
    runtimeHash: knowledgeHash(current),
    bundledHash: knowledgeHash(bundled),
    runtimePath: runtimeFile,
    bundledPath: bundled.bundledPath,
    corpusDir: bundled.corpusDir,
    corpusFiles: bundled.corpusFiles,
    corpusEntries: bundled.corpusEntries,
    syncedAt: new Date().toISOString(),
  };
};

module.exports = {
  compileKnowledgeCorpus,
  knowledgeHash,
  loadBundledKnowledgePack,
  loadKnowledgeFile,
  normalizePack,
  shouldSyncRuntimePack,
  syncRuntimeKnowledgePack,
};
