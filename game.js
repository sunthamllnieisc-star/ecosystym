"use strict";

const icons={
  wind:'<path d="M3 9h10c4 0 4-6 .5-6-1.5 0-2.5 1-2.5 2M2 13h16c4 0 4-6 .5-6M4 17h8c3.5 0 3.5 5 .5 5"/>',
  logo:'<path d="M5 19c3-6 7-10 14-13-1 7-5 11-11 11m2-3c-4 0-7-3-7-7 4 0 7 2 8 4m-6 8c3 0 5-2 9-6"/>',
  restart:'<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  shears:'<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><path d="M8 8l12 12M8 16l12-12"/>',
  orbit:'<circle cx="12" cy="12" r="6"/><path d="M4 15c-1 2 0 3 2 3 5 0 13-5 14-8 1-2 0-3-2-3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  focus:'<path d="M4 9V4h5m6 0h5v5M4 15v5h5m6 0h5v-5"/><circle cx="12" cy="12" r="2"/>',
  expand:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
  guide:'<path d="M12 6c-3-2-6-2-9-1v13c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v13"/>',
  layers:'<path d="m3 8 9-5 9 5-9 5-9-5Zm0 4 9 5 9-5M3 16l9 5 9-5"/>',
  seed:'<path d="M7 18c-3-5 1-10 9-12 2 6-2 12-9 12Zm0 0 6-7"/>',
  water:'<path d="M5 14a4 4 0 0 1 1-7.9A5.5 5.5 0 0 1 16.4 6a4 4 0 1 1 1 8ZM8 17l-1 2m6-2-1 3m6-3-1 2"/>',
  spade:'<path d="m7 17 9-10m-8 6-4 4c0 2 1 3 3 3l4-4ZM14 5l3-3 4 4-3 3Z"/>',
  burn:'<path d="M13 2c2 5-2 6 1 9 2-1 2-3 3-4 2 3 4 5 3 9a8 8 0 0 1-16-1c0-4 3-7 5-9 0 3 0 4 2 5 2-3 3-5 2-9Z"/><path d="M9 19c-1-2 1-4 3-6 0 3 4 4 3 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
};
const $=selector=>document.querySelector(selector);
function iconMarkup(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icons[name]+'</svg>';}
for(const element of document.querySelectorAll("[data-icon]")){
  const path=icons[element.dataset.icon];
  element.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
}

const canvas=$("#world"),hotbar=$("#hotbar"),cursor=$("#placement-cursor"),yearRange=$("#year-range");
const skyCloud=$("#sky-cloud");
skyCloud.querySelector("img").src=cloudArt;
const fieldCanvasLabel=canvas.getAttribute("aria-label");
const touchOnly=matchMedia("(hover:none)").matches;
const catalog={
  seed:{name:"Grass seed",label:"Grass",image:"grass-token",color:"#e1edc8"},
  buckthorn:{name:"Sea buckthorn",label:"Buckthorn",image:"sapling-token",color:"#e5edc9"},
  water:{name:"Rain cloud",label:"Rain cloud",icon:"water",color:"#d5eae5"},
  burn:{name:"Landscape burn",label:"Burn",icon:"burn",color:"#f6d7bd"},
  spade:{name:"Spade",label:"Uproot",icon:"spade",color:"#e7dcca"},
  herd:{name:"Grazing herd",label:"Herd",image:"herd-token",color:"#f2e4cb"},
  cow:{name:"Cow",image:"cow-token"},
  sheep:{name:"Sheep",image:"sheep-token"},
};
const items=["seed","herd","buckthorn","water","spade","burn"];
const inventory={buckthorn:3};
const penCapacity={cow:2,sheep:3};
const buttons=new Map();
for(const [index,id] of items.entries()){
  const {name,label,image,color}=catalog[id];
  const button=document.createElement("button");
  button.className="slot";
  button.dataset.item=id;
  button.type="button";
  button.setAttribute("aria-pressed","false");
  button.setAttribute("aria-keyshortcuts",String(index+1));
  button.style.setProperty("--slot-color",color);
  button.title=name;
  const thumbnail=id==="water"?'<img src="'+cloudArt+'" alt="" draggable="false">':image?'<img src="assets/'+image+'.webp" alt="" draggable="false">':iconMarkup(catalog[id].icon);
  button.innerHTML='<kbd aria-hidden="true">'+(index+1)+'</kbd>'+thumbnail+'<span class="slot-label">'+label+'</span>';
  if(id in inventory){
    const quantity=document.createElement("span");
    quantity.className="slot-count";
    quantity.setAttribute("aria-hidden","true");
    button.append(quantity);
  }
  hotbar.append(button);
  buttons.set(id,button);
}

let world,meadow,buckthornModel;
try{
  world=new Planet(canvas);
  meadow=new MeadowSimulation(world);
}catch(error){
  console.error(error);
  world=null;
  $("#fallback").hidden=false;
}

let selected=null,grassCover=0,revision=0;
let gesture=null,drag=null,pinch=null,lastSpot=null,lastPointer=null,suppressClick=null;
let toastTimer=null,sliding=false;
const studyPrompt=$("#study-prompt"),pen=$("#animal-pen");
const nextStep=$("#next-step"),guideProgress=$("#guide-progress");
const touches=new Map();

function textAt(selector,value){
  const element=$(selector);
  if(element.textContent!==value)element.textContent=value;
}

function notice(message){
  clearTimeout(toastTimer);
  textAt("#field-feedback",message);
  $("#field-feedback").hidden=false;
  toastTimer=setTimeout(()=>$("#field-feedback").hidden=true,3900);
}

function syncButtons(){
  for(const [id,button] of buttons){
    const count=inventory[id];
    button.disabled=!world||count===0||!toolAvailable(id);
    button.setAttribute("aria-label",count===undefined?catalog[id].name:catalog[id].name+", "+count+" available");
    button.setAttribute("aria-pressed",id===selected);
    if(count!==undefined)button.querySelector(".slot-count").textContent=count;
  }
  const pruning=!!meadow?.motion.activity;
  for(const id of ["year-range","play-time","next-step","manage"])$("#"+id).disabled=!world||pruning;
  $("#soil-view").disabled=!world;
  $("#orbit").setAttribute("aria-pressed",selected===null);
  $("#manage").setAttribute("aria-pressed",selected==="prune");
  $("#recall-herd").hidden=!meadow?.pasture.animals.length||!meadow.pasture.layer.visible||!!stage()&&stage()!=="graze";
  for(const button of pen.querySelectorAll("[data-animal]")){
    const left=animalsLeft(button.dataset.animal);
    button.disabled=!world||!left||(stage()&&meadow.pasture.animals.length>=2);
    button.querySelector("span").textContent=left+" available";
  }
}

function animalsLeft(species){
  const deployed=meadow?.pasture.animals.filter(animal=>animal.cattle===(species==="cow")).length??0;
  return penCapacity[species]-deployed;
}

function refreshTip(){
  const select=touchOnly?"Tap":"Click";
  let tip=touchOnly?"Drag to orbit · Pinch to zoom":"Drag to orbit · Scroll to zoom";
  if(selected==="spade")tip=world.shrubHighlight.hovered?(drag?.active?"Release to uproot this sea buckthorn":select+" to uproot this sea buckthorn"):"Move the spade over a shrub";
  else if(selected==="burn")tip="Choose where the fire begins on the globe";
  else if(meadow?.recovery)tip=meadow.effects.caption;
  else if(meadow?.motion.activity)tip="Pruning the shrub…";
  else if(selected==="water")tip=drag?.active?(drag.target?"Release to water the seeds":"Drag the cloud to the pale ring"):select+" the seed bed to water it";
  else if(drag?.active)tip=drag.target?"Release to place":"Move onto the planet, then release to place";
  else if(selected==="seed")tip=touchOnly?"Paint grass · Two fingers orbit":"Paint grass · Right-drag to orbit";
  else if(selected in penCapacity)tip=select+" a grass patch to place one "+selected;
  else if(selected==="prune")tip=select+" an established shrub · Drag to orbit";
  else if(selected==="buckthorn")tip=select+" to plant sea buckthorn · Drag to orbit";
  else if(stage()==="uproot")tip="Drag Uproot to a shrub, or place Burn anywhere on the globe";
  else if(world?.soilView)tip="Teal patches show enriched soil";
  textAt("#scene-tip",tip);
}

function loadShrub(){
  return loadSeaBuckthorn().then(model=>{
    buckthornModel=model;
    if(meadow.pasture.animals.length)meadow.herdTemplate=model;
    if(lastPointer&&(selected==="buckthorn"||drag?.id==="buckthorn"))showPlacement(...lastPointer,"buckthorn");
    return model;
  }).catch(error=>{
    console.error(error);
    notice("The seedling is loading. The field study will retry.");
    return null;
  });
}

const fieldWindow=$("#rain-window"),windowAction=$("#rain-action");
const bedControls=$("#bed-controls"),bedLeave=$("#bed-leave");
let fieldObservation=null,windowExitTimer=null;
function openIdentification(){
  const card=$("#species-card");
  if(stage()!=="identify"||!studyPlant||card.open)return;
  card.showModal();
  $("#id-continue").focus({preventScroll:true});
}
const observationCues={
  raining:["Rain is falling on your seed bed."],
  impact:["Watch the dark patch spread as water soaks into the soil."],
  sprouting:["The seed coat is opening. Watch the first green blade unfold."],
  grown:["Fresh shoots are opening across the seed bed."],
  breeze:["Follow the brown seed. The grass bends as a gust passes through.","Watching the breeze…",true],
  landed:["The seed has settled in a gap between the grass tufts.","Watch it take root"],
  rooting:["A woody stem rises from the seed. Look for the narrow leaves opening along its sides.","Growing…",true],
  rooted:["The seedling has taken root. Return to the meadow to see its field record.","View plant identification"],
};
function showObservationCue(cue){
  const [caption,action,busy]=observationCues[cue];
  if(stage()==="water"){textAt("#bed-caption",caption);return;}
  textAt("#rain-caption",caption);
  windowAction.textContent=action;windowAction.disabled=!!busy;
}
function setBedView(open){
  $(".workspace").classList.toggle("seed-bed-view",open);
  bedControls.hidden=!open;bedLeave.hidden=!open;
  canvas.setAttribute("aria-label",open?"Rain and new grass on your planet. Drag to orbit, scroll to zoom, or press Escape to pause.":fieldCanvasLabel);
}
function openObservation(dropPoint){
  const id=stage();
  if(world.observation||!["water","arrival"].includes(id))return;
  if(id==="water"&&(!seedBed||wateredAt!==null||!fieldObservation&&!dropPoint))return;
  clearPreview();clearTimeout(promptTimer);
  selected=null;
  if(id==="water"){
    $(".workspace").classList.remove("carrying-water");
    skyCloud.hidden=true;
    fieldObservation??=createFirstRain(world,seedBed,dropPoint,showObservationCue,()=>leaveObservation(true));
    setBedView(true);
  }else{
    fieldWindow.showModal();
    fieldObservation??=createWindArrival(world,arrivalPoint,buckthornModel,$("#rain-view"),showObservationCue);
  }
  world.observation=fieldObservation;
  fieldObservation.resume();
  const focus=id==="water"?canvas:(windowAction.disabled?$("#rain-close"):windowAction);
  focus.focus({preventScroll:true});
}
function leaveObservation(advance=false){
  const shot=world.observation;
  if(!shot||fieldWindow.hasAttribute("data-leaving")||bedLeave.disabled)return;
  const committed=shot.complete&&advance===true;
  if(stage()==="water"){
    shot.suspend();
    finishObservationExit(shot,committed);
    return;
  }
  world.observation=null;
  shot.cancelDrag?.();
  fieldWindow.setAttribute("data-leaving","");
  if(matchMedia("(prefers-reduced-motion: reduce)").matches)finishObservationExit(shot,committed);
  else windowExitTimer=setTimeout(()=>finishObservationExit(shot,committed),240);
}
function finishObservationExit(shot,committed){
  windowExitTimer=null;
  world.observation=null;
  if(fieldWindow.open)fieldWindow.close();
  if(!bedControls.hidden){setBedView(false);bedLeave.disabled=false;}
  fieldWindow.removeAttribute("data-leaving");
  if(committed){
    if(stage()==="arrival"){
      shot.dispose();fieldObservation=null;
      studyPlant=world.plantSapling(buckthornModel,arrivalPoint,meadow.year);
      world.showDirection(arrivalPoint,studyView());
      nextChapter("arrival");
    }else{
      wateredAt=world.clock.getElapsedTime();
      world.prepareMeadow(seedBed);
      shot.growIntoMeadow(0);
      textAt("#task-title","Watch the meadow fill in");
      textAt("#task-description","New blades are spreading out from your seed bed.");
    }
  }else{
    toggleGuide(true);
    nextStep.textContent={arrival:"Resume the seed’s journey",water:"Resume watering"}[stage()];
  }
  world.render();
  updateStudyTools();updateReading();updateSowHint();refreshTip();
  if(!document.querySelector("dialog[open]"))(committed?canvas:nextStep).focus({preventScroll:true});
}
function resetObservation(){
  if($("#species-card").open)$("#species-card").close();
  clearTimeout(windowExitTimer);windowExitTimer=null;
  if(fieldWindow.open)fieldWindow.close();
  if(!bedControls.hidden)setBedView(false);
  bedLeave.disabled=false;
  fieldWindow.removeAttribute("data-leaving");
  world.observation=null;
  fieldObservation?.dispose();
  fieldObservation=null;
}
function advanceObservation(){
  if(fieldWindow.hasAttribute("data-leaving")||bedLeave.disabled)return;
  if(world.observation?.complete)leaveObservation(true);
  else world.observation?.act();
}

function choose(id){
  if(!world||!toolAvailable(id)||id in inventory&&inventory[id]===0)return;
  if(id==="water"&&fieldObservation){openObservation();return;}
  if(id==="herd"){
    choose(null);
    if(!pen.open)pen.showModal();
    return;
  }
  if(id in penCapacity&&animalsLeft(id)<=0)return;
  selected=id;
  $(".workspace").classList.toggle("carrying-water",id==="water");
  canvas.style.cursor=id?"crosshair":"grab";
  lastSpot=null;
  clearPreview();
  if(id){
    if(world.soilView)toggleSoil(false);
    if(id==="seed"&&!stage())world.buildGrass();
    if(id==="buckthorn"&&!buckthornModel)loadShrub();
  }
  syncButtons();
  refreshTip();
  updateSowHint();
}

function togglePanel(id,open,trigger){
  $(id).hidden=!open;
  $(trigger).setAttribute("aria-expanded",open);
}

function toggleGuide(open){
  if(open&&!meadow?.fieldTimeline&&matchMedia("(max-width:740px)").matches)togglePanel("#panel-time",false,"#time-toggle");
  togglePanel("#field-guide",open,"#guide-toggle");
  updateSowHint();
}

function toggleTime(open){
  if(open&&matchMedia("(max-width:740px)").matches)toggleGuide(false);
  togglePanel("#panel-time",open,"#time-toggle");
}

function toggleSoil(active){
  world.soilView=active;
  $("#soil-view").setAttribute("aria-pressed",active);
  $("#soil-legend").hidden=!active;
  $("#soil-notes").hidden=!active;
  updateTime();
  refreshTip();
}

function updateTime(){
  const {year,playing}=meadow;
  if(year>HERD_LAST_YEAR&&!$("#field-feedback").hidden&&$("#field-feedback").textContent.includes("herd"))$("#field-feedback").hidden=true;
  if(meadow.fieldTimeline)syncTimelineChapter(year);
  if(!stage()&&buttons.get("herd").hidden!==!toolAvailable("herd"))updateStudyTools();
  if(Math.abs(Number(yearRange.value)-year)>.001)yearRange.value=year;
  yearRange.style.setProperty("--timeline-fill",((year-yearRange.min)/(yearRange.max-yearRange.min)*100)+"%");
  textAt("#year-value","Year "+year.toFixed(1));
  textAt("#play-time",playing?"Pause timeline":year>=meadow.playbackLimit?"Replay timeline":"Play timeline");
  const age=Math.max(0,...world.saplings.children.filter(shrub=>shrub.visible).map(shrub=>shrub.userData.age));
  const growth=age>=3.8?"Ripe orange fruit":age>=2.2?"Fruit forming":year>=.35?"Branches and leaves growing":"Young saplings";
  if(!meadow.fieldTimeline)textAt("#growth-stage",meadow.dryCover>=12?"Desertification spreading":meadow.highestMound>.13?"Raised soil under shrubs":year>=28?"Long dry spell":growth);
  textAt("#dry-cover",meadow.dryCover+"%");
  textAt("#enriched-cover",meadow.enrichedCover+"% enriched");
  textAt("#enrichment-reading",meadow.enrichedCover+"%");
  textAt("#mound-height",Math.round(meadow.highestMound*100)+" cm");
  updateReading();
}

function paint(point){
  if(stage()){
    if(stage()==="sow"&&point){
      seedBed=point.clone();
      world.scatterSeeds(seedBed);
      nextChapter("sow");
    }
    return;
  }
  if(!point||grassCover===1){lastSpot=null;return;}
  let distance=lastSpot?angleBetween(lastSpot,point):0;
  if(distance>1.5){lastSpot=null;distance=0;}
  if(lastSpot&&distance<.014)return;
  const steps=lastSpot?Math.max(1,Math.ceil(distance/.063)):1;
  for(let i=1;i<=steps;i++){
    grassCover=world.sow(lastSpot?lastSpot.clone().lerp(point,i/steps).normalize():point);
    if(grassCover===1)break;
  }
  lastSpot=point;
}


async function useItem(id,point,shrub){
  if(!id||!toolAvailable(id))return;
  if(id==="water"){
    if(overSeedBed(point))openObservation(point);
    else notice("Place the cloud inside the ring around the seeds.");
    return;
  }
  if(id==="spade"||id==="burn"){
    const target=id==="spade"?(shrub??meadow.shrubNear(point,.065)):meadow.stand.find(plant=>plant.visible);
    if(!target||!point&&id==="burn"){
      notice(id==="spade"?"Place the spade at the base of a shrub.":"Choose a point on the globe.");return;
    }
    if(meadow.uproot(target,id==="burn"?meadow.stand:[],id,id==="spade"?target.userData.direction:point)){
      recordRestoration(id);
      uprooted=true;meadow.holdGrazing=true;
      choose(null);toggleGuide(false);updateStudyTools();updateReading();refreshTip();
    }
    return;
  }
  if(id==="prune"){
    if(meadow.motion.activity)return;
    const target=shrub??meadow.shrubNear(point);
    if(meadow.prune(target,()=>{notice("More light reaches the grass. The soil mound stays in place.");}))return;
    notice(target?"Advance time to grow this shrub before pruning.":"Choose a mature shrub on the planet.");
    return;
  }
  if(!point)return;
  if(id==="seed"){paint(point);return;}
  if(id in penCapacity){
    if(animalsLeft(id)<=0||stage()&&meadow.pasture.animals.length>=2)return;
    meadow.releaseAnimal(point,id,buckthornModel??null);
    if(!buckthornModel)loadShrub();
    choose(null);
    notice(stage()==="graze"?"Watch the "+id+" lower its head. The grass shortens where it feeds.":"One "+id+" placed.");
    return;
  }
  if(id!=="buckthorn"||inventory.buckthorn===0)return;
  const run=revision;
  const model=buckthornModel??await loadShrub();
  if(run!==revision||!model||inventory[id]===0)return;
  world.plantSapling(model,point,meadow.year);
  inventory[id]--;
  if(inventory[id]===0&&selected===id)choose(null);
  else syncButtons();
}

function surfaceAt(x,y){
  return document.elementFromPoint(x,y)===canvas?world.pick(x,y):null;
}

function overSeedBed(point){
  return !!point&&!!seedBed&&point.dot(seedBed)>=Math.cos(SEED_ANGLE+.025);
}

function clearPreview(){
  if(!world)return;
  cursor.hidden=true;
  skyCloud.style.removeProperty("left");skyCloud.style.removeProperty("top");
  world.sowHint.material.color.setHex(0xfff4cf);
  world.shrubHighlight.setTarget(null);
  if(selected==="spade")refreshTip();
  meadow.effects.previewSpade(null);
  world.brush(null);
  world.previewSapling(null,null);
  meadow.pasture.showPreview(null);
}

function showPlacement(x,y,id){
  if(!world||!id){clearPreview();return;}
  const onCanvas=document.elementFromPoint(x,y)===canvas;
  const shrub=id==="spade"&&onCanvas?world.pickShrub(x,y):null;
  const point=shrub?.userData.direction??surfaceAt(x,y);
  if(id==="water"){
    const rect=canvas.getBoundingClientRect();
    skyCloud.style.left=(x-rect.left)+"px";
    skyCloud.style.top=(y-rect.top-skyCloud.offsetHeight*.36)+"px";
    const over=overSeedBed(point);
    world.sowHint.material.color.setHex(over?0x90f2ce:0xfff4cf);
    if(drag)drag.target=over;
    refreshTip();return;
  }
  const target=id==="spade"?shrub??meadow.shrubNear(point,.065):point;
  world.shrubHighlight.setTarget(id==="spade"?target:null);
  meadow.effects.previewSpade(id==="spade"?point:null);
  const template=id==="buckthorn"?buckthornModel:null;
  lastPointer=[x,y];
  if(drag?.active)drag.target=!!target;
  if(drag?.active||id==="spade")refreshTip();
  if(id!=="prune"&&!(id==="spade"&&target)&&(drag?.active||onCanvas)){
    const item=catalog[id];
    const image=$("#placement-image");
    image.hidden=!item.image;
    if(item.image)image.src="assets/"+item.image+".webp";
    $("#placement-symbol").hidden=!item.icon;
    if(item.icon)$("#placement-symbol").innerHTML=iconMarkup(item.icon);
    textAt("#placement-name",item.name);
    textAt("#placement-hint",id==="spade"?(target?"Release or click to dig":"Aim at a shrub"):id==="burn"?(target?"Start the burn here":"Move onto the globe"):!point?"Move onto the planet":drag?.active?"Release to place":id==="seed"?"Drag to sow":touchOnly?"Tap to place":"Click to place");
    cursor.hidden=false;
    cursor.toggleAttribute("data-target",!!target);
    const left=clamp(x+15,5,Math.max(5,innerWidth-cursor.offsetWidth-7));
    const top=clamp(y-54,6,Math.max(6,innerHeight-cursor.offsetHeight-7));
    cursor.style.transform="translate3d("+left+"px,"+top+"px,0)";
  }else cursor.hidden=true;
  world.previewSapling(template,point);
  meadow.pasture.showPreview(id in penCapacity?point:null,id);
  world.brush(id==="spade"&&target?null:id==="prune"?meadow.shrubNear(point)?.userData.direction??null:point,
    id==="seed"?SEED_ANGLE:.105,id==="seed"?.11:.27);
}

function beginToolDrag(event){
  const button=event.target.closest(".slot,#sky-cloud");
  if(!world||!button||button.dataset.item==="herd"||button.hidden||button.disabled||event.button!==0||drag||touches.size)return;
  if(button.dataset.item==="water"&&fieldObservation)return;
  suppressClick=null;
  drag={id:button.dataset.item,button,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false};
  button.setPointerCapture(drag.pointerId);
}
function moveToolDrag(event){
  if(drag?.pointerId!==event.pointerId)return;
  if(!drag.active){
    if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    drag.active=true;
    drag.button.classList.add("is-dragging");
    choose(drag.id);
  }
  showPlacement(event.clientX,event.clientY,drag.id);
}
function endDrag(event){
  if(!drag||event&&event.pointerId!==drag.pointerId)return;
  const {button,id,active,pointerId}=drag;
  drag=null;
  if(button.hasPointerCapture(pointerId))button.releasePointerCapture(pointerId);
  if(!active)return;
  suppressClick=button;
  button.classList.remove("is-dragging");
  const point=event?.type==="pointerup"?surfaceAt(event.clientX,event.clientY):null;
  clearPreview();
  const shrub=id==="spade"&&event?.type==="pointerup"&&document.elementFromPoint(event.clientX,event.clientY)===canvas?world.pickShrub(event.clientX,event.clientY):null;
  if(id==="water"&&!overSeedBed(point)){
    choose(null);
    if(event?.type==="pointerup")notice("Drag the cloud into the ring around the seeds.");
  }else if(point||shrub)useItem(id,point,shrub);
  else choose(null);
  refreshTip();
}
function pickTool(event){
  const button=event.target.closest(".slot,#sky-cloud");
  if(!button||button.disabled)return;
  if(button===suppressClick&&event.detail!==0){suppressClick=null;return;}
  choose(selected===button.dataset.item?null:button.dataset.item);
  if(!pen.open&&!world.observation)canvas.focus({preventScroll:true});
}
for(const source of [hotbar,skyCloud]){
  source.addEventListener("pointerdown",beginToolDrag);
  source.addEventListener("pointermove",moveToolDrag);
  for(const name of ["pointerup","pointercancel","lostpointercapture"])source.addEventListener(name,endDrag);
  source.addEventListener("click",pickTool);
}

function touchPair(){
  const [a,b]=touches.values();
  return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,length:Math.hypot(a.x-b.x,a.y-b.y)};
}
canvas.addEventListener("contextmenu",event=>event.preventDefault());
canvas.addEventListener("pointerdown",event=>{
  if(!world||fieldWindow.open||drag)return;
  const x=event.clientX,y=event.clientY;
  touches.set(event.pointerId,{x,y});
  canvas.setPointerCapture(event.pointerId);
  lastSpot=null;
  if(touches.size>1){
    gesture=null;
    pinch=touchPair();
    clearPreview();
    return;
  }
  const point=world.pick(x,y);
  const manageHit=["prune","spade"].includes(selected)&&!point&&world.pickShrub(x,y);
  const turn=!selected||event.shiftKey||event.button!==0||!point&&!manageHit;
  gesture={x,y,turn,id:selected,seedPending:!turn&&selected==="seed"&&event.pointerType==="touch"};
  if(turn){
    canvas.style.cursor="grabbing";
    clearPreview();
  }else{
    if(selected==="seed"&&!gesture.seedPending)paint(point);
    showPlacement(x,y,selected);
  }
});
canvas.addEventListener("pointermove",event=>{
  if(!world||fieldWindow.open||drag?.active)return;
  const x=event.clientX,y=event.clientY;
  lastPointer=[x,y];
  if(touches.has(event.pointerId))touches.set(event.pointerId,{x,y});
  if(touches.size>1){
    const pair=touchPair();
    if(pinch&&pinch.length>0&&pair.length>0){
      world.dragTurn(pinch.x,pinch.y,pair.x,pair.y);
      world.zoom(pair.length/pinch.length);
    }
    pinch=pair;
    return;
  }
  if(gesture&&!gesture.turn&&gesture.id!=="seed"&&Math.hypot(x-gesture.x,y-gesture.y)>=6){
    gesture.turn=true;
    clearPreview();
    canvas.style.cursor="grabbing";
  }
  if(gesture?.turn){
    world.dragTurn(gesture.x,gesture.y,x,y);
    gesture.x=x;gesture.y=y;
    return;
  }
  if(gesture?.id==="seed"){
    if(gesture.seedPending){
      if(Math.hypot(x-gesture.x,y-gesture.y)<5)return;
      paint(world.pick(gesture.x,gesture.y));
      gesture.seedPending=false;
    }
    paint(surfaceAt(x,y));
  }
  showPlacement(x,y,selected);
});
function endPointer(event){
  if(!world||fieldWindow.open)return;
  if(event.type==="pointerup"&&gesture&&!gesture.turn&&(gesture.id!=="seed"||gesture.seedPending)){
    const {clientX:x,clientY:y}=event;
    useItem(gesture.id,surfaceAt(x,y),["prune","spade"].includes(gesture.id)&&document.elementFromPoint(x,y)===canvas?world.pickShrub(x,y):null);
  }
  touches.delete(event.pointerId);
  gesture=null;pinch=null;lastSpot=null;
  canvas.style.cursor=selected?"crosshair":"grab";
  if(event.pointerType==="mouse"&&selected)showPlacement(event.clientX,event.clientY,selected);
  else clearPreview();
}
for(const name of ["pointerup","pointercancel"])canvas.addEventListener(name,endPointer);
canvas.addEventListener("lostpointercapture",event=>{if(touches.has(event.pointerId))endPointer(event);});
canvas.addEventListener("pointerleave",()=>{if(!touches.size&&!drag)clearPreview();});
canvas.addEventListener("wheel",event=>{
  if(!world)return;
  event.preventDefault();
  if(fieldWindow.open)return;
  world.zoom(Math.exp(-clamp(event.deltaY,-170,170)*.00165));
  if(selected)showPlacement(event.clientX,event.clientY,selected);
},{passive:false});
canvas.addEventListener("keydown",event=>{
  if(!world)return;
  if(fieldWindow.open)return;
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(moves[event.key]){event.preventDefault();world.turnKey(...moves[event.key]);}
  else if((event.key==="Enter"||event.key===" ")&&selected&&!event.repeat){
    event.preventDefault();
    const point=FRONT.clone().applyQuaternion(world.planet.quaternion.clone().invert());
    useItem(selected,selected==="water"?seedBed:point);
  }else if(event.key==="+"||event.key==="="){
    event.preventDefault();world.zoom(1.25);
  }else if(event.key==="-"){
    event.preventDefault();world.zoom(.8);
  }
});
document.addEventListener("keydown",event=>{
  if(!bedControls.hidden&&event.key==="Escape"){event.preventDefault();leaveObservation();return;}
  if(!world||world.observation||document.querySelector("dialog[open]"))return;
  if(event.key==="Escape"){endDrag();choose(null);}
  if(event.target.matches("input,textarea,select")||event.ctrlKey||event.metaKey||event.altKey)return;
  const item=items[Number(event.key)-1];
  if(item&&toolAvailable(item)&&/^[1-6]$/.test(event.key)){event.preventDefault();choose(item);if(!pen.open)canvas.focus({preventScroll:true});}
});
window.addEventListener("blur",()=>{
  world?.observation?.cancelDrag?.();
  endDrag();
  touches.clear();
  gesture=pinch=null;
  lastPointer=null;
  clearPreview();
});
function orbit(){choose(null);canvas.style.cursor="grab";}
windowAction.addEventListener("click",advanceObservation);
bedLeave.addEventListener("click",()=>leaveObservation());
$("#rain-close").addEventListener("click",leaveObservation);
fieldWindow.addEventListener("cancel",event=>{event.preventDefault();leaveObservation();});
$("#rain-view").addEventListener("keydown",event=>{
  if((event.key==="Enter"||event.key===" ")&&!event.repeat){
    event.preventDefault();
    if(!windowAction.disabled)advanceObservation();
  }
});
$("#orbit").addEventListener("click",orbit);
$("#zoom-in").addEventListener("click",()=>world?.zoom(1.25));
$("#zoom-out").addEventListener("click",()=>world?.zoom(.8));
$("#home").addEventListener("click",()=>{meadow?.fieldTimeline?.setFollow(false);world?.resetView();clearPreview();});
$("#fullscreen").hidden=!document.documentElement.requestFullscreen;
$("#fullscreen").addEventListener("click",async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}
  catch{notice("Full screen is unavailable in this browser.");}
});
$("#guide-toggle").addEventListener("click",()=>toggleGuide($("#field-guide").hidden));
$("#guide-close").addEventListener("click",()=>toggleGuide(false));
$("#prompt-close").addEventListener("click",()=>studyPrompt.close());
$("#prompt-action").addEventListener("click",()=>{
  studyPrompt.close();
  toggleGuide(true);
  followGuide();
});
$("#id-close").addEventListener("click",()=>$("#species-card").close());
$("#id-continue").addEventListener("click",()=>{
  $("#species-card").close();
  nextChapter("identify");
});
yearRange.addEventListener("pointerdown",()=>{sliding=true;});
for(const type of ["pointerup","pointercancel","blur"])window.addEventListener(type,()=>{sliding=false;});
buttons.get("herd").setAttribute("aria-haspopup","dialog");
buttons.get("herd").setAttribute("aria-controls","animal-pen");
$("#pen-close").addEventListener("click",()=>pen.close());
for(const button of pen.querySelectorAll("[data-animal]")){
  button.addEventListener("click",()=>{
    pen.close();
    choose(button.dataset.animal);
    canvas.focus({preventScroll:true});
  });
}
$("#time-toggle").addEventListener("click",()=>toggleTime($("#panel-time").hidden));
$("#follow-herd").addEventListener("click",()=>meadow?.fieldTimeline?.toggleFollow());
$("#finish-observation").addEventListener("click",()=>{
  if(meadow.fieldTimeline){
    if(meadow.year<100)return;
    leaveMainTimeline();
    toggleTime(false);
    nextChapter("dryYears");
    world.showDirection(studyPlant.userData.direction,studyView());
    return;
  }
  if(stage()!=="impact"||meadow.year<20||meadow.highestMound<=.12)return;
  meadow.scrub(meadow.year);
  toggleTime(false);toggleSoil(false);toggleGuide(true);
  nextChapter("impact");
});
$("#time-close").addEventListener("click",()=>toggleTime(false));
$("#manage").addEventListener("click",()=>choose(selected==="prune"?null:"prune"));
$("#next-step").addEventListener("click",followGuide);
$("#soil-view").addEventListener("click",()=>{choose(null);toggleSoil(!world.soilView);});
$("#play-time").addEventListener("click",()=>meadow?.togglePlayback());
yearRange.addEventListener("input",()=>meadow.scrub(Number(yearRange.value)));
$("#recall-herd").addEventListener("click",()=>{
  meadow.pasture.clear();
  syncButtons();
  notice("Herd recalled.");
});
function openRestart(){
  endDrag();
  clearPreview();
  $("#restart-dialog").showModal();
}
$("#restart").addEventListener("click",openRestart);
$("#result-restart").addEventListener("click",openRestart);
$("#result-before").addEventListener("click",()=>compareMeadow(true));
$("#result-after").addEventListener("click",()=>compareMeadow(false));
$("#result-explore").addEventListener("click",()=>{
  leaveRecoveryResult();
  document.querySelector(".workspace").classList.add("sandbox-mode");
  canvas.focus({preventScroll:true});
});
$("#keep").addEventListener("click",()=>$("#restart-dialog").close());
$("#confirm").addEventListener("click",()=>{
  $("#restart-dialog").close();
  if(!world)return;
  revision++;
  leaveMainTimeline();
  resetStudy();
  world.reset();
  meadow.reset();
  touches.clear();
  gesture=pinch=null;
  lastPointer=null;
  grassCover=0;
  for(const species of Object.keys(inventory))inventory[species]=3;
  sliding=false;
  clearTimeout(toastTimer);
  $("#field-feedback").hidden=true;
  toggleSoil(false);
  toggleTime(false);
  toggleGuide(true);
  orbit();
  renderChapter();
});

if(meadow){
  meadow.onTime=updateTime;
  meadow.onBite=recordBite;
  meadow.onTick=studyTick;
  meadow.onGraze=notice;
  meadow.motion.onChange=()=>{syncButtons();refreshTip();};
}
async function startFieldStudy(){
  const params=new URLSearchParams(location.search),entry=params.get("chapter");
  const generation=revision;
  if(world&&["arrival","identify","spread","dry-years","restore","result"].includes(entry)){
    const model=await loadShrub();
    if(generation!==revision)return;
    if(model){
      seedBed=FRONT.clone();arrivalPoint=seedBed.clone();
      world.prepareMeadow(seedBed);
      // A chapter entry begins after the initial eight seconds of grass growth.
      world.clock.elapsedTime+=9;
      wateredAt=world.clock.getElapsedTime()-9;grassCover=1;
      // Chapter links reconstruct a two-animal example; ordinary play keeps the actual herd.
      const [east,north]=tangentFrame(arrivalPoint);
      meadow.releaseAnimal(onSurface(arrivalPoint,east,north,.49,.8),"cow",model);
      meadow.releaseAnimal(onSurface(arrivalPoint,east,north,.72,2.9),"sheep",model);
      chapter=chapters.findIndex(step=>step.id===(entry==="dry-years"?"dryYears":["restore","result"].includes(entry)?"uproot":entry));
      if(entry!=="arrival"){
        studyPlant=world.plantSapling(model,arrivalPoint,0);
        if(entry!=="identify"){
          meadow.establishStand(studyPlant,model);
          meadow.scrub(entry==="spread"?20:entry==="dry-years"?44:100);
        }
      }
      if(entry==="result"){
        recordRestoration("preview");
        for(const plant of meadow.stand)plant.userData.removedAt=meadow.year;
        meadow.setYear(meadow.year);
        chapter=chapters.length;uprooted=true;meadow.guidedDispersal=false;
      }
      world.showDirection(meadow.standCenter??arrivalPoint,FRONT);
    }
  }else if(world){
    loadShrub();
    if(entry==="water"){
      seedBed=FRONT.clone();world.scatterSeeds(seedBed);
      chapter=chapters.findIndex(step=>step.id==="water");
    }
  }
  toggleGuide(true);renderChapter();syncButtons();refreshTip();
  if(entry==="restore"&&stage()==="uproot"){clearTimeout(promptTimer);toggleGuide(false);}
  const preview=params.get("play");
  if(stage()==="arrival"&&preview==="wind"){
    openObservation();
  }
}
startFieldStudy();
