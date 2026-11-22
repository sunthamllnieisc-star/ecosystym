"use strict";

const {THREE} = window;
const RADIUS = 5;
const LONGITUDES = 120;
const LATITUDES = 72;
const MAP_WIDTH = 128;
const MAP_HEIGHT = 64;
const TURN = Math.PI * 2;
const SEED_ANGLE = .50;
const SAPLING_SCALE = 1.77;
const FRONT = new THREE.Vector3(0,0,1);
const clamp = (value,min,max) => Math.max(min,Math.min(value,max));
const angleBetween = (a,b) => Math.acos(clamp(a.dot(b),-1,1));

function randomSource(seed) {
  return () => {
    seed = (Math.imul(1664525,seed)+1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function naturalHeight(x,y,z) {
  return .085 * Math.sin(3.9*x + 2.5*y + 1.4*z) * Math.cos(3.3*z - 1.4*y)
    + .062 * Math.sin(5.3*z - 3.5*x) * Math.cos(4.2*y + 1.5*z)
    + .028 * Math.sin(8*x + 4*y - 5*z);
}

function tangentFrame(n) {
  const tangent = new THREE.Vector3(Math.abs(n.y)>.94?1:0,Math.abs(n.y)>.94?0:1,0)
    .cross(n).normalize();
  return [tangent,new THREE.Vector3().crossVectors(n,tangent)];
}

function onSurface(n,east,north,angle,heading) {
  const offset=Math.sin(angle);
  return n.clone().multiplyScalar(Math.cos(angle))
    .addScaledVector(east,Math.cos(heading)*offset)
    .addScaledVector(north,Math.sin(heading)*offset);
}

const sphereUv = `
vec2 grassUV(vec3 n) {
  return vec2(fract(atan(n.z,n.x)/6.2831853+1.0), acos(clamp(n.y,-1.0,1.0))/3.14159265);
}`;
const noise = `
float hash(vec3 p) { return fract(sin(dot(p,vec3(127.1,269.5,113.9)))*43758.5453); }
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(
    mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+1.0),f.x),f.y),f.z
  );
}`;

function meadowBand(x,y,z){
  return clamp(.49+.28*Math.sin(x*5.9+z*4.1)*Math.cos(y*4.6-x*2.1)+.24*Math.sin(y*6.6+z*3.4),0,1);
}

const surfaceVertex = `
attribute vec3 surfaceDir;
varying vec3 localDir;
varying vec3 litNormal;
varying float lift;
void main() {
  localDir=surfaceDir;
  litNormal=normalize(normalMatrix*normal);
  lift=length(position)-5.0;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
}`;

const surfaceFragment = `
uniform sampler2D seeds;
uniform sampler2D stressMap;
uniform sampler2D dryMap;
uniform sampler2D nutrientMap;
uniform float soilView;
uniform float time;
varying vec3 localDir;
varying vec3 litNormal;
varying float lift;
${sphereUv}
${noise}
void main() {
  vec3 n=normalize(localDir), s=normalize(litNormal);
  vec3 sun=normalize(vec3(-.55,.62,.57));
  float incidence=dot(s,sun);
  float shade=smoothstep(-.26,.8,incidence);
  float field=noise(n*4.4+1.3)*.68+noise(n*9.0-1.0)*.32;
  float layers=smoothstep(.34,.47,field)*.54+smoothstep(.55,.68,field)*.46;
  float specks=noise(n*104.0)*.026;
  vec3 soil=mix(vec3(.725,.501,.325),vec3(.831,.632,.419),layers);
  soil+=smoothstep(.09,.6,lift)*vec3(.061,.026,.005);
  soil+=specks;
  float band=clamp(.49+.28*sin(n.x*5.9+n.z*4.1)*cos(n.y*4.6-n.x*2.1)+.24*sin(n.y*6.6+n.z*3.4),0.0,1.0);
  vec3 grass=mix(vec3(.208,.487,.266),vec3(.513,.737,.285),smoothstep(.22,.79,band));
  grass+=noise(n*39.0)*.019;
  vec2 uv=grassUV(n);
  float timestamp=texture2D(seeds,uv).r;
  float stress=texture2D(stressMap,uv).r;
  float dry=texture2D(dryMap,uv).r;
  float nutrients=texture2D(nutrientMap,uv).r;
  float edgeGrowth=nutrients*(1.0-smoothstep(.30,.77,stress));
  soil=mix(soil,vec3(.37,.253,.15)+field*.12,smoothstep(.10,.85,nutrients)*.93);
  grass=mix(grass,vec3(.12,.60,.34),edgeGrowth*.91);
  grass=mix(grass,vec3(.65,.54,.28),stress*.91);
  grass=mix(grass,vec3(.70,.60,.30),smoothstep(.06,.64,dry)*.94);
  if(dry>.20){
    float crust=smoothstep(.20,.78,dry);
    vec3 sand=mix(vec3(.78,.59,.37),vec3(.96,.80,.50),layers);
    vec2 warp=vec2(noise(n*19.1),noise(n*21.7+7.3))-.5;
    vec2 tile=fract(n.xy*28.0+n.z*vec2(11.0,19.0)+warp*1.85);
    vec2 edge=min(tile,1.0-tile);
    float crack=(1.0-smoothstep(.012,.042,min(edge.x,edge.y))) * smoothstep(.28,.65,noise(n*17.5+2.6));
    sand+=specks-crack*vec3(.19,.14,.075)*crust;
    soil=mix(soil,sand,crust);
  }
  float grown=step(0.0,timestamp)*smoothstep(.0,.44,time-timestamp)*(1.0-.56*stress);
  grown*=1.0-smoothstep(.37,.84,dry);
  vec3 color=mix(soil,grass,grown);
  vec3 dusk=mix(vec3(.176,.063,.019),vec3(.11,.18,.074),grown);
  color=mix(color-dusk,color,shade);
  color+=smoothstep(.75,1.0,incidence)*vec3(.095,.062,.018);
  float rim=pow(1.0-abs(s.z),3.6)*smoothstep(-.37,.69,incidence);
  color+=rim*vec3(.115,.121,.055);
  if(soilView>.001){
    float tint=smoothstep(.015,.83,nutrients);
    vec3 soilMap=mix(vec3(.81,.75,.61),vec3(.10,.54,.47),tint);
    soilMap+=noise(n*38.0)*.045;
    soilMap*=mix(.72,1.02,shade);
    color=mix(color,soilMap,soilView);
  }
  gl_FragColor=vec4(color,1.0);
}`;

const bladeVertex = `
attribute vec3 root;
attribute vec3 outward;
attribute vec3 stalk;
attribute vec4 bladeStyle;
uniform sampler2D seeds;
uniform sampler2D stressMap;
uniform sampler2D dryMap;
uniform sampler2D nutrientMap;
uniform float soilView;
uniform float time;
uniform float wind;
varying float t;
varying float colorway;
varying float sunlight;
varying float fold;
varying float drying;
varying float enrichment;
${sphereUv}
void main() {
  vec3 n=outward;
  vec3 b=normalize(stalk);
  vec3 across=normalize(cross(b,n));
  vec2 uv=grassUV(n);
  float planted=texture2D(seeds,uv).r;
  float stress=texture2D(stressMap,uv).r;
  float dry=texture2D(dryMap,uv).r;
  enrichment=texture2D(nutrientMap,uv).r*(1.0-smoothstep(.29,.76,stress))*(1.0-dry);
  drying=max(stress,smoothstep(.06,.68,dry));
  float loss=smoothstep(.16+bladeStyle.w*.22,.76+bladeStyle.w*.12,dry);
  float grow=step(0.0,planted)*smoothstep(.02,.63,time-planted)*(1.0-.94*stress)*(1.0-loss);
  grow*=(1.0+.39*enrichment)*(1.0-soilView);
  t=position.y;
  fold=position.x;
  colorway=bladeStyle.w;
  float wave=sin(dot(root,vec3(.84,.27,.43))-time*2.15);
  vec3 windDirection=vec3(1.0,.16,.32);
  vec3 breeze=(windDirection-n*dot(n,windDirection))*(.22+wave*.21)*wind;
  float width=bladeStyle.y*(.84+.22*sin(t*3.8))*(1.0-pow(t,1.28));
  vec3 lift=n*(bladeStyle.x*(t-.11*t*t*t) + width*(1.0-abs(fold))*.49);
  vec3 offset=across*width*fold+(b*bladeStyle.z+breeze)*bladeStyle.x*t*t;
  vec3 p=root+(lift+offset)*grow;
  vec3 face=normalize(normalMatrix * n);
  float light=dot(face,normalize(vec3(-.55,.62,.57)));
  sunlight=smoothstep(-.32,.85,light) + .034*wave*wind;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  if(grow<.001) gl_Position=vec4(2.0,2.0,2.0,1.0);
}`;

const bladeFragment = `
varying float t;
varying float colorway;
varying float sunlight;
varying float fold;
varying float drying;
varying float enrichment;
void main() {
  vec3 rootColor=mix(vec3(.118,.344,.222),vec3(.304,.492,.201),colorway);
  vec3 bladeColor=mix(vec3(.245,.619,.367),vec3(.584,.751,.247),colorway);
  vec3 tipColor=mix(vec3(.468,.778,.478),vec3(.807,.866,.358),colorway);
  vec3 color=mix(rootColor,bladeColor,smoothstep(.07,.55,t));
  color=mix(color,tipColor,smoothstep(.65,.88,t)*.84);
  color=mix(color,mix(vec3(.06,.40,.237),vec3(.41,.82,.53),t),enrichment*.87);
  color=mix(color,vec3(.72,.59,.29),drying*.88);
  color*=.76+.26*sunlight+.068*smoothstep(-.12,.09,fold);
  color+=smoothstep(.84,1.0,sunlight)*vec3(.026,.029,.008);
  gl_FragColor=vec4(color,1.0);
}`;

function makeBackdropLayer(w,h,position,fragment) {
  const layer = new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.ShaderMaterial({
    vertexShader:"varying vec2 tex; void main(){tex=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader:"varying vec2 tex; void main(){vec2 p=(tex-.5)*2.0;"+fragment+"}",
    transparent:true,depthWrite:false,
  }));
  layer.position.set(...position);
  return layer;
}

class Planet {
  constructor(canvas) {
    const context = canvas.getContext("webgl2",{alpha:true,antialias:true});
    if(!context) throw new Error("WebGL 2 is unavailable.");
    this.canvas=canvas;
    this.renderer=new THREE.WebGLRenderer({canvas,context,alpha:true,antialias:true});
    this.renderer.setClearColor(0,0);
    this.scene=new THREE.Scene();
    this.clock=new THREE.Clock();
    this.camera=new THREE.OrthographicCamera(-10,10,10,-10,.1,100);
    this.camera.position.z=24;
    this.camera.updateMatrixWorld();
    this.ray=new THREE.Raycaster();
    this.motion=!matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.planet=new THREE.Group();
    this.scene.add(this.planet);
    this.saplings=new THREE.Group();
    this.planet.add(this.saplings);
    this.scene.add(
      makeBackdropLayer(14,14,[0,0,-6],"float a=(1.0-smoothstep(.54,1.0,length(p)))*.44;gl_FragColor=vec4(.998,.99,.76,a);"),
      makeBackdropLayer(11,1.1,[0,-5.45,-7],"float a=exp(-dot(p,p)*4.5)*(1.0-smoothstep(.64,1.0,length(p)))*.17;gl_FragColor=vec4(.21,.39,.27,a);"),
    );
    this.coverage=new Float32Array(MAP_WIDTH*MAP_HEIGHT).fill(-1);
    this.cellDirs=new Float32Array(this.coverage.length*3);
    this.rowWeights=new Float32Array(MAP_HEIGHT);
    this.totalWeight=0;
    this.coveredWeight=0;
    for(let row=0;row<MAP_HEIGHT;row++){
      const tilt=(row+.5)*Math.PI/MAP_HEIGHT, sin=Math.sin(tilt), cos=Math.cos(tilt);
      this.rowWeights[row]=sin;
      this.totalWeight+=sin*MAP_WIDTH;
      for(let column=0;column<MAP_WIDTH;column++){
        const i=(row*MAP_WIDTH+column)*3, lon=(column+.5)*TURN/MAP_WIDTH;
        this.cellDirs.set([Math.cos(lon)*sin,cos,Math.sin(lon)*sin],i);
      }
    }
    this.paintTexture=new THREE.DataTexture(this.coverage,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.FloatType);
    this.paintTexture.minFilter=this.paintTexture.magFilter=THREE.NearestFilter;
    this.paintTexture.needsUpdate=true;
    this.stress=new Float32Array(this.coverage.length);
    this.stressTexture=new THREE.DataTexture(this.stress,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.FloatType);
    this.stressTexture.minFilter=this.stressTexture.magFilter=THREE.NearestFilter;
    this.stressTexture.needsUpdate=true;
    this.dryGround=new Float32Array(this.coverage.length);
    this.dryPixels=new Uint8Array(this.coverage.length);
    this.dryTexture=new THREE.DataTexture(this.dryPixels,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.UnsignedByteType);
    this.dryTexture.minFilter=this.dryTexture.magFilter=THREE.LinearFilter;
    this.dryTexture.wrapS=THREE.RepeatWrapping;
    this.dryTexture.needsUpdate=true;
    this.nutrientPixels=new Uint8Array(this.coverage.length);
    this.nutrientTexture=new THREE.DataTexture(this.nutrientPixels,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.UnsignedByteType);
    this.nutrientTexture.minFilter=this.nutrientTexture.magFilter=THREE.LinearFilter;
    this.nutrientTexture.wrapS=THREE.RepeatWrapping;
    this.nutrientTexture.needsUpdate=true;
    this.soilView=false;
    this.soilOpacity={value:0};
    const geometry=new THREE.SphereGeometry(RADIUS,LONGITUDES,LATITUDES);
    const vertices=geometry.attributes.position;
    const directions=new Float32Array(vertices.count*3);
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i)/RADIUS, y=vertices.getY(i)/RADIUS, z=vertices.getZ(i)/RADIUS;
      directions.set([x,y,z],i*3);
      const r=RADIUS+naturalHeight(x,y,z);
      vertices.setXYZ(i,x*r,y*r,z*r);
    }
    geometry.setAttribute("surfaceDir",new THREE.BufferAttribute(directions,3));
    this.smoothSurfaceNormals(geometry);
    this.surface=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      vertexShader:surfaceVertex,fragmentShader:surfaceFragment,
      uniforms:{seeds:{value:this.paintTexture},stressMap:{value:this.stressTexture},dryMap:{value:this.dryTexture},
        nutrientMap:{value:this.nutrientTexture},soilView:this.soilOpacity,time:{value:0}},
    }));
    this.planet.add(this.surface);
    this.cursor=this.makeRing(SEED_ANGLE,.007,0xfff8dc);
    this.cursor.visible=false;
    this.planet.add(this.cursor);
    this.scale=1;
    new ResizeObserver(()=>this.resize()).observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(()=>this.render());
  }

  resize() {
    const {width,height}=this.canvas.getBoundingClientRect();
    if(!width||!height) return;
    this.pixelsPerUnit=Math.min(width*.429,height*.423)/RADIUS;
    this.camera.left=-width/(2*this.pixelsPerUnit);
    this.camera.right=-this.camera.left;
    this.camera.top=height/(2*this.pixelsPerUnit);
    this.camera.bottom=-this.camera.top;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,width<560?1.45:1.65));
    this.renderer.setSize(width,height,false);
  }

  pointRay(x,y) {
    const box=this.canvas.getBoundingClientRect();
    this.ray.setFromCamera({x:(x-box.left)/box.width*2-1,y:1-(y-box.top)/box.height*2},this.camera);
    this.planet.updateMatrixWorld();
  }

  pick(x,y) {
    this.pointRay(x,y);
    const hit=this.ray.intersectObject(this.surface)[0];
    return hit ? this.planet.worldToLocal(hit.point).normalize() : null;
  }

  pickShrub(x,y) {
    this.pointRay(x,y);
    const hit=this.ray.intersectObjects(this.saplings.children.filter(shrub=>shrub.visible),true)[0];
    if(!hit)return null;
    const ground=this.ray.intersectObject(this.surface)[0];
    if(ground&&ground.distance<hit.distance)return null;
    let shrub=hit.object;
    while(shrub.parent!==this.saplings)shrub=shrub.parent;
    return shrub;
  }

  dragTurn(x0,y0,x1,y1) {
    this.focusTurn=null;
    const box=this.canvas.getBoundingClientRect(), radius=RADIUS*this.pixelsPerUnit*this.scale;
    const ball=(x,y)=>{
      const rx=(x-box.left-box.width/2)/radius, ry=(box.top+box.height/2-y)/radius;
      const squared=rx*rx+ry*ry;
      return new THREE.Vector3(rx,ry,squared<=.5?Math.sqrt(1-squared):.5/Math.sqrt(squared)).normalize();
    };
    const delta=new THREE.Quaternion().setFromUnitVectors(ball(x0,y0),ball(x1,y1));
    this.planet.quaternion.premultiply(delta).normalize();
  }

  turnKey(horizontal,vertical) {
    this.focusTurn=null;
    const delta=new THREE.Quaternion().setFromEuler(new THREE.Euler(vertical*.18,horizontal*.18,0));
    this.planet.quaternion.premultiply(delta).normalize();
  }

  zoom(factor) {
    this.scale=clamp(this.scale*factor,.72,2.65);
    this.camera.zoom=this.scale;
    this.camera.updateProjectionMatrix();
  }

  resetView() {
    this.focusTurn=null;
    this.planet.quaternion.identity();
    this.scale=1;
    this.camera.zoom=1;
    this.camera.updateProjectionMatrix();
    this.cursor.visible=false;
  }

  radiusAt(direction) {
    return RADIUS+naturalHeight(direction.x,direction.y,direction.z);
  }

  smoothSurfaceNormals(geometry) {
    geometry.computeVertexNormals();
    const normals=geometry.attributes.normal, stride=LONGITUDES+1;
    // Smooth the duplicated longitude seam and the poles of the sphere.
    for(let row=1;row<LATITUDES;row++){
      const start=row*stride,end=start+LONGITUDES;
      const mean=new THREE.Vector3(normals.getX(start)+normals.getX(end),normals.getY(start)+normals.getY(end),normals.getZ(start)+normals.getZ(end)).normalize();
      normals.setXYZ(start,mean.x,mean.y,mean.z);
      normals.setXYZ(end,mean.x,mean.y,mean.z);
    }
    for(const row of [0,LATITUDES]){
      const n=new THREE.Vector3();
      const start=row*stride;
      for(let i=start;i<start+stride;i++){n.x+=normals.getX(i);n.y+=normals.getY(i);n.z+=normals.getZ(i);}
      n.normalize();
      for(let i=start;i<start+stride;i++) normals.setXYZ(i,n.x,n.y,n.z);
    }
    normals.needsUpdate=true;
    geometry.computeBoundingSphere();
  }

  makeRing(angle,thickness,color) {
    const count=64, indices=[];
    for(let i=0;i<count;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geometry=new THREE.BufferGeometry();
    geometry.setIndex(indices);
    geometry.setAttribute("position",new THREE.BufferAttribute(new Float32Array((count+1)*6),3).setUsage(THREE.DynamicDrawUsage));
    const ring=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));
    ring.renderOrder=4;
    ring.userData={angle,thickness,count};
    return ring;
  }

  placeRing(ring,direction,lift) {
    if(!direction){ring.visible=false;return;}
    const {angle,thickness,count}=ring.userData;
    const [e,n]=tangentFrame(direction);
    const position=ring.geometry.attributes.position;
    for(let i=0;i<=count;i++){
      for(let rim=0;rim<=1;rim++){
        const p=onSurface(direction,e,n,angle-rim*thickness,i*TURN/count);
        const r=this.radiusAt(p)+lift;
        position.setXYZ(i*2+rim,p.x*r,p.y*r,p.z*r);
      }
    }
    position.needsUpdate=true;
    ring.geometry.computeBoundingSphere();
    ring.visible=true;
  }

  brush(point, angle=SEED_ANGLE, lift=.022) {
    this.cursor.userData.angle=angle;
    this.placeRing(this.cursor,point,lift);
  }

  positionSapling(sapling, point) {
    sapling.position.copy(point).multiplyScalar(this.radiusAt(point)-.015);
    sapling.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point);
    sapling.rotateY(.9+this.saplings.children.length*2.4);
    sapling.scale.setScalar(SAPLING_SCALE);
  }

  lightSaplings() {
    if(this.saplingLights)return;
    const sky=new THREE.HemisphereLight(0xf9fff0,0xb5c3a9,2.15);
    const sun=new THREE.DirectionalLight(0xfff5df,2.5);
    const rim=new THREE.DirectionalLight(0xe1f7ff,1.25);
    sun.position.set(-4,6,8);
    rim.position.set(5,4,-6);
    this.scene.add(sky,sun,rim);
    this.saplingLights=[sky,sun,rim];
  }

  previewSapling(template, point) {
    if(!template||!point){
      if(this.saplingPreview)this.saplingPreview.visible=false;
      return;
    }
    if(!this.saplingPreview){
      this.saplingPreview=template.clone();
      this.saplingPreview.traverse(child=>{
        if(!child.isMesh)return;
        child.material=child.material.clone();
        child.material.transparent=true;
        child.material.opacity=.62;
        child.material.depthWrite=false;
      });
      this.planet.add(this.saplingPreview);
    }
    this.lightSaplings();
    this.positionSapling(this.saplingPreview,point);
    this.saplingPreview.visible=true;
  }

  plantSapling(template, point, born=0) {
    const sapling=template.clone();
    this.lightSaplings();
    this.positionSapling(sapling,point);
    sapling.userData={age:0,born,pruned:[],direction:point.clone()};
    this.saplings.add(sapling);
    return sapling;
  }

  buildGrass() {
    if(this.grass)return;
    const geo=new THREE.InstancedBufferGeometry();
    const shape=[],indices=[];
    for(let row=0;row<=5;row++){
      for(let col=-1;col<=1;col++)shape.push(col,row/5,0);
      if(row<5)for(let col=0;col<2;col++){
        const a=row*3+col;indices.push(a,a+3,a+1,a+1,a+3,a+4);
      }
    }
    geo.setAttribute("position",new THREE.Float32BufferAttribute(shape,3));
    geo.setIndex(indices);
    const roots=[],normals=[],directions=[],styles=[];
    const random=randomSource(19453);
    const count=this.canvas.clientWidth<560 ? 2170 : 3230;
    const goldenAngle=Math.PI*(3-Math.sqrt(5));
    for(let i=0;i<count;i++){
      const y=1-2*(i+.5)/count, width=Math.sqrt(1-y*y), longitude=i*goldenAngle;
      const mid=new THREE.Vector3(Math.cos(longitude)*width,y,Math.sin(longitude)*width);
      const [a,b]=tangentFrame(mid);
      const tuft=onSurface(mid,a,b,random()*.027,random()*TURN);
      const [east,north]=tangentFrame(tuft);
      const patch=meadowBand(tuft.x,tuft.y,tuft.z);
      const height=.18+.30*patch+random()*.12;
      const tint=clamp(.08+patch*.84+random()*.13,0,1);
      const blades=5+Math.round(random()*3);
      const heading=random()*TURN;
      for(let j=0;j<blades;j++){
        const step=heading+j*TURN/blades+(random()-.5)*.85;
        const n=onSurface(tuft,east,north,.007+random()*.022,step);
        const direction=east.clone().multiplyScalar(Math.cos(step)).addScaledVector(north,Math.sin(step));
        direction.addScaledVector(n,-direction.dot(n)).normalize();
        const r=this.radiusAt(n)-.015;
        roots.push(n.x*r,n.y*r,n.z*r);
        normals.push(n.x,n.y,n.z);
        directions.push(direction.x,direction.y,direction.z);
        styles.push(height*(.62+random()*.66),.036+random()*.024+patch*.02,.40+random()*.65,clamp(tint+(random()-.5)*.27,0,1));
      }
    }
    for(const [name,array,size] of [["root",roots,3],["outward",normals,3],["stalk",directions,3],["bladeStyle",styles,4]]){
      geo.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(array),size));
    }
    geo.instanceCount=styles.length/4;
    this.grass=new THREE.Mesh(geo,new THREE.ShaderMaterial({
      vertexShader:bladeVertex,fragmentShader:bladeFragment,side:THREE.DoubleSide,
      uniforms:{seeds:{value:this.paintTexture},stressMap:{value:this.stressTexture},dryMap:{value:this.dryTexture},
        nutrientMap:{value:this.nutrientTexture},soilView:this.soilOpacity,time:{value:0},wind:{value:this.motion?1:0}},
    }));
    this.grass.frustumCulled=false;
    this.planet.add(this.grass);
  }

  sow(point) {
    const now=this.clock.getElapsedTime(), threshold=Math.cos(SEED_ANGLE);
    for(let i=0;i<this.coverage.length;i++){
      if(this.coverage[i]>=0)continue;
      const j=i*3;
      const dot=point.x*this.cellDirs[j]+point.y*this.cellDirs[j+1]+point.z*this.cellDirs[j+2];
      const fringe=.011*Math.sin(i*2.21)*Math.cos(i*.16);
      if(dot>threshold+fringe){
        this.coverage[i]=now+(1-dot)*1.28;
        this.coveredWeight+=this.rowWeights[Math.floor(i/MAP_WIDTH)];
      }
    }
    if(this.coveredWeight>=this.totalWeight*.965){
      for(let i=0;i<this.coverage.length;i++)if(this.coverage[i]<0)this.coverage[i]=now+.12;
      this.coveredWeight=this.totalWeight;
    }
    this.paintTexture.needsUpdate=true;
    return this.coveredWeight/this.totalWeight;
  }

  reset() {
    this.previewSapling(null,null);
    for(const shrub of this.saplings.children)shrub.userData.berries?.mesh.dispose();
    this.saplings.clear();
    if(this.saplingLights){
      this.scene.remove(...this.saplingLights);
      this.saplingLights=null;
    }
    if(this.grass){
      this.planet.remove(this.grass);
      this.grass.material.dispose();
      this.grass.geometry.dispose();
      this.grass=null;
    }
    this.coverage.fill(-1);
    this.paintTexture.needsUpdate=true;
    this.stress.fill(0);
    this.stressTexture.needsUpdate=true;
    this.dryGround.fill(0);
    this.dryPixels.fill(0);
    this.dryTexture.needsUpdate=true;
    this.nutrientPixels.fill(0);
    this.nutrientTexture.needsUpdate=true;
    this.soilView=false;
    this.soilOpacity.value=0;
    this.coveredWeight=0;
    this.resetView();
  }

  render() {
    const time=this.clock.getElapsedTime();
    this.updateMeadow?.(time);
    if(this.focusTurn){
      const {start,from,to,scale,fit}=this.focusTurn;
      const t=clamp((time-start)/.48,0,1);
      const ease=t*t*(3-2*t);
      this.planet.quaternion.slerpQuaternions(from,to,ease);
      if(scale!==fit)this.zoom((scale+(fit-scale)*ease)/this.scale);
      if(t===1)this.focusTurn=null;
    }
    const target=this.soilView?1:0;
    const opacity=this.soilOpacity.value;
    this.soilOpacity.value=!this.motion||Math.abs(target-opacity)<.003?target:opacity+(target-opacity)*.18;
    this.surface.material.uniforms.time.value=time;
    if(this.grass)this.grass.material.uniforms.time.value=time;
    this.renderer.render(this.scene,this.camera);
  }

  showDirection(direction,view=new THREE.Vector3(-.28,.22,.93).normalize()) {
    const from=this.planet.quaternion.clone();
    const facing=direction.clone().applyQuaternion(from);
    const to=new THREE.Quaternion().setFromUnitVectors(facing,view).multiply(from).normalize();
    let fit=this.scale;
    // Leave room for mature crowns along the rim when moving to a guided view.
    for(const shrub of this.saplings.children){
      if(!shrub.visible)continue;
      const axis=shrub.userData.direction.clone().applyQuaternion(to);
      if(axis.z<-.64)continue;
      const reach=shrub.position.length()+3.8;
      const x=Math.abs(axis.x)*reach+1.03,y=Math.abs(axis.y)*reach+1.03;
      fit=Math.min(fit,this.camera.right*.96/x,this.camera.top*.96/y);
    }
    if(this.motion)this.focusTurn={from,to,scale:this.scale,fit:Math.max(.72,fit),start:this.clock.getElapsedTime()};
    else{
      this.planet.quaternion.copy(to);
      this.zoom(fit/this.scale);
    }
  }
}
