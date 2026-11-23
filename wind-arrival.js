"use strict";

// A ground-level view of the opening left between grass tussocks.
function createWindArrival(world,direction,model,host,onCue){
  const canvas=document.createElement("canvas");
  canvas.setAttribute("role","img");
  canvas.setAttribute("aria-label","A breeze rolls a seed between grass tufts. A woody seedling grows where it lands.");
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  host.replaceChildren(canvas);
  const scene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-3,3,2,-2,.1,60);
  scene.background=new THREE.Color(0xcbe2d4);
  scene.fog=new THREE.FogExp2(0xd6e5c8,.045);
  scene.add(new THREE.HemisphereLight(0xfff3e5,0x8d9d90,1.24));
  const key=new THREE.DirectionalLight(0xffefd3,1.95);
  key.position.set(-3,5,3);scene.add(key);
  const rim=new THREE.DirectionalLight(0xf5f3e9,.87);rim.position.set(2,3,-4);scene.add(rim);
  const random=randomSource(1938+world.cellIndex(direction));
  const smooth=(a,b,t)=>meadowEase(clamp((t-a)/(b-a),0,1));
  const lerp=THREE.MathUtils.lerp;
  const landingX=.53, landingZ=.18;
  const groundY=(x,z)=>.075*Math.sin(x*1.3+z*.83)+.043*Math.cos(z*2.02-x*.51)-.022*z;
  const opening=(x,z)=>Math.hypot((x-landingX)*1.10,(z-landingZ)*.91)+.058*Math.sin(x*6+z*3);

  // A low rolling ridge and atmospheric perspective give the breeze a direction
  // to enter from without moving the player's camera.
  for(let i=0;i<2;i++){
    const positions=[],indices=[];
    for(let j=0;j<=100;j++){
      const x=-25+j*.5,z=-16+i*4;
      const y=.85+.53*Math.sin(x*.39+i*2.7)+.25*Math.cos(x*.74+i)-i*.36;
      positions.push(x,-3,z,x,y,z);
      if(j){const n=j*2;indices.push(n-2,n-1,n,n,n-1,n+1);}
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);
    scene.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({color:i?0x91b992:0xa8c9b0,side:THREE.DoubleSide})));
  }
  const turf=new THREE.PlaneGeometry(22,20,150,132);turf.rotateX(-Math.PI/2);turf.translate(0,0,-2);
  const verts=turf.attributes.position,colors=[],green=new THREE.Color(0x587e46),earth=new THREE.Color(0xb89360);
  const tint=new THREE.Color();
  for(let i=0;i<verts.count;i++){
    const x=verts.getX(i),z=verts.getZ(i);
    verts.setY(i,groundY(x,z));
    tint.copy(earth).lerp(green,smooth(.47,.97,opening(x,z)));
    tint.multiplyScalar(.92+.08*Math.sin(x*3.1+z)*Math.cos(z*2.3)+random()*.07);
    colors.push(tint.r,tint.g,tint.b);
  }
  turf.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));turf.computeVertexNormals();
  scene.add(new THREE.Mesh(turf,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1})));

  const blades=new THREE.InstancedBufferGeometry(),shape=[],indices=[],roots=[],forms=[],hues=[];
  for(let row=0;row<5;row++){
    for(let col=-1;col<=1;col++)shape.push(col,row/4,0);
    if(row<4)for(let col=0;col<2;col++){const n=row*3+col;indices.push(n,n+3,n+1,n+1,n+3,n+4);}
  }
  for(let tuft=0;tuft<5800;tuft++){
    const cx=(random()-.5)*10,cz=-8+random()*14,heading=random()*TURN;
    if(opening(cx,cz)<.60)continue;
    const shade=random(),stature=.14+random()*.18;
    for(let j=0;j<6;j++){
      const angle=heading+j*2.4,x=cx+.048*Math.cos(angle),z=cz+.048*Math.sin(angle);
      roots.push(x,groundY(x,z)-.014,z);
      const fringe=smooth(.62,1.05,opening(x,z));
      forms.push(angle,stature*(.48+.52*fringe)*(.82+.46*random()),.026+.021*random(),.17+random()*.23);
      hues.push(shade*.69+random()*.31);
    }
  }
  blades.setAttribute("position",new THREE.Float32BufferAttribute(shape,3));blades.setIndex(indices);
  for(const [name,data,size] of [["root",roots,3],["form",forms,4],["hue",hues,1]]){
    blades.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(data),size));
  }
  blades.instanceCount=hues.length;
  const air={value:0},front={value:-10},gust={value:0};
  const grass=new THREE.Mesh(blades,new THREE.ShaderMaterial({
    side:THREE.DoubleSide,uniforms:{air,front,gust},
    vertexShader:`attribute vec3 root;attribute vec4 form;attribute float hue;uniform float air,front,gust;varying vec3 leafColor;
      void main(){float h=position.y,c=position.x;vec2 heading=vec2(cos(form.x),sin(form.x));
      float pressure=gust*exp(-.68*pow(root.x-front+.17*root.z,2.0));
      vec2 bend=heading*form.w*form.y+vec2(.035*sin(air*1.7+root.x*2.+root.z)+.28*pressure,.012);
      vec2 xz=root.xz+bend*h*h+vec2(-heading.y,heading.x)*c*form.z*(1.-pow(h,1.4));
      xz+=heading*(1.-abs(c))*.013*(1.-h);
      vec3 p=vec3(xz.x,root.y+form.y*h*(1.-.26*pressure*h),xz.y);
      float band=.5+.5*sin(root.x*2.+root.z*1.15)*cos(root.z*.68);
      vec3 base=mix(vec3(.09,.27,.15),vec3(.37,.54,.19),.66*hue+.34*band);
      leafColor=mix(base,vec3(.68,.80,.37),h*(.38+.50*hue))*(.91+.09*c);
      leafColor=mix(leafColor,vec3(.66,.77,.57),smoothstep(1.,8.,-root.z)*.48);
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`varying vec3 leafColor;void main(){gl_FragColor=vec4(leafColor,1.);}`
  }));
  grass.frustumCulled=false;scene.add(grass);

  const ball=new THREE.SphereGeometry(1,24,16);
  function oval(parent,material,x,y,z,sx,sy,sz){
    const m=new THREE.Mesh(ball,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);parent.add(m);return m;
  }
  const clay=color=>new THREE.MeshStandardMaterial({color,roughness:.76});
  const seed=createClaySeed();
  scene.add(seed);
  const rootPath=new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.14,.068,.082),new THREE.Vector3(-.17,.075,.099),
    new THREE.Vector3(-.19,.059,.119),new THREE.Vector3(-.195,.013,.139),new THREE.Vector3(-.183,-.025,.147)
  ]);
  const radicle=new THREE.Mesh(new THREE.TubeGeometry(rootPath,18,.017,7,false),clay(0xf1d49a));
  radicle.position.set(landingX,groundY(landingX,landingZ),landingZ);scene.add(radicle);
  const sprout=model.clone();
  const growth={value:0};
  for(const part of sprout.children){
    if(!part.isMesh)continue;
    part.material=part.material.clone();
    part.material.onBeforeCompile=shader=>{
      shader.uniforms.emergence=growth;
      shader.vertexShader="uniform float emergence;\n"+shader.vertexShader.replace("#include <morphtarget_vertex>",`#include <morphtarget_vertex>
        float edge=emergence*1.92;
        float open=smoothstep(-.025,.33,edge-position.y);
        transformed.xz*=mix(.012,1.,open);
        transformed.y=min(transformed.y,edge)*(.42+.58*emergence);`);
    };
  }
  sprout.position.set(landingX,groundY(landingX,landingZ)-.025,landingZ);
  sprout.rotation.y=-.56;sprout.scale.setScalar(1.32);scene.add(sprout);
  const shadows=document.createElement("canvas");shadows.width=shadows.height=64;
  const ctx=shadows.getContext("2d"),shade=ctx.createRadialGradient(32,32,0,32,32,32);
  shade.addColorStop(0,"rgba(48,37,16,.54)");shade.addColorStop(.5,"rgba(48,37,16,.26)");shade.addColorStop(1,"rgba(48,37,16,0)");
  ctx.fillStyle=shade;ctx.fillRect(0,0,64,64);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadows),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;scene.add(shadow);
  const pebbles=clay(0xb99e6a);
  for(let i=0;i<16;i++){
    const a=random()*TURN,r=.31+random()*.24,x=landingX+r*Math.cos(a),z=landingZ+r*.78*Math.sin(a),size=.018+random()*.024;
    oval(scene,pebbles,x,groundY(x,z),z,size*1.5,size*.56,size);
  }
  const tracers=[];
  for(let i=0;i<4;i++){
    const path=[];
    for(let j=0;j<=28;j++){
      const u=j/28;
      path.push(new THREE.Vector3((u-.5)*(1.1+i*.11),.085*Math.sin(u*TURN+i*.76)+.07*u,Math.sin(u*3.4)*.09));
    }
    const streak=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path),26,.009,5,false),
      new THREE.MeshBasicMaterial({color:i%2?0xf5e8b8:0xf3f5d9,transparent:true,depthWrite:false}));
    scene.add(streak);tracers.push(streak);
  }

  let elapsed=0,lastFrame=null,width=0,height=0;
  const landed=6.2,rooted=12.6;
  let cue="breeze";
  function draw(){
    const t=elapsed;
    const flight=smooth(.8,4.8,t),roll=smooth(4.62,5.81,t),plant=smooth(landed+1.45,rooted-.68,t);
    const x=lerp(-3.15,landingX-.52,flight)+roll*.52;
    const z=lerp(-.42,landingZ,flight);
    const lift=(1-smooth(2.1,4.85,t))*(.70+.42*Math.sin(flight*2.85))+.18*Math.sin(Math.PI*roll);
    seed.position.set(x,groundY(x,z)+.097+lift-.073*plant,z);
    seed.rotation.set(.20*Math.sin(t*2)*(1-roll),.26+.3*flight,-1.8+flight*5.8+roll*.98);
    seed.scale.setScalar(1.87*(1-.59*plant));
    const rootLength=smooth(landed+.36,landed+1.8,t);
    radicle.position.y=groundY(landingX,landingZ)-.12*smooth(landed+2.7,rooted-.9,t);
    radicle.visible=rootLength>0&&plant<.995;
    radicle.geometry.setDrawRange(0,Math.floor(18*rootLength)*42);
    shadow.position.set(x,groundY(x,z)+.013,z);shadow.scale.set(.60+plant*.6+lift*.15,.36+plant*.32,1);
    shadow.material.opacity=1-lift*.45;
    growth.value=plant;sprout.visible=plant>.002;
    if(world.motion)sprout.rotation.z=.018*Math.sin(t*2.6)*(1-plant)*plant;
    air.value=world.motion?t:0;front.value=lerp(-4.5,4.4,smooth(.2,5.5,t));gust.value=world.motion?1-smooth(4.8,6.05,t):0;
    tracers.forEach((line,i)=>{
      const u=clamp((t-.33-i*.36)/3.2,0,1);
      line.position.set(lerp(-4.1,3.8,u),.67+i*.18+.13*Math.sin(u*TURN),-.68+i*.13);
      line.material.opacity=(world.motion?.65:.20)*Math.sin(Math.PI*u);line.visible=u>0&&u<1;
    });
    // The seed remains under the shoot as the player moves in for a closer look.
    const close=world.motion?smooth(landed,landed+3.3,t):0;
    const aspect=width/height,frustum=Math.max(lerp(3.34,2.34,close),lerp(5.5,3.25,close)/aspect);
    const center=landingX*close;
    const settle=world.motion?smooth(2.35,5.85,t):1;
    cam.position.set(center,1.97+.73*settle-.22*close,6.2);
    cam.lookAt(center,.69+.14*close,0);
    cam.left=-frustum*aspect/2;cam.right=-cam.left;cam.top=frustum/2;cam.bottom=-cam.top;cam.updateProjectionMatrix();
    renderer.render(scene,cam);
  }
  function frame(now){
    const w=canvas.clientWidth,h=canvas.clientHeight;
    if(!w||!h||document.hidden){lastFrame=null;return;}
    const resized=w!==width||h!==height;
    if(resized){width=w;height=h;renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.65));renderer.setSize(w,h,false);}
    const dt=lastFrame===null?0:clamp(now-lastFrame,0,.18),first=lastFrame===null;
    lastFrame=now;
    const moving=cue==="breeze"||cue==="rooting";
    if(moving){
      const end=cue==="breeze"?landed:rooted;
      elapsed=Math.min(end,elapsed+dt);
      if(elapsed===end){cue=end===landed?"landed":"rooted";onCue(cue);}
    }
    if(moving||resized||first)draw();
  }
  function act(){if(cue==="landed"){cue="rooting";onCue(cue);}}
  function resume(){lastFrame=null;onCue(cue);frame(world.clock.getElapsedTime());}
  function dispose(){
    scene.remove(sprout,seed);
    for(const child of sprout.children)if(child.isMesh)child.material.dispose();
    const assets=new Set();
    scene.traverse(node=>{
      if(node.geometry)assets.add(node.geometry);
      if(node.material){assets.add(node.material);if(node.material.map)assets.add(node.material.map);}
    });
    for(const asset of assets)asset.dispose();
    renderer.dispose();renderer.forceContextLoss();canvas.remove();
  }
  return {frame,act,resume,dispose,get complete(){return cue==="rooted";}};
}
