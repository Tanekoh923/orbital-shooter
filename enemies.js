(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.OrbitalEnemies=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const W=1200,H=560,TAU=Math.PI*2,SCROLL=90;
 const types=Object.freeze({
  scout:{name:'偵察機',hp:2,r:19,score:100,description:'直進する編隊。Pマークの機体は青いカプセルを運ぶ。'},
  wave:{name:'波状編隊',hp:2,r:20,score:130,description:'波を描きながら飛ぶ軽戦闘機。'},
  charger:{name:'突撃機',hp:3,r:21,score:200,description:'照準線の予告後、狙った位置へ突進する。'},
  turret:{name:'地上砲台',hp:4,r:19,score:180,description:'地面に固定された狙撃砲台。'},
  ceilingTurret:{name:'天井砲台',hp:4,r:19,score:180,description:'天井に固定された狙撃砲台。'},
  armored:{name:'装甲機',hp:7,r:27,score:300,description:'前面装甲で通常弾を軽減。レーザーとミサイルが有効。'},
  carrier:{name:'小型空母',hp:13,r:39,score:500,description:'偵察機を放出する大型機。'},
  mine:{name:'回転機雷',hp:3,r:22,score:160,description:'漂いながら、間隔を空けて放射弾を撃つ。'}
 });
 const sequences=[
  ['scout','wave','scout','charger','turret','wave','armored','scout','charger','turret','mine','wave','carrier','turret','charger','armored','wave','carrier'],
  ['wave','turret','charger','scout','mine','armored','turret','wave','carrier','charger','turret','mine','armored','wave','carrier','charger','mine'],
  ['ceilingTurret','wave','scout','mine','charger','armored','turret','carrier','wave','charger','mine','ceilingTurret','armored','carrier','turret','wave','charger'],
  ['turret','ceilingTurret','armored','wave','carrier','charger','mine','scout','turret','armored','carrier','ceilingTurret','charger','wave','mine','armored','carrier'],
  ['armored','charger','carrier','ceilingTurret','wave','mine','turret','carrier','armored','charger','wave','ceilingTurret','mine','carrier','turret','charger','armored','carrier','wave','mine']
 ];
 function clamp(value,low,high){return Math.max(low,Math.min(high,value))}
 function stageNumber(stage){return clamp(Number.isFinite(stage)?Math.floor(stage):0,0,4)}
 function boundsAt(fn,x){
  const result=typeof fn==='function'?fn(x):null;
  let top=Number.isFinite(result?.top)?result.top:28,bottom=Number.isFinite(result?.bottom)?result.bottom:H-28;
  top=clamp(top,0,H-80);bottom=clamp(bottom,top+60,H);
  return {top,bottom};
 }
 function laneY(bounds,lane,r=0){return clamp(bounds.top+(bounds.bottom-bounds.top)*lane,bounds.top+r+5,bounds.bottom-r-5)}
 function create(kind,x,y,stage=0,extra={}){
  const s=stageNumber(stage),meta=types[kind];
  return {kind,x,y,base:y,hp:meta?meta.hp+Math.floor(s/2):2,r:meta?.r??23,score:meta?.score??100,drop:false,age:0,cool:1.9,phase:0,stage:s,mode:kind==='charger'?'approach':'cruise',...extra};
 }
 function spawnWave(stageIndex,waveIndex,time,boundsFn){
  const stage=stageNumber(stageIndex),index=Math.max(0,Math.floor(waveIndex)||0),kind=sequences[stage][index%sequences[stage].length];
  const lane=[.28,.67,.46,.76,.35,.56][(index+stage)%6],formation=kind==='scout'||kind==='wave',count=formation?3+(stage>=2?1:0):kind==='charger'?2:1,result=[];
  for(let i=0;i<count;i++){
   const x=W+45+i*(kind==='charger'?140:74),bounds=boundsAt(boundsFn,x),meta=types[kind];
   let y=laneY(bounds,lane,meta.r);
   if(kind==='turret')y=bounds.bottom-meta.r;
   if(kind==='ceilingTurret')y=bounds.top+meta.r;
   result.push(create(kind,x,y,stage,{lane,phase:i*.75,cool:2+i*.32,drop:i===count-1,bornAt:Number.isFinite(time)?time:0}));
  }
  // Later sectors mix a surface threat with a small flying escort.
  if(stage>=2&&(kind==='turret'||kind==='ceilingTurret')){
   const escortLane=kind==='turret'?.3:.7;
   for(let i=0;i<2;i++){
    const x=W+160+i*78,bounds=boundsAt(boundsFn,x);
    result.push(create('scout',x,laneY(bounds,escortLane,types.scout.r),stage,{lane:escortLane,phase:i*.7,cool:2.7+i*.3,drop:i===1}));
   }
  }
  return result;
 }
 function aimedShot(e,env,speed=175,offset=0,r=5){
  if(e.x<80||e.x>W-50||typeof env.shoot!=='function'||!env.ship||e.x<env.ship.x+100)return;
  const angle=Math.atan2(env.ship.y-e.y,env.ship.x-e.x);
  env.shoot(e.x-10,e.y,angle+offset,speed,r);
 }
 function difficultyOf(value){return value==='easy'?'easy':value==='hard'?'hard':'normal'}
 function update(e,dt,env={}){
  if(!types[e.kind]||!Number.isFinite(dt)||dt<=0)return;
  const stage=stageNumber(env.stage??e.stage),speedBonus=stage*8;
  const difficulty=difficultyOf(env.difficulty),pressure=clamp(Number.isFinite(env.encounterPressure)?env.encounterPressure:0,0,1);
  const cooldown=(difficulty==='easy'?1.4:difficulty==='hard'?.8:1)*(1+pressure*.55);
  e.age=(e.age||0)+dt;e.cool=(Number.isFinite(e.cool)?e.cool:2)-dt;
  e.warning=e.cool<=.3&&e.cool>0&&e.x<W-50&&(!env.ship||e.x>=env.ship.x+100)?(.3-e.cool)/.3:0;
  const previousX=e.x;
  switch(e.kind){
   case 'scout':
    e.x-=(148+speedBonus)*dt;
    if(e.followLane&&Number.isFinite(e.lane)){
     const target=laneY(boundsAt(env.bounds,e.x),e.lane,e.r),change=clamp(target-e.y,-70*dt,70*dt);
     e.y+=change;
    }
    if(e.cool<=0){aimedShot(e,env,175+stage*8);e.cool=(3.5-stage*.15)*cooldown}
    break;
   case 'wave':{
    e.x-=(126+speedBonus)*dt;
    const bounds=boundsAt(env.bounds,e.x),base=Number.isFinite(e.lane)?laneY(bounds,e.lane,e.r):e.base;
    e.y=base+Math.sin(e.age*2.5+e.phase)*35;
    if(e.cool<=0){aimedShot(e,env,165+stage*8);e.cool=(3.1-stage*.12)*cooldown}
    break;
   }
   case 'charger':
    if(e.mode==='approach'){
     e.x-=(140+speedBonus)*dt;
     if(e.x<1080&&env.ship){
      e.mode='telegraph';e.telegraph=(difficulty==='easy'?1.2:difficulty==='hard'?.8:.95)+pressure*.2;
      e.lockX=Math.min(env.ship.x,e.x-100);e.lockY=env.ship.y;
     }
    }else if(e.mode==='telegraph'){
     e.x-=35*dt;e.telegraph-=dt;
     if(e.telegraph<=0){
      const angle=Math.atan2(e.lockY-e.y,e.lockX-e.x),speed=370+stage*16;
      e.vx=Math.cos(angle)*speed;e.vy=Math.sin(angle)*speed;e.mode='dive';e.telegraph=0;
     }
    }else if(e.mode==='dive'){e.x+=e.vx*dt;e.y+=e.vy*dt}
    break;
   case 'turret':
   case 'ceilingTurret':
    e.x-=SCROLL*dt;
    if(env.ship)e.aim=Math.atan2(env.ship.y-e.y,env.ship.x-e.x);
    if(e.cool<=0){aimedShot(e,env,190+stage*8);e.cool=(2.9-stage*.14)*cooldown}
    break;
   case 'armored':{
    e.x-=(86+stage*4)*dt;
    const bounds=boundsAt(env.bounds,e.x),base=Number.isFinite(e.lane)?laneY(bounds,e.lane,e.r):e.base;
    e.y=base+Math.sin(e.age*1.4+e.phase)*14;
    if(e.cool<=0){
     aimedShot(e,env,165+stage*6,-.15);aimedShot(e,env,165+stage*6,.15);
     e.cool=(3.7-stage*.12)*cooldown;
    }
    break;
   }
   case 'carrier':
    e.x-=(70+stage*4)*dt;
    e.y=(Number.isFinite(e.lane)?laneY(boundsAt(env.bounds,e.x),e.lane,e.r):e.base)+Math.sin(e.age*1.1)*12;
    e.launchCool=(Number.isFinite(e.launchCool)?e.launchCool:1.3)-dt;
    if(e.launchCool<=0&&e.x>130&&e.x<W-55){
     const side=(e.launchCount||0)%2?1:-1,x=e.x-38,bounds=boundsAt(env.bounds,x),y=clamp(e.y+side*38,bounds.top+24,bounds.bottom-24);
     if(typeof env.spawn==='function')env.spawn(create('scout',x,y,stage,{cool:1.4,drop:(e.launchCount||0)%3===2,phase:(e.launchCount||0)*.7}));
     e.launchCount=(e.launchCount||0)+1;e.launchCool=(2.4-stage*.1)*cooldown;
    }
    if(e.cool<=0){aimedShot(e,env,160+stage*7);e.cool=4*cooldown}
    break;
   case 'mine':
    e.x-=(82+stage*4)*dt;e.rotation=e.age*1.5;
    e.y=(Number.isFinite(e.lane)?laneY(boundsAt(env.bounds,e.x),e.lane,e.r):e.base)+Math.sin(e.age*1.6+e.phase)*17;
    if(e.cool<=0){
     if(e.x>100&&e.x<W-70&&typeof env.shoot==='function'&&(!env.ship||e.x>=env.ship.x+100)){
      const count=difficulty==='easy'||pressure>=.35?4:difficulty==='hard'?8:6;
      for(let i=0;i<count;i++)env.shoot(e.x,e.y,Math.PI+i*TAU/count,125+stage*6,5);
     }
     e.cool=(4.4-stage*.12)*cooldown;
    }
    break;
  }
  const bounds=boundsAt(env.bounds,e.x),radius=e.r||types[e.kind].r;
  const visualRadius=e.kind==='mine'?Math.max(radius,27):e.kind==='wave'?Math.max(radius,22):e.kind==='charger'&&e.mode==='dive'?Math.max(radius,31):radius;
  if(e.kind==='turret')e.y=bounds.bottom-radius;
  else if(e.kind==='ceilingTurret')e.y=bounds.top+radius;
  else e.y=clamp(e.y,bounds.top+visualRadius+5,bounds.bottom-visualRadius-5);
  // Corrupt custom data must never turn a normal formation into a stationary wall.
  if(!Number.isFinite(e.x))e.x=previousX-120*dt;
 }
 function damageScale(e,shot={}){
  if(e.kind!=='armored'||shot.missile||shot.laser||shot.wave||shot.orb)return 1;
  if(Number.isFinite(shot.vx)&&Math.abs(shot.vx)>.01)return shot.vx<0?1:.3;
  const approachX=Number.isFinite(shot.prevX)?shot.prevX:shot.x;
  if(Number.isFinite(approachX)&&approachX>e.x+8)return 1;
  return .3;
 }
 function path(ctx,points,fill,stroke){
  ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]));ctx.closePath();
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
 }
 function circle(ctx,x,y,r,fill,stroke){
  ctx.beginPath();ctx.arc(x,y,r,0,TAU);
  if(fill){ctx.fillStyle=fill;ctx.fill()}
  if(stroke){ctx.strokeStyle=stroke;ctx.stroke()}
 }
 function draw(ctx,e,themeColor='#80f9e4',time=0){
  if(!types[e.kind])return;
  const color=e.drop?'#ffb166':themeColor,metal='#426178',dark='#102333',bright='#fff0cf';
  ctx.save();ctx.translate(e.x,e.y);ctx.lineWidth=2;
  switch(e.kind){
   case 'scout':
    path(ctx,[[-23,0],[-6,-13],[15,-14],[7,-5],[23,0],[7,5],[15,14],[-6,13]],color);
    path(ctx,[[-15,0],[-3,-5],[10,0],[-3,5]],dark);
    ctx.fillStyle=bright;ctx.fillRect(-8,-2,7,4);
    path(ctx,[[14,-4],[30+Math.sin(time*23)*4,0],[14,4]],'#ff9d6877');
    break;
   case 'wave':
    path(ctx,[[-25,0],[-3,-7],[8,-22],[21,-22],[10,-4],[17,0],[10,4],[21,22],[8,22],[-3,7]],color);
    path(ctx,[[-17,0],[-3,-4],[11,0],[-3,4]],dark);
    circle(ctx,-8,0,3,bright);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(19,-13);ctx.lineTo(28,-13);ctx.moveTo(19,13);ctx.lineTo(28,13);ctx.stroke();
    break;
   case 'charger':
    if(e.mode==='telegraph'){
     ctx.save();ctx.globalAlpha=.35+Math.sin(time*24)*.2;ctx.strokeStyle='#ffd393';ctx.setLineDash([8,8]);ctx.beginPath();ctx.moveTo(-15,0);ctx.lineTo(e.lockX-e.x,e.lockY-e.y);ctx.stroke();ctx.setLineDash([]);
     const lx=e.lockX-e.x,ly=e.lockY-e.y;circle(ctx,lx,ly,13,null,'#ffd393');ctx.beginPath();ctx.moveTo(lx-20,ly);ctx.lineTo(lx+20,ly);ctx.moveTo(lx,ly-20);ctx.lineTo(lx,ly+20);ctx.stroke();ctx.restore();
    }
    if(e.mode==='dive')ctx.rotate(Math.atan2(e.vy,e.vx)-Math.PI);
    path(ctx,[[-31,0],[-5,-8],[9,-18],[15,-11],[10,-3],[25,0],[10,3],[15,11],[9,18],[-5,8]],e.mode==='telegraph'?'#ffc487':color);
    path(ctx,[[-20,0],[1,-4],[9,0],[1,4]],dark);
    if(e.mode==='dive')path(ctx,[[16,-6],[48+Math.sin(time*30)*8,0],[16,6]],'#ff855a99');
    circle(ctx,-6,0,3,bright);
    break;
   case 'turret':
   case 'ceilingTurret':{
    const flipped=e.kind==='ceilingTurret',sy=flipped?-1:1;
    ctx.save();ctx.scale(1,sy);path(ctx,[[-23,19],[-18,6],[18,6],[23,19]],metal,color);ctx.fillStyle=dark;ctx.fillRect(-16,14,32,5);circle(ctx,0,2,13,color);circle(ctx,0,2,6,dark);ctx.restore();
    ctx.save();ctx.rotate(e.aim??Math.PI);ctx.fillStyle=metal;ctx.fillRect(0,-5,26,10);ctx.fillStyle=color;ctx.fillRect(19,-4,8,8);ctx.restore();circle(ctx,0,0,5,bright);
    if(e.warning>0){circle(ctx,0,0,8,null,'#ffbd82')}
    break;
   }
   case 'armored':
    path(ctx,[[-30,-12],[-15,-26],[18,-26],[32,-12],[32,12],[18,26],[-15,26],[-30,12]],metal,color);
    path(ctx,[[-33,-11],[-22,-24],[-16,-21],[-23,-8],[-23,8],[-16,21],[-22,24],[-33,11]],'#bfd0d4');
    ctx.fillStyle=dark;ctx.fillRect(-9,-16,26,32);ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(-5,-13);ctx.lineTo(13,-13);ctx.moveTo(-5,13);ctx.lineTo(13,13);ctx.stroke();
    circle(ctx,25,0,8,'#ff9d67');circle(ctx,-12,0,4,bright);
    break;
   case 'carrier':
    path(ctx,[[-44,-8],[-22,-32],[27,-32],[44,-17],[44,17],[27,32],[-22,32],[-44,8]],metal,color);
    path(ctx,[[-31,-8],[-11,-19],[25,-19],[29,19],[-11,19],[-31,8]],dark);
    ctx.fillStyle=color;ctx.fillRect(-23,-28,36,4);ctx.fillRect(-23,24,36,4);ctx.fillStyle='#ffb166';ctx.fillRect(-30,-6,27,12);ctx.fillStyle=bright;ctx.fillRect(-28,-3,7,6);
    circle(ctx,33,-13,5,color);circle(ctx,33,13,5,color);
    break;
   case 'mine':
    ctx.rotate(e.rotation??e.age*1.5);circle(ctx,0,0,16,metal,color);
    for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*TAU/6);path(ctx,[[12,-4],[27,0],[12,4]],color);ctx.restore()}
    circle(ctx,0,0,7,e.cool<.7?'#ffd8ae':'#ff9b73');circle(ctx,0,0,3,dark);
    break;
  }
  if(e.warning>0&&e.kind!=='charger'){
   ctx.save();ctx.globalAlpha=.55+e.warning*.4;
   circle(ctx,-Math.min(e.r,22),0,3.5,'#fff4c2');
   circle(ctx,-Math.min(e.r,22),0,6+e.warning*3,null,'#ffca79');ctx.restore();
  }
  if(e.drop){ctx.fillStyle='#281b12';ctx.font='bold 9px monospace';ctx.fillText('P',e.kind==='carrier'?-15:3,3)}
  ctx.restore();
 }
 return {create,spawnWave,update,draw,damageScale,types};
});
