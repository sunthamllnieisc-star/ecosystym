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
const MOUND_LIMIT=.58;
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

const pastureShadow = `
uniform int grazerCount;
uniform vec4 hoofCenters[5];
uniform vec3 herdAxes[5];
float grazingShade(vec3 direction){
  float shade=0.0;
  for(int i=0;i<5;i++){
    if(i>=grazerCount)break;
    vec3 d=5.0*(direction-hoofCenters[i].xyz);
    float lengthwise=dot(d,herdAxes[i]);
    float footprint=max(dot(d,d)-.72*lengthwise*lengthwise,0.0);
    shade=max(shade,1.0-smoothstep(.012,.33,footprint*hoofCenters[i].w));
  }
  return shade;
}`;
const surfaceFragment = `
${burnField}
${pastureShadow}
uniform sampler2D seeds;
uniform sampler2D sownMap;
uniform sampler2D stressMap;
uniform sampler2D dryMap;
uniform sampler2D nutrientMap;
uniform sampler2D moundMap;
uniform float soilView;
uniform float time;
uniform vec3 bed;
uniform float wet;
uniform float ring;
uniform float softShadow;
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
  if(wet>0. || softShadow>0. || (ring>=0. && ring<1.)){
    float d=length(n-bed)*5.;
    float grain=noise(n*530.)*.04+noise(n*173.)*.04;
    float shore=d+.13*(noise(n*54.)-.5)+.13*(noise(n*23.)-.5);
    float damp=wet<=0.?0.:1.-smoothstep(wet*.61,wet+.026,shore);
    float mineral=noise(n*188.)*.055+noise(n*61.)*.047;
    soil+=(grain-.04)*damp;
    soil=mix(soil,soil*vec3(.60,.51,.47)+vec3(mineral*.7,mineral*.55,mineral*.42),damp*.96);
    soil+=smoothstep(.66,.84,noise(n*290.))*damp*.035;
    soil*=1.-softShadow*.09*exp(-d*d*1.9);
    if(ring>=0. && ring<1.){
      float line=1.-smoothstep(.008,.021,abs(d-(.05+.39*ring)));
      soil+=vec3(.23,.28,.24)*line*(1.-ring);
    }
  }
  float band=clamp(.49+.28*sin(n.x*5.9+n.z*4.1)*cos(n.y*4.6-n.x*2.1)+.24*sin(n.y*6.6+n.z*3.4),0.0,1.0);
  vec3 grass=mix(vec3(.208,.487,.266),vec3(.513,.737,.285),smoothstep(.22,.79,band));
  grass+=noise(n*39.0)*.019;
  vec2 uv=grassUV(n);
  float timestamp=texture2D(seeds,uv).r;
  float sown=texture2D(sownMap,uv).r;
  float stress=texture2D(stressMap,uv).r;
  float dry=texture2D(dryMap,uv).r;
  float nutrients=texture2D(nutrientMap,uv).r;
  float mound=texture2D(moundMap,uv).r;
  float edgeGrowth=nutrients*(1.0-smoothstep(.30,.77,stress));
  soil=mix(soil,vec3(.37,.253,.15)+field*.12,smoothstep(.10,.85,nutrients)*.93);
  float litter=noise(n*76.0+4.7);
  vec3 topsoil=mix(vec3(.39,.268,.16),vec3(.52,.35,.20),smoothstep(.20,.86,litter));
  soil=mix(soil,topsoil,smoothstep(.08,.58,mound)*.88);
  grass=mix(grass,vec3(.12,.60,.34),edgeGrowth*.91);
  grass=mix(grass,vec3(.65,.54,.28),stress*.91);
  grass=mix(grass,vec3(.70,.60,.30),smoothstep(.06,.64,dry)*.94);
  float fissure=0.;
  if(dry>.20){
    float crust=smoothstep(.20,.78,dry);
    vec3 sand=mix(vec3(.78,.59,.37),vec3(.96,.80,.50),layers);
    vec2 warp=vec2(noise(n*21.1),noise(n*24.7+7.3))-.5;
    vec2 p=n.xy*15.0+n.z*vec2(6.7,10.3)+warp*.51;
    vec2 cell=floor(p),f=fract(p);
    float nearest=5.,second=5.;
    for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
      vec2 neighbor=vec2(float(x),float(y)),id=cell+neighbor;
      vec2 site=.19+.62*vec2(hash(vec3(id,1.3)),hash(vec3(id,4.7)));
      vec2 delta=neighbor+site-f;
      float d=dot(delta,delta);
      second=min(second,max(nearest,d));nearest=min(nearest,d);
    }
    float seam=sqrt(second)-sqrt(nearest);
    float crack=(1.-smoothstep(.018,.071,seam))*smoothstep(.32,.91,dry);
    fissure=crack;
    float leeward=sin(n.x*65.+n.y*40.+noise(n*9.)*5.);
    sand+=specks+.025*leeward+smoothstep(.045,.11,seam)*(1.-smoothstep(.11,.22,seam))*.035;
    sand=mix(sand,vec3(.46,.30,.17),crack*(.66+.24*noise(n*24.)));
    soil=mix(soil,sand,crust);
  }
  float grown=smoothstep(.02,.97,sown)*(timestamp<0.0?1.0:smoothstep(.0,2.7,time-timestamp))*(1.0-.56*stress);
  grown*=1.0-.65*smoothstep(.37,.91,stress)*max(nutrients,mound);
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
    float contour=(1.0-smoothstep(.025,.095,abs(fract(mound*5.0)-.5)))*smoothstep(.05,.27,mound);
    soilMap=mix(soilMap,vec3(.20,.37,.28),contour*.61);
    soilMap*=mix(.72,1.02,shade);
    color=mix(color,soilMap,soilView);
  }
  if(burnFront>-.1){
    float d=fireDistance(n), ash=ashCover(n,d);
    vec3 charcoal=mix(vec3(.20,.18,.17),vec3(.43,.39,.35),field+.21*litter)*(.78+.23*shade);
    charcoal*=1.-.36*fissure;
    float coals=smoothstep(.73,.90,noise(n*161.+2.))*smoothstep(.53,.68,field);
    float glow=.54+.24*sin(time*2.3+field*28.);
    float ember=(coals+.29*fissure*smoothstep(.56,.79,litter))*glow*(1.-regrowth);
    color=mix(color,charcoal+vec3(.82,.26,.038)*ember,ash);
  }
  color*=1.0-.26*grazingShade(n);
  gl_FragColor=vec4(color,1.0);
}`;

const bladeVertex = `
${burnField}
${pastureShadow}
varying float grazingShadow;
attribute vec3 root;
attribute vec3 outward;
attribute vec3 stalk;
attribute vec4 bladeStyle;
uniform vec3 hoofPrint;
uniform sampler2D seeds;
uniform sampler2D sownMap;
uniform sampler2D stressMap;
uniform sampler2D dryMap;
uniform sampler2D nutrientMap;
uniform sampler2D moundMap;
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
  grazingShadow=grazingShade(n);
  vec3 b=normalize(stalk);
  vec3 across=normalize(cross(b,n));
  vec2 uv=grassUV(n);
  float planted=texture2D(seeds,uv).r;
  float sown=texture2D(sownMap,uv).r;
  float stress=texture2D(stressMap,uv).r;
  float dry=texture2D(dryMap,uv).r;
  float nutrients=texture2D(nutrientMap,uv).r;
  enrichment=nutrients*(1.0-smoothstep(.29,.76,stress))*(1.0-dry);
  drying=max(stress,smoothstep(.06,.68,dry));
  float loss=smoothstep(.16+bladeStyle.w*.22,.76+bladeStyle.w*.12,dry);
  float grow=smoothstep(.10+bladeStyle.w*.23,.91,sown)*(planted<0.0?1.0:smoothstep(.02,2.7,time-planted))*(1.0-.94*stress)*(1.0-loss);
  float canopyPressure=nutrients*smoothstep(.52,.98,stress);
  float tuftVariation=fract(sin(dot(floor(root*3.0),vec3(12.3,27.1,43.8)))*4375.13);
  grow*=1.0-smoothstep(.16+.42*tuftVariation,.56+.38*tuftVariation,canopyPressure);
  grow*=(1.0+.39*enrichment)*(1.0-soilView);
  grow*=mix(.09,1.0,smoothstep(.18,.68,distance(root,hoofPrint)));
  if(burnFront>-.1)grow*=1.-ashCover(n,fireDistance(n));
  t=position.y;
  fold=position.x;
  colorway=bladeStyle.w;
  float wave=sin(dot(root,vec3(.84,.27,.43))-time*2.15);
  vec3 windDirection=vec3(1.0,.16,.32);
  vec3 breeze=(windDirection-n*dot(n,windDirection))*(.22+wave*.21)*wind;
  float width=bladeStyle.y*(.84+.22*sin(t*3.8))*(1.0-pow(t,1.28));
  vec3 lift=n*(bladeStyle.x*(t-.11*t*t*t) + width*(1.0-abs(fold))*.49);
  vec3 offset=across*width*fold+(b*bladeStyle.z+breeze)*bladeStyle.x*t*t;
  vec3 ground=root+n*(texture2D(moundMap,uv).r*${MOUND_LIMIT});
  vec3 p=ground+(lift+offset)*grow;
  vec3 face=normalize(normalMatrix * n);
  float light=dot(face,normalize(vec3(-.55,.62,.57)));
  sunlight=smoothstep(-.32,.85,light) + .034*wave*wind;
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);
  if(grow<.001) gl_Position=vec4(2.0,2.0,2.0,1.0);
}`;

const bladeFragment = `
varying float grazingShadow;
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
  color*=1.0-.25*grazingShadow*(1.0-.48*t);
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
    const daylightBackdrop = new THREE.Group();
    daylightBackdrop.add(
      makeBackdropLayer(14,14,[0,0,-6],"float a=(1.0-smoothstep(.54,1.0,length(p)))*.44;gl_FragColor=vec4(.998,.99,.76,a);"),
      makeBackdropLayer(11,1.1,[0,-5.45,-7],"float a=exp(-dot(p,p)*4.5)*(1.0-smoothstep(.64,1.0,length(p)))*.17;gl_FragColor=vec4(.21,.39,.27,a);"),
    );
    this.scene.add(daylightBackdrop);
    const updateBackdrop = () => { daylightBackdrop.visible = ecoTheme.mode === "light"; };
    updateBackdrop();
    document.addEventListener("ecovis-themechange", updateBackdrop);
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
    this.sownPixels=new Uint8Array(this.coverage.length);
    this.sownTexture=new THREE.DataTexture(this.sownPixels,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.UnsignedByteType);
    this.sownTexture.minFilter=this.sownTexture.magFilter=THREE.LinearFilter;
    this.sownTexture.wrapS=THREE.RepeatWrapping;
    this.sownTexture.needsUpdate=true;
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
    this.moundPixels=new Uint8Array(this.coverage.length);
    this.moundTexture=new THREE.DataTexture(this.moundPixels,MAP_WIDTH,MAP_HEIGHT,THREE.RedFormat,THREE.UnsignedByteType);
    this.moundTexture.minFilter=this.moundTexture.magFilter=THREE.LinearFilter;
    this.moundTexture.wrapS=THREE.RepeatWrapping;
    this.moundTexture.needsUpdate=true;
    this.soilView=false;
    this.soilOpacity={value:0};
    const geometry=new THREE.SphereGeometry(RADIUS,LONGITUDES,LATITUDES);
    const vertices=geometry.attributes.position;
    const directions=new Float32Array(vertices.count*3);
    this.baseRadii=new Float64Array(vertices.count);
    this.surfaceSamples=new Float32Array(vertices.count*2);
    for(let i=0;i<vertices.count;i++){
      const x=vertices.getX(i)/RADIUS, y=vertices.getY(i)/RADIUS, z=vertices.getZ(i)/RADIUS;
      directions.set([x,y,z],i*3);
      const r=RADIUS+naturalHeight(x,y,z);
      this.baseRadii[i]=r;
      this.surfaceSamples[i*2]=((Math.atan2(z,x)/TURN+1)%1)*MAP_WIDTH-.5;
      this.surfaceSamples[i*2+1]=Math.acos(clamp(y,-1,1))/Math.PI*MAP_HEIGHT-.5;
      vertices.setXYZ(i,x*r,y*r,z*r);
    }
    geometry.setAttribute("surfaceDir",new THREE.BufferAttribute(directions,3));
    this.smoothSurfaceNormals(geometry);
    this.herdShade={
      grazerCount:{value:0},
      hoofCenters:{value:Array.from({length:5},()=>new THREE.Vector4(0,0,0,1))},
      herdAxes:{value:Array.from({length:5},()=>new THREE.Vector3())}
    };
    this.fireUniforms={burnFront:{value:-1},regrowth:{value:0},burnOrigin:{value:new THREE.Vector3(0,0,1)}};
    this.surface=new THREE.Mesh(geometry,new THREE.ShaderMaterial({
      vertexShader:surfaceVertex,fragmentShader:surfaceFragment,
      uniforms:{...this.herdShade,...this.fireUniforms,bed:{value:new THREE.Vector3()},wet:{value:0},ring:{value:-1},softShadow:{value:0},
        seeds:{value:this.paintTexture},sownMap:{value:this.sownTexture},stressMap:{value:this.stressTexture},dryMap:{value:this.dryTexture},
        nutrientMap:{value:this.nutrientTexture},moundMap:{value:this.moundTexture},soilView:this.soilOpacity,time:{value:0}},
    }));
    this.planet.add(this.surface);
    this.cursor=this.makeRing(SEED_ANGLE,.007,0xfff8dc);
    this.cursor.visible=false;
    this.planet.add(this.cursor);
    this.sowHint=this.makeRing(SEED_ANGLE,.005,0xfff4cf);
    this.sowHint.visible=false;
    this.planet.add(this.sowHint);
    this.scale=1;
    new ResizeObserver(()=>this.resize()).observe(canvas);
    this.resize();
    this.shrubHighlight=new ShrubHighlight(this);
    this.renderer.setAnimationLoop(()=>this.render());
  }

  resize() {
    const {width,height}=this.canvas.getBoundingClientRect();
    if(!width||!height) return;
    this.pixelsPerUnit=Math.min(width*.405,height*.355)/RADIUS;
    this.camera.left=-width/(2*this.pixelsPerUnit);
    this.camera.right=-this.camera.left;
    this.camera.top=height/(2*this.pixelsPerUnit);
    this.camera.bottom=-this.camera.top;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,width<560?1.45:1.65));
    this.renderer.setSize(width,height,false);
    if(this.observation)this.renderer.render(this.scene,this.camera);
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
    const hit=this.ray.intersectObjects(this.saplings.children.filter(shrub=>shrub.visible),true)[0]
      ??this.shrubHighlight.naturalHit(this.ray);
    if(!hit)return null;
    const ground=this.ray.intersectObject(this.surface)[0];
    if(ground&&ground.distance<hit.distance)return null;
    let shrub=hit.object;
    while(shrub.parent!==this.saplings)shrub=shrub.parent;
    return shrub;
  }

  dragTurn(x0,y0,x1,y1) {
    if(x0!==x1||y0!==y1)this.onManualOrbit?.();
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
    this.onManualOrbit?.();
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
    const {x,y,z}=direction;
    const u=((Math.atan2(z,x)/TURN+1)%1)*MAP_WIDTH-.5;
    const v=Math.acos(clamp(y,-1,1))/Math.PI*MAP_HEIGHT-.5;
    return RADIUS+naturalHeight(x,y,z)+this.moundAt(u,v);
  }

  moundAt(u,v) {
    const x=Math.floor(u),y=Math.floor(v),fx=u-x,fy=v-y;
    const left=(x+MAP_WIDTH)%MAP_WIDTH,right=(left+1)%MAP_WIDTH;
    const north=clamp(y,0,MAP_HEIGHT-1)*MAP_WIDTH,south=clamp(y+1,0,MAP_HEIGHT-1)*MAP_WIDTH;
    const a=this.moundPixels[north+left]*(1-fx)+this.moundPixels[north+right]*fx;
    const b=this.moundPixels[south+left]*(1-fx)+this.moundPixels[south+right]*fx;
    return (a*(1-fy)+b*fy)*(MOUND_LIMIT/255);
  }

  setMounds(field) {
    let changed=false,peak=0;
    for(let i=0;i<this.moundPixels.length;i++){
      const value=field?Math.round(clamp(field[i],0,1)*255):0;
      if(value!==this.moundPixels[i]){
        changed=true;
        this.moundPixels[i]=value;
      }
      peak=Math.max(peak,value);
    }
    if(changed){
      this.moundTexture.needsUpdate=true;
      const {geometry}=this.surface;
      const {position,surfaceDir}=geometry.attributes;
      for(let i=0;i<position.count;i++){
        const r=this.baseRadii[i]+this.moundAt(this.surfaceSamples[i*2],this.surfaceSamples[i*2+1]);
        position.setXYZ(i,surfaceDir.getX(i)*r,surfaceDir.getY(i)*r,surfaceDir.getZ(i)*r);
      }
      position.needsUpdate=true;
      this.smoothSurfaceNormals(geometry);
      for(const shrub of this.saplings.children){
        const direction=shrub.userData.direction;
        shrub.position.copy(direction).multiplyScalar(this.radiusAt(direction)-.015);
      }
    }
    return peak*(MOUND_LIMIT/255);
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

  showSowHint(active) {
    if(!active){this.sowHint.visible=false;return;}
    if(this.sowHint.visible)return;
    const direction=FRONT.clone().applyQuaternion(this.planet.quaternion.clone().invert());
    this.placeRing(this.sowHint,direction,.035);
    this.sowHint.material.opacity=.65;
    this.sowHintStart=this.clock.getElapsedTime();
  }

  positionSapling(sapling, point) {
    sapling.position.copy(point).multiplyScalar(this.radiusAt(point)-.015);
    sapling.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),point);
    sapling.rotateY(.9+this.saplings.children.length*2.4);
    sapling.scale.setScalar(SAPLING_SCALE);
  }

  lightSaplings() {
    if(this.saplingLights)return;
    const sky=new THREE.HemisphereLight(0xfff4e5,0x8d9986,1.48);
    const sun=new THREE.DirectionalLight(0xfff3e6,2.22);
    const rim=new THREE.DirectionalLight(0xe3f3ff,1.0);
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
    if(this.saplingPreviewTemplate!==template){
      if(this.saplingPreview){
        this.saplingPreview.traverse(child=>{if(child.isMesh)child.material.dispose();if(child.isInstancedMesh)child.dispose();});
        this.planet.remove(this.saplingPreview);
      }
      this.saplingPreviewTemplate=template;
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
        const r=RADIUS+naturalHeight(n.x,n.y,n.z)-.015;
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
      uniforms:{...this.herdShade,...this.fireUniforms,hoofPrint:{value:new THREE.Vector3()},seeds:{value:this.paintTexture},sownMap:{value:this.sownTexture},stressMap:{value:this.stressTexture},dryMap:{value:this.dryTexture},
        nutrientMap:{value:this.nutrientTexture},moundMap:{value:this.moundTexture},soilView:this.soilOpacity,time:{value:0},wind:{value:this.motion?1:0}},
    }));
    this.grass.frustumCulled=false;
    this.planet.add(this.grass);
  }

  scatterSeeds(point) {
    this.clearSowing();
    const layer=new THREE.Group(), kernel=new THREE.SphereGeometry(1,8,5);
    const tawny=new THREE.MeshStandardMaterial({color:0xfadd80,roughness:.94});
    const seed=new THREE.InstancedMesh(kernel,tawny,55);
    const [east,north]=tangentFrame(point), random=randomSource(7512), stamp=new THREE.Object3D();
    const paths=[];
    const origin=point.clone().multiplyScalar(this.radiusAt(point)+.58).addScaledVector(east,-.58);
    for(let i=0;i<seed.count;i++){
      const direction=i===0?point:onSurface(point,east,north,.32*Math.sqrt(random()),random()*TURN);
      stamp.position.copy(direction).multiplyScalar(this.radiusAt(direction)+.022);
      stamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction);
      stamp.rotateY(random()*TURN);
      stamp.scale.set(.031,.021,.076);
      stamp.updateMatrix();
      seed.setMatrixAt(i,stamp.matrix);
      paths.push({end:stamp.position.clone(),rotation:stamp.quaternion.clone(),arc:.22+random()*.54,delay:random()*.36});
    }
    layer.add(seed);
    this.planet.add(layer);
    this.lightSaplings();
    this.sowing={layer,seed,kernel,tawny,paths,origin,point,stamp,start:this.clock.getElapsedTime(),settled:!this.motion};
    seed.frustumCulled=false;
    this.updateSowing(this.sowing.start);
  }

  updateSowing(time) {
    const sowing=this.sowing;
    if(!sowing||sowing.settled)return;
    const {seed,paths,origin,point,stamp,start}=sowing;
    paths.forEach(({end,rotation,arc,delay},i)=>{
      const t=clamp((time-start-delay)/.95,0,1);
      stamp.position.lerpVectors(origin,end,t).addScaledVector(point,4*t*(1-t)*arc);
      stamp.quaternion.copy(rotation);
      stamp.rotateX((1-t)*(i%2?3.1:-2.6));
      stamp.scale.set(.031,.021,.076).multiplyScalar(clamp(t*9,0,1));
      stamp.updateMatrix();seed.setMatrixAt(i,stamp.matrix);
    });
    seed.instanceMatrix.needsUpdate=true;
    sowing.settled=time-start>=1.32;
  }

  clearSowing() {
    if(!this.sowing)return;
    const {layer,kernel,tawny,seed}=this.sowing;
    this.planet.remove(layer);
    for(const asset of [kernel,tawny,seed])asset.dispose();
    this.sowing=null;
  }

  prepareMeadow(origin) {
    this.buildGrass();
    const now=this.clock.getElapsedTime();
    for(let i=0;i<this.coverage.length;i++){
      const j=i*3;
      const dot=this.cellDirs[j]*origin.x+this.cellDirs[j+1]*origin.y+this.cellDirs[j+2]*origin.z;
      this.coverage[i]=now+.5+(1-dot)*2.5;
    }
    this.clearSowing();
    this.sownPixels.fill(255);
    this.coveredWeight=this.totalWeight;
    this.sownTexture.needsUpdate=true;
    this.paintTexture.needsUpdate=true;
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
        this.sownPixels[i]=255;
        this.coveredWeight+=this.rowWeights[Math.floor(i/MAP_WIDTH)];
      }
    }
    if(this.coveredWeight>=this.totalWeight*.965){
      for(let i=0;i<this.coverage.length;i++)if(this.coverage[i]<0)this.coverage[i]=now+.12;
      this.sownPixels.fill(255);
      this.coveredWeight=this.totalWeight;
    }
    this.paintTexture.needsUpdate=true;
    this.sownTexture.needsUpdate=true;
    return this.coveredWeight/this.totalWeight;
  }

  cellIndex(direction) {
    const longitude=(Math.atan2(direction.z,direction.x)/TURN+1)%1;
    const row=Math.min(MAP_HEIGHT-1,Math.floor(Math.acos(clamp(direction.y,-1,1))/Math.PI*MAP_HEIGHT));
    return row*MAP_WIDTH+Math.floor(longitude*MAP_WIDTH);
  }

  grassAt(direction) {
    const index=this.cellIndex(direction);
    return this.coverage[index]>=0&&this.dryGround[index]<.84;
  }

  reset() {
    this.shrubHighlight.clear();
    this.clearSowing();
    this.previewSapling(null,null);
    for(const shrub of this.saplings.children)shrub.traverse(child=>{if(child.isInstancedMesh)child.dispose();});
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
    this.sownPixels.fill(0);
    this.sownTexture.needsUpdate=true;
    this.stress.fill(0);
    this.stressTexture.needsUpdate=true;
    this.dryGround.fill(0);
    this.dryPixels.fill(0);
    this.dryTexture.needsUpdate=true;
    this.nutrientPixels.fill(0);
    this.nutrientTexture.needsUpdate=true;
    this.setMounds(null);
    this.soilView=false;
    this.soilOpacity.value=0;
    this.coveredWeight=0;
    this.sowHint.visible=false;
    this.resetView();
  }

  render() {
    const time=this.clock.getElapsedTime();
    if(this.observation){this.observation.frame(time);return;}
    this.updateSowing(time);
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
    if(this.motion&&this.sowHint.visible){
      const phase=Math.min(2,(time-this.sowHintStart)/1.35);
      this.sowHint.material.opacity=.65+.22*Math.sin(phase*Math.PI*2);
    }
    this.shrubHighlight.update(time);
    this.renderer.render(this.scene,this.camera);
    this.shrubHighlight.draw();
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
