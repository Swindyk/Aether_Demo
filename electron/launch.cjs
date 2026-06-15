const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const electronPath = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const requestedTarget = process.argv.slice(2);
const smokeMode = requestedTarget[0] && /(^|[\\/])ui-smoke\.cjs$/i.test(requestedTarget[0]);
if (smokeMode) {
  env.AETHER_UI_SMOKE_DIR = path.join(process.cwd(), 'design-assets', 'ui-smoke');
  env.AETHER_UI_SMOKE_USER_DATA = path.join(env.AETHER_UI_SMOKE_DIR, 'user-data-runs', `run-${Date.now()}-${process.pid}`);
}

const target = (smokeMode ? ['.'] : requestedTarget).map((item, index) => {
  if (index !== 0 || /^-/.test(item)) return item;
  const resolved = path.resolve(process.cwd(), item);
  return fs.existsSync(resolved) ? resolved : item;
});
const child = spawn(electronPath, target.length ? target : ['.'], {
  cwd: process.cwd(),
  env,
  stdio: 'inherit',
  windowsHide: false,
});

child.on('exit', code => {
  process.exitCode = code ?? 0;
});

child.on('error', error => {
  console.error(`Electron 启动失败：${error.message}`);
  process.exitCode = 1;
});
