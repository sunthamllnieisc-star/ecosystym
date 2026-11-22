"use strict";

const paths={
  logo:'<path d="M5 19c3-6 7-10 14-13-1 7-5 11-11 11m2-3c-4 0-7-3-7-7 4 0 7 2 8 4m-6 8c3 0 5-2 9-6"/>',
  restart:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  grass:'<path d="M4 20h16m-9 0c0-7-2-9-6-12m7 12c0-10 3-13 5-15m-2 15c1-4 3-6 6-7M8 20C7 17 5 15 3 15"/>',
  sprout:'<path d="M5 20h14m-7 0v-8m0 3c-5 0-8-3-8-8 5 0 8 3 8 8Zm0-3c0-5 3-8 8-8 0 5-3 8-8 8Z"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  graze:'<path d="M4 17h16M5 13l4-3 4 3 6-5M7 19v2m5-2v2m5-2v2"/>',
  shears:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 8l12 12M8 16l12-12"/>',
  orbit:'<circle cx="12" cy="12" r="6"/><path d="M4 15c-1 2 0 3 2 3 5 0 13-5 14-8 1-2 0-3-2-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  focus:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/><circle cx="12" cy="12" r="2"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
};
const icon=name=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>';
const $=selector=>document.querySelector(selector);
document.querySelectorAll("[data-icon]").forEach(el=>el.innerHTML=icon(el.dataset.icon));

const canvas=$("#world");
const workspace=$(".workspace");
const rewardDialog=$("#reward-dialog");
const tray=$("#sapling-tray");
const saplingSlots=[...tray.querySelectorAll(".sapling-slot")];
const dragImage=$("#drag-sapling");
const yearRange=$("#year-range");
const nextStep=$("#next-step");
const fieldButtons=[yearRange,$("#play-time"),$("#soil-view"),$("#graze"),$("#manage"),$("#recall-herd")];
const fieldTabs=[...document.querySelectorAll(".field-tab")];
const guideSteps=[
  {id:"plant",panel:"shrubs",title:"Plant your saplings.",text:"Drag the three sea buckthorn saplings from Shrubs onto the planet.",button:"Open Shrubs"},
  {id:"enrich",panel:"time",title:"Look beneath the shrubs.",text:"Root microbes and fallen leaves enrich the soil around sea buckthorn. Open Soil view to see where.",button:"Show enriched soil"},
  {id:"time",panel:"time",title:"Watch the berries ripen.",text:"See the branches expand and the fruit turn orange as time passes.",button:"Show ripening"},
  {id:"grazing",panel:"grazing",title:"Release the grazing herd.",text:"Choose an open patch. The cattle and sheep will roam farther and shorten the grass where they eat.",button:"Choose a pasture"},
  {id:"management",panel:"management",title:"Let more light in.",text:"Choose a mature shrub to prune, then compare the grass under its canopy.",button:"Find a shrub to prune"},
  {id:"desert",panel:"time",title:"Follow the dry spell.",text:"Move towards Year 100 and watch grass thin into cracked soil. The Dry ground reading tracks the exposed area.",button:"Show Year 100"},
];
let world, meadow;
try {
  world=new Planet(canvas);
  meadow=new MeadowSimulation(world);
} catch(error) {
  console.error(error);
  $("#fallback").hidden=false;
  document.querySelectorAll(".camera-tools button,.tools button").forEach(button=>button.disabled=true);
}

const initialTitle=$("#task-title").textContent;
const initialDescription=$("#task-description").textContent;
const touchOnly=matchMedia("(hover:none)").matches;
const saplingReward=saplingSlots.length, plantAngle=.093;
let tool="rotate", grassCover=0, shownPercent=-1;
let saplingsLeft=0, plantModel=null, plantLoadError=false, plantLoad=null;
let selectedSlot=null, trayDrag=null, skipSlotClick=null, meadowRun=0;
let gesture=null, pinch=null, lastSpot=null;
let guideStep=null;
const touches=new Map();

if(meadow){
  meadow.motion.onChange=()=>{
    syncFieldButtons();
    refreshTip();
  };
  meadow.onTime=updateTimePanel;
  meadow.onGraze=message=>{
    fieldFeedback(message);
    markFieldTask("grazing");
  };
}

function setText(selector,text) {
  const element=$(selector);
  if(element.textContent!==text)element.textContent=text;
}

function refreshTip() {
  const zoom=touchOnly?"Pinch to zoom":"Scroll to zoom";
  const select=touchOnly?"Tap":"Click";
  if(meadow?.motion.activity){
    setText("#scene-tip",meadow.motion.activity.label+"…");
    return;
  }
  if(trayDrag?.active){
    setText("#scene-tip",trayDrag.point?"Release to plant":"Drag onto the planet to plant");
    return;
  }
  if(tool==="plant"){
    setText("#scene-tip",plantModel?`${select} to plant · Drag to turn · ${zoom}`:"Loading sea buckthorn…");
  }else if(tool==="graze"){
    setText("#scene-tip",`${select} the planet to place the herd · Drag to turn`);
  }else if(tool==="manage"){
    setText("#scene-tip",`${select} an established shrub to prune · Drag to turn`);
  }else if(plantLoadError&&saplingsLeft) setText("#scene-tip","Sea buckthorn could not load. Try picking up a sapling again.");
  else if(tool==="rotate") setText("#scene-tip",world?.soilView?"Teal patches show enriched soil · Drag to turn":"Drag the planet to turn it · "+zoom);
  else {
    const turn=touchOnly?"Choose Rotate to turn":"Shift + drag to turn";
    setText("#scene-tip",`Drag to sow · ${turn} · ${zoom}`);
  }
  canvas.style.cursor=tool==="rotate"?"grab":"crosshair";
}

function setTool(mode) {
  if(!world) return;
  if(mode==="brush")world.buildGrass();
  tool=mode;
  if(mode!=="plant")selectedSlot=null;
  lastSpot=null;
  world.brush(null);
  $("#rotate").setAttribute("aria-pressed",mode==="rotate");
  $("#brush").setAttribute("aria-pressed",mode==="brush");
  $("#graze").setAttribute("aria-pressed",mode==="graze");
  $("#manage").setAttribute("aria-pressed",mode==="manage");
  saplingSlots.forEach(slot=>slot.setAttribute("aria-pressed",slot===selectedSlot));
  refreshTip();
}

function setProgress() {
  const percent=Math.floor(grassCover*100);
  if(percent===shownPercent)return;
  shownPercent=percent;
  $("#progress").setAttribute("aria-valuenow",percent);
  $("#progress span").style.width=percent+"%";
  setText("#progress-value",percent+"%");
  if(percent>=90&&percent<100) {
    setText("#task-description","Turn the planet to find the last bare patches. Grass will spread into the smallest gaps.");
  }
  if(grassCover===1)complete();
}

function complete() {
  setText("#progress-caption","Meadow sown");
  workspace.dataset.phase="plant";
  openFieldPanel("shrubs");
  saplingsLeft=saplingReward;
  $("#brush").hidden=true;
  $("#shrub-lock").hidden=true;
  $("#field-tasks").hidden=false;
  tray.hidden=false;
  updateSaplingCount();
  updateGuide();
  setTool("rotate");
  gesture=null;
  requestAnimationFrame(()=>{
    if(grassCover===1){
      rewardDialog.returnValue="";
      rewardDialog.showModal();
    }
  });
  prepareSaplings();
}

function updateSaplingCount() {
  setText("#sapling-count",saplingsLeft?`${saplingsLeft} left`:`${saplingReward} planted`);
  setText("#plant-progress",`${saplingReward-saplingsLeft} / ${saplingReward}`);
  $("#tray-tip").hidden=saplingsLeft===0;
}

function prepareSaplings() {
  if(!plantLoad){
    plantLoadError=false;
    plantLoad=loadSeaBuckthorn().then(model=>{
      plantModel=model;
      if(trayDrag?.active)updateTrayDrag(trayDrag.x,trayDrag.y);
      else refreshTip();
    },error=>{
      console.error(error);
      plantLoad=null;
      plantLoadError=true;
      if(tool==="plant")setTool("rotate");
      else refreshTip();
    });
  }
  return plantLoad;
}

function chooseSapling(slot) {
  if(slot.disabled)return;
  if(selectedSlot===slot){
    setTool("rotate");
    return;
  }
  selectedSlot=slot;
  prepareSaplings();
  setTool("plant");
  canvas.focus({preventScroll:true});
}

async function plant(point,slot=selectedSlot) {
  if(!point||!slot||slot.disabled)return;
  const run=meadowRun;
  await prepareSaplings();
  if(run!==meadowRun||!plantModel||slot.disabled)return;
  world.plantSapling(plantModel,point);
  slot.disabled=true;
  saplingsLeft--;
  updateSaplingCount();
  if(selectedSlot===slot)setTool("rotate");
  if(!saplingsLeft){
    workspace.dataset.phase="observe";
    syncFieldButtons();
    markFieldTask("plant");
  }
}

function markFieldTask(name) {
  const item=$("#task-"+name);
  if(!item.hasAttribute("data-done")){
    item.dataset.done="";
    updateGuide();
  }
}

function updateGuide() {
  const sowing=workspace.dataset.phase==="sow";
  guideStep=sowing?null:guideSteps.find(({id})=>!$("#task-"+id).hasAttribute("data-done"));
  for(const {id} of guideSteps){
    const row=$("#task-"+id);
    if(guideStep?.id===id)row.setAttribute("aria-current","step");
    else row.removeAttribute("aria-current");
  }
  fieldTabs.forEach(tab=>tab.toggleAttribute("data-next",tab.dataset.panel===guideStep?.panel));
  nextStep.hidden=!sowing&&!guideStep;
  if(sowing){
    setText("#task-title",initialTitle);
    setText("#task-description",initialDescription);
    setText("#next-step-label","Select Sow");
  }else{
    setText("#task-title",guideStep?.title??"Field tasks complete.");
    setText("#task-description",guideStep?.text??"Keep experimenting with the meadow.");
    if(guideStep)setText("#next-step-label",guideStep.button);
  }
}

function focusCanvas() {
  canvas.scrollIntoView({block:"nearest"});
  canvas.focus({preventScroll:true});
}

function setSoilView(active) {
  world.soilView=active;
  $("#soil-view").setAttribute("aria-pressed",active);
  $("#soil-notes").hidden=!active;
  $("#soil-legend").hidden=!active;
  updateTimePanel();
  refreshTip();
}

function followGuide() {
  if(!world)return;
  if(!guideStep){setTool("brush");focusCanvas();return;}
  const {id,panel}=guideStep;
  openFieldPanel(panel);
  if(id==="plant"){
    saplingSlots.find(button=>!button.disabled)?.focus();
    return;
  }
  setSoilView(id==="enrich");
  const shrub=world.saplings.children.find(item=>item.visible);
  if(shrub&&(id==="enrich"||id==="time"||id==="management")){
    world.showDirection(shrub.userData.direction,id==="management"?FRONT:undefined);
  }
  if(id==="enrich")meadow.previewYear(3.1);
  if(id==="time")meadow.previewYear(4.5);
  if(id==="grazing")setTool("graze");
  if(id==="management")setTool("manage");
  if(id==="desert")meadow.previewYear(LAST_YEAR);
  focusCanvas();
}

function fieldFeedback(message) {
  $("#field-feedback").hidden=false;
  setText("#field-feedback",message);
}

function syncFieldButtons() {
  const isMoving=!!meadow?.motion.activity;
  if(isMoving)world.brush(null);
  workspace.toggleAttribute("data-running",isMoving);
  nextStep.disabled=!world||isMoving;
  fieldButtons.forEach(button=>button.disabled=workspace.dataset.phase!=="observe"||isMoving);
}

function updateTimePanel() {
  const {year,playing}=meadow;
  if(playing||Math.abs(Number(yearRange.value)-year)>.001)yearRange.value=year;
  yearRange.style.setProperty("--timeline-fill",`${year/LAST_YEAR*100}%`);
  setText("#year-value",`Year ${year.toFixed(1)}`);
  setText("#play-time",playing?"Pause timeline":year===LAST_YEAR?"Replay timeline":"Play timeline");
  const age=Math.max(0,...world.saplings.children.filter(shrub=>shrub.visible).map(shrub=>shrub.userData.age));
  let stage=age>=3.8?"Ripe orange fruit":age>=2.2?"Fruit forming":age>=.35?"Branches and leaves growing":"Young saplings";
  if(year>=28)stage=meadow.dryCover>=12?"Desertification spreading":meadow.dryCover>0?"Dry soil becoming exposed":"Long dry spell";
  setText("#dry-cover",`${meadow.dryCover}%`);
  setText("#enriched-cover",`${meadow.enrichedCover}% enriched`);
  setText("#growth-stage",stage);
  if(world.soilView&&meadow.enrichedCover>0&&!meadow.preview)markFieldTask("enrich");
  if(age>=3.8&&!$("#task-time").hasAttribute("data-done"))markFieldTask("time");
  if(meadow.dryCover>=12&&!$("#task-desert").hasAttribute("data-done"))markFieldTask("desert");
}

function updateHerdPanel() {
  const active=meadow.pasture.animals.length>0;
  setText("#graze",active?"Move herd":"Release herd");
  setText("#herd-count",active?"2 cattle and 3 sheep on the planet":"2 cattle and 3 sheep");
  $("#recall-herd").hidden=!active;
}

function openFieldPanel(name) {
  for(const tab of fieldTabs){
    const current=tab.dataset.panel===name;
    tab.setAttribute("aria-pressed",current);
    $("#"+tab.getAttribute("aria-controls")).hidden=!current;
  }
  if(name!=="time"&&world?.soilView)setSoilView(false);
  if(tool!=="brush")setTool("rotate");
}

function chooseFieldTool(mode) {
  if(world.soilView)setSoilView(false);
  setTool(tool===mode?"rotate":mode);
  if(tool!=="rotate")focusCanvas();
}

function fieldAction(point,shrub) {
  if(meadow.motion.activity)return;
  if(tool==="graze"&&point){
    meadow.releaseHerd(point,plantModel);
    updateHerdPanel();
    setTool("rotate");
    fieldFeedback("The cattle and sheep are looking for grass.");
  }else if(tool==="manage"){
    const target=shrub??meadow.shrubNear(point);
    if(meadow.prune(target)){
      fieldFeedback("Shrub pruned. More light reaches the grass underneath.");
      markFieldTask("management");
    }else{
      fieldFeedback(target?"This sapling is still young. Move the time slider forward before pruning.":"Choose a shrub to prune.");
    }
  }
}

function showToolRing(point) {
  if(meadow.motion.activity)return;
  if(tool==="plant"&&plantModel)world.brush(point,plantAngle);
  if(tool==="graze")world.brush(point,GRAZE_ANGLE,.27);
  if(tool==="manage")world.brush(meadow.shrubNear(point)?.userData.direction??null,.19,.25);
}

function dropPoint(x,y) {
  return document.elementFromPoint(x,y)===canvas?world.pick(x,y):null;
}

function updateTrayDrag(x,y) {
  const point=dropPoint(x,y);
  Object.assign(trayDrag,{x,y,point});
  dragImage.style.transform=`translate3d(${x}px,${y}px,0)`;
  dragImage.hidden=!!(point&&plantModel);
  world.previewSapling(plantModel,point);
  world.brush(point,plantAngle);
  refreshTip();
}

function endTrayDrag(event) {
  if(!trayDrag||(event&&event.pointerId!==trayDrag.pointerId))return;
  const {active,slot,pointerId}=trayDrag;
  trayDrag=null;
  if(slot.hasPointerCapture(pointerId))slot.releasePointerCapture(pointerId);
  if(!active)return;
  skipSlotClick=slot;
  slot.classList.remove("is-dragged");
  dragImage.hidden=true;
  world.previewSapling(null,null);
  world.brush(null);
  refreshTip();
  if(event?.type==="pointerup")plant(dropPoint(event.clientX,event.clientY),slot);
}

tray.addEventListener("pointerdown",event=>{
  const slot=event.target.closest(".sapling-slot");
  if(!world||!slot||slot.disabled||event.button!==0||trayDrag||touches.size)return;
  skipSlotClick=null;
  const {pointerId,clientX:x,clientY:y}=event;
  trayDrag={slot,pointerId,x,y,active:false};
  slot.setPointerCapture(pointerId);
});

tray.addEventListener("pointermove",event=>{
  if(trayDrag?.pointerId!==event.pointerId)return;
  const {clientX:x,clientY:y}=event;
  if(!trayDrag.active){
    if(Math.hypot(x-trayDrag.x,y-trayDrag.y)<6)return;
    setTool("rotate");
    trayDrag.active=true;
    trayDrag.slot.classList.add("is-dragged");
    prepareSaplings();
  }
  updateTrayDrag(x,y);
});

for(const type of ["pointerup","pointercancel","lostpointercapture"])tray.addEventListener(type,endTrayDrag);
tray.addEventListener("click",event=>{
  const slot=event.target.closest(".sapling-slot");
  if(slot&&(event.detail===0||slot!==skipSlotClick))chooseSapling(slot);
  skipSlotClick=null;
});
window.addEventListener("blur",()=>endTrayDrag());
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"&&trayDrag){
    event.preventDefault();
    endTrayDrag();
  }
});

function stroke(point) {
  if(!point||grassCover===1){lastSpot=null;return;}
  let distance=lastSpot?angleBetween(lastSpot,point):0;
  if(distance>1.5){lastSpot=null;distance=0;}
  if(lastSpot&&distance<.014)return;
  const steps=lastSpot?Math.max(1,Math.ceil(distance/.063)):1;
  for(let i=1;i<=steps;i++){
    const dot=lastSpot?lastSpot.clone().lerp(point,i/steps).normalize():point;
    grassCover=world.sow(dot);
    if(grassCover===1)break;
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
  if(!world||trayDrag)return;
  const x=event.clientX,y=event.clientY;
  touches.set(event.pointerId,{x,y});
  canvas.setPointerCapture(event.pointerId);
  lastSpot=null;
  if(touches.size>1){
    gesture=null;
    pinch=touchPair();
    world.brush(null);
    return;
  }
  const wantsTurn=tool==="rotate"||event.shiftKey||event.button!==0;
  const point=wantsTurn?null:world.pick(x,y);
  const shrub=!wantsTurn&&!point&&tool==="manage"?world.pickShrub(x,y):null;
  const turn=wantsTurn||(!point&&!shrub);
  const pendingTouch=!turn&&tool==="brush"&&event.pointerType==="touch";
  const pendingAction=!turn&&tool!=="brush";
  gesture={x,y,turn,pendingTouch,pendingAction};
  if(turn){
    canvas.style.cursor="grabbing";
    world.brush(null);
  }else if(tool==="brush"&&!pendingTouch){
    stroke(point);
    if(tool==="brush")world.brush(point);
  }else if(pendingAction){
    showToolRing(point);
  }
});

canvas.addEventListener("pointermove",event=>{
  if(!world||trayDrag?.active)return;
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
  if(gesture?.pendingAction&&Math.hypot(x-gesture.x,y-gesture.y)>=6){
    gesture.pendingAction=false;
    gesture.turn=true;
    canvas.style.cursor="grabbing";
    world.brush(null);
  }
  if(gesture?.turn){
    world.dragTurn(gesture.x,gesture.y,x,y);
    gesture.x=x;gesture.y=y;
    return;
  }
  if(tool==="rotate")return;
  if(tool!=="brush"){
    showToolRing(world.pick(x,y));
    return;
  }
  if(gesture?.pendingTouch){
    if(Math.hypot(x-gesture.x,y-gesture.y)<5)return;
    stroke(world.pick(gesture.x,gesture.y));
    gesture.pendingTouch=false;
  }
  const point=world.pick(x,y);
  if(gesture)stroke(point);
  if(tool==="brush")world.brush(point);
});

function endPointer(event) {
  if(!world)return;
  if(event.type==="pointerup"){
    if(tool==="brush"&&gesture?.pendingTouch)stroke(world.pick(event.clientX,event.clientY));
    if(gesture?.pendingAction){
      const {clientX:x,clientY:y}=event;
      const point=world.pick(x,y);
      if(tool==="plant")plant(point);
      else fieldAction(point,tool==="manage"?world.pickShrub(x,y):null);
    }
  }
  touches.delete(event.pointerId);
  gesture=null;pinch=null;lastSpot=null;
  if(event.pointerType!=="mouse")world.brush(null);
  refreshTip();
}

canvas.addEventListener("pointerup",endPointer);
canvas.addEventListener("pointercancel",endPointer);
canvas.addEventListener("lostpointercapture",event=>{
  if(touches.has(event.pointerId))endPointer(event);
});
canvas.addEventListener("pointerleave",()=>{if(world&&!touches.size&&!trayDrag?.active)world.brush(null);});
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
    if(tool!=="rotate"){
      const normal=FRONT.clone().applyQuaternion(world.planet.quaternion.clone().invert());
      if(tool==="brush")world.brush(normal);
      else showToolRing(normal);
    }
  }else if(event.key==="Enter"||event.key===" "){
    if(tool==="rotate")return;
    event.preventDefault();
    const point=FRONT.clone().applyQuaternion(world.planet.quaternion.clone().invert());
    if(tool==="plant"){
      if(!event.repeat)plant(point);
      if(tool==="plant"&&plantModel)world.brush(point,plantAngle);
    }else if(tool==="brush"){
      stroke(point);
      if(tool==="brush")world.brush(point);
    }else if(!event.repeat)fieldAction(point);
  }else if(event.key==="+"||event.key==="="){
    event.preventDefault();world.zoom(1.25);
  }else if(event.key==="-"){
    event.preventDefault();world.zoom(.8);
  }
});

$("#rotate").addEventListener("click",()=>setTool("rotate"));
$("#brush").addEventListener("click",()=>setTool("brush"));
nextStep.addEventListener("click",followGuide);
$("#soil-view").addEventListener("click",()=>setSoilView(!world.soilView));
for(const tab of fieldTabs)tab.addEventListener("click",()=>openFieldPanel(tab.dataset.panel));
yearRange.addEventListener("input",()=>meadow.scrub(Number(yearRange.value)));
$("#play-time").addEventListener("click",()=>meadow.togglePlayback());
$("#graze").addEventListener("click",()=>chooseFieldTool("graze"));
$("#recall-herd").addEventListener("click",()=>{
  meadow.pasture.clear();
  updateHerdPanel();
  setTool("rotate");
  $("#graze").focus();
  fieldFeedback("Herd recalled. Short grass can regrow, though heavily used patches dry out over time.");
});
$("#manage").addEventListener("click",()=>chooseFieldTool("manage"));
rewardDialog.addEventListener("close",()=>{
  if(rewardDialog.returnValue==="plant"){
    saplingSlots[0].focus({preventScroll:true});
  }else{
    $("#rotate").focus();
  }
});
$("#zoom-in").addEventListener("click",()=>world?.zoom(1.25));
$("#zoom-out").addEventListener("click",()=>world?.zoom(.8));
$("#home").addEventListener("click",()=>{world?.resetView();lastSpot=null;});
$("#restart").addEventListener("click",()=>{
  endTrayDrag();
  $("#restart-dialog").showModal();
});
$("#keep").addEventListener("click",()=>$("#restart-dialog").close());
$("#confirm").addEventListener("click",()=>{
  $("#restart-dialog").close();
  if(!world)return;
  grassCover=0;shownPercent=-1;
  saplingsLeft=0;plantLoadError=false;
  meadowRun++;
  saplingSlots.forEach(slot=>slot.disabled=false);
  gesture=null;pinch=null;touches.clear();
  world.reset();
  meadow.reset();
  workspace.dataset.phase="sow";
  openFieldPanel("shrubs");
  syncFieldButtons();
  $("#field-tasks").querySelectorAll("li").forEach(item=>delete item.dataset.done);
  $("#field-tasks").hidden=true;
  $("#field-feedback").hidden=true;
  setText("#field-feedback","");
  setSoilView(false);
  updateHerdPanel();
  setText("#progress-caption","Grass cover");
  $("#shrub-lock").hidden=false;
  updateGuide();
  $("#brush").hidden=false;
  tray.hidden=true;
  setTool("rotate");
  setProgress();
});
setProgress();
updateGuide();
syncFieldButtons();
refreshTip();
