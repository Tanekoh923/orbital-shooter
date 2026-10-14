const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const OrbitalWorld = require('./world.js');
const OrbitalEnemies = require('./enemies.js');
const { safeRoute } = require('./world.test.cjs');

// Instrument a test-only copy; production exposes no debug controls.
const production = readFileSync(__dirname + '/game.js', 'utf8');
assert.match(production, /\}\)\(\);\s*$/);
const source = production.replace(/\}\)\(\);\s*$/, `
this.test={reset,launch,pause,update,hit,bossVolley,equip,shoot,updateShots,terrainY,draw,startStage,damageTarget,
 read:()=>({state,stageIndex,t,score,life,selection,ship,boss,bullets,enemies,shots,caps,particles,loadout,enemyWave,routePhase}),
 quiet:()=>{spawn=999;fire=999;shots=[];enemies=[];bullets=[];caps=[];},
 collect:()=>{caps.push({x:ship.x,y:ship.y});update(0);},
 selectUpgrade:i=>{selection=ship.gauge.indexOf(i);},
 fireNow:()=>{fire=0;},
 clearShots:()=>{shots=[];},
 target:(x,y,hp=20)=>{const target={x,y,hp,drop:false};enemies.push(target);return target;},
 reachBoss:()=>{t=stages[stageIndex].duration;spawn=999;},
 killBoss:()=>{boss.hp=1;shots=[{x:boss.x,y:boss.y,vx:0,vy:0,damage:2,age:0,hit:new Set()}];},
 campaignEquipment:()=>{ship.up=[2,2,2,4,3,2];ship.weapon=2;selection=3;life=2;},
 resumeSpawning:()=>{spawn=0;fire=0;},
 vulnerable:()=>{ship.inv=0;ship.up[4]=0;ship.shieldTime=0;}
};})();`);

function element() {
  const listeners = new Map(), classes = new Set(), attributes = new Map(), captured = new Set();
  return {
    textContent: '', innerHTML: '', value: '', checked: false, disabled: false,
    children: [], dataset: {}, blurred: false, style: {},
    bounds: { left: 0, top: 0, width: 100, height: 100 },
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force) {
        const present = force === undefined ? !classes.has(name) : Boolean(force);
        if (present) classes.add(name); else classes.delete(name);
        return present;
      },
      contains(name) { return classes.has(name); },
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    dispatch(type, extra = {}) {
      const event = { target: this, currentTarget: this, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, ...extra };
      this['on' + type]?.(event);
      for (const listener of listeners.get(type) || []) listener(event);
      return event;
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    getBoundingClientRect() { return this.bounds; },
    setPointerCapture(id) { captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) {
      if (captured.delete(id)) this.dispatch('lostpointercapture', { pointerId: id });
    },
    blur() { this.blurred = true; },
    getContext() {
      const gradient = { addColorStop() {} }, noop = () => {};
      return new Proxy({ globalAlpha: 1 }, {
        get(target, property) {
          if (property in target) return target[property];
          return target[property] = ['createLinearGradient', 'createRadialGradient'].includes(property)
            ? () => gradient : noop;
        },
      });
    },
  };
}

function fixture(craft = 'vector', defense = 'guard') {
  const elements = new Map();
  const slots = Array.from({ length: 6 }, (_, i) => Object.assign(element(), { dataset: { gaugeSlot: String(i) } }));
  const docListeners = new Map(), winListeners = new Map();
  const document = {
    hidden: false, body: element(),
    querySelector(selector) {
      if (!elements.has(selector)) elements.set(selector, element());
      return elements.get(selector);
    },
    querySelectorAll(selector) { assert.equal(selector, '[data-gauge-slot]'); return slots; },
    addEventListener(type, fn) { docListeners.set(type, fn); },
    documentElement: { style: { setProperty() {} } },
  };
  document.querySelector('#upgrades').children = Array.from({ length: 6 }, element);
  const context = vm.createContext({
    document,
    window: { addEventListener(type, fn) { winListeners.set(type, fn); } },
    localStorage: { getItem() { return '0'; }, setItem() {} },
    requestAnimationFrame() {}, Math, console, OrbitalWorld, OrbitalEnemies,
  });
  vm.runInContext(source, context);
  const g = context.test;
  function change(selector, value) {
    const el = typeof selector === 'number' ? slots[selector] : elements.get(selector);
    el.value = String(value); el.dispatch('change');
  }
  change('#craft-select', craft); change('#defense-select', defense);
  function start() { elements.get('#start').onclick(); g.quiet(); }
  function equip(id) { g.selectUpgrade(id); g.equip(); }
  function fire() { g.clearShots(); g.shoot(g.read().ship.x, g.read().ship.y); return g.read().shots; }
  return { g, elements, slots, change, start, equip, fire, document, docListeners, winListeners };
}

function test(name, run) { run(); console.log('PASS: ' + name); }
const plain = value => JSON.parse(JSON.stringify(value));

test('preflight defaults, six-slot swapping, capsule selection and mission config lock', () => {
  const f = fixture(), { g, elements, change, slots } = f;
  assert.equal(elements.get('#loadout-fieldset').disabled, false);
  assert.deepEqual(plain(g.read().loadout.gauge), [0, 1, 5, 2, 3, 4]);
  change(0, 5);
  assert.deepEqual(plain(g.read().loadout.gauge), [5, 1, 0, 2, 3, 4]);
  assert.equal(new Set(g.read().loadout.gauge).size, 6); assert.equal(slots[2].value, '0');
  change(1, 4); const customOrder = [5, 4, 0, 2, 3, 1];
  assert.deepEqual(plain(g.read().loadout.gauge), customOrder);
  change('#craft-select', 'tempest'); change('#defense-select', 'core'); f.start();
  assert.equal(elements.get('#start').blurred, true); assert.equal(elements.get('#loadout-fieldset').disabled, true);
  assert.equal(g.read().ship.craft, 'tempest'); assert.equal(g.read().ship.defense, 'core');
  assert.deepEqual(plain(g.read().ship.gauge), customOrder);
  change(0, 0); change('#craft-select', 'prism');
  assert.deepEqual(plain(g.read().loadout.gauge), customOrder); assert.equal(g.read().loadout.craft, 'tempest');
  g.collect(); assert.equal(g.read().selection, 0); assert.match(elements.get('#notice').textContent, /DOUBLE READY/);
  g.equip(); assert.equal(g.read().ship.weapon, 5); assert.equal(g.read().ship.up[5], 1);
  assert.equal(g.read().ship.up[0], 0); assert.equal(g.read().selection, -1);
  for (let i = 0; i < 7; i++) g.collect();
  assert.equal(g.read().selection, 0); assert.equal(g.read().score, 400);
});

test('weapon Lv.2, mutually exclusive activation, retained levels and max selection', () => {
  const { g, start, equip, fire } = fixture(); start();
  equip(1); assert.equal(g.read().ship.up[1], 1); const missileLv1 = fire().find(s => s.missile);
  equip(1); assert.equal(g.read().ship.up[1], 2); const missileLv2 = fire().filter(s => s.missile);
  assert.equal(missileLv2.length, 2); assert.ok(missileLv2[0].damage > missileLv1.damage);
  equip(5); assert.equal(g.read().ship.weapon, 5);
  equip(2); assert.equal(g.read().ship.weapon, 2); assert.equal(g.read().ship.up[5], 1);
  equip(5); assert.equal(g.read().ship.weapon, 5); assert.equal(g.read().ship.up[5], 2); assert.equal(g.read().ship.up[2], 1);
  equip(2); assert.equal(g.read().ship.weapon, 2); assert.equal(g.read().ship.up[2], 2);
  equip(5); assert.equal(g.read().ship.weapon, 5); assert.equal(g.read().ship.up[5], 2); assert.equal(g.read().selection, -1);
  equip(5); assert.equal(g.read().selection, g.read().ship.gauge.indexOf(5)); assert.equal(g.read().ship.up[5], 2);
  equip(2); assert.equal(g.read().ship.up[2], 2); assert.equal(g.read().ship.weapon, 2);
  assert.ok(fire().some(s => s.laser && s.pierce));
});

test('VECTOR forward laser, diagonal double and terrain-following missile', () => {
  const { g, start, equip, fire } = fixture('vector'); start();
  equip(5); assert.ok(fire().some(s => s.vx > 0 && s.vy < 0));
  equip(2); let shots = fire(); assert.equal(shots.length, 1); assert.ok(shots[0].laser); assert.equal(shots[0].pierce, false);
  equip(2); shots = fire(); assert.ok(shots[0].pierce);
  const first = g.target(shots[0].x + 30, shots[0].y), second = g.target(shots[0].x + 65, shots[0].y);
  g.updateShots(.1); assert.ok(first.hp < 20); assert.ok(second.hp < 20);
  const previousHp = first.hp; g.updateShots(0); assert.equal(first.hp, previousHp);
  equip(1); const missile = fire().find(s => s.missile);
  missile.y = g.terrainY(missile.x); g.updateShots(.01);
  assert.equal(missile.vy, 0); assert.ok(missile.vx > 0);
  assert.ok(Math.abs(missile.y - (g.terrainY(missile.x) - 8)) < .001);
  const downhillX = Array.from({ length: 1000 }, (_, x) => x).find(x => g.terrainY(x + 8) > g.terrainY(x) + 1);
  assert.notEqual(downhillX, undefined);
  missile.x = downhillX; missile.y = g.terrainY(downhillX); g.updateShots(0);
  const hilltopY = missile.y; g.updateShots(.02);
  assert.ok(missile.y > hilltopY, 'grounded missile must descend with the terrain');
  assert.ok(Math.abs(missile.y - (g.terrainY(missile.x) - 8)) < .001);
});

test('TEMPEST rear double, wave laser and upper/lower missiles', () => {
  const { g, start, equip, fire } = fixture('tempest'); start();
  equip(5); let shots = fire(); assert.ok(shots.some(s => s.vx < 0)); assert.ok(shots.some(s => s.vx > 0));
  equip(5); assert.ok(fire().filter(s => s.vx < 0).length > shots.filter(s => s.vx < 0).length);
  equip(2); const wave = fire()[0], originalY = wave.y; g.updateShots(.03);
  assert.notEqual(wave.y, originalY); assert.ok(wave.x > 194);
  equip(1); const missiles = fire().filter(s => s.missile);
  assert.ok(missiles.some(s => s.vy < 0)); assert.ok(missiles.some(s => s.vy > 0));
});

test('LANCER fan double, splash damage and homing missiles', () => {
  const { g, start, equip, fire } = fixture('lancer'); start();
  equip(5); let shots = fire(); assert.ok(shots.some(s => s.vy < 0)); assert.ok(shots.some(s => s.vy > 0));
  equip(2); const orb = fire()[0];
  const direct = g.target(orb.x, orb.y), nearby = g.target(orb.x + 30, orb.y);
  g.updateShots(0); assert.ok(direct.hp < 20); assert.ok(nearby.hp < 20); assert.ok(direct.hp < nearby.hp);
  g.quiet(); equip(1); const missile = fire().find(s => s.missile), initialVy = missile.vy;
  g.target(missile.x + 350, missile.y - 150); g.updateShots(.1); assert.ok(missile.vy < initialVy);
});

test('PRISM laser branching, double ricochet and straight explosive rockets', () => {
  const { g, start, equip, fire } = fixture('prism'); start();
  equip(2); assert.equal(fire().filter(s => s.laser).length, 2);
  equip(2); assert.equal(fire().filter(s => s.laser).length, 3);
  equip(5); const bounce = fire().find(s => s.bounce && s.vy < 0);
  bounce.y = 35; const initialVy = bounce.vy; g.updateShots(.05);
  assert.equal(bounce.y, 34); assert.equal(bounce.vy, -initialVy);
  equip(1); const missile = fire().find(s => s.missile);
  assert.equal(missile.vy, 0); assert.ok(missile.vx > 0); assert.ok(missile.splash > 0);
});

test('four OPTION limit and shared weapon firing', () => {
  const { g, start, equip, elements } = fixture(); start();
  for (let i = 0; i < 4; i++) equip(3);
  assert.equal(g.read().ship.up[3], 4); equip(3); assert.equal(g.read().ship.up[3], 4);
  assert.equal(g.read().selection, g.read().ship.gauge.indexOf(3));
  equip(2); g.fireNow(); elements.get('#auto').checked = true; g.update(0);
  const shots = g.read().shots; assert.equal(shots.length, 5); assert.ok(shots.every(s => s.laser));
  assert.equal(new Set(shots.map(s => s.x)).size, 5); assert.ok(shots.slice(1).every(s => s.damage < shots[0].damage));
});

test('GUARD catches vertical hits and terrain, while front hits damage the hull', () => {
  const { g, start, equip } = fixture('vector', 'guard'); start(); equip(4);
  const ship = g.read().ship; ship.inv = 0;
  for (let i = 0; i < 4; i++) g.hit({ x: ship.x, y: 560 }, true);
  assert.equal(g.read().life, 3); assert.equal(ship.up[4], 3);
  g.hit({ x: ship.x, y: ship.y - 20 }); assert.equal(ship.up[4], 2); assert.equal(g.read().life, 3);
  ship.inv = 0; g.hit({ x: ship.x, y: ship.y + 20 }); assert.equal(ship.up[4], 1);
  ship.inv = 0; g.hit({ x: ship.x + 20, y: ship.y }); assert.equal(g.read().life, 2); assert.equal(ship.up[4], 1);
  ship.inv = 0; g.hit({ x: ship.x, y: ship.y - 20 }); assert.equal(ship.up[4], 0);
  ship.inv = 0; g.hit({ x: ship.x, y: 560 }, true); assert.equal(g.read().life, 1);
});

test('SHIELD has twelve front charges; FORCE FIELD covers every direction', () => {
  const front = fixture('vector', 'front'); front.start(); front.equip(4);
  const ship = front.g.read().ship; assert.equal(ship.up[4], 12);
  for (let i = 0; i < 12; i++) { ship.inv = 0; front.g.hit({ x: ship.x + 20, y: ship.y }); }
  assert.equal(ship.up[4], 0); assert.equal(front.g.read().life, 3);
  front.equip(4); ship.inv = 0; front.g.hit({ x: ship.x - 20, y: ship.y });
  assert.equal(front.g.read().life, 2); assert.equal(ship.up[4], 12);
  ship.inv = 0; front.g.hit({ x: ship.x, y: 560 }, true); assert.equal(front.g.read().life, 1);
  const core = fixture('vector', 'core'); core.start(); core.equip(4); const sphere = core.g.read().ship;
  for (const [dx, dy] of [[20, 0], [-20, 0], [0, -20]]) { sphere.inv = 0; core.g.hit({ x: sphere.x + dx, y: sphere.y + dy }); }
  assert.equal(sphere.up[4], 0); assert.equal(core.g.read().life, 3);
  core.equip(4); sphere.inv = 0; core.g.hit({ x: sphere.x, y: 560 }, true); assert.equal(core.g.read().life, 2);
});

test('LIMIT lasts three play seconds, freezes while paused and can re-equip after expiry', () => {
  const { g, start, equip, elements } = fixture('vector', 'limit'); start(); equip(4);
  const ship = g.read().ship; ship.inv = 0;
  assert.equal(ship.shieldTime, 3); g.hit(); assert.equal(g.read().life, 3);
  g.update(1); assert.equal(ship.shieldTime, 2);
  equip(4); assert.equal(ship.shieldTime, 2); assert.ok(g.read().selection >= 0);
  g.pause(); const pausedTime = g.read().t; g.update(10);
  assert.equal(g.read().t, pausedTime); assert.equal(ship.shieldTime, 2);
  g.pause(); g.update(1.9); assert.ok(ship.shieldTime > 0); g.hit(); assert.equal(g.read().life, 3);
  g.update(.2); assert.equal(ship.shieldTime, 0); assert.equal(ship.up[4], 0);
  assert.equal(elements.get('#defense-status').textContent, 'SHIELD OFF');
  g.hit(); assert.equal(g.read().life, 2); equip(4); assert.equal(ship.shieldTime, 3);
});

test('enemies and capsules stay above terrain and low capsules remain collectible', () => {
  const { g, start } = fixture(); start();
  const lowEnemy = { x: 850, y: 550, base: 700, hp: 20, age: 0, phase: 0, cool: 999, type: 0 };
  const highEnemy = { ...lowEnemy, x: 900, y: -100, base: -100 };
  const capsule = { x: 600, y: 550 };
  g.read().enemies.push(lowEnemy, highEnemy); g.read().caps.push(capsule); g.update(0);
  assert.ok(lowEnemy.y <= g.terrainY(lowEnemy.x) - 35); assert.ok(highEnemy.y >= 35);
  assert.ok(capsule.y <= g.terrainY(capsule.x) - 28); assert.equal(g.read().score, 0);
  g.read().ship.x = capsule.x; g.read().ship.y = capsule.y; g.update(0);
  assert.equal(g.read().selection, 0); assert.equal(g.read().score, 50); assert.equal(g.read().life, 3);
});

test('five-stage campaign preserves build, clears hazards, recovers hull and unlocks replay setup', () => {
  const f = fixture('prism', 'core'), { g, elements } = f;
  f.change(0, 4); const campaignGauge = plain(g.read().loadout.gauge); f.start(); g.campaignEquipment();
  for (let i = 0; i < 5; i++) {
    assert.equal(g.read().stageIndex, i); assert.equal(g.read().state, 'playing');
    assert.equal(elements.get('#loadout-fieldset').disabled, true);
    g.pause(); const pausedTime = g.read().t; g.update(1); assert.equal(g.read().t, pausedTime); g.pause();
    g.reachBoss(); g.update(0); assert.ok(g.read().boss); assert.equal(g.read().boss.max, [230, 280, 330, 380, 460][i]);
    g.bossVolley(); assert.ok(g.read().bullets.length > 0);
    assert.ok(g.read().bullets.every(b => Number.isFinite(b.vx) && Number.isFinite(b.vy)));
    g.killBoss(); g.update(0); assert.equal(g.read().state, i === 4 ? 'won' : 'stageclear');
    if (i < 4) {
      assert.equal(elements.get('#loadout-fieldset').disabled, true);
      f.change('#craft-select', 'tempest'); assert.equal(g.read().loadout.craft, 'prism'); elements.get('#start').onclick();
      assert.equal(g.read().life, 3); assert.deepEqual(plain(g.read().ship.up), [2, 2, 2, 4, 3, 2]);
      assert.equal(g.read().ship.weapon, 2); assert.equal(g.read().ship.craft, 'prism'); assert.equal(g.read().ship.defense, 'core');
      assert.deepEqual(plain(g.read().ship.gauge), campaignGauge); assert.equal(g.read().selection, 3);
      for (const field of ['bullets', 'enemies', 'shots', 'caps']) assert.equal(g.read()[field].length, 0);
      assert.equal(g.read().t, 0); g.quiet();
    }
  }
  assert.equal(g.read().score, 75000); assert.equal(elements.get('#title').textContent, 'ALL CLEAR');
  assert.equal(elements.get('#loadout-fieldset').disabled, false);
  assert.equal(elements.get('#defense-status').textContent, '未装備');
  for (const cell of elements.get('#upgrades').children) {
    assert.doesNotMatch(cell.textContent, /Lv\./); assert.equal(cell.classList.contains('owned'), false);
    assert.equal(cell.classList.contains('selected'), false);
  }
  f.change('#craft-select', 'lancer'); f.change('#defense-select', 'limit'); f.change(0, 3); f.start();
  assert.equal(g.read().stageIndex, 0); assert.equal(g.read().score, 0); assert.equal(g.read().ship.craft, 'lancer');
  assert.equal(g.read().ship.defense, 'limit'); assert.equal(g.read().ship.gauge[0], 3);
  assert.deepEqual(plain(g.read().ship.up), [0, 0, 0, 0, 0, 0]); assert.equal(g.read().ship.weapon, null);
  for (let i = 0; i < 3; i++) { g.vulnerable(); g.hit(); }
  assert.equal(g.read().state, 'over'); assert.equal(elements.get('#loadout-fieldset').disabled, false);
  f.change('#craft-select', 'tempest'); f.start(); assert.equal(g.read().ship.craft, 'tempest'); assert.equal(g.read().life, 3);
});

test('form keys do not launch or equip; window blur and page hide pause the mission', () => {
  const { g, start, elements, winListeners, docListeners, document } = fixture(); const keydown = winListeners.get('keydown');
  keydown({ code: 'Enter', target: { closest: () => ({}) } }); assert.equal(g.read().state, 'ready');
  start(); g.selectUpgrade(5);
  keydown({ code: 'KeyX', target: { closest: () => ({}) } }); assert.equal(g.read().ship.weapon, null);
  const summaryTarget = { closest: selector => selector === 'summary,button' ? {} : null };
  keydown({ code: 'KeyP', target: summaryTarget }); assert.equal(g.read().state, 'paused'); g.pause();
  const initialX = g.read().ship.x; keydown({ code: 'KeyD', target: summaryTarget }); g.update(.02);
  assert.ok(g.read().ship.x > initialX); winListeners.get('keyup')({ code: 'KeyD' });
  elements.get('#auto').dispatch('change'); assert.equal(elements.get('#auto').blurred, true);
  elements.get('#touchpower').onclick(); assert.equal(elements.get('#touchpower').blurred, true);
  elements.get('#sound').onclick(); assert.equal(elements.get('#sound').blurred, true);
  winListeners.get('blur')(); assert.equal(g.read().state, 'paused');
  g.pause(); document.hidden = true; docListeners.get('visibilitychange')(); assert.equal(g.read().state, 'paused');
});

function point(el, type, pointerId, clientX = 82, clientY = 50) {
  return el.dispatch(type, { pointerId, clientX, clientY, pointerType: 'touch' });
}

function assertTouchStopped(f) {
  const { g, elements } = f, ship = g.read().ship, x = ship.x, y = ship.y;
  g.quiet(); g.fireNow(); g.update(.02);
  assert.equal(ship.x, x); assert.equal(ship.y, y); assert.equal(g.read().shots.length, 0);
  assert.equal(elements.get('#joystick').classList.contains('pressed'), false);
  assert.equal(elements.get('#touchfire').classList.contains('pressed'), false);
  assert.equal(elements.get('#joystick-knob').style.transform, 'translate(0px, 0px)');
}

test('joystick and FIRE support separate fingers; unrelated pointer releases cannot cancel either', () => {
  const f = fixture(), { g, elements } = f; f.start();
  const stick = elements.get('#joystick'), fire = elements.get('#touchfire'), ship = g.read().ship;
  assert.equal(point(stick, 'pointerdown', 0).defaultPrevented, true);
  assert.equal(stick.hasPointerCapture(0), true);
  assert.equal(point(fire, 'pointerdown', 2).defaultPrevented, true);
  assert.equal(fire.hasPointerCapture(2), true);
  point(stick, 'pointerdown', 3, 18); point(stick, 'pointermove', 3, 18);
  point(fire, 'pointerdown', 4);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    point(stick, type, 3); point(fire, type, 4);
  }
  const x = ship.x; g.fireNow(); g.update(.1);
  assert.ok(ship.x > x); assert.ok(g.read().shots.length > 0);
  point(stick, 'pointerup', 0);
  const stoppedX = ship.x; g.clearShots(); g.fireNow(); g.update(.1);
  assert.equal(ship.x, stoppedX); assert.ok(g.read().shots.length > 0, 'releasing movement keeps FIRE held');
  point(stick, 'pointerdown', 5);
  point(fire, 'pointerup', 2);
  g.clearShots(); g.fireNow(); g.update(.1);
  assert.ok(ship.x > stoppedX); assert.equal(g.read().shots.length, 0, 'releasing FIRE keeps movement held');
  point(stick, 'pointerup', 5); assertTouchStopped(f);
});

test('joystick dead zone prevents drift and diagonal movement stays within normal ship speed', () => {
  const f = fixture(), { g, elements } = f; f.start();
  const stick = elements.get('#joystick'), ship = g.read().ship, x = ship.x, y = ship.y;
  point(stick, 'pointerdown', 10, 52, 50); g.update(.1); assert.equal(ship.x, x); assert.equal(ship.y, y);
  point(stick, 'pointermove', 10, 150, 150); g.update(.1);
  assert.ok(ship.x > x); assert.ok(ship.y > y);
  assert.ok(Math.abs(Math.hypot(ship.x - x, ship.y - y) - 26) < .001);
  point(stick, 'pointerup', 10); assertTouchStopped(f);
});

test('canvas drag is relative at scaled sizes and its owning finger alone controls movement', () => {
  const f = fixture(), { g, elements } = f; f.start();
  const canvas = elements.get('#game'), ship = g.read().ship;
  canvas.bounds = { left: 20, top: 100, width: 600, height: 280 };
  const x = ship.x, y = ship.y;
  point(canvas, 'pointerdown', 20, 520, 180); g.update(.05);
  assert.equal(ship.x, x); assert.equal(ship.y, y, 'touching far from the ship must not teleport or pull it');
  assert.equal(canvas.hasPointerCapture(20), true);
  point(canvas, 'pointerdown', 21, 400, 180); point(canvas, 'pointermove', 21, 380, 180);
  point(canvas, 'pointerup', 21); g.update(.05); assert.equal(ship.x, x);
  point(canvas, 'pointermove', 20, 525, 180); g.update(.01);
  assert.ok(Math.abs(ship.x - x - 1.3) < .001, '5 CSS pixels become 10 game pixels before movement smoothing');
  point(canvas, 'pointerup', 20); assertTouchStopped(f);
});

test('pointer cancellation and lost capture stop joystick, FIRE and canvas drag without stuck input', () => {
  for (const event of ['pointercancel', 'lostpointercapture']) {
    for (const selector of ['#joystick', '#touchfire', '#game']) {
      const f = fixture(); f.start(); const el = f.elements.get(selector);
      point(el, 'pointerdown', 30);
      if (selector === '#game') point(el, 'pointermove', 30, 92, 50);
      point(el, event, 30); assertTouchStopped(f);
      point(el, 'pointermove', 30, 100, 80); assertTouchStopped(f);
    }
  }
});

test('touch pause releases held inputs, ignores gameplay touches and keeps accessible labels in sync', () => {
  const f = fixture(), { g, elements } = f; f.start();
  point(elements.get('#joystick'), 'pointerdown', 40); point(elements.get('#touchfire'), 'pointerdown', 41);
  elements.get('#touchpause').dispatch('click');
  assert.equal(g.read().state, 'paused'); assert.equal(elements.get('#touchpause').blurred, true);
  assert.equal(elements.get('#touchpause').getAttribute('aria-label'), '再開');
  assert.equal(elements.get('#pause').getAttribute('aria-label'), '再開');
  const x = g.read().ship.x, y = g.read().ship.y, t = g.read().t;
  for (const selector of ['#joystick', '#touchfire', '#game']) {
    point(elements.get(selector), 'pointerdown', 42); point(elements.get(selector), 'pointermove', 42, 100, 90);
  }
  g.selectUpgrade(2); elements.get('#touchpower').dispatch('click'); g.fireNow(); g.update(1);
  assert.equal(g.read().ship.weapon, null); assert.equal(g.read().t, t);
  assert.equal(g.read().ship.x, x); assert.equal(g.read().ship.y, y);
  elements.get('#touchpause').dispatch('click'); assert.equal(g.read().state, 'playing');
  assert.equal(elements.get('#touchpause').getAttribute('aria-label'), '一時停止');
  assert.equal(elements.get('#pause').getAttribute('aria-label'), '一時停止'); assertTouchStopped(f);
});

test('resize clears movement and shooting; orientation change also pauses and safely resumes', () => {
  const f = fixture(), { g, elements, winListeners } = f; f.start();
  for (const event of ['resize', 'orientationchange']) {
    point(elements.get('#joystick'), 'pointerdown', 50); point(elements.get('#touchfire'), 'pointerdown', 51);
    winListeners.get(event)();
    assert.equal(g.read().state, event === 'orientationchange' ? 'paused' : 'playing');
    if (g.read().state === 'paused') g.pause();
    assertTouchStopped(f);
    point(elements.get('#joystick'), 'pointermove', 50, 100, 100); assertTouchStopped(f);
  }
  const canvas = elements.get('#game'); point(canvas, 'pointerdown', 52); point(canvas, 'pointermove', 52, 92, 50);
  winListeners.get('resize')(); assertTouchStopped(f);
});

test('stage transition, reset and game over release all touches before the next launch', () => {
  for (const transition of ['stage', 'reset', 'gameover']) {
    const f = fixture(), { g, elements } = f; f.start();
    point(elements.get('#joystick'), 'pointerdown', 60); point(elements.get('#touchfire'), 'pointerdown', 61);
    if (transition === 'stage') {
      g.reachBoss(); g.update(0); g.killBoss(); g.update(0);
      assert.equal(g.read().state, 'stageclear'); f.start(); assert.equal(g.read().stageIndex, 1);
    } else if (transition === 'gameover') {
      for (let i = 0; i < 3; i++) { g.vulnerable(); g.hit(); }
      assert.equal(g.read().state, 'over');
      assert.equal(elements.get('#joystick').classList.contains('pressed'), false);
      assert.equal(elements.get('#touchfire').classList.contains('pressed'), false); f.start();
    } else g.reset();
    assertTouchStopped(f);
    point(elements.get('#joystick'), 'pointermove', 60, 100, 100); assertTouchStopped(f);
  }
});

test('focus mode toggles presentation and ARIA state, while clearing active touch controls', () => {
  const f = fixture(), { elements, document } = f; f.start();
  const button = elements.get('#focus-mode');
  for (const active of [true, false]) {
    point(elements.get('#joystick'), 'pointerdown', 70); point(elements.get('#touchfire'), 'pointerdown', 71);
    button.dispatch('click');
    assert.equal(document.body.classList.contains('game-focus'), active);
    assert.equal(button.getAttribute('aria-pressed'), String(active));
    assert.equal(button.textContent, active ? '通常表示' : 'ゲームを大きく');
    assert.equal(button.blurred, true); assertTouchStopped(f);
  }
});

test('new enemy telegraphs and route state freeze on pause and reset between stages', () => {
  const { g, start } = fixture(); start(); g.startStage(3); g.quiet();
  const charger = OrbitalEnemies.create('charger', 1000, 180, 3);
  const carrier = OrbitalEnemies.create('carrier', 800, 280, 3);
  g.read().enemies.push(charger, carrier); g.update(.1);
  assert.equal(charger.mode, 'telegraph');
  g.pause(); const snapshot = plain(g.read()); g.update(10); g.draw(10, 10);
  assert.deepEqual(plain(g.read()), snapshot, 'all new timers and particles freeze while paused');
  g.pause(); g.reachBoss(); g.update(0); g.killBoss(); g.update(0);
  assert.equal(g.read().state, 'stageclear'); g.launch();
  assert.equal(g.read().stageIndex, 4); assert.equal(g.read().enemyWave, 0); assert.equal(g.read().routePhase, '');
  for (const field of ['enemies', 'shots', 'bullets', 'caps', 'particles']) assert.equal(g.read()[field].length, 0);
  g.update(.01); assert.ok(g.read().enemyWave > 0); g.reset();
  assert.equal(g.read().stageIndex, 0); assert.equal(g.read().enemyWave, 0);
  assert.equal(g.read().routePhase, ''); assert.equal(g.read().enemies.length, 0);
});

test('integrated armor damage grants enemy score and capsule exactly once', () => {
  const { g, start } = fixture(); start(); const enemy = OrbitalEnemies.create('armored', 600, 280, 0, { drop: true });
  g.read().enemies.push(enemy); const hp = enemy.hp;
  g.damageTarget(enemy, { damage: 1, x: 550, vx: 650 }); assert.equal(enemy.hp, hp - .3);
  g.damageTarget(enemy, { damage: 1, laser: true }); assert.equal(enemy.hp, hp - 1.3);
  enemy.hp = .1; g.damageTarget(enemy, { damage: 1, missile: true });
  assert.equal(g.read().score, 300); assert.equal(g.read().caps.length, 1);
  g.damageTarget(enemy, { damage: 1, laser: true });
  assert.equal(g.read().score, 300); assert.equal(g.read().caps.length, 1);
});

test('a player laser inside the ceiling cannot damage an enemy through terrain', () => {
  const { g, start, equip, fire } = fixture(); start(); equip(2); equip(2);
  const laser = fire()[0]; laser.y = OrbitalWorld.bounds(0, laser.x, 0).top - 1;
  const target = g.target(laser.x, laser.y); g.updateShots(0);
  assert.equal(laser.dead, true); assert.equal(target.hp, 20);
});

test('headless full-length campaign follows a safe route without invalid or runaway entities', () => {
  const { g, start, elements } = fixture('prism', 'core'); start();
  const seenKinds = new Set(), maxima = { enemies: 0, bullets: 0, shots: 0, caps: 0, particles: 0 };
  const limits = { enemies: 24, bullets: 220, shots: 350, caps: 80, particles: 600 };
  elements.get('#auto').checked = true;
  for (let stage = 0; stage < 5; stage++) {
    g.startStage(stage); g.campaignEquipment(); g.read().ship.up[0] = 0; g.resumeSpawning();
    const route = safeRoute(stage), duration = OrbitalWorld.durations[stage], frames = (duration + 12) * 60;
    for (let frame = 0; frame < frames; frame++) {
      const before = g.read(), nextTime = before.t + 1 / 60;
      const routeIndex = Math.min(route.length - 1, Math.floor(nextTime * 10));
      const nextIndex = Math.min(route.length - 1, routeIndex + 1), fraction = nextTime * 10 - routeIndex;
      const y = route[routeIndex] + (route[nextIndex] - route[routeIndex]) * fraction;
      before.ship.x = 170; before.ship.y = y; before.ship.inv = 1000;
      if (before.boss) before.boss.hp = 1e6;
      assert.equal(OrbitalWorld.collides(stage, 170, y, 15, nextTime, false).hit, false);
      g.update(1 / 60);
      // Physics runs at60Hz; a20Hz no-op canvas still exercises every render path and particle cleanup.
      if (frame % 3 === 2) g.draw(3 / 60, nextTime);
      const current = g.read();
      assert.equal(current.state, 'playing'); assert.ok(Number.isFinite(current.ship.x) && Number.isFinite(current.ship.y));
      assert.ok(Math.abs(current.ship.y - y) < 1e-7,
        `stage ${stage + 1}: route recovery at ${nextTime}s (actual t=${current.t}, y=${y} -> ${current.ship.y})`);
      if (current.boss) assert.ok(Number.isFinite(current.boss.x) && Number.isFinite(current.boss.y));
      for (const [field, limit] of Object.entries(limits)) {
        maxima[field] = Math.max(maxima[field], current[field].length);
        assert.ok(current[field].length <= limit, `stage ${stage + 1}: runaway ${field} (${current[field].length}) at ${nextTime}s`);
        for (const entity of current[field]) {
          assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y), `${field}: invalid coordinate`);
          for (const key of ['vx', 'vy', 'hp', 'age', 'r']) if (key in entity) assert.ok(Number.isFinite(entity[key]), `${field}: invalid ${key}`);
          if (field === 'enemies') {
            seenKinds.add(entity.kind); const b = OrbitalWorld.bounds(stage, entity.x, current.t);
            assert.ok(entity.y >= b.top - .001 && entity.y <= b.bottom + .001, 'enemy center escaped the passage');
          }
        }
      }
    }
    assert.ok(g.read().boss, 'every complete stage must reach its boss');
    g.killBoss(); g.update(0); assert.equal(g.read().state, stage === 4 ? 'won' : 'stageclear');
  }
  assert.equal(seenKinds.size, 8, 'the simulation must exercise every enemy role');
  console.log('  Campaign maxima: ' + JSON.stringify(maxima));
});

console.log('All ORBITAL system, campaign and mobile control checks passed.');
