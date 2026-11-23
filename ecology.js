"use strict";

const LAST_YEAR=100;
const HERD_LAST_YEAR=50;
const burnTiming={spread:24,embers:5,regrowth:12};

class MeadowSimulation {
  constructor(world) {
    this.world=world;
    this.grazed=new Float32Array(world.coverage.length);
    this.grazedAt=new Float32Array(world.coverage.length);
    this.nutrients=new Float32Array(world.coverage.length);
    this.mounds=new Float32Array(world.coverage.length);
    this.grazingHistory=new Map();
    this.dryRisk=Float32Array.from(world.coverage,(_,i)=>{
      const x=world.cellDirs[i*3],y=world.cellDirs[i*3+1],z=world.cellDirs[i*3+2];
      return clamp(.50+.23*Math.sin(4.7*x+2.2*z)*Math.cos(4.6*y-1.3*z)
        +.18*Math.sin(6.1*z+3.3*y)*Math.cos(3.8*x-1.2*y)+.10*Math.sin(11*x-7*y+4*z),0,1);
    });
    this.effects=new RestorationEffects(world);
    this.motion=new MeadowMotion(world);
    this.pasture=new Pasture(world,(animal,point)=>this.bite(animal,point));
    this.onTime=()=>{};
    this.onGraze=()=>{};
    this.onBite=()=>{};
    this.onTick=()=>{};
    this.reset();
    world.updateMeadow=time=>this.update(time);
  }

  reset() {
    this.fieldTimeline=null;
    this.year=0;
    this.holdGrazing=false;
    this.guidedDispersal=true;
    this.lastBiology=null;
    this.recovery=null;
    this.effects.reset();
    this.stand=[];
    this.standCenter=null;
    this.plotWeights=null;
    this.plotArea=0;
    this.plotDryCover=0;
    this.playbackLimit=LAST_YEAR;
    this.studyClimate=true;
    this.playing=false;
    this.preview=null;
    this.ateGrass=false;
    this.herdTemplate=null;
    this.grazed.fill(0);
    this.grazedAt.fill(0);
    this.grazingHistory.clear();
    this.dryCover=0;
    this.enrichedCover=0;
    this.highestMound=0;
    this.nutrients.fill(0);
    this.mounds.fill(0);
    this.motion.clear();
    this.pasture.clear();
  }

  shadePatch(point,radius,paint) {
    const {cellDirs}=this.world;
    const edge=Math.cos(radius),inner=Math.cos(radius*.46);
    for(let i=0;i<this.grazed.length;i++){
      const offset=i*3;
      const dot=cellDirs[offset]*point.x+cellDirs[offset+1]*point.y+cellDirs[offset+2]*point.z;
      if(dot<=edge)continue;
      const t=clamp((dot-edge)/(inner-edge),0,1);
      paint(i,meadowEase(t));
    }
  }

  pressureAt(index) {
    const age=this.year-this.grazedAt[index];
    const pressure=this.grazed[index];
    return age<0||!pressure?0:pressure*Math.exp(-.78*age);
  }

  // Birth years make the same field plot replayable in either direction.
  establishStand(parent,template) {
    if(this.stand.length)return;
    const origin=parent.userData.direction;
    const [east,north]=tangentFrame(origin);
    this.stand=[parent];
    parent.userData.fieldStand=true;
    for(const [born,angle,bearing,source] of [[24,1.95,.04,0],[32,1.02,1.13,1],[40,1.38,-.84,2]]){
      const site=onSurface(origin,east,north,angle,bearing);
      const child=this.world.plantSapling(template,site,born);
      Object.assign(child.userData,{fieldStand:true,source});
      child.visible=false;
      this.stand.push(child);
    }
    this.standCenter=this.stand.reduce((p,s)=>p.add(s.userData.direction),new THREE.Vector3()).normalize();
    const {cellDirs,rowWeights}=this.world;
    const c=this.standCenter;
    this.effects.sand.layer.quaternion.setFromUnitVectors(FRONT,c);
    const plotRadius=Math.max(...this.stand.map(shrub=>c.angleTo(shrub.userData.direction)))+.25;
    const plotEdge=Math.cos(plotRadius);
    this.plotWeights=Float32Array.from(this.world.coverage,(_,i)=>{
      const inside=c.x*cellDirs[i*3]+c.y*cellDirs[i*3+1]+c.z*cellDirs[i*3+2]>plotEdge;
      return inside?rowWeights[Math.floor(i/MAP_WIDTH)]:0;
    });
    this.plotArea=this.plotWeights.reduce((a,b)=>a+b,0);
    this.setYear(this.year);
  }

  accumulatedYears(shrub,canopyDelay) {
    const {born,pruned}=shrub.userData;
    let start=born,total=0;
    // A cut opens the canopy but leaves the soil and litter already accumulated.
    for(let i=pruned.length-1;i>=0;i--){
      const year=pruned[i];
      if(year>this.year)break;
      total+=Math.max(0,year-start-canopyDelay);
      start=year;
    }
    return total+Math.max(0,this.year-start-canopyDelay);
  }

  fillStress(stress) {
    for(let i=0;i<stress.length;i++)stress[i]=this.pressureAt(i);
    for(const shrub of this.world.saplings.children){
      const {age,direction}=shrub.userData;
      if(!shrub.visible||age===0)continue;
      const growth=clamp(age/3,0,1);
      const thicket=meadowEase(clamp((age-4)/17,0,1));
      this.shadePatch(direction,.20+growth*.15+thicket*.07,(i,shade)=>{
        stress[i]=Math.max(stress[i],shade*growth*(.82+.16*thicket));
      });
    }
  }

  updateDryGround(previous=null,remaining=0) {
    const {dryGround,dryPixels,dryTexture,rowWeights,totalWeight}=this.world;
    // One long dry spell, with extra pressure around long-established thickets and grazing sites.
    const drought=this.studyClimate?0:1.12*meadowEase(clamp((this.year-24)/76,0,1));
    for(let i=0;i<dryGround.length;i++)dryGround[i]=drought*(.40+.61*this.dryRisk[i]);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible)continue;
      const legacy=meadowEase(clamp(this.accumulatedYears(shrub,9)/58,0,1));
      if(!legacy)continue;
      const dryYears=shrub.userData.fieldStand?meadowEase(clamp((this.year-44)/56,0,1)):0;
      this.shadePatch(shrub.userData.direction,.25+.45*legacy+.55*dryYears,(i,shape)=>{
        dryGround[i]+=((this.studyClimate ? .85 : .40)+.58*dryYears)*legacy*shape*(.67+.55*this.dryRisk[i]);
      });
    }
    for(const [year,patches] of this.grazingHistory){
      const lapse=meadowEase(clamp((this.year-year)/11,0,1));
      if(!lapse)continue;
      for(const [index,pressure] of patches)dryGround[index]+=pressure*lapse;
    }
    let exposed=0,plotExposed=0;
    for(let i=0;i<dryGround.length;i++){
      let dry=meadowEase(clamp((dryGround[i]-.41)/.56,0,1));
      if(previous)dry=Math.max(dry,previous[i]*remaining);
      dryGround[i]=dry;
      dryPixels[i]=Math.round(dry*255);
      if(dry>=.70){
        exposed+=rowWeights[Math.floor(i/MAP_WIDTH)];
        if(this.plotWeights)plotExposed+=this.plotWeights[i];
      }
    }
    this.dryCover=Math.round(exposed/totalWeight*100);
    this.plotDryCover=this.plotArea?Math.round(100*plotExposed/this.plotArea):0;
    dryTexture.needsUpdate=true;
  }

  updateEnrichment() {
    const {nutrientPixels,nutrientTexture,rowWeights,totalWeight}=this.world;
    this.nutrients.fill(0);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible)continue;
      const {direction}=shrub.userData;
      const buildup=meadowEase(clamp(this.accumulatedYears(shrub,.30)/3.15,0,1));
      if(buildup===0)continue;
      this.shadePatch(direction,.21+buildup*.24,(i,shape)=>{
        this.nutrients[i]=Math.min(1,this.nutrients[i]+shape*buildup);
      });
    }
    let enriched=0;
    for(let i=0;i<this.nutrients.length;i++){
      nutrientPixels[i]=Math.round(this.nutrients[i]*255);
      if(this.nutrients[i]>=.40)enriched+=rowWeights[Math.floor(i/MAP_WIDTH)];
    }
    this.enrichedCover=Math.round(100*enriched/totalWeight);
    nutrientTexture.needsUpdate=true;
  }

  updateMounds() {
    this.mounds.fill(0);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible)continue;
      const years=this.accumulatedYears(shrub,7);
      const buildup=meadowEase(clamp(years/30,0,1));
      if(!buildup)continue;
      this.shadePatch(shrub.userData.direction,.235+buildup*.105,(i,shape)=>{
        const texture=.87+.13*this.dryRisk[i];
        this.mounds[i]=Math.min(1,this.mounds[i]+buildup*shape*texture);
      });
    }
    this.highestMound=this.world.setMounds(this.mounds);
  }

  refreshGrass() {
    this.fillStress(this.world.stress);
    this.world.stressTexture.needsUpdate=true;
    this.updateDryGround();
    this.updateEnrichment();
  }

  setYear(year,beforeClearing=false) {
    this.year=clamp(year,0,LAST_YEAR);
    this.pasture.layer.visible=this.year<=HERD_LAST_YEAR;
    this.pasture.shadows();
    for(const shrub of this.world.saplings.children){
      const {born,pruned}=shrub.userData;
      const removedAt=shrub.userData.removedAt??Infinity;
      shrub.visible=this.year>=born&&(this.year<removedAt||beforeClearing&&this.year===removedAt);
      if(!shrub.visible)continue;
      const origin=pruned.find(time=>time<=this.year)??born;
      growSeaBuckthorn(shrub,this.year-origin);
      if(shrub.userData.source!==undefined&&this.year-born<4){
        const size=.065+.935*meadowEase(clamp((this.year-born)/4,0,1));
        shrub.scale.multiplyScalar(size);
      }
    }
    this.refreshGrass();
    this.updateMounds();
    this.fieldTimeline?.sample();
    this.onTime();
  }

  togglePlayback() {
    if(this.playing){
      this.playing=false;
      this.preview=null;
    }else{
      if(this.year>=this.playbackLimit)this.setYear(this.fieldTimeline?20:0);
      this.playing=true;
      this.lastFrame=this.world.clock.getElapsedTime();
    }
    this.onTime();
  }

  scrub(year) {
    this.playing=false;
    this.preview=null;
    this.setYear(year);
  }

  previewYear(year,duration) {
    if(!this.world.motion||this.year===year){this.scrub(year);return;}
    this.playing=true;
    this.preview={from:this.year,to:year,start:this.world.clock.getElapsedTime(),duration};
    this.onTime();
  }

  update(time) {
    let wind=clamp((this.year-52)/22,0,1)*clamp(this.plotDryCover/28,0,1);
    if(this.recovery?.mode==="burn")wind*=1-meadowEase(clamp((time-this.recovery.start)/5,0,1));
    const living=this.stand.reduce((count,plant)=>count+Number(plant.visible),0);
    this.effects.wind(time,wind,this.stand.length?living/this.stand.length:0);
    if(this.fieldTimeline){this.fieldTimeline.frame(time);return;}
    this.motion.update(time);
    if(this.preview){
      const {from,to,start,duration}=this.preview;
      const progress=clamp((time-start)/duration,0,1);
      if(time-start>=duration+.65){
        this.playing=false;
        this.preview=null;
        this.setYear(to);
      }else if(progress<1||this.year!==to){
        this.setYear(from+(to-from)*meadowEase(progress));
      }
    }else if(this.playing&&time-this.lastFrame>=.038){
      const rate=.50+5.20*meadowEase(clamp((this.year-5)/8,0,1));
      const next=Math.min(this.playbackLimit,this.year+(time-this.lastFrame)*rate);
      this.lastFrame=time;
      if(next===this.playbackLimit)this.playing=false;
      this.setYear(next);
    }
    if(!this.holdGrazing){
      this.pasture.update(time);
      const dt=this.lastBiology===null?0:time-this.lastBiology;
      if(this.lastBiology===null||dt>=.18){
        this.lastBiology=time;
        if(this.pasture.layer.visible&&!this.guidedDispersal&&this.herdTemplate)this.carrySeeds();
        if(this.ateGrass&&this.pasture.animals.length<=2&&!this.recovery){
          const remaining=Math.exp(-.48*Math.min(dt,.5));
          for(let i=0;i<this.grazed.length;i++)this.grazed[i]*=remaining;
          this.fillStress(this.world.stress);
          this.world.stressTexture.needsUpdate=true;
        }
      }
    }else{
      this.lastBiology=time;
      this.pasture.lastTime=time;
    }
    if(this.recovery)this.restoreGround(time);
    this.onTick(time);
  }

  shrubNear(point,radius=.24) {
    if(!point)return null;
    let nearest=null,score=Math.cos(radius);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible)continue;
      const dot=shrub.userData.direction.dot(point);
      if(dot>score){nearest=shrub;score=dot;}
    }
    return nearest;
  }

  releaseAnimal(point,species,template) {
    this.herdTemplate=template;
    if(!this.pasture.animals.length)this.ateGrass=false;
    this.pasture.release(point,species);
  }

  bite(animal,point) {
    const radius=animal.cattle?.122:.094;
    const period=Math.floor(this.year);
    let patches=this.grazingHistory.get(period);
    let fed=false,peak=0,peakIndex=-1;
    this.shadePatch(point,radius,(i,shape)=>{
      if(this.world.coverage[i]<0)return;
      const available=1-meadowEase(clamp((this.world.dryGround[i]-.55)/.33,0,1));
      const previous=this.pressureAt(i);
      const bite=Math.min(.98-previous,shape*available*(animal.cattle?.35:.26));
      if(bite<=.002)return;
      this.grazed[i]=previous+bite;
      this.grazedAt[i]=this.year;
      if(this.grazed[i]>peak){peak=this.grazed[i];peakIndex=i;}
      fed=true;
    });
    if(!fed)return;
    if(!patches){patches=new Map();this.grazingHistory.set(period,patches);}
    this.shadePatch(point,radius*1.67,(i,shape)=>{
      if(this.world.coverage[i]<0)return;
      patches.set(i,Math.min(.55,(patches.get(i)??0)+shape*.027));
    });
    const previousDry=this.dryCover;
    this.refreshGrass();
    if(previousDry!==this.dryCover)this.onTime();
    if(!this.ateGrass){
      this.ateGrass=true;
      this.onGraze("The herd is nibbling the grass where it stops to feed.");
    }
    this.onBite(peakIndex,peak);
  }

  carrySeeds(){
    for(const animal of this.pasture.animals){
      if(animal.eating)continue;
      const point=animal.position,plant=this.shrubNear(point,.39);
      if(!animal.pickupSite){
        if(plant?.userData.age>=3){
          animal.pickupSite=point.clone();
          animal.hoofSeed.visible=true;
        }
      }else if(!plant&&animal.pickupSite.dot(point)<Math.cos(.46)&&this.world.grassAt(point)){
        animal.pickupSite=null;
        animal.hoofSeed.visible=false;
        if(this.world.saplings.children.length>=18)continue;
        this.world.plantSapling(this.herdTemplate,point.clone(),this.year);
        this.onGraze("A seed from a muddy hoof has settled in a new patch.");
      }
    }
  }

  uproot(shrub,neighbors=[],mode="spade",origin=shrub?.userData.direction) {
    if(!shrub?.visible||this.recovery)return false;
    this.world.shrubHighlight.clear();
    this.playing=false;
    this.preview=null;
    const {stress,dryGround}=this.world;
    const targets=[shrub,...neighbors.filter(other=>other!==shrub&&other.visible)];
    this.effects.begin(mode,origin);
    const burn=mode==="burn";
    const lifts=targets.map((plant,i)=>{
      plant.userData.removedAt=this.year;
      return {plant,scale:plant.scale.clone(),distance:angleBetween(origin,plant.userData.direction)/Math.PI,
        delay:!burn&&this.world.motion?i*.36:0,animate:!burn&&this.world.motion?this.motion.loosenRoots(plant):null};
    });
    this.recovery={start:this.world.clock.getElapsedTime(),mode,origin:origin.clone(),lifts,stress:stress.slice(),dry:dryGround.slice(),
      nutrients:this.nutrients.slice(),mounds:this.mounds.slice(),liftTime:burn?burnTiming.spread:(this.world.motion?2.4:.4)};
    return true;
  }

  restoreGround(time) {
    const r=this.recovery,{world}=this;
    const elapsed=time-r.start;
    const end=r.liftTime+r.lifts[r.lifts.length-1].delay+(r.mode==="burn"?burnTiming.embers:0);
    this.effects.work(r.mode,r.origin,elapsed,r.liftTime);
    for(const lift of r.lifts){
      if(elapsed<lift.delay||!lift.plant.visible)continue;
      const progress=r.mode==="burn"?clamp((world.fireUniforms.burnFront.value-lift.distance)/.17,0,1):clamp((elapsed-lift.delay)/r.liftTime,0,1);
      if(r.mode==="burn")lift.plant.scale.copy(lift.scale).multiplyScalar(1-.97*meadowEase(progress));
      else lift.animate?.(progress);
      if(progress===1){lift.plant.visible=false;lift.plant.scale.copy(lift.scale);lift.plant.userData.age=-1;}
    }
    if(elapsed<end)return;
    const recoveryTime=r.mode==="burn"?burnTiming.regrowth:this.stand.some(plant=>plant.visible)?3.2:7;
    const t=clamp((elapsed-end)/recoveryTime,0,1);
    this.effects.regrow(t);
    const shade=1-meadowEase(t),soil=1-meadowEase(t*t);
    this.fillStress(world.stress);
    this.updateDryGround(r.dry,shade);
    this.updateEnrichment();
    for(let i=0;i<this.mounds.length;i++){
      world.stress[i]=Math.max(world.stress[i],r.stress[i]*shade);
      this.nutrients[i]=Math.max(this.nutrients[i],r.nutrients[i]*soil);
      world.nutrientPixels[i]=Math.round(this.nutrients[i]*255);
      this.mounds[i]=r.mounds[i]*soil;
    }
    world.stressTexture.needsUpdate=true;
    this.highestMound=world.setMounds(this.mounds);
    if(t===1){this.effects.finish();this.recovery=null;this.setYear(this.year);}
  }

  prune(shrub,finish) {
    if(!(shrub?.userData.age>.45))return false;
    this.playing=false;
    this.preview=null;
    this.onTime();
    const start=shrub.userData.age;
    const clippings=this.motion.clippings(shrub);
    shrub.userData.pruned.push(this.year);
    shrub.userData.pruned.sort((a,b)=>b-a);
    this.motion.run("Pruning the shrub",1.28,t=>{
      clippings(t);
      growSeaBuckthorn(shrub,start*(1-meadowEase(clamp(t*1.55,0,1))));
      this.refreshGrass();
      this.onTime();
    },finish);
    return true;
  }
}
