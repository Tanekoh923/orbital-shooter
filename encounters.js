(function(root,factory){
 'use strict';
 const api=factory(typeof module==='object'&&module.exports?require('./enemies.js'):root.OrbitalEnemies);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.OrbitalEncounters=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Enemies){
 'use strict';
 const W=1200,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const stageOf=s=>clamp(Number.isFinite(s)?Math.floor(s):0,0,4);
 const timeOf=t=>Math.max(0,Number.isFinite(t)?t:0);
 const difficultyOf=d=>d==='easy'?'easy':d==='hard'?'hard':'normal';
 const hazardKinds=new Set(['pillar','gate','vent']);
 function boundsAt(stage,x,time,World,fallback){
  const b=World&&typeof World.bounds==='function'?World.bounds(stage,x,time):typeof fallback==='function'?fallback(x):null;
  const top=clamp(Number.isFinite(b?.top)?b.top:28,0,480),bottom=clamp(Number.isFinite(b?.bottom)?b.bottom:532,top+60,560);
  return {top,bottom};
 }
 function nearHazards(stage,x,time,World){
  if(!World||typeof World.hazards!=='function')return [];
  const found=[];
  // A short horizon covers a warning or a gate activation before the ship arrives.
  for(const ahead of [0,1,2]){
   for(const h of World.hazards(stage,time+ahead)){
    if(!hazardKinds.has(h.kind)||(!h.active&&!h.warning)||h.h<=0)continue;
    const left=h.r?h.x-h.r:h.x,right=h.r?h.x+h.r:h.x+h.w;
    if(right<x-55||left>x+480)continue;
    found.push({...h,ahead,left,right});
   }
  }
  return found;
 }
 function pressure(stageIndex,x,time,World){
  const stage=stageOf(stageIndex),t=timeOf(time),anchor=Number.isFinite(x)?x:170;
  let value=0;
  for(const ahead of [0,1,2]){
   for(const offset of [0,160,360]){
    const b=boundsAt(stage,anchor+offset,t+ahead,World);
    const narrow=clamp((410-(b.bottom-b.top))/260,0,1);
    value=Math.max(value,narrow*.65);
   }
  }
  for(const h of nearHazards(stage,anchor,t,World)){
   const distance=Math.max(0,h.left-anchor),proximity=1-clamp(distance/480,0,1);
   const b=boundsAt(stage,(h.left+h.right)/2,t+h.ahead,World),obstruction=clamp(h.h/(b.bottom-b.top),0,1);
   value=Math.max(value,(h.warning?.42:.52)+proximity*.22+obstruction*.16-h.ahead*.035);
  }
  return clamp(value,0,1);
 }
 function safeLane(stage,time,World,boundsFn){
  const candidates=[.5,.3,.7,.42,.58],speed=150;
  let best=.5,bestScore=-Infinity;
  for(const lane of candidates){
   let score=0;
   for(const x of [1100,920,740,560]){
    const future=time+(W+45-x)/speed,b=boundsAt(stage,x,future,World,boundsFn),y=b.top+(b.bottom-b.top)*lane;
    score+=Math.min(y-b.top,b.bottom-y)/100;
    if(World&&typeof World.collides==='function'&&World.collides(stage,x,y,25,future,false).hit)score-=12;
   }
   if(score>bestScore){best=lane;bestScore=score}
  }
  return best;
 }
 function escort(stage,index,time,boundsFn,World,count=2,kind='scout'){
  const lane=safeLane(stage,time,World,boundsFn),items=[];
  for(let i=0;i<count;i++){
   const x=W+45+i*85,b=boundsAt(stage,x,time,World,boundsFn),r=Enemies.types[kind].r;
   const y=clamp(b.top+(b.bottom-b.top)*lane,b.top+r+5,b.bottom-r-5);
   items.push(Enemies.create(kind,x,y,stage,{lane,followLane:true,phase:i*.7,cool:3.8+i*.35,bornAt:time,drop:false}));
  }
  return items;
 }
 function plan(stageIndex,waveIndex,time,boundsFn,World,difficulty='normal'){
  const stage=stageOf(stageIndex),index=Math.max(0,Math.floor(Number.isFinite(waveIndex)?waveIndex:0)),t=timeOf(time),mode=difficultyOf(difficulty);
  const factor=mode==='easy'?1.18:mode==='hard'?.88:1;
  const baseDelay=(3.7-stage*.22)*factor,currentPressure=pressure(stage,170,t,World);
  const nearby=nearHazards(stage,170,t,World),terrainThreat=nearby.length>0;
  let enemies=Enemies.spawnWave(stage,index,t,boundsFn),calm=false,label='編隊迎撃',nextDelay=baseDelay;
  if(stage===0&&t<10){
   enemies=escort(stage,index,t,boundsFn,World,3,index%2?'wave':'scout');
   for(const e of enemies)e.cool+=.8;
   label=index===0?'編隊迎撃 / カプセルを回収':'序盤編隊 / 装備を強化';
  }else if(terrainThreat&&index%5===3){
   // This event is consumed like a wave; the next event resumes after a brief gap.
   enemies=[];calm=true;nextDelay=.8;label='地形突破 / 通路を確保';
  }else if(terrainThreat&&enemies.some(e=>['charger','carrier','mine'].includes(e.kind))){
   enemies=escort(stage,index,t,boundsFn,World,2);calm=true;
   nextDelay=Math.max(3.1,baseDelay);label='地形突破 / 小編隊';
  }else if(terrainThreat){
   // Surface obstacles already demand movement; avoid adding a turret escort wall.
   enemies=enemies.filter(e=>e.kind!=='turret'&&e.kind!=='ceilingTurret');
   if(!enemies.length)enemies=escort(stage,index,t,boundsFn,World,2);
   enemies=enemies.slice(0,3);calm=true;label='地形突破 / 安全な通路へ';
   for(const e of enemies)e.cool+=1.2;
  }else if(t>=8&&nearHazards(stage,170,Math.max(0,t-3),World).length&&index%3!==1){
   enemies=escort(stage,index,t,boundsFn,World,2);label='突破報酬 / 装備カプセル';
  }else if(currentPressure>.55&&enemies.some(e=>e.kind==='carrier'||e.kind==='mine')){
   enemies=escort(stage,index,t,boundsFn,World,3);calm=true;label='狭い通路 / 編隊迎撃';
  }else{
   label=[['海岸の迎撃隊','海岸防衛線'],['火山帯の迎撃隊','溶岩帯の警戒隊'],['氷洞の迎撃隊','蛇行通路の防衛隊'],['遺跡の迎撃隊','石柱間の警戒隊'],['要塞の迎撃隊','最終防衛線']][stage][index%2];
  }
  if(currentPressure>.35&&!terrainThreat){
   enemies=enemies.slice(0,3);nextDelay+=.35;
   for(const e of enemies)e.cool+=.6;
   if(!label.startsWith('突破報酬'))label='狭い通路 / 間隔をあけた迎撃隊';
  }
  // Capsules arrive on selected waves and on the first safe escort after an obstacle.
  // Ordinary waves and carrier children still matter for score, without constant upgrades.
  for(const e of enemies){e.drop=false;e.cool*=mode==='easy'?1.25:mode==='hard'?.85:1}
  const capsuleWave=index%3===0||label.startsWith('突破報酬');
  if(enemies.length&&capsuleWave)enemies[enemies.length-1].drop=true;
  return {enemies,nextDelay,label,calm};
 }
 return {plan,pressure};
});
