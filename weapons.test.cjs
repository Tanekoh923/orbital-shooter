const assert = require('node:assert/strict');
const weapons = require('./weapons.js');

function test(name, run) { run(); console.log('PASS: ' + name); }
function shot(craft = 'vector', level = 2, extra = {}) {
  return weapons.decorate({ x: 100, y: 200, baseY: 200, vx: 760, vy: 0, age: 0,
    laser: true, pierce: level === 2, ...extra }, craft, level);
}
function advance(s, dt, blocked = () => false) {
  s.prevX = s.x; s.prevY = s.y; s.age += dt;
  s.x += s.vx * dt; s.y = s.wave ? s.baseY + Math.sin(s.age * 22) * s.amplitude : s.y + s.vy * dt;
  return weapons.advance(s, dt, blocked);
}
function canvas() {
  const paths = [], arcs = [];
  let points = [];
  return {
    paths, arcs, save() {}, restore() {}, beginPath() { points = []; },
    moveTo(x, y) { points.push({ x, y }); }, lineTo(x, y) { points.push({ x, y }); },
    stroke() { paths.push({ points: [...points], width: this.lineWidth, color: this.strokeStyle }); },
    arc(x, y, r) { arcs.push({ x, y, r }); }, ellipse() {}, fill() {}, fillText() {},
    translate() {}, rotate() {}, fillRect() {},
  };
}
const distance = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - points[i].x, p.y - points[i].y), 0);

test('laser descriptions distinguish branch count, piercing, wave width and actual blast radius', () => {
  for (const craft of ['vector', 'tempest', 'lancer', 'prism']) {
    const one = weapons.describe(craft, 1), two = weapons.describe(craft, 2);
    assert.match(one.name, /Lv\.1/); assert.match(two.name, /Lv\.2/);
    assert.notEqual(one.effect, two.effect); assert.match(one.preview, /Lv\.1.*Lv\.2/);
  }
  assert.doesNotMatch(weapons.describe('vector', 1).effect, /貫通/);
  assert.match(weapons.describe('vector', 2).effect, /貫通/);
  assert.match(weapons.describe('tempest', 2).effect, /幅.*威力/);
  assert.match(weapons.describe('lancer', 1).effect, /38/);
  assert.match(weapons.describe('lancer', 2).effect, /65/);
  assert.match(weapons.describe('prism', 1).effect, /2方向/);
  assert.match(weapons.describe('prism', 2).effect, /3方向.*貫通/);
});

test('a new laser never draws a fabricated tail behind its firing point', () => {
  const s = shot();
  assert.deepEqual(weapons.path(s), [{ x: 100, y: 200 }, { x: 100, y: 200 }]);
  advance(s, 1 / 60);
  assert.ok(weapons.path(s).every(p => p.x >= s.originX));
  assert.equal(weapons.path(s)[0].x, s.originX);
  assert.equal(weapons.path(s).at(-1).x, s.x);
});

test('beam layers draw the same long path that target collision sees', () => {
  const s = shot('vector', 2, { pierce: false }); advance(s, .25);
  const path = weapons.path(s), ctx = canvas(); weapons.drawShot(ctx, s);
  assert.ok(distance(path) > 150, 'the old 52px rectangle must become a readable long beam');
  assert.equal(ctx.paths.length, 3);
  for (const layer of ctx.paths) assert.deepEqual(layer.points, path);
  assert.ok(ctx.paths[0].width > ctx.paths[1].width && ctx.paths[1].width > ctx.paths[2].width);
  assert.match(ctx.paths[2].color, /^#f/i, 'the beam has a bright inner core');
  assert.ok(weapons.contact(path, { x: path[0].x + 20, y: 200 }, 4), 'the visible tail also damages targets');
  assert.equal(weapons.contact(path, { x: s.x + 20, y: 200 }, 4), null, 'damage cannot extend in front of the visible path');
});

test('stored laser and wave trails remain bounded during sustained firing', () => {
  for (const craft of ['vector', 'prism', 'tempest']) {
    const s = shot(craft, 2, craft === 'tempest' ? { laser: false, wave: true, vx: 650, amplitude: 30, r: 10 } : {});
    for (let frame = 0; frame < 900; frame++) advance(s, 1 / 60);
    assert.ok(s.trail.length < 100); assert.ok(s.path.length < 100);
    assert.ok(distance(s.trail) <= 196 + 1e-7);
    assert.equal(s.path.at(-1).x, s.x); assert.equal(s.path.at(-1).y, s.y);
  }
});

test('high refresh rates cannot grow a laser trail past 64 stored points', () => {
  const s = shot();
  for (let frame = 0; frame < 1000; frame++) {
    advance(s, 1 / 600);
    assert.ok(s.trail.length <= 64);
    assert.ok(s.path.length < 100);
  }
  assert.equal(s.path.at(-1).x, s.x);
  assert.equal(s.path.at(-1).y, s.y);
});

test('wave history follows its sinusoidal flight rather than joining only frame endpoints', () => {
  const s = shot('tempest', 2, { laser: false, wave: true, vx: 650, amplitude: 30, r: 10 });
  advance(s, .12);
  assert.ok(s.trail.length > 8);
  for (const p of s.trail) {
    const age = (p.x - s.originX) / s.vx;
    assert.ok(Math.abs(p.y - (s.baseY + Math.sin(age * 22) * s.amplitude)) < 1e-8);
  }
  assert.equal(s.y, s.baseY + Math.sin(s.age * 22) * s.amplitude);
  assert.ok(s.path.every(p => p.y >= s.baseY - s.amplitude && p.y <= s.baseY + s.amplitude));
});

test('terrain crossing is detected even when the final projectile position is past a thin wall', () => {
  const s = shot(), projectedEnd = s.x + s.vx * .4;
  const collision = advance(s, .4, x => x >= 200 && x <= 220);
  assert.ok(collision); assert.ok(collision.x >= 200 && collision.x <= 208);
  assert.ok(projectedEnd > 220, 'the end point alone would miss this wall');
  assert.ok(s.path.every(p => p.x < 200), 'the visible and damaging path ends before the wall');
});

test('existing beam history is clipped at new terrain and cannot hit targets on its far side', () => {
  const s = shot(); advance(s, .25); advance(s, 0, x => x >= 200 && x <= 220);
  assert.ok(s.path.every(p => p.x > 220));
  assert.equal(weapons.contact(s.path, { x: 170, y: 200 }, 5), null);
  assert.ok(weapons.contact(s.path, { x: 260, y: 200 }, 5));
  const ctx = canvas(); weapons.drawShot(ctx, { ...s, pierce: false });
  for (const layer of ctx.paths) assert.ok(layer.points.every(p => p.x > 220));
});

test('contact returns the first intersection along a curved beam and ignores distant targets', () => {
  const path = [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 50 }];
  const first = weapons.contact(path, { x: 20, y: 0 }, 5), second = weapons.contact(path, { x: 50, y: 25 }, 5);
  assert.deepEqual(first, { x: 15, y: 0, distance: 15 });
  assert.deepEqual(second, { x: 50, y: 20, distance: 70 });
  assert.equal(weapons.contact(path, { x: 30, y: 20 }, 5), null);
});

test('LANCER explosion rings end at the actual 38px or 65px damage boundary', () => {
  for (const radius of [38, 65]) {
    const effect = weapons.impact('splash', 200, 250, 'lancer', radius);
    assert.equal(effect.radius, radius);
    for (const age of [0, .1, .29]) {
      const ctx = canvas(); weapons.drawEffects(ctx, [{ ...effect, age }]);
      assert.ok(ctx.arcs.some(arc => arc.r === radius));
      assert.ok(ctx.arcs.every(arc => arc.r <= radius));
    }
  }
});

test('drawing preserves effect clocks, update expires them, and blocked hits are distinct', () => {
  const splash = weapons.impact('splash', 200, 250, 'lancer', 65);
  const blocked = weapons.impact('blocked', 300, 250, 'vector');
  const ctx = canvas(), text = []; ctx.fillText = value => text.push(value);
  weapons.drawEffects(ctx, [splash, blocked]); assert.equal(splash.age, 0); assert.equal(blocked.age, 0);
  assert.ok(text.includes('BLOCK'));
  const effects = weapons.updateEffects([splash, blocked], .2);
  assert.deepEqual(effects, [splash]); assert.equal(splash.age, .2);
  assert.deepEqual(weapons.updateEffects(effects, .13), []);
});

console.log('All ORBITAL laser geometry, visuals and effect checks passed.');
