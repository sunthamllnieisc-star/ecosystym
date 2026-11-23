"use strict";

// Simulation years are the source of truth for posture, transport, and establishment.
// The three offspring are born at years 24, 32 and 40 in MeadowSimulation.
const hoofBeats=[[0,0],[4.4,.8],[5.25,1.05],[12.5,3.2],[13.68,3.6],[14.8,4],[16.4,5.4],[18.6,8]];
function sampleBeats(value,input){
  let i=1;
  while(i<hoofBeats.length-1&&value>hoofBeats[i][input])i++;
  const a=hoofBeats[i-1],b=hoofBeats[i];
  const u=clamp((value-a[input])/(b[input]-a[input]),0,1);
  return THREE.MathUtils.lerp(a[1-input],b[1-input],u);
}
function timelineSeconds(year){
  if(year>=44)return 55.8+(year-44)/3.4;
  const leg=clamp(Math.floor((year-20)/8),0,2);
  return leg*18.6+sampleBeats(year-20-leg*8,1);
}
function timelineYear(seconds){
  if(seconds>=55.8)return Math.min(100,44+(seconds-55.8)*3.4);
  const leg=Math.min(2,Math.floor(seconds/18.6));
  return 20+leg*8+sampleBeats(seconds-leg*18.6,0);
}

function createPastureTimeline(world,meadow){
  const effects=new THREE.Group();world.planet.add(effects);
  const seed=createClaySeed();effects.add(seed);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(1,.04,7,48),
    new THREE.MeshBasicMaterial({color:0xffeda3,transparent:true,depthWrite:false}));
  effects.add(ring);
  const hooves=createHoofJourney(world,meadow,effects,seed,ring);
  const tag=$("#main-seed-label"),follow=$("#follow-herd");
  const target=new THREE.Vector3(0,.62,.785).normalize();
  const nextRotation=new THREE.Quaternion(),q=new THREE.Quaternion();
  const pin=new THREE.Vector3();
  let following=world.motion,last=null,lastSample=null,trackSeed=false,caption="";
  world.focusTurn=null;
  if(world.scale<1)world.zoom(1/world.scale);
  function setFollow(value){
    following=value;follow.setAttribute("aria-pressed",String(following));
    follow.textContent=following?"Following herd":"Follow herd";
  }
  setFollow(following);
  function sample(){
    const y=meadow.year;
    if(lastSample===y)return;
    lastSample=y;
    effects.visible=y<44;
    follow.hidden=y>HERD_LAST_YEAR;
    if(y<44){
      const leg=Math.min(2,Math.max(0,Math.floor((y-20)/8)));
      const t=sampleBeats(y-20-leg*8,1);
      const a=hooves.render(leg,t),species=a.cattle?"cow":"sheep";
      caption=t<4.4?"A "+species+" approaches fallen seed.":t<12.82?"The "+species+" carries a seed in hoof mud.":
        t<14.8?"A seed drops onto open ground.":"A new sea buckthorn takes root.";
      tag.textContent=t<4.4?"Fallen seed":t<13.66?"Seed on hoof":"Seed on soil";
      trackSeed=t>=2.4&&seed.visible;
      // Let the animal cross the frame while the globe follows its route.
      const progress=clamp((t-5.25)/7.25,0,1);
      target.set((meadowEase(progress)-.5)*.60,.59,.79).normalize();
      const position=a.position.clone().applyQuaternion(world.planet.quaternion);
      const direction=q.setFromUnitVectors(position,target);
      nextRotation.copy(direction).multiply(world.planet.quaternion);
    }else{
      if(y<=HERD_LAST_YEAR)hooves.after(y);
      trackSeed=false;
      caption=y>HERD_LAST_YEAR&&y<60?"The herd has left the meadow.":y<60?"Four shrubs share the meadow.":y<80?"Grass thins between the shrubs.":
        y<97?"Exposed soil spreads across the stand.":"Bare patches have joined across the stand.";
      const position=meadow.standCenter.clone().applyQuaternion(world.planet.quaternion);
      nextRotation.copy(q.setFromUnitVectors(position,FRONT)).multiply(world.planet.quaternion);
      world.grass.material.uniforms.hoofPrint.value.set(0,0,0);
    }
    meadow.pasture.shadows();
    textAt("#growth-stage",caption);
  }
  function frame(now){
    const dt=last===null||document.hidden?0:clamp(now-last,0,.18);last=now;
    if(meadow.playing&&!document.hidden&&!document.querySelector('dialog[open]')){
      const y=timelineYear(timelineSeconds(meadow.year)+dt);
      if(y>=100)meadow.playing=false;
      if(y!==meadow.year)meadow.setYear(y);
    }
    sample();
    if(following)world.planet.quaternion.slerp(nextRotation,world.motion?1-Math.exp(-6*dt):1);
    tag.hidden=true;
    if(trackSeed){
      seed.getWorldPosition(pin);
      const facing=pin.clone().normalize().dot(FRONT);
      pin.project(world.camera);
      if(facing>.05&&Math.abs(pin.x)<.96&&Math.abs(pin.y)<.94){
        tag.style.left=(50+50*pin.x)+"%";tag.style.top=(50-50*pin.y)+"%";
        tag.classList.toggle("flip",(1-pin.x)*world.canvas.clientWidth/2<145);tag.hidden=false;
      }
    }
  }
  function dispose(){
    world.planet.remove(effects);effects.remove(seed);
    const owned=new Set();effects.traverse(n=>{if(n.geometry)owned.add(n.geometry);if(n.material)owned.add(n.material);if(n.isInstancedMesh)n.dispose();});
    for(const a of owned)a.dispose();
    tag.hidden=true;world.grass.material.uniforms.hoofPrint.value.set(0,0,0);
    meadow.pasture.lastTime=world.clock.getElapsedTime();
  }
  return {frame,sample,dispose,setFollow,toggleFollow(){setFollow(!following);lastSample=null;}};
}
