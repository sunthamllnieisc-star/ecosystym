"use strict";

class Pasture {
  constructor(world,onBite) {
    this.world=world;
    this.onBite=onBite;
    this.layer=new THREE.Group();
    world.planet.add(this.layer);
    this.animals=[];
    this.geometry=new THREE.SphereGeometry(1,14,9);
    this.materials=Object.fromEntries(Object.entries({wool:0xfff2d8,muzzle:0x635148,
      russet:0xa35a37,white:0xffedd0,horn:0xe4c69a,nose:0xd49383,eye:0x2c221e
    }).map(([name,color])=>[name,new THREE.MeshStandardMaterial({color,roughness:.81})]));
  }

  part(group,material,x,y,z,sx,sy,sz) {
    const piece=new THREE.Mesh(this.geometry,this.materials[material]);
    piece.position.set(x,y,z);
    piece.scale.set(sx,sy,sz);
    group.add(piece);
    return piece;
  }

  buildAnimal(cattle,index) {
    const root=new THREE.Group(), head=new THREE.Group(), legs=[];
    const bulk=cattle?1.2:1;
    const skin=cattle?(index===0?"russet":"white"):"wool";
    for(const x of [-.15,.15])for(const z of [-.22,.21]){
      const pivot=new THREE.Group();
      pivot.position.set(x*bulk,.34*bulk,z*bulk);
      this.part(pivot,"muzzle",0,-.145*bulk,0,.055*bulk,.18*bulk,.059*bulk);
      root.add(pivot);
      legs.push(pivot);
    }
    this.part(root,skin,0,.49*bulk,-.025,.28*bulk,.24*bulk,.415*bulk);
    if(cattle){
      this.part(root,index===0?"white":"russet",-.128,.56,-.22,.21,.19,.204);
      this.part(root,"russet",.10,.57,.15,.20,.185,.205);
      this.part(root,"muzzle",0,.459,-.49,.052,.063,.104);
    }else{
      for(const side of [-1,1])for(const z of [-.20,.04,.20]){
        this.part(root,"wool",side*.157,.53,z,.147,.155,.159);
      }
    }
    head.position.set(0,.53*bulk,.225*bulk);
    this.part(head,cattle?"russet":"muzzle",0,.066,.16*bulk,.142*bulk,.163*bulk,.156*bulk);
    const jaw=this.part(head,cattle?"nose":"muzzle",0,-.009,.27*bulk,.143*bulk,.079*bulk,.098*bulk);
    for(const side of [-1,1]){
      const ear=this.part(head,cattle?"russet":"muzzle",side*.151*bulk,.135,.129,.106,.048,.054);
      ear.rotation.z=-side*.36;
      this.part(head,"eye",side*.104*bulk,.105,.283*bulk,.027,.027,.018);
      if(cattle){
        const horn=this.part(head,"horn",side*.13,.22,.124,.04,.115,.045);
        horn.rotation.z=-side*.44;
      }
    }
    if(!cattle)this.part(head,"wool",0,.202,.126,.13,.078,.136);
    root.add(head);
    root.scale.setScalar(cattle?1.32:1.20);
    this.layer.add(root);
    return {root,head,legs,jaw,cattle,bearing:index*TURN/5,random:randomSource(Math.imul(index+3,1597334677)),
      position:new THREE.Vector3(),toe:new THREE.Vector3(),right:new THREE.Vector3(),
      forward:new THREE.Vector3(),basis:new THREE.Matrix4(),seed:false};
  }

  wayPoint(animal) {
    const radius=.47+animal.random()*.54;
    animal.bearing+=.64+(animal.random()-.5)*.42;
    return onSurface(this.center,this.east,this.north,radius,animal.bearing);
  }

  startWalk(animal,from) {
    animal.from=from;
    animal.to=this.wayPoint(animal);
    if(animal.from.dot(animal.to)>.963){
      animal.bearing+=.43;
      animal.to=onSurface(this.center,this.east,this.north,.84,animal.bearing);
    }
    animal.forward.copy(animal.to).sub(animal.from);
    animal.duration=.65+angleBetween(animal.from,animal.to)*2.65;
    animal.elapsed=0;
    animal.eating=false;
  }

  release(point) {
    this.clear();
    this.center=point.clone();
    [this.east,this.north]=tangentFrame(this.center);
    this.world.lightSaplings();
    this.animals=Array.from({length:5},(_,i)=>{
      const animal=this.buildAnimal(i<2,i);
      this.startWalk(animal,onSurface(this.center,this.east,this.north,.24+(i%2)*.055,animal.bearing));
      return animal;
    });
    this.lastTime=this.world.clock.getElapsedTime();
    this.update(this.lastTime);
  }

  clear() {
    this.layer.clear();
    this.animals=[];
  }

  update(now) {
    if(!this.animals.length)return;
    const dt=clamp(now-this.lastTime,0,.18);
    this.lastTime=now;
    for(const animal of this.animals){
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
        this.onBite(animal,mouth);
        animal.bites++;
      }
    }
  }

  pose(animal) {
    const {world}=this;
    const t=clamp(animal.elapsed/animal.duration,0,1);
    const {position,toe,right,root}=animal;
    position.copy(animal.from).lerp(animal.to,animal.eating?1:meadowEase(t)).normalize();
    toe.copy(animal.forward).addScaledVector(position,-animal.forward.dot(position)).normalize();
    right.crossVectors(position,toe);
    root.quaternion.setFromRotationMatrix(animal.basis.makeBasis(right,position,toe));
    const step=world.motion&&!animal.eating?Math.sin(t*22*Math.PI):0;
    root.position.copy(position).multiplyScalar(world.radiusAt(position)+.028+Math.abs(step)*.043);
    animal.legs.forEach((leg,i)=>leg.rotation.x=step*(i===0||i===3?.56:-.56));
    const down=animal.eating?meadowEase(clamp(animal.elapsed/.52,0,1))*meadowEase(clamp((1-t)*7,0,1)):0;
    const chew=world.motion?Math.sin(animal.elapsed*23)*down:0;
    animal.head.rotation.x=down*(1.05+chew*.042)+step*.061;
    animal.jaw.scale.y=(animal.cattle?.095:.079)*(1+chew*.17);
  }
}
