const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AetherKnowledgeService } = require('./knowledge-service.cjs');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aether-rag-eval-'));
const dataset = JSON.parse(fs.readFileSync(path.join(__dirname, 'rag-eval-dataset.json'), 'utf8'));
const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge', 'game-knowledge.json'), 'utf8'));
const service = new AetherKnowledgeService({
  dbFile: path.join(root, 'eval.sqlite'),
  seedEntries: seed.entries,
});

try {
  const rows = dataset.map(item => {
    const hits = service.searchLocal(item.query, item.game, item.scene, 3);
    const hitIds = hits.map(hit => hit.id);
    const matched = item.expectedIds.some(id => hitIds.includes(id));
    return {
      id: item.id,
      query: item.query,
      expected: item.expectedIds,
      top3: hitIds,
      recallAt3: matched ? 1 : 0,
      knowledgeHit: hits.length ? 1 : 0,
      answerUsability: matched ? 1 : 0,
    };
  });
  const total = rows.length || 1;
  const mean = field => rows.reduce((sum, row) => sum + row[field], 0) / total;
  const report = {
    total,
    recallAt3: Number(mean('recallAt3').toFixed(3)),
    knowledgeHitRate: Number(mean('knowledgeHit').toFixed(3)),
    answerUsabilityProxy: Number(mean('answerUsability').toFixed(3)),
    failed: rows.filter(row => !row.recallAt3),
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.recallAt3 < 0.7) process.exitCode = 1;
} finally {
  service.close();
  fs.rmSync(root, { recursive: true, force: true });
}
