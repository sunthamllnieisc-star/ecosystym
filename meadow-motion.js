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
