const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
class FakeImage {
  constructor() {
    this.complete = true;
    this.naturalWidth = 1024;
  }
  set src(value) { this._src = value; }
}

const sandbox = {
  Image: FakeImage,
  console,
  window: {
    RhythmHero: {},
    addEventListener() {}
  }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8'), sandbox);

const RH = sandbox.window.RhythmHero;
const geometry = RH.lyricBoxGeometry;
const hitX = 180;
const trackWidth = 790;
const horizon = 2.5;

const oneSecond = geometry({ time: 10, duration: 1 }, 10, hitX, trackWidth, horizon);
const twoSeconds = geometry({ time: 10, duration: 2 }, 10, hitX, trackWidth, horizon);
assert.equal(oneSecond.x, hitX);
assert.equal(twoSeconds.width, oneSecond.width * 2);

const halfwayHeld = geometry({ time: 10, duration: 2 }, 11, hitX, trackWidth, horizon);
assert.equal(halfwayHeld.x, hitX);
assert.equal(halfwayHeld.width, oneSecond.width);

const veryShort = geometry({ time: 10, duration: 0.05 }, 10, hitX, trackWidth, horizon);
assert.equal(veryShort.width, 62);

const sprite = new RH.LyricBoxSprite();
const drawCalls = [];
const ctx = {
  save() {}, restore() {}, beginPath() {}, rect() {}, fill() {}, stroke() {},
  drawImage(...args) { drawCalls.push(args); },
  set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {},
  set shadowColor(value) {}, set shadowBlur(value) {}, filter: 'none'
};

const layout = sprite.sliceLayout(240, 56);
assert.ok(layout.left > 20 && layout.left < 21);
assert.ok(layout.right > 20 && layout.right < 21);
assert.ok(layout.middle > 198 && layout.middle < 200);

sprite.draw(ctx, 100, 80, 240, 56, 'active');
assert.equal(drawCalls.length, 3, 'a normal hold uses fixed left/right caps plus a stretchable center');
assert.equal(drawCalls[0][1], 9);
assert.equal(drawCalls[0][2], 28);
assert.equal(drawCalls[0][3], 131);
assert.equal(drawCalls[2][1], 886);
assert.equal(drawCalls[0][5], 100);
assert.equal(drawCalls[2][5] + drawCalls[2][7], 340);

drawCalls.length = 0;
sprite.draw(ctx, 0, 40, 30, 56, 'active');
assert.equal(drawCalls.length, 2, 'very short holds collapse the center before deforming the end caps');
assert.equal(drawCalls[0][7], 15);
assert.equal(drawCalls[1][7], 15);

console.log('lyric box tests passed');
