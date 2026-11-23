"use strict";

// Render the selected foliage into a mask. Blurring only its outer edge keeps
// gaps between branches visible and includes the fruit and the current leaf shape.
class ShrubHighlight {
  constructor(world){
    this.world=world;
    this.target=null;
    this.hovered=false;
    this.amount=0;
    this.baseScale=new THREE.Vector3();
    this.displayScale=new THREE.Vector3();
    this.depthLayer=27;
    this.plantLayer=28;
    world.surface.layers.enable(this.depthLayer);
  }
  setTarget(plant){
    this.hovered=!!plant;
    if(!plant||plant===this.target)return;
    this.clear();
    this.target=plant;
    this.hovered=true;
    this.baseScale.copy(plant.scale);
    this.lastTime=this.world.clock.getElapsedTime();
    for(const other of this.world.saplings.children){
      other.traverse(node=>{
        if(!node.isMesh)return;
        node.layers.enable(this.depthLayer);
        if(other===plant)node.layers.enable(this.plantLayer);
      });
    }
  }
  clear(){
    if(this.target){
      this.target.scale.copy(this.baseScale);
      this.target.traverse(node=>node.layers.disable(this.plantLayer));
    }
    this.target=null;this.hovered=false;this.amount=0;
  }
  update(time){
    if(!this.target)return;
    if(!this.target.visible||!this.target.parent){this.clear();return;}
    const dt=clamp(time-this.lastTime,0,.25);
    this.lastTime=time;
    const goal=this.hovered?1:0;
    this.amount=this.world.motion?THREE.MathUtils.lerp(this.amount,goal,1-Math.exp(-17*dt)):goal;
    if(!this.hovered&&this.amount<.006){this.clear();return;}
    this.target.scale.copy(this.baseScale).multiplyScalar(1+.09*this.amount);
  }

  naturalHit(raycaster){
    // Expansion can move a thin leaf away from the pointer that selected it.
    const plant=this.target;
    if(!plant?.visible||this.amount<.003)return null;
    this.displayScale.copy(plant.scale);
    plant.scale.copy(this.baseScale);
    plant.updateWorldMatrix(false,true);
    try{
      return raycaster.intersectObject(plant,true)[0];
    }finally{
      plant.scale.copy(this.displayScale);
      plant.updateWorldMatrix(false,true);
    }
  }

  prepare(){
    if(this.mask)return;
    this.mask=new THREE.WebGLRenderTarget(1,1);
    this.blur=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false});
    this.occluder=new THREE.MeshBasicMaterial({colorWrite:false});
    this.solid=new THREE.MeshBasicMaterial();
    this.pixel=new THREE.Vector2();
    const vertexShader="varying vec2 tex;void main(){tex=uv;gl_Position=vec4(position.xy,0.,1.);}";
    const uniforms={mask:{value:this.mask.texture},blurred:{value:this.blur.texture},pixel:{value:this.pixel},amount:{value:0}};
    this.horizontal=new THREE.ShaderMaterial({uniforms,vertexShader,depthTest:false,depthWrite:false,
      fragmentShader:`uniform sampler2D mask;uniform vec2 pixel;varying vec2 tex;
        float readMask(float x){return texture2D(mask,tex+vec2(x*pixel.x,0.)).a;}
        void main(){
          float m=readMask(0.);
          float blur=.23*m+.315*(readMask(2.7)+readMask(-2.7))+.07*(readMask(6.3)+readMask(-6.3));
          float line=max(m,max(readMask(1.45),readMask(-1.45)));
          gl_FragColor=vec4(blur,line,0.,1.);
        }`});
    this.composite=new THREE.ShaderMaterial({uniforms,vertexShader,depthTest:false,depthWrite:false,transparent:true,
      fragmentShader:`uniform sampler2D mask,blurred;uniform vec2 pixel;uniform float amount;varying vec2 tex;
        vec2 band(float y){return texture2D(blurred,tex+vec2(0.,y*pixel.y)).rg;}
        void main(){
          float outside=1.-texture2D(mask,tex).a;
          vec2 center=band(0.);
          float blur=.23*center.r+.315*(band(2.7).r+band(-2.7).r)+.07*(band(6.3).r+band(-6.3).r);
          float line=max(center.g,max(band(1.45).g,band(-1.45).g));
          float glow=1.-exp(-4.6*blur);
          gl_FragColor=vec4(mix(vec3(1.,.76,.27),vec3(1.,.995,.82),line),outside*amount*max(line,glow));
        }`});
    this.screen=new THREE.Scene();
    this.quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.horizontal);
    this.quad.frustumCulled=false;
    this.screen.add(this.quad);
    this.screenCamera=new THREE.Camera();
  }

  draw(){
    if(!this.target||this.amount<.003)return;
    this.prepare();
    const {renderer,scene,camera,canvas}=this.world;
    const width=Math.max(1,canvas.clientWidth),height=Math.max(1,canvas.clientHeight);
    this.mask.setSize(width,height);this.blur.setSize(width,height);
    this.pixel.set(1/width,1/height);
    this.composite.uniforms.amount.value=this.amount;
    const output=renderer.getRenderTarget(),layers=camera.layers.mask,material=scene.overrideMaterial,autoClear=renderer.autoClear;
    try{
      renderer.autoClear=false;
      renderer.setRenderTarget(this.mask);
      renderer.clear();
      camera.layers.set(this.depthLayer);scene.overrideMaterial=this.occluder;
      renderer.render(scene,camera);
      camera.layers.set(this.plantLayer);scene.overrideMaterial=this.solid;
      renderer.render(scene,camera);
      renderer.setRenderTarget(this.blur);
      this.quad.material=this.horizontal;
      renderer.render(this.screen,this.screenCamera);
      renderer.setRenderTarget(output);
      this.quad.material=this.composite;
      renderer.render(this.screen,this.screenCamera);
    }finally{
      camera.layers.mask=layers;scene.overrideMaterial=material;renderer.autoClear=autoClear;
      renderer.setRenderTarget(output);
    }
  }
}
