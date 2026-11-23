"use strict";

// Everything grows in the original seed bed and is rendered by the player's camera.
function createFirstRain(world,direction,dropPoint,onCue,onFinished){
  const {canvas,renderer,scene,camera}=world;
  const hero=direction;
  const origin=hero.clone().multiplyScalar(world.radiusAt(direction));
  const props=new THREE.Group();
  const soil=world.surface.material;
  let attached=false,previousSoil;
  const originalKernel=new THREE.Matrix4(),concealedKernel=new THREE.Matrix4().makeScale(0,0,0);
  let kernelReplaced=false;
  const [east,north]=tangentFrame(hero);
  const v=(x,y,z)=>new THREE.Vector3(x,y,z);
  const smooth=(a,b,t)=>{const u=clamp((t-a)/(b-a),0,1);return u*u*(3-2*u);};
  const random=randomSource(631);
  const matte=color=>new THREE.MeshStandardMaterial({color,roughness:.88});
  const globe=new THREE.SphereGeometry(1,32,20);
  function oval(group,mat,position,scale){
    const m=new THREE.Mesh(globe,mat);m.position.copy(position);m.scale.copy(scale);group.add(m);return m;
  }
  const cloudTex=new THREE.TextureLoader().load(cloudArt,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.needsUpdate=true;
  });
  cloudTex.colorSpace=THREE.SRGBColorSpace;
  const cloud=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.30),new THREE.MeshBasicMaterial({
    map:cloudTex,transparent:true,depthWrite:false,toneMapped:false
  }));
  cloud.geometry.translate(0,.21,0);props.add(cloud);
  const plot=new THREE.Group();plot.position.copy(origin);plot.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(east,hero,north.clone().negate()));props.add(plot);
  const gold=matte(0xc58a46),pale=matte(0xe6b363),dark=matte(0x805331);
  const shellL=oval(plot,pale,v(-.06,.045,0),v(.145,.045,.072));
  const shellR=oval(plot,gold,v(.063,.049,.025),v(.14,.05,.069));
  shellR.rotation.y=-.23;shellL.rotation.y=-.22;
  const groove=oval(plot,dark,v(.01,.078,.008),v(.146,.012,.012));groove.rotation.y=-.2;
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=shadowCanvas.height=64;
  const sg=shadowCanvas.getContext('2d'),rad=sg.createRadialGradient(32,32,0,32,32,32);
  rad.addColorStop(0,'rgba(58,39,20,.53)');rad.addColorStop(.48,'rgba(67,46,26,.25)');rad.addColorStop(1,'rgba(65,43,26,0)');
  sg.fillStyle=rad;sg.fillRect(0,0,64,64);
  const sm=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false});
  function shadowAt(p,w,h){
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(w,h),sm);
    shadow.position.copy(p).multiplyScalar(world.radiusAt(p)+.011);shadow.quaternion.setFromUnitVectors(v(0,0,1),p);props.add(shadow);
  }
  shadowAt(hero,.72,.44);
  const leafMeshes=[];
  function leaf(heading,length,width,tilt,delay){
    const g=new THREE.BufferGeometry(),rows=17;
    const pos=new Float32Array(rows*9),ix=[];
    for(let i=0;i<rows-1;i++)for(let j=0;j<2;j++){const n=i*3+j;ix.push(n,n+3,n+1,n+1,n+3,n+4);}
    g.setAttribute("position",new THREE.BufferAttribute(pos,3));g.setIndex(ix);
    const shades=[];
    for(let i=0;i<rows;i++)for(let j=0;j<3;j++){
      const c=new THREE.Color(0x718940).lerp(new THREE.Color(delay?0xcbe476:0xbacd69),i/(rows-1));
      c.multiplyScalar(j===1?1.15:j===2?.92:1);shades.push(c.r,c.g,c.b);
    }
    g.setAttribute("color",new THREE.Float32BufferAttribute(shades,3));
    const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.84,side:THREE.DoubleSide}));
    m.rotation.y=heading;m.frustumCulled=false;plot.add(m);leafMeshes.push(m);
    return t=>{
      const age=smooth(4.02+delay,5.75+delay,t);
      m.visible=age>.002;if(!m.visible)return;
      let x=0,y=0;
      for(let i=0;i<rows;i++){
        const u=i/(rows-1),angle=tilt*u*u+(1-age)*2.65*u*u-.13;
        if(i){x+=Math.sin(angle)*length*age/(rows-1);y+=Math.cos(angle)*length*age/(rows-1);}
        const w=width*(.25+.75*Math.sin(Math.PI*Math.pow(u,.84)))*(1-u**4)*Math.sqrt(age);
        for(let j=0;j<3;j++)g.attributes.position.setXYZ(i*3+j,x+(j===1?w*.43:0),y+.04,(j-1)*w);
      }
      g.attributes.position.needsUpdate=true;g.computeVertexNormals();
    };
  }
  const blades=[leaf(-.5,1.00,.09,.75,0),leaf(2.1,.86,.095,1.45,.33),leaf(.72,.68,.082,1.4,.62)];
  const shoots=[];
  for(const index of [2,7,12,17,22,27,32,37,42]){
    const shoot=new THREE.Group();
    shoot.position.copy(world.sowing.paths[index].end);
    shoot.quaternion.setFromUnitVectors(v(0,1,0),shoot.position.clone().normalize());
    shoot.rotateY(random()*TURN);
    for(const blade of leafMeshes)shoot.add(blade.clone());
    props.add(shoot);
    shoots.push({shoot,delay:random()*1.15,size:.55+random()*.3});
  }
  const aqua=new THREE.MeshPhysicalMaterial({color:0x71bdcd,roughness:.19,metalness:.06,clearcoat:.85});
  const glint=new THREE.MeshBasicMaterial({color:0xe1f6ef});
  const dropGeo=new THREE.LatheGeometry([new THREE.Vector2(0,-.96),new THREE.Vector2(.46,-.83),new THREE.Vector2(.63,-.49),new THREE.Vector2(.66,-.18),new THREE.Vector2(.51,.19),new THREE.Vector2(.25,.68),new THREE.Vector2(.035,1.2),new THREE.Vector2(0,1.24)],28);
  function makeDrop(){
    const group=new THREE.Group();group.add(new THREE.Mesh(dropGeo,aqua));oval(group,glint,v(-.29,-.14,.53),v(.09,.18,.043));props.add(group);return group;
  }
  const mainDrop=makeDrop(),rain=Array.from({length:38},(_,i)=>{
    const a=random()*TURN,r=Math.sqrt(random())*1.15;
    const n=onSurface(hero,east,north,r/RADIUS,a);
    return {model:makeDrop(),land:n.multiplyScalar(world.radiusAt(n)+.02),offset:.74*Math.cos(a),start:2.03+.98*i/38,size:.042+random()*.025};
  });
  const splash=Array.from({length:7},(_,i)=>({m:makeDrop(),a:i*TURN/7+.42,h:.12+random()*.13}));
  const release=dropPoint.clone().multiplyScalar(world.radiusAt(dropPoint));
  const rainTop=new THREE.Vector3(),fromDrop=new THREE.Vector3(),cloudBase=new THREE.Vector3();
  const wetRadius=1.48;
  const up=new THREE.Vector3(),right=new THREE.Vector3(),forward=new THREE.Vector3();
  const soakTime=3.64,shootTime=6.67;
  function draw(t){
    const travel=smooth(0,.95,t);
    const exit=smooth(2.75,3.60,t);
    cloud.quaternion.copy(world.planet.quaternion).invert().multiply(camera.quaternion);
    up.set(0,1,0).applyQuaternion(cloud.quaternion);
    right.set(1,0,0).applyQuaternion(cloud.quaternion);
    forward.set(0,0,1).applyQuaternion(cloud.quaternion);
    const size=clamp(Math.min(camera.right,camera.top)/camera.zoom*.16,.55,1.6);
    rainTop.copy(origin).addScaledVector(up,1.5*size).addScaledVector(hero,.5).addScaledVector(forward,.48);
    fromDrop.copy(release).addScaledVector(up,.29*size).addScaledVector(forward,.45);
    cloud.position.lerpVectors(fromDrop,rainTop,travel).addScaledVector(right,exit*1.6).addScaledVector(up,exit*.35);
    cloud.scale.setScalar(size);
    cloud.material.opacity=1-exit;
    cloud.visible=t<3.60;
    const fall=clamp((t-1.47)/.50,0,1);
    const form=smooth(1.19,1.48,t);
    mainDrop.visible=t>1.19&&t<1.97;
    cloudBase.copy(rainTop).addScaledVector(up,-.19*size);
    mainDrop.position.lerpVectors(cloudBase,origin,fall*fall);mainDrop.quaternion.copy(cloud.quaternion);
    mainDrop.scale.set(.12,.16+.025*fall,.12).multiplyScalar(form);
    soil.uniforms.wet.value=.27*smooth(1.97,2.26,t)+(wetRadius-.27)*smooth(2.21,3.54,t);
    soil.uniforms.ring.value=t>=1.97?(t-1.97)/.50:-1;
    soil.uniforms.softShadow.value=travel*(1-exit);
    for(const r of rain){
      const u=(t-r.start)/.40;
      r.model.visible=u>=0&&u<=1;
      if(r.model.visible){
        r.model.position.copy(cloudBase).addScaledVector(right,r.offset*size).lerp(r.land,u*u);
        r.model.quaternion.copy(cloud.quaternion);r.model.scale.set(r.size,r.size*1.65,r.size);
      }
    }
    for(const s of splash){
      const u=(t-1.97)/.41;s.m.visible=u>=0&&u<=1;
      if(s.m.visible){
        s.m.position.copy(origin).addScaledVector(east,Math.cos(s.a)*u*.31).addScaledVector(north,Math.sin(s.a)*u*.31).addScaledVector(hero,4*u*(1-u)*s.h+.025);
        s.m.scale.setScalar(.035*(1-u*.65));
      }
    }
    const split=smooth(3.82,4.47,t),tip=smooth(4.15,4.78,t);
    shellL.rotation.z=.45*split; shellL.position.set(-.062-.087*split,.045+.027*split,0);
    shellR.rotation.z=-.43*tip;shellR.position.set(.063+.088*tip,.049+.02*Math.sin(Math.PI*tip),.025+.03*tip);
    groove.visible=split<.23;
    for(const b of blades)b(t);
    for(const {shoot,delay,size} of shoots){
      const scale=smooth(4.35+delay,shootTime,t)*size;
      shoot.visible=scale>.001;shoot.scale.setScalar(scale);
      shoot.children.forEach((blade,i)=>{blade.visible=leafMeshes[i].visible;});
    }
  }

  let cue="raining",elapsed=0,lastFrame=null,hold=0;
  function announce(next){
    cue=next;onCue(next);
  }
  function frame(now){
    if(!canvas.clientWidth||!canvas.clientHeight||document.hidden){lastFrame=null;return;}
    const dt=lastFrame===null?0:clamp(now-lastFrame,0,.14);
    lastFrame=now;
    const previous=elapsed;
    elapsed=Math.min(shootTime,elapsed+dt*(elapsed<soakTime?.75:.58));
    if(previous<1.97&&elapsed>=1.97)announce("impact");
    if(previous<soakTime&&elapsed>=soakTime)announce("sprouting");
    if(previous<shootTime&&elapsed===shootTime)announce("grown");
    if(elapsed===shootTime){
      hold+=dt;
      if(hold>=1.6){onFinished();return;}
    }
    const falling=world.sowing&&!world.sowing.settled;
    world.updateSowing(now);
    if(world.sowing&&(!kernelReplaced||falling)){
      const kernels=world.sowing.seed;
      kernels.getMatrixAt(0,originalKernel);kernels.setMatrixAt(0,concealedKernel);
      kernels.instanceMatrix.needsUpdate=true;kernelReplaced=true;
    }
    draw(elapsed);
    renderer.render(scene,camera);
  }
  function attachBed(){
    previousSoil={bed:soil.uniforms.bed.value.clone(),wet:soil.uniforms.wet.value,ring:soil.uniforms.ring.value,softShadow:soil.uniforms.softShadow.value};
    soil.uniforms.bed.value.copy(direction);
    world.planet.add(props);world.sowHint.visible=false;
    attached=true;
  }
  function resume(){
    attachBed();
    canvas.style.cursor="grab";
    lastFrame=null;onCue(cue);
    frame(world.clock.getElapsedTime());
  }
  function suspend(){
    if(!attached)return;
    attached=false;
    if(kernelReplaced&&world.sowing){
      world.sowing.seed.setMatrixAt(0,originalKernel);
      world.sowing.seed.instanceMatrix.needsUpdate=true;
    }
    kernelReplaced=false;
    world.planet.remove(props);
    soil.uniforms.bed.value.copy(previousSoil.bed);
    for(const key of ["wet","ring","softShadow"])soil.uniforms[key].value=previousSoil[key];
    canvas.style.cursor="grab";
  }
  function dispose(){
    suspend();
    const assets=new Set();
    props.traverse(node=>{
      if(node.geometry)assets.add(node.geometry);
      if(node.material){assets.add(node.material);if(node.material.map)assets.add(node.material.map);}
    });
    for(const asset of assets)asset.dispose();
  }
  function growIntoMeadow(age){
    if(!attached)attachBed();
    const fade=1-smooth(.6,3.6,age);
    soil.uniforms.wet.value=wetRadius*fade;
    plot.scale.setScalar(.35+.65*fade);sm.opacity=fade;
    for(const {shoot,size} of shoots)shoot.scale.setScalar(size*fade);
    return age>=3.6;
  }
  return {frame,resume,suspend,growIntoMeadow,dispose,get complete(){return elapsed===shootTime;}};
}
