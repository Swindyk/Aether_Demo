const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rendererDir = path.resolve(root, 'dist', 'renderer');
const assetsDir = path.resolve(rendererDir, 'assets');
const indexPath = path.resolve(rendererDir, 'index.html');

if (!rendererDir.startsWith(`${root}${path.sep}`) || !assetsDir.startsWith(`${rendererDir}${path.sep}`)) {
  throw new Error('拒绝清理工作区外的构建资源');
}

const html = fs.readFileSync(indexPath, 'utf8');
const referencedAssets = new Set(
  [...html.matchAll(/(?:src|href)=["']\.\/assets\/([^"'?#]+)(?:[?#][^"']*)?["']/g)]
    .map((match) => match[1]),
);

if (referencedAssets.size === 0) {
  throw new Error('index.html 未引用任何构建资源，拒绝继续打包');
}

for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
  if (!entry.isFile() || referencedAssets.has(entry.name)) {
    continue;
  }
  fs.unlinkSync(path.join(assetsDir, entry.name));
}

const remainingAssets = fs.readdirSync(assetsDir).sort();
const unexpectedAssets = remainingAssets.filter((name) => !referencedAssets.has(name));
const missingAssets = [...referencedAssets].filter((name) => !remainingAssets.includes(name));

if (unexpectedAssets.length > 0 || missingAssets.length > 0) {
  throw new Error(
    `renderer 资源校验失败；多余：${unexpectedAssets.join(', ') || '无'}；缺少：${missingAssets.join(', ') || '无'}`,
  );
}

console.log(`renderer 资源已校验，仅保留当前页面引用的 ${remainingAssets.length} 个文件`);
