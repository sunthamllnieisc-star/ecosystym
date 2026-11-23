"use strict";

const meadowEase=t=>t*t*(3-2*t);

class MeadowMotion {
  constructor(world) {
    this.world=world;
    this.layer=new THREE.Group();
    world.planet.add(this.layer);
    this.activity=null;
    this.onChange=()=>{};
    this.ellipsoid=new THREE.SphereGeometry(1,16,10);
    this.leaf=new THREE.MeshStandardMaterial({color:0xaaca76,roughness:.84});
    this.rootFiber=new THREE.CylinderGeometry(.018,.047,1,6);
    this.rootColor=new THREE.MeshStandardMaterial({color:0x977444,roughness:.95});
    this.soilColor=new THREE.MeshStandardMaterial({color:0x806341,roughness:1});
  }

  run(label,duration,frame,finish=()=>{}) {
    if(!this.world.motion){frame(1);finish();return;}
    this.activity={label,duration,frame,finish,start:this.world.clock.getElapsedTime()};
    this.onChange();
  }

  update(now) {
    const task=this.activity;
    if(!task)return;
    const progress=clamp((now-task.start)/task.duration,0,1);
    task.frame(progress);
    if(progress===1){
      task.finish();
      this.clear();
      this.onChange();
    }
  }

  clear() {
    for(const object of this.layer.children){
      if(object.isInstancedMesh)object.dispose();
    }
    this.layer.clear();
    this.activity=null;
  }

  loosenRoots(shrub) {
    const base=shrub.position.clone(),rotation=shrub.quaternion.clone(),scale=shrub.scale.x;
    const upward=shrub.userData.direction;
    const side=new THREE.Vector3(1,0,0).applyQuaternion(this.world.planet.quaternion.clone().invert());
    side.addScaledVector(upward,-side.dot(upward)).normalize();
    const soil=new THREE.Group(),roots=new THREE.Group(),random=randomSource(1126);
    this.layer.add(soil,roots);
    soil.position.copy(base);soil.quaternion.copy(rotation);
    for(let i=0;i<11;i++){
      const a=i*TURN/11,r=.06+.24*random(),l=.32+.39*random();
      const top=new THREE.Vector3(r*Math.cos(a),.045,r*Math.sin(a));
      const end=top.clone().add(new THREE.Vector3(.25*Math.cos(a),-l,.25*Math.sin(a)));
      const fiber=new THREE.Mesh(this.rootFiber,this.rootColor);
      fiber.position.lerpVectors(top,end,.5);fiber.scale.y=top.distanceTo(end);
      fiber.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(top).normalize());roots.add(fiber);
    }
    const crumbs=Array.from({length:14},()=>{
      const mesh=new THREE.Mesh(this.ellipsoid,this.soilColor),a=random()*TURN;
      soil.add(mesh);
      return {mesh,angle:a,r:.24+random()*.57,hop:.19+random()*.39,size:.038+random()*.05,delay:random()*.18};
    });
    return t=>{
      const lift=meadowEase(clamp((t-.14)/.45,0,1)),out=meadowEase(clamp((t-.77)/.23,0,1));
      shrub.position.copy(base).addScaledVector(upward,1.18*lift+.45*out).addScaledVector(side,.64*lift+.76*out);
      shrub.quaternion.copy(rotation);shrub.rotateZ(-.18*lift+.07*Math.sin(16*t)*(1-lift));
      shrub.scale.setScalar(scale*(1-out));
      roots.position.copy(shrub.position);roots.quaternion.copy(shrub.quaternion);roots.scale.setScalar(1-out);
      for(const {mesh,angle,r,hop,size,delay} of crumbs){
        const u=clamp((t-.30-delay)/.51,0,1);
        mesh.visible=u>0&&u<1;
        mesh.position.set(Math.cos(angle)*r*(.25+u),.035+4*u*(1-u)*hop,Math.sin(angle)*r*(.25+u));
        mesh.scale.setScalar(size*(1-u*.86));
      }
      if(t===1){
        shrub.visible=false;shrub.position.copy(base);shrub.quaternion.copy(rotation);shrub.scale.setScalar(scale);
        this.layer.remove(roots,soil);
      }
    };
  }

  clippings(shrub) {
    if(!this.world.motion)return ()=>{};
    const count=24;
    const leaves=new THREE.InstancedMesh(this.ellipsoid,this.leaf,count);
    leaves.frustumCulled=false;
    leaves.position.copy(shrub.position);
    leaves.quaternion.copy(shrub.quaternion);
    this.layer.add(leaves);
    const random=randomSource(548);
    const size=shrub.scale.x;
    const paths=Array.from({length:count},()=>{
      const angle=random()*TURN;
      return {x:Math.cos(angle),z:Math.sin(angle),height:(.49+random()*.65)*size,
        speed:.37+random()*.97,phase:random()*2,delay:random()*.21};
    });
    const item=new THREE.Object3D();
    return t=>{
      paths.forEach(({x,z,height,speed,phase,delay},i)=>{
        const u=clamp((t-delay)/(1-delay),0,1);
        const distance=.24+u*speed;
        item.position.set(x*distance,Math.max(.17,height*(1-u*u)+.23*Math.sin(Math.PI*u)),z*distance);
        item.rotation.set(phase+u*8,u*3,phase-u*4);
        const fade=clamp(u*12,0,1)*clamp((1-u)*4,0,1);
        item.scale.set(.119*fade,.022*fade,.047*fade);
        item.updateMatrix();
        leaves.setMatrixAt(i,item.matrix);
      });
      leaves.instanceMatrix.needsUpdate=true;
    };
  }
}
