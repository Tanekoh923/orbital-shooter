const test = require('node:test');
const assert = require('node:assert/strict');
const Encounters = require('./encounters.js');
const Enemies = require('./enemies.js');
const World = require('./world.js');

function planned(stage, wave, time, difficulty = 'normal') {
  return Encounters.plan(stage, wave, time, x => World.bounds(stage, x, time), World, difficulty);
}

test('five encounter schedules are deterministic and preserve distinct stage compositions', () => {
  const signatures = new Set(), kinds = new Set();
  for (let stage = 0; stage < 5; stage++) {
    const events = [];
    for (let wave = 0; wave < 20; wave++) {
      const time = 1 + wave * 2.6, first = planned(stage, wave, time), second = planned(stage, wave, time);
      assert.deepEqual(first, second);
      assert.ok(first.nextDelay >= .8 && Number.isFinite(first.nextDelay));
      assert.equal(typeof first.label, 'string'); assert.equal(typeof first.calm, 'boolean');
      events.push(first.enemies.map(e => e.kind).join('+'));
      for (const e of first.enemies) {
        kinds.add(e.kind); assert.ok(e.x > 1200 && Number.isFinite(e.y) && e.cool > 0);
        const bounds = World.bounds(stage, e.x, time);
        assert.ok(e.y >= bounds.top + e.r && e.y <= bounds.bottom - e.r);
      }
    }
    signatures.add(events.join('/'));
  }
  assert.equal(signatures.size, 5); assert.equal(kinds.size, 8);
});

test('opening ten seconds offer small scout and wave formations before complex threats', () => {
  const kinds = new Set();
  for (const [wave, time] of [[0, .1], [1, 3.8], [2, 7.5]]) {
    const p = planned(0, wave, time);
    assert.equal(p.enemies.length, 3);
    for (const enemy of p.enemies) {
      kinds.add(enemy.kind); assert.ok(['scout', 'wave'].includes(enemy.kind)); assert.ok(enemy.cool >= 4);
    }
  }
  assert.deepEqual([...kinds].sort(), ['scout', 'wave']);
});

test('terrain pressure accounts for narrow corridors and a bounded two-second hazard horizon', () => {
  assert.equal(Encounters.pressure(0, 170, 3, World), 0);
  assert.ok(Encounters.pressure(2, 170, 30, World) > .25);
  const seen = [];
  const fake = {
    bounds(stage, x, time) { seen.push(time); return { top: 40, bottom: 510 }; },
    hazards(stage, time) { seen.push(time); return time === 12 ? [{ kind: 'gate', x: 400, y: 40, w: 64, h: 150, warning: true, active: false }] : []; },
  };
  const result = Encounters.pressure(4, 170, 10, fake);
  assert.ok(result > .4 && result <= 1); assert.ok(seen.every(time => time >= 10 && time <= 12));
  for (let stage = 0; stage < 5; stage++) for (let time = 0; time < 70; time += .4) {
    const value = Encounters.pressure(stage, 170, time, World); assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
  }
});

test('threatening pillars, vents and gates avoid compound charging, radial or carrier encounters', () => {
  let samples = 0, waits = 0;
  for (const stage of [1, 3, 4]) {
    for (let time = 12; time < World.durations[stage] - 10; time += 1.2) {
      const near = [0, 1, 2].some(ahead => World.hazards(stage, time + ahead).some(h =>
        ['pillar', 'vent', 'gate'].includes(h.kind) && (h.active || h.warning) && h.h > 0 && h.x + h.w >= 115 && h.x <= 650));
      if (!near) continue;
      for (let wave = 0; wave < 15; wave++) {
        const p = planned(stage, wave, time); samples++;
        assert.equal(p.calm, true); assert.ok(p.enemies.length <= 3);
        assert.ok(p.enemies.every(e => !['charger', 'mine', 'carrier'].includes(e.kind)));
        if (!p.enemies.length) { waits++; assert.equal(p.nextDelay, .8); }
      }
    }
  }
  assert.ok(samples > 100); assert.ok(waits > 0);
});

test('all difficulties retain playable wave pacing and occasional capsule rewards', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) for (let stage = 0; stage < 5; stage++) {
    let time = 1.2, wave = 0, empty = 0, total = 0, capsules = 0, withoutCapsule = 0;
    while (time < World.durations[stage] - 5) {
      const p = planned(stage, wave++, time, difficulty);
      const drops = p.enemies.filter(e => e.drop).length;
      assert.ok(drops <= 1); total += p.enemies.length; capsules += drops;
      if (!p.enemies.length) empty++;
      else if (!drops) withoutCapsule++;
      time += p.nextDelay;
    }
    assert.ok(total >= 12); assert.ok(capsules >= 4); assert.ok(withoutCapsule >= 3);
    assert.ok(empty < wave / 3, 'calm windows must not empty a stage');
  }
  const easy = planned(0, 4, 16, 'easy'), normal = planned(0, 4, 16), hard = planned(0, 4, 16, 'hard');
  assert.ok(easy.nextDelay > normal.nextDelay && normal.nextDelay > hard.nextDelay);
});

test('ordinary enemies telegraph aimed fire and cannot shoot from behind or at point-blank range', () => {
  const bounds = () => ({ top: 40, bottom: 520 }), ship = { x: 170, y: 280 };
  for (const kind of ['scout', 'wave', 'turret', 'ceilingTurret', 'armored', 'carrier', 'mine']) {
    const fore = Enemies.create(kind, 700, 280, 0, { cool: .25 });
    Enemies.update(fore, .02, { ship, bounds }); assert.ok(fore.warning > 0);
    for (const x of [100, 240]) {
      const shots = [], e = Enemies.create(kind, x, 280, 0, { cool: 0 });
      Enemies.update(e, .02, { ship, bounds, shoot: (...s) => shots.push(s) }); assert.equal(shots.length, 0, kind + ' at ' + x);
    }
  }
});

test('difficulty and terrain independently change cadence without scaling bullet speed twice', () => {
  const settings = { easy: 1.4, normal: 1, hard: .8 }, bounds = () => ({ top: 40, bottom: 520 }), ship = { x: 170, y: 280 };
  for (const [difficulty, multiplier] of Object.entries(settings)) {
    const e = Enemies.create('scout', 800, 280, 0, { cool: 0 }), shots = [];
    Enemies.update(e, .01, { difficulty, ship, bounds, shoot: (...s) => shots.push(s) });
    assert.equal(e.cool, 3.5 * multiplier); assert.equal(shots[0][3], 175);
    const charger = Enemies.create('charger', 1070, 180, 0);
    Enemies.update(charger, .01, { difficulty, ship, bounds });
    assert.equal(charger.telegraph, { easy: 1.2, normal: .95, hard: .8 }[difficulty]);
    const mine = Enemies.create('mine', 900, 280, 4, { cool: 0 }), radial = [];
    Enemies.update(mine, .02, { difficulty, encounterPressure: .8, ship, bounds, shoot: (...s) => radial.push(s) });
    assert.equal(radial.length, 4); assert.ok(mine.cool > 3);
  }
});

test('invalid encounter inputs and a missing world still produce finite safe schedules', () => {
  for (const input of [NaN, Infinity, -99, 99]) {
    const p = Encounters.plan(input, input, input, () => ({ top: 50, bottom: 500 }), null, 'unknown');
    assert.ok(Number.isFinite(p.nextDelay));
    assert.ok(p.enemies.every(e => Number.isFinite(e.x) && Number.isFinite(e.y)));
  }
});
