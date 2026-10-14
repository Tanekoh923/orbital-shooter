(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OrbitalRecords=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const key='orbital-progress-v2',crafts=['vector','tempest','lancer','prism'],defenses=['guard','front','limit','core'],difficulties=['easy','normal','hard'],gauge=[0,1,5,2,3,4];
 const integer=(v,min,max,fallback=0)=>Number.isInteger(v)&&v>=min&&v<=max?v:fallback;
 const choice=(v,values,fallback)=>values.includes(v)?v:fallback;
 function settings(raw={}){
  if(!raw||typeof raw!=='object')raw={};
  return {craft:choice(raw.craft,crafts,'vector'),defense:choice(raw.defense,defenses,'guard'),gauge:Array.isArray(raw.gauge)&&raw.gauge.length===6&&new Set(raw.gauge).size===6&&Array.from(raw.gauge).every(v=>gauge.includes(v))?[...raw.gauge]:[...gauge],difficulty:choice(raw.difficulty,difficulties,'normal'),mode:choice(raw.mode,['campaign','stage','boss'],'campaign'),stage:integer(raw.stage,0,4)};
 }
 function checkpoint(raw){
  if(!raw||typeof raw!=='object'||!Number.isInteger(raw.stage)||raw.stage<0||raw.stage>4||!difficulties.includes(raw.difficulty)||!raw.ship||!Array.isArray(raw.ship.up)||raw.ship.up.length!==6)return null;
  const config=settings(raw.ship),capacity={guard:3,front:12,limit:1,core:3}[config.defense],maxima=[3,2,2,4,capacity,2];
  if(Array.from(raw.ship.up).some((v,i)=>!Number.isInteger(v)||v<0||v>maxima[i]))return null;
  const weapon=[2,5].includes(raw.ship.weapon)&&raw.ship.up[raw.ship.weapon]>0?raw.ship.weapon:null;
  const up=[...raw.ship.up],shieldTime=config.defense==='limit'&&up[4]>0?Math.max(0,Math.min(3,Number(raw.ship.shieldTime)||0)):0;
  if(config.defense==='limit'&&shieldTime<=0)up[4]=0;
  return {stage:raw.stage,difficulty:raw.difficulty,score:integer(raw.score,0,99999999),selection:integer(raw.selection,-1,5,-1),ship:{craft:config.craft,defense:config.defense,gauge:config.gauge,up,weapon,shieldTime}};
 }
 function normalize(raw,legacyBest=0){
  raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
  const result={version:2,unlockedStage:integer(raw.unlockedStage,0,4),unlockedBoss:integer(raw.unlockedBoss,0,4),settings:settings(raw.settings||{}),records:{easy:0,normal:integer(legacyBest,0,99999999),hard:0},checkpoint:checkpoint(raw.checkpoint)};
  for(const difficulty of difficulties){const value=raw.records?.[difficulty];if(Number.isInteger(value)&&value>=0&&value<=99999999)result.records[difficulty]=Math.max(result.records[difficulty],value)}
  result.unlockedBoss=Math.max(result.unlockedBoss,result.unlockedStage);
  result.settings.stage=Math.min(result.settings.stage,result.settings.mode==='boss'?result.unlockedBoss:result.unlockedStage);
  if(result.checkpoint&&result.checkpoint.stage>result.unlockedStage)result.checkpoint=null;
  return result;
 }
 function read(storage){
  let old=0,raw=null;try{const value=Number(storage.getItem('orbital-best'));if(Number.isInteger(value)&&value>=0)old=value}catch{}
  try{raw=JSON.parse(storage.getItem(key)||'null')}catch{}
  return normalize(raw,old);
 }
 function save(storage,data){try{storage.setItem(key,JSON.stringify(normalize(data)));return true}catch{return false}}
 return {key,settings,checkpoint,normalize,read,save};
});
