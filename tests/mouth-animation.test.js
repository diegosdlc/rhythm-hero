const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const imagePaths = ['mouth-closed.png', 'mouth-half.png', 'mouth-open.png']
  .map(name => path.join(root, 'assets', 'mouth', name));

for (const imagePath of imagePaths) {
  const png = fs.readFileSync(imagePath);
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, `${path.basename(imagePath)} must use RGBA pixels`);
}

const sandbox = {
  Image: class Image { set src(value) { this._src = value; } },
  console,
  window: {
    RhythmHero: {},
    addEventListener() {}
  }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8'), sandbox);

const classState = {};
const mouthRoot = {
  style: {},
  classList: {
    toggle(name, enabled) { classState[name] = enabled; }
  }
};
const frame = { src: '' };
const animator = new sandbox.window.RhythmHero.MouthAnimator(mouthRoot, frame);
const session = {
  state: 'idle',
  rhythm: { isOnPitch: false },
  now: () => 0
};

animator.update(session, { x: 120, y: 240 });
assert.equal(frame.src, 'assets/mouth/mouth-closed.png');
assert.equal(classState['is-holding'], false);
assert.equal(mouthRoot.style.left, '120px');
assert.equal(mouthRoot.style.top, '240px');

session.state = 'playing';
session.rhythm.isOnPitch = true;
session.now = () => 0.13;
animator.update(session);
assert.equal(frame.src, 'assets/mouth/mouth-half.png');
assert.equal(classState['is-holding'], true);

session.now = () => 0.25;
animator.update(session);
assert.equal(frame.src, 'assets/mouth/mouth-open.png');

session.rhythm.isOnPitch = false;
animator.update(session);
assert.equal(frame.src, 'assets/mouth/mouth-closed.png');
assert.equal(classState['is-holding'], false);

console.log('mouth animation tests passed');
