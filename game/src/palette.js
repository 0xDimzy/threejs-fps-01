// EMBERLINE palette — a dusk industrial yard: low amber sun, cool steel,
// hot furnace glow, amber Site A and cyan Site B beacons.
export const PAL = {
  sky: 0x2b3242,
  fog: 0x232a38,
  ground: 0x3a3f45,
  groundDark: 0x2f343b,
  wall: 0x4a4f57,
  wallDark: 0x373c44,
  containerA: 0xb3541e,
  containerB: 0x2e6f8e,
  containerC: 0x7a7f28,
  crate: 0x8a6b42,
  crateDark: 0x6e5433,
  furnace: 0x5a2d1a,
  furnaceGlow: 0xff7a1a,
  gantry: 0x39424e,
  gantryRust: 0x6b4a2e,
  siteA: 0xffb020,
  siteB: 0x35d0e0,
  botBody: 0x8c2f26,
  botTrim: 0x3a3f45,
  botSkin: 0xc7a27a,
  tracer: 0xffd27a,
  muzzle: 0xffc46b,
  gun: 0x22262c,
  gunAccent: 0x4a4f57,
  accent: 0xffb020,
  hudBg: 'rgba(12,14,18,0.72)',
  hudText: '#e8e4d8',
  hudDim: '#9aa3ad',
  danger: '#ff4d3d',
  ok: '#7ddc6a',
  gold: '#ffc857',
};

// Small helper: turn a hex colour into an rgba() string for canvas/DOM use.
export function hexToRgba(hex, alpha) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r},${g},${b},${alpha})`;
}
