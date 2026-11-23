"use strict";

const chapters=[
  {id:"sow",title:"Sow the first seeds",body:"Scatter grass seed on the bare soil inside the pale ring.",action:"Pick up seeds",tool:"seed",art:"grass-token"},
  {id:"water",title:"Water the seed bed",body:"Drag the cloud onto the seeds inside the pale ring. Release it to water the soil.",action:"Pick up the cloud",tool:"water",art:"rain-cloud"},
  {id:"graze",title:"Let an animal graze",body:"Choose a cow or a sheep and place it on grass. Watch it lower its head and take a bite.",action:"Open herd inventory",tool:"herd",art:"herd-token"},
  {id:"cycle",title:"Can the grass grow back?",body:"Keep up to two animals on this model meadow. Watch the cropped patch while they move on to feed elsewhere.",action:"Watch the grazed patch",art:"sheep-token"},
  {id:"arrival",title:"A breeze crosses the meadow",body:"Follow a loose seed as a breeze rolls it into a gap between the grass tufts.",action:"Follow the seed",icon:"wind"},
  {id:"identify",title:"A sea buckthorn has sprouted",body:"The seedling has been identified. Open its field record to see its leaves and mature fruit.",action:"View identification",art:"sapling-token"},
  {id:"impact",title:"Follow the sea buckthorn",body:"Watch the first twenty years. The shrub bears fruit, grass thins beneath its canopy, and a small mound rises. Soil view reveals the nutrient-rich patch.",action:"Watch the first 20 years",art:"reward-saplings"},
  {id:"spread",title:"One shrub becomes a stand",body:"Follow a grazing animal from a fruiting shrub. Look for a fallen seed in its hoofprint, then watch where the animal carries it.",action:"View timeline",art:"reward-saplings"},
  {id:"dryYears",title:"When bare patches join",body:"Follow the same four shrubs through a prolonged dry spell. Watch the grassy gaps as the exposed patches spread into one another.",action:"View timeline",icon:"layers"},
  {id:"uproot",title:"Restore the meadow",body:"Drag the spade onto each shrub to lift it by the roots. Or choose Burn, then touch the globe to watch fire sweep across the whole meadow.",action:"Choose a method",icon:"spade"},
];
let chapter=0,seedBed=null,wateredAt=null,studyPlant=null,biteCell=-1;
let watchedSince=null,arrivalPending=false,arrivalPoint=null,uprooted=false;
let promptTimer=null,lastReadingTime=-1;
const currentChapter=()=>chapters[chapter];
const stage=()=>currentChapter()?.id;
const studyView=()=>new THREE.Vector3(-.57,matchMedia("(max-width:740px)").matches?-.2:.32,.68).normalize();

function nextChapter(id){
  if(stage()!==id)return;
  chapter++;
  choose(null);
  renderChapter();
}

function renderChapter(){
  const step=currentChapter();
  const count=chapters.length;
  if(world){
    meadow.playbackLimit=step?.id==="impact"?20:LAST_YEAR;
    yearRange.max=meadow.playbackLimit;
    yearRange.min=["spread","dryYears"].includes(step?.id)?20:0;
    yearRange.step=Number(yearRange.min)===20?.05:.25;
    document.querySelectorAll("#panel-time .year-ends span").forEach((tick,i)=>{
      tick.textContent=String(Number(yearRange.min)+i*(meadow.playbackLimit-yearRange.min)/4);
    });
  }
  textAt("#guide-count",chapter+" / "+count);
  guideProgress.setAttribute("aria-valuemax",count);
  guideProgress.setAttribute("aria-valuenow",chapter);
  guideProgress.setAttribute("aria-valuetext",chapter+" of "+count+" stages complete");
  guideProgress.firstElementChild.style.width=100*chapter/count+"%";
  textAt("#task-title",step?.title??"The meadow has recovered");
  textAt("#task-description",step?.body??"New grass covers the former thicket. Explore the meadow or replay the century on the timeline.");
  nextStep.hidden=!step;
  if(step)nextStep.textContent=step.action;
  for(const [id,button] of buttons)button.toggleAttribute("data-next",id===step?.tool);
  updateStudyTools();
  updateSowHint();
  updateReading();
  if(!step){showRecoveryResult();return;}
  if(["spread","dryYears"].includes(step?.id)){
    clearTimeout(promptTimer);
    if(!meadow.fieldTimeline)enterMainTimeline();
  }else if(["water","graze","identify"].includes(step?.id)){
    clearTimeout(promptTimer);toggleGuide(true);
    if(step.id==="identify")openIdentification();
  }else schedulePrompt();
}

function enterMainTimeline(){
  meadow.establishStand(studyPlant,buckthornModel);
  meadow.fieldTimeline=createPastureTimeline(world,meadow);
  world.onManualOrbit=()=>meadow.fieldTimeline?.setFollow(false);
  document.querySelector(".workspace").classList.add("field-years");
  toggleGuide(false);toggleTime(true);
  $("#follow-herd").hidden=false;
  meadow.preview=null;meadow.playing=true;
  meadow.fieldTimeline.sample();updateTime();
}
function leaveMainTimeline(){
  if(!meadow?.fieldTimeline)return;
  meadow.fieldTimeline.dispose();meadow.fieldTimeline=null;world.onManualOrbit=null;
  meadow.playing=false;meadow.preview=null;
  document.querySelector(".workspace").classList.remove("field-years");
  $("#follow-herd").hidden=true;
}
function syncTimelineChapter(year){
  const id=year>=44?"dryYears":"spread";
  if(stage()===id)return;
  chapter=chapters.findIndex(c=>c.id===id);
  renderChapter();
}

function schedulePrompt(){
  clearTimeout(promptTimer);
  if(!world)return;
  const present=()=>{
    if(gesture||drag||touches.size||sliding||document.querySelector("dialog[open]")){
      promptTimer=setTimeout(present,180);return;
    }
    const step=currentChapter();
    if(!step)return;
    textAt("#prompt-step","Field study · "+(chapter+1)+" of "+chapters.length);
    textAt("#prompt-title",step.title);
    textAt("#prompt-body",step.body);
    $("#prompt-art").hidden=!!step?.icon;
    $("#prompt-art").src=step?.art==="rain-cloud"?cloudArt:"assets/"+(step?.art??"grass-token")+".webp";
    $("#prompt-symbol").hidden=!step?.icon;
    $("#prompt-symbol").innerHTML=step?.icon?iconMarkup(step.icon):"";
    textAt("#prompt-action",step.action);
    studyPrompt.showModal();
    $("#prompt-action").focus({preventScroll:true});
  };
  promptTimer=setTimeout(present,stage()==="sow"?500:2000);
}

function updateSowHint(){
  if(!world)return;
  if(world.observation){world.sowHint.visible=false;return;}
  if(stage()==="water"&&seedBed&&wateredAt===null)world.placeRing(world.sowHint,seedBed,.055);
  else if(stage()==="arrival"&&arrivalPoint)world.placeRing(world.sowHint,arrivalPoint,.15);
  else if(stage()==="identify"&&studyPlant)world.placeRing(world.sowHint,studyPlant.userData.direction,.08);
  else world.showSowHint(stage()==="sow");
}

function toolAvailable(id){
  if(!id)return true;
  if(resultOpen)return false;
  if(id==="cow"||id==="sheep"||id==="herd")return meadow.year<=HERD_LAST_YEAR&&(["graze","cycle"].includes(stage())||!stage());
  if(id==="buckthorn"||id==="prune")return !stage();
  if(id==="seed")return stage()==="sow"||!stage();
  if(id==="water")return stage()==="water"&&wateredAt===null;
  if(id==="spade"||id==="burn")return stage()==="uproot"&&!uprooted;
  return false;
}

function updateStudyTools(){
  for(const [id,button] of buttons)button.hidden=!toolAvailable(id);
  skyCloud.hidden=!world||!toolAvailable("water")||!!fieldObservation;
  $("#time-toggle").hidden=stage()!=="impact"&&!!stage();
  $("#manage").hidden=!!stage();
  const live=["spread","dryYears"].includes(stage());
  $("#play-time").hidden=!live&&stage()!=="impact"&&!!stage();
  $("#finish-observation").hidden=stage()!=="impact"&&(!live||meadow.year<100);
  $("#pen-limit").hidden=!stage();
  syncButtons();
}

function followGuide(){
  const id=stage();
  if(!world||!id)return;
  clearTimeout(promptTimer);
  if(id==="arrival"){openObservation();return;}
  if(id==="identify"){openIdentification();return;}
  if(id==="uproot"){toggleGuide(false);buttons.get("spade").focus({preventScroll:true});return;}
  if(meadow.fieldTimeline){toggleGuide(false);yearRange.focus({preventScroll:true});return;}
  if(id==="cycle"){
    if(watchedSince===null){
      watchedSince=world.clock.getElapsedTime();
      meadow.holdGrazing=false;
      const p=new THREE.Vector3().fromArray(world.cellDirs,biteCell*3);
      world.showDirection(p,FRONT);
      world.placeRing(world.sowHint,p,.32);
    }
  }else if(id==="impact"){
    world.showDirection(studyPlant.userData.direction,studyView());
    toggleTime(true);
    if(!meadow.playing&&meadow.year<20)meadow.previewYear(20,Math.max(1,8*(20-meadow.year)/20));
    yearRange.focus({preventScroll:true});
    return;
  }else{
    if(id==="water"&&wateredAt!==null||id==="uproot"&&uprooted)return;
    choose(currentChapter().tool);
  }
  if(!pen.open&&!world.observation)canvas.focus({preventScroll:true});
  updateReading();
}

function updateReading(){
  let label="",value="";
  const time=world?.clock.getElapsedTime()??0;
  if(stage()==="uproot"&&meadow.recovery){
    label="Restoration";value=meadow.effects.caption||"Clearing the stand";
  }else if(stage()==="water"&&wateredAt!==null){
    label="Grass growth";value=Math.round(100*clamp((time-wateredAt-.5)/7.7,0,1))+"%";
  }else if(stage()==="graze"||stage()==="cycle"){
    label="Grazing animals";value=meadow.pasture.animals.length+" / 2";
    if(stage()==="cycle"&&biteCell>=0){label="Grass height at the bite";value=Math.round(100*(1-.94*meadow.pressureAt(biteCell)))+"%";}
  }else if(stage()==="spread"){
    label="Established shrubs";value=String(meadow.stand.filter(s=>s.visible).length||1);
  }else if(stage()==="dryYears"){
    label="Dry, exposed soil in this patch";value=meadow.plotDryCover+"%";
  }else if(stage()==="impact"||stage()==="uproot"||!stage()){
    if(studyPlant){
      const p=studyPlant.userData.direction,i=world.cellIndex(p);
      label=uprooted?"Grass recovery":"Grass under canopy";
      value=Math.round(100*(1-.94*world.stress[i])*(1-world.dryGround[i]))+"%";
      textAt("#understory-reading",value);
    }
  }
  $("#task-reading").hidden=!label;
  textAt("#task-reading-label",label);
  textAt("#progress-value",value);
  if(stage()==="impact"){
    const ready=meadow.year>=20&&meadow.highestMound>.12;
    $("#finish-observation").disabled=!ready;
    textAt("#finish-observation",ready?"Follow the seeds":"Observe to Year 20");
  }
  if(meadow?.fieldTimeline){
    const done=meadow.year>=100;
    $("#finish-observation").hidden=!done;$("#finish-observation").disabled=!done;
    if(done)textAt("#finish-observation","Restore the meadow");
  }
  const waiting=stage()==="water"&&wateredAt!==null||stage()==="cycle"&&watchedSince!==null||stage()==="uproot"&&uprooted;
  nextStep.disabled=!world||waiting;
  if(waiting)nextStep.textContent=stage()==="water"?"Grass is growing…":stage()==="cycle"?"Watching the grass regrow…":"Grass is returning…";
}

function recordBite(index,pressure){
  if(stage()!=="graze"||pressure<.50)return;
  biteCell=index;
  meadow.holdGrazing=true;
  nextChapter("graze");
}

async function wildArrival(){
  if(arrivalPending)return;
  arrivalPending=true;
  const run=revision;
  const model=buckthornModel??await loadShrub();
  if(run!==revision)return;
  if(!model){arrivalPending=false;watchedSince=world.clock.getElapsedTime();return;}
  arrivalPoint=new THREE.Vector3().fromArray(world.cellDirs,biteCell*3);
  world.placeRing(world.sowHint,arrivalPoint,.15);
  nextChapter("cycle");
}

function studyTick(time){
  if(time-lastReadingTime<.12)return;
  lastReadingTime=time;
  updateReading();
  if(meadow.recovery)refreshTip();
  if(wateredAt!==null&&fieldObservation?.growIntoMeadow?.(time-wateredAt)){
    fieldObservation.dispose();fieldObservation=null;
  }
  if(stage()==="water"&&wateredAt!==null&&time-wateredAt>=8.3){
    grassCover=1;nextChapter("water");
  }else if(stage()==="cycle"&&watchedSince!==null&&time-watchedSince>6&&meadow.pressureAt(biteCell)<.08){
    wildArrival();
  }else if(stage()==="uproot"&&uprooted&&!meadow.recovery){
    const left=meadow.stand.filter(plant=>plant.visible);
    if(left.length){
      uprooted=false;
      nextStep.textContent=currentChapter().action;
      updateStudyTools();updateReading();refreshTip();
      notice(left.length+" "+(left.length===1?"shrub remains":"shrubs remain")+". Choose Uproot or Burn.");
      return;
    }
    meadow.holdGrazing=false;
    meadow.guidedDispersal=false;
    nextChapter("uproot");refreshTip();
  }
}

function resetStudy(){
  leaveRecoveryResult();restorationRecord=null;
  document.querySelector(".workspace").classList.remove("sandbox-mode");
  if(world)resetObservation();
  clearTimeout(promptTimer);
  chapter=0;seedBed=null;wateredAt=null;studyPlant=null;biteCell=-1;
  watchedSince=null;arrivalPending=false;arrivalPoint=null;uprooted=false;
  lastReadingTime=-1;
}
