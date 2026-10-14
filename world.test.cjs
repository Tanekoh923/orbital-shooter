const assert = require('node:assert/strict');
const World = require('./world.js');
const Enemies = require('./enemies.js');

function test(name, run) { if (require.main === module) { run(); console.log('PASS: ' + name); } }
const plain = value => JSON.parse(JSON.stringify(value));

test('five terrain profiles preserve a navigable passage across the full viewport', () => {
  assert.deepEqual(plain(World.durations), [65, 60, 60, 60, 70]);
  assert.equal(World.scrollSpeed, 90);
  const signatures = new Set();
  for (let stage = 0; stage < 5; stage++) {
    const signature = [];
    for (let time = 0; time <= World.durations[stage]; time += .5) {
      for (let x = 0; x <= 1200; x += 24) {
        const b = World.bounds(stage, x, time);
        assert.ok(Number.isFinite(b.top) && Number.isFinite(b.bottom));
        assert.ok(b.top >= 0 && b.bottom <= 560);
        assert.ok(b.bottom - b.top >= 200, `stage ${stage + 1}: pinched passage at ${x}/${time}`);
        if (time === 30) signature.push(Math.round(b.top), Math.round(b.bottom));
      }
    }
    signatures.add(signature.join(','));
  }
  assert.equal(signatures.size, 5, 'each stage must have its own terrain profile');
});

test('each stage begins safely and opens a clear arena before its boss', () => {
  for (let stage = 0; stage < 5; stage++) {
    for (const time of [0, 1, 4.99]) {
      assert.equal(World.hazards(stage, time).filter(h => h.active).length, 0);
      assert.equal(World.collides(stage, 170, 280, 15, time).hit, false);
    }
    for (const time of [World.durations[stage] - 5, World.durations[stage], World.durations[stage] + 15]) {
      assert.equal(World.hazards(stage, time).filter(h => h.active).length, 0);
      for (let x = 0; x <= 1200; x += 120) {
        const b = World.bounds(stage, x, time);
        assert.ok(b.top <= 80 && b.bottom >= 480, `stage ${stage + 1}: boss arena too narrow`);
      }
    }
  }
});

test('terrain collision uses both ceiling and floor, with a safe recovery position', () => {
  for (let stage = 0; stage < 5; stage++) {
    for (const x of [70, 170, 550, 1050]) {
      const time = 30, b = World.bounds(stage, x, time), radius = 15;
      const middle = (b.top + b.bottom) / 2;
      const floor = World.collides(stage, x, b.bottom - radius + .5, radius, time);
      const ceiling = World.collides(stage, x, b.top + radius - .5, radius, time);
      assert.equal(floor.hit, true); assert.equal(ceiling.hit, true);
      for (const collision of [floor, ceiling]) {
        assert.ok(Number.isFinite(collision.safeY));
        assert.ok(collision.safeY >= b.top + radius && collision.safeY <= b.bottom - radius);
      }
      // A terrain-only probe cannot assume an obstacle is absent at the middle.
      const collision = World.collides(stage, x, middle, radius, time);
      assert.equal(typeof collision.hit, 'boolean');
    }
  }
});

test('hazard geometry matches collision and warning outlines remain harmless', () => {
  const kinds = new Set(), warnedKinds = new Set();
  for (let stage = 0; stage < 5; stage++) {
    for (let time = 5; time < World.durations[stage] - 9; time += .1) {
      for (const h of World.hazards(stage, time)) {
        if (h.x < 100 || h.x + h.w > 1100 || h.h <= 1) continue;
        const cx = h.r ? h.x : h.x + h.w / 2, cy = h.r ? h.y : h.y + h.h / 2;
        const b = World.bounds(stage, cx, time);
        if (cy <= b.top + 1 || cy >= b.bottom - 1) continue;
        const center = World.collides(stage, cx, cy, 0, time);
        if (h.warning && !h.active) {
          assert.notEqual(center.source?.id, h.id, 'a warning must not damage the ship'); warnedKinds.add(h.kind);
        }
        if (!h.active || kinds.has(h.kind)) continue;
        kinds.add(h.kind); assert.equal(center.hit, true); assert.equal(center.source.id, h.id);
        const edge = h.r ? h.x + h.r : h.x + h.w;
        assert.equal(World.collides(stage, edge + 14.9, cy, 15, time).source?.id, h.id);
        assert.notEqual(World.collides(stage, edge + 15.1, cy, 15, time).source?.id, h.id);
        const recovery = World.collides(stage, cx, cy, 15, time);
        assert.equal(World.collides(stage, cx, recovery.safeY, 15, time).hit, false,
          'hazard recovery must place the whole ship in open space');
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ['gate', 'pillar', 'rock', 'vent']);
  assert.deepEqual([...warnedKinds].sort(), ['gate', 'vent']);
});

test('activating hazards show a visible warning before becoming dangerous', () => {
  let activations = 0;
  for (let stage = 0; stage < 5; stage++) {
    const history = new Map();
    for (let frame = 100; frame < (World.durations[stage] - 9) * 20; frame++) {
      const time = frame / 20;
      for (const h of World.hazards(stage, time)) {
        if (!['gate', 'vent'].includes(h.kind)) continue;
        const entry = history.get(h.id) || { active: false, warning: 0, visibleWarning: 0 };
        const visible = h.x < 1200 && h.x + h.w > 0;
        if (h.warning) {
          entry.warning += .05; if (visible) entry.visibleWarning += .05;
        }
        if (h.active && !entry.active) {
          assert.ok(entry.warning >= 1.7, `${h.id}: insufficient advance warning`);
          if (visible) assert.ok(entry.visibleWarning >= 1, `${h.id}: warning too brief in the viewport`);
          activations++; entry.warning = 0; entry.visibleWarning = 0;
        }
        entry.active = h.active; history.set(h.id, entry);
      }
    }
  }
  assert.ok(activations >= 10, 'the check must exercise several activation cycles');
});

// Find an actual continuous route, rather than sampling isolated free positions.
// A 25px step per .1s is below the unupgraded ship's 260px/s movement limit.
function safeRoute(stage, x = 170) {
  const ys = Array.from({ length: 95 }, (_, i) => 45 + i * 5), duration = World.durations[stage];
  const layers = [], count = Math.ceil(duration * 10);
  let previous = ys.map(y => y === 280 && !World.collides(stage, x, y, 15, 0, false).hit);
  for (let frame = 0; frame <= count; frame++) {
    const time = Math.min(duration, frame / 10), links = ys.map(() => -1), reachable = ys.map(() => false);
    for (let i = 0; i < ys.length; i++) {
      if (World.collides(stage, x, ys[i], 15, time, false).hit) continue;
      if (frame === 0) { reachable[i] = previous[i]; links[i] = i; continue; }
      for (let j = Math.max(0, i - 5); j <= Math.min(ys.length - 1, i + 5); j++) {
        if (!previous[j]) continue;
        let edgeSafe = true;
        for (let step = 1; step < 6; step++) {
          const midY = ys[j] + (ys[i] - ys[j]) * step / 6, midT = time - .1 + step / 60;
          if (World.collides(stage, x, midY, 15, midT, false).hit) { edgeSafe = false; break; }
        }
        if (World.collides(stage, x, ys[i], 15, Math.max(0, time - 1e-6), false).hit) edgeSafe = false;
        if (World.collides(stage, x, ys[j], 15, Math.max(0, time - .1 + 1e-6), false).hit) edgeSafe = false;
        if (!edgeSafe) continue;
        reachable[i] = true; links[i] = j; break;
      }
    }
    assert.ok(reachable.some(Boolean), `stage ${stage + 1}: no reachable route at ${time}s`);
    layers.push(links); previous = reachable;
  }
  let selected = previous.findIndex(Boolean); const route = Array(count + 1);
  for (let frame = count; frame >= 0; frame--) { route[frame] = ys[selected]; selected = layers[frame][selected]; }
  return route;
}

test('all five stages have a continuous safe route at base movement speed', () => {
  for (let stage = 0; stage < 5; stage++) {
    const route = safeRoute(stage);
    for (let frame = 0; frame < route.length - 1; frame++) {
      assert.ok(Math.abs(route[frame + 1] - route[frame]) <= 25);
      for (let step = 0; step <= 6; step++) {
        const time = frame / 10 + step / 60;
        const y = route[frame] + (route[frame + 1] - route[frame]) * step / 6;
        assert.equal(World.collides(stage, 170, y, 15, time, false).hit, false,
          `stage ${stage + 1}: route intersects geometry between ${frame / 10}s samples`);
      }
      assert.equal(World.collides(stage, 170, route[frame + 1], 15, (frame + 1) / 10 - 1e-6, false).hit, false,
        'a disappearing obstacle cannot permit a discontinuous jump at the exact boundary');
    }
  }
});

test('eight enemy roles have distinct metadata and stage-specific capsule-carrying waves', () => {
  assert.deepEqual(Object.keys(Enemies.types).sort(),
    ['armored', 'carrier', 'ceilingTurret', 'charger', 'mine', 'scout', 'turret', 'wave'].sort());
  assert.equal(new Set(Object.values(Enemies.types).map(type => type.description)).size, 8);
  const signatures = new Set(), allKinds = new Set();
  for (let stage = 0; stage < 5; stage++) {
    const composition = [];
    for (let wave = 0; wave < 18; wave++) {
      const batch = Enemies.spawnWave(stage, wave, 6 + wave * 2, x => World.bounds(stage, x, 20));
      assert.ok(batch.length > 0); assert.ok(batch.some(e => e.drop), 'every wave offers an equipment capsule');
      composition.push(batch.map(e => e.kind).join('+'));
      for (const e of batch) {
        allKinds.add(e.kind); assert.ok(Enemies.types[e.kind]);
        assert.ok(e.x > 1200, 'a new enemy must enter from outside the viewport');
        assert.ok(Number.isFinite(e.y) && e.hp > 0 && e.r > 0);
        const b = World.bounds(stage, e.x, 20);
        assert.ok(e.y >= b.top + e.r && e.y <= b.bottom - e.r);
      }
    }
    signatures.add(composition.join(','));
  }
  assert.equal(signatures.size, 5); assert.equal(allKinds.size, 8);
});

test('a charger telegraphs for nearly one second and locks its target before diving', () => {
  const ship = { x: 170, y: 280 }, env = { stage: 0, ship, bounds: () => ({ top: 28, bottom: 532 }) };
  const e = Enemies.create('charger', 1075, 180);
  Enemies.update(e, .01, env); assert.equal(e.mode, 'telegraph');
  assert.ok(e.telegraph >= .9); const lock = [e.lockX, e.lockY];
  ship.x = 300; ship.y = 400;
  Enemies.update(e, .94, env); assert.equal(e.mode, 'telegraph'); assert.deepEqual([e.lockX, e.lockY], lock);
  Enemies.update(e, .02, env); assert.equal(e.mode, 'dive'); assert.deepEqual([e.lockX, e.lockY], lock);
  const angle = Math.atan2(lock[1] - e.y, lock[0] - e.x);
  assert.ok(Math.abs(Math.atan2(e.vy, e.vx) - angle) < 1e-9);
  const x = e.x, y = e.y; Enemies.update(e, .1, env);
  assert.ok(e.x < x); assert.ok(e.y > y);
});

test('floor and ceiling turrets follow the scrolling surface and aim finite shots', () => {
  const shots = [], bounds = x => ({ top: 35 + x * .05, bottom: 520 - x * .1 });
  const env = { stage: 2, ship: { x: 170, y: 280 }, bounds, shoot: (...shot) => shots.push(shot) };
  for (const kind of ['turret', 'ceilingTurret']) {
    const e = Enemies.create(kind, 800, 280, 2, { cool: .1 });
    Enemies.update(e, 1, env); assert.equal(e.x, 710);
    const b = bounds(e.x);
    assert.equal(e.y, kind === 'turret' ? b.bottom - e.r : b.top + e.r);
    assert.ok(Number.isFinite(e.aim));
  }
  assert.equal(shots.length, 2); assert.ok(shots.every(shot => shot.every(Number.isFinite)));
});

test('carriers launch bounded children and periodically supply another capsule', () => {
  const children = [], shots = [], bounds = () => ({ top: 80, bottom: 460 });
  const e = Enemies.create('carrier', 1000, 280, 0);
  const env = { stage: 0, ship: { x: 170, y: 280 }, bounds,
    spawn: child => children.push(child), shoot: (...shot) => shots.push(shot) };
  for (let frame = 0; frame < 145; frame++) Enemies.update(e, .05, env);
  assert.equal(children.length, 3); assert.ok(children.every(child => child.kind === 'scout'));
  assert.ok(children.some(child => child.drop));
  assert.ok(children.every(child => child.y >= 80 + child.r && child.y <= 460 - child.r));
  assert.ok(shots.length > 0);
});

test('front armor reduces regular shots while missiles, lasers and rear attacks bypass it', () => {
  const e = Enemies.create('armored', 600, 280);
  assert.equal(Enemies.damageScale(e, { x: 550, vx: 650 }), .3);
  assert.equal(Enemies.damageScale(e, { prevX: 550, x: 620, vx: 650 }), .3,
    'a swept front shot keeps armor protection after crossing the center');
  assert.equal(Enemies.damageScale(e, { x: 650, vx: 650 }), .3, 'shot direction takes priority over overshoot position');
  for (const shot of [{ missile: true }, { laser: true }, { wave: true }, { orb: true }, { vx: -570 }, { x: 620, vx: 0 }]) {
    assert.equal(Enemies.damageScale(e, shot), 1);
  }
  assert.equal(Enemies.damageScale(Enemies.create('scout', 600, 280), {}), 1);
});

test('rotating mines create one finite radial volley with six separate directions', () => {
  const shots = [], e = Enemies.create('mine', 900, 280, 4, { cool: 0 });
  Enemies.update(e, .02, { stage: 4, ship: { x: 170, y: 280 },
    bounds: () => ({ top: 80, bottom: 480 }), shoot: (...shot) => shots.push(shot) });
  assert.equal(shots.length, 6); assert.equal(new Set(shots.map(shot => shot[2])).size, 6);
  assert.ok(shots.every(shot => shot.every(Number.isFinite)));
  assert.ok(e.cool > 3);
});

if (require.main === module) console.log('All ORBITAL terrain and enemy module checks passed.');
module.exports = { safeRoute };
