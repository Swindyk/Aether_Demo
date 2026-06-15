const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const outputDir = path.join(process.cwd(), 'design-assets', 'ui-smoke');
const userDataDir = path.join(outputDir, 'user-data');
fs.rmSync(userDataDir, { recursive: true, force: true });
fs.mkdirSync(userDataDir, { recursive: true });
app.setPath('userData', userDataDir);
process.env.AETHER_UI_SMOKE_DIR = outputDir;
require('./main.cjs');
