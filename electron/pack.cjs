const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const asar = require('@electron/asar');

const root = path.resolve(__dirname, '..');
const systemTemp = path.resolve(os.tmpdir());
const portfolioMode = process.argv.includes('--portfolio');
const releaseDir = path.join(root, portfolioMode ? 'release-portfolio' : 'release');
const builderCli = path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const sleep = duration => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, duration);
const safeRm = target => {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 4, retryDelay: 800 });
    return true;
  } catch (error) {
    console.warn(`暂时无法清理 ${target}：${error.code || error.message}`);
    return false;
  }
};
const copyWithRetry = (source, target) => {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      fs.copyFileSync(source, target);
      return;
    } catch (error) {
      lastError = error;
      if (!['EBUSY', 'EPERM'].includes(error.code) || attempt === 6) break;
      console.warn(`目标便携版暂时被占用，第 ${attempt} 次复制失败，1.5 秒后重试`);
      sleep(1500);
    }
  }
  throw lastError;
};

if (!releaseDir.startsWith(root + path.sep)) {
  throw new Error(`拒绝清理工作区外路径：${releaseDir}`);
}

fs.rmSync(releaseDir, { recursive: true, force: true, maxRetries: 4, retryDelay: 800 });

let tempRoot;
let result;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  tempRoot = path.join(systemTemp, `aether-electron-builder-output-${process.pid}-${attempt}`);
  if (!tempRoot.startsWith(systemTemp + path.sep)) {
    throw new Error(`拒绝清理系统临时目录外路径：${tempRoot}`);
  }
  safeRm(tempRoot);
  result = spawnSync(process.execPath, [
    builderCli,
    '--win',
    'portable',
    `--config.directories.output=${tempRoot}`,
  ], {
    cwd: root,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status === 0) break;
  safeRm(tempRoot);
  if (attempt < 3) {
    console.warn(`第 ${attempt} 次打包遇到 Windows 文件锁，5 秒后自动重试`);
    sleep(5000);
  }
}

if (result.status !== 0) process.exit(result.status || 1);

const asarFile = path.join(tempRoot, 'win-unpacked', 'resources', 'app.asar');
const packagedFiles = asar.listPackage(asarFile);
const forbidden = packagedFiles.filter(file => (
  /(^|\/)\.env($|\.)/i.test(file)
  || /-smoke\.cjs$/i.test(file)
  || /\/(?:launch|pack)\.cjs$/i.test(file)
  || /\.test\.cjs$/i.test(file)
));
if (forbidden.length) {
  throw new Error(`安装包包含不应发布的文件：${forbidden.join('、')}`);
}
console.log(`安装包安全检查通过：${packagedFiles.length} 个文件，未包含 .env、测试或烟测脚本`);

const portable = fs.readdirSync(tempRoot)
  .find(name => name.toLowerCase().endsWith('.exe'));
if (!portable) throw new Error('electron-builder 没有生成 Windows 便携版');

fs.mkdirSync(releaseDir, { recursive: true });
copyWithRetry(path.join(tempRoot, portable), path.join(releaseDir, portable));
for (const entry of fs.readdirSync(releaseDir)) {
  if (entry !== portable) safeRm(path.join(releaseDir, entry));
}
const envFile = path.join(root, '.env');
if (!portfolioMode && fs.existsSync(envFile)) {
  fs.copyFileSync(envFile, path.join(releaseDir, '.env'));
  console.log('本地 .env 已复制到 release 目录，便携版运行时将从同目录读取密钥。');
} else if (portfolioMode) {
  safeRm(path.join(releaseDir, '.env'));
  console.log('portfolio build 已跳过 .env，交付目录不包含本地密钥。');
}
safeRm(tempRoot);
console.log(`便携版已生成：${path.join(releaseDir, portable)}`);
