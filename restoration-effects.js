"use strict";

// The same distance field drives the flame front, the ash on the soil and the return of blades.
const burnField = `
uniform vec3 burnOrigin;
uniform float burnFront, regrowth;
float fireDistance(vec3 n){
  return acos(clamp(dot(n,burnOrigin),-1.,1.))/3.14159+
    .058*sin(n.x*8.+n.y*5.)*sin(n.z*7.-n.y*6.)+.018*sin(n.x*22.+n.z*13.);
}
float ashCover(vec3 n,float d){
  float island=.49+.22*sin(8.*n.x+4.*n.z)*cos(10.*n.y)+.20*sin(15.*n.z-5.*n.y);
  return smoothstep(-.026,.026,burnFront-d)*(1.-smoothstep(island-.15,island+.15,regrowth));
}`;

function makeFieldSpade(){
  const group=new THREE.Group();
  const metal=new THREE.MeshStandardMaterial({color:0x768b85,metalness:.28,roughness:.52});
  const wood=new THREE.MeshStandardMaterial({color:0xb57846,roughness:.84});
  const grip=new THREE.MeshStandardMaterial({color:0x416357,roughness:.78});
  function part(geometry,material,x,y,z){
    const mesh=new THREE.Mesh(geometry,material);
    mesh.position.set(x,y,z);group.add(mesh);return mesh;
  }
  const blade=new THREE.Shape();
  blade.moveTo(-.28,.48);blade.quadraticCurveTo(-.31,.04,-.21,-.10);
  blade.quadraticCurveTo(-.13,-.27,0,-.34);blade.quadraticCurveTo(.30,-.17,.28,.48);
  blade.quadraticCurveTo(0,.55,-.28,.48);
  part(new THREE.ExtrudeGeometry(blade,{depth:.055,bevelEnabled:true,bevelThickness:.035,bevelSize:.034,bevelSegments:3,steps:1}),metal,0,0,0);
  part(new THREE.CylinderGeometry(.052,.065,.96,12),wood,0,.99,.083);
  part(new THREE.CylinderGeometry(.065,.084,.27,12),metal,0,.50,.076);
  const handle=new THREE.CatmullRomCurve3([new THREE.Vector3(0,1.42,.085),new THREE.Vector3(-.16,1.62,.085),new THREE.Vector3(-.15,1.73,.085),new THREE.Vector3(.15,1.73,.085),new THREE.Vector3(.16,1.62,.085),new THREE.Vector3(0,1.42,.085)]);
  part(new THREE.TubeGeometry(handle,40,.052,10,false),grip,0,0,0);
  return group;
}

function makeSandstorm(){
  const layer=new THREE.Group(),random=randomSource(7316);
  const uniforms={clock:{value:0},strength:{value:0}};
  // Each row is one gust: latitude, entry time, crossing speed and curl.
  const currents=[
    [-.82,.72,.12,.35],[-.55,.16,.14,.80],[-.32,.55,.11,.60],
    [-.08,.34,.15,.15],[.14,.84,.13,.68],[.40,.03,.12,.42],[.66,.62,.14,.89]
  ];
  const flow=`
    uniform float clock,strength;
    attribute vec4 current,grain;
    varying float alpha,shade;
    float life(){return fract(clock*current.z+current.y);}
    float envelope(float age){return smoothstep(.015,.19,age)*(1.-smoothstep(.79,.99,age));}
    vec3 stream(float age,float u,float scatter,float lift){
      float cycle=floor(clock*current.z+current.y);
      float drift=sin(current.w*12.+cycle*2.3);
      float head=mix(-2.27,3.33,age);
      float angle=head-(1.-u)*(1.22+.26*current.w);
      float roll=10.*u-2.6*clock+current.w*19.;
      float curl=smoothstep(.48,.94,u);
      float lat=current.x+.13*sin(angle*1.63+current.w*6.)+.10*drift
        +.095*curl*sin(roll)+scatter;
      angle+=.08*curl*cos(roll);
      float radius=5.48+.11*cos(angle*2.+current.w)+lift+.20*curl*(.5+.5*sin(roll));
      return radius*vec3(cos(lat)*sin(angle),sin(lat),cos(lat)*cos(angle));
    }`;
  const quad=new THREE.PlaneGeometry(1,1);
  function particles(count,vertex,fragment){
    const geometry=new THREE.InstancedBufferGeometry(),lanes=[],grains=[];
    geometry.index=quad.index;geometry.setAttribute("position",quad.attributes.position);
    geometry.setAttribute("uv",quad.attributes.uv);
    for(let i=0;i<count;i++){
      lanes.push(...currents[i%currents.length]);
      grains.push(random(),random(),random(),random());
    }
    geometry.setAttribute("current",new THREE.InstancedBufferAttribute(new Float32Array(lanes),4));
    geometry.setAttribute("grain",new THREE.InstancedBufferAttribute(new Float32Array(grains),4));
    geometry.instanceCount=count;
    const mesh=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      uniforms,transparent:true,depthWrite:false,vertexShader:flow+vertex,fragmentShader:fragment
    }));
    mesh.userData.maxParticles=count;
    mesh.frustumCulled=false;layer.add(mesh);return mesh;
  }
  const haze=particles(196,`varying vec2 tex;varying float turn;
    void main(){
      float age=life(),u=fract(grain.x+clock*(.085+.028*grain.y));
      float spread=(grain.y-.5)*(.11+.13*u);
      vec4 p=modelViewMatrix*vec4(stream(age,u,spread,.08+grain.w*.23),1.);
      float width=(1.1+.85*grain.w)*(.64+.45*u);
      float height=(.44+.50*grain.y)*(.6+.75*u);
      vec2 corner=position.xy*vec2(width,height);
      corner.y+=corner.x*(.12*cos(age*5.+current.x*5.)+.14*sin(u*7.));
      p.xy+=corner;
      tex=uv;shade=grain.w;turn=grain.z*20.+clock*.58;
      alpha=strength*envelope(age)*sin(3.14159*u)*(.52+.20*grain.y);
      gl_Position=projectionMatrix*p;
    }`,`varying float alpha,shade,turn;varying vec2 tex;
    void main(){
      vec2 p=tex*2.-1.;
      p.y+=.15*sin(p.x*3.7+turn);
      float shape=length(p)+.13*sin(p.x*7.+turn)*cos(p.y*6.-turn*.7);
      float body=1.-smoothstep(.29,1.,shape);
      float light=smoothstep(-.54,.65,p.y+.19*sin(4.*p.x+turn));
      vec3 dust=mix(vec3(.56,.355,.17),vec3(.995,.865,.62),light*.84+.16*shade);
      gl_FragColor=vec4(dust,alpha*body);
    }`);
  const grains=particles(1190,`varying vec2 tex;
    void main(){
      float age=life(),u=fract(grain.x+clock*(.16+.12*grain.z));
      float hop=sin(3.14159*u),sc=(grain.y-.5)*(.11+.14*u);
      vec4 p=modelViewMatrix*vec4(stream(age,u,sc,.04+hop*(.05+.62*grain.w)),1.);
      vec4 ahead=modelViewMatrix*vec4(stream(age,u+.014,sc,.04+hop*(.05+.62*grain.w)),1.);
      vec2 tangent=normalize(ahead.xy-p.xy+vec2(.00001));
      vec2 across=vec2(-tangent.y,tangent.x);
      p.xy+=tangent*position.x*(.045+.245*pow(grain.z,3.))+across*position.y*(.017+.036*grain.w);
      alpha=strength*envelope(age)*hop*(.66+.29*grain.y);shade=grain.y;tex=uv;
      gl_Position=projectionMatrix*p;
    }`,`varying float alpha,shade;varying vec2 tex;void main(){
      float d=length((tex-.5)*2.);
      gl_FragColor=vec4(mix(vec3(.48,.29,.13),vec3(1.,.91,.68),shade),alpha*(1.-smoothstep(.46,1.,d)));
    }`);
  haze.renderOrder=2;grains.renderOrder=3;
  return {layer,uniforms};
}

function makeFlames(world){
  const attributes=[],random=randomSource(7142),count=1900;
  const geometry=new THREE.InstancedBufferGeometry(),quad=new THREE.PlaneGeometry(1,1);
  geometry.index=quad.index;geometry.setAttribute("position",quad.attributes.position);
  geometry.setAttribute("uv",quad.attributes.uv);
  for(let i=0;i<count;i++){
    const y=1-2*(i+.1+.8*random())/count,r=Math.sqrt(1-y*y),angle=i*2.399963+(random()-.5)*.09;
    attributes.push(r*Math.cos(angle),y,r*Math.sin(angle),random());
  }
  geometry.setAttribute("site",new THREE.InstancedBufferAttribute(new Float32Array(attributes),4));
  geometry.instanceCount=count;
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.DoubleSide,
    uniforms:{...world.fireUniforms,clock:{value:0},moundMap:{value:world.moundTexture}},
    vertexShader:burnField+sphereUv+`attribute vec4 site;uniform float clock;uniform sampler2D moundMap;
      varying vec2 tex;varying float heat,seed;
      void main(){
        vec3 n=normalize(site.xyz);tex=uv;seed=site.w;
        float d=fireDistance(n),lag=burnFront-d;
        heat=smoothstep(-.03,.038,lag)*(1.-smoothstep(.04,.19,lag));
        float pulse=.76+.19*sin(clock*5.+site.w*32.)+.13*cos(clock*3.5+site.w*13.);
        float radius=5.+.085*sin(3.9*n.x+2.5*n.y+1.4*n.z)*cos(3.3*n.z-1.4*n.y)+texture2D(moundMap,grassUV(n)).r*.58;
        vec3 root=n*(radius+.015),up=normalize(mat3(modelViewMatrix)*n);
        vec3 side=vec3(up.y,-up.x,0.);if(length(side)<.15)side=vec3(1.,0.,0.);side=normalize(side);
        vec4 p=modelViewMatrix*vec4(root,1.);
        p.xyz+=up*uv.y*(.40+site.w*.84)*heat*pulse+side*(position.x*(.43+.23*site.w)+(.22+.20*sin(clock*4.+site.w*30.))*uv.y*uv.y);
        gl_Position=projectionMatrix*p;if(heat<.01)gl_Position=vec4(2.,2.,2.,1.);}`,
    fragmentShader:`varying vec2 tex;varying float heat,seed;
      void main(){float y=tex.y,x=abs(tex.x-.5+(.075+.08*seed)*sin(y*6.+seed*9.)*y);
      float width=(.5*pow(1.-y,.8))*(.72+.28*sin(y*3.14));
      float a=(1.-smoothstep(width-.12,width+.025,x))*(1.-smoothstep(.83,1.,y))*smoothstep(0.,.24,y);
      if(a<.01)discard;
      vec3 col=mix(vec3(1.,.85,.37),vec3(.94,.28,.085),smoothstep(.05,.83,y+.72*x));
      gl_FragColor=vec4(col,a*heat*.94);}`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;return mesh;
}

class RestorationEffects{
  constructor(world){
    this.world=world;
    this.sand=makeSandstorm();this.spade=makeFieldSpade();this.flames=makeFlames(world);
    world.planet.add(this.sand.layer,this.spade,this.flames);
    this.spade.traverse(node=>{if(node.isMesh)node.layers.enable(world.shrubHighlight.depthLayer);});
    this.reset();
  }
  reset(){
    this.finish();
    this.sand.layer.visible=false;
    this.sand.layer.quaternion.identity();
    this.dustFraction=0;this.lastWind=null;
  }
  finish(){
    this.spade.visible=this.flames.visible=false;
    this.caption="";this.world.fireUniforms.burnFront.value=-1;this.world.fireUniforms.regrowth.value=0;
  }
  wind(time,strength,standFraction){
    // A thinner stand sends up fewer grains and fewer plumes at the same simulation year.
    const dt=this.lastWind===null?1:clamp(time-this.lastWind,0,.25);
    this.lastWind=time;
    this.dustFraction=THREE.MathUtils.lerp(this.dustFraction,standFraction,1-Math.exp(-5*dt));
    if(Math.abs(this.dustFraction-standFraction)<.004)this.dustFraction=standFraction;
    for(const mesh of this.sand.layer.children){
      mesh.geometry.instanceCount=Math.round(mesh.userData.maxParticles*this.dustFraction);
    }
    this.sand.layer.visible=strength>.015&&this.dustFraction>.005;
    this.sand.uniforms.clock.value=this.world.motion?time:time*.18;
    this.sand.uniforms.strength.value=strength*Math.sqrt(this.dustFraction);
  }
  poseSpade(n,height,angle){
    // The handle leans across the screen, including when the selected shrub faces the camera.
    const inverse=this.world.planet.quaternion.clone().invert();
    const side=new THREE.Vector3(-.80,.60,0).applyQuaternion(inverse);
    side.addScaledVector(n,-side.dot(n));
    if(side.lengthSq()<.01)side.copy(tangentFrame(n)[0]);else side.normalize();
    const shaft=n.clone().multiplyScalar(Math.cos(angle)).addScaledVector(side,-Math.sin(angle)).normalize();
    const face=FRONT.clone().applyQuaternion(inverse);
    face.addScaledVector(shaft,-face.dot(shaft));
    if(face.lengthSq()<.01)face.copy(tangentFrame(shaft)[0]);else face.normalize();
    const right=new THREE.Vector3().crossVectors(shaft,face);
    this.spade.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right,shaft,face));
    this.spade.position.copy(n).multiplyScalar(this.world.radiusAt(n)+height+.24).addScaledVector(side,.48);
    this.spade.scale.setScalar(1.68);
    this.spade.visible=true;
  }
  previewSpade(n){if(n)this.poseSpade(n,.45,-.82);else this.spade.visible=false;}
  begin(mode,n){
    this.world.fireUniforms.burnOrigin.value.copy(n);
    this.caption=mode==="burn"?"Fire crosses the meadow":"The blade slips under the roots";
  }
  work(mode,n,elapsed,duration){
    const t=clamp(elapsed/duration,0,1);
    if(mode==="burn"){
      // Advance by angular distance so the hemisphere facing the player gets time on screen.
      this.flames.visible=t<1;
      this.world.fireUniforms.burnFront.value=1.25*t;
      this.flames.material.uniforms.clock.value=this.world.motion?elapsed:0;
      this.caption=t<.085?"The first flames catch":t<1?"Fire spreads across the globe":"The embers are cooling";
    }else{
      this.caption="The spade lifts the root ball";
      if(t<1)this.poseSpade(n,.49-.72*Math.sin(Math.min(1,t/.55)*Math.PI/2)+.95*meadowEase(clamp((t-.53)/.44,0,1)),-1.36+.41*Math.sin(Math.PI*t)-.10*t);
      else this.spade.visible=false;
    }
  }
  regrow(t){
    this.caption="Over the next seasons, new grass fills the openings";
    this.world.fireUniforms.regrowth.value=meadowEase(t);
    this.flames.visible=false;this.spade.visible=false;
  }
}
