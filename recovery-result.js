"use strict";

let restorationRecord=null,resultOpen=false;

function recordRestoration(method){
  if(!restorationRecord){
    restorationRecord={year:meadow.year,shrubs:meadow.stand.filter(plant=>plant.visible).length,
      exposed:meadow.plotDryCover,methods:new Set()};
  }
  restorationRecord.methods.add(method);
}

function compareMeadow(before){
  if(!resultOpen)return;
  meadow.setYear(restorationRecord.year,before);
  $("#result-before").setAttribute("aria-pressed",String(before));
  $("#result-after").setAttribute("aria-pressed",String(!before));
  canvas.setAttribute("aria-label",(before?"Meadow before clearing":"Meadow after recovery")+". Drag or use arrow keys to rotate.");
}

function showRecoveryResult(){
  if(!restorationRecord||resultOpen)return;
  resultOpen=true;
  const record=restorationRecord;
  clearTimeout(promptTimer);clearTimeout(toastTimer);
  if(studyPrompt.open)studyPrompt.close();
  $("#field-feedback").hidden=true;
  choose(null);toggleGuide(false);toggleTime(false);toggleSoil(false);
  meadow.holdGrazing=true;meadow.preview=null;meadow.playing=false;
  const mixed=record.methods.has("burn")&&record.methods.has("spade");
  textAt("#result-story",mixed?"You lifted some shrubs by their roots, then fire cleared the rest. Grass grew back across the openings.":
    record.methods.has("burn")?"Fire passed through the sea buckthorn stand. As the embers cooled, new grass spread across the ash.":
    record.methods.has("spade")?"You lifted the sea buckthorn by its roots. Over the following seasons, grass spread across the exposed soil.":
    "Sea buckthorn once shaded this patch. After the stand was cleared, grass grew back across the exposed soil.");
  textAt("#result-old-shrubs",String(record.shrubs));
  textAt("#result-new-shrubs",String(meadow.stand.filter(plant=>plant.visible).length));
  textAt("#result-old-soil",record.exposed+"%");
  textAt("#result-new-soil",meadow.plotDryCover+"%");
  textAt("#result-year","Year "+Math.round(record.year));
  document.querySelector(".workspace").classList.add("result-mode");
  for(const id of ["recovery-result","result-compare","result-year"])$("#"+id).hidden=false;
  world.resize();
  world.zoom(1/world.scale);
  // Frame the larger, uncleared stand once so both views use the same camera.
  meadow.setYear(record.year,true);
  world.showDirection(meadow.standCenter,FRONT);
  compareMeadow(false);
  $("#result-title").focus({preventScroll:true});
}

function leaveRecoveryResult(){
  if(!resultOpen)return;
  // Comparing the old stand is temporary. Resume exploration in the recovered meadow.
  compareMeadow(false);
  resultOpen=false;
  document.querySelector(".workspace").classList.remove("result-mode");
  for(const id of ["recovery-result","result-compare","result-year"])$("#"+id).hidden=true;
  canvas.setAttribute("aria-label",fieldCanvasLabel);
  meadow.holdGrazing=false;
  world.resize();
  updateStudyTools();refreshTip();
}
