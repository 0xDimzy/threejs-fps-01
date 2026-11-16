// Keyboard + mouse + pointer lock. Keeps the raw input state in one place
// and hands the game frame deltas to consume: look movement, pressed-this-
// frame keys, held keys, and the firing state. Pointer lock is requested on
// the canvas click; losing it pauses the live game (the player must click
// to re-capture).
export function createInput(canvas) {
  const input = {
    keys: new Set(),
    pressed: new Set(), // keys pressed since the last consume
    lookDX: 0,
    lookDY: 0,
    firing: false,
    locked: false,
    // Sensitivity in radians per pixel of mouse movement.
    sensitivity: 0.0023,

    // One frame's look, clamped: a single wild event (a pointer-lock
    // acquire, a synthetic jump) must never spin the view to the sky.
    consumeLook() {
      const cap = (v) => Math.max(-200, Math.min(200, v));
      const dx = cap(this.lookDX);
      const dy = cap(this.lookDY);
      this.lookDX = 0;
      this.lookDY = 0;
      return { dx, dy };
    },
    // True once, on the frame the key went down.
    wasPressed(code) {
      return this.pressed.has(code);
    },
    isDown(code) {
      return this.keys.has(code);
    },
    endFrame() {
      this.pressed.clear();
    },
    requestLock() {
      if (!this.locked) canvas.requestPointerLock();
    },
  };

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    input.pressed.add(e.code);
    if (e.code === 'Space') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.firing = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    // Clamp each event's delta: a single wild jump (a pointer-lock
    // acquire, a synthetic event from automation) must never spin the
    // view. Real flicks arrive as a stream of small events, so a per-
    // event cap costs nothing and a per-frame cap backs it up.
    const clamp = (v) => Math.max(-60, Math.min(60, v));
    input.lookDX += clamp(e.movementX);
    input.lookDY += clamp(e.movementY);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!input.locked) {
      input.requestLock();
      return;
    }
    input.firing = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.firing = false;
  });
  canvas.addEventListener('click', () => input.requestLock());

  return input;
}
