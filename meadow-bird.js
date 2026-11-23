"use strict";

let birdArtRequest;
function loadMeadowBirdArt(){
  if(typeof meadowBirdBinary!=="undefined")return Promise.resolve();
  if(!birdArtRequest){
    birdArtRequest=new Promise((resolve,reject)=>{
      const script=document.createElement("script");
      script.src="assets/meadow-bird.js";
      script.onload=resolve;
      script.onerror=()=>{script.remove();reject(new Error("Bird model unavailable"));};
      document.head.append(script);
    }).catch(error=>{birdArtRequest=null;throw error;});
  }
  return birdArtRequest;
}

// The bird is authored as an indexed GLB with painted plumage and three feather morphs.
// Its embedded buffer also works when the static game is opened from disk.
function createMeadowBird(){
  const decoded=atob(meadowBirdBinary),bytes=new Uint8Array(decoded.length);
  for(let i=0;i<bytes.length;i++)bytes[i]=decoded.charCodeAt(i);
  const header=new DataView(bytes.buffer);
  const jsonLength=header.getUint32(12,true);
  const art=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jsonLength)));
  const start=28+jsonLength;
  const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const storage={5121:Uint8Array,5123:Uint16Array,5126:Float32Array};
  function attribute(index){
    const a=art.accessors[index],view=art.bufferViews[a.bufferView],size=sizes[a.type];
    const data=new storage[a.componentType](bytes.buffer,start+(view.byteOffset||0)+(a.byteOffset||0),a.count*size);
    return new THREE.BufferAttribute(data,size,!!a.normalized);
  }
  const maps=art.images.map(img=>{
    const view=art.bufferViews[img.bufferView],offset=start+view.byteOffset;
    const url=URL.createObjectURL(new Blob([bytes.subarray(offset,offset+view.byteLength)],{type:img.mimeType}));
    const release=()=>URL.revokeObjectURL(url);
    const map=new THREE.TextureLoader().load(url,release,undefined,release);
    map.flipY=false;map.colorSpace=THREE.SRGBColorSpace;
    return map;
  });
  const materials=art.materials.map(spec=>{
    const p=spec.pbrMetallicRoughness;
    return new THREE.MeshStandardMaterial({name:spec.name,vertexColors:true,roughness:p.roughnessFactor,
      metalness:0,map:p.baseColorTexture?maps[p.baseColorTexture.index]:null});
  });
  const joints=new Set(art.skins.flatMap(skin=>skin.joints));
  const nodes=art.nodes.map((node,index)=>{
    let object;
    if(node.mesh===undefined)object=joints.has(index)?new THREE.Bone():new THREE.Group();
    else{
      const primitive=art.meshes[node.mesh].primitives[0],g=new THREE.BufferGeometry(),a=primitive.attributes;
      for(const [semantic,name] of Object.entries({POSITION:"position",NORMAL:"normal",COLOR_0:"color",TEXCOORD_0:"uv",JOINTS_0:"skinIndex",WEIGHTS_0:"skinWeight"})){
        if(a[semantic]!==undefined)g.setAttribute(name,attribute(a[semantic]));
      }
      g.setIndex(attribute(primitive.indices));
      if(primitive.targets){
        g.morphAttributes.position=primitive.targets.map(t=>attribute(t.POSITION));
        g.morphAttributes.normal=primitive.targets.map(t=>attribute(t.NORMAL));
        g.morphTargetsRelative=true;
      }
      object=node.skin===undefined?new THREE.Mesh(g,materials[primitive.material]):new THREE.SkinnedMesh(g,materials[primitive.material]);
    }
    object.name=node.name;
    if(node.translation)object.position.fromArray(node.translation);
    return object;
  });
  art.nodes.forEach((n,i)=>n.children?.forEach(child=>nodes[i].add(nodes[child])));
  const root=nodes[art.scenes[art.scene].nodes[0]];
  root.rotation.order="ZYX";root.updateMatrixWorld(true);
  const skeletons=art.skins.map(skin=>{
    const inverse=attribute(skin.inverseBindMatrices).array;
    return new THREE.Skeleton(skin.joints.map(i=>nodes[i]),skin.joints.map((_,i)=>new THREE.Matrix4().fromArray(inverse,i*16)));
  });
  art.nodes.forEach((n,i)=>{if(n.skin!==undefined)nodes[i].bind(skeletons[n.skin]);});

  const performance=art.animations[0];
  const tracks=performance.channels.map(channel=>{
    const {node,path}=channel.target,sampler=performance.samplers[channel.sampler];
    const times=attribute(sampler.input).array,values=attribute(sampler.output).array;
    const object=nodes[node];
    if(path==="rotation")return new THREE.QuaternionKeyframeTrack(object.uuid+".quaternion",times,values);
    if(path==="weights")return new THREE.NumberKeyframeTrack(object.uuid+".morphTargetInfluences[0]",times,values);
    return new THREE.VectorKeyframeTrack(object.uuid+(path==="translation"?".position":".scale"),times,values);
  });
  const clip=new THREE.AnimationClip(performance.name,-1,tracks);
  const mixer=new THREE.AnimationMixer(root),action=mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  const fruit=root.getObjectByName("Sea buckthorn berry"),grip=fruit.position.clone();
  function perform(seconds,reduced){
    action.paused=false;action.setEffectiveWeight(reduced ? .75 : 1);
    mixer.setTime(Math.min(seconds,clip.duration-.0001));root.updateMatrixWorld(true);
  }
  function socket(out){return root.worldToLocal(fruit.parent.localToWorld(out.copy(grip)));}
  function dispose(){
    mixer.stopAllAction();mixer.uncacheRoot(root);
    for(const skeleton of skeletons)skeleton.dispose();
  }
  return {root,fruit,perform,socket,dispose};
}
