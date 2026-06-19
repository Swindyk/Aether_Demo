const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
} = require('electron');
const { AetherAgentRuntime } = require('./agent-runtime.cjs');
const { AetherKnowledgeService } = require('./knowledge-service.cjs');
const { syncRuntimeKnowledgePack } = require('./knowledge-pack.cjs');
const { answerCardBounds, findDisplaySource, selectCaptureSource } = require('./assistant-window.cjs');
const { DEFAULT_LOCAL_MODEL, resolveModelConfig } = require('./model-config.cjs');

const DEV_URL = 'http://127.0.0.1:3000';
const MODEL_ID = DEFAULT_LOCAL_MODEL;
const SETTINGS_VERSION = 8;
const DEMO_SCENES = [
  { id: 'demo:gear', scene: 'gear', name: '原神 · 装备搭配', file: 'genshin-weapon.png' },
  { id: 'demo:roster', scene: 'roster', name: '原神 · 队伍配置', file: 'genshin-roster.png' },
  { id: 'demo:story', scene: 'story', name: '星穹铁道 · 剧情回顾', file: 'hsr-story.png' },
  { id: 'demo:explore', scene: 'explore', name: '星穹铁道 · 探索指引', file: 'hsr-explore.png' },
];
const DEFAULT_SCAN_PROMPT = '请看懂当前画面，告诉我最值得注意的可见信息，并给出两步以内的下一步建议。';
const SCAN_PROMPTS = {
  gear: '帮我判断当前装备值不值得换，直接给结论和下一步。',
  roster: '帮我看这套队伍能不能打，指出最大问题和调整建议。',
  story: '帮我解释当前剧情人物和线索，不要剧透后续内容。',
  explore: '我卡点了，帮我根据当前画面找下一步线索。',
};

let controlWindow;
let answerWindow;
let agentOpsWindow;
let tray;
let runtime;
let knowledgeService;
let settings;
let settingsFile;
let quitting = false;
let assistantRunning = false;
let answerHideTimer;
let lastCaptureDisplayId;
let currentConversationId;
let currentAccountKey = 'local:default';
let assistantStatus = {
  state: 'idle',
  message: '等待中',
  shortcutReady: false,
  updatedAt: Date.now(),
};

const ANSWER_SIZE = { width: 420, height: 240 };
if (process.env.AETHER_UI_SMOKE_DIR) {
  const smokeOutputDir = path.resolve(process.env.AETHER_UI_SMOKE_DIR);
  const smokeUserData = process.env.AETHER_UI_SMOKE_USER_DATA
    ? path.resolve(process.env.AETHER_UI_SMOKE_USER_DATA)
    : path.join(smokeOutputDir, 'user-data-runs', `run-${Date.now()}-${process.pid}`);
  fs.mkdirSync(smokeOutputDir, { recursive: true });
  fs.writeFileSync(path.join(smokeOutputDir, 'main-entry.json'), JSON.stringify({
    pid: process.pid,
    enteredAt: new Date().toISOString(),
    argv: process.argv,
    userData: smokeUserData,
  }, null, 2), 'utf8');
  fs.mkdirSync(smokeUserData, { recursive: true });
  app.setPath('userData', smokeUserData);
}

const hasSingleInstanceLock = process.env.AETHER_UI_SMOKE_DIR ? true : app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu-compositing');

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

const safeRemove = target => {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 250 });
  } catch {
    // Cache cleanup failures should not block startup.
  }
};

const clearRendererCaches = userData => {
  [
    'Cache',
    'Code Cache',
    'GPUCache',
    'DawnGraphiteCache',
    'DawnWebGPUCache',
    'blob_storage',
    'Session Storage',
    'Shared Dictionary',
  ].forEach(name => safeRemove(path.join(userData, name)));
};

const readEnv = file => {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((result, line) => {
    const clean = line.replace(/^\uFEFF/, '').trim();
    if (!clean || clean.startsWith('#') || !clean.includes('=')) return result;
    const index = clean.indexOf('=');
    result[clean.slice(0, index).trim()] = clean.slice(index + 1).trim().replace(/^["']|["']$/g, '');
    return result;
  }, {});
};

const uniqueExistingEnvFiles = userData => {
  const envNames = ['.env', '.env.local'];
  const dirs = [
    app.getAppPath(),
    process.resourcesPath,
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(__dirname, '..'),
    path.dirname(app.getPath('exe')),
    path.dirname(process.argv[0] || ''),
    process.env.PORTABLE_EXECUTABLE_DIR,
    process.env.PORTABLE_EXECUTABLE_FILE ? path.dirname(process.env.PORTABLE_EXECUTABLE_FILE) : '',
    userData,
  ].filter(Boolean);

  const seen = new Set();
  return dirs
    .flatMap(dir => envNames.map(name => path.resolve(dir, name)))
    .filter(file => {
      const key = file.toLowerCase();
      if (seen.has(key) || !fs.existsSync(file)) return false;
      seen.add(key);
      return true;
    });
};

const loadEnv = userData => {
  const files = uniqueExistingEnvFiles(userData);
  const fileEnv = files.reduce((result, file) => ({ ...result, ...readEnv(file) }), {});
  const env = { ...fileEnv, ...process.env };
  return { env, files };
};

const rendererFile = () => path.join(app.isPackaged ? app.getAppPath() : path.join(__dirname, '..'), 'dist', 'renderer', 'index.html');

const demoFile = file => app.isPackaged
  ? path.join(app.getAppPath(), 'dist', 'renderer', 'demo', file)
  : path.join(app.getAppPath(), 'public', 'demo', file);

const brandFile = file => app.isPackaged
  ? path.join(app.getAppPath(), 'dist', 'renderer', 'brand', file)
  : path.join(app.getAppPath(), 'public', 'brand', file);

const loadRole = (window, role) => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (app.isPackaged || process.env.AETHER_UI_SMOKE_DIR) {
    return window.loadFile(rendererFile(), { query: { window: role } });
  }
  return window.loadURL(`${DEV_URL}/?window=${role}`);
};

const commonWebPreferences = () => ({
  preload: path.join(__dirname, 'preload.cjs'),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
});

const guardWindowLoad = (window, label) => {
  window.webContents.on('did-fail-load', (_event, code, description) => {
    if (code === -3) return;
    dialog.showErrorBox(`${label}加载失败`, `${description}（${code}）`);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    dialog.showErrorBox(`${label}异常退出`, `渲染进程已退出：${details.reason}`);
  });
};

const createControlWindow = () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.show();
    controlWindow.focus();
    return controlWindow;
  }
  controlWindow = new BrowserWindow({
    title: '以太 AI 游戏伴侣',
    autoHideMenuBar: true,
    width: 1320,
    height: 900,
    minWidth: 1060,
    minHeight: 720,
    backgroundColor: '#06080b',
    show: false,
    webPreferences: commonWebPreferences(),
  });
  guardWindowLoad(controlWindow, '以太主界面');
  controlWindow.once('ready-to-show', () => {
    if (!controlWindow || controlWindow.isDestroyed()) return;
    controlWindow.show();
    controlWindow.focus();
  });
  loadRole(controlWindow, 'control');
  controlWindow.on('close', event => {
    if (!quitting) {
      event.preventDefault();
      controlWindow.hide();
    }
  });
  return controlWindow;
};

const answerDisplay = () => {
  const saved = screen.getAllDisplays().find(display => display.id === lastCaptureDisplayId);
  return saved || screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay();
};

const positionAnswerWindow = () => {
  if (!answerWindow || answerWindow.isDestroyed()) return;
  answerWindow.setBounds(answerCardBounds(answerDisplay().workArea, ANSWER_SIZE), false);
};

const createAnswerWindow = () => {
  if (answerWindow && !answerWindow.isDestroyed()) return answerWindow;
  answerWindow = new BrowserWindow({
    title: '以太刚刚看懂',
    autoHideMenuBar: true,
    ...answerCardBounds(answerDisplay().workArea, ANSWER_SIZE),
    minWidth: ANSWER_SIZE.width,
    minHeight: ANSWER_SIZE.height,
    maxWidth: ANSWER_SIZE.width,
    maxHeight: ANSWER_SIZE.height,
    backgroundColor: '#071018',
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    focusable: false,
    show: false,
    webPreferences: commonWebPreferences(),
  });
  answerWindow.setAlwaysOnTop(true, 'floating');
  answerWindow.setIgnoreMouseEvents(true);
  guardWindowLoad(answerWindow, '以太短答案卡');
  loadRole(answerWindow, 'answer');
  answerWindow.on('closed', () => {
    answerWindow = undefined;
  });
  return answerWindow;
};

const showAnswerCard = () => {
  clearTimeout(answerHideTimer);
  const window = createAnswerWindow();
  positionAnswerWindow();
  if (window.webContents.isLoading()) {
    window.once('ready-to-show', () => window.showInactive());
  } else {
    window.showInactive();
  }
  answerHideTimer = setTimeout(() => answerWindow?.hide(), 8000);
};

const showControlWindow = () => {
  const window = createControlWindow();
  if (!window.webContents.isLoading()) {
    window.show();
    window.focus();
  }
};

const createAgentOpsWindow = () => {
  if (agentOpsWindow && !agentOpsWindow.isDestroyed()) {
    agentOpsWindow.show();
    agentOpsWindow.focus();
    return;
  }
  agentOpsWindow = new BrowserWindow({
    title: '以太后台',
    autoHideMenuBar: true,
    width: 1440,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: '#06080b',
    webPreferences: commonWebPreferences(),
  });
  loadRole(agentOpsWindow, 'agentops');
  agentOpsWindow.on('closed', () => {
    agentOpsWindow = undefined;
  });
};

const restoreAssistantAfterCapture = visibility => {
  if (visibility.control) controlWindow?.showInactive();
  if (visibility.answer) answerWindow?.showInactive();
  if (visibility.agentOps) agentOpsWindow?.showInactive();
};

const hideAssistantForCapture = async () => {
  const delayMs = 520;
  const visibility = {
    control: Boolean(controlWindow?.isVisible()),
    answer: Boolean(answerWindow?.isVisible()),
    agentOps: Boolean(agentOpsWindow?.isVisible()),
    delayMs,
  };
  answerWindow?.hide();
  controlWindow?.hide();
  agentOpsWindow?.hide();
  if (visibility.control || visibility.answer || visibility.agentOps) await delay(delayMs);
  return visibility;
};

const delay = duration => new Promise(resolve => setTimeout(resolve, duration));

const saveWindowCapture = async (window, file) => {
  window.show();
  window.focus();
  await delay(500);
  const [width, height] = window.getSize();
  const mediaSourceId = window.getMediaSourceId();
  const title = window.getTitle();
  const sources = await desktopCapturer.getSources({
    types: ['window'],
    fetchWindowIcons: false,
    thumbnailSize: { width, height },
  });
  const source = sources.find(item => item.id === mediaSourceId);
  if (!source || source.thumbnail.isEmpty()) throw new Error(`无法捕获窗口：${title}`);
  fs.writeFileSync(file, source.thumbnail.toPNG());
};

const runUiSmoke = async outputDir => {
  fs.mkdirSync(outputDir, { recursive: true });
  await delay(1800);
  const startupState = {
    controlVisible: Boolean(controlWindow?.isVisible()),
    answerVisible: Boolean(answerWindow?.isVisible()),
    agentOpsVisible: Boolean(agentOpsWindow?.isVisible()),
    trayReady: Boolean(tray && !tray.isDestroyed()),
    shortcutReady: assistantStatus.shortcutReady,
  };
  writeJson(path.join(outputDir, 'startup-state.json'), startupState);
  if (!startupState.controlVisible || startupState.answerVisible || startupState.agentOpsVisible || !startupState.trayReady) {
    throw new Error(`启动窗口不符合主界面加系统托盘的约束：${JSON.stringify(startupState)}`);
  }
  console.log('UI 冒烟：截取玩家主界面');
  await saveWindowCapture(controlWindow, path.join(outputDir, 'player-home.png'));
  setAssistantStatus('ready', '回答已准备');
  createAnswerWindow();
  showAnswerCard();
  await delay(900);
  const answerState = {
    visible: answerWindow.isVisible(),
    size: answerWindow.getSize(),
    resizable: answerWindow.isResizable(),
    maximizable: answerWindow.isMaximizable(),
    fullscreenable: answerWindow.isFullScreenable(),
    focusable: answerWindow.isFocusable(),
  };
  writeJson(path.join(outputDir, 'answer-window-state.json'), answerState);
  if (!answerState.visible || answerState.resizable || answerState.maximizable || answerState.fullscreenable || answerState.focusable) {
    throw new Error(`短答案卡能力不符合约束：${JSON.stringify(answerState)}`);
  }
  await saveWindowCapture(answerWindow, path.join(outputDir, 'answer-card.png'));
  console.log(`UI 冒烟截图已写入：${outputDir}`);
  quitting = true;
  clearTimeout(answerHideTimer);
  knowledgeService?.close();
  globalShortcut.unregisterAll();
  app.exit(0);
  setTimeout(() => process.exit(0), 250).unref();
};

const broadcast = (channel, payload) => {
  [controlWindow, answerWindow, agentOpsWindow].forEach(window => {
    if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
  });
};

const setAssistantStatus = (state, message, extra = {}) => {
  assistantStatus = {
    ...assistantStatus,
    ...extra,
    state,
    message,
    updatedAt: Date.now(),
  };
  broadcast('assistant:status-changed', assistantStatus);
  refreshTrayMenu();
  return assistantStatus;
};

const trayStatusLabel = () => ({
  idle: '状态：等待解读',
  capturing: '状态：正在捕获画面',
  analyzing: '状态：正在分析',
  ready: '状态：回答已准备',
  error: '状态：上次分析失败',
}[assistantStatus.state] || '状态：等待解读');

const refreshTrayMenu = () => {
  if (!tray || tray.isDestroyed()) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '解读当前画面  Alt+Q', enabled: !assistantRunning, click: () => void runQuickScan() },
    { label: '查看最近回答  Alt+Shift+Q', click: () => showLatestAnswer() },
    { type: 'separator' },
    { label: '打开以太', click: () => showControlWindow() },
    { label: '打开后台', click: () => createAgentOpsWindow() },
    { label: trayStatusLabel(), enabled: false },
    { label: `模型：${runtime?.status().model || MODEL_ID}`, enabled: false },
    { type: 'separator' },
    {
      label: '退出以太',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]));
};

const createTray = () => {
  if (tray && !tray.isDestroyed()) return tray;
  const icon = nativeImage.createFromPath(brandFile('aether-avatar.png')).resize({ width: 32, height: 32 });
  tray = new Tray(icon);
  tray.setToolTip('以太 AI 游戏伴侣');
  tray.on('double-click', () => showControlWindow());
  refreshTrayMenu();
  return tray;
};

const getDemoImage = sceneId => {
  const demo = DEMO_SCENES.find(item => item.id === sceneId) || DEMO_SCENES[0];
  const image = nativeImage.createFromPath(demoFile(demo.file)).resize({ width: 1280 });
  return {
    imageDataUrl: `data:image/jpeg;base64,${image.toJPEG(76).toString('base64')}`,
    sourceName: demo.name,
    scene: demo.scene,
    captureInfo: {
      captureMode: 'demo',
      sourceId: demo.id,
      sourceName: demo.name,
      displayId: cursorDisplay().id,
      hiddenAssistant: { control: false, answer: false, agentOps: false, delayMs: 0 },
    },
  };
};

const getDesktopSources = async thumbnailSize => desktopCapturer.getSources({
  types: ['screen', 'window'],
  fetchWindowIcons: false,
  thumbnailSize,
});

const isAssistantCaptureSource = source => /以太|Aether|project-aether/i.test(String(source?.name || ''));

const filterAssistantSources = sources => sources.filter(source => !isAssistantCaptureSource(source));

const fallbackToCursorSource = (sources, display) => {
  const candidate = findDisplaySource(sources, display.id);
  return candidate && !isAssistantCaptureSource(candidate) ? candidate : undefined;
};

const captureSourceAttempt = async () => {
  const rawSources = await getDesktopSources({ width: 1280, height: 720 });
  const sources = filterAssistantSources(rawSources);
  const display = cursorDisplay();
  return {
    sources,
    display,
    source: selectCaptureSource({ sources, settings, cursorDisplayId: display.id }),
  };
};

const firstReadableScreenSource = sources => sources
  .filter(source => source.id.startsWith('screen:'))
  .find(source => source.thumbnail && !source.thumbnail.isEmpty() && !isLikelyBlankCapture(source.thumbnail.resize({ width: 1280 })));

const cursorDisplay = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()) || screen.getPrimaryDisplay();

const isLikelyBlankCapture = image => {
  if (!image || image.isEmpty()) return true;
  const sample = image.resize({ width: 24, height: 14 }).toBitmap();
  let nearBlack = 0;
  let min = 255;
  let max = 0;
  let pixels = 0;
  for (let index = 0; index < sample.length; index += 4) {
    const luminance = Math.round((sample[index] + sample[index + 1] + sample[index + 2]) / 3);
    min = Math.min(min, luminance);
    max = Math.max(max, luminance);
    if (luminance < 4) nearBlack += 1;
    pixels += 1;
  }
  return pixels > 0 && nearBlack / pixels > 0.985 && max - min < 3;
};

const followCurrentScreen = async (options = {}) => {
  const sources = await getDesktopSources({ width: 1280, height: 720 });
  const display = cursorDisplay();
  const source = findDisplaySource(sources, display.id);
  if (!source) throw new Error('没有找到可读取的显示器画面，请检查系统屏幕录制权限。');
  const nextSettings = saveSettings({
    selectedSourceId: source.id,
    selectedSourceName: source.name || `显示器 ${display.id}`,
    selectedScene: settings.selectedScene || 'unknown',
    captureMode: 'cursor-display',
    captureDisplayId: display.id,
  });
  return { settings: nextSettings, sourceName: nextSettings.selectedSourceName, kind: 'screen' };
};

const selectSource = source => {
  const id = String(source?.id || '');
  if (!id) throw new Error('请选择有效的画面来源。');
  if (source.kind === 'demo' && !process.env.AETHER_UI_SMOKE_DIR) {
    throw new Error('演示图片不能作为真实画面来源，请选择鼠标所在屏幕或具体窗口。');
  }
  if (isAssistantCaptureSource(source)) {
    throw new Error('不能选择以太自己的窗口作为画面来源，请选择鼠标所在屏幕或游戏窗口。');
  }
  const kind = source.kind === 'window' ? 'window' : source.kind === 'demo' ? 'demo' : 'screen';
  return saveSettings({
    selectedSourceId: id,
    selectedSourceName: String(source.name || '手动画面来源'),
    selectedScene: source.scene || settings.selectedScene || 'unknown',
    captureMode: kind === 'window' ? 'manual-window' : kind === 'demo' ? 'demo' : 'manual-screen',
  });
};

const listSources = async () => {
  const demos = process.env.AETHER_UI_SMOKE_DIR ? DEMO_SCENES.map(demo => {
    const image = nativeImage.createFromPath(demoFile(demo.file)).resize({ width: 260 });
    return {
      id: demo.id,
      name: demo.name,
      kind: 'demo',
      scene: demo.scene,
      thumbnail: `data:image/jpeg;base64,${image.toJPEG(55).toString('base64')}`,
    };
  }) : [];
  try {
    const sources = filterAssistantSources(await getDesktopSources({ width: 260, height: 160 }));
    return [
      ...demos,
      ...sources.map(source => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' : 'window',
        scene: 'unknown',
        thumbnail: source.thumbnail.toDataURL(),
        displayId: source.display_id || undefined,
      })),
    ];
  } catch {
    return demos;
  }
};

const captureSelectedSource = async () => {
  const selectedId = settings.selectedSourceId || 'auto';
  const requestedMode = settings.captureMode || 'cursor-display';
  if (settings.captureMode === 'demo' && selectedId.startsWith('demo:')) {
    if (!process.env.AETHER_UI_SMOKE_DIR) {
      settings = saveSettings({
        selectedSourceId: 'auto',
        selectedSourceName: '鼠标所在屏幕',
        selectedScene: settings.selectedScene || 'unknown',
        captureMode: 'cursor-display',
      });
    } else {
      lastCaptureDisplayId = cursorDisplay().id;
      return getDemoImage(selectedId);
    }
  }

  const visibility = await hideAssistantForCapture();
  try {
    let { sources, display, source } = await captureSourceAttempt();
    let fallbackReason = '';
    if ((settings.captureMode === 'manual-screen' || settings.captureMode === 'manual-window') && source?.id !== selectedId) {
      fallbackReason = 'selected-source-unavailable';
    }
    if (!source) throw new Error('找不到当前画面来源，请在主界面重新选择显示器或窗口。');
    if (isAssistantCaptureSource(source)) {
      const cursorSource = fallbackToCursorSource(sources, display);
      if (!cursorSource) throw new Error('捕获来源仍是以太窗口。请切到游戏窗口，或使用“鼠标所在屏幕”。');
      source = cursorSource;
      fallbackReason = fallbackReason || 'assistant-source-filtered';
    }
    let image = source.thumbnail.resize({ width: 1280 });
    if (source.thumbnail.isEmpty() || isLikelyBlankCapture(image)) {
      await delay(650);
      ({ sources, display, source } = await captureSourceAttempt());
      if (!source) throw new Error('找不到当前画面来源，请在主界面重新选择显示器或窗口。');
      if (isAssistantCaptureSource(source)) {
        const cursorSource = fallbackToCursorSource(sources, display);
        if (!cursorSource) throw new Error('捕获来源仍是以太窗口。请切到游戏窗口，或使用“鼠标所在屏幕”。');
        source = cursorSource;
        fallbackReason = fallbackReason || 'assistant-source-filtered';
      }
      image = source.thumbnail.resize({ width: 1280 });
    }
    if ((source.thumbnail.isEmpty() || isLikelyBlankCapture(image)) && settings.captureMode !== 'cursor-display') {
      const cursorSource = fallbackToCursorSource(sources, display);
      if (cursorSource) {
        source = cursorSource;
        image = source.thumbnail.resize({ width: 1280 });
        fallbackReason = fallbackReason || 'manual-source-blank';
      }
    }
    if (source.thumbnail.isEmpty() || isLikelyBlankCapture(image)) {
      const fallback = firstReadableScreenSource(sources);
      if (fallback) {
        source = fallback;
        image = source.thumbnail.resize({ width: 1280 });
        fallbackReason = fallbackReason || 'readable-screen-fallback';
      }
    }
    if (isAssistantCaptureSource(source)) {
      throw new Error('捕获来源仍是以太窗口。请切到游戏窗口，或使用“鼠标所在屏幕”。');
    }
    lastCaptureDisplayId = source.display_id ? Number(source.display_id) : display.id;
    if (settings.captureMode === 'cursor-display' && (source.id !== settings.selectedSourceId || source.name !== settings.selectedSourceName)) {
      saveSettings({
        selectedSourceId: source.id,
        selectedSourceName: source.name || `显示器 ${display.id}`,
        selectedScene: settings.selectedScene || 'unknown',
        captureDisplayId: display.id,
      });
    }
    if (isLikelyBlankCapture(image)) {
      throw new Error('当前画面捕获到纯黑或受保护画面。请退出独占全屏，切换为无边框窗口模式；如果仍失败，请在主界面“当前画面来源”里手动选择整个屏幕。');
    }
    return {
      imageDataUrl: `data:image/jpeg;base64,${image.toJPEG(72).toString('base64')}`,
      sourceName: source.name,
      scene: settings.selectedScene || 'unknown',
      captureInfo: {
        captureMode: requestedMode,
        selectedSourceId: selectedId,
        sourceId: source.id,
        sourceName: source.name,
        displayId: lastCaptureDisplayId,
        hiddenAssistant: visibility,
        fallbackReason,
      },
    };
  } finally {
    restoreAssistantAfterCapture(visibility);
  }
};

const saveSettings = patch => {
  settings = { ...settings, ...patch };
  writeJson(settingsFile, settings);
  broadcast('settings:changed', settings);
  return settings;
};

const activeAccountKey = game => {
  const accounts = knowledgeService?.listAccounts?.() || [];
  const account = accounts.find(item => item.active && (!game || item.game === game))
    || accounts.find(item => item.active);
  return account ? `${account.game}:${account.uid}` : 'local:default';
};

const currentConversation = () => currentConversationId
  ? runtime?.getConversation(currentAccountKey, currentConversationId)
  : undefined;

const openConversation = input => {
  const conversationId = input?.conversationId || currentConversationId;
  const accountKey = input?.accountKey || currentAccountKey || activeAccountKey();
  if (!conversationId) throw new Error('没有可打开的历史会话。');
  const conversation = runtime.getConversation(accountKey, conversationId);
  if (!conversation) throw new Error('娌℃湁鎵惧埌杩欐潯鍘嗗彶浼氳瘽');
  currentConversationId = conversation.id;
  currentAccountKey = conversation.accountKey || accountKey;
  const run = conversation.lastRunSnapshot || runtime.getRun(conversation.lastRunId);
  const payload = { conversation, run };
  broadcast('conversation:selected', conversation);
  broadcast('conversation:opened', payload);
  return payload;
};

const selectConversation = input => {
  const { conversation } = openConversation(input);
  return conversation;
};

const deleteConversation = input => {
  const accountKey = input?.accountKey || currentAccountKey || activeAccountKey();
  const conversationId = input?.conversationId;
  const result = runtime.deleteConversation({
    accountKey,
    conversationId,
    deleteLinkedRuns: input?.deleteLinkedRuns !== false,
  });
  if (result.deleted && currentConversationId === conversationId) {
    currentConversationId = undefined;
    currentAccountKey = activeAccountKey();
  }
  broadcast('conversation:deleted', result);
  return result;
};

const clearConversations = input => {
  const result = runtime.clearConversations({
    accountKey: input?.accountKey || currentAccountKey || activeAccountKey(),
    includeAll: Boolean(input?.includeAll),
    deleteLinkedRuns: input?.deleteLinkedRuns !== false,
    clearMemory: Boolean(input?.clearMemory),
  });
  currentConversationId = undefined;
  currentAccountKey = activeAccountKey();
  broadcast('conversation:cleared', result);
  return result;
};

const runAgent = async input => {
  if (assistantRunning) throw new Error('以太正在分析上一张画面，请稍等。');
  assistantRunning = true;
  setAssistantStatus(input.includeVision === false ? 'analyzing' : 'capturing', input.includeVision === false ? '正在整理回答' : '正在捕获当前画面');
  try {
    const capture = input.includeVision === false ? null : await captureSelectedSource();
    setAssistantStatus('analyzing', '正在理解画面并整理建议');
    const imageHash = capture?.imageDataUrl ? crypto.createHash('sha256').update(capture.imageDataUrl).digest('hex') : '';
    const requestedScene = input.scene && input.scene !== 'unknown' ? input.scene : undefined;
    const accountKey = input.accountKey || activeAccountKey();
    const run = await runtime.run({
      query: String(input.query || '').slice(0, 4000),
      persona: input.persona || settings.persona || 'BALANCED',
      scene: requestedScene || capture?.scene || settings.selectedScene || 'unknown',
      mode: input.mode || 'chat',
      analysisMode: input.analysisMode || 'deep',
      conversationId: input.conversationId,
      accountKey,
      reuseLastObservation: Boolean(input.reuseLastObservation),
      parentRunId: input.parentRunId,
      imageDataUrl: capture?.imageDataUrl,
      imageHash,
      sourceName: capture?.sourceName || '纯文本',
      captureInfo: capture?.captureInfo,
    });
    if (run.conversationId) {
      currentConversationId = run.conversationId;
      currentAccountKey = run.accountKey || accountKey;
    }
    broadcast('agent:run-complete', run);
    const runError = run.errors?.length ? run.errors[run.errors.length - 1] : undefined;
    setAssistantStatus(run.source === 'error' ? 'error' : 'ready', run.source === 'error' ? (runError?.message || run.summary) : '回答已准备', {
      latestRunId: run.id,
    });
    return run;
  } catch (error) {
    setAssistantStatus('error', error instanceof Error ? error.message : '这次没有完成画面解读');
    throw error;
  } finally {
    assistantRunning = false;
    refreshTrayMenu();
  }
};

const runQuickScan = async () => {
  if (assistantRunning) return undefined;
  createAnswerWindow();
  try {
    const selectedScene = settings.selectedScene && settings.selectedScene !== 'unknown' ? settings.selectedScene : 'unknown';
    const run = await runAgent({
      query: SCAN_PROMPTS[selectedScene] || DEFAULT_SCAN_PROMPT,
      persona: settings.persona,
      scene: selectedScene,
      mode: 'scan',
      includeVision: true,
      analysisMode: 'deep',
    });
    showAnswerCard();
    return run;
  } catch (error) {
    showAnswerCard();
    return undefined;
  }
};

const showLatestAnswer = () => {
  showControlWindow();
  broadcast('assistant:show-latest', runtime?.getLatestRun());
};

const registerIpc = () => {
  ipcMain.handle('app:get-state', () => ({
    settings,
    runtime: runtime.status(),
    latestRun: runtime.getLatestRun(),
    currentConversation: currentConversation(),
    assistantStatus,
  }));
  ipcMain.handle('capture:list-sources', () => listSources());
  ipcMain.handle('capture:follow-screen', (_event, options) => followCurrentScreen(options || {}));
  ipcMain.handle('capture:follow-game', (_event, options) => followCurrentScreen(options || {}));
  ipcMain.handle('capture:select-source', (_event, source) => selectSource(source || {}));
  ipcMain.handle('settings:update', (_event, patch) => saveSettings({
    experienceVersion: settings.experienceVersion,
    persona: patch.persona || settings.persona,
    selectedSourceId: patch.selectedSourceId || settings.selectedSourceId,
    selectedSourceName: patch.selectedSourceName || settings.selectedSourceName,
    selectedScene: patch.selectedScene || settings.selectedScene,
    captureMode: patch.captureMode || settings.captureMode,
    captureDisplayId: patch.captureDisplayId ?? settings.captureDisplayId,
    shortcutReady: assistantStatus.shortcutReady,
  }));
  ipcMain.handle('assistant:quick-scan', () => runQuickScan());
  ipcMain.handle('assistant:show-latest', () => showLatestAnswer());
  ipcMain.handle('assistant:get-status', () => assistantStatus);
  ipcMain.handle('agent:run', (_event, input) => runAgent(input || {}));
  ipcMain.handle('agent:latest', () => runtime.getLatestRun());
  ipcMain.handle('agent:get-run', (_event, runId) => runtime.getRun(runId));
  ipcMain.handle('agent:runs', (_event, limit) => runtime.getRuns(Number(limit) || 30));
  ipcMain.handle('agent:memory', (_event, input) => {
    if (typeof input === 'string') return runtime.getMemory(input || settings.persona, currentAccountKey);
    return runtime.getMemory(input?.persona || settings.persona, input?.accountKey || currentAccountKey);
  });
  ipcMain.handle('agent:health', () => runtime.health());
  ipcMain.handle('conversation:list', (_event, input) => runtime.getConversations(
    input?.accountKey || currentAccountKey || activeAccountKey(),
    Number(input?.limit) || (input?.includeAll ? 200 : 20),
    { includeAll: Boolean(input?.includeAll) },
  ));
  ipcMain.handle('conversation:get', (_event, input) => runtime.getConversation(input?.accountKey || currentAccountKey || activeAccountKey(), input?.conversationId || currentConversationId));
  ipcMain.handle('conversation:select', (_event, input) => selectConversation(input || {}));
  ipcMain.handle('conversation:open', (_event, input) => openConversation(input || {}));
  ipcMain.handle('conversation:delete', (_event, input) => deleteConversation(input || {}));
  ipcMain.handle('conversation:clear', (_event, input) => clearConversations(input || {}));
  ipcMain.handle('conversation:new-from-scan', () => runQuickScan());
  ipcMain.handle('conversation:ask', async (_event, input) => {
    const latest = runtime.getLatestRun();
    const requestedAccountKey = input?.accountKey;
    const requestedConversationId = typeof input?.conversationId === 'string' ? input.conversationId.trim() : '';
    const requestedScene = input?.scene && input.scene !== 'unknown' ? input.scene : (latest?.scene || settings.selectedScene || 'unknown');
    const preferredAccountKeys = [requestedAccountKey, currentAccountKey, activeAccountKey()];
    const knownAccounts = knowledgeService?.listAccounts?.() || [];
    const normalized = [...new Set([
      ...preferredAccountKeys,
      ...knownAccounts.map(item => `${item.game}:${item.uid}`),
      'local:default',
    ])];
    let conversation;
    let resolvedAccountKey;
    if (!requestedConversationId) {
      throw new Error('当前没有可追问的会话，请先按 Alt+Q 解读一次画面后再追问。');
    }
    const candidateAccountKeys = normalized.filter(Boolean);
    for (const key of candidateAccountKeys) {
      const normalizedKey = String(key).trim();
      const found = runtime.getConversation(normalizedKey, requestedConversationId);
      if (found) {
        conversation = found;
        resolvedAccountKey = normalizedKey;
        break;
      }
    }
    if (!conversation) {
      throw new Error(`找不到目标会话（ID=${requestedConversationId}）。请先打开对应会话或重新扫码后再试。`);
    }
    const finalAccountKey = resolvedAccountKey || conversation.accountKey || requestedAccountKey || latest?.accountKey || currentAccountKey || 'local:default';
    return runAgent({
      query: String(input?.query || '').slice(0, 4000),
      persona: input?.persona || settings.persona,
      scene: requestedScene || conversation.scene || latest?.scene || 'unknown',
      mode: 'chat',
      includeVision: false,
      analysisMode: input?.analysisMode || 'deep',
      conversationId: conversation.id,
      accountKey: finalAccountKey,
      parentRunId: input?.parentRunId || conversation.lastRunId || latest?.id,
      reuseLastObservation: true,
    });
  });
  ipcMain.handle('agent:warmup', async (_event, persona) => {
    const results = [];
    for (let index = 0; index < DEMO_SCENES.length; index += 1) {
      const scene = DEMO_SCENES[index];
      broadcast('warmup:progress', { current: index + 1, total: DEMO_SCENES.length, name: scene.name });
      const capture = getDemoImage(scene.id);
      const run = await runtime.run({
        query: '扫描当前画面，识别可见信息并给出最短可执行建议。',
        persona: persona || settings.persona,
        scene: scene.scene,
        mode: 'scan',
        imageDataUrl: capture.imageDataUrl,
        imageHash: crypto.createHash('sha256').update(capture.imageDataUrl).digest('hex'),
        sourceName: capture.sourceName,
      });
      results.push(run);
      broadcast('agent:run-complete', run);
    }
    return results;
  });
  ipcMain.handle('knowledge:reload', () => runtime.reloadKnowledge());
  ipcMain.handle('knowledge:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入游戏知识包或语料卡',
      properties: ['openFile'],
      filters: [
        { name: '知识包 / 语料卡', extensions: ['json', 'md', 'txt'] },
        { name: 'JSON 知识包', extensions: ['json'] },
        { name: 'Markdown 语料卡', extensions: ['md'] },
        { name: '纯文本语料卡', extensions: ['txt'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return runtime.status();
    return runtime.importKnowledge(result.filePaths[0]);
  });
  ipcMain.handle('account:list', () => knowledgeService.listAccounts());
  ipcMain.handle('account:connect', async (_event, input) => {
    const account = knowledgeService.connectAccount(input || {});
    try {
      return await knowledgeService.syncAccount(account.id);
    } catch {
      return knowledgeService.listAccounts().find(item => item.id === account.id);
    }
  });
  ipcMain.handle('account:sync', (_event, accountId) => knowledgeService.syncAccount(String(accountId || '')));
  ipcMain.handle('account:remove', (_event, accountId) => knowledgeService.removeAccount(String(accountId || '')));
  ipcMain.handle('account:context', (_event, game) => knowledgeService.getAccountContext(game));
  ipcMain.handle('knowledge:search', (_event, input) => knowledgeService.retrieve({
    query: String(input?.query || '').slice(0, 500),
    game: input?.game,
    scene: input?.scene || 'unknown',
    selectedCharacter: input?.selectedCharacter,
    visibleRoster: input?.visibleRoster,
    activeTeamCandidates: input?.activeTeamCandidates,
    allowWeb: input?.allowWeb !== false,
  }));
  ipcMain.handle('window:open-control', () => {
    showControlWindow();
  });
  ipcMain.handle('window:open-agentops', () => createAgentOpsWindow());
  ipcMain.handle('window:close-current', event => BrowserWindow.fromWebContents(event.sender)?.close());
};

if (hasSingleInstanceLock) app.whenReady().then(() => {
  const userData = app.getPath('userData');
  const { env } = loadEnv(userData);
  settingsFile = path.join(userData, 'settings.json');
  const savedSettings = readJson(settingsFile, {});
  settings = {
    experienceVersion: SETTINGS_VERSION,
    persona: 'BALANCED',
    selectedSourceId: 'auto',
    selectedSourceName: '鼠标所在屏幕',
    selectedScene: 'unknown',
    captureMode: 'cursor-display',
    shortcutReady: false,
    ...savedSettings,
  };
  if (!savedSettings.experienceVersion || savedSettings.experienceVersion < SETTINGS_VERSION) {
    clearRendererCaches(userData);
    settings.persona = 'BALANCED';
    settings.captureMode = 'cursor-display';
    settings.selectedSourceId = 'auto';
    settings.selectedSourceName = '鼠标所在屏幕';
    settings.selectedScene = 'unknown';
  }
  if (settings.captureMode === 'demo' || String(settings.selectedSourceId || '').startsWith('demo:')) {
    settings.captureMode = 'cursor-display';
    settings.selectedSourceId = 'auto';
    settings.selectedSourceName = '鼠标所在屏幕';
    settings.selectedScene = 'unknown';
  }
  settings.experienceVersion = SETTINGS_VERSION;
  delete settings.patrolEnabled;
  delete settings.screenWatchEnabled;
  delete settings.petPosition;
  delete settings.petVisible;
  delete settings.quickPanelSize;
  delete settings.petOnboardingComplete;
  delete settings.quickPanelVisible;
  delete settings.followGameEnabled;
  writeJson(settingsFile, settings);

  const knowledgeFile = path.join(userData, 'knowledge', 'game-knowledge.json');
  const knowledgeSync = syncRuntimeKnowledgePack({
    bundledDir: __dirname,
    runtimeFile: knowledgeFile,
  });
  const knowledgeSeed = knowledgeSync.pack || readJson(knowledgeFile, { entries: [] });
  knowledgeService = new AetherKnowledgeService({
    dataDir: path.join(userData, 'agent-data'),
    dbFile: path.join(userData, 'agent-data', 'aether.sqlite'),
    tavilyKey: env.TAVILY_API_KEY,
    seedEntries: knowledgeSeed.entries,
    seedVersion: knowledgeSeed.version,
    replaceSeedEntries: knowledgeSync.updated,
  });
  const modelConfig = resolveModelConfig(env);
  runtime = new AetherAgentRuntime({
    dataDir: path.join(userData, 'agent-data'),
    knowledgeFile,
    providerName: modelConfig.providerName,
    token: modelConfig.token,
    model: modelConfig.model || MODEL_ID,
    fastVisionModel: modelConfig.fastVisionModel || modelConfig.model || MODEL_ID,
    visionPipeline: modelConfig.visionPipeline || 'auto',
    apiBaseUrl: modelConfig.apiBaseUrl,
    apiUrl: modelConfig.apiUrl,
    apiWire: modelConfig.apiWire,
    timeoutMs: modelConfig.timeoutMs,
    knowledgeService,
    knowledgeSync,
    knowledgeBundledVersion: knowledgeSync.bundledVersion,
    knowledgeBundledPath: knowledgeSync.bundledPath,
    knowledgeCorpusDir: knowledgeSync.corpusDir,
    resetKnowledge: knowledgeSync.updated,
  });

  registerIpc();
  createTray();
  showControlWindow();
  const scanShortcutReady = globalShortcut.register("Alt+Q", () => void runQuickScan());
  const latestShortcutReady = globalShortcut.register("Alt+Shift+Q", () => showLatestAnswer());
  const shortcutsReady = scanShortcutReady && latestShortcutReady;
  settings = saveSettings({ shortcutReady: shortcutsReady });
  setAssistantStatus("idle", shortcutsReady ? "等待中" : "热键冲突，可点按钮", {
    shortcutReady: shortcutsReady,
  });
  screen.on("display-removed", positionAnswerWindow);
  screen.on("display-metrics-changed", positionAnswerWindow);
  setInterval(() => runtime.reloadKnowledge(), 60000);
  if (process.env.AETHER_UI_SMOKE_DIR) {
    void runUiSmoke(path.resolve(process.env.AETHER_UI_SMOKE_DIR)).catch(error => {
      console.error(`UI 冒烟失败：${error.stack || error.message}`);
      app.exit(1);
      setTimeout(() => process.exit(1), 250).unref();
    });
  }
}).catch(error => {
  console.error(`以太启动失败：${error.stack || error.message}`);
  app.exit(1);
});

app.on("second-instance", () => {
  showControlWindow();
});

app.on("activate", () => {
  showControlWindow();
});

app.on("before-quit", () => {
  quitting = true;
  clearTimeout(answerHideTimer);
  knowledgeService?.close();
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  // Keep the tray process alive after the main window is closed.
});
