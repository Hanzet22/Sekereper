/* Canvas ambience + optional CSS Houdini loader. */
(() => {
'use strict';
const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas=document.getElementById('ambient'),ctx=canvas&&canvas.getContext?canvas.getContext('2d'):null;
if(ctx&&!reduced){
 let width=0,height=0,points=[],frame=null;
 function resize(){const dpr=Math.min(window.devicePixelRatio||1,1.5);width=innerWidth;height=innerHeight;canvas.width=Math.floor(width*dpr);canvas.height=Math.floor(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);points=Array.from({length:Math.min(55,Math.floor(width/24))},()=>({x:Math.random()*width,y:Math.random()*height,r:Math.random()*1.4+.3,v:Math.random()*.16+.025,a:Math.random()*.35+.08}));}
 function draw(){frame=null;if(document.hidden)return;ctx.clearRect(0,0,width,height);for(const p of points){p.y-=p.v;if(p.y< -4){p.y=height+4;p.x=Math.random()*width;}ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle='rgba(145,196,255,'+p.a+')';ctx.fill();}frame=requestAnimationFrame(draw);}
 function start(){if(frame===null&&!document.hidden)frame=requestAnimationFrame(draw);}
 function stop(){if(frame!==null)cancelAnimationFrame(frame);frame=null;}
 resize();addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',()=>document.hidden?stop():start());start();
}
if(typeof CSS!=='undefined'&&'paintWorklet' in CSS&&!reduced){try{CSS.paintWorklet.addModule(new URL('ui/worklets/hanzet-grid.js',document.baseURI).href).catch(()=>{});}catch(_){}}
})();
