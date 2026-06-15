const answerCardBounds = (workArea, size = { width: 420, height: 240 }, margin = 28) => ({
  x: Math.round(workArea.x + workArea.width - size.width - margin),
  y: Math.round(workArea.y + (workArea.height - size.height) / 2),
  width: size.width,
  height: size.height,
});

const findDisplaySource = (sources, displayId) => {
  const screens = sources.filter(source => source.id.startsWith('screen:'));
  return screens.find(source => String(source.display_id) === String(displayId)) || screens[0];
};

const selectCaptureSource = ({ sources, settings, cursorDisplayId }) => {
  if (settings.captureMode === 'manual-screen' || settings.captureMode === 'manual-window') {
    return sources.find(source => source.id === settings.selectedSourceId);
  }
  return findDisplaySource(sources, cursorDisplayId);
};

module.exports = {
  answerCardBounds,
  findDisplaySource,
  selectCaptureSource,
};
