(() => {
'use strict';
const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s),W=1200,H=560;
const world=OrbitalWorld,foes=OrbitalEnemies,encounters=OrbitalEncounters,bosses=OrbitalBosses,records=OrbitalRecords;
const keys=new Set(),names=['SPEED','MISSILE','LASER','OPTION','SHIELD','DOUBLE'];
const crafts={
 vector:{name:'VECTOR',color:'#80f9e4',description:'直進レーザー / 斜め上ダブル / 下向きミサイル。前方への集中攻撃。'},
 tempest:{name:'TEMPEST',color:'#a9dfff',description:'波動レーザー / 後方ダブル / 上下ミサイル。広い範囲をカバー。'},
 lancer:{name:'LANCER',color:'#ffb477',description:'炸裂レーザー / 扇状ダブル / 追尾ミサイル。密集した敵に強い。'},
 prism:{name:'PRISM',color:'#e3b2ff',description:'分岐レーザー / 反射ダブル / 直進ロケット。多方向への攻撃。'}
};
const defenses={guard:{name:'GUARD',capacity:3},front:{name:'SHIELD',capacity:12},limit:{name:'LIMIT',capacity:1},core:{name:'FORCE FIELD',capacity:3}};
const defaultGauge=[0,1,5,2,3,4];
let storage;try{storage=localStorage}catch{}
let saveAvailable=!!storage;
let progress=records.read(storage),loadout={craft:progress.settings.craft,defense:progress.settings.defense,gauge:[...progress.settings.gauge]};
const difficultyProfiles={easy:{name:'EASY',hull:4,bulletSpeed:.78,hitRadius:12,collectRadius:42,waveDelay:1.18},normal:{name:'NORMAL',hull:3,bulletSpeed:1,hitRadius:15,collectRadius:32,waveDelay:1},hard:{name:'HARD',hull:3,bulletSpeed:1.17,hitRadius:15,collectRadius:30,waveDelay:.88}};
let mission={mode:'campaign',difficulty:progress.settings.difficulty,ranked:true};
function rules(){return difficultyProfiles[mission.difficulty]||difficultyProfiles.normal}
function persist(){saveAvailable=records.save(storage,progress);return saveAvailable}
function saveSettings(){progress.settings=records.settings({...loadout,difficulty:$('#difficulty-select').value,mode:$('#mode-select').value,stage:Number($('#practice-stage').value)});persist()}
function renderMission(){
 const mode=['stage','boss'].includes($('#mode-select').value)?$('#mode-select').value:'campaign',difficulty=difficultyProfiles[$('#difficulty-select').value]?$('#difficulty-select').value:'normal';
 const cap=mode==='boss'?progress.unlockedBoss:progress.unlockedStage,select=$('#practice-stage');
 for(const option of Array.from(select.options||[]))option.disabled=Number(option.value)>cap;
 select.disabled=!configurable()||mode==='campaign';select.value=String(Math.max(0,Math.min(cap,Number(select.value)||0)));
 $('#mission-help').textContent=mode==='campaign'?'全5ステージに挑戦。途中再開は参考スコアです。':'練習は記録に含まれません。解放済みの面を標準装備で練習できます。';
 $('#records').textContent=difficultyProfiles[difficulty].name+' BEST '+String(progress.records[difficulty]).padStart(6,'0')+' / 練習開放：1〜'+(cap+1)+'面'+(saveAvailable?'':' / このタブ内のみ保存');
 const canResume=!!progress.checkpoint&&configurable();$('#continue').classList.toggle('hidden',!canResume);
 if(canResume)$('#continue').textContent='第'+(progress.checkpoint.stage+1)+'面の開始地点から再開（参考スコア）';
 if(configurable())best=progress.records[difficulty];
}
function configurable(){return ['ready','over','won'].includes(state)}
function configure(){
 if(!configurable())return;
 const craft=$('#craft-select').value,defense=$('#defense-select').value;
 if(crafts[craft])loadout.craft=craft;if(defenses[defense])loadout.defense=defense;
 saveSettings();renderLoadout();hud();
}
function swapGauge(slot,value){
 if(!configurable()||!Number.isInteger(slot)||slot<0||slot>=6)return;
 const other=loadout.gauge.indexOf(value);if(other<0)return;
 [loadout.gauge[slot],loadout.gauge[other]]=[loadout.gauge[other],loadout.gauge[slot]];saveSettings();renderLoadout();hud();
}
function renderLoadout(){
 $('#loadout-fieldset').disabled=!configurable();
 $('#craft-select').value=loadout.craft;$('#defense-select').value=loadout.defense;
 document.querySelectorAll('[data-gauge-slot]').forEach(el=>{el.value=String(loadout.gauge[Number(el.dataset.gaugeSlot)])});
 $('#craft-detail').textContent=crafts[loadout.craft].description;
 $('#loadout-summary').textContent=crafts[loadout.craft].name+' / '+defenses[loadout.defense].name+(configurable()?' / 出撃前に変更できます':' / 任務中は設定固定');
 renderMission();
}
function optionPosition(index){
 const target=t-(index+1)*.2,p=trail.find(point=>point.time<=target)||trail[trail.length-1]||ship;
 return {x:Math.max(16,p.x-34*(index+1)),y:p.y};
}
const stages=[
 {name:'BLUE FRONTIER',jp:'蒼の宙域',boss:'OBSIDIAN CARRIER',duration:65,hp:230,color:'#80f9e4',sky:'#113344',planet:'#244957',ground:'#0d2633',pattern:'fan'},
 {name:'EMBER BELT',jp:'灼熱の小惑星帯',boss:'EMBER LANCER',duration:60,hp:280,color:'#ffb477',sky:'#43251c',planet:'#79442b',ground:'#39271e',pattern:'aim'},
 {name:'FROZEN VEIL',jp:'氷の星雲',boss:'FROST SENTINEL',duration:60,hp:330,color:'#a9dfff',sky:'#183451',planet:'#3e6888',ground:'#1b3045',pattern:'spiral'},
 {name:'JADE RUINS',jp:'翠の廃墟',boss:'RUIN GUARDIAN',duration:60,hp:380,color:'#b4ed8c',sky:'#193c2b',planet:'#3b6442',ground:'#203c2b',pattern:'wall'},
 {name:'LAST HORIZON',jp:'最終防衛線',boss:'ECLIPSE CORE',duration:70,hp:460,color:'#ff88ac',sky:'#3b1838',planet:'#66314f',ground:'#311d35',pattern:'final'}
];
let stageIndex=0;
function startStage(index){
 stageIndex=index;t=0;shots=[];enemies=[];bullets=[];caps=[];trail=[];particles=[];boss=null;spawn=0;enemyWave=0;routePhase='';fire=0;clearTouch();keys.clear();
 ship.x=170;ship.y=280;ship.inv=2;state='playing';
 $('#retry').classList.add('hidden');$('#boss-status').textContent='';
 const stage=stages[index];$('#overlay').classList.add('hidden');$('#sector').textContent=`${mission.mode==='campaign'?(mission.ranked?'STAGE':'CONTINUE'):'PRACTICE'} ${index+1} / ${stages.length} · ${rules().name}`;$('#progress').textContent=stage.name;$('#pause').textContent='Ⅱ';
 document.documentElement.style.setProperty('--cyan',stage.color);notify(`${mission.mode==='campaign'?'STAGE':'PRACTICE'} ${index+1} / ${stage.jp}`);syncPause();renderLoadout();hud();
 if(mission.mode==='campaign'){progress.checkpoint=records.checkpoint({stage:index,difficulty:mission.difficulty,score,selection,ship});persist()}
 if(mission.mode==='boss'){t=stage.duration;ensureBoss()}
}
function ensureBoss(){
 if(boss)return;boss=bosses.create(stageIndex,mission.difficulty);notify('WARNING / '+stages[stageIndex].boss);$('#progress').textContent=stages[stageIndex].boss;
 if(mission.mode==='campaign'){progress.unlockedBoss=Math.max(progress.unlockedBoss,stageIndex);persist()}
}
function clearStage(){
 score+=5000*(stageIndex+1);boss=null;shots=[];enemies=[];bullets=[];caps=[];keys.clear();clearTouch();
 $('#boss-status').textContent='';
 if(mission.mode!=='campaign'){finish(true);return}
 progress.unlockedStage=Math.max(progress.unlockedStage,Math.min(4,stageIndex+1));progress.unlockedBoss=Math.max(progress.unlockedBoss,progress.unlockedStage);persist();
 if(stageIndex===stages.length-1){finish(true);return}
 state='stageclear';life=Math.min(rules().hull,life+1);hud();
 $('#overline').textContent=`STAGE ${stageIndex+1} / ${stages.length} COMPLETE`;$('#title').textContent='STAGE CLEAR';
 $('#message').textContent=`次の宙域：${stages[stageIndex+1].jp} / 耐久1回復・装備を引き継ぎ`;
 $('#start').innerHTML='次のステージへ <span>↗</span>';$('#overlay').classList.remove('hidden');beep(880,.3,'sine');
}
function launch(){if(state==='stageclear')startStage(stageIndex+1);else reset()}
function enemyBullet(x,y,angle,speed=190,r=5){const velocity=speed*rules().bulletSpeed;bullets.push({x,y,vx:Math.cos(angle)*velocity,vy:Math.sin(angle)*velocity,r})}
let state='ready',t=0,last=0,score=0,best=0,life=3,selection=-1,ship,shots=[],enemies=[],bullets=[],caps=[],particles=[],trail=[],boss=null,spawn=0,enemyWave=0,routePhase='',fire=0,noticeTime=0,sound=false,audio=null,pointer=null;
const touchMove={x:0,y:0,id:null};
let dragPointer=null,firePointer=null;
function clearTouch(){
 touchMove.x=0;touchMove.y=0;touchMove.id=null;dragPointer=null;firePointer=null;pointer=null;keys.delete('TouchFire');
 $('#joystick-knob').style.transform='translate(0px, 0px)';
 $('#joystick').classList.remove('pressed');$('#touchfire').classList.remove('pressed');
}
function syncPause(){
 const paused=state==='paused';$('#pause').textContent=paused?'▶':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'再開':'一時停止');
 $('#touchpause').textContent=paused?'再開':'一時停止';$('#touchpause').setAttribute('aria-label',paused?'再開':'一時停止');
}
best=progress.records[mission.difficulty];
const stars=Array.from({length:150},()=>({x:Math.random()*W,y:Math.random()*H,z:.2+Math.random(),r:Math.random()*1.5}));
function beep(f=440,d=.06,type='square',volume=.025){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type=type;o.frequency.setValueAtTime(f,audio.currentTime);o.frequency.exponentialRampToValueAtTime(f/2,audio.currentTime+d);g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+d)}catch{}}
function hud(){
 $('#score').textContent=String(score).padStart(6,'0');$('#best').textContent=String(best).padStart(6,'0');$('#lives').textContent='◆ '.repeat(Math.max(0,life))+'◇ '.repeat(Math.max(0,rules().hull-life));
 const order=ship&&!configurable()?ship.gauge:loadout.gauge;
 [...$('#upgrades').children].forEach((el,slot)=>{const i=order[slot],level=configurable()?0:(ship?.up[i]||0),active=level>0&&(i===2||i===5?ship?.weapon===i:true);
  el.textContent=names[i]+(level?' '+(i===1||i===2||i===5?'Lv.':'')+level:'');el.classList.toggle('selected',!configurable()&&selection===slot);el.classList.toggle('owned',level>0);el.classList.toggle('active-weapon',active);el.title=(i===2||i===5)&&level&&!active?'レベル保持・現在は未選択':names[i];
 });
 $('#defense-status').textContent=!ship||configurable()?'未装備':ship.up[4]?(defenses[ship.defense].name+' / '+(ship.defense==='limit'?Math.max(0,ship.shieldTime).toFixed(1)+'s':ship.up[4])):'SHIELD OFF';
}
function reset(){
 saveSettings();const config=progress.settings;mission={mode:config.mode,difficulty:config.difficulty,ranked:config.mode==='campaign'};score=0;life=rules().hull;selection=-1;best=progress.records[mission.difficulty];
 ship={x:170,y:280,up:[0,0,0,0,0,0],inv:2,craft:loadout.craft,defense:loadout.defense,gauge:[...loadout.gauge],weapon:null,shieldTime:0};
 if(mission.mode!=='campaign'){ship.up=[1,1,mission.mode==='boss'?2:1,mission.mode==='boss'?2:1,defenses[ship.defense].capacity,1];ship.weapon=2;if(ship.defense==='limit')ship.shieldTime=3}
 const cap=mission.mode==='boss'?progress.unlockedBoss:progress.unlockedStage;startStage(mission.mode==='campaign'?0:Math.min(cap,config.stage));beep(660,.15);
}
function resumeCheckpoint(){
 if(!configurable())return;const saved=records.checkpoint(progress.checkpoint);if(!saved)return;
 mission={mode:'campaign',difficulty:saved.difficulty,ranked:false};score=saved.score;selection=saved.selection;life=rules().hull;best=progress.records[mission.difficulty];
 loadout={craft:saved.ship.craft,defense:saved.ship.defense,gauge:[...saved.ship.gauge]};ship={...saved.ship,up:[...saved.ship.up],gauge:[...saved.ship.gauge],x:170,y:280,inv:2};
 $('#mode-select').value='campaign';$('#difficulty-select').value=mission.difficulty;startStage(saved.stage);
}
function notify(msg){$('#notice').textContent=msg;noticeTime=2.5}
function equip(){
 if(state!=='playing'||selection<0)return;const i=ship.gauge[selection],max=i===0?3:i===3?4:i===4?defenses[ship.defense].capacity:2;
 if((i===4&&ship.up[4]>0)||(ship.up[i]>=max&&(!(i===2||i===5)||ship.weapon===i))){notify(names[i]+' MAX / 別の装備を選択');return}
 if(i===4){ship.up[4]=max;if(ship.defense==='limit')ship.shieldTime=3}else ship.up[i]=Math.min(max,ship.up[i]+1);
 if(i===2||i===5)ship.weapon=i;
 selection=-1;notify(names[i]+' EQUIPPED');beep(1000,.2,'sine');hud();
}
function burst(x,y,color,count=20){const limit=Math.min(count,Math.max(0,600-particles.length));for(let i=0;i<limit;i++){const a=Math.random()*Math.PI*2,s=30+Math.random()*170;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.3+Math.random()*.5,color})}}
function finish(win){
 state=win?'won':'over';clearTouch();keys.clear();const practice=mission.mode!=='campaign';
 if(!practice&&mission.ranked){best=Math.max(score,best);progress.records[mission.difficulty]=best;if(mission.difficulty==='normal')try{storage.setItem('orbital-best',String(best))}catch{}}
 if(win&&!practice)progress.checkpoint=null;persist();renderLoadout();hud();
 $('#overline').textContent=practice?'PRACTICE / 記録対象外':mission.ranked?rules().name:'CONTINUE / 参考スコア';
 $('#title').textContent=win?(practice?'PRACTICE CLEAR':'ALL CLEAR'):'GAME OVER';
 $('#message').textContent=(win?'任務完了。':'装備を整えて、もう一度。')+' SCORE '+String(score).padStart(6,'0');
 $('#start').innerHTML=(practice?'同じ練習をやり直す':'最初から出撃')+' <span>↗</span>';
 $('#retry').classList.toggle('hidden',win||practice||!progress.checkpoint);$('#overlay').classList.remove('hidden');
}
function hit(source={x:ship.x,y:ship.y},terrain=false){
 if(state!=='playing'||ship.inv>0||(ship.defense==='limit'&&ship.shieldTime>0))return;
 const guarded=ship.up[4]>0&&((ship.defense==='guard'&&(terrain||Math.abs(source.y-ship.y)>Math.abs(source.x-ship.x)))||(!terrain&&(ship.defense==='core'||(ship.defense==='front'&&source.x>ship.x))));
 if(guarded){if(!terrain){ship.up[4]--;ship.inv=.25;burst(ship.x,ship.y,'#80f9e4');hud()}return}
 life--;ship.inv=2.5;burst(ship.x,ship.y,'#ff9874',35);beep(110,.3,'sawtooth');hud();if(life<=0)finish(false);
}
function pause(){if(!['playing','paused'].includes(state))return;state=state==='playing'?'paused':'playing';keys.clear();clearTouch();syncPause();notify(state==='paused'?'PAUSED / 再開ボタンで続行':'');}
function shoot(x,y,option=false){
 const type=ship.craft,mode=ship.weapon,level=mode===null?0:ship.up[mode],strength=option ? .5 : 1;
 const add=(vx,vy,extra={})=>shots.push({x:x+24,y,baseY:y,vx,vy,age:0,damage:strength,hit:new Set(),...extra});
 if(mode===2){
  if(type==='vector')add(760,0,{laser:true,pierce:level===2,damage:(level===2?2.1:1.6)*strength});
  if(type==='tempest')add(650,0,{wave:true,amplitude:level===2?30:15,r:level===2?10:7,damage:(level===2?1.8:1.3)*strength});
  if(type==='lancer')add(560,0,{orb:true,r:level===2?12:8,splash:level===2?65:38,damage:(level===2?2.4:1.6)*strength});
  if(type==='prism'){for(const vy of level===2?[-85,0,85]:[-55,55])add(710,vy,{laser:true,pierce:level===2,damage:strength*.9})}
 }else{
  add(650,0);
  if(mode===5){
   const angles=type==='vector'?(level===2?[-.55,.55]:[-.55]):type==='tempest'?(level===2?[Math.PI,Math.PI-.4,Math.PI+.4]:[Math.PI]):type==='lancer'?(level===2?[-.6,-.3,.3,.6]:[-.4,.4]):(level===2?[-.8,-.4,.4,.8]:[-.6,.6]);
   for(const a of angles)add(Math.cos(a)*570,Math.sin(a)*570,{bounce:type==='prism',damage:strength*.8});
  }
 }
 if(ship.up[1]){
  const lv=ship.up[1],directions=type==='tempest'?[-1,1]:[1];
  for(const dir of directions){const count=lv===2?2:1;for(let n=0;n<count;n++)add(type==='prism'?470:310, type==='prism'?0:dir*160,{x:x-n*16,y:y+dir*(10+n*10),missile:true,homing:type==='lancer',ground:type==='vector',splash:type==='prism'?35+lv*10:0,damage:(lv===2?1.6:1.2)*strength,r:4})}
 }
}
function terrainY(x,layer=1){return world.bounds(stageIndex,x,t).bottom+(layer===0?10:0)}
function routeBounds(x){return world.bounds(stageIndex,x,t)}
function resolveTerrain(){
 const collision=world.collides(stageIndex,ship.x,ship.y,rules().hitRadius,t);
 if(!collision.hit)return;
 hit(collision.source||{x:ship.x,y:ship.y<280?0:H},true);
 if(Number.isFinite(collision.safeY))ship.y=collision.safeY;
 pointer=null;
}
function shotHit(s,target,radius){
 const ax=s.prevX??s.x,ay=s.prevY??s.y,dx=s.x-ax,dy=s.y-ay,den=dx*dx+dy*dy;
 const u=den?Math.max(0,Math.min(1,((target.x-ax)*dx+(target.y-ay)*dy)/den)):0;
 return Math.hypot(target.x-(ax+u*dx),target.y-(ay+u*dy))<radius+(s.r||3);
}
function damageTarget(target,s){
 if(target.hp<=0)return;
 const bossTarget=boss&&(target===boss.core||boss.parts.includes(target));
 if(bossTarget){const result=bosses.damage(boss,target,s);if(!result.accepted)return;if(result.partDestroyed){score+=150;burst(target.x,target.y,'#d8edff',28);hud()}if(result.phaseChanged)bullets=[]}
 else target.hp-=s.damage*foes.damageScale(target,s);
 burst(target.x,target.y,'#ffbe8d',4);
 if(!bossTarget&&target.hp<=0){score+=target.score||100;burst(target.x,target.y,'#ffad77');if(target.drop)caps.push({x:target.x,y:target.y});hud();beep(150,.08)}
}
function updateShots(dt){
 for(const s of shots){
  s.prevX=s.x;s.prevY=s.y;s.age+=dt;
  if(s.homing){const target=enemies.find(e=>e.hp>0&&e.x>s.x)||boss;if(target){const a=Math.atan2(target.y-s.y,target.x-s.x),blend=Math.min(1,dt*4);s.vx+=(Math.cos(a)*360-s.vx)*blend;s.vy+=(Math.sin(a)*360-s.vy)*blend}}
  s.x+=s.vx*dt;s.y=s.wave?s.baseY+Math.sin(s.age*22)*s.amplitude:s.y+s.vy*dt;
  if(s.bounce&&(s.y<34||s.y>H-40)){s.y=Math.max(34,Math.min(H-40,s.y));s.vy*=-1}
  if(s.ground&&(s.grounded||s.y>terrainY(s.x)-8)){s.grounded=true;s.y=terrainY(s.x)-8;s.vy=0;s.vx=410}
  if(world.collides(stageIndex,s.x,s.y,s.ground?2:(s.r||2),t,false).hit){s.dead=true;continue}
  for(const target of [...enemies,...(boss?bosses.targets(boss):[])]){
   if(target.hp<=0||s.hit.has(target)||!shotHit(s,target,target.r||23))continue;
   s.hit.add(target);damageTarget(target,s);
   if(s.splash){burst(s.x,s.y,crafts[ship.craft].color,16);for(const other of [...enemies,...(boss?bosses.targets(boss):[])])if(other!==target&&other.hp>0&&Math.hypot(other.x-s.x,other.y-s.y)<s.splash)damageTarget(other,{...s,damage:s.damage*.65})}
   if(boss&&boss.hp<=0){burst(boss.x,boss.y,'#ffac70',100);clearStage();return}
   if(!s.pierce){s.dead=true;break}
  }
 }
}
function update(dt){
 if(state!=='playing')return;
 t+=dt;ship.inv-=dt;fire-=dt;spawn-=dt;noticeTime-=dt;if(noticeTime<0)$('#notice').textContent='';
 if(ship.shieldTime>0){ship.shieldTime=Math.max(0,ship.shieldTime-dt);if(ship.shieldTime===0)ship.up[4]=0;hud()}
 let dx=(keys.has('ArrowRight')||keys.has('KeyD')?1:0)-(keys.has('ArrowLeft')||keys.has('KeyA')?1:0)+touchMove.x,dy=(keys.has('ArrowDown')||keys.has('KeyS')?1:0)-(keys.has('ArrowUp')||keys.has('KeyW')?1:0)+touchMove.y;
 if(pointer){dx=Math.max(-1,Math.min(1,(pointer.x-ship.x)/20));dy=Math.max(-1,Math.min(1,(pointer.y-ship.y)/20))}
 const speed=260+ship.up[0]*65,mag=Math.max(1,Math.hypot(dx,dy));ship.x=Math.max(30,Math.min(W-35,ship.x+dx/mag*speed*dt));ship.y=Math.max(42,Math.min(H-42,ship.y+dy/mag*speed*dt));
 resolveTerrain();if(state!=='playing')return;
 trail.unshift({x:ship.x,y:ship.y,time:t});while(trail.length>512||(trail.length>2&&trail[trail.length-2].time<t-1.1))trail.pop();
 if(fire<=0&&($('#auto').checked||keys.has('Space')||keys.has('KeyZ')||keys.has('TouchFire'))){shoot(ship.x,ship.y);for(let i=0;i<ship.up[3];i++){const p=optionPosition(i);shoot(p.x,p.y,true)}fire=.16;beep(680,.035,'triangle',.012)}
 const stage=stages[stageIndex];
 const phase=world.describe(stageIndex,t);$('#route-status').textContent=phase;
 if(phase!==routePhase){if(t>=5&&t<stage.duration-5)notify(phase);routePhase=phase}
 if(t<stage.duration-5&&spawn<=0){const event=encounters.plan(stageIndex,enemyWave++,t,routeBounds,world,mission.difficulty);enemies.push(...event.enemies.slice(0,Math.max(0,24-enemies.length)));spawn=event.nextDelay}
 if(t>=stage.duration&&!boss)ensureBoss();else if(t<stage.duration)$('#progress').textContent=stage.name+' / '+Math.max(0,Math.ceil(stage.duration-t))+'s';
 const pressure=encounters.pressure(stageIndex,ship.x,t,world);
 for(const e of enemies){
  if(e.hp<=0)continue;
  foes.update(e,dt,{stage:stageIndex,time:t,ship,bounds:routeBounds,shoot:enemyBullet,difficulty:mission.difficulty,encounterPressure:pressure,spawn:child=>{if(enemies.length<24)enemies.push(child)}});
  if(!e.kind){const bounds=routeBounds(e.x);e.y=Math.max(bounds.top+35,Math.min(bounds.bottom-35,e.y))}
  if(e.kind){const mounted=e.kind==='turret'||e.kind==='ceilingTurret',collision=world.collides(stageIndex,e.x,e.y,e.r||20,t,!mounted);if(collision.hit){if(mounted&&collision.source.kind!=='floor'&&collision.source.kind!=='ceiling'){e.hp=0;continue}if(!mounted&&Number.isFinite(collision.safeY))e.y=collision.safeY}}
  if(Math.hypot(e.x-ship.x,e.y-ship.y)<rules().hitRadius+(e.r||18)){hit(e);if(e.kind!=='carrier')e.hp=0;if(state!=='playing')return}
 }
 if(boss){const oldPhase=boss.phase;bosses.update(boss,dt,{stage:stageIndex,ship,difficulty:mission.difficulty,shoot:enemyBullet,notify});if(boss.phase!==oldPhase)bullets=[];$('#boss-status').textContent=bosses.status(boss);if(boss.transition<=0&&Math.abs(ship.x-boss.x)<90&&Math.abs(ship.y-boss.y)<95){hit(boss);if(state!=='playing')return}}
 updateShots(dt);if(state!=='playing')return;
 for(const b of bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;if(world.collides(stageIndex,b.x,b.y,b.r,t,false).hit){b.x=-100;continue}if(Math.hypot(b.x-ship.x,b.y-ship.y)<rules().hitRadius+b.r){hit(b);b.x=-100;if(state!=='playing')return}}
 for(const c of caps){c.x-=90*dt;const bounds=routeBounds(c.x);c.y=Math.max(bounds.top+28,Math.min(c.y,bounds.bottom-28));const collision=world.collides(stageIndex,c.x,c.y,12,t);if(collision.hit&&Number.isFinite(collision.safeY))c.y=collision.safeY;if(Math.hypot(c.x-ship.x,c.y-ship.y)<rules().collectRadius){selection=(selection+1)%ship.gauge.length;c.x=-100;score+=50;beep(1200,.12,'sine');notify(names[ship.gauge[selection]]+' READY / 装備ボタンで取得');hud()}}
 enemies=enemies.filter(e=>e.x>-60&&e.hp>0);shots=shots.filter(s=>!s.dead&&s.age<5&&s.x>-80&&s.x<W+80&&s.y>-40&&s.y<H+20);bullets=bullets.filter(b=>b.x>-30&&b.x<W+40&&b.y>-30&&b.y<H+30);caps=caps.filter(c=>c.x>-30);
}
function polygon(points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fill()}
function drawShip(x,y,scale=1){
 const id=ship?.craft||loadout.craft,color=crafts[id].color;
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);polygon([[-23,-7],[-42-Math.random()*18,0],[-23,7]],color);
 const silhouettes={vector:[[-28,-9],[-13,-9],[-22,-23],[0,-16],[13,-5],[31,0],[12,6],[0,17],[-22,23],[-13,8],[-28,9]],tempest:[[-25,-17],[6,-25],[-3,-8],[32,0],[-3,8],[6,25],[-25,17],[-14,0]],lancer:[[-23,-11],[-5,-11],[7,-23],[5,-7],[40,0],[5,7],[7,23],[-5,11],[-23,11]],prism:[[-26,0],[-13,-24],[5,-12],[31,0],[5,12],[-13,24]]};
 polygon(silhouettes[id],'#dcecf0');polygon([[-15,-5],[6,-5],[17,0],[5,4],[-15,4]],color);ctx.restore();
}
function drawDefense(time){
 if(!ship.up[4])return;ctx.save();ctx.translate(ship.x,ship.y);ctx.strokeStyle=crafts[ship.craft].color;ctx.lineWidth=3;
 if(ship.defense==='guard'){ctx.strokeRect(-18,-29,38,5);ctx.strokeRect(-18,24,38,5)}
 else if(ship.defense==='front'){ctx.beginPath();ctx.ellipse(26,0,13,30,0,-Math.PI/2,Math.PI/2);ctx.stroke()}
 else{ctx.globalAlpha=ship.defense==='limit'?.65+Math.sin(time*12)*.25:1;ctx.beginPath();ctx.ellipse(0,0,40,32,0,0,Math.PI*2);ctx.stroke()}
 ctx.restore();
}
function draw(dt,time){const theme=stages[stageIndex];ctx.fillStyle='#040f1c';ctx.fillRect(0,0,W,H);const glow=ctx.createRadialGradient(850,240,10,850,240,650);glow.addColorStop(0,theme.sky);glow.addColorStop(1,'#040c18');ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.save();ctx.translate(855,230);ctx.rotate(-.3);ctx.strokeStyle='#54839022';ctx.lineWidth=20;ctx.beginPath();ctx.ellipse(0,0,300,90,0,0,Math.PI*2);ctx.stroke();const planet=ctx.createRadialGradient(-70,-60,10,0,0,147);planet.addColorStop(0,theme.planet);planet.addColorStop(.85,'#102835');planet.addColorStop(1,theme.color);ctx.fillStyle=planet;ctx.beginPath();ctx.arc(0,0,147,0,Math.PI*2);ctx.fill();ctx.restore();for(const s of stars){if(state!=='paused')s.x=(s.x-dt*(state==='playing'?80:15)*s.z+W)%W;ctx.fillStyle=`rgba(180,222,239,${s.z*.65})`;ctx.fillRect(s.x,s.y,s.r+1,s.r)}
world.draw(ctx,stageIndex,t,theme);
if(state==='ready')drawShip(230,280+Math.sin(time)*12,1.5);
if(ship){for(let i=0;i<ship.up[3];i++){const p=optionPosition(i);ctx.fillStyle=crafts[ship.craft].color;ctx.shadowColor=ctx.fillStyle;ctx.shadowBlur=20;ctx.beginPath();ctx.arc(p.x,p.y,8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0}if(state==='paused'||ship.inv<=0||Math.floor(time*12)%2)drawShip(ship.x,ship.y);drawDefense(time);ctx.fillStyle='#ffffff';ctx.strokeStyle='#123346';ctx.lineWidth=1;ctx.beginPath();ctx.arc(ship.x,ship.y,3,0,Math.PI*2);ctx.fill();ctx.stroke()}

for(const e of enemies)if(e.hp>0)foes.draw(ctx,e,theme.color,time);
if(boss){bosses.draw(ctx,boss);ctx.fillStyle='#223842';ctx.fillRect(350,22,500,5);ctx.fillStyle=theme.color;ctx.fillRect(350,22,500*Math.max(0,Math.min(1,boss.hp/boss.max)),5)}
ctx.shadowBlur=10;for(const s of shots){ctx.fillStyle=s.missile?'#f0c275':crafts[ship.craft].color;ctx.shadowColor=ctx.fillStyle;if(s.orb||s.wave){ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill()}else{ctx.save();ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.fillRect(s.laser?-48:-12,-2,s.laser?52:s.missile?13:22,s.laser?4:3);ctx.restore()}}
for(const b of bullets){ctx.shadowBlur=0;ctx.fillStyle='#f64e79';ctx.strokeStyle='#fff1df';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(b.x,b.y,b.r+1,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#fff6ec';ctx.beginPath();ctx.arc(b.x,b.y,1.7,0,Math.PI*2);ctx.fill()}
for(const c of caps){ctx.save();ctx.translate(c.x,c.y);ctx.shadowBlur=12;ctx.shadowColor='#69dbff';polygon([[-13,0],[-7,-12],[7,-12],[13,0],[7,12],[-7,12]],'#67d9ff');ctx.shadowBlur=0;ctx.strokeStyle='#effbff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#102b42';ctx.font='bold 14px monospace';ctx.textAlign='center';ctx.fillText('P',0,5);ctx.restore()}ctx.shadowBlur=0;
for(const p of particles){if(state!=='paused'){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt}ctx.globalAlpha=Math.max(0,Math.min(1,p.life*2));ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3)}ctx.globalAlpha=1;particles=particles.filter(p=>p.life>0);
}
function frame(ms){const dt=Math.min((ms-last)/1000,.033);last=ms;if(state==='playing')update(dt);draw(dt,ms/1000);requestAnimationFrame(frame)}
$('#start').onclick=()=>{launch();$('#start').blur()};$('#pause').onclick=()=>{pause();$('#pause').blur()};$('#equip').onclick=()=>{equip();$('#equip').blur()};$('#touchpower').onclick=()=>{equip();$('#touchpower').blur()};$('#sound').onclick=()=>{sound=!sound;$('#sound').textContent=sound?'SOUND ON':'SOUND OFF';beep();$('#sound').blur()};
$('#retry').onclick=()=>{resumeCheckpoint();$('#retry').blur()};$('#continue').onclick=()=>{resumeCheckpoint();$('#continue').blur()};
$('#auto').addEventListener('change',()=>$('#auto').blur());
window.addEventListener('keydown',e=>{
 if(e.target?.closest?.('select,input'))return;
 if(e.target?.closest?.('summary,button')&&(!['playing','paused'].includes(state)||['Enter','Space'].includes(e.code)))return;
 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
 if(e.code==='Enter'&&['ready','over','won','stageclear'].includes(state))launch();if(e.code==='KeyX')equip();if(e.code==='KeyP'||e.code==='Escape')pause();
});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(state==='playing')pause()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='playing')pause()});
function move(e){
 if(!dragPointer||e.pointerId!==dragPointer.id||state!=='playing')return;
 const r=canvas.getBoundingClientRect();
 pointer={x:Math.max(30,Math.min(W-35,(pointer?.x??ship.x)+(e.clientX-dragPointer.x)/r.width*W)),y:Math.max(42,Math.min(H-42,(pointer?.y??ship.y)+(e.clientY-dragPointer.y)/r.height*H))};
 dragPointer.x=e.clientX;dragPointer.y=e.clientY;
}
canvas.addEventListener('pointerdown',e=>{if(state!=='playing'||dragPointer||touchMove.id!==null)return;e.preventDefault();canvas.setPointerCapture(e.pointerId);dragPointer={id:e.pointerId,x:e.clientX,y:e.clientY};pointer={x:ship.x,y:ship.y}});
canvas.addEventListener('pointermove',move);
for(const event of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(event,e=>{if(e.pointerId===dragPointer?.id){dragPointer=null;pointer=null}});
const joystick=$('#joystick');
function moveStick(e){
 if(e.pointerId!==touchMove.id||state!=='playing')return;
 const r=joystick.getBoundingClientRect(),radius=Math.min(r.width,r.height)*.32,x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2,length=Math.hypot(x,y),scale=length>radius?radius/length:1;
 touchMove.x=length<radius*.12?0:x*scale/radius;touchMove.y=length<radius*.12?0:y*scale/radius;
 $('#joystick-knob').style.transform=`translate(${x*scale}px, ${y*scale}px)`;
}
joystick.addEventListener('pointerdown',e=>{if(state!=='playing'||touchMove.id!==null)return;e.preventDefault();joystick.setPointerCapture(e.pointerId);dragPointer=null;pointer=null;touchMove.id=e.pointerId;joystick.classList.add('pressed');moveStick(e)});
joystick.addEventListener('pointermove',moveStick);
for(const event of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(event,e=>{if(e.pointerId===touchMove.id){touchMove.id=null;touchMove.x=0;touchMove.y=0;$('#joystick-knob').style.transform='translate(0px, 0px)';joystick.classList.remove('pressed')}});
$('#touchfire').onpointerdown=e=>{if(state!=='playing'||firePointer!==null)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);firePointer=e.pointerId;keys.add('TouchFire');e.currentTarget.classList.add('pressed')};
function releaseFire(e){if(e.pointerId!==firePointer)return;firePointer=null;keys.delete('TouchFire');$('#touchfire').classList.remove('pressed')}
$('#touchfire').onpointerup=$('#touchfire').onpointercancel=releaseFire;$('#touchfire').addEventListener('lostpointercapture',releaseFire);
$('#touchpause').onclick=()=>{pause();$('#touchpause').blur()};
$('#focus-mode').onclick=()=>{const active=document.body.classList.toggle('game-focus');$('#focus-mode').setAttribute('aria-pressed',String(active));$('#focus-mode').textContent=active?'通常表示':'ゲームを大きく';clearTouch();$('#focus-mode').blur()};
window.addEventListener('orientationchange',()=>{clearTouch();if(state==='playing')pause()});
window.addEventListener('resize',clearTouch);
$('#craft-select').addEventListener('change',configure);$('#defense-select').addEventListener('change',configure);
for(const id of ['#mode-select','#practice-stage','#difficulty-select'])$(id).addEventListener('change',()=>{if(!configurable())return;renderMission();saveSettings();hud()});
document.querySelectorAll('[data-gauge-slot]').forEach(el=>el.addEventListener('change',()=>swapGauge(Number(el.dataset.gaugeSlot),Number(el.value))));
$('#mode-select').value=progress.settings.mode;$('#practice-stage').value=String(progress.settings.stage);$('#difficulty-select').value=progress.settings.difficulty;
renderLoadout();hud();requestAnimationFrame(frame);
})();
