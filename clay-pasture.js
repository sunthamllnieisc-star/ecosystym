"use strict";

// Original pocket-sized clay figures. All parts on a rigid joint share a draw
// call; the walking animals and their inventory previews share the same molds.
const pastureClay = (() => {
  const TAU = Math.PI * 2;
  const palette = {
    hide: "#b35e39", piebald: "#edce9f", blaze: "#ad5936", cream: "#f2d9ad",
    wool: "#ecd1a0", curl: "#f3dcb0", face: "#936544", pink: "#d59880",
    hoof: "#5d4034", eye: "#342823", horn: "#debc88", slip: "#784631",
    kernel: "#8b472d", hilum: "#dcad66", leaf: "#8aab57", glint: "#ffe8bf",
    stocking: "#e9caa1", cowEar: "#b96b49", eweEar: "#926248"
  };
  const keys = Object.keys(palette);
  const tile = 192, size = tile * 4, height = tile * Math.ceil(keys.length / 4);
  const cache = new Map();
  let slip;

  function paints() {
    if (!slip) slip=createPastureCoatMaterial(keys);
    return slip;
  }

  // Each section [z, half-width, half-height, center-y, center-x] describes a
  // cross-section of the sculpt. The extra rings make continuous shoulders,
  // tapering fetlocks, cheekbones, and pinched seed ends.
  function loft(rows) {
    return (u,v) => {
      const f=v*(rows.length-1), i=Math.min(rows.length-2,Math.floor(f)), t=f-i;
      const a=rows[i], b=rows[i+1], k=n=>(a[n]||0)*(1-t)+(b[n]||0)*t;
      return [k(4)+Math.cos(TAU*u)*k(1), k(3)+Math.sin(TAU*u)*k(2), k(0)];
    };
  }
  function ellipse(u,v) {
    const a=TAU*u, b=(v-.5)*Math.PI, r=Math.max(.0001,Math.cos(b));
    return [r*Math.cos(a),r*Math.sin(a),Math.sin(b)];
  }
  const group = (parent,name,...position) => {
    const g=new THREE.Group(); g.name=name;
    if(position.length) g.position.set(...position);
    parent.add(g); return g;
  };
  class ClayPieces {
    constructor(parent) {
      this.parent=parent; this.pos=[]; this.uv=[]; this.tri=[]; this.seams=[]; this.tints=[];
    }
    form(name,shape,p=[0,0,0],scale=[1,1,1],angles=[0,0,0],cols=20,rows=14,planar=false) {
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...p),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...angles)),new THREE.Vector3(...scale));
      const idx=keys.indexOf(name),offset=this.pos.length/3,vert=new THREE.Vector3();
      for(let j=0;j<=rows;j++) {
        for(let i=0;i<=cols;i++){
          const u=i/cols,v=j/rows,xyz=shape(u,v);
          const tint=xyz[3]??1;
          this.tints.push(tint,tint,tint);
          const tx=planar?THREE.MathUtils.clamp(.5+.49*xyz[0],0,1):u;
          const ty=planar?THREE.MathUtils.clamp(.5-.49*xyz[1],0,1):1-v;
          this.uv.push(((idx%4)*tile+3+tx*(tile-6))/size,
            1-(Math.floor(idx/4)*tile+3+ty*(tile-6))/height);
          vert.set(...xyz).applyMatrix4(matrix); this.pos.push(vert.x,vert.y,vert.z);
          if(i<cols && j<rows) {
            const a=offset+j*(cols+1)+i,b=a+cols+1;
            this.tri.push(a,a+1,b,b,a+1,b+1);
          }
        }
        this.seams.push([offset+j*(cols+1),offset+j*(cols+1)+cols]);
      }
    }
    oval(name,p,scale,angles,cols,rows) {this.form(name,ellipse,p,scale,angles,cols,rows);}
    finish(){
      if(!this.pos.length)return;
      const geo=new THREE.BufferGeometry();
      geo.setAttribute("position",new THREE.Float32BufferAttribute(this.pos,3));
      geo.setAttribute("color",new THREE.Float32BufferAttribute(this.tints,3));
      geo.setAttribute("uv",new THREE.Float32BufferAttribute(this.uv,2));
      geo.setIndex(this.tri); geo.computeVertexNormals();
      const normals=geo.getAttribute("normal"), a=new THREE.Vector3(), b=new THREE.Vector3();
      for(const [i,j] of this.seams) {
        a.fromBufferAttribute(normals,i).add(b.fromBufferAttribute(normals,j)).normalize();
        normals.setXYZ(i,a.x,a.y,a.z); normals.setXYZ(j,a.x,a.y,a.z);
      }
      const mesh=new THREE.Mesh(geo,paints()); this.parent.add(mesh);
    }
  }
  // Smooth the radius and the mass center independently along each loft.
  // Front and back are +Z and -Z. Dimensions are in unscaled model space.
  function spline(rows, v) {
    const f=v*(rows.length-1), i=Math.min(rows.length-2,Math.floor(f)), t=f-i;
    const a=rows[Math.max(0,i-1)],b=rows[i],c=rows[i+1],d=rows[Math.min(rows.length-1,i+2)];
    return b.map((x,j)=>x+.5*t*((c[j]-a[j])+t*(2*a[j]-5*x+4*c[j]-d[j]+t*(3*x-3*c[j]+d[j]-a[j]))));
  }
  function mass(sections, sculpt) {
    return (u,v)=>{
      const [z,width,bottom,top]=spline(sections,v), a=u*TAU;
      const sy=Math.sin(a),cx=Math.cos(a);
      const q=[cx*Math.max(.0001,width),(top+bottom)/2+sy*(top-bottom)/2,z];
      return sculpt?sculpt(q,u,v,cx,sy):q;
    };
  }
  // A pinched strip of clay laid along a three-dimensional curve.
  function roll(piece,region,points,radius,flat=1){
    const shape=(u,v)=>{
      const pos=spline(points,v),before=spline(points,Math.max(0,v-.006)),after=spline(points,Math.min(1,v+.006));
      const axis=new THREE.Vector3(after[0]-before[0],after[1]-before[1],after[2]-before[2]).normalize();
      const other=Math.abs(axis.x)<.85?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
      other.addScaledVector(axis,-other.dot(axis)).normalize();
      const n=new THREE.Vector3().crossVectors(axis,other);
      const amp=radius*Math.pow(Math.max(.0001,Math.sin(Math.PI*v)),.30)*(pos[3]??1);
      const c=amp*Math.cos(u*TAU),s=amp*Math.sin(u*TAU)*flat;
      return [pos[0]+other.x*c+n.x*s,pos[1]+other.y*c+n.y*s,pos[2]+other.z*c+n.z*s];
    };
    piece.form(region,shape,[0,0,0],[1,1,1],[],8,Math.max(12,points.length*4));
  }
  const calfTrunk=mass([
    [-.55,.012,.557,.619],[-.536,.109,.48,.716],[-.48,.181,.411,.774],
    [-.38,.207,.35,.794],[-.26,.207,.355,.784],[-.14,.211,.37,.773],
    [-.025,.221,.369,.772],[.085,.223,.365,.786],[.17,.205,.363,.813],
    [.234,.184,.378,.802],[.282,.145,.402,.754],[.31,.091,.448,.703],[.322,.014,.543,.633]
  ],(p,u,v,c,s)=>{
    const flank=Math.exp(-Math.pow((p[2]+.25)/.105,2));
    p[0]*=1-.055*flank*(1-s*s);
    p[1]+=.015*Math.cos(u*TAU*2)*flank*(1-s*s);
    p[3]=.89+.11*(s*.5+.5);
    return p;
  });
  const calfNeck=mass([
    [-.095,.045,-.068,.064],[-.06,.119,-.142,.122],[-.002,.148,-.183,.145],
    [.085,.14,-.144,.164],[.14,.115,-.092,.189],[.20,.096,-.039,.201],[.24,.06,.021,.167],[.25,.008,.08,.115]
  ]);
  const calfSkull=mass([
    [.10,.031,.082,.174],[.123,.100,.007,.250],[.174,.133,-.014,.284],
    [.216,.144,-.019,.301],[.254,.142,-.022,.288],[.293,.136,-.016,.257],
    [.337,.117,-.020,.205],[.377,.097,-.034,.150],[.409,.087,-.048,.109],
    [.441,.086,-.063,.074],[.463,.049,-.063,.038],[.469,.002,-.018,-.012]
  ],(p,u,v,c,s)=>{
    // A calf has prominent cheeks, a narrowing bridge and a broad poll.
    p[0]*=1+.075*Math.exp(-((p[2]-.296)**2)/.0012)*Math.max(0,-s);
    return p;
  });
  const eweSkull=mass([
    [.071,.025,.064,.132],[.095,.085,-.012,.172],[.15,.107,-.045,.189],
    [.194,.116,-.065,.186],[.229,.109,-.079,.156],[.262,.093,-.095,.116],
    [.297,.079,-.107,.068],[.319,.064,-.102,.021],[.329,.037,-.095,-.035],[.335,.006,-.072,-.064]
  ]);
  // The fleece is one continuous envelope. Each lock has its own lean and
  // a carved spiral; the creases and silhouette remain modeled in side light.
  function fleeceSurface(count,seed,sites=[]) {
    let state=seed;
    const rnd=()=>((state=Math.imul(state,1664525)+1013904223|0)>>>0)/4294967296;
    for(let i=0;i<count;i++){
      const y=1-2*(i+.5)/count, a=i*2.3999632297+.14*(rnd()-.5), r=Math.sqrt(1-y*y);
      const n=new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a));
      const e=new THREE.Vector3(-Math.sin(a),0,Math.cos(a));
      const t=new THREE.Vector3().crossVectors(e,n);
      sites.push({n,e,t,turn:rnd()*TAU,stretch:.79+.22*rnd(),rad:Math.sqrt(4/count)*(.91+.19*rnd())});
    }
    return (u,v)=>{
      const [x,y,z]=ellipse(u,v);
      let max=-9,next=-9,swirl=0;
      for(const f of sites){
        const nx=f.n.x*x+f.n.y*y+f.n.z*z;if(nx<.83)continue;
        const sx=(x*f.e.x+z*f.e.z)/f.rad;
        const sy=(x*f.t.x+y*f.t.y+z*f.t.z)/f.rad*f.stretch;
        const a=Math.atan2(sy,sx),d=Math.hypot(sx+.14*sy,sy);
        const mass=1-d*d+.11*Math.sin(2*a+f.turn)*d;
        if(mass>max){
          next=max;max=mass;
          const phase=d*TAU*1.29-a-f.turn;
          swirl=Math.pow((1+Math.cos(phase))*.5,4)*Math.min(1,d*7)*Math.max(0,1-d*.68);
        }else if(mass>next)next=mass;
      }
      const ridge=Math.min(1,Math.max(0,(max-next)*3.8));
      const offset=.09*max+.02*ridge-.041*swirl;
      return [x*(1+offset),y*(1+offset),z*(1+offset*.74),.78+.17*ridge+.05*Math.max(0,max)-.10*swirl];
    };
  }
  const coatSites=[],coat=fleeceSurface(64,3819,coatSites),crest=fleeceSurface(23,9731);
  function woolBody(piece) {
    const profile=(u,v)=>{
      const [x,y,z,shade]=coat(u,v);
      return [x*(1+.055*z), y*(1-.06*z)+.05*z, z, shade];
    };
    const rx=.217,ry=.225,rz=.377;
    piece.form("wool",profile,[0,.403,-.089],[rx,ry,rz],[],148,108);
    // Pinched clay rosettes ride over the envelope, tapering seamlessly into
    // the coat at both ends. Each spiral follows the curved body surface.
    for(let i=0;i<coatSites.length;i++){
      const f=coatSites[i];
      if(f.n.y<-.55||i%5===0)continue;
      const pts=[];
      for(let j=0;j<=16;j++){
        const u=j/16,ang=f.turn+u*TAU*(.77+.10*Math.sin(i)),radius=f.rad*(.70-.66*u);
        const normal=f.n.clone().addScaledVector(f.e,Math.cos(ang)*radius)
          .addScaledVector(f.t,Math.sin(ang)*radius/f.stretch).normalize();
        const v=Math.asin(normal.z)/Math.PI+.5;
        const uv=((Math.atan2(normal.y,normal.x)/TAU)%1+1)%1;
        const q=profile(uv,v);
        const depth=-.006+.003*Math.sin(u*Math.PI);
        pts.push([q[0]*rx+normal.x*depth,q[1]*ry+.403+normal.y*depth,q[2]*rz-.089+normal.z*depth,
          .65+.35*Math.sin(u*Math.PI)]);
      }
      roll(piece,"wool",pts,.0115,.86);
    }
  }
  function eyes(piece,cow,side){
    const x=side*(cow?.111:.088),y=cow?.158:.082,z=cow?.317:.240;
    const outward=.015*side;
    // The lid edges embrace the visible eye so it sits in the cheek.
    piece.oval("eye",[x,y,z],[.022,.024,.027],[0,side*.47,-side*.12],22,16);
    const start=[x-.010*side,y-.003,z+.024],end=[x-.004*side,y-.005,z-.025];
    roll(piece,cow?"hide":"face",[start,[x+.005*side,y+.019,z+.020],[x+outward*.60,y+.023,z-.005],end],.0048);
    roll(piece,cow?"hide":"face",[start,[x+.010*side,y-.019,z+.014],[x+.011*side,y-.019,z-.009],end],.0032);
    piece.oval("glint",[x+outward*.94,y+.009,z+.014],[.0040,.0054,.005],[0,side*.26,0],12,8);
  }
  function earMold(piece,cow,side) {
    const cupped=(u,v)=>{
      const [x,y,z]=ellipse(u,v),w=(side*x+1)*.5,bowl=Math.max(0,z);
      const soft=z-.84*bowl**3;
      return [x,y*(.57+.49*Math.sin(Math.PI*w))+(cow?.12:-.20)*Math.sin(Math.PI*w),soft,.88+.12*(1-bowl**3)];
    };
    const lean=side*(cow?.18:-.67)+(side>0?.065:0);
    piece.form(cow?"cowEar":"eweEar",cupped,[side*(cow?.089:.080),cow?.019:-.054,-.007],
      cow?[.123,.069,.046]:[.123,.057,.043],[-.10,side*.12,lean],28,21,true);
  }
  function calfFace(piece) {
    piece.form("hide",calfNeck,[0,0,0],[1,1,1],[],34,30);
    piece.form("blaze",calfSkull,[0,0,0],[1,1,1],[],48,42);
    const nose=(u,v)=>{
      const [x,y,z]=ellipse(u,v);
      const nostril=Math.exp(-((Math.abs(x)-.53)**2/.027+(y-.17-.17*(Math.abs(x)-.53))**2/.072))*Math.max(0,z);
      return [x*(1+.095*y),y,z-.46*nostril,.99-.61*nostril];
    };
    piece.form("pink",nose,[0,-.011,.432],[.111,.065,.069],[],54,38);
    for(const s of [-1,1]){
      const horn=mass([[0,.034,-.031,.031],[.017,.033,-.029,.032],[.041,.027,-.018,.031],
        [.071,.019,-.004,.032],[.095,.010,.012,.032],[.105,.001,.022,.024]]);
      piece.form("horn",horn,[s*.087,.246,.176],[1,1,1],[-1.48,-s*.13,-s*.49],24,17);
      eyes(piece,true,s);
    }
    // A few pressed curls interrupt the smooth poll where both horns emerge.
    for(let i=-2;i<=2;i++){
      const x=i*.026;
      roll(piece,i===0?"cream":"hide",[[x,.264,.151],[x-.014,.289,.172],
        [x+.001,.303-.005*Math.abs(i),.204],[x+.011,.292-.003*Math.abs(i),.235]],.010);
    }
  }
  function eweFace(piece) {
    piece.form("face",eweSkull,[0,0,0],[1,1,1],[],36,30);
    piece.form("wool",crest,[0,.130,.145],[.132,.086,.113],[-.23,0,0],80,55);
    for(const s of [-1,1]){
      roll(piece,"wool",[[s*.038,.196,.185],[s*.066,.191,.213],[s*.073,.181,.225],
        [s*.059,.173,.236]],.012);
    }
    for(const s of [-1,1]){
      eyes(piece,false,s);
      roll(piece,"slip",[[s*.058,-.062,.316],[s*.045,-.077,.327],[s*.026,-.088,.329]],.0028);
    }
    const nose=(u,v)=>{
      const [x,y,z]=ellipse(u,v);
      return [x*(.93+.25*y),y,z,.84+.13*Math.max(y,0)];
    };
    piece.form("hoof",nose,[0,-.054,.325],[.038,.022,.014],[],24,12);
    roll(piece,"hoof",[[0,-.066,.334],[0,-.078,.335],[0,-.092,.329]],.0027);
  }
  // The upper leg resolves the stifle/elbow within the muscle rather than
  // hanging an entire straight cylinder from the underside of the belly.
  function makeLeg(root,cow,front,side,index){
    const hips=cow?.51:.33, kneeY=cow?.245:.16, kneeZ=front?(cow?.012:.009):(cow?-.058:-.037);
    const leg=group(root,"Leg "+index,side*(cow?.138:.110),hips,front?(cow?.182:.119):(cow?-.370:-.280));
    const thigh=new ClayPieces(leg),upperLength=hips-kneeY;
    const upper=front?[
      [-.164,.006,.015,.014],[-.124,.057,-.039,.069],[-.057,.073,-.064,.083],
      [.01,.069,-.076,.061],[.072,.060,-.083,.043],[.139,.046,-.052,.035],
      [.191,.038,-.035,.045],[.238,.038,-.026,.048],[.260,.033,-.021,.041],[.277,.026,-.012,.035],[.289,.005,.008,.021]
    ]:[
      [-.165,.010,-.02,.01],[-.13,.063,-.070,.074],[-.07,.087,-.10,.093],
      [0,.082,-.09,.118],[.067,.067,-.084,.125],[.122,.061,-.076,.088],
      [.175,.046,-.070,.035],[.226,.037,-.085,.004],[.255,.037,-.091,-.015],[.277,.030,-.081,-.025],[.291,.004,-.058,-.050]
    ];
    const limbScale=cow?1:.79;

    const knee=group(leg,"Knee "+index,0,-upperLength,kneeZ);
    const foot=new ClayPieces(knee), lowerLength=kneeY;
    const lower=[
      [-.050,.003,-.003,.006],[-.028,.024,-.018,.022],[0,.034,-.026,.030],
      [.032,.034,-.028,.032],[.085,.028,-.020,.027],[.132,.027,-.019,.034],
      [.156,.034,-.031,.037],[.176,.038,-.040,.039],[.185,.036,-.031,.042],
      [.201,.032,-.012,.055],[.214,.032,-.004,.054],[.228,.007,.016,.029]
    ];
    const rings=upper.filter(row=>row[0]<.24).map(([depth,w,b,t])=>
      [depth*upperLength/.265,w*limbScale,b*limbScale,t*limbScale]);
    for(const [depth,w,b,t] of lower.filter(row=>row[0]>=0)){
      rings.push([upperLength+depth*lowerLength/.245,w*limbScale,kneeZ+b*limbScale,kneeZ+t*limbScale]);
    }
    thigh.form(cow?"stocking":"face",mass(rings),[0,0,0],[1,1,1],[Math.PI/2,0,0],24,44);
    thigh.finish();
    const skin=leg.children.find(child=>child.isMesh);skin.name="Limb skin "+index;
    addKneeFlex(skin,knee,limbScale);
    // Separate flattened toe boxes, with a bevel at the coronary band and a
    // narrowing heel. Lowest vertices share a sole plane in the rest pose.
    for(const toe of [-1,1]){
      const box=(u,v)=>{
        const [x,y,z]=ellipse(u,v);
        const sole=Math.max(-.74,y);
        return [Math.sign(x)*Math.pow(Math.abs(x),.75)*(.98-.12*y)*(.90+.10*z),sole*(.93+.07*z),
          z*(1-.23*y)-.14*y,.91+.09*sole];
      };
      foot.form("hoof",box,[toe*.0195*limbScale,-lowerLength+.029*limbScale,.027*limbScale],
        [.025*limbScale,.043*limbScale,.050*limbScale],[0,toe*.055,0],24,18);
    }
    if(cow)for(const toe of [-1,1]){
      foot.oval("horn",[toe*.023,-lowerLength+.077,-.028],[.013,.021,.010],[.25,0,-toe*.09],12,9);
    }
    foot.finish();
    if(index===1)group(knee,"Hoof seed socket",-.037*limbScale,-lowerLength+.043*limbScale,.054*limbScale);
  }
  // Two relative shape keys express the sine and cosine terms of a hinge.
  // This keeps the visible limb surface continuous through the joint, with
  // a short blended zone around the knee and rigidly mounted toes below.
  function addKneeFlex(skin,knee,scale){
    const geo=skin.geometry,pos=geo.attributes.position,norm=geo.attributes.normal;
    const shift=[],fold=[],normalShift=[],normalFold=[];
    const blend=.054*scale;
    for(let i=0;i<pos.count;i++){
      const dy=pos.getY(i)-knee.position.y,dz=pos.getZ(i)-knee.position.z;
      const t=THREE.MathUtils.smoothstep(-dy,-blend,blend);
      shift.push(0,-dz*t,dy*t);fold.push(0,-dy*t,-dz*t);
      normalShift.push(0,-norm.getZ(i)*t,norm.getY(i)*t);
      normalFold.push(0,-norm.getY(i)*t,-norm.getZ(i)*t);
    }
    const attr=data=>new THREE.Float32BufferAttribute(data,3);
    geo.morphTargetsRelative=true;geo.morphAttributes.position=[attr(shift),attr(fold)];
    geo.morphAttributes.normal=[attr(normalShift),attr(normalFold)];skin.updateMorphTargets();
  }
  function makeTail(root,cow){
    const tail=group(root,"Tail",0,cow?.712:.478,cow?-.501:-.409), sculpt=new ClayPieces(tail);
    if(cow){
      const tailshaft=mass([[0,.036,-.028,.030],[.063,.029,-.053,.005],[.138,.023,-.067,-.018],
        [.226,.019,-.087,-.051],[.307,.017,-.092,-.060],[.365,.011,-.086,-.059]]);
      sculpt.form("cream",tailshaft,[0,0,0],[1,1,1],[Math.PI/2,0,.046],18,21);
      const tuft=mass([[0,.006,-.006,.008],[.025,.027,-.022,.018],[.054,.036,-.027,.026],
        [.092,.037,-.024,.037],[.125,.023,-.008,.039],[.145,.002,.025,.030]]);
      sculpt.form("hide",tuft,[.016,-.306,-.079],[1,1,1],[Math.PI/2,0,-.18],20,18);
      for(let i=-1;i<=1;i++)roll(sculpt,"slip",[[.014+i*.013,-.338,-.092],[.019+i*.018,-.375,-.099],
        [.024+i*.012,-.403,-.085],[.032+i*.004,-.436,-.065]],.0024);
    }else sculpt.form("wool",crest,[0,-.036,-.030],[.053,.089,.058],[.28,0,.14],44,32);
    sculpt.finish();
  }
  function animalMold(cow) {
    const root=new THREE.Group(); root.name=cow?"Clay cow":"Clay sheep";root.scale.setScalar(cow?1.32:1.13);
    const body=new ClayPieces(root);
    if(cow)body.form("piebald",calfTrunk,[0,0,0],[1,1,1],[],52,44);
    else {
      woolBody(body);
      body.form("wool",crest,[0,.497,.158],[.144,.148,.154],[-.32,0,0],60,42);
    }
    body.finish();
    const head=group(root,"Head",0,cow?.671:.514,cow?.208:.166);
    const face=new ClayPieces(head);
    if(cow)calfFace(face);else eweFace(face);face.finish();
    const jaw=group(head,"Jaw",0,cow?-.039:-.072,cow?.397:.261);
    const chin=new ClayPieces(jaw);
    const mandible=mass(cow?[
      [-.142,.008,.070,.078],[-.117,.056,.027,.095],[-.074,.071,-.010,.080],
      [-.019,.077,-.021,.052],[.029,.078,-.030,.038],[.054,.069,-.028,.029],
      [.073,.044,-.022,.018],[.079,.006,-.007,.002]
    ]:[[-.095,.006,.046,.054],[-.071,.046,.012,.063],[-.033,.056,-.016,.052],[.009,.055,-.022,.036],[.039,.046,-.025,.020],[.059,.024,-.015,.008],[.063,.005,-.005,-.001]]);
    chin.form(cow?"hide":"face",mandible,[0,0,0],[1,1,1],[],28,20);chin.finish();
    for(const side of [-1,1]){
      const ear=group(head,side<0?"Ear L":"Ear R",side*(cow?.112:.093),cow?.203:.110,cow?.184:.148);
      const cartilage=new ClayPieces(ear);earMold(cartilage,cow,side);cartilage.finish();
    }
    makeTail(root,cow);
    let index=0;
    for(const side of [-1,1])for(const front of [false,true])makeLeg(root,cow,front,side,index++);
    group(root,"Coat seed socket",-.17,cow?.702:.529,cow?-.210:-.153);
    const blades=group(head,"Mouthful",.027,cow?-.057:-.101,cow?.473:.303);
    const grass=new ClayPieces(blades);
    for(let i=0;i<3;i++)grass.oval("leaf",[.030+i*.019,-i*.004,.020],[.053,.006,.013],[.15,i*.37,(i-1)*.28]);
    grass.finish();blades.visible=false;
    return root;
  }
  function seedMold(){
    const root=new THREE.Group(); root.name="Sea buckthorn seed";
    const p=new ClayPieces(root);
    const outline=loft([[-.111,.004,.004],[-.103,.026,.016],[-.083,.047,.03],[-.05,.06,.037],
      [-.009,.063,.04],[.042,.051,.032],[.082,.032,.022],[.105,.014,.010],[.116,.001,.001]]);
    p.form("kernel",outline,[0,0,0],[1,1,1],[-Math.PI/2,0,0],28,29);
    p.oval("hilum",[0,-.108,0],[.020,.008,.013]);
    for(const side of [-1,1]){
      const seam=loft([[-.102,.001,.001,side*.012],[-.08,.002,.002,side*.030],[-.05,.002,.002,side*.037],
        [-.009,.002,.002,side*.040],[.042,.002,.002,side*.032],[.082,.0015,.0015,side*.022],[.107,.001,.001,side*.008]]);
      p.form("slip",seam,[0,0,0],[1,1,1],[-Math.PI/2,0,0],8,16);
    }
    p.finish(); return root;
  }
  return {
    animal(species,index){
      const cow=species==="cow", key=cow?"cow":"sheep";
      if(!cache.has(key))cache.set(key,animalMold(cow,0));
      const root=cache.get(key).clone(true), find=name=>root.getObjectByName(name);
      const ears=[find("Ear L"),find("Ear R")]; ears[0].rotation.x=(index%2)*.12;
      for (let i=0;i<4;i++){
        const skin=find("Limb skin "+i),knee=find("Knee "+i);
        const bend=()=>{
          skin.morphTargetInfluences[0]=Math.sin(knee.rotation.x);
          skin.morphTargetInfluences[1]=1-Math.cos(knee.rotation.x);
        };
        skin.onBeforeRender=bend;skin.onBeforeShadow=bend;
      }
      return {root,head:find("Head"),jaw:find("Jaw"),legs:[0,1,2,3].map(i=>find("Leg "+i)),
        kneeJoints:[0,1,2,3].map(i=>find("Knee "+i)),ears,
        tail:find("Tail"),mouthful:find("Mouthful"),hoofSocket:find("Hoof seed socket"),seedSocket:find("Coat seed socket")};
    },
    seed(){if(!cache.has("seed"))cache.set("seed",seedMold());return cache.get("seed").clone(true);}
  };
})();

function createClayGrazer(species,index=0){return pastureClay.animal(species,index);}
// In world units the unscaled kernel measures .232 along Y (narrow tip up).
function createClaySeed(){return pastureClay.seed();}
