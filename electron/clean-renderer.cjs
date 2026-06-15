const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const target = path.resolve(root, 'dist', 'renderer');

if (!target.startsWith(`${root}${path.sep}`)) {
  throw new Error(`拒绝清理工作区外路径：${target}`);
}

function removeTreeStrict(directory) {
  if (!fs.existsSync(directory)) {
    return;
  }

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      removeTreeStrict(entryPath);
      fs.rmdirSync(entryPath);
      continue;
    }
    fs.unlinkSync(entryPath);
  }
}

removeTreeStrict(target);
if (fs.existsSync(target)) {
  fs.rmdirSync(target);
}

if (fs.existsSync(target)) {
  throw new Error(`renderer 构建目录未能彻底清理：${target}`);
}

console.log(`已彻底清理 renderer 构建目录：${target}`);
