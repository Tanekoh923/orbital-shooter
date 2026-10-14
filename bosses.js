(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.OrbitalBosses=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const TAU=Math.PI*2;
 const HP=[170,195,225,250,285];
 const COLORS=['#80f9e4','#ffb477','#a9dfff','#b4ed8c','#ff88ac'];
 const LEVELS={easy:{hp:.75,rate:1.22,dps:22},normal:{hp:1,rate:1,dps:18},hard:{hp:1.25,rate:.86,dps:16}};
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 const level=name=>LEVELS[name]||LEVELS.normal;
 function create(stage,difficulty='normal'){
  const index=clamp(Math.trunc(Number(stage)||0),0,4),settings=level(difficulty),max=Math.round(HP[index]*settings.hp);
  const b={stage:index,difficulty:LEVELS[difficulty]?difficulty:'normal',x:1040,y:280,hp:max,max,age:0,cool:1.1,volley:0,phase:1,transition:0,warning:false,lockY:280,chargeCycle:-1,damageBudget:settings.dps*.22,parts:[],cue:'接近中 / 攻撃に備えよう'};
  b.core={kind:'core',x:b.x-18,y:b.y,r:29,hp:max,max,open:false};
  const part=(kind,hp,r,offsetY)=>({kind,x:b.x-42,y:b.y+offsetY,r,hp:Math.round(hp*settings.hp),max:Math.round(hp*settings.hp),offsetY});
  if(index===0)b.parts=[part('turret',16,20,-66),part('turret',16,20,66)];
  if(index===2)b.parts=[part('iceShield',15,22,-68),part('iceShield',15,22,68)];
  if(index===3)b.parts=[part('arm',18,22,-68),part('arm',18,22,68)];
  if(index===4)b.parts=[part('relay',20,22,-74),part('relay',20,22,74)];
  positionTargets(b);return b;
 }
 function positionTargets(b){
  b.core.x=b.x-18;b.core.y=b.y;b.core.hp=b.hp;
  b.parts.forEach((p,i)=>{
   if(b.stage===2){const a=b.age*.65+i*Math.PI;p.x=b.x-18+Math.cos(a)*72;p.y=b.y+Math.sin(a)*72;}
   else if(b.stage===4){const a=b.age*.35-Math.PI/2+i*Math.PI;p.x=b.x+Math.cos(a)*79;p.y=b.y+Math.sin(a)*79;}
   else{p.x=b.x-42;p.y=b.y+p.offsetY;}
  });
 }
 function beginSecondPhase(b,notify){
  if(b.phase!==1||b.hp<=0)return;
  b.phase=2;b.transition=1.05;b.warning=false;b.wallWarning=false;b.core.open=false;b.cool=1.2;b.phaseNotice=true;b.cue='第2形態予告 / 一度距離を取ろう';
  if(notify){notify('第2形態予告 / 攻撃が変わります');b.phaseNotice=false;}
 }
 function livingParts(b){return b.parts.filter(p=>p.hp>0);}
 function targets(b){return b.hp>0?[...livingParts(b),b.core]:[];}
 function damage(b,target,shot){
  const rejected={accepted:false,damage:0,defeated:b.hp<=0};
  if(b.hp<=0||!target||target.hp<=0||b.transition>0||b.age<1)return rejected;
  if(target===b.core&&!b.core.open)return rejected;
  if(target!==b.core&&!b.parts.includes(target))return rejected;
  const raw=typeof shot==='number'?shot:Number(shot&&shot.damage);
  if(!(raw>0)||!Number.isFinite(raw))return rejected;
  const amount=Math.min(raw*(target.kind==='iceShield'?.8:1),Math.max(0,b.damageBudget),target===b.core?b.hp:target.hp);
  if(amount<=0)return rejected;
  b.damageBudget=Math.max(0,b.damageBudget-amount);
  if(target===b.core){b.hp=Math.max(0,b.hp-amount);b.core.hp=b.hp;}
  else target.hp=Math.max(0,target.hp-amount);
  const partDestroyed=target!==b.core&&target.hp===0;
  const phaseBefore=b.phase;
  if(b.hp>0&&b.phase===1&&(b.hp<=b.max*.5||(b.parts.length>0&&livingParts(b).length===0)))beginSecondPhase(b);
  return {accepted:true,damage:amount,partDestroyed,phaseChanged:phaseBefore!==b.phase,defeated:b.hp===0};
 }
 function fan(shoot,x,y,angle,count,spread,speed=190,r=6){
  for(let i=0;i<count;i++)shoot(x,y,angle+(i-(count-1)/2)*spread,speed,r);
 }
 function aim(x,y,ship){return Math.atan2(ship.y-y,ship.x-x);}
 function volley(b,{ship,shoot}){
  const x=b.x-56,y=b.y,a=aim(x,y,ship),hard=b.difficulty==='hard',second=b.phase===2,alive=livingParts(b);
  if(b.stage===0){
   fan(shoot,x,y,a,second?5:3,.18,190,6);
   for(const p of alive)fan(shoot,p.x-22,p.y,aim(p.x-22,p.y,ship),second?3:2,.15,175,5);
  }else if(b.stage===1){
   if(!b.warning){fan(shoot,x,y,a,second?5:3,.14,205,6);if(second&&b.volley%2===0)for(const offset of [-65,65])shoot(x,y+offset,Math.PI,170,5);}
  }else if(b.stage===2){
   const count=second?10:8,offset=b.volley*.38;
   for(let i=0;i<count;i++)shoot(x,y,offset+i*TAU/count,second?165:150,5);
   if(second&&b.volley%2===0)fan(shoot,x,y,a,3,.16,190,6);
  }else if(b.stage===3){
   const gap=b.gapY||280;
   for(let row=65;row<=500;row+=48)if(Math.abs(row-gap)>69)shoot(x,row,Math.PI,second?165:145,6);
   for(const p of alive)fan(shoot,p.x-25,p.y,aim(p.x-25,p.y,ship),second?3:2,.16,165,5);
  }else{
   fan(shoot,x,y,a,second?5:3,.16,190,6);
   if(second&&b.volley%2===0){const count=hard?10:8;for(let i=0;i<count;i++)shoot(x,y,b.volley*.35+i*TAU/count,145,5);}
   else for(const p of alive)shoot(p.x-15,p.y,aim(p.x-15,p.y,ship),165,5);
  }
  b.volley++;
 }
 function update(b,dt,environment){
  if(!b||b.hp<=0||!Number.isFinite(dt)||dt<=0)return;
  const step=Math.min(dt,.1),settings=level(b.difficulty),ship=environment.ship||{x:170,y:280},shoot=environment.shoot||(()=>{}),notify=environment.notify;
  b.damageBudget=Math.min(settings.dps*.22,b.damageBudget+settings.dps*step);
  b.age+=step;
  if(b.phaseNotice&&notify){notify('第2形態予告 / 攻撃が変わります');b.phaseNotice=false;}
  if(b.phase===1&&b.hp<=b.max*.5)beginSecondPhase(b,notify);
  if(b.transition>0){b.transition=Math.max(0,b.transition-step);b.core.open=false;b.warning=false;b.cue='第2形態予告 / 一度距離を取ろう';positionTargets(b);return;}
  const second=b.phase===2;
  if(b.stage===0){b.x=1030+Math.sin(b.age*.32)*28;b.y=280+Math.sin(b.age*.55)*104;}
  if(b.stage===1){
   const length=second?7.5:9,cycle=b.age%length,cycleNumber=Math.floor(b.age/length),start=second?3.8:5;
   if(cycle>=start&&b.chargeCycle!==cycleNumber){b.lockY=clamp(ship.y,112,448);b.chargeCycle=cycleNumber;}
   b.warning=cycle>=start&&cycle<start+1.1;
   const charging=cycle>=start+1.1&&cycle<start+2.35;
   b.x=charging?1040-Math.sin((cycle-start-1.1)/1.25*Math.PI)*280:1040;
   const target=cycle>=start&&cycle<start+2.35?b.lockY:280+Math.sin(b.age*.65)*128;
   b.y+=(target-b.y)*Math.min(1,step*(b.warning?5:3.2));
   if(b.warning)b.cue='突進予告 / 光る横線から上下へ退避';
  }
  if(b.stage===2){b.x=1030+Math.cos(b.age*.5)*37;b.y=280+Math.sin(b.age*.6)*128;}
  if(b.stage===3){b.x=1040;b.y=280+Math.sin(b.age*.32)*86;}
  if(b.stage===4){b.x=1020+Math.sin(b.age*.48)*48;b.y=280+Math.sin(b.age*.7)*119;}
  b.y=clamp(b.y,112,448);
  const period=b.stage===0?6:(second?7.2:7),closed=b.stage===0?(second?1.75:2):(second?1.15:1.5);
  b.core.open=b.age>=1&&(b.age%period>=closed||b.parts.length>0&&livingParts(b).length===0);
  if(b.stage===1&&b.warning)b.core.open=false;
  if(!b.warning){
   b.cue=b.core.open?'コア開放 / 光る中心を狙おう':b.parts.length&&livingParts(b).length?'コア閉鎖 / 周囲の部位を狙おう':'コア閉鎖 / 次の開放を待とう';
  }
  positionTargets(b);
  if(b.age<1){b.cue='接近中 / 攻撃に備えよう';return;}
  b.cool-=step;
  const interval=([1.7,1.6,2.15,2.6,1.9][b.stage]-(second?.22:0))*settings.rate;
  if(b.stage===3){
   // A wide, stationary gap is shown before the wall launches. Never retarget
   // the gap in the final warning, so the player can commit to a safe lane.
   if(b.cool>.72||!Number.isFinite(b.gapY))b.gapY=clamp(ship.y,130,430);
   b.wallWarning=b.cool<=.72;
   if(b.wallWarning)b.cue='弾幕予告 / 緑の安全通路へ移動';
  }
  if(b.cool<=0){volley(b,{ship,shoot});b.cool=interval;b.wallWarning=false;}
 }
 function status(b){return `第${b.phase}形態 / ${b.cue}`;}
 function polygon(ctx,points,color){ctx.fillStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();}
 function circle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
 function draw(ctx,b,stage=b.stage,time=b.age){
  if(!b)return;
  const color=COLORS[b.stage],pulse=.6+Math.sin(b.age*7)*.15;
  if(b.warning){ctx.save();ctx.strokeStyle='#ffe5a8';ctx.globalAlpha=.65;ctx.lineWidth=3;ctx.setLineDash([15,10]);ctx.beginPath();ctx.moveTo(32,b.lockY);ctx.lineTo(b.x-72,b.lockY);ctx.stroke();ctx.setLineDash([]);ctx.restore();}
  if(b.wallWarning){ctx.save();ctx.fillStyle='#b4ed8c';ctx.globalAlpha=.09;ctx.fillRect(32,b.gapY-66,b.x-100,132);ctx.globalAlpha=.75;ctx.strokeStyle=color;ctx.setLineDash([10,10]);ctx.beginPath();ctx.moveTo(32,b.gapY-66);ctx.lineTo(b.x-56,b.gapY-66);ctx.moveTo(32,b.gapY+66);ctx.lineTo(b.x-56,b.gapY+66);ctx.stroke();ctx.restore();}
  ctx.save();ctx.translate(b.x,b.y);
  if(b.transition>0){ctx.strokeStyle='#fff2c3';ctx.lineWidth=3;ctx.globalAlpha=pulse;ctx.beginPath();ctx.arc(-18,0,105+Math.sin(b.age*12)*5,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
  if(b.stage===0){
   polygon(ctx,[[100,-42],[-28,-42],[-72,-18],[-72,18],[-28,42],[100,42]],'#425565');
   polygon(ctx,[[85,-30],[108,-15],[108,15],[85,30],[73,15],[73,-15]],'#253c4b');
   ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-27,-35);ctx.lineTo(58,-35);ctx.moveTo(-27,35);ctx.lineTo(58,35);ctx.stroke();
   for(const p of b.parts){ctx.fillStyle=p.hp>0?'#273b49':'#172831';ctx.fillRect(-30,p.offsetY-17,125,34);if(p.hp<=0){ctx.fillStyle='#657581';ctx.fillRect(-25,p.offsetY-8,18,4);}}
  }else if(b.stage===1){
   polygon(ctx,[[-88,0],[-24,-27],[45,-78],[23,-24],[95,-38],[69,0],[95,38],[23,24],[45,78],[-24,27]],'#74442d');
   polygon(ctx,[[-72,0],[-18,-10],[65,-13],[80,0],[65,13],[-18,10]],b.warning?'#ffe3a2':color);
   if(b.phase===2){polygon(ctx,[[20,-40],[65,-105],[63,-45]],'#a66d45');polygon(ctx,[[20,40],[65,105],[63,45]],'#a66d45');}
  }else if(b.stage===2){
   ctx.save();ctx.rotate(b.age*.25);for(let i=0;i<6;i++){ctx.rotate(Math.PI/3);polygon(ctx,[[15,-17],[73,-28],[92,0],[73,28],[15,17]],'#577f9b');polygon(ctx,[[40,-7],[82,0],[40,7]],color);}ctx.restore();
   ctx.strokeStyle='#d8f5ff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-18,0,53,0,TAU);ctx.stroke();
  }else if(b.stage===3){
   polygon(ctx,[[-68,-75],[68,-75],[85,-40],[85,40],[68,75],[-68,75],[-82,40],[-82,-40]],'#485b3d');
   ctx.fillStyle='#253427';ctx.fillRect(-55,-58,110,116);ctx.strokeStyle=color;ctx.lineWidth=4;ctx.strokeRect(-63,-64,126,128);
   if(b.phase===2){ctx.fillStyle='#78865d';ctx.fillRect(29,-92,28,26);ctx.fillRect(29,66,28,26);}
  }else{
   ctx.save();ctx.rotate(-b.age*.3);for(let i=0;i<8;i++){ctx.rotate(Math.PI/4);polygon(ctx,[[50,-12],[83,-22],[100,0],[83,22],[50,12]],'#653a58');}ctx.restore();
   ctx.strokeStyle=color;ctx.lineWidth=5;ctx.beginPath();ctx.arc(0,0,63,0,TAU);ctx.stroke();
   if(b.phase===2){ctx.strokeStyle='#fff2dc';ctx.lineWidth=2;ctx.beginPath();ctx.arc(-18,0,40,0,TAU);ctx.stroke();}
  }
  ctx.restore();
  for(const p of b.parts){
   if(p.hp<=0)continue;
   ctx.save();ctx.translate(p.x,p.y);ctx.strokeStyle=color;ctx.lineWidth=2;
   if(p.kind==='iceShield'){ctx.rotate(b.age*.65);polygon(ctx,[[-24,0],[-12,-23],[14,-23],[25,0],[14,23],[-12,23]],'#314f69');ctx.strokeRect(-13,-13,26,26);}
   else if(p.kind==='relay'){circle(ctx,0,0,22,'#4b2946');ctx.beginPath();ctx.arc(0,0,19,0,TAU);ctx.stroke();circle(ctx,0,0,9,color);}
   else{ctx.fillStyle='#172a32';ctx.fillRect(-22,-18,44,36);ctx.strokeRect(-22,-18,44,36);ctx.fillStyle=color;ctx.fillRect(-31,-5,28,10);}
   ctx.fillStyle='#13242d';ctx.fillRect(-22,-29,44,4);ctx.fillStyle=color;ctx.fillRect(-22,-29,44*p.hp/p.max,4);ctx.restore();
  }
  circle(ctx,b.core.x,b.core.y,29,'#111d29');
  if(b.core.open){
   ctx.save();ctx.shadowColor=color;ctx.shadowBlur=18;circle(ctx,b.core.x,b.core.y,19+Math.sin(b.age*4)*2,color);ctx.restore();circle(ctx,b.core.x-6,b.core.y-5,6,'#fff7df');
  }else{
   ctx.save();ctx.translate(b.core.x,b.core.y);ctx.fillStyle='#7b8b93';ctx.fillRect(-26,-22,23,44);ctx.fillRect(3,-22,23,44);ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-3,-22);ctx.lineTo(-3,22);ctx.moveTo(3,-22);ctx.lineTo(3,22);ctx.stroke();ctx.restore();
  }
 }
 return {create,update,targets,damage,draw,status};
});
