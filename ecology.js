"use strict";

const GRAZE_ANGLE=.34;
const LAST_YEAR=100;

class MeadowSimulation {
  constructor(world) {
    this.world=world;
    this.grazed=new Float32Array(world.coverage.length);
    this.grazedAt=new Float32Array(world.coverage.length);
    this.nutrients=new Float32Array(world.coverage.length);
    this.grazingHistory=new Map();
    this.dryRisk=Float32Array.from(world.coverage,(_,i)=>{
      const x=world.cellDirs[i*3],y=world.cellDirs[i*3+1],z=world.cellDirs[i*3+2];
      return clamp(.50+.23*Math.sin(4.7*x+2.2*z)*Math.cos(4.6*y-1.3*z)
        +.18*Math.sin(6.1*z+3.3*y)*Math.cos(3.8*x-1.2*y)+.10*Math.sin(11*x-7*y+4*z),0,1);
    });
    this.motion=new MeadowMotion(world);
    this.pasture=new Pasture(world,(animal,point)=>this.bite(animal,point));
    this.onTime=()=>{};
    this.onGraze=()=>{};
    this.reset();
    world.updateMeadow=time=>this.update(time);
  }

  reset() {
    this.year=0;
    this.playing=false;
    this.preview=null;
    this.ateGrass=false;
    this.herdTemplate=null;
    this.grazed.fill(0);
    this.grazedAt.fill(0);
    this.grazingHistory.clear();
    this.dryCover=0;
    this.enrichedCover=0;
    this.nutrients.fill(0);
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

  fillStress(stress) {
    for(let i=0;i<stress.length;i++)stress[i]=this.pressureAt(i);
    for(const shrub of this.world.saplings.children){
      const {age,direction}=shrub.userData;
      if(!shrub.visible||age===0)continue;
      const growth=clamp(age/3,0,1);
      this.shadePatch(direction,.20+growth*.15,(i,shade)=>{
        stress[i]=Math.max(stress[i],shade*growth*.86);
      });
    }
  }

  updateDryGround() {
    const {dryGround,dryPixels,dryTexture,rowWeights,totalWeight}=this.world;
    // One long dry spell, with extra pressure around long-established thickets and grazing sites.
    const drought=1.12*meadowEase(clamp((this.year-24)/76,0,1));
    for(let i=0;i<dryGround.length;i++)dryGround[i]=drought*(.40+.61*this.dryRisk[i]);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible||shrub.userData.age<9)continue;
      const legacy=meadowEase(clamp((shrub.userData.age-9)/58,0,1));
      this.shadePatch(shrub.userData.direction,.25+.45*legacy,(i,shape)=>{
        dryGround[i]+=.40*legacy*shape*(.67+.55*this.dryRisk[i]);
      });
    }
    for(const [year,patches] of this.grazingHistory){
      const lapse=meadowEase(clamp((this.year-year)/11,0,1));
      if(!lapse)continue;
      for(const [index,pressure] of patches)dryGround[index]+=pressure*lapse;
    }
    let exposed=0;
    for(let i=0;i<dryGround.length;i++){
      const dry=meadowEase(clamp((dryGround[i]-.41)/.56,0,1));
      dryGround[i]=dry;
      dryPixels[i]=Math.round(dry*255);
      if(dry>=.70)exposed+=rowWeights[Math.floor(i/MAP_WIDTH)];
    }
    this.dryCover=Math.round(exposed/totalWeight*100);
    dryTexture.needsUpdate=true;
  }

  updateEnrichment() {
    const {nutrientPixels,nutrientTexture,rowWeights,totalWeight}=this.world;
    this.nutrients.fill(0);
    for(const shrub of this.world.saplings.children){
      if(!shrub.visible)continue;
      const {born,direction}=shrub.userData;
      const buildup=meadowEase(clamp((this.year-born-.30)/3.15,0,1));
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

  refreshGrass() {
    this.fillStress(this.world.stress);
    this.world.stressTexture.needsUpdate=true;
    this.updateDryGround();
    this.updateEnrichment();
  }

  setYear(year) {
    this.year=clamp(year,0,LAST_YEAR);
    for(const shrub of this.world.saplings.children){
      const {born,pruned}=shrub.userData;
      shrub.visible=this.year>=born;
      if(!shrub.visible)continue;
      const origin=pruned.find(time=>time<=this.year)??born;
      growSeaBuckthorn(shrub,this.year-origin);
    }
    this.refreshGrass();
    this.onTime();
  }

  togglePlayback() {
    if(this.playing){
      this.playing=false;
      this.preview=null;
    }else{
      if(this.year===LAST_YEAR)this.setYear(0);
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

  previewYear(year) {
    if(!this.world.motion||this.year===year){this.scrub(year);return;}
    this.playing=true;
    this.preview={from:this.year,to:year,start:this.world.clock.getElapsedTime()};
    this.onTime();
  }

  update(time) {
    this.motion.update(time);
    if(this.preview){
      const {from,to,start}=this.preview;
      const progress=clamp((time-start)/1.15,0,1);
      if(progress===1){this.playing=false;this.preview=null;}
      this.setYear(from+(to-from)*meadowEase(progress));
    }else if(this.playing&&time-this.lastFrame>=.038){
      const rate=.50+5.20*meadowEase(clamp((this.year-5)/8,0,1));
      const next=Math.min(LAST_YEAR,this.year+(time-this.lastFrame)*rate);
      this.lastFrame=time;
      if(next===LAST_YEAR)this.playing=false;
      this.setYear(next);
    }
    this.pasture.update(time);
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

  releaseHerd(point,template) {
    this.herdTemplate=template;
    this.ateGrass=false;
    this.pasture.release(point);
  }

  bite(animal,point) {
    const radius=animal.cattle?.122:.094;
    const period=Math.floor(this.year);
    let patches=this.grazingHistory.get(period);
    let fed=false;
    this.shadePatch(point,radius,(i,shape)=>{
      const available=1-meadowEase(clamp((this.world.dryGround[i]-.55)/.33,0,1));
      const previous=this.pressureAt(i);
      const bite=Math.min(.98-previous,shape*available*(animal.cattle?.35:.26));
      if(bite<=.002)return;
      this.grazed[i]=previous+bite;
      this.grazedAt[i]=this.year;
      fed=true;
    });
    if(!fed)return;
    if(!patches){patches=new Map();this.grazingHistory.set(period,patches);}
    this.shadePatch(point,radius*1.67,(i,shape)=>{
      patches.set(i,Math.min(.55,(patches.get(i)??0)+shape*.027));
    });
    const previousDry=this.dryCover;
    this.refreshGrass();
    if(previousDry!==this.dryCover)this.onTime();
    if(!this.ateGrass){
      this.ateGrass=true;
      this.onGraze("The herd is nibbling the grass where it stops to feed.");
    }
    const shrub=this.shrubNear(point,.39);
    if(shrub?.userData.age>=3){
      animal.seed=true;
    }else if(animal.seed&&!shrub&&this.world.saplings.children.length<9){
      animal.seed=false;
      this.world.plantSapling(this.herdTemplate,point,this.year);
      this.onGraze("A sea buckthorn seed took root where an animal grazed.");
    }
  }

  prune(shrub) {
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
    });
    return true;
  }
}
