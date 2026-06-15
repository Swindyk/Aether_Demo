const assert = require('node:assert/strict');
const test = require('node:test');
const { answerCardBounds, findDisplaySource, selectCaptureSource } = require('./assistant-window.cjs');

const sources = [
  { id: 'window:1', display_id: '' },
  { id: 'screen:1', display_id: '101' },
  { id: 'screen:2', display_id: '202' },
];

test('短答案卡固定在目标显示器右侧中部', () => {
  assert.deepEqual(answerCardBounds({ x: 1920, y: 0, width: 1920, height: 1040 }), {
    x: 3392,
    y: 400,
    width: 420,
    height: 240,
  });
});

test('默认捕获鼠标所在显示器', () => {
  assert.equal(findDisplaySource(sources, 202).id, 'screen:2');
  assert.equal(selectCaptureSource({
    sources,
    settings: { captureMode: 'cursor-display', selectedSourceId: 'auto' },
    cursorDisplayId: 202,
  }).id, 'screen:2');
});

test('手动选择的画面优先于鼠标所在显示器', () => {
  assert.equal(selectCaptureSource({
    sources,
    settings: { captureMode: 'manual-window', selectedSourceId: 'window:1' },
    cursorDisplayId: 202,
  }).id, 'window:1');
});
