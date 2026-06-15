const { app, desktopCapturer, screen } = require('electron');
const { findDisplaySource } = require('./assistant-window.cjs');

const failTimer = setTimeout(() => {
  console.error('屏幕捕获烟测超时');
  app.exit(1);
}, 30000);

app.whenReady().then(async () => {
  const display = screen.getPrimaryDisplay();
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    fetchWindowIcons: false,
    thumbnailSize: { width: 320, height: 180 },
  });
  const source = findDisplaySource(sources, display.id);
  if (!source || source.thumbnail.isEmpty()) throw new Error('没有获得可用的主显示器截图');
  console.log(JSON.stringify({
    displayId: display.id,
    sourceName: source.name,
    sourceDisplayId: source.display_id,
    sourceCount: sources.length,
    size: source.thumbnail.getSize(),
  }, null, 2));
  clearTimeout(failTimer);
  app.quit();
}).catch(error => {
  clearTimeout(failTimer);
  console.error(error);
  app.exit(1);
});
