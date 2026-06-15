const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  compileKnowledgeCorpus,
  loadKnowledgeFile,
  shouldSyncRuntimePack,
  syncRuntimeKnowledgePack,
} = require('./knowledge-pack.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-knowledge-pack-test-'));

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
};

test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

test('运行目录旧知识包会同步到内置新版', () => {
  const bundledDir = path.join(root, 'app');
  const runtimeFile = path.join(root, 'userData', 'knowledge', 'game-knowledge.json');
  write(path.join(bundledDir, 'knowledge', 'game-knowledge.json'), JSON.stringify({
    version: '2026.06.15-curated-rag',
    updatedAt: '2026-06-15T00:00:00.000Z',
    entries: [{ id: 'new', game: '原神', title: '新版卡', content: '新版知识内容', sourceTier: 'curated' }],
  }));
  write(runtimeFile, JSON.stringify({
    version: '2026.06.12',
    updatedAt: '2026-06-12T00:00:00.000Z',
    entries: [{ id: 'old', game: '原神', title: '旧版卡', content: '旧版知识内容' }],
  }));
  const result = syncRuntimeKnowledgePack({ bundledDir, runtimeFile });
  assert.equal(result.updated, true);
  assert.equal(result.reason, 'bundled-version-newer');
  assert.equal(result.pack.version, '2026.06.15-curated-rag');
  const written = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
  assert.equal(written.entries[0].id, 'new');
  assert.equal(written.bundledPath, undefined);
});

test('自定义更新版本不会被旧内置包覆盖', () => {
  assert.deepEqual(shouldSyncRuntimePack(
    { version: '2026.06.16-custom', entries: [{ id: 'custom', game: '原神', title: '自定义', content: '自定义内容' }] },
    { version: '2026.06.15-curated-rag', entries: [{ id: 'bundled', game: '原神', title: '内置', content: '内置内容' }] },
  ), { sync: false, reason: 'runtime-version-newer' });
});

test('同日期内置语料内容变化也会触发同步', () => {
  assert.deepEqual(shouldSyncRuntimePack(
    { version: '2026.06.15-curated-rag', entries: [{ id: 'old', game: '原神', title: '旧语料', content: '旧内容' }] },
    { version: '2026.06.15-curated-rag-biligame', entries: [{ id: 'new', game: '原神', title: '新语料', content: '新内容' }] },
  ), { sync: true, reason: 'same-date-content-different' });
});

test('corpus 支持按游戏目录读取 Markdown、JSON 和 TXT 语料', () => {
  const corpusDir = path.join(root, 'corpus');
  write(path.join(corpusDir, 'genshin', 'kqm.md'), `---
id: md-card
title: Markdown 卡
scene: gear
tags: [原神, 配队]
sourceTier: curated
---
原神 Markdown 语料内容。
`);
  write(path.join(corpusDir, 'starrail', 'cards.json'), JSON.stringify([
    { id: 'json-card', title: 'JSON 卡', content: '星铁 JSON 语料内容。', sourceTier: 'curated' },
  ]));
  write(path.join(corpusDir, 'common', 'note.txt'), '# TXT 卡\n通用 TXT 语料内容。');
  const result = compileKnowledgeCorpus(corpusDir);
  assert.equal(result.entries.length, 3);
  assert.equal(result.entries.find(item => item.id === 'md-card').game, '原神');
  assert.equal(result.entries.find(item => item.id === 'json-card').game, '崩坏：星穹铁道');
  assert.equal(result.entries.find(item => item.title === 'TXT 卡').game, '通用');
});

test('单个 Markdown 语料卡可以作为导入知识包', () => {
  const file = path.join(root, 'single.md');
  write(file, `---
id: single-md
game: 原神
title: 单卡导入
sourceTier: local
---
这是单个 Markdown 知识卡。
`);
  const pack = loadKnowledgeFile(file);
  assert.equal(pack.entries.length, 1);
  assert.equal(pack.entries[0].id, 'single-md');
  assert.equal(pack.entries[0].game, '原神');
});
