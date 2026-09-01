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

const variants = Array.from({ length: 10 }, (_, index) => RH.lyricBoxVariant({ id: `n${index + 1}` }));
assert.ok(new Set(variants).size >= 4, 'nearby notes should cycle through most box silhouettes');
assert.equal(
  RH.lyricBoxVariant({ id: 'n4', lyric: 'changed copy' }),
  RH.lyricBoxVariant({ id: 'n4', lyric: 'other copy' }),
  'the same note must keep its silhouette across frames'
);

const sprite = new RH.LyricBoxSprite();
const drawCalls = [];
const rotationCalls = [];
const ctx = {
  save() {}, restore() {}, beginPath() {}, rect() {}, fill() {}, stroke() {},
  translate() {},
  rotate(value) { rotationCalls.push(value); },
  drawImage(...args) { drawCalls.push(args); },
  set fillStyle(value) {}, set strokeStyle(value) {}, set lineWidth(value) {},
  set shadowColor(value) {}, set shadowBlur(value) {}, filter: 'none'
};

const layout = sprite.sliceLayout(240, 56, 0);
assert.ok(layout.left > 59 && layout.left < 60);
assert.ok(layout.right > 59 && layout.right < 60);
assert.ok(layout.middle > 120 && layout.middle < 121);
assert.equal(sprite.heightFor(0, 56), 56);
assert.equal(sprite.heightFor(3, 56), 64.96);
assert.equal(sprite.heightFor(4, 56), 49.28);

sprite.draw(ctx, 100, 80, 240, 56, 'active', 0);
assert.equal(drawCalls.length, 3, 'a normal hold uses fixed left/right caps plus a stretchable center');
assert.equal(drawCalls[0][1], 5);
assert.equal(drawCalls[0][2], 38);
assert.equal(drawCalls[0][3], 200);
assert.equal(drawCalls[2][1], 323);
assert.equal(drawCalls[0][5], 100);
assert.equal(drawCalls[2][5] + drawCalls[2][7], 340);
assert.equal(rotationCalls[0], -0.010);

drawCalls.length = 0;
sprite.draw(ctx, 0, 40, 30, 56, 'active', 0);
assert.equal(drawCalls.length, 2, 'very short holds collapse the center before deforming the end caps');
assert.equal(drawCalls[0][7], 15);
assert.equal(drawCalls[1][7], 15);

drawCalls.length = 0;
sprite.draw(ctx, 10, 60, 240, 56, 'active', 3);
assert.equal(drawCalls[0][1], 537);
assert.equal(drawCalls[0][2], 313);
assert.equal(drawCalls[2][1], 792);
assert.equal(rotationCalls.at(-1), 0.012);

console.log('lyric box tests passed');
