const test = require('node:test');
const assert = require('node:assert/strict');
const Bosses = require('./bosses.js');
const ship = { x: 170, y: 280 };
const environment = (shots = [], notifications = []) => ({ ship, shoot: (...s) => shots.push(s), notify: text => notifications.push(text) });

test('all five bosses expose distinct targets, finite geometry and scalable durability', () => {
  const maxima = [170, 195, 225, 250, 285], signatures = new Set();
  for (let stage = 0; stage < 5; stage++) {
    const easy = Bosses.create(stage, 'easy'), normal = Bosses.create(stage), hard = Bosses.create(stage, 'hard');
    assert.equal(normal.max, maxima[stage]); assert.ok(easy.max < normal.max && normal.max < hard.max);
    assert.ok(Bosses.targets(normal).includes(normal.core)); assert.equal(normal.core.open, false);
    signatures.add([normal.max, normal.parts.map(p => p.kind).join('+')].join('/'));
    for (const target of Bosses.targets(normal)) assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y) && target.hp > 0 && target.r > 0);
  }
  assert.equal(signatures.size, 5);
});

test('closed cores reject damage while open cores and live destructible parts accept it', () => {
  for (let stage = 0; stage < 5; stage++) {
    const b = Bosses.create(stage); b.age = 2;
    const hp = b.hp;
    assert.equal(Bosses.damage(b, b.core, { damage: 99 }).accepted, false); assert.equal(b.hp, hp);
    for (const p of b.parts) {
      const partHp = p.hp; b.damageBudget = 10;
      const result = Bosses.damage(b, p, { damage: 2 });
      assert.equal(result.accepted, true); assert.ok(p.hp < partHp); assert.equal(b.hp, hp);
    }
    b.core.open = true; b.damageBudget = 10;
    assert.equal(Bosses.damage(b, b.core, { damage: 2 }).accepted, true); assert.equal(b.hp, hp - 2); assert.equal(b.core.hp, b.hp);
    assert.equal(Bosses.damage(b, { hp: 20 }, { damage: 20 }).accepted, false);
  }
});

test('destroyed parts cannot absorb more damage and removing every part warns of a second phase', () => {
  for (const stage of [0, 2, 3, 4]) {
    const b = Bosses.create(stage), notifications = []; b.age = 2;
    for (const p of b.parts) {
      b.damageBudget = 100; const result = Bosses.damage(b, p, { damage: 100 });
      assert.equal(result.partDestroyed, true); assert.equal(p.hp, 0);
      assert.equal(Bosses.targets(b).includes(p), false);
      assert.equal(Bosses.damage(b, p, { damage: 1 }).accepted, false);
    }
    assert.equal(b.phase, 2); assert.ok(b.transition >= 1); assert.equal(b.core.open, false);
    Bosses.update(b, .01, environment([], notifications)); assert.equal(notifications.length, 1);
    Bosses.update(b, .01, environment([], notifications)); assert.equal(notifications.length, 1);
  }
});

test('all bosses pause attacks during a announced second-phase transition at half health', () => {
  for (let stage = 0; stage < 5; stage++) {
    const b = Bosses.create(stage), shots = [], notifications = []; b.age = 2; b.core.open = true; b.damageBudget = 1000;
    const result = Bosses.damage(b, b.core, { damage: b.max * .51 });
    assert.equal(result.phaseChanged, true); assert.equal(b.phase, 2); assert.ok(b.transition > 1);
    assert.equal(Bosses.damage(b, b.core, { damage: 1 }).accepted, false);
    for (let frame = 0; frame < 50; frame++) Bosses.update(b, .02, environment(shots, notifications));
    assert.equal(shots.length, 0); assert.equal(notifications.length, 1); assert.equal(b.core.open, false);
    for (let frame = 0; frame < 200; frame++) Bosses.update(b, .02, environment(shots, notifications));
    assert.ok(shots.length > 0); assert.equal(b.phase, 2);
  }
});

test('a boss shares one damage budget across core and parts and large dt cannot refill it instantly', () => {
  const dps = { easy: 22, normal: 18, hard: 16 };
  for (const [difficulty, rate] of Object.entries(dps)) {
    const b = Bosses.create(0, difficulty); b.age = 2; b.core.open = true;
    const original = b.damageBudget;
    const first = Bosses.damage(b, b.parts[0], { damage: 100 });
    const second = Bosses.damage(b, b.core, { damage: 100 });
    assert.equal(first.damage, original); assert.equal(second.damage, 0); assert.equal(second.accepted, false);
    Bosses.update(b, 10, environment()); assert.ok(Math.abs(b.damageBudget - rate * .1) < 1e-9);
    assert.ok(Math.abs(b.age - 2.1) < 1e-9); assert.ok(b.damageBudget <= rate * .22);
    for (const invalid of [NaN, Infinity, -1, 0]) {
      const snapshot = JSON.stringify(b); Bosses.update(b, invalid, environment()); assert.equal(JSON.stringify(b), snapshot);
    }
  }
});

test('maximum simultaneous option fire remains limited by elapsed time at 30 and 60 FPS', () => {
  for (const fps of [30, 60]) {
    const b = Bosses.create(4); b.age = 2; b.phase = 2; b.core.open = true;
    let damage = 0;
    for (let frame = 0; frame < fps * 2; frame++) {
      Bosses.update(b, 1 / fps, environment()); b.core.open = true;
      for (let option = 0; option < 30; option++) damage += Bosses.damage(b, b.core, { damage: 3 }).damage;
    }
    assert.ok(damage <= 18 * 2 + 18 * .22 + 1e-7); assert.ok(damage >= 18 * 2);
  }
});

test('lancer charge aim and ruin safe gap lock during visible advance warnings', () => {
  const movingShip = { x: 170, y: 240 }, shots = [], env = { ship: movingShip, shoot: (...s) => shots.push(s) };
  const lancer = Bosses.create(1); lancer.age = 4.99;
  Bosses.update(lancer, .02, env); assert.equal(lancer.warning, true); assert.equal(lancer.lockY, 240);
  movingShip.y = 390;
  for (let frame = 0; frame < 50; frame++) { Bosses.update(lancer, .02, env); assert.equal(lancer.warning, true); assert.equal(lancer.lockY, 240); }
  Bosses.update(lancer, .1, env); assert.equal(lancer.warning, false); assert.equal(lancer.lockY, 240);
  const ruin = Bosses.create(3); ruin.age = 2; ruin.cool = 1; movingShip.y = 280;
  Bosses.update(ruin, .1, env); const gap = ruin.gapY;
  for (let frame = 0; frame < 3; frame++) Bosses.update(ruin, .1, env);
  assert.equal(ruin.wallWarning, true); movingShip.y = 420;
  for (let frame = 0; frame < 3; frame++) { Bosses.update(ruin, .1, env); assert.equal(ruin.gapY, gap); }
  const wall = []; ruin.cool = 0; Bosses.update(ruin, .01, { ship: movingShip, shoot: (...s) => wall.push(s) });
  const rows = wall.filter(s => Math.abs(s[2] - Math.PI) < 1e-8).map(s => s[1]);
  assert.ok(rows.length > 0); assert.ok(rows.every(y => Math.abs(y - gap) > 69));
});

test('every boss phase and difficulty has bounded, finite sustained patterns', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) for (let stage = 0; stage < 5; stage++) for (const phase of [1, 2]) {
    const b = Bosses.create(stage, difficulty), shots = []; b.phase = phase;
    for (let frame = 0; frame < 20 * 60; frame++) {
      Bosses.update(b, 1 / 60, environment(shots));
      assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && b.y >= 112 && b.y <= 448);
      for (const target of Bosses.targets(b)) assert.ok(Number.isFinite(target.x) && Number.isFinite(target.y));
    }
    assert.ok(shots.length > 15 && shots.length < 230, `${stage + 1}/${difficulty}/phase ${phase}: ${shots.length}`);
    assert.ok(shots.every(s => s.every(Number.isFinite))); assert.ok(Bosses.status(b).startsWith(`第${phase}形態`));
  }
});

test('accurate basic fire can defeat every boss while maximum gear cannot skip the phase warning', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) for (let stage = 0; stage < 5; stage++) {
    const times = [];
    for (const damagePerVolley of [1, 24]) {
      const b = Bosses.create(stage, difficulty), notices = [];
      let elapsed = 0, nextShot = .16;
      while (b.hp > 0 && elapsed < 110) {
        elapsed += 1 / 60; Bosses.update(b, 1 / 60, environment([], notices));
        if (elapsed >= nextShot) { nextShot += .16; Bosses.damage(b, b.core, { damage: damagePerVolley }); }
      }
      assert.equal(b.hp, 0, `${stage + 1}/${difficulty}: basic or maximum fire cannot clear the core`);
      assert.equal(b.phase, 2); assert.equal(notices.length, 1); times.push(elapsed);
    }
    assert.ok(times[0] > times[1], 'stronger gear should reduce a sustained boss fight');
    assert.ok(times[1] > 10, 'maximum gear must still play through core openings and the phase warning');
  }
});

test('spawn grace, malformed damage and a defeated boss never accept another hit or volley', () => {
  const b = Bosses.create(0), shots = []; b.core.open = true;
  assert.equal(Bosses.damage(b, b.core, { damage: 100 }).accepted, false);
  Bosses.update(b, .1, environment(shots)); assert.equal(shots.length, 0);
  b.age = 2; b.core.open = true;
  for (const damage of [0, -1, NaN, Infinity, undefined]) assert.equal(Bosses.damage(b, b.core, { damage }).accepted, false);
  b.hp = 1; b.core.hp = 1; b.damageBudget = 10;
  assert.equal(Bosses.damage(b, b.core, { damage: 2 }).defeated, true);
  const snapshot = JSON.stringify(b); Bosses.update(b, .1, environment(shots));
  assert.equal(JSON.stringify(b), snapshot); assert.deepEqual(Bosses.targets(b), []); assert.equal(shots.length, 0);
});
