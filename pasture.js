"use strict";

// A four-beat walk. During stance the sole travels back under the moving body;
// during swing it clears the grass. Both joints are solved in the sagittal plane.
function poseGrazerFeet(rig,distance,weight=1){
  const cow=rig.cattle??rig.root.userData.cattle;
  const upper=cow?.265:.17, lower=cow?.245:.16;
  const stride=(upper+lower)*1.36;
  const phase=distance/(rig.root.scale.x*stride);
  const offsets=[0,.22,.5,.72],stance=.62;
  rig.legs.forEach((leg,i)=>{
    const t=(phase+offsets[i])%1;
    const swing=clamp((t-stance)/(1-stance),0,1);
    const step=(t<stance?.5-t/stance:meadowEase(swing)-.5)*stride*stance*weight;
    const lift=(upper+lower)*.20*Math.sin(swing*Math.PI)*weight;
    const down=upper+lower-lift;
    const reach=Math.min(upper+lower-.00001,Math.hypot(down,step));
    const bend=(i%2?1:-1)*Math.acos(clamp((reach*reach-upper*upper-lower*lower)/(2*upper*lower),-1,1));
    leg.rotation.x=-Math.atan2(step,down)-Math.atan2(lower*Math.sin(bend),upper+lower*Math.cos(bend));
    if(rig.kneeJoints)rig.kneeJoints[i].rotation.x=bend;
  });
}

class Pasture {
  constructor(world,onBite) {
    this.world=world;
    this.onBite=onBite;
    this.layer=new THREE.Group();
    this.previewLayer=new THREE.Group();
    this.previewLayer.visible=false;
    world.planet.add(this.layer,this.previewLayer);
    this.animals=[];
  }

  buildAnimal(cattle,index,parent=this.layer) {
    const rig=createClayGrazer(cattle?"cow":"sheep",index);
    parent.add(rig.root);
    return {...rig,cattle,variant:index,bearing:index*TURN/5,random:randomSource(Math.imul(index+3,1597334677)),
      position:new THREE.Vector3(),toe:new THREE.Vector3(),right:new THREE.Vector3(),
      forward:new THREE.Vector3(),basis:new THREE.Matrix4(),pickupSite:null};
  }

  showPreview(point,species) {
    this.previewLayer.visible=!!point;
    if(!point)return;
    this.world.lightSaplings();
    if(!this.previewLayer.children.length){
      const materials=new Map();
      this.previewAnimals={cow:this.buildAnimal(true,0,this.previewLayer),sheep:this.buildAnimal(false,1,this.previewLayer)};
      this.previewLayer.traverse(child=>{
        if(!child.isMesh)return;
        if(!materials.has(child.material)){
          const material=child.material.clone();
          material.transparent=true;
          material.opacity=.62;
          material.depthWrite=false;
          materials.set(child.material,material);
        }
        child.material=materials.get(child.material);
      });
    }
    const [east]=tangentFrame(point);
    for(const [kind,animal] of Object.entries(this.previewAnimals)){
      animal.root.visible=kind===species;
      if(!animal.root.visible)continue;
      animal.from=animal.to=point;
      animal.forward.copy(east);
      animal.elapsed=0;
      animal.duration=1;
      this.pose(animal);
    }
  }

  wayPoint(animal) {
    animal.bearing+=.64+(animal.random()-.5)*.42;
    const point=onSurface(animal.center,animal.east,animal.north,.47+animal.random()*.54,animal.bearing);
    if(this.world.grassAt(point))return point;
    const closer=onSurface(animal.center,animal.east,animal.north,.42,animal.bearing+.37);
    return this.world.grassAt(closer)?closer:point;
  }

  startWalk(animal,from) {
    animal.from=from;
    animal.to=this.wayPoint(animal);
    if(animal.from.dot(animal.to)>.963){
      animal.bearing+=.43;
      animal.to=onSurface(animal.center,animal.east,animal.north,.84,animal.bearing);
    }
    animal.forward.copy(animal.to).sub(animal.from);
    animal.pathLength=angleBetween(animal.from,animal.to)*this.world.radiusAt(from);
    animal.duration=.65+animal.pathLength/(animal.cattle?1.04:.85);
    animal.elapsed=0;
    animal.eating=false;
  }

  release(point,species) {
    this.world.lightSaplings();
    const animal=this.buildAnimal(species==="cow",this.animals.length);
    animal.hoofSeed=createClaySeed();
    animal.hoofSeed.scale.setScalar(.43);
    animal.hoofSeed.rotation.z=-.78;
    animal.hoofSeed.visible=false;
    animal.hoofSocket.add(animal.hoofSeed);
    animal.center=point.clone();
    [animal.east,animal.north]=tangentFrame(animal.center);
    this.startWalk(animal,animal.center);
    animal.to=animal.center;
    animal.eating=true;
    animal.bites=0;
    animal.duration=2.8;
    if(!this.animals.length)this.lastTime=this.world.clock.getElapsedTime();
    this.animals.push(animal);
    this.pose(animal);
    this.shadows();
  }

  clear() {
    this.showPreview(null);
    this.layer.visible=true;
    this.layer.clear();
    this.animals=[];
    this.shadows();
  }

  shadows(){
    const {hoofCenters,herdAxes,grazerCount}=this.world.herdShade;
    grazerCount.value=this.layer.visible?Math.min(hoofCenters.value.length,this.animals.length):0;
    for(let i=0;i<grazerCount.value;i++){
      const a=this.animals[i];
      hoofCenters.value[i].set(a.position.x,a.position.y,a.position.z,a.cattle?1:2.25);
      herdAxes.value[i].copy(a.forward).normalize();
    }
  }

  update(now,feed=true,performers=[]) {
    if(!this.layer.visible||!this.animals.length){this.lastTime=now;return;}
    const dt=clamp(now-this.lastTime,0,.18);
    this.lastTime=now;
    for(const animal of this.animals){
      if(performers.includes(animal))continue;
      animal.elapsed+=dt;
      if(animal.elapsed>=animal.duration){
        if(animal.eating)this.startWalk(animal,animal.to);
        else{
          animal.eating=true;
          animal.elapsed=0;
          animal.bites=0;
          animal.duration=2.4+animal.random()*.7;
        }
      }
      this.pose(animal);
      if(animal.eating&&animal.elapsed>=.59+animal.bites*.41){
        const reach=(animal.cattle?.107:.091)+(animal.bites%3-1)*.016;
        const mouth=animal.position.clone().addScaledVector(animal.toe,reach)
          .addScaledVector(animal.right,(animal.bites%2-.5)*.034).normalize();
        if(feed)this.onBite(animal,mouth);
        animal.bites++;
      }
    }
    this.shadows();
  }

  pose(animal) {
    const {world}=this;
    const t=clamp(animal.elapsed/animal.duration,0,1);
    const {position,toe,right,root}=animal;
    position.copy(animal.from).lerp(animal.to,animal.eating?1:meadowEase(t)).normalize();
    toe.copy(animal.forward).addScaledVector(position,-animal.forward.dot(position)).normalize();
    right.crossVectors(position,toe);
    root.quaternion.setFromRotationMatrix(animal.basis.makeBasis(right,position,toe));
    const distance=animal.eating||!animal.pathLength?0:animal.pathLength*meadowEase(t);
    const walk=world.motion&&!animal.eating?Math.min(1,t*12,(1-t)*12):0;
    const step=walk*Math.sin(distance*(animal.cattle?6.8:10));
    root.position.copy(position).multiplyScalar(world.radiusAt(position)+.009+.009*Math.abs(step));
    poseGrazerFeet(animal,distance,walk);
    const down=animal.eating?meadowEase(clamp(animal.elapsed/.52,0,1))*meadowEase(clamp((1-t)*7,0,1)):0;
    const chew=world.motion?Math.sin(animal.elapsed*23)*down:0;
    animal.head.rotation.x=down*(1.18+chew*.032)+step*.061;
    animal.jaw.scale.y=1+chew*.13;
    animal.tail.rotation.z=world.motion?.16*Math.sin(animal.elapsed*3+animal.variant):0;
    animal.ears.forEach((ear,i)=>{ear.rotation.x=world.motion?.085*Math.sin(animal.elapsed*4+i*2+animal.variant):0;});
    animal.mouthful.visible=animal.eating&&animal.bites>0;
    if(animal.mouthful.visible){
      const nibble=clamp((animal.elapsed-.59-(animal.bites-1)*.41)/.41,0,1);
      animal.mouthful.scale.setScalar(1-.77*nibble);
    }
  }
}
