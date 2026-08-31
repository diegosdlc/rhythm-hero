const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
let gamepads = [];
const globalListeners = {};
const sandbox = {
  console,
  document: { getElementById() { return null; } },
  window: {
    navigator: { getGamepads: () => gamepads },
    addEventListener(type, listener) { globalListeners[type] = listener; },
    removeEventListener() {}
  }
};

vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8'), sandbox);
vm.runInNewContext(fs.readFileSync(path.join(root, 'src', 'input.js'), 'utf8'), sandbox);

const RH = sandbox.window.RhythmHero;
const A = RH.ACTIONS;
const events = [];
const router = new RH.InputRouter(() => 1);
router.onInput(event => events.push(event));

const pointerListeners = {};
const pointerRoot = {
  addEventListener(type, listener) { pointerListeners[type] = listener; },
  removeEventListener() {},
  setPointerCapture() {},
  getBoundingClientRect() { return { top: 0, left: 0, width: 1000, height: 700 }; }
};
const pointer = new RH.PointerPitchInputAdapter(pointerRoot);
pointer.attach(router);
const target = { closest() { return null; } };
const pointerEvent = (overrides = {}) => Object.assign({
  pointerType: 'mouse', pointerId: 1, button: 0,
  clientX: 200, clientY: 72, target,
  preventDefault() {}
}, overrides);

pointerListeners.pointermove(pointerEvent());
pointerListeners.pointermove(pointerEvent({ clientY: 608 }));

assert.equal(events.length, 2);
assert.equal(events[0].action, A.PITCH);
assert.equal(events[0].pitch, 0.003703703703703704);
assert.equal(events[1].action, A.PITCH);
assert.equal(events[1].pitch, 0.9962962962962963);

pointerListeners.pointerdown(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 200, clientY: 340 }));
pointerListeners.pointermove(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 200, clientY: 430 }));
pointerListeners.pointerup(pointerEvent({ pointerType: 'touch', pointerId: 2, clientX: 200, clientY: 430 }));
assert.ok(events.some(event => event.source === 'touch' && event.action === A.PITCH));

const beforeRejectedTouch = events.length;
pointerListeners.pointerdown(pointerEvent({ pointerType: 'touch', pointerId: 3, clientX: 800 }));
assert.equal(events.length, beforeRejectedTouch, 'touch input on the right side must be ignored');

events.length = 0;
const buttons = Array.from({ length: 14 }, () => ({ pressed: false, value: 0 }));
const pad = { index: 0, axes: [0, -1, 0, 0], buttons };
gamepads = [pad];
const gamepad = new RH.GamepadInputAdapter();
gamepad.attach(router);
gamepad.update();
pad.axes[3] = 1;
buttons[0] = { pressed: true, value: 1 };
gamepad.update();
pad.axes[1] = 1;
gamepad.update();

assert.ok(events.some(event => event.action === A.PITCH && event.pitch === 0));
assert.ok(events.some(event => event.action === A.NAV_NEXT && event.phase === 'pressed'));
assert.ok(events.some(event => event.action === A.CONFIRM && event.phase === 'pressed'));
assert.ok(events.some(event => event.action === A.PITCH && event.pitch === 1));

const keyboard = new RH.KeyboardInputAdapter();
assert.equal(keyboard.map.KeyW, A.NAV_PREVIOUS);
assert.equal(keyboard.map.KeyS, A.NAV_NEXT);
assert.equal(keyboard.map.Space, A.CONFIRM);
assert.equal(keyboard.map.Digit3, A.OPTION_3);

const interruptions = new RH.InterruptionSystem([{
  id: 'test', time: 0,
  options: [{ id: 'one' }, { id: 'two' }]
}]);
interruptions.update(0);
interruptions.handleAction(A.OPTION_2, 'pressed', 0);
assert.equal(interruptions.decisions.test, 'two');

const score = new RH.ScoreSystem();
const judgements = [];
const rhythm = new RH.RhythmSystem([
  { id: 'held', time: 1, y: 0.4, duration: 1 },
  { id: 'missed', time: 3, y: 0.8, duration: 0.5 }
], score, judgement => judgements.push(judgement));

rhythm.update(1, 0.41);
assert.equal(rhythm.isOnPitch, true);
assert.equal(rhythm.notes[0].state, 'holding');
rhythm.update(1.5, 0.42);
rhythm.update(2, 0.4);
assert.equal(rhythm.notes[0].state, 'hit');
assert.equal(judgements[0].grade, 'PERFECT');

rhythm.update(3, 0.1);
assert.equal(rhythm.isOnPitch, false);
assert.equal(rhythm.notes[1].state, 'active');
rhythm.update(3.4, 0.1);
rhythm.update(3.5, 0.1);
assert.equal(rhythm.notes[1].state, 'miss');
assert.equal(judgements[1].grade, 'MISS');
assert.equal(score.total, 2);

console.log('input control tests passed');
