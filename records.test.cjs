const test = require('node:test');
const assert = require('node:assert/strict');
const records = require('./records.js');

const defaultSettings = () => ({
  craft: 'vector', defense: 'guard', gauge: [0, 1, 5, 2, 3, 4],
  difficulty: 'normal', mode: 'campaign', stage: 0,
});
const defaults = () => ({
  version: 2, unlockedStage: 0, unlockedBoss: 0, settings: defaultSettings(),
  records: { easy: 0, normal: 0, hard: 0 }, checkpoint: null,
});
function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), values };
}
function checkpoint(defense = 'guard') {
  const capacity = { guard: 3, front: 12, limit: 1, core: 3 }[defense];
  return { stage: 2, difficulty: 'hard', score: 24680, selection: 4,
    ship: { craft: 'prism', defense, gauge: [4, 3, 2, 5, 1, 0], up: [3, 2, 2, 4, capacity, 2], weapon: 5, shieldTime: 2.25 } };
}

test('fresh or malformed progress returns usable defaults', () => {
  for (const raw of [undefined, null, false, 8, 'oops', [], {}]) assert.deepEqual(records.normalize(raw), defaults());
  assert.equal(records.key, 'orbital-progress-v2');
});

test('settings accepts each playable craft, defense, mode and difficulty', () => {
  for (const craft of ['vector', 'tempest', 'lancer', 'prism']) {
    for (const defense of ['guard', 'front', 'limit', 'core']) {
      for (const difficulty of ['easy', 'normal', 'hard']) {
        for (const mode of ['campaign', 'stage', 'boss']) {
          const raw = { craft, defense, difficulty, mode, stage: 4, gauge: [4, 3, 2, 5, 1, 0] };
          assert.deepEqual(records.settings(raw), raw);
        }
      }
    }
  }
});

test('null and primitive settings are recoverable', () => {
  for (const raw of [undefined, null, false, true, 7, 'broken', []]) {
    assert.deepEqual(records.settings(raw), defaultSettings());
    assert.deepEqual(records.normalize({ settings: raw }).settings, defaultSettings());
  }
});

test('unknown settings and invalid stage indexes fall back safely', () => {
  for (const stage of [-1, 5, 1.5, '2', NaN, Infinity, null]) {
    assert.deepEqual(records.settings({ craft: 'unknown', defense: 'unknown', difficulty: 'extreme', mode: 'speedrun', stage }), defaultSettings());
  }
});

test('incomplete, repeated and nonnumeric gauge orders cannot survive restore', () => {
  const sparse = [0, 1, 5, 2, 3, 4]; delete sparse[5];
  for (const gauge of [null, '0,1,5,2,3,4', [], [0, 1, 5, 2, 3], [0, 1, 5, 2, 3, 3], [0, 1, 5, 2, 3, 8], [0, 1, 5, 2, 3, '4'], sparse]) {
    assert.deepEqual(records.settings({ gauge }).gauge, defaultSettings().gauge);
  }
});

test('settings snapshots copy gauge arrays', () => {
  const raw = { gauge: [4, 3, 2, 5, 1, 0] }, restored = records.settings(raw);
  raw.gauge[0] = 0;
  assert.deepEqual(restored.gauge, [4, 3, 2, 5, 1, 0]);
  restored.gauge[1] = 0;
  assert.deepEqual(records.settings().gauge, defaultSettings().gauge);
});

test('progress rejects impossible unlocks and keeps reached bosses available', () => {
  assert.equal(records.normalize({ unlockedStage: 3, unlockedBoss: 1 }).unlockedBoss, 3);
  for (const value of [-1, 5, 2.2, '4', Infinity]) {
    const normalized = records.normalize({ unlockedStage: value, unlockedBoss: value });
    assert.equal(normalized.unlockedStage, 0); assert.equal(normalized.unlockedBoss, 0);
  }
});

test('practice selection cannot move beyond the corresponding unlock', () => {
  const base = { unlockedStage: 1, unlockedBoss: 3 };
  assert.equal(records.normalize({ ...base, settings: { mode: 'stage', stage: 4 } }).settings.stage, 1);
  assert.equal(records.normalize({ ...base, settings: { mode: 'boss', stage: 4 } }).settings.stage, 3);
  assert.equal(records.normalize({ ...base, settings: { mode: 'campaign', stage: 4 } }).settings.stage, 1);
});

test('best scores reject malformed values and discard unknown difficulties', () => {
  assert.deepEqual(records.normalize({ records: { easy: 99, normal: 123, hard: 99999999, nightmare: 8 } }).records,
    { easy: 99, normal: 123, hard: 99999999 });
  for (const value of [-1, 1.2, '500', null, Infinity, 100000000]) {
    assert.deepEqual(records.normalize({ records: { easy: value, normal: value, hard: value } }).records, defaults().records);
  }
});

test('future or foreign fields are sanitized to the current schema', () => {
  const normalized = records.normalize({ version: 999, unlockedStage: 2, futureFeature: true,
    settings: { craft: 'lancer', futureMode: 17 }, records: { normal: 555, unknown: 999 } });
  assert.equal(normalized.version, 2);
  assert.equal(normalized.unlockedStage, 2);
  assert.equal(normalized.settings.craft, 'lancer');
  assert.equal(normalized.records.normal, 555);
  assert.equal('futureFeature' in normalized, false);
  assert.equal('futureMode' in normalized.settings, false);
  assert.equal('unknown' in normalized.records, false);
});

test('valid stage checkpoints retain equipment for every defense type', () => {
  for (const defense of ['guard', 'front', 'limit', 'core']) {
    const raw = checkpoint(defense), restored = records.checkpoint(raw);
    assert.deepEqual(restored, { ...raw, ship: { ...raw.ship, shieldTime: defense === 'limit' ? 2.25 : 0 } });
  }
});

test('missing checkpoint fields and invalid stages or difficulties are discarded', () => {
  for (const raw of [null, undefined, false, 5, 'bad', [], {}, { stage: 2, difficulty: 'hard' },
    { ...checkpoint(), stage: -1 }, { ...checkpoint(), stage: 5 }, { ...checkpoint(), stage: 1.5 },
    { ...checkpoint(), difficulty: 'unknown' }, { ...checkpoint(), ship: { up: [0, 0, 0, 0, 0] } }]) {
    assert.equal(records.checkpoint(raw), null);
  }
});

test('corrupt upgrade levels never restore an invalid ship', () => {
  const maxima = [3, 2, 2, 4, 3, 2];
  for (let index = 0; index < maxima.length; index++) {
    for (const value of [-1, maxima[index] + 1, 0.5, '1', null, undefined, Infinity]) {
      const raw = checkpoint(); raw.ship.up[index] = value;
      assert.equal(records.checkpoint(raw), null, 'upgrade ' + index + ' = ' + String(value));
    }
  }
});

test('sparse upgrade arrays are discarded rather than creating undefined levels', () => {
  const raw = checkpoint(); delete raw.ship.up[1];
  assert.equal(records.checkpoint(raw), null);
  raw.ship.up = Array(6);
  assert.equal(records.checkpoint(raw), null);
});

test('active weapon must be unlocked and score or selection cannot exceed limits', () => {
  for (const weapon of [2, 5]) { const raw = checkpoint(); raw.ship.weapon = weapon; assert.equal(records.checkpoint(raw).ship.weapon, weapon); }
  for (const weapon of [null, 0, 3, '2']) { const raw = checkpoint(); raw.ship.weapon = weapon; assert.equal(records.checkpoint(raw).ship.weapon, null); }
  const locked = checkpoint(); locked.ship.up[5] = 0; assert.equal(records.checkpoint(locked).ship.weapon, null);
  for (const selection of [-2, 6, 1.5, '2']) assert.equal(records.checkpoint({ ...checkpoint(), selection }).selection, -1);
  for (const score of [-1, 100000000, 4.5, '500']) assert.equal(records.checkpoint({ ...checkpoint(), score }).score, 0);
});

test('timed defense stays within its duration and is cleared when unavailable', () => {
  for (const [time, expected] of [[-2, 0], [0, 0], [1.5, 1.5], [99, 3], ['bad', 0]]) {
    const raw = checkpoint('limit'); raw.ship.shieldTime = time;
    const restored = records.checkpoint(raw);
    assert.equal(restored.ship.shieldTime, expected);
    assert.equal(restored.ship.up[4], expected > 0 ? 1 : 0);
  }
  const raw = checkpoint('limit'); raw.ship.up[4] = 0;
  assert.equal(records.checkpoint(raw).ship.shieldTime, 0);
});

test('checkpoint cannot resume a stage beyond saved progress', () => {
  assert.equal(records.normalize({ unlockedStage: 1, checkpoint: checkpoint() }).checkpoint, null);
  assert.equal(records.normalize({ unlockedStage: 2, checkpoint: checkpoint() }).checkpoint.stage, 2);
});

test('checkpoint snapshots isolate equipment and discard unknown fields', () => {
  const raw = checkpoint(); raw.extra = 'secret'; raw.ship.debug = true;
  const restored = records.checkpoint(raw);
  raw.ship.up[0] = 0; raw.ship.gauge[0] = 0;
  assert.equal(restored.ship.up[0], 3); assert.equal(restored.ship.gauge[0], 4);
  assert.equal('extra' in restored, false); assert.equal('debug' in restored.ship, false);
});

test('empty or invalid JSON storage still loads playable defaults', () => {
  for (const text of [undefined, '', '{broken', 'null', '[]', '42', '"broken"']) {
    assert.deepEqual(records.read(storage(text === undefined ? {} : { [records.key]: text })), defaults());
  }
});

test('legacy best migrates to NORMAL and never lowers a newer record', () => {
  assert.deepEqual(records.read(storage({ 'orbital-best': '9000' })).records, { easy: 0, normal: 9000, hard: 0 });
  const saved = JSON.stringify({ records: { easy: 88, normal: 12000, hard: 99 } });
  assert.deepEqual(records.read(storage({ 'orbital-best': '9000', [records.key]: saved })).records,
    { easy: 88, normal: 12000, hard: 99 });
  assert.equal(records.read(storage({ 'orbital-best': '14000', [records.key]: saved })).records.normal, 14000);
  for (const text of ['bad', '-1', '1.5', 'Infinity', '100000000']) assert.equal(records.read(storage({ 'orbital-best': text })).records.normal, 0);
});

test('storage denial or missing storage cannot block a fresh game', () => {
  const denied = { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } };
  for (const unavailable of [denied, null, undefined]) {
    assert.deepEqual(records.read(unavailable), defaults());
    assert.equal(records.save(unavailable, defaults()), false);
  }
});

test('normalized settings, records and stage-entry equipment roundtrip through storage', () => {
  const saved = storage();
  const raw = { version: 2, unlockedStage: 3, unlockedBoss: 4,
    settings: { craft: 'prism', defense: 'front', gauge: [4, 3, 2, 5, 1, 0], difficulty: 'easy', mode: 'boss', stage: 4 },
    records: { easy: 222, normal: 333, hard: 444 }, checkpoint: checkpoint('front'), ignored: true };
  assert.equal(records.save(saved, raw), true);
  assert.deepEqual(records.read(saved), records.normalize(raw));
  assert.equal('ignored' in JSON.parse(saved.getItem(records.key)), false);
  assert.equal(saved.values.size, 1);
});
