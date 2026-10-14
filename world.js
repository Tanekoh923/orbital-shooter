(function(root,factory){
 'use strict';
 const world=factory();
 if(typeof module==='object'&&module.exports)module.exports=world;
 else root.OrbitalWorld=world;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const width=1200,height=560,scrollSpeed=90,durations=[65,60,60,60,70],step=8;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 const stageOf=i=>clamp(Number.isFinite(i)?Math.floor(i):0,0,4);
 const timeOf=t=>Math.max(0,Number.isFinite(t)?t:0);
 const smooth=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
 const mix=(a,b,v)=>a+(b-a)*v;
 const cycle=(v,size)=>((v%size)+size)%size;

 function coast(s){
  return {top:20,bottom:514-Math.abs(Math.sin(s/145)*Math.cos(s/91))*64};
 }
 function profile(stage,s){
  if(stage===0)return coast(s);
  if(stage===1)return {top:25+Math.max(0,Math.sin(s/480))*12,bottom:474-Math.abs(Math.sin(s/180)*Math.cos(s/310))*69};
  if(stage===2){
   const center=280+Math.sin(s/620)*48+Math.sin(s/270)*17;
   const opening=276+Math.sin(s/480)*22;
   const facets=Math.abs(cycle(s+90,128)-64)/64*7;
   return {top:center-opening/2+facets,bottom:center+opening/2-facets};
  }
  if(stage===3)return {top:64+Math.sin(s/420)*22,bottom:496+Math.sin(s/370)*18};
  const ledge=cycle(s,940),roof=ledge>190&&ledge<440?106:62;
  const deck=cycle(s+350,830),floor=deck>220&&deck<510?444:502;
  return {top:roof,bottom:floor};
 }
 function raw(stage,s,t){
  const intro=stage===0?1:smooth((t-5)/5);
  const exit=smooth((t-(durations[stage]-9))/4);
  const a=coast(s),b=profile(stage,s);
  return {top:mix(mix(a.top,b.top,intro),20,exit),bottom:mix(mix(a.bottom,b.bottom,intro),540,exit)};
 }
 // Both the filled surface and collision use this same piecewise-linear profile.
 function bounds(stageIndex,x,time){
  const stage=stageOf(stageIndex),t=timeOf(time),s=(Number.isFinite(x)?x:0)+t*scrollSpeed;
  const left=Math.floor(s/step)*step,f=(s-left)/step,a=raw(stage,left,t),b=raw(stage,left+step,t);
  return {top:mix(a.top,b.top,f),bottom:mix(a.bottom,b.bottom,f)};
 }
 function nearby(t,start,spacing,visit){
  const offset=t*scrollSpeed;
  const first=Math.max(0,Math.floor((offset-140-start)/spacing));
  const last=Math.ceil((offset+width+140-start)/spacing);
  for(let n=first;n<=last;n++){
   const worldX=start+n*spacing,x=worldX-offset;
   if(x>=-140&&x<=width+140)visit(n,x,worldX);
  }
 }
 function hazards(stageIndex,time){
  const stage=stageOf(stageIndex),t=timeOf(time),items=[];
  if(t<5||t>=durations[stage]-9)return items;
  if(stage===1){
   nearby(t,2120,750,(n,x)=>{
    const floor=bounds(stage,x,t).bottom,age=(width+80-x)/scrollSpeed,phase=cycle(age,7.5);
    const active=phase>=1.8&&phase<5.7,warning=phase<1.8;
    items.push({id:'vent-'+n,kind:'vent',x:x-21,y:floor-120,w:42,h:120,active,warning});
   });
   nearby(t,1700,565,(n,x)=>{
    const r=25+(n%3)*4,floor=bounds(stage,x,t).bottom;
    items.push({id:'rock-'+n,kind:'rock',x,y:floor-r+3,w:r*2,h:r*2,r,active:true,warning:false});
   });
  }
  if(stage===3){
   nearby(t,2090,660,(n,x)=>{
    const b=bounds(stage,x,t),w=64,y=n%2?330:b.top,h=n%2?b.bottom-y:226-b.top;
    items.push({id:'pillar-'+n,kind:'pillar',x:x-w/2,y,w,h,active:true,warning:false});
   });
  }
  if(stage===4){
   nearby(t,2100,800,(n,x)=>{
    const b=bounds(stage,x,t),center=280+Math.sin(n*1.9)*27,opening=236;
    const age=(width+80-x)/scrollSpeed,phase=cycle(age,8),active=phase>=1.8&&phase<6.2,warning=phase<1.8;
    const upper=center-opening/2,lower=center+opening/2;
    items.push({id:'gate-'+n+'-upper',kind:'gate',x:x-32,y:b.top,w:64,h:Math.max(0,upper-b.top),active,warning});
    items.push({id:'gate-'+n+'-lower',kind:'gate',x:x-32,y:lower,w:64,h:Math.max(0,b.bottom-lower),active,warning});
   });
  }
  return items;
 }
 function touches(h,x,y,r){
  if(!h.active)return false;
  if(h.r)return Math.hypot(x-h.x,y-h.y)<=r+h.r;
  return Math.hypot(x-clamp(x,h.x,h.x+h.w),y-clamp(y,h.y,h.y+h.h))<=r;
 }
 function surfaceSource(stage,x,y,r,t,b){
  if(y<b.top)return {x,y:b.top,kind:'ceiling'};
  if(y>b.bottom)return {x,y:b.bottom,kind:'floor'};
  const offset=t*scrollSpeed,start=Math.floor((x-r+offset)/step)*step-offset,end=x+r;
  for(let left=start;left<=end;left+=step){
   const a=bounds(stage,left,t),c=bounds(stage,left+step,t);
   for(const edge of ['top','bottom']){
    const dy=c[edge]-a[edge],u=clamp(((x-left)*step+(y-a[edge])*dy)/(step*step+dy*dy),0,1);
    const nearestX=left+u*step,nearestY=a[edge]+u*dy;
    if(Math.hypot(x-nearestX,y-nearestY)<r)return {x:nearestX,y:nearestY,kind:edge==='top'?'ceiling':'floor'};
   }
  }
 }
 function safePosition(stage,t,b,items,x,y,r){
  const low=b.top+r+2,high=b.bottom-r-2;
  let best=clamp(y,low,high),distance=Infinity;
  const candidates=[best,(low+high)/2,low,high];
  for(const h of items){candidates.push(h.y-(h.r||0)-r-2,h.y+(h.r||h.h)+r+2)}
  for(let candidate=low;candidate<=high;candidate+=4)candidates.push(candidate);
  for(const candidate of candidates){
   if(candidate<low||candidate>high||surfaceSource(stage,x,candidate,r,t,b)||items.some(h=>touches(h,x,candidate,r)))continue;
   const d=Math.abs(candidate-y);if(d<distance){distance=d;best=candidate}
  }
  return best;
 }
 function collides(stageIndex,x,y,r,time,resolve=true){
  const stage=stageOf(stageIndex),t=timeOf(time),radius=Math.max(0,Number.isFinite(r)?r:15),b=bounds(stage,x,t),items=hazards(stage,t);
  let source=surfaceSource(stage,x,y,radius,t,b);
  if(!source){
   const h=items.find(item=>touches(item,x,y,radius));
   if(h)source={x:h.r?h.x:clamp(x,h.x,h.x+h.w),y:h.r?h.y:clamp(y,h.y,h.y+h.h),kind:h.kind,id:h.id};
  }
  if(!source)return {hit:false};
  if(!resolve)return {hit:true,source};
  return {hit:true,source,safeY:safePosition(stage,t,b,items,x,y,radius)};
 }
 // Beam bodies sample many points in one frame. Capture the same terrain edges
 // and hazards once so those probes do not rebuild the scrolling world each time.
 function collider(stageIndex,time){
  const stage=stageOf(stageIndex),t=timeOf(time),offset=t*scrollSpeed;
  const first=Math.floor((offset-160)/step),last=Math.ceil((offset+width+160)/step);
  const tops=new Float64Array(last-first+1),bottoms=new Float64Array(last-first+1);
  for(let i=0;i<tops.length;i++){const b=raw(stage,(first+i)*step,t);tops[i]=b.top;bottoms[i]=b.bottom}
  const items=hazards(stage,t).filter(h=>h.active);
  return function(x,y,r){
   const radius=Math.max(0,Number.isFinite(r)?r:15),from=Math.floor((x-radius+offset)/step),to=Math.floor((x+radius+offset)/step);
   if(!Number.isFinite(x)||!Number.isFinite(y)||from<first||to>=last)return collides(stage,x,y,radius,t,false);
   const worldIndex=Math.floor((x+offset)/step),index=worldIndex-first,f=(x+offset-worldIndex*step)/step;
   const top=mix(tops[index],tops[index+1],f),bottom=mix(bottoms[index],bottoms[index+1],f);
   if(y<top)return {hit:true,source:{x,y:top,kind:'ceiling'}};
   if(y>bottom)return {hit:true,source:{x,y:bottom,kind:'floor'}};
   for(let worldIndex=from;worldIndex<=to;worldIndex++){
    const i=worldIndex-first,left=worldIndex*step-offset;
    for(const edge of ['top','bottom']){
     const values=edge==='top'?tops:bottoms,a=values[i],c=values[i+1];
     if(y+radius<Math.min(a,c)||y-radius>Math.max(a,c))continue;
     const dy=c-a,u=clamp(((x-left)*step+(y-a)*dy)/(step*step+dy*dy),0,1),nearestX=left+u*step,nearestY=a+u*dy;
     if(Math.hypot(x-nearestX,y-nearestY)<radius)return {hit:true,source:{x:nearestX,y:nearestY,kind:edge==='top'?'ceiling':'floor'}};
    }
   }
   for(const h of items){
    if(x+radius<(h.r?h.x-h.r:h.x)||x-radius>(h.r?h.x+h.r:h.x+h.w)||y+radius<(h.r?h.y-h.r:h.y)||y-radius>(h.r?h.y+h.r:h.y+h.h))continue;
    if(touches(h,x,y,radius))return {hit:true,source:{x:h.r?h.x:clamp(x,h.x,h.x+h.w),y:h.r?h.y:clamp(y,h.y,h.y+h.h),kind:h.kind,id:h.id}};
   }
   return {hit:false};
  };
 }
 function describe(stageIndex,time){
  const stage=stageOf(stageIndex),t=timeOf(time);
  if(t>=durations[stage]-5)return 'ボス接近 / 開けた戦闘空域';
  if(t<5)return ['海岸線 / 編隊を迎撃','火山帯への進入','氷洞への進入','遺跡への進入','要塞への進入'][stage];
  return ['海岸の稜線 / 下側に注意','溶岩の噴出口 / 琥珀色の予告に注意','氷洞の蛇行通路 / 上下の壁に注意','遺跡の石柱 / 上下を交互に抜ける','防衛ゲート / 予告後に閉じる'][stage];
 }

 function polygon(ctx,points){
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();
 }
 function edgePoints(stage,t,ceiling){
  const offset=t*scrollSpeed,points=[[0,bounds(stage,0,t)[ceiling?'top':'bottom']]];
  let x=Math.ceil(offset/step)*step-offset;if(x===0)x+=step;
  for(;x<width;x+=step)points.push([x,bounds(stage,x,t)[ceiling?'top':'bottom']]);
  points.push([width,bounds(stage,width,t)[ceiling?'top':'bottom']]);return points;
 }
 function surfacePath(ctx,points,ceiling){
  polygon(ctx,[[0,ceiling?0:height],...points,[width,ceiling?0:height]]);
 }
 function line(ctx,points){
  ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.stroke();
 }
 function surface(ctx,stage,t,theme,ceiling){
  const points=edgePoints(stage,t,ceiling),color=theme.color||'#80f9e4',base=theme.ground||'#102835';
  ctx.save();surfacePath(ctx,points,ceiling);ctx.fillStyle=base;ctx.fill();ctx.clip();
  const gradient=ctx.createLinearGradient(0,ceiling?0:height,0,ceiling?160:400);
  gradient.addColorStop(0,'#06131ded');gradient.addColorStop(1,base);ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
  const offset=t*scrollSpeed;
  if(stage===0){
   const first=Math.floor(offset/116)*116;
   for(let s=first;s<offset+width+116;s+=116){
    const x=s-offset,y=bounds(stage,x,t).bottom;
    ctx.fillStyle='#244956';polygon(ctx,[[x-47,y+50],[x+9,y+6],[x+66,y+74],[x+43,height],[x-50,height]]);ctx.fill();
    ctx.strokeStyle='#47768055';ctx.lineWidth=1;line(ctx,[[x+9,y+8],[x+15,y+45],[x+46,y+73]]);
   }
  }else if(stage===1){
   for(let s=Math.floor(offset/94)*94;s<offset+width+94;s+=94){
    const x=s-offset,y=bounds(stage,x,t).bottom;
    ctx.fillStyle='#553827';polygon(ctx,[[x-35,y+50],[x+8,y+8],[x+65,y+58],[x+47,height],[x-36,height]]);ctx.fill();
    ctx.strokeStyle='#ff8f4b66';ctx.lineWidth=2;line(ctx,[[x-26,y+53],[x+8,y+69],[x+26,y+54],[x+57,y+94]]);
    ctx.strokeStyle='#efbe6740';ctx.lineWidth=1;line(ctx,[[x+8,y+8],[x+10,y+40],[x+28,y+50]]);
   }
  }else if(stage===2){
   for(let s=Math.floor(offset/105)*105;s<offset+width+105;s+=105){
    const x=s-offset,y=bounds(stage,x,t)[ceiling?'top':'bottom'],direction=ceiling?-1:1;
    ctx.fillStyle=ceiling?'#355d76':'#284f6c';polygon(ctx,[[x-48,y+direction*33],[x+10,y],[x+62,y+direction*57],[x+19,y+direction*98]]);ctx.fill();
    ctx.strokeStyle='#b3e6ff55';ctx.lineWidth=1;line(ctx,[[x+10,y],[x+19,y+direction*63],[x+49,y+direction*50]]);
    ctx.fillStyle='#a9dfff33';polygon(ctx,[[x+10,y],[x+17,y+direction*33],[x+37,y+direction*44]]);ctx.fill();
   }
  }else if(stage===3){
   const first=Math.floor(offset/90)*90;ctx.lineWidth=1;
   for(let s=first;s<offset+width+90;s+=90){
    const x=s-offset,y=bounds(stage,x,t)[ceiling?'top':'bottom'],direction=ceiling?-1:1;
    for(let row=0;row<3;row++){
     const yy=y+direction*(12+row*35),xx=x+(row%2)*40;
     ctx.fillStyle=row%2?'#3b5037':'#2b4433';ctx.fillRect(xx,ceiling?yy-28:yy,78,28);
     ctx.strokeStyle='#a2ce7130';ctx.strokeRect(xx+2,ceiling?yy-25:yy+3,74,23);
    }
    ctx.strokeStyle='#c4e89538';line(ctx,[[x+18,y+direction*16],[x+28,y+direction*35],[x+22,y+direction*47]]);
   }
  }else{
   const first=Math.floor(offset/120)*120;
   for(let s=first;s<offset+width+120;s+=120){
    const x=s-offset,y=bounds(stage,x,t)[ceiling?'top':'bottom'],direction=ceiling?-1:1;
    ctx.fillStyle='#473348';ctx.fillRect(x+5,ceiling?y-88:y+9,105,78);
    ctx.strokeStyle='#93618566';ctx.lineWidth=1;ctx.strokeRect(x+8,ceiling?y-85:y+12,99,71);
    ctx.strokeStyle='#ff88ac4d';line(ctx,[[x+13,y+direction*26],[x+35,y+direction*26],[x+43,y+direction*34],[x+97,y+direction*34]]);
    ctx.fillStyle='#e09ca766';ctx.fillRect(x+13,y+direction*13,3,3);ctx.fillRect(x+96,y+direction*13,3,3);
   }
  }
  ctx.restore();ctx.save();surfacePath(ctx,points,ceiling);ctx.clip();ctx.strokeStyle=color;ctx.globalAlpha=stage===2?.72:.42;ctx.lineWidth=2;line(ctx,points);ctx.restore();
 }
 function hazard(ctx,h,t,theme){
  if(!h.active&&!h.warning){
   if(h.kind==='gate'){ctx.save();ctx.strokeStyle='#a2edca33';ctx.lineWidth=1;ctx.setLineDash([3,6]);ctx.strokeRect(h.x,h.y,h.w,h.h);ctx.restore()}
   if(h.kind==='vent'){ctx.fillStyle='#ffba6655';ctx.fillRect(h.x,h.y+h.h-6,h.w,6)}
   return;
  }
  ctx.save();
  if(h.warning){
   ctx.strokeStyle='#ffce79';ctx.fillStyle='#ffbc5221';ctx.lineWidth=2;ctx.globalAlpha=.72+Math.sin(t*3)*.08;
   ctx.fillRect(h.x,h.y,h.w,h.h);ctx.setLineDash([7,5]);ctx.strokeRect(h.x,h.y,h.w,h.h);ctx.setLineDash([]);
   ctx.fillStyle='#ffd78f';ctx.font='bold 16px monospace';ctx.textAlign='center';ctx.fillText('!',h.x+h.w/2,h.y+h.h/2+6);
   ctx.restore();return;
  }
  if(h.kind==='rock'){
   ctx.fillStyle='#6e4a35';ctx.beginPath();ctx.arc(h.x,h.y,h.r,0,Math.PI*2);ctx.fill();
   ctx.strokeStyle='#d9955b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(h.x,h.y,h.r-1,Math.PI,Math.PI*2);ctx.stroke();
   ctx.fillStyle='#ac79504d';polygon(ctx,[[h.x-h.r*.65,h.y],[h.x-h.r*.15,h.y-h.r*.7],[h.x+h.r*.56,h.y-h.r*.18],[h.x+h.r*.12,h.y+h.r*.47]]);ctx.fill();
   ctx.strokeStyle='#322719';ctx.lineWidth=2;line(ctx,[[h.x-6,h.y-13],[h.x+5,h.y+2],[h.x-1,h.y+15]]);
  }else if(h.kind==='vent'){
   const gradient=ctx.createLinearGradient(0,h.y,0,h.y+h.h);
   gradient.addColorStop(0,'#ffbd64');gradient.addColorStop(.5,'#ff8151');gradient.addColorStop(1,'#d74736');ctx.fillStyle=gradient;ctx.fillRect(h.x,h.y,h.w,h.h);
   ctx.fillStyle='#ffe2a477';ctx.fillRect(h.x+11,h.y+7,h.w-22,h.h-7);
   ctx.strokeStyle='#ffe3a6';ctx.lineWidth=2;ctx.strokeRect(h.x+1,h.y+1,h.w-2,h.h-2);
   ctx.strokeStyle='#ffd49255';for(let i=0;i<3;i++){const yy=h.y+cycle(t*36+i*36,h.h);line(ctx,[[h.x+4,yy],[h.x+h.w-4,yy-6]])}
  }else if(h.kind==='pillar'){
   ctx.fillStyle='#41533c';ctx.fillRect(h.x,h.y,h.w,h.h);ctx.fillStyle='#809362';ctx.fillRect(h.x,h.y,h.w,11);ctx.fillRect(h.x,h.y+h.h-11,h.w,11);
   ctx.strokeStyle=theme.color||'#b4ed8c';ctx.lineWidth=1;ctx.strokeRect(h.x+.5,h.y+.5,h.w-1,h.h-1);
   ctx.fillStyle='#263d31';ctx.fillRect(h.x+12,h.y+17,h.w-24,Math.max(0,h.h-34));
   ctx.strokeStyle='#9ebd6855';ctx.lineWidth=1;line(ctx,[[h.x+20,h.y+24],[h.x+20,h.y+h.h-24]]);line(ctx,[[h.x+h.w-19,h.y+24],[h.x+h.w-19,h.y+h.h-24]]);
   ctx.fillStyle='#c2e48b';ctx.fillRect(h.x+h.w/2-3,h.y+h.h/2-9,6,18);
  }else{
   ctx.fillStyle='#663c5e';ctx.fillRect(h.x,h.y,h.w,h.h);ctx.fillStyle='#b46c90';ctx.fillRect(h.x+4,h.y+4,8,h.h-8);ctx.fillRect(h.x+h.w-12,h.y+4,8,h.h-8);
   ctx.strokeStyle='#ff9ebe';ctx.lineWidth=2;ctx.strokeRect(h.x+1,h.y+1,h.w-2,h.h-2);
   ctx.save();ctx.beginPath();ctx.rect(h.x+16,h.y+5,h.w-32,h.h-10);ctx.clip();
   ctx.strokeStyle='#f29abe88';ctx.lineWidth=5;for(let yy=h.y-30;yy<h.y+h.h+40;yy+=27)line(ctx,[[h.x+15,yy],[h.x+h.w-15,yy+25]]);ctx.restore();
   ctx.fillStyle='#ffd0dd';ctx.fillRect(h.x+19,h.y+4,h.w-38,4);ctx.fillRect(h.x+19,h.y+h.h-8,h.w-38,4);
  }
  ctx.restore();
 }
 function draw(ctx,stageIndex,time,theme={}){
  const stage=stageOf(stageIndex),t=timeOf(time);
  surface(ctx,stage,t,theme,true);surface(ctx,stage,t,theme,false);
  for(const h of hazards(stage,t))hazard(ctx,h,t,theme);
 }
 return {width,height,scrollSpeed,durations,bounds,hazards,describe,collides,collider,draw};
});
