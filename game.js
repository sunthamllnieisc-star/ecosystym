"use strict";

const paths={
  logo:'<path d="M5 19c3-6 7-10 14-13-1 7-5 11-11 11m2-3c-4 0-7-3-7-7 4 0 7 2 8 4m-6 8c3 0 5-2 9-6"/>',
  restart:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  ridge:'<path d="m2 19 7-13 4 7 3-4 6 10H2Zm5-9 2 2 2-2"/>',
  grass:'<path d="M4 20h16m-9 0c0-7-2-9-6-12m7 12c0-10 3-13 5-15m-2 15c1-4 3-6 6-7M8 20C7 17 5 15 3 15"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  orbit:'<circle cx="12" cy="12" r="6"/><path d="M4 15c-1 2 0 3 2 3 5 0 13-5 14-8 1-2 0-3-2-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  focus:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/><circle cx="12" cy="12" r="2"/>',
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
const $=selector=>document.querySelector(selector);
document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));

const canvas=$("#world");
let world;
try {
  world=new Planet(canvas);
} catch(error) {
  console.error(error);
  $("#fallback").hidden=false;
  document.querySelectorAll(".camera-tools button,.tools button").forEach(button=>button.disabled=true);
}

const ridgeGoal=.59;
const touchOnly=matchMedia("(hover:none)").matches;
let stage=0, tool="rotate", sculpted=0, grassCover=0, hasStarted=false, shownPercent=-1;
let gesture=null, pinch=null, lastSpot=null;
const touches=new Map();

function setText(selector,text) {
  $(selector).textContent=text;
}

function refreshTip() {
  const zoom=touchOnly?"Pinch to zoom":"Scroll to zoom";
  if(tool==="rotate") setText("#scene-tip","Drag the planet to turn it · "+zoom);
  else if(stage===0&&!hasStarted) setText("#scene-tip","Start inside the ring · "+zoom);
  else {
    const turn=touchOnly?"Choose Rotate to turn":"Shift + drag to turn";
    setText("#scene-tip",`Drag to ${stage===0?"raise":"sow"} · ${turn} · ${zoom}`);
  }
  canvas.style.cursor=tool==="rotate"?"grab":"crosshair";
}

function setTool(mode) {
  if(!world) return;
  tool=mode;
  lastSpot=null;
  world.brush(null,false);
  $("#rotate").setAttribute("aria-pressed",mode==="rotate");
  $("#brush").setAttribute("aria-pressed",mode==="brush");
  if(stage===0&&!hasStarted&&mode==="brush") world.showGuide();
  refreshTip();
}

function setProgress() {
  const fraction=stage===0?sculpted/ridgeGoal:grassCover;
  const percent=Math.floor(clamp(fraction,0,1)*100);
  if(percent===shownPercent)return;
  shownPercent=percent;
  $("#progress").setAttribute("aria-valuenow",percent);
  $("#progress span").style.width=percent+"%";
  setText("#progress-value",percent+"%");
  $("#next").disabled=!world||stage!==0||percent<100;
  if(stage===0&&percent===100) {
    setText("#task-description","Your ridge is ready. Continue to sow so grass can grow over the land you shaped.");
  }
  if(stage===1&&percent>=90&&percent<100) {
    setText("#task-description","Turn the planet to find the last bare patches. Grass will spread into the smallest gaps.");
  }
  if(stage===1&&grassCover===1) complete();
}

function beginSowing() {
  if(!world||stage!==0||sculpted<ridgeGoal)return;
  stage=1;
  world.guide.visible=false;
  world.buildGrass();
  $("#step-earth").removeAttribute("aria-current");
  $("#step-earth").classList.add("complete");
  $("#step-earth [data-icon]").innerHTML=icon("check");
  $("#step-grass").setAttribute("aria-current","step");
  setText("#task-title","Grow a meadow.");
  setText("#task-description","Sweep the Sow brush across the soil. Switch to Rotate to reach the other side of your planet.");
  setText("#progress-name","Grass cover");
  $("#progress").setAttribute("aria-label","Grass cover");
  $("#next").hidden=true;
  setText("#brush-name","Sow");
  $("#brush-icon").innerHTML=icon("grass");
  shownPercent=-1;
  setTool("brush");
  setProgress();
}

function complete() {
  stage=2;
  $("#step-grass").removeAttribute("aria-current");
  $("#step-grass").classList.add("complete");
  $("#step-grass [data-icon]").innerHTML=icon("check");
  setText("#task-title","A living planet.");
  setText("#task-description","Your grass now wraps all the way around. Turn your planet or zoom in to see the grass move in the breeze.");
  $("#brush").hidden=true;
  setTool("rotate");
}

function stroke(point) {
  if(!point || stage===2){lastSpot=null;return;}
  if(stage===0&&!hasStarted){
    if(angleBetween(point,GUIDE)>.16)return;
    hasStarted=true;
    setText("#task-description","Keep dragging to build a ridge along the surface.");
    refreshTip();
  }
  let distance=lastSpot?angleBetween(lastSpot,point):0;
  if(distance>1.5){lastSpot=null;distance=0;}
  if(lastSpot&&distance<.014)return;
  const steps=lastSpot?Math.max(1,Math.ceil(distance/(stage===0?.022:.063))):1;
  for(let i=1;i<=steps;i++){
    const dot=lastSpot?lastSpot.clone().lerp(point,i/steps).normalize():point;
    if(stage===0)world.sculpt(dot,lastSpot?.22:.16);
    else grassCover=world.sow(dot);
  }
  if(stage===0){
    sculpted+=distance;
    world.rebuildSurface();
    if(sculpted>.075) world.guide.visible=false;
    else if(world.guide.visible) world.placeRing(world.guide,GUIDE);
  }
  lastSpot=point;
  setProgress();
}

function touchPair() {
  const [a,b]=[...touches.values()];
  return {x:(a.x+b.x)*.5,y:(a.y+b.y)*.5,length:Math.hypot(a.x-b.x,a.y-b.y)};
}

canvas.addEventListener("contextmenu",event=>event.preventDefault());
canvas.addEventListener("pointerdown",event=>{
  if(!world)return;
  const x=event.clientX,y=event.clientY;
  touches.set(event.pointerId,{x,y});
  canvas.setPointerCapture(event.pointerId);
  lastSpot=null;
  if(touches.size>1){
    gesture=null;
    pinch=touchPair();
    world.brush(null,false);
    return;
  }
  const wantsTurn=tool==="rotate"||event.shiftKey||event.button!==0;
  const point=wantsTurn?null:world.pick(x,y);
  const turn=wantsTurn||!point;
  const pendingTouch=!turn&&event.pointerType==="touch";
  gesture={x,y,turn,pendingTouch};
  if(turn){
    canvas.style.cursor="grabbing";
    world.brush(null,false);
  }else if(!pendingTouch){
    stroke(point);
    if(stage<2&&tool==="brush")world.brush(point,stage===1);
  }
});

canvas.addEventListener("pointermove",event=>{
  if(!world)return;
  const x=event.clientX,y=event.clientY;
  if(touches.has(event.pointerId))touches.set(event.pointerId,{x,y});
  if(touches.size>1){
    const pair=touchPair();
    if(pinch&&pair.length>0&&pinch.length>0){
      world.dragTurn(pinch.x,pinch.y,pair.x,pair.y);
      world.zoom(pair.length/pinch.length);
    }
    pinch=pair;
    return;
  }
  if(gesture?.turn){
    world.dragTurn(gesture.x,gesture.y,x,y);
    gesture.x=x;gesture.y=y;
    return;
  }
  if(stage===2||tool!=="brush") return;
  if(gesture?.pendingTouch){
    if(Math.hypot(x-gesture.x,y-gesture.y)<5)return;
    stroke(world.pick(gesture.x,gesture.y));
    gesture.pendingTouch=false;
  }
  const point=world.pick(x,y);
  if(gesture)stroke(point);
  if(stage<2&&tool==="brush")world.brush(point,stage===1);
});

function endPointer(event) {
  if(!world)return;
  if(gesture?.pendingTouch&&event.type==="pointerup"){
    stroke(world.pick(event.clientX,event.clientY));
  }
  touches.delete(event.pointerId);
  gesture=null;pinch=null;lastSpot=null;
  if(event.pointerType!=="mouse")world.brush(null,false);
  refreshTip();
}

canvas.addEventListener("pointerup",endPointer);
canvas.addEventListener("pointercancel",endPointer);
canvas.addEventListener("lostpointercapture",event=>{
  if(touches.has(event.pointerId))endPointer(event);
});
canvas.addEventListener("pointerleave",()=>{if(world&&!touches.size)world.brush(null,false);});
canvas.addEventListener("wheel",event=>{
  if(!world)return;
  event.preventDefault();
  world.zoom(Math.exp(-clamp(event.deltaY,-170,170)*.00165));
},{passive:false});
canvas.addEventListener("keydown",event=>{
  if(!world)return;
  const move={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(move){
    event.preventDefault();
    world.turnKey(...move);
    if(tool==="brush"){
      const normal=FRONT.clone().applyQuaternion(world.planet.quaternion.clone().invert());
      world.brush(normal,stage===1);
    }
  }else if(event.key==="Enter"||event.key===" "){
    if(tool!=="brush"||stage===2)return;
    event.preventDefault();
    const point=stage===0&&!hasStarted?GUIDE:FRONT.clone().applyQuaternion(world.planet.quaternion.clone().invert());
    stroke(point);
    if(stage<2)world.brush(point,stage===1);
  }else if(event.key==="+"||event.key==="="){
    event.preventDefault();world.zoom(1.25);
  }else if(event.key==="-"){
    event.preventDefault();world.zoom(.8);
  }
});

$("#rotate").addEventListener("click",()=>setTool("rotate"));
$("#brush").addEventListener("click",()=>setTool("brush"));
$("#zoom-in").addEventListener("click",()=>world?.zoom(1.25));
$("#zoom-out").addEventListener("click",()=>world?.zoom(.8));
$("#home").addEventListener("click",()=>{world?.resetView();lastSpot=null;});
$("#next").addEventListener("click",beginSowing);
$("#restart").addEventListener("click",()=>$("#restart-dialog").showModal());
$("#keep").addEventListener("click",()=>$("#restart-dialog").close());
$("#confirm").addEventListener("click",()=>{
  $("#restart-dialog").close();
  if(!world)return;
  stage=0;sculpted=0;grassCover=0;hasStarted=false;shownPercent=-1;
  gesture=null;pinch=null;touches.clear();
  world.reset();
  $("#step-earth").setAttribute("aria-current","step");
  $("#step-grass").removeAttribute("aria-current");
  $("#step-earth").classList.remove("complete");
  $("#step-grass").classList.remove("complete");
  $("#step-earth [data-icon]").innerHTML=icon("ridge");
  $("#step-grass [data-icon]").innerHTML=icon("grass");
  setText("#task-title","Shape a little world.");
  setText("#task-description","Turn the planet to look around. Then choose Raise and drag from the ring to lift a ridge.");
  setText("#progress-name","Ridge progress");
  $("#progress").setAttribute("aria-label","Ridge progress");
  setText("#brush-name","Raise");
  $("#brush-icon").innerHTML=icon("ridge");
  $("#brush").hidden=false;
  $("#next").hidden=false;
  setTool("rotate");
  setProgress();
});
setProgress();
refreshTip();
