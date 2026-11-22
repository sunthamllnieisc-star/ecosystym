"use strict";

let saplingTemplate;
let berryGeometry, berryMaterial;

// Attachment points sampled along the eight branches of the painted model.
const berryBranches=[
  [.275,.531,-.014],[.366,.680,-.023],[.432,.816,-.035],
  [.008,.463,-.260],[.019,.593,-.346],[.037,.712,-.406],
  [-.229,.474,-.131],[-.305,.607,-.174],[-.362,.728,-.205],
  [-.234,.422,.167],[-.307,.540,.229],[-.355,.648,.280],
  [.136,.453,.234],[.174,.580,.316],[.194,.696,.378],
  [-.071,.635,-.044],[-.095,.813,-.052],[-.114,.976,-.053],
  [.158,.322,-.167],[.210,.403,-.223],[.248,.481,-.264],
  [-.029,.338,.207],[-.043,.423,.274],[-.058,.505,.322],
];

function matureCrown(x,y,z) {
  const height=clamp(y,0,1.5);
  const spread=1+.30*height;
  return [x*spread,y+.21*height*height,z*spread];
}

function createBerryClusters(shrub) {
  berryGeometry??=new THREE.SphereGeometry(1,12,9);
  berryMaterial??=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.63});
  const random=randomSource(971);
  const fruit=berryBranches.flatMap(([x,y,z],cluster)=>{
    const count=3+cluster%2;
    const start=random()*.54+2.16;
    return Array.from({length:count},(_,i)=>{
      const angle=cluster*.92+i*TURN/count;
      const ring=.043+random()*.013;
      const site=[x+ring*Math.cos(angle),y+(i-(count-1)/2)*.035,z+ring*Math.sin(angle)];
      return {site,mature:matureCrown(...site),start:start+i*.09,size:.035+random()*.014};
    });
  });
  const mesh=new THREE.InstancedMesh(berryGeometry,berryMaterial,fruit.length);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  mesh.raycast=()=>{};
  shrub.add(mesh);
  return {mesh,fruit};
}

function growSeaBuckthorn(shrub,age) {
  const previousAge=shrub.userData.age;
  shrub.userData.age=age;
  if(previousAge>=4.25&&age>=4.25)return;
  const crown=meadowEase(clamp(age/2.5,0,1));
  shrub.scale.setScalar(SAPLING_SCALE+.67*crown);
  for(const child of shrub.children){
    if(child.morphTargetInfluences)child.morphTargetInfluences[0]=crown;
  }
  if(age<2.16){
    if(shrub.userData.berries)shrub.userData.berries.mesh.visible=false;
    return;
  }
  const {mesh,fruit}=shrub.userData.berries??=createBerryClusters(shrub);
  mesh.visible=true;
  const berry=new THREE.Object3D();
  const target=new THREE.Vector3();
  const green=new THREE.Color(0xd1c261), orange=new THREE.Color(0xf88924), color=new THREE.Color();
  fruit.forEach(({site,mature,start,size},index)=>{
    const progress=clamp((age-start)/1.25,0,1);
    const elongation=size*meadowEase(progress);
    berry.position.set(...site).lerp(target.set(...mature),crown);
    berry.scale.set(elongation,elongation*1.16,elongation*.95);
    berry.updateMatrix();
    mesh.setMatrixAt(index,berry.matrix);
    mesh.setColorAt(index,color.copy(green).lerp(orange,meadowEase(progress)));
  });
  mesh.instanceMatrix.needsUpdate=true;
  mesh.instanceColor.needsUpdate=true;
}

function loadSeaBuckthorn() {
  if(!saplingTemplate) {
    saplingTemplate=readSaplingAsset().then(buildSapling).catch(error=>{
      saplingTemplate=null;
      throw error;
    });
  }
  return saplingTemplate;
}

function readSaplingAsset() {
  return new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src="assets/sea-buckthorn.js";
    script.onload=()=>{
      const asset=globalThis.ecovisSaplingAsset;
      delete globalThis.ecovisSaplingAsset;
      script.remove();
      if(asset)resolve(asset);
      else reject(new Error("Sea buckthorn asset is empty."));
    };
    script.onerror=()=>{
      script.remove();
      reject(new Error("Sea buckthorn asset could not load."));
    };
    document.head.append(script);
  });
}

function saplingArray(data, Type) {
  const bytes=atob(data);
  const buffer=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)buffer[i]=bytes.charCodeAt(i);
  return new Type(buffer.buffer);
}

async function buildSapling(asset) {
  const loader=new THREE.TextureLoader();
  const textures=await Promise.all(asset.images.map(async src=>{
    const texture=await loader.loadAsync(src);
    texture.flipY=false;
    texture.anisotropy=4;
    return texture;
  }));
  const textureAt=info=>info?textures[asset.textureSources[info.index]]:null;
  const materials=asset.materials.map(({pbrMetallicRoughness:pbr})=>{
    const map=textureAt(pbr.baseColorTexture);
    if(map)map.colorSpace=THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({
      map,roughness:pbr.roughnessFactor,metalness:pbr.metallicFactor,
    });
  });
  const plant=new THREE.Group();
  for(const mesh of asset.meshes){
    const geometry=new THREE.BufferGeometry();
    const positions=saplingArray(mesh.position,Float32Array);
    geometry.setAttribute("position",new THREE.BufferAttribute(positions,3));
    const grown=new Float32Array(positions.length);
    for(let i=0;i<positions.length;i+=3){
      grown.set(matureCrown(positions[i],positions[i+1],positions[i+2]),i);
    }
    geometry.morphAttributes.position=[new THREE.BufferAttribute(grown,3)];
    geometry.setAttribute("normal",new THREE.BufferAttribute(saplingArray(mesh.normal,Float32Array),3));
    geometry.setAttribute("uv",new THREE.BufferAttribute(saplingArray(mesh.uv,Float32Array),2));
    geometry.setIndex(new THREE.BufferAttribute(saplingArray(mesh.indices,Uint16Array),1));
    plant.add(new THREE.Mesh(geometry,materials[mesh.material]));
  }
  return plant;
}
