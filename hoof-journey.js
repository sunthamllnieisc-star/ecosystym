"use strict";

// Each route connects two real planting sites. The same sheep or calf that the
// player released both performs the journey and returns to normal grazing.
function createHoofJourney(world,meadow,effects,seed,ring){
  const herd=meadow.pasture.animals;
  const first=herd[0],second=herd.find(a=>a.cattle!==first.cattle)??herd[1]??first;
  const actors=[first,second,first];
  const smooth=(a,b,t)=>meadowEase(clamp((t-a)/(b-a),0,1));
  const starts=new Map(herd.map(actor=>[actor,actor.position.clone()]));
  const lastSite=new Map(starts);
  const routes=actors.map((actor,i)=>{
    const target=meadow.stand[i+1].userData;
    const source=meadow.stand[target.source].userData.direction;
    const end=target.direction.clone();
    const start=source.clone().lerp(end,.16).normalize();
    const after=end.clone().lerp(start,-.18).normalize(),approach=lastSite.get(actor);
    lastSite.set(actor,after);
    return {start,end,after,approach,actor};
  });
  const forward=new THREE.Vector3(),right=new THREE.Vector3();
  const outward=new THREE.Vector3();
  const toe=new THREE.Vector3(),onSoil=new THREE.Vector3(),loose=new THREE.Vector3();
  const socketOffset=new THREE.Quaternion(),localRotation=new THREE.Quaternion(),restRotation=new THREE.Quaternion();
  const resting=new THREE.Euler(.27,.20,-.99);
  const mud=new THREE.Group();effects.add(mud);
  const clay=new THREE.MeshStandardMaterial({color:0x604632,roughness:.99});
  const lump=new THREE.IcosahedronGeometry(1,1);
  for(const [x,y,z,size] of [[.02,.01,-.012,.045],[-.026,-.008,-.009,.034],[.046,-.018,.004,.026]]){
    const d=new THREE.Mesh(lump,clay);d.position.set(x,y,z);d.scale.set(size,size*.69,size*.77);mud.add(d);
  }
  const marks=new THREE.InstancedMesh(new THREE.SphereGeometry(1,10,6),
    new THREE.MeshStandardMaterial({color:0x957750,roughness:1}),32);
  marks.frustumCulled=false;effects.add(marks);
  const stamp=new THREE.Object3D(),surface=new THREE.Vector3(),markRight=new THREE.Vector3();
  const markTan=new THREE.Vector3(),basis=new THREE.Matrix4();
  function prints(r,u){
    // Two shallow toe impressions make a cloven track on the actual sphere.
    marks.count=0;
    for(let i=0;i<16;i++){
      const s=(i+.5)/16;
      if(s>u||s<u-.46)continue;
      surface.copy(r.start).lerp(r.end,s).normalize();
      markTan.copy(r.end).addScaledVector(surface,-surface.dot(r.end)).normalize();
      markRight.crossVectors(surface,markTan);
      for(const toeSide of [-1,1]){
        stamp.position.copy(surface).multiplyScalar(world.radiusAt(surface)+.019)
          .addScaledVector(markRight,(i%2?.11:-.11)+toeSide*.028);
        stamp.quaternion.setFromRotationMatrix(basis.makeBasis(markRight,surface,markTan));
        stamp.scale.set(.022,.012,.047);
        stamp.updateMatrix();marks.setMatrixAt(marks.count++,stamp.matrix);
      }
    }
    marks.instanceMatrix.needsUpdate=true;
  }
  function move(a,from,to,u,distance,walk){
    a.position.copy(from).lerp(to,u).normalize();
    forward.subVectors(to,from).addScaledVector(a.position,-forward.dot(a.position));
    if(forward.lengthSq()<.00001)forward.copy(a.forward);
    forward.normalize();right.crossVectors(a.position,forward);
    a.root.quaternion.setFromRotationMatrix(a.basis.makeBasis(right,a.position,forward));
    const pulse=walk*Math.sin(distance*(a.cattle?6.8:10));
    a.root.position.copy(a.position).multiplyScalar(world.radiusAt(a.position)+.01+.009*Math.abs(pulse));
    poseGrazerFeet(a,distance,world.motion?walk:0);
    a.head.rotation.x=.10+.043*pulse;
    a.tail.rotation.z=.13*pulse;a.ears.forEach((ear,i)=>ear.rotation.x=.055*pulse*(i?1:-1));
    a.mouthful.visible=false;
    a.forward.copy(forward);
    // Normal grazing resumes here when the timeline ends.
    a.center.copy(a.position);[a.east,a.north]=tangentFrame(a.center);
    if(a.from===a.to)a.to=a.to.clone();
    a.from.copy(a.position);a.to.copy(a.position);
    a.elapsed=0;a.duration=.6;a.eating=true;a.bites=0;
  }
  function render(i,t){
    const r=routes[i],a=r.actor;
    // Sample every companion from fixed route endpoints. Seeking backwards must
    // put a waiting animal back where it was before its own journey began.
    for(const other of herd){
      if(other===a)continue;
      let patch=starts.get(other),heading=tangentFrame(patch)[0];
      for(let j=0;j<i;j++)if(routes[j].actor===other){
        patch=routes[j].after;heading=patch.clone().sub(routes[j].end).normalize();
      }
      const home=patch.clone().addScaledVector(heading,-.013).normalize();
      move(other,home,patch,1,0,0);
      other.head.rotation.x=.60+.27*Math.sin((i*18.6+t)*1.2+other.variant);
    }
    const approach=smooth(0,3.6,t),travel=smooth(5.25,12.5,t),depart=smooth(14.05,18.6,t);
    const pathLength=r.start.angleTo(r.end)*5;
    if(t<3.6)move(a,r.approach,r.start,approach,approach*r.approach.angleTo(r.start)*5,Math.sin(Math.PI*approach));
    else if(depart>0)move(a,r.end,r.after,depart,depart*r.end.angleTo(r.after)*5,Math.sin(Math.PI*depart));
    else move(a,r.start,r.end,travel,pathLength*travel,Math.min(1,travel*16,(1-travel)*16));
    if(t>3.24&&t<4.12&&r.approach.distanceToSquared(r.start)>.0001){
      const entry=r.start.clone().sub(r.approach).projectOnPlane(a.position).normalize();
      const exit=r.end.clone().sub(r.start).projectOnPlane(a.position).normalize();
      const angle=Math.atan2(entry.clone().cross(exit).dot(a.position),entry.dot(exit));
      forward.copy(entry).applyAxisAngle(a.position,angle*smooth(3.24,4.12,t));
      a.forward.copy(forward);right.crossVectors(a.position,forward);
      a.root.quaternion.setFromRotationMatrix(a.basis.makeBasis(right,a.position,forward));
    }
    a.head.rotation.x+=.59*(smooth(2.4,3.6,t)-smooth(4.65,5.4,t));
    const lift=.53*(smooth(3.25,3.85,t)-smooth(3.85,4.35,t))+
      .55*(smooth(4.45,4.98,t)-smooth(4.98,5.4,t))+
      .86*(smooth(12,12.8,t)-smooth(13.3,14.0,t));
    a.legs[1].rotation.x-=lift;
    if(a.kneeJoints)a.kneeJoints[1].rotation.x+=lift*.67;
    const socket=a.hoofSocket;
    socket.getWorldPosition(toe);world.planet.worldToLocal(toe);
    const stance=r.start.clone().multiplyScalar(world.radiusAt(r.start));
    // Place the loose seed under this animal's unbent sole in its pickup stance.
    if(!r.pickup){
      const direction=r.end.clone().projectOnPlane(r.start).normalize();
      const lateral=r.start.clone().cross(direction);
      const hoof=a.legs[1].position.clone().add(a.kneeJoints[1].position).add(socket.position);
      r.pickup=stance.addScaledVector(lateral,hoof.x*a.root.scale.x)
        .addScaledVector(direction,hoof.z*a.root.scale.x).normalize();
      r.pickup.multiplyScalar(world.radiusAt(r.pickup)+.04);
    }
    loose.copy(r.pickup);
    onSoil.copy(r.end).multiplyScalar(world.radiusAt(r.end)+.052);
    const grasp=smooth(4.20,4.48,t),drop=smooth(12.82,13.66,t);
    seed.position.lerpVectors(loose,toe,grasp).lerp(onSoil,drop*drop);
    socket.getWorldQuaternion(localRotation);
    socketOffset.copy(world.planet.quaternion).invert().multiply(localRotation);
    localRotation.copy(socketOffset);
    restRotation.setFromEuler(resting);
    seed.quaternion.copy(restRotation).slerp(localRotation,grasp*(1-drop));
    seed.rotateZ(-.65*grasp*(1-drop));
    seed.scale.setScalar(a.cattle?.59:.49);
    seed.visible=t<14.8;
    mud.visible=t>4.2&&t<14.5;
    mud.position.copy(seed.position);mud.quaternion.copy(seed.quaternion);
    mud.scale.setScalar(.7+.29*grasp);
    ring.visible=(t>2.9&&t<4.6)||(t>13.1&&t<16.7);
    ring.position.copy(t<5?loose:onSoil);
    outward.copy(t<5?r.start:r.end);
    ring.quaternion.setFromUnitVectors(FRONT,outward);ring.scale.setScalar(t<5?.14:.12+.24*smooth(13.1,15.5,t));
    ring.material.opacity=t<5?.54:.73*(1-smooth(15.0,16.7,t));
    world.grass.material.uniforms.hoofPrint.value.copy(a.position).multiplyScalar(world.radiusAt(a.position));
    prints(r,travel);
    return a;
  }
  function after(year){
    for(const a of herd){
      const home=lastSite.get(a),[east,north]=tangentFrame(home);
      const phase=(year-44)/8,cycle=Math.floor(phase),u=phase-cycle;
      const patch=k=>k===0?home:onSurface(home,east,north,.18+.08*Math.sin(k),k*1.9+a.variant);
      const walk=smooth(.16,.86,u),from=patch(cycle),to=patch(cycle+1);
      move(a,from,to,walk,from.angleTo(to)*5*walk,Math.sin(walk*Math.PI));
      a.head.rotation.x+=.68*(1-Math.sin(walk*Math.PI));
    }
  }
  return {render,after};
}
