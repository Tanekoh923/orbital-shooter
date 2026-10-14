(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.OrbitalWeapons=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const colors={vector:'#62eaff',tempest:'#8dbdff',lancer:'#ffb46c',prism:'#d8a1ff'};
const profiles={
 vector:{name:'直進レーザー',one:'前方集中 / 装甲に有効',two:'威力UP / 敵を貫通'},
 tempest:{name:'波動レーザー',one:'上下にうねる波動 / 装甲に有効',two:'波の幅・弾サイズ・威力UP'},
 lancer:{name:'炸裂レーザー',one:'命中で炸裂 / 爆発半径38',two:'威力UP / 爆発半径65'},
 prism:{name:'分岐レーザー',one:'上下2方向 / 装甲に有効',two:'中央を加え3方向 / 敵を貫通'}
};
function describe(craft,level){const p=profiles[craft]||profiles.vector;return {name:p.name+' Lv.'+level,effect:level===2?p.two:p.one,preview:'Lv.1：'+p.one+' → Lv.2：'+p.two}}
function decorate(s,craft,level,option=false){
 Object.assign(s,{craft,level,option,originX:s.x,originY:s.y});
 if(s.laser||s.wave)s.trail=[{x:s.x,y:s.y}];return s;
}
function trim(points,length){
 const result=[points[points.length-1]];let remaining=length;
 for(let i=points.length-2;i>=0&&remaining>0;i--){const end=result[0],p=points[i],d=Math.hypot(end.x-p.x,end.y-p.y);if(d<.001)continue;
  if(d>remaining){const ratio=remaining/d;result.unshift({x:end.x+(p.x-end.x)*ratio,y:end.y+(p.y-end.y)*ratio});break}
  result.unshift(p);remaining-=d;
 }
 return result;
}
function length(s){return s.wave?(s.level===2?116:86):s.craft==='prism'?(s.level===2?158:112):(s.level===2?196:142)}
function clip(points,blocked,radius){
 const safe=[points[points.length-1]];
 for(let i=points.length-2;i>=0;i--){const end=safe[0],p=points[i],steps=Math.max(1,Math.ceil(Math.hypot(end.x-p.x,end.y-p.y)/8));
  for(let n=1;n<=steps;n++){const q={x:end.x+(p.x-end.x)*n/steps,y:end.y+(p.y-end.y)*n/steps};if(blocked(q.x,q.y,radius))return safe;safe.unshift(q)}
 }
 return safe;
}
// The visible beam and collision use this same bounded, terrain-clipped path.
function advance(s,dt,blocked){
 const ax=s.prevX??s.x,ay=s.prevY??s.y,dx=s.x-ax,dy=s.y-ay;
 const steps=Math.max(1,Math.ceil(Math.max(Math.hypot(dx,dy)/8,s.wave?dt*110:0))),travel=[];let obstruction=null;
 s.occluded=false;
 for(let n=0;n<=steps;n++){const f=n/steps,age=Math.max(0,s.age-dt+dt*f),q={x:ax+dx*f,y:s.wave?s.baseY+Math.sin(age*22)*s.amplitude:ay+dy*f};
  if(blocked(q.x,q.y,s.ground?2:(s.r||2))){obstruction=q;break}
  travel.push(q);
 }
 if(s.laser||s.wave){
  if(!travel.length){s.occluded=true;s.path=[];return obstruction}
  s.x=travel[travel.length-1].x;s.y=travel[travel.length-1].y;
  if(dt===0&&(!s.trail?.length||Math.hypot(s.trail[s.trail.length-1].x-s.x,s.trail[s.trail.length-1].y-s.y)>.01))s.trail=[{x:s.x,y:s.y}];
  s.trail=trim([...(s.trail||[]),...travel.slice(1)],length(s));
  if(s.trail.length>64)s.trail=s.trail.filter((p,i)=>i===0||i%2===1||i===s.trail.length-1);
  s.path=clip(s.trail,blocked,s.r||2);
 }
 return obstruction;
}
function path(s){return s.path||[{x:s.prevX??s.x,y:s.prevY??s.y},{x:s.x,y:s.y}]}
function contact(points,target,radius){
 if(!points.length)return null;
 let distance=0;
 for(let i=0;i<Math.max(1,points.length-1);i++){
  const a=points[i],b=points[i+1]||a,dx=b.x-a.x,dy=b.y-a.y,fx=a.x-target.x,fy=a.y-target.y,A=dx*dx+dy*dy,C=fx*fx+fy*fy-radius*radius;
  if(C<=0)return {x:a.x,y:a.y,distance};
  if(A>0){const B=2*(fx*dx+fy*dy),D=B*B-4*A*C;if(D>=0){const u=(-B-Math.sqrt(D))/(2*A);if(u>=0&&u<=1)return {x:a.x+dx*u,y:a.y+dy*u,distance:distance+Math.sqrt(A)*u}}}
  distance+=Math.sqrt(A);
 }
 return null;
}
function stroke(ctx,points,width,color,alpha=1){
 ctx.globalAlpha=alpha;ctx.lineWidth=width;ctx.strokeStyle=color;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
}
function drawShot(ctx,s){
 const color=colors[s.craft]||colors.vector;ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
 if(s.laser||s.wave){
  const points=path(s),wide=s.wave?(s.r||7)*1.4:s.level===2?9:6;
  stroke(ctx,points,wide+8,color,s.option?.16:.23);stroke(ctx,points,wide,color,s.option?.65:.92);stroke(ctx,points,s.wave?3:s.level===2?3.3:2,'#f2fdff',s.option?.78:1);
  ctx.globalAlpha=s.option?.78:1;ctx.fillStyle='#ffffff';ctx.beginPath();ctx.ellipse(s.x,s.y,s.wave?(s.r||7)*.6:6,s.wave?(s.r||7)*.6:3,Math.atan2(s.vy,s.vx),0,Math.PI*2);ctx.fill();
  if(s.pierce){ctx.strokeStyle=color;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(s.x-13,s.y-8);ctx.lineTo(s.x+4,s.y);ctx.lineTo(s.x-13,s.y+8);ctx.stroke()}
 }else if(s.orb){
  const tail=Math.min(42,Math.max(0,s.x-(s.originX??s.x)));stroke(ctx,[{x:s.x-tail,y:s.y},{x:s.x,y:s.y}],s.r,color,.35);
  ctx.fillStyle=color;ctx.globalAlpha=.22;ctx.beginPath();ctx.arc(s.x,s.y,s.r+6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.lineWidth=2;ctx.strokeStyle=color;ctx.beginPath();ctx.arc(s.x,s.y,s.r+2,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#fff1d7';ctx.beginPath();ctx.arc(s.x,s.y,s.r*.63,0,Math.PI*2);ctx.fill();
 }else{ctx.fillStyle=s.missile?'#f0c275':color;ctx.translate(s.x,s.y);ctx.rotate(Math.atan2(s.vy,s.vx));ctx.fillRect(-12,-2,s.missile?13:22,3)}
 ctx.restore();
}
function impact(kind,x,y,craft,radius=0){return {kind,x,y,craft,radius,age:0,duration:kind==='splash'?.32:.18}}
function updateEffects(effects,dt){for(const e of effects)e.age+=dt;return effects.filter(e=>e.age<e.duration)}
function drawEffects(ctx,effects){
 for(const e of effects){const f=e.age/e.duration,color=colors[e.craft]||colors.vector;ctx.save();ctx.globalAlpha=(1-f)*.9;ctx.strokeStyle=e.kind==='blocked'?'#f7d2a6':color;ctx.lineWidth=2;
  if(e.kind==='splash'){
   // Fixed outer boundary is the actual splash radius; the inner ring expands to it.
   ctx.globalAlpha=(1-f)*.4;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=(1-f)*.9;ctx.beginPath();ctx.arc(e.x,e.y,e.radius*Math.min(1,.18+f*1.25),0,Math.PI*2);ctx.stroke();
   ctx.globalAlpha=(1-f)*.1;ctx.fillStyle=color;ctx.beginPath();ctx.arc(e.x,e.y,e.radius,0,Math.PI*2);ctx.fill();
  }else{
   const r=(e.kind==='pierce'?10:7)+f*13;ctx.beginPath();ctx.moveTo(e.x-r,e.y);ctx.lineTo(e.x+r,e.y);ctx.moveTo(e.x,e.y-r*.55);ctx.lineTo(e.x,e.y+r*.55);ctx.stroke();ctx.beginPath();ctx.arc(e.x,e.y,3+f*8,0,Math.PI*2);ctx.stroke();
   if(e.kind==='blocked'){ctx.font='bold 11px monospace';ctx.fillStyle='#ffe1b9';ctx.fillText('BLOCK',e.x-18,e.y-15)}
  }
  ctx.restore();
 }
}
function preview(ctx,craft,time=0){
 ctx.clearRect(0,0,360,96);ctx.fillStyle='#05131d';ctx.fillRect(0,0,360,96);ctx.strokeStyle='#253d4933';ctx.lineWidth=1;
 for(let x=60;x<360;x+=24){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,96);ctx.stroke()}
 for(const level of [1,2]){const y=level===1?26:73;ctx.fillStyle='#d5e8ed';ctx.font='bold 10px monospace';ctx.fillText('Lv.'+level,9,y+3);ctx.fillStyle=colors[craft]||colors.vector;ctx.fillRect(48,y-3,14,6);
  const penetrating=level===2&&(craft==='vector'||craft==='prism');
  const end=(craft==='lancer'?314:penetrating?346:304)+Math.sin(time*3)*2,amplitude=level===2?10:5;
  const branches=craft==='prism'?(level===2?[-1,0,1]:[-1,1]):[0];
  for(const branch of branches){const points=[];for(let x=70;x<=end;x+=6)points.push({x,y:y+(craft==='tempest'?Math.sin((x-70)/24-time*5)*amplitude:branch*(x-70)/180*(level===2?13:8))});const tip=points[points.length-1];
   drawShot(ctx,{...tip,prevX:70,prevY:y,originX:70,vx:710,vy:branch*55,craft,level,path:points,laser:craft==='vector'||craft==='prism',wave:craft==='tempest',orb:craft==='lancer',r:craft==='lancer'?(level===2?7:5):5,pierce:level===2&&(craft==='vector'||craft==='prism')});
  }
  ctx.strokeStyle='#67828a';ctx.lineWidth=1;ctx.strokeRect(309,y-8,14,16);
  if(craft==='lancer')drawEffects(ctx,[{...impact('splash',316,y,craft,level===2?20:12),age:(time*.22)%.3}]);
  if(level===2&&(craft==='vector'||craft==='prism')){ctx.fillStyle=colors[craft];ctx.font='10px monospace';ctx.fillText('貫通',290,y-13)}
 }
}
return {describe,decorate,advance,path,contact,drawShot,impact,updateEffects,drawEffects,preview,trim};
});
