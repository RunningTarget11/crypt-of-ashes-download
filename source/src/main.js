import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {mulberry32,clamp,lerp,b64ToBuf,angleLerp,angDiff,rotateBoneWorld,smooth01} from './util.js';
import {generate,buildGeometry,isFloor,walkable,los,findPath,toCell,cellCenter,CELL,WALL_H,wallOffset,fbm} from './cave.js';
import {Particles,canvasTex,bloodTex,makeArcGeo,slashMaterial,beamMaterial,ringMaterial,flareTex} from './fx.js';
import {RARITY,rollItem,drawIcon} from './items.js';
import {initAudio,sfx} from './audio.js';
import {charMaterial,charTime} from './charmat.js';
import {Animator,CLIPS,registerClips} from './anim.js';
import {SwordTrail} from './trail.js';
import {GRIP} from './grip.js';

const A=window.__ASSETS;const $=id=>document.getElementById(id);
const QS=new URLSearchParams(location.search);
const TEST=window.__TEST={};
const IS_MOBILE=QS.has('mobile')||(!QS.has('desktop')&&(matchMedia('(pointer: coarse)').matches||(navigator.maxTouchPoints>0&&Math.min(screen.width,screen.height)<820)));
if(IS_MOBILE)document.body.classList.add('mobile');
const QL=IS_MOBILE?[{pr:1.25,ts:false,hs:true},{pr:1,ts:false,hs:true},{pr:0.8,ts:false,hs:false}]:[{pr:1.5,ts:true,hs:true},{pr:1,ts:true,hs:true},{pr:1,ts:false,hs:true},{pr:0.8,ts:false,hs:false}];
let qLevel=QS.has('low')?QL.length-1:0;
{const st=document.createElement('style');st.textContent=`@font-face{font-family:'Cinzel';src:url(${A.font.cinzel}) format('truetype');font-weight:400 900}@font-face{font-family:'CinzelDeco';src:url(${A.font.cinzelDeco}) format('truetype')}`;document.head.appendChild(st);}

// ---------- renderer ----------
const renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,QL[qLevel].pr));
renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.4;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x020202);
scene.fog=new THREE.Fog(0x030303,20,44);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.5,140);
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),0.04).texture;scene.environmentIntensity=0.07;
const hemi=new THREE.HemisphereLight(0x55617a,0x241a12,1.75);scene.add(hemi);const fillLight=new THREE.DirectionalLight(0x8494c4,0.8);fillLight.position.set(-6,20,8);scene.add(fillLight);

const rt=new THREE.WebGLRenderTarget(innerWidth,innerHeight,{type:THREE.HalfFloatType,samples:IS_MOBILE?0:4});
const composer=new EffectComposer(renderer,rt);
composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight),0.75,0.55,0.82);composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade=new ShaderPass({uniforms:{tDiffuse:{value:null},uTime:{value:0},uHurt:{value:0},uRes:{value:new THREE.Vector2(innerWidth,innerHeight)}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float uTime;uniform float uHurt;varying vec2 vUv;
 float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
 void main(){vec2 uv=vUv;vec2 c=uv-.5;float r=length(c);
  vec3 col;col.r=texture2D(tDiffuse,uv+c*0.0025*r).r;col.g=texture2D(tDiffuse,uv).g;col.b=texture2D(tDiffuse,uv-c*0.0025*r).b;
  float l=dot(col,vec3(.299,.587,.114));
  col=mix(vec3(l),col,0.78);
  col*=mix(vec3(0.86,0.93,1.06),vec3(1.08,1.0,0.88),smoothstep(0.,0.6,l));
  col=pow(col,vec3(1.06));
  float vig=smoothstep(0.95,0.32,r*1.15);col*=mix(0.3,1.,vig);
  col=mix(col,col*vec3(1.4,.3,.25)+vec3(.12,0.,0.),uHurt*smoothstep(.2,.8,r));
  col+=(h(uv*1000.+uTime)-.5)*0.035;
  gl_FragColor=vec4(col,1.);}`});
composer.addPass(grade);

// ---------- textures/materials ----------
const texLoader=new THREE.TextureLoader();
function T(name,srgb,rep=1){const t=texLoader.load(A.tex[name]);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.repeat.set(rep,rep);return t;}
const U={player:{value:new THREE.Vector3()},cam:{value:new THREE.Vector3()}};
function addCutout(mat){
  mat.onBeforeCompile=(sh)=>{
    sh.uniforms.uPlayer=U.player;sh.uniforms.uCam=U.cam;
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;').replace('#include <project_vertex>','#include <project_vertex>\nvWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vWP;uniform vec3 uPlayer;uniform vec3 uCam;').replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
    {vec3 P=uPlayer+vec3(0.,1.,0.);vec3 d=normalize(uCam-P);vec3 w=vWP-P;float al=dot(w,d);float r=length(w-d*al);
     if(vWP.z-uPlayer.z>0.4&&vWP.y>0.12){float k=smoothstep(4.4,2.6,r);float di=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);if(k>di*0.85+0.1)discard;}}`);
  };
  return mat;
}
const floorMat=new THREE.MeshStandardMaterial({map:T('rock_ground_diff',true),normalMap:T('rock_ground_nor'),roughnessMap:T('rock_ground_arm'),aoMap:T('rock_ground_arm'),vertexColors:true,color:0x6e6660,normalScale:new THREE.Vector2(1.6,1.6)});
const wallMat=addCutout(new THREE.MeshStandardMaterial({map:T('dark_rock_diff',true),normalMap:T('dark_rock_nor'),roughnessMap:T('dark_rock_arm'),aoMap:T('dark_rock_arm'),vertexColors:true,color:0xc4b6aa,normalScale:new THREE.Vector2(2,2),shadowSide:THREE.DoubleSide}));
const capMat=addCutout(new THREE.MeshStandardMaterial({map:T('dark_rock_diff',true,0.5),normalMap:T('dark_rock_nor',false,0.5),vertexColors:true,color:0x5a524c,roughness:1}));
const pillarMat=new THREE.MeshStandardMaterial({map:T('dark_rock_diff',true),normalMap:T('dark_rock_nor'),roughnessMap:T('dark_rock_arm'),color:0x8a8278,normalScale:new THREE.Vector2(1.5,1.5)});
const LAVA_U={uT:{value:0}};
const lavaMat=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d');g.fillStyle='#000';g.fillRect(0,0,256,256);
  // voronoi-style crack network fading out at the edges
  const r=mulberry32(5);const pts=[];for(let k=0;k<26;k++)pts.push([r()*256,r()*256]);const im=g.getImageData(0,0,256,256);
  for(let y=0;y<256;y++)for(let x=0;x<256;x++){let d1=1e9,d2=1e9;for(const p of pts){const d=Math.hypot(x-p[0],y-p[1]);if(d<d1){d2=d1;d1=d;}else if(d<d2)d2=d;}
    const e=Math.max(0,1-(d2-d1)/5.5);const rr=Math.hypot(x-128,y-128)/128;const fade=Math.max(0,1-rr*rr*1.1);const v=Math.pow(e,1.6)*fade;const o=(y*256+x)*4;im.data[o]=v*255;im.data[o+1]=v*255;im.data[o+2]=v*255;im.data[o+3]=255;}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);
  return new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{tC:{value:t},uT:LAVA_U.uT},
    vertexShader:`varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}`,
    fragmentShader:`uniform sampler2D tC;uniform float uT;varying vec2 vUv;varying vec3 vW;void main(){float c=texture2D(tC,vUv).r;float p=0.75+0.25*sin(uT*1.7+vW.x*0.9+vW.z*0.7);
      vec3 col=mix(vec3(0.9,0.12,0.01),vec3(3.2,1.3,0.25),c*c)*c*p;gl_FragColor=vec4(col,1.);}`});})();
const shaftMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,uniforms:{uT:LAVA_U.uT},
  vertexShader:`varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vec4 w=modelMatrix*vec4(position,1.);vN=normalize(mat3(modelMatrix)*normal);vV=normalize(cameraPosition-w.xyz);gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader:`uniform float uT;varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){float edge=pow(abs(dot(vN,vV)),1.5);float h=smoothstep(0.,0.35,vUv.y)*smoothstep(1.,0.55,vUv.y);
    float n=0.75+0.25*sin(vUv.x*40.+uT*0.6)*sin(vUv.x*17.-uT*0.4);gl_FragColor=vec4(vec3(0.55,0.62,0.75)*0.075*edge*h*n,1.);}`});
const puddleMat=new THREE.MeshStandardMaterial({color:0x1a1f26,roughness:0.06,metalness:0.35,transparent:true,opacity:0.6,alphaMap:(()=>{const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,10,64,64,64);gr.addColorStop(0,'#fff');gr.addColorStop(0.55,'#bbb');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);})(),depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3});
const rockMat=new THREE.MeshStandardMaterial({map:pillarMat.map,normalMap:pillarMat.normalMap,roughnessMap:pillarMat.roughnessMap,normalScale:new THREE.Vector2(1.6,1.6),color:0x7a7068});
const ironMat=new THREE.MeshStandardMaterial({color:0x1e1b18,metalness:0.85,roughness:0.5});
const goldMat=new THREE.MeshStandardMaterial({color:0xd9a441,metalness:1,roughness:0.28,emissive:0x3a2200,emissiveIntensity:0.6});

const gltfLoader=new GLTFLoader();
const parse=(k)=>new Promise((res,rej)=>gltfLoader.parse(b64ToBuf(A.glb[k]),'',res,rej));
const MODELS={};
const fxAdd=new Particles(4000,true,scene);
const fxAlpha=new Particles(2000,false,scene);
const rngFx=mulberry32(99);
const bloodTexs=[bloodTex(rngFx),bloodTex(rngFx),bloodTex(rngFx)];
const heroLight=new THREE.PointLight(0xffc58f,44,20,1.5);heroLight.castShadow=QL[qLevel].hs;heroLight.shadow.mapSize.set(IS_MOBILE?512:768,IS_MOBILE?512:768);heroLight.shadow.bias=-0.004;heroLight.shadow.camera.near=0.2;heroLight.shadow.camera.far=16;scene.add(heroLight);
const torchLights=[];for(let k=0;k<7;k++){const l=new THREE.PointLight(0xff7a2e,0,12,1.8);if(k<2){l.userData0=true;l.castShadow=QL[qLevel].ts;l.shadow.mapSize.set(512,512);l.shadow.bias=-0.004;l.shadow.camera.near=0.2;l.shadow.camera.far=12;}l.userData={torch:null,fade:0,canShadow:k<2};scene.add(l);torchLights.push(l);}
const fxLights=[];for(let k=0;k<4;k++){const l=new THREE.PointLight(0xff8030,0,10,1.6);l.userData={life:0,max:1,base:0};scene.add(l);fxLights.push(l);}
function flash(pos,color,intensity,life,dist=10){let l=fxLights.find(l=>l.userData.life<=0)||fxLights.reduce((a,b)=>a.userData.life<b.userData.life?a:b);l.position.copy(pos);l.color.set(color);l.distance=dist;l.userData={life,max:life,base:intensity};return l;}

const G={depth:1,seed:+(QS.get('seed')||7),state:'loading',time:0,hitstop:0,shake:0,hurt:0,kills:0};
let D=null;let level=new THREE.Group();scene.add(level);
const torches=[];const shafts=[];const puddles=[];const obstacles=[];const enemies=[];const loots=[];const projectiles=[];const decals=[];const slashes=[];const chests=[];const telegraphs=[];
let explored=null;
// ---------- characters ----------
const BONES={hips:'pelvis',spine:'spine_01',spine1:'spine_02',spine2:'spine_03',head:'Head',neck:'neck_01',rArm:'upperarm_r',rFore:'lowerarm_r',rHand:'hand_r',lArm:'upperarm_l',lFore:'lowerarm_l',lHand:'hand_l'};
// locomotion/idle sets per character (Quaternius UAL, CC0)
const ANIMSET={hero:{idle:'Sword_Idle',loco:['Walk_Loop','Jog_Fwd_Loop','Sprint_Loop']},skeleton:{idle:'Zombie_Idle_Loop',loco:['Zombie_Walk_Fwd_Loop','Jog_Fwd_Loop']},caller:{idle:'Idle_Loop',loco:['Walk_Loop','Jog_Fwd_Loop']},brute:{idle:'Sword_Idle',loco:['Walk_Loop','Jog_Fwd_Loop']},boss:{idle:'Sword_Idle',loco:['Walk_Loop','Jog_Fwd_Loop']}};
const LOOKS={
  hero:{surf:{color:0x50535a,metalness:1,roughness:0.28,roughVar:0.06,dirt:0.25,bump:0.0,freq:6,rim:[0.3,0.22,0.15]},joint:{color:0x8a6a32,metalness:1,roughness:0.4,dirt:0.4,bump:0.015,freq:20,rim:[0.2,0.15,0.08]},h:1.85},
  skeleton:{surf:{color:0x3b342d,metalness:0.0,roughness:0.9,roughVar:0.1,dirt:0.6,bump:0.04,freq:5,crack:[4,1.1,0.18],crackW:0.018,rim:[0.12,0.05,0.03]},joint:{color:0x0c0908,roughness:0.95,crack:[2.5,0.6,0.08],crackW:0.03,freq:6},eye:[5,1.2,0.3],h:1.8},
  caller:{surf:{color:0x1f1924,metalness:0.2,roughness:0.7,dirt:0.5,bump:0.04,freq:8,crack:[1.6,0.4,4.0],crackW:0.04,rim:[0.2,0.08,0.4]},joint:{color:0x2a0c3a,emissive:0x5a18c0,emissiveIntensity:1.2,roughness:0.6},eye:[2.5,0.6,5],h:1.75},
  brute:{surf:{color:0x3a2018,metalness:0.5,roughness:0.55,dirt:0.6,bump:0.05,freq:7,crack:[5,1.4,0.2],crackW:0.05},joint:{color:0x120604,emissive:0xff4a10,emissiveIntensity:0.8,roughness:0.7},eye:[5,1.6,0.2],h:1.8},
  boss:{surf:{color:0x141216,metalness:0.85,roughness:0.32,roughVar:0.25,dirt:0.5,bump:0.04,freq:5,crack:[3.2,0.7,0.08],crackW:0.035,rim:[0.25,0.06,0.02]},joint:{color:0x1a0400,emissive:0xff3a00,emissiveIntensity:0.9,roughness:0.6},eye:[6,1.4,0.2],h:1.8},
};
// CC0 Quaternius outfits (Modular Character Outfits - Fantasy) + Universal Base Character head, all on the UAL skeleton.
// tint: outfit albedo multiplier, skin: head/arm skin multiplier, eye: emissive eye colour, em: subtle emissive in cloth
const OUTFIT={hero:{body:'ch_ranger_m',tint:[0.95,0.8,0.66],skin:[0.95,0.88,0.84],metal:0.15,h:1.86},
  skeleton:{body:'ch_peasant_lo',tint:[0.42,0.4,0.38],skin:[0.36,0.37,0.38],eye:[6,1.6,0.35],h:1.8,ash:true},
  caller:{body:'ch_ranger_lo',tint:[0.3,0.2,0.38],skin:[0.3,0.28,0.36],eye:[2.6,0.8,6],h:1.78,ash:true},
  brute:{body:'ch_ranger_lo',tint:[0.55,0.25,0.18],skin:[0.42,0.28,0.24],eye:[6,1.8,0.25],h:1.8,ash:true},
  boss:{body:'ch_ranger_lo',tint:[0.2,0.18,0.2],skin:[0.25,0.22,0.22],eye:[7,1.6,0.2],h:1.8,metal:0.55,ash:true}};
function rebindTo(mesh,boneByName){const old=mesh.skeleton;const bones=old.bones.map(b=>boneByName[b.name]||b);mesh.bind(new THREE.Skeleton(bones,old.boneInverses.map(m=>m.clone())),mesh.bindMatrix.clone());}
function makeCharacter(kind,scale=1){
  const O=OUTFIT[kind];
  const model=SkeletonUtils.clone(MODELS[O.body].scene);const head=SkeletonUtils.clone(MODELS[kind==='hero'?'ch_head_m':'ch_head_lo'].scene);
  const boneByName={};model.traverse(o=>{if(o.isBone)boneByName[o.name]=o;});
  const hm=[];head.traverse(o=>{if(o.isSkinnedMesh)hm.push(o);});for(const m of hm){rebindTo(m,boneByName);model.add(m);}
  const mats=[];
  model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    const m=o.material.clone();const n=m.name||'';const isSkin=/Superhero|Regular/.test(n),isEye=/Eye/.test(n),isHair=/Hair/.test(n);
    if(isEye){if(O.eye){m.emissive=new THREE.Color(...O.eye);m.emissiveIntensity=1;m.color.setRGB(0.1,0.02,0.01);}}
    else if(isSkin){m.color.multiply(new THREE.Color(...O.skin));if(O.ash){m.roughness=0.9;}}
    else if(isHair){m.color.multiplyScalar(O.ash?0.25:0.6);}
    else{m.color.multiply(new THREE.Color(...O.tint));if(O.metal)m.metalness=Math.max(m.metalness||0,O.metal);}
    m.envMapIntensity=0.6;o.material=m;if(!isEye)mats.push(m);});
  const k=O.h/MODELS[O.body].h;const s=k*scale;model.scale.setScalar(s);
  const root=new THREE.Group(),tilt=new THREE.Group();tilt.add(model);root.add(tilt);
  const mixer=new THREE.AnimationMixer(model);
  const bones={};model.traverse(o=>{if(o.isBone){for(const b in BONES)if(o.name===BONES[b])bones[b]=o;if(GRIP[o.name])o.quaternion.fromArray(GRIP[o.name]);}});
  const anim=new Animator(mixer,ANIMSET[kind],k*scale*MODELS[O.body].h/MODELS.ualH);
  root.updateMatrixWorld(true);
  const dis={value:0};if(kind!=='hero')for(const m of mats)addDissolve(m,dis);
  const c={kind,root,tilt,model,mixer,anim,bones,mats,dis,scale:s*MODELS[O.body].h/MODELS.ualH,yaw:0};
  return c;
}
// ember dissolve for corpses (world-space value noise; burning rim at the dissolve front)
function addDissolve(m,u){m.onBeforeCompile=sh=>{sh.uniforms.uDis=u;
  sh.vertexShader='varying vec3 vDisP;\n'+sh.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvDisP=(modelMatrix*vec4(transformed,1.0)).xyz;');
  sh.fragmentShader='uniform float uDis;varying vec3 vDisP;\nfloat dh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}\nfloat dn(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z);}\n'+
   sh.fragmentShader.replace('#include <clipping_planes_fragment>','#include <clipping_planes_fragment>\nfloat dN=dn(vDisP*7.)*0.6+dn(vDisP*19.)*0.4;dN=dN*0.8+clamp(vDisP.y*0.12,0.,0.2);if(uDis>0.&&dN<uDis)discard;float dE=uDis>0.?smoothstep(uDis+0.07,uDis,dN):0.;')
   .replace('#include <dithering_fragment>','#include <dithering_fragment>\ngl_FragColor.rgb+=vec3(4.,1.3,.25)*dE;');};m.customProgramCacheKey=()=>'dis1';}
function setEmissive(c,r,g,b){for(const m of c.mats)m.emissive.setRGB(r,g,b);}
// attach obj to a bone using an offset given in the character's model frame (bind pose, facing +Z, metres at 1.83m height)
function attachModel(c,bone,obj,off,worldScale){
  c.root.updateMatrixWorld(true);const bp=new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
  const wp=bp.add(new THREE.Vector3(...off).multiplyScalar(c.scale*MODELS.ualH/1.83));
  bone.getWorldScale(_ws);const kk=1/_ws.x;obj.position.copy(bone.worldToLocal(wp));obj.scale.multiplyScalar(worldScale*kk);bone.add(obj);return obj;
}
const _ws=new THREE.Vector3();
function attach(bone,obj,pos,rot,worldScale){
  bone.updateWorldMatrix(true,false);bone.getWorldScale(_ws);const k=1/_ws.x;
  obj.position.set(pos[0]*k,pos[1]*k,pos[2]*k);obj.rotation.set(...rot);obj.scale.multiplyScalar(worldScale*k);bone.add(obj);return obj;
}
function cloneProp(name){const o=MODELS[name].scene.clone(true);o.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});return o;}
const UPV=new THREE.Vector3(0,1,0),_F=new THREE.Vector3(),_R=new THREE.Vector3();
function setLocomotion(c,speed,runSpeed,dt){c.anim.update(dt,speed);}
const POSE=window.__POSE={k:{}};

// ---------- player ----------
const P={pos:new THREE.Vector3(),yaw:0,hp:150,mana:80,level:1,xp:0,gold:0,potions:4,path:null,pathGoal:null,target:null,atk:null,cast:null,spin:null,dash:null,
  cd:{whirl:0,fire:0,dash:0,potion:0},inv:[],equip:{},hurtT:0,dead:false};
const SKILLS={whirl:{name:'Bone Cleave',mana:16,cd:2.4,icon:'whirl',key:'1',desc:'Spin in a savage arc, striking all foes around you for 140% weapon damage.'},
  fire:{name:'Hellfire Orb',mana:12,cd:0.55,icon:'fire',key:'2',desc:'Hurl an orb of hellfire that explodes for 170% weapon damage as Fire. (Right-click)'},
  dash:{name:'Shadow Charge',mana:10,cd:3.5,icon:'dash',key:'3',desc:'Charge toward the cursor, battering every enemy in your path.'}};
function stats(){
  const s={str:10,vit:10,crit:5,life:0,mana:0,fire:0,loh:0,ms:0,as:0,armor:0,dmg:[3,6]};
  for(const k in P.equip){const it=P.equip[k];if(!it)continue;for(const a in it.stats)s[a]+=it.stats[a];if(it.armor)s.armor+=it.armor;if(it.dmg)s.dmg=[...it.dmg];}
  s.maxHp=Math.round(110+P.level*14+s.vit*4+s.life);s.maxMana=Math.round(70+P.level*4+s.mana);
  const m=1+s.str*0.02;s.dmgMin=Math.round(s.dmg[0]*m+P.level*0.8);s.dmgMax=Math.round(s.dmg[1]*m+P.level*1.2);s.speed=5.5*(1+s.ms/100);s.atkSpeed=1+s.as/100;
  return s;
}
let S=null;
// ---------- level build ----------
function clearLevel(){
  scene.remove(level);level.traverse(o=>{if(o.geometry&&o.userData.ownGeo)o.geometry.dispose();});
  level=new THREE.Group();scene.add(level);
  torches.length=0;obstacles.length=0;shafts.length=0;puddles.length=0;
  for(const e of enemies){e.bar?.remove();}enemies.length=0;
  for(const l of loots)l.label?.remove();loots.length=0;projectiles.length=0;decals.length=0;slashes.length=0;chests.length=0;telegraphs.length=0;
  for(const l of torchLights){l.intensity=0;l.userData.torch=null;}
  fxAdd.clear();fxAlpha.clear();
}
function buildLevel(){
  clearLevel();
  const rng=mulberry32(G.seed*31+G.depth*977);
  D=generate(rng,G.depth);explored=new Uint8Array(D.W*D.H);
  const geo=buildGeometry(D);D.loops=geo.loops;
  // floor + walls are split into 12m tiles so frustum culling (camera and the 6 point-light shadow faces) can skip most of the cave
  for(const g of splitChunks(geo.floor,12)){const m=new THREE.Mesh(g,floorMat);m.receiveShadow=true;m.userData.ownGeo=true;level.add(m);}
  for(const g of splitChunks(geo.walls,12)){const m=new THREE.Mesh(g,wallMat);m.receiveShadow=true;m.castShadow=true;m.userData.ownGeo=true;level.add(m);}
  geo.floor.dispose();geo.walls.dispose();
  
  const ri=(a,b)=>a+Math.floor(rng()*(b-a+1));
  const addObs=(x,z,r)=>obstacles.push({x,z,r});
  const place=(obj,x,z,ry=0,s=1,obsR=0)=>{obj.position.set(x,0,z);obj.rotation.y=ry;obj.scale.multiplyScalar(s);level.add(obj);if(obsR)addObs(x,z,obsR);return obj;};
  const free=(x,z,r)=>walkable(D,x,z,r)&&!blockedByObs(x,z,r);
  const wallPt=(f,y,inset=0)=>{const o=wallOffset(f.x,f.z,y,D.seedZ)+inset;return [f.x+f.nx*o,f.z+f.nz*o];};
  // wall sconces (iron torch holders) on the rock, not on walls facing the camera
  const spots=geo.faces.map(f=>[rng(),f]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  const cupGeo=new THREE.CylinderGeometry(0.11,0.06,0.28,8);const armGeo=new THREE.BoxGeometry(0.06,0.06,0.42);const plateGeo=new THREE.BoxGeometry(0.22,0.4,0.04);
  for(const f of spots){if(f.hm<0.9)continue;if(torches.some(t=>Math.hypot(t.wx-f.x,t.wz-f.z)<9))continue;if(rng()<0.35)continue;
    const [x,z]=wallPt(f,2.3,0.02);const g=new THREE.Group();const arm=new THREE.Mesh(armGeo,ironMat);arm.position.set(0,-0.18,0.2);arm.rotation.x=0.6;g.add(arm);
    const cup=new THREE.Mesh(cupGeo,ironMat);cup.position.set(0,0,0.38);g.add(cup);const plate=new THREE.Mesh(plateGeo,ironMat);plate.position.set(0,-0.25,0.02);g.add(plate);
    g.position.set(x,2.35,z);g.rotation.y=Math.atan2(f.nx,f.nz);level.add(g);torches.push({wx:x,wz:z,fx:x+f.nx*0.38,fy:2.5,fz:z+f.nz*0.38,phase:rng()*100});}
  // stalactites hanging off the rock rim + stalagmite clusters along the walls
  for(const f of spots){if(f.hm<0.99||rng()<0.5)continue;const [x,z]=wallPt(f,WALL_H-0.3,-0.2);const h=0.8+rng()*1.8;const m=new THREE.Mesh(spikeGeo(rng,0.18+rng()*0.25,h),rockMat);m.rotation.x=Math.PI;m.position.set(x,WALL_H+0.1,z);m.castShadow=true;m.userData.ownGeo=true;level.add(m);}
  for(const f of spots){if(rng()<0.6)continue;const n=ri(1,4);for(let k=0;k<n;k++){const [x0,z0]=wallPt(f,0.3,0.2+rng()*0.6);const x=x0+(rng()-.5)*1.2,z=z0+(rng()-.5)*1.2;const h=0.4+rng()*(k?1.0:2.2);
      const m=new THREE.Mesh(spikeGeo(rng,0.12+h*0.18,h),rockMat);m.position.set(x,-0.05,z);m.rotation.y=rng()*6;m.castShadow=m.receiveShadow=true;m.userData.ownGeo=true;level.add(m);if(h>1.2&&walkable(D,x,z,0.1))addObs(x,z,0.3+h*0.1);}}
  // big boulders/stalagmites inside chambers (obstacles)
  for(const r of D.rooms){if(r.kind==='start')continue;const nb=r.kind==='boss'?0:ri(1,3);for(let k=0;k<nb;k++){const c=r.cells[Math.floor(rng()*r.cells.length)];if(!c)break;const x=c[0]+0.5,z=c[1]+0.5;if(Math.hypot(x-r.cx,z-r.cy)<2.5||!free(x,z,1.3))continue;
      const g=new THREE.Group();const h=1.6+rng()*2.4;const m=new THREE.Mesh(spikeGeo(rng,0.55+rng()*0.3,h),rockMat);m.castShadow=m.receiveShadow=true;m.userData.ownGeo=true;g.add(m);
      for(let q=0;q<3;q++){const s2=new THREE.Mesh(spikeGeo(rng,0.2+rng()*0.2,0.5+rng()*1.1),rockMat);s2.position.set((rng()-.5)*1.4,-0.05,(rng()-.5)*1.4);s2.castShadow=true;s2.userData.ownGeo=true;g.add(s2);}
      place(g,x,z,rng()*6,1,0.85);}}
  // rubble scattered along cave edges
  for(let k=0;k<260;k++){const i=ri(2,D.W-3),j=ri(2,D.H-3);if(!isFloor(D,i,j))continue;let edge=0;for(const [a,b] of [[1,0],[-1,0],[0,1],[0,-1]])if(!isFloor(D,i+a,j+b))edge++;if(!edge&&rng()<0.85)continue;
    const g=new THREE.IcosahedronGeometry(0.08+rng()*0.28,1);const p=g.attributes.position;for(let v=0;v<p.count;v++)p.setXYZ(v,p.getX(v)*(0.7+rng()*.6),p.getY(v)*(0.45+rng()*.4),p.getZ(v)*(0.7+rng()*.6));g.computeVertexNormals();
    const m=new THREE.Mesh(g,rockMat);m.castShadow=m.receiveShadow=true;m.userData.ownGeo=true;m.position.set(i+rng(),0.02,j+rng());m.rotation.set(rng()*6,rng()*6,rng()*6);level.add(m);}
  // glowing crystal clusters (cold light) and lava fissures (hot light)
  const crystalRooms=D.order.filter((r,i)=>r.kind==='normal'&&i%2===1);
  for(const r of crystalRooms){const cols=rng()<0.5?[[0.2,1.1,1.9],0x3aa8ff]:[[1.1,0.3,1.9],0x9a4dff];for(let q=0;q<ri(2,3);q++){
      const f=spots.find(f=>Math.hypot(f.x-r.cx,f.z-r.cy)<r.r*1.25&&!torches.some(t=>Math.hypot(t.wx-f.x,t.wz-f.z)<4));if(!f)break;const [x,z]=wallPt(f,0.4,0.35);
      const g=crystalCluster(rng,cols[0]);g.position.set(x,0,z);g.rotation.y=Math.atan2(f.nx,f.nz);level.add(g);torches.push({wx:x,wz:z,fx:x+f.nx*0.9,fy:0.9,fz:z+f.nz*0.9,phase:rng()*100,kind:'crystal',col:cols[1],int:0.32,ec:cols[0]});}}
  const lavaRooms=D.order.filter((r,i)=>r.kind==='normal'&&i%3===2).concat([D.boss]);
  for(const r of lavaRooms){const n=r.kind==='boss'?7:ri(2,3);for(let q=0;q<n;q++){const c=r.cells[Math.floor(rng()*r.cells.length)];if(!c)break;const x=c[0]+0.5,z=c[1]+0.5;
      const sz=2.5+rng()*3;const m=new THREE.Mesh(new THREE.PlaneGeometry(sz,sz),lavaMat);m.rotation.x=-Math.PI/2;m.rotation.z=rng()*6;m.position.set(x,0.03,z);m.userData.ownGeo=true;level.add(m);
      if(q<2)torches.push({wx:x,wz:z,fx:x,fy:0.1,fz:z,phase:rng()*100,kind:'lava',col:0xff4a10,int:0.5});}}
  // shafts of light from cracks in the cave roof
  for(const r of D.order.filter((r,i)=>i%4===1)){const m=new THREE.Mesh(new THREE.CylinderGeometry(1.2,3.2,16,20,1,true),shaftMat);m.position.set(r.cx+(rng()-.5)*2,8,r.cy+(rng()-.5)*2);m.rotation.z=0.18;m.rotation.x=-0.1;m.renderOrder=4;m.userData.ownGeo=true;level.add(m);shafts.push(m);}
  // braziers (start chamber, a camp and the boss arena)
  const brazier=(x,z)=>{const g=new THREE.Group();const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.14,1.1,8),ironMat);leg.position.y=0.55;g.add(leg);
    const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.22,0.35,14,1,true),ironMat);bowl.position.y=1.2;g.add(bowl);
    const coal=new THREE.Mesh(new THREE.CircleGeometry(0.45,14),new THREE.MeshBasicMaterial({color:new THREE.Color(3,0.8,0.15)}));coal.rotation.x=-Math.PI/2;coal.position.y=1.3;g.add(coal);
    g.traverse(o=>{o.castShadow=true;});place(g,x,z,0,1,0.55);torches.push({wx:x,wz:z,fx:x,fy:1.35,fz:z,phase:rng()*100,big:true});};
  {const r=D.start;brazier(r.cx+2.2,r.cy-1.5);}
  const b=D.boss;for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4;const x=b.cx+Math.cos(a)*b.r*0.62,z=b.cy+Math.sin(a)*b.r*0.62;if(walkable(D,x,z,0.6))brazier(x,z);}
  for(const sx of [-1,1]){const x=b.cx+sx*3.5,z=b.cy-b.r*0.6;if(walkable(D,x,z,0.9)){const st=cloneProp('gothic_statue');place(st,x,z,0,1.5,1.2);}}
  // miners' camp leftovers + chests
  for(const [i,r] of D.order.entries()){if(r.kind!=='normal')continue;
    if(i%3===1){for(let k=0;k<ri(2,4);k++){const c=r.cells[Math.floor(rng()*r.cells.length)];const x=c[0]+0.5,z=c[1]+0.5;if(!free(x,z,0.7))continue;const isB=rng()<0.6;const o=cloneProp(isB?'wine_barrel_01':'wooden_crate_01');place(o,x,z,rng()*6,isB?1.05:1.3,0.5);}}
    if(rng()<0.35){for(let t=0;t<12;t++){const c=r.cells[Math.floor(rng()*r.cells.length)];const x=c[0]+0.5,z=c[1]+0.5;if(!free(x,z,0.9))continue;const ch=cloneProp('treasure_chest');place(ch,x,z,rng()*6,1.25,0.7);chests.push({obj:ch,x,z,opened:false,boss:false});break;}}
    if(rng()<0.5)addDecal(r.cx+(rng()-.5)*3,r.cy+(rng()-.5)*3,1.2+rng()*1.8,rng,0.75,false);}
  {const x=b.cx,z=b.cy-b.r*0.45;const ch=cloneProp('treasure_chest');place(ch,x,z,0,1.25,0.7);chests.push({obj:ch,x,z,opened:false,boss:true});}
  // still water puddles (drips land here)
  for(let k=0;k<10;k++){const r=D.order[ri(0,D.order.length-1)];const c=r.cells[Math.floor(rng()*r.cells.length)];if(!c)continue;const m=new THREE.Mesh(new THREE.CircleGeometry(0.6+rng()*1.1,20),puddleMat);m.rotation.x=-Math.PI/2;m.scale.y=0.6+rng()*0.5;m.position.set(c[0]+0.5,0.025,c[1]+0.5);m.userData.ownGeo=true;m.receiveShadow=true;level.add(m);puddles.push(m.position);}
  // enemies
  const types=['skeleton','skeleton','skeleton','caller'];
  const eliteRoom=D.order[Math.max(2,Math.floor(D.order.length*0.6))];
  for(const r of D.order){if(r.kind==='start')continue;
    const pick=()=>{for(let t=0;t<30;t++){const [i,j]=r.cells[Math.floor(rng()*r.cells.length)];const x=i+0.5+(rng()-.5)*0.6,z=j+0.5+(rng()-.5)*0.6;if(free(x,z,0.45))return [x,z];}return [r.cx,r.cy];};
    if(r.kind==='boss'){spawnEnemy('boss',b.cx,b.cy,rng);for(let k=0;k<3;k++){const [x,z]=pick();spawnEnemy('skeleton',x,z,rng);}continue;}
    const n=ri(3,5)+Math.min(3,G.depth-1);for(let k=0;k<n;k++){const [x,z]=pick();spawnEnemy(types[Math.floor(rng()*types.length)],x,z,rng);}
    if(r===eliteRoom){const [x,z]=pick();spawnEnemy('brute',x,z,rng);}}
  const s=D.start;P.pos.set(s.cx,0,s.cy);P.path=null;P.target=null;hero.root.position.copy(P.pos);
  G.bossAwake=false;
  mergeStatics();
  if(G.state==='play')banner('The Smoldering Depths','Depth '+G.depth);
}
function splitChunks(geo,CH){const g=geo.index?geo.toNonIndexed():geo;const pos=g.attributes.position;const names=Object.keys(g.attributes);const buckets=new Map();
  for(let t=0;t<pos.count;t+=3){const cx=(pos.getX(t)+pos.getX(t+1)+pos.getX(t+2))/3,cz=(pos.getZ(t)+pos.getZ(t+1)+pos.getZ(t+2))/3;const k=Math.floor(cx/CH)+','+Math.floor(cz/CH);let b=buckets.get(k);if(!b){b=[];buckets.set(k,b);}b.push(t);}
  const out=[];for(const tris of buckets.values()){const ng=new THREE.BufferGeometry();for(const n of names){const a=g.attributes[n];const isz=a.itemSize;const arr=new a.array.constructor(tris.length*3*isz);let o=0;for(const t of tris){arr.set(a.array.subarray(t*isz,(t+3)*isz),o);o+=3*isz;}ng.setAttribute(n,new THREE.BufferAttribute(arr,isz,a.normalized));}
    ng.computeBoundingSphere();ng.computeBoundingBox();out.push(ng);}
  if(g!==geo)g.dispose();return out;}
// batch the hundreds of static rock meshes (stalagmites, rubble, boulders) into one draw per material per 16m chunk
function mergeStatics(){const CH=16;const groups=new Map();const MATS=new Set([rockMat,typeof pillarMat!=='undefined'?pillarMat:rockMat]);
  for(const o of level.children.slice()){if(!o.isMesh||o.isSkinnedMesh||o.isInstancedMesh||o.children.length||!MATS.has(o.material))continue;
    const g=o.geometry;const key=o.material.uuid+'|'+o.castShadow+'|'+Object.keys(g.attributes).sort().join(',')+'|'+!!g.index+'|'+Math.floor(o.position.x/CH)+','+Math.floor(o.position.z/CH);
    if(!groups.has(key))groups.set(key,[]);groups.get(key).push(o);}
  let n=0;for(const [k,list] of groups){if(list.length<2)continue;const geos=list.map(o=>{o.updateMatrix();const g=o.geometry.clone();g.applyMatrix4(o.matrix);return g;});
    const mg=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());if(!mg)continue;const m=new THREE.Mesh(mg,list[0].material);m.castShadow=list[0].castShadow;m.receiveShadow=true;m.userData.ownGeo=true;level.add(m);
    for(const o of list){level.remove(o);if(o.userData.ownGeo)o.geometry.dispose();}n+=list.length;}
  TEST.merged=n;}
// a noisy rock spike (stalagmite / stalactite / boulder)
function spikeGeo(rng,r,h){const g=new THREE.ConeGeometry(r,h,9,6,false);g.translate(0,h/2,0);const p=g.attributes.position;const ph=rng()*50;
  for(let v=0;v<p.count;v++){const x=p.getX(v),y=p.getY(v),z=p.getZ(v);const n=fbm(x*3+ph,y*2.2,z*3,3);const k=0.65+n*0.8;p.setXYZ(v,x*k+(y/h)*(y/h)*0.15*Math.sin(ph),y,z*k);}
  g.computeVertexNormals();return g;}
function crystalCluster(rng,col){const g=new THREE.Group();const mat=new THREE.MeshStandardMaterial({color:0x101018,emissive:new THREE.Color(...col),emissiveIntensity:0.32,roughness:0.15,metalness:0.2,transparent:true,opacity:0.92});
  for(let k=0;k<7;k++){const h=0.4+rng()*1.3;const c=new THREE.Mesh(new THREE.OctahedronGeometry(1,0),mat);c.scale.set(0.09+rng()*0.08,h,0.09+rng()*0.08);c.position.set((rng()-.5)*0.8,h*0.6,(rng()-.5)*0.5+0.15);c.rotation.set((rng()-.5)*0.9,rng()*6,(rng()-.5)*0.9);c.userData.ownGeo=true;g.add(c);}
  return g;}
function addDecal(x,z,size,rng,alpha=1,fresh=true){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshStandardMaterial({color:fresh?0x3a0303:0x1c0505,alphaMap:bloodTexs[Math.floor(rng()*3)],transparent:true,opacity:alpha,roughness:fresh?0.15:0.6,metalness:0.1,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2}));
  m.rotation.x=-Math.PI/2;m.rotation.z=rng()*6;m.position.set(x,0.015+decals.length*0.0001,z);m.receiveShadow=true;m.userData.ownGeo=true;level.add(m);decals.push(m);
  if(decals.length>60){const o=decals.shift();level.remove(o);}
}
// ---------- enemies ----------
const ENEMY={
  skeleton:{atkClip:'Sword_Attack',atkHit:0.40,name:'Ashen Dead',hp:42,dmg:[5,9],speed:2.7,range:1.75,atk:1.05,xp:14,r:0.45,move:'walk',ts:1.15},
  caller:{atkClip:'Spell_Simple_Shoot',atkHit:0.16,name:'Grave Caller',hp:30,dmg:[7,11],speed:2.6,range:9,atk:1.4,xp:18,r:0.42,move:'walk',ts:1.0,ranged:true},
  brute:{atkClip:'Sword_Regular_C',atkHit:0.62,name:'Gorethrall the Unbroken',hp:220,dmg:[12,19],speed:2.6,range:2.2,atk:1.25,xp:90,r:0.65,move:'walk',ts:1.0,scale:1.4,elite:true},
  boss:{atkClip:'Sword_Regular_C',atkHit:0.62,name:'Varkoth, the Bone Warden',hp:1100,dmg:[18,28],speed:3.1,range:3.0,atk:1.35,xp:500,r:1.0,move:'walk',ts:0.85,scale:2.05,boss:true},
};
function spawnEnemy(type,x,z,rng){
  const T0=ENEMY[type];const mult=1+0.4*(G.depth-1);
  const c=makeCharacter(type,T0.scale||1);c.anim.phase=rng();c.anim.idle.time=rng()*2;
  if(type!=='caller'){const w=cloneProp('wooden_handle_saber');w.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.color.multiplyScalar(type==='skeleton'?0.55:0.4);}});attach(c.bones.rHand,w,WPOS,WROT,type==='boss'?1.5*2.05:type==='brute'?1.2*1.4:1.1);}
  if(type==='caller'){const orb=new THREE.Mesh(new THREE.SphereGeometry(1,12,10),new THREE.MeshBasicMaterial({color:new THREE.Color(2.2,0.6,4.5)}));attach(c.bones.lHand,orb,[0,0.12,0.02],[0,0,0],0.09);c.orb=orb;}
  c.root.position.set(x,0,z);c.yaw=rng()*6;level.add(c.root);
  const e={type,def:T0,c,pos:c.root.position,hp:T0.hp*mult,maxHp:T0.hp*mult,dmgMul:mult,state:'idle',atkT:-1,cd:rng()*1.5,path:null,pathT:0,flash:0,dead:false,deadT:0,hurt:0,knock:new THREE.Vector3(),r:T0.r,slamCd:4,name:T0.name};
  const bar=document.createElement('div');bar.className='ebar'+(T0.elite?' elite':'');bar.innerHTML=`<i></i><s></s>${T0.elite?`<b>${T0.name}<em>Elite</em></b>`:''}`;e.chip=1;$('labels').appendChild(bar);e.bar=bar;
  enemies.push(e);return e;
}
// sword in the right fist (UAL hand_r: fingers +Y, index->pinky -Z): blade along +Z (thumb side), edge toward the knuckles
const WPOS=[-0.028,0.075,0.0],WROT=new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0))).toArray().slice(0,3);
// ---------- loot ----------
function dropLoot(x,z,item,gold){
  const g=new THREE.Group();let beam=null;
  if(gold){for(let k=0;k<7;k++){const c=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.025,12),goldMat);c.position.set((Math.random()-.5)*0.35,0.02+k*0.012,(Math.random()-.5)*0.35);c.rotation.set((Math.random()-.5)*0.6,0,(Math.random()-.5)*0.6);c.castShadow=true;g.add(c);}}
  else if(item.type==='potion'){const b=new THREE.Mesh(new THREE.SphereGeometry(0.16,12,10),new THREE.MeshStandardMaterial({color:0x8a0808,emissive:0x600000,emissiveIntensity:1.5,roughness:0.1,metalness:0.2}));b.position.y=0.17;g.add(b);const n=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,0.14,8),new THREE.MeshStandardMaterial({color:0x553311}));n.position.y=0.36;g.add(n);}
  else{
    if(['sword','axe','mace'].includes(item.type)){const w=cloneProp('wooden_handle_saber');w.rotation.set(Math.PI/2,0,Math.random()*6);w.position.y=0.05;g.add(w);}
    else{const jew=item.type==='ring'||item.type==='amulet';const m=new THREE.Mesh(jew?new THREE.TorusGeometry(0.12,0.035,8,16):new THREE.BoxGeometry(0.42,0.18,0.34),jew?goldMat:new THREE.MeshStandardMaterial({color:0x55524c,metalness:0.9,roughness:0.35}));m.position.y=0.09;if(jew)m.rotation.x=Math.PI/2;m.castShadow=true;g.add(m);}
    const R=RARITY[item.rarity];
    if(R.beam){const h=item.rarity==='legendary'||item.rarity==='unique'?5.5:4;beam=new THREE.Mesh(new THREE.PlaneGeometry(0.8,h),beamMaterial(R.beam));beam.position.y=h/2;g.add(beam);}
  }
  g.position.set(x,0,z);level.add(g);
  const lab=document.createElement('div');lab.style.display='none';lab.className='loot '+(gold?'gold':item.type==='potion'?'potion':item.rarity||'common');
  lab.innerHTML=`<img src="${gold?uiImg('it_gold'):itemIcon(item)}" alt=""><span>${gold?gold+' Gold':item.name}</span>`;$('labels').appendChild(lab);
  const L={g,item,gold,label:lab,beam,x,z,t:0,vy:3+Math.random()*2,y:1.2};
  lab.addEventListener('pointerdown',ev=>{ev.stopPropagation();ev.preventDefault();initAudio();if(G.state==='play'&&ev.button===0){P.target={type:'loot',loot:L};P.path=null;clickMarker(new THREE.Vector3(L.x,0,L.z));}});
  loots.push(L);
  if(item&&['legendary','rare','unique'].includes(item.rarity)){flash(new THREE.Vector3(x,1.5,z),item.rarity==='legendary'?0xff8a1e:item.rarity==='unique'?0xe8d6a4:0xf2d24b,30,1.2,9);if(item.rarity!=='rare')sfx.legendary();}
  return L;
}
function rollDrops(e){
  const rng=Math.random;const x=e.pos.x,z=e.pos.z;
  const sc=()=>{const a=Math.random()*6.28,d=0.6+Math.random()*1.3;let px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;if(!walkable(D,px,pz,0.2)){px=x;pz=z;}return [px,pz];};
  const ilvl=G.depth*3+P.level;
  if(e.def.boss){for(let k=0;k<6;k++){const [px,pz]=sc();dropLoot(px,pz,rollItem(rng,ilvl+4,k===0?'legendary':k<3?'rare':'magic',0.1));}for(let k=0;k<4;k++){const [px,pz]=sc();dropLoot(px,pz,null,Math.round(60+Math.random()*120*G.depth));}return;}
  if(e.def.elite){for(let k=0;k<3;k++){const [px,pz]=sc();dropLoot(px,pz,rollItem(rng,ilvl+2,k===0?'rare':'magic',0.05));}const [px,pz]=sc();dropLoot(px,pz,null,Math.round(40+Math.random()*60));return;}
  if(rng()<0.5){const [px,pz]=sc();dropLoot(px,pz,null,Math.round(4+Math.random()*14*G.depth));}
  if(rng()<0.33){const [px,pz]=sc();dropLoot(px,pz,rollItem(rng,ilvl,'common',P.level>1?0.03:0));}
  if(rng()<0.12){const [px,pz]=sc();dropLoot(px,pz,{type:'potion',name:'Healing Potion',rarity:'common'});}
}
function pickupFx(L,col){const c=col||[2,1.6,0.8];for(let k=0;k<26;k++){const a=Math.random()*6.28,v=1+Math.random()*2.5;fxAdd.emit({x:L.x,y:0.3,z:L.z,vx:Math.cos(a)*v,vy:1.5+Math.random()*3,vz:Math.sin(a)*v,life:0.5+Math.random()*0.4,grav:4,drag:1.5,size:0.09,size1:0.01,color:c});}
  fxAdd.emit({x:L.x,y:0.2,z:L.z,life:0.35,size:1.4,size1:0.2,color:c});}
function pickup(L){
  if(!loots.includes(L))return false;
  if(L.gold){P.gold+=L.gold;sfx.coin();pickupFx(L,[2.4,1.7,0.5]);floatText(L.g.position.clone().setY(1),'+'+L.gold+' gold','goldt');}
  else if(L.item.type==='potion'){if(P.potions>=9){if(!L.fullT||G.time-L.fullT>2){L.fullT=G.time;floatText(P.pos.clone().setY(2.2),'Potions full','info');}return false;}P.potions++;sfx.potion();pickupFx(L,[2.2,0.25,0.15]);floatText(P.pos.clone().setY(2.2),'+1 Healing Potion','info');}
  else{if(P.inv.length>=40){floatText(P.pos.clone().setY(2.2),'Inventory full','info');sfx.deny&&sfx.deny();const b=$('bInv');if(b){b.classList.add('deny');setTimeout(()=>b.classList.remove('deny'),250);}return false;}
    L.item.isNew=true;P.inv.push(L.item);sfx.item();const R=RARITY[L.item.rarity];pickupFx(L,R.beam||[1.6,1.5,1.3]);floatText(P.pos.clone().setY(2.3),L.item.name,'pick-'+L.item.rarity);
    if(!P.equip[L.item.slot])equip(L.item);refreshInv();const bi=$('bInv');if(bi){bi.classList.remove('ready');void bi.offsetWidth;bi.classList.add('ready');}}
  level.remove(L.g);L.label.remove();loots.splice(loots.indexOf(L),1);return true;
}
function pickLoot(x,y,rad){let best=null,bd=rad;for(const L of loots){const [sx,sy,sz]=screenOf(L.g.position,0.25);if(sz>=1)continue;const d=Math.hypot(sx-x,sy-y);if(d<bd){bd=d;best=L;}}return best;}
function salvage(it){const i=P.inv.indexOf(it);if(i<0)return;P.inv.splice(i,1);const g=Math.round((it.power||100)/12*({common:1,magic:1.5,rare:2.5,legendary:5,unique:8}[it.rarity]||1));P.gold+=g;sfx.coin();floatText(P.pos.clone().setY(2.2),'+'+g+' gold','goldt');refreshInv();}
function equip(it){const prev=P.equip[it.slot];P.equip[it.slot]=it;P.inv.splice(P.inv.indexOf(it),1);if(prev)P.inv.push(prev);S=stats();P.hp=Math.min(P.hp,S.maxHp);refreshInv();}
// ---------- combat ----------
function rollDmg(mult=1,fire=false){let d=S.dmgMin+Math.random()*(S.dmgMax-S.dmgMin);d*=mult;if(fire)d*=1+S.fire/100;const crit=Math.random()*100<S.crit;if(crit)d*=1.85;return {d:Math.round(d),crit};}
function damageEnemy(e,amt,crit,src,kind='phys'){
  if(e.dead)return;e.hp-=amt;e.flash=1;e.hurt=1;
  if(e.hp>0){// flinch: normal enemies are interrupted mid wind-up, elites/boss only flinch
    const light=!e.def.elite&&!e.def.boss;
    if(light&&e.atkT>=0&&e.atkT<0.5&&!e.slamming){e.atkT=-1;e.cd=0.45+Math.random()*0.3;}
    if(e.atkT<0){e.c.anim.play(Math.random()<0.5?'Hit_Chest':'Hit_Head',{fade:0.04,ts:1.25,w:light?1:e.def.boss?0.35:0.6});e.hitAnim=true;}}
  if(e.state==='idle')aggro(e);
  const p=e.pos.clone();p.y=1.5*(e.def.scale||1)+0.3;
  floatText(p,String(amt),crit?'crit':kind==='fire'?'fire':'dmg');
  const dir=e.pos.clone().sub(src||P.pos).setY(0);if(dir.lengthSq()<1e-4)dir.set(0,0,1);dir.normalize();
  const kb=e.def.boss?0.2:e.def.elite?0.8:2.2;e.knock.addScaledVector(dir,kb*(crit?1.6:1));
  const hp=e.pos.clone();hp.y=1.1*(e.def.scale||1);
  for(let k=0;k<(crit?26:14);k++){const v=dir.clone().multiplyScalar(2+Math.random()*5).add(new THREE.Vector3((Math.random()-.5)*5,Math.random()*4,(Math.random()-.5)*5));fxAdd.emit({x:hp.x,y:hp.y,z:hp.z,vx:v.x,vy:v.y,vz:v.z,life:0.25+Math.random()*0.35,grav:12,drag:2,size:0.06+Math.random()*0.05,size1:0.01,color:kind==='fire'?[5,1.8,0.4]:[2.6,1.7,0.8],color1:[2,0.4,0.05],floor:true});}
  for(let k=0;k<(crit?16:8);k++){const v=dir.clone().multiplyScalar(1+Math.random()*3).add(new THREE.Vector3((Math.random()-.5)*2,1+Math.random()*3,(Math.random()-.5)*2));fxAlpha.emit({x:hp.x,y:hp.y,z:hp.z,vx:v.x,vy:v.y,vz:v.z,life:0.6+Math.random()*0.5,grav:14,drag:1,size:0.12+Math.random()*0.12,size1:0.06,color:e.type==='skeleton'?[0.55,0.5,0.42]:[0.35,0.02,0.02],color1:[0.15,0.01,0.01],alpha:0.95,floor:true});}
  if(S.loh)healP(S.loh,false);
  G.hitstop=crit?0.07:0.035;if(crit||amt>40)shake(crit?0.35:0.2);
  sfx.hit(crit);if(e.type==='skeleton')sfx.bone();
  if(e.hp<=0)killEnemy(e);
}
function killEnemy(e){
  e.dead=true;e.deadT=0;e.state='dead';e.bar.style.display='none';G.kills++;e.hitAnim=false;e.c.anim.play('Death01',{fade:0.06,ts:e.def.boss?0.9:1.2});
  sfx.die();shake(e.def.boss?1.2:0.25);
  addDecal(e.pos.x,e.pos.z,1.6+(e.def.scale||1)*1.2,Math.random,0.92,true);
  const hp=e.pos.clone();
  for(let k=0;k<40;k++){fxAlpha.emit({x:hp.x+(Math.random()-.5),y:0.2+Math.random()*1.5,z:hp.z+(Math.random()-.5),vx:(Math.random()-.5)*2,vy:Math.random()*1.5,vz:(Math.random()-.5)*2,life:1+Math.random(),grav:-0.2,drag:1.5,size:0.5+Math.random()*0.6,size1:1.4,color:[0.12,0.11,0.1],alpha:0.35});}
  gainXP(Math.round(e.def.xp*e.dmgMul));
  setTimeout(()=>rollDrops(e),e.def.boss?600:250);
  if(e.def.boss){banner('Varkoth has fallen','Victory');setTimeout(()=>{$('victory').classList.add('show');},3500);for(let k=0;k<150;k++){const a=Math.random()*6.28,s=4+Math.random()*10;fxAdd.emit({x:hp.x,y:1.5,z:hp.z,vx:Math.cos(a)*s,vy:Math.random()*10,vz:Math.sin(a)*s,life:1+Math.random(),grav:6,drag:1,size:0.15,size1:0.02,color:[6,2.5,0.6],color1:[2,0.3,0],floor:true});}flash(hp.clone().setY(2),0xff6020,80,1.5,20);}
}
function aggro(e){if(e.state!=='idle')return;e.state='chase';for(const o of enemies)if(!o.dead&&o.state==='idle'&&!o.def.boss&&o.pos.distanceTo(e.pos)<7)o.state='chase';}
function hurtPlayer(amt,src){
  if(P.dead||G.god)return;const red=100/(100+S.armor*1.5);amt=Math.max(1,Math.round(amt*red));P.hp-=amt;P.hurtT=1;G.hurt=Math.min(1,G.hurt+0.5+amt/S.maxHp*2);
  floatText(P.pos.clone().setY(2.1),String(amt),'hurt');sfx.hurt();shake(0.15+amt/S.maxHp);
  for(let k=0;k<10;k++)fxAlpha.emit({x:P.pos.x,y:1.2,z:P.pos.z,vx:(Math.random()-.5)*3,vy:1+Math.random()*3,vz:(Math.random()-.5)*3,life:0.7,grav:14,size:0.12,size1:0.05,color:[0.4,0.02,0.02],alpha:0.9,floor:true});
  if(P.hp<=0){P.hp=0;P.dead=true;P.atk=P.cast=P.spin=P.dash=null;hero.anim.play('Death01',{fade:0.1});$('death').classList.add('show');sfx.die();}
  else if(!P.atk&&!P.cast&&!P.spin&&!P.dash&&amt>S.maxHp*0.04){hero.anim.play('Hit_Chest',{fade:0.05,ts:1.3,w:0.7});P.hitAnim=true;}
}
function healP(a,show=true){P.hp=Math.min(S.maxHp,P.hp+a);if(show)floatText(P.pos.clone().setY(2.2),'+'+Math.round(a),'heal');}
const xpNeed=()=>Math.round(70*Math.pow(P.level,1.55));
function gainXP(x){P.xp+=x;let need=xpNeed();while(P.xp>=need){P.xp-=need;P.level++;need=xpNeed();levelUp();}}
function levelUp(){
  S=stats();P.hp=S.maxHp;P.mana=S.maxMana;sfx.levelup();banner('Level '+P.level,'You feel stronger');
  const pil=new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,14,24,1,true),beamMaterial([2.2,1.6,0.6]));pil.position.copy(P.pos);pil.position.y=7;pil.userData.ownGeo=true;level.add(pil);
  slashes.push({mesh:pil,t:0,dur:1.6,kind:'pillar'});flash(P.pos.clone().setY(2),0xffd080,60,1.5,14);
  for(let k=0;k<120;k++){const a=Math.random()*6.28,r=Math.random()*1.2;fxAdd.emit({x:P.pos.x+Math.cos(a)*r,y:Math.random()*0.5,z:P.pos.z+Math.sin(a)*r,vx:Math.cos(a)*0.5,vy:3+Math.random()*6,vz:Math.sin(a)*0.5,life:1+Math.random(),drag:0.5,size:0.1,size1:0.02,color:[5,3.8,1.6],color1:[2,1,0.2]});}
}
function shake(a){G.shake=Math.max(G.shake,a);}
// ---------- skills ----------
const tmpV=new THREE.Vector3();
function useSkill(k,aim){
  if(P.dead||G.state!=='play')return false;const sk=SKILLS[k];
  if(P.cd[k]>0)return false;if(P.mana<sk.mana){floatText(P.pos.clone().setY(2.3),'Not enough mana','info');return false;}
  if(P.dash||P.spin)return false;P.atk=null;P.cast=null;P.hitAnim=false;
  P.mana-=sk.mana;P.cd[k]=sk.cd;
  const dir=aim.clone().sub(P.pos).setY(0);if(dir.lengthSq()<0.01)dir.set(Math.sin(P.yaw),0,Math.cos(P.yaw));dir.normalize();
  P.yaw=Math.atan2(dir.x,dir.z);P.path=null;if(P.target&&P.target.type==='point')P.target=null;
  if(k==='fire'){P.cast={t:0,dur:0.42,dir,fired:false};hero.anim.play(SKILLANIM.fire.clip,{fade:0.08,ts:SKILLANIM.fire.ts});}
  if(k==='whirl'){P.spin={t:0,dur:0.5,hit:false,yaw0:P.yaw};sfx.whirl();hero.anim.play(SKILLANIM.whirl.clip,{fade:0.06,ts:SKILLANIM.whirl.ts,from:SKILLANIM.whirl.from});
    const m=new THREE.Mesh(makeArcGeo(2.0,3.3,Math.PI*2,96),slashMaterial([1.8,1.0,0.5],0.4));m.position.copy(P.pos);m.position.y=1.0;m.userData.ownGeo=true;level.add(m);slashes.push({mesh:m,t:0,dur:0.5,kind:'whirl'});}
  if(k==='dash'){const len=7.5;const to=P.pos.clone();for(let s=0;s<=30;s++){const t=P.pos.clone().addScaledVector(dir,len*s/30);if(!walkable(D,t.x,t.z,0.35)||blockedByObs(t.x,t.z,0.35))break;to.copy(t);}
    P.dash={t:0,dur:0.22,from:P.pos.clone(),to,hit:new Set()};sfx.dash();hero.anim.play(SKILLANIM.dash.clip,{fade:0.05,ts:SKILLANIM.dash.ts,from:SKILLANIM.dash.from});}
  return true;
}
function spawnFireball(dir){
  const core=new THREE.Mesh(new THREE.SphereGeometry(0.28,16,12),new THREE.MeshBasicMaterial({color:new THREE.Color(6,2.6,0.7)}));
  const p=P.pos.clone().addScaledVector(dir,0.9);p.y=1.35;core.position.copy(p);core.userData.ownGeo=true;level.add(core);
  const L=flash(p,0xff7a28,26,1.4,9);
  projectiles.push({kind:'fire',mesh:core,pos:p,vel:dir.clone().multiplyScalar(17),life:1.3,light:L,friendly:true});sfx.fireball();
}
function explode(pos,radius,dmgMult){
  sfx.boom();shake(0.45);flash(pos.clone().setY(1.5),0xff6a20,38,0.5,10);
  for(let k=0;k<90;k++){const a=Math.random()*6.28,el=Math.random()*1.4,s=3+Math.random()*9;fxAdd.emit({x:pos.x,y:pos.y,z:pos.z,vx:Math.cos(a)*Math.cos(el)*s,vy:Math.sin(el)*s,vz:Math.sin(a)*Math.cos(el)*s,life:0.35+Math.random()*0.5,grav:7,drag:2.5,size:0.35+Math.random()*0.4,size1:0.05,color:[7,3,0.8],color1:[1.5,0.2,0.02],floor:true});}
  for(let k=0;k<30;k++){fxAlpha.emit({x:pos.x+(Math.random()-.5),y:pos.y,z:pos.z+(Math.random()-.5),vx:(Math.random()-.5)*3,vy:1+Math.random()*2,vz:(Math.random()-.5)*3,life:1.2+Math.random(),drag:1.5,size:0.8,size1:2,color:[0.08,0.07,0.06],alpha:0.55});}
  for(const e of enemies){if(e.dead)continue;if(e.pos.distanceTo(tmpV.set(pos.x,0,pos.z))<radius+e.r){const r=rollDmg(dmgMult,true);damageEnemy(e,r.d,r.crit,pos,'fire');}}
  const ring=new THREE.Mesh(new THREE.PlaneGeometry(radius*2.4,radius*2.4),ringMaterial([2.2,0.8,0.2]));ring.rotation.x=-Math.PI/2;ring.position.set(pos.x,0.05,pos.z);ring.userData.ownGeo=true;level.add(ring);slashes.push({mesh:ring,t:0,dur:0.4,kind:'shock'});
  addDecal(pos.x,pos.z,2.2,Math.random,0.5,false);
}
function blockedByObs(x,z,r){for(const o of obstacles){const dx=x-o.x,dz=z-o.z;if(dx*dx+dz*dz<(o.r+r)**2)return true;}return false;}
function moveEntity(pos,dx,dz,r){
  const nx=pos.x+dx;if(walkable(D,nx,pos.z,r))pos.x=nx;const nz=pos.z+dz;if(walkable(D,pos.x,nz,r))pos.z=nz;
  for(const o of obstacles){const ox=pos.x-o.x,oz=pos.z-o.z,d=Math.hypot(ox,oz),m=o.r+r;if(d<m&&d>1e-4){const px=pos.x+ox/d*(m-d),pz=pos.z+oz/d*(m-d);if(walkable(D,px,pz,r)){pos.x=px;pos.z=pz;}}}
}
// ---------- input ----------
const mouse={x:innerWidth/2,y:innerHeight/2,down:false,ground:new THREE.Vector3(),hover:null,downTarget:null,shift:false};
const ray=new THREE.Raycaster();const ndc=new THREE.Vector2();
function groundAt(x,y,out){ndc.set(x/innerWidth*2-1,-(y/innerHeight)*2+1);ray.setFromCamera(ndc,camera);const t=-ray.ray.origin.y/ray.ray.direction.y;out.copy(ray.ray.origin).addScaledVector(ray.ray.direction,t);return out;}
const _sp=new THREE.Vector3();
function screenOf(v,y){_sp.set(v.x,y,v.z).project(camera);return [(_sp.x+1)/2*innerWidth,(1-_sp.y)/2*innerHeight,_sp.z];}
function pickEnemy(x,y,slack=1){let best=null,bd=1e9;for(const e of enemies){if(e.dead||!e.c.root.visible)continue;const sc=(e.def.scale||1);const [sx,sy]=screenOf(e.pos,1.0*sc);const r=(e.def.boss?90:e.def.elite?60:42)*slack*(innerHeight/800);const d=Math.hypot(sx-x,(sy-y)*0.7);if(d<r&&d<bd){bd=d;best=e;}}return best;}
function pickChest(x,y){for(const c of chests){if(c.opened)continue;const [sx,sy]=screenOf({x:c.x,z:c.z},0.6);if(Math.hypot(sx-x,sy-y)<45)return c;}return null;}
const cvs=renderer.domElement;
cvs.addEventListener('contextmenu',e=>e.preventDefault());
addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||e.pointerId===mouse.pid){mouse.x=e.clientX;mouse.y=e.clientY;}});
cvs.addEventListener('pointerdown',e=>{
  initAudio();if(mouse.down&&e.pointerType!=='mouse'&&mouse.pid!==e.pointerId)return;mouse.pid=e.pointerId;mouse.x=e.clientX;mouse.y=e.clientY;mouse.touch=e.pointerType!=='mouse';if(G.state!=='play')return;
  groundAt(mouse.x,mouse.y,mouse.ground);
  if(e.button===2){useSkill('fire',mouse.ground);return;}
  if(e.button!==0)return;
  mouse.down=true;try{cvs.setPointerCapture(e.pointerId);}catch(_){}
  const en=pickEnemy(mouse.x,mouse.y,e.pointerType==='touch'?1.7:1);const lo=!en&&pickLoot(mouse.x,mouse.y,e.pointerType==='touch'?44:26);const ch=!en&&!lo&&pickChest(mouse.x,mouse.y);
  if(lo){P.target={type:'loot',loot:lo};P.path=null;mouse.downTarget=null;}
  else if(en){P.target={type:'enemy',e:en};mouse.downTarget=en;}
  else if(ch){P.target={type:'chest',c:ch};mouse.downTarget=ch;}
  else{mouse.downTarget=null;setMoveTarget(mouse.ground.clone());clickMarker(mouse.ground);}
});
const upH=e=>{if(e.pointerType==='mouse'||e.pointerId===mouse.pid){mouse.down=false;mouse.downTarget=null;mouse.pid=null;}};
addEventListener('pointerup',upH);addEventListener('pointercancel',upH);
addEventListener('keydown',e=>{
  if(e.key==='Shift')mouse.shift=true;
  if(e.code==='Space'&&G.state==='play'){e.preventDefault();if(!e.repeat)G.atkPress=true;G.atkHeld=true;}
  if(G.state!=='play')return;const k=e.key.toLowerCase();
  groundAt(mouse.x,mouse.y,mouse.ground);
  if(k==='1')useSkill('whirl',mouse.ground);if(k==='2')useSkill('fire',mouse.ground);if(k==='3')useSkill('dash',mouse.ground);
  if(k==='q')drinkPotion();if(k==='i'||k==='c')toggleInv();if(k==='escape'){$('inv').classList.remove('show');hideTip();}
  if(k==='m')$('minimap').classList.toggle('hide');
});
addEventListener('keyup',e=>{if(e.key==='Shift')mouse.shift=false;if(e.code==='Space')G.atkHeld=false;});
function drinkPotion(){if(P.potions<=0||P.cd.potion>0||P.dead)return;P.potions--;P.cd.potion=1;healP(S.maxHp*0.45);sfx.potion();for(let k=0;k<40;k++){const a=Math.random()*6.28;fxAdd.emit({x:P.pos.x+Math.cos(a)*0.6,y:0.2+Math.random(),z:P.pos.z+Math.sin(a)*0.6,vy:1.5+Math.random()*2,life:0.9,size:0.08,size1:0.01,color:[3,0.4,0.3]});}}
function setMoveTarget(pt){P.target={type:'point',p:pt};P.path=null;}
let marker=null;
function clickMarker(p){if(!marker){marker=new THREE.Mesh(new THREE.PlaneGeometry(1.2,1.2),ringMaterial([2,1.4,0.6]));marker.rotation.x=-Math.PI/2;scene.add(marker);}marker.position.set(p.x,0.04,p.z);marker.userData.t=0;marker.visible=true;}
const floats=[];
function floatText(pos,text,cls){const el=document.createElement('div');el.className='ft '+cls;el.textContent=text;$('labels').appendChild(el);floats.push({el,pos:pos.clone(),t:0,dx:(Math.random()-.5)*40});}
function banner(t,sub){$('banner').innerHTML=`<div class=bsub>${sub||''}</div><div class=bmain>${t}</div>`;$('banner').classList.remove('show');void $('banner').offsetWidth;$('banner').classList.add('show');}
let hero=null;
// ---------- update ----------
const clock=new THREE.Clock();
function updatePlayer(dt){
  if(P.dead)return;
  for(const k in P.cd)P.cd[k]=Math.max(0,P.cd[k]-dt);
  P.mana=Math.min(S.maxMana,P.mana+dt*(5+P.level*0.3));P.hp=Math.min(S.maxHp,P.hp+dt*(0.8+P.level*0.15));
  P.hurtT=Math.max(0,P.hurtT-dt*4);
  if(mouse.down){
    groundAt(mouse.x,mouse.y,mouse.ground);
    if(mouse.downTarget&&mouse.downTarget.hp!==undefined){if(mouse.downTarget.dead){const en=pickEnemy(mouse.x,mouse.y);if(en){mouse.downTarget=en;P.target={type:'enemy',e:en};}else mouse.downTarget=null;}}
    else if(!mouse.downTarget){if(mouse.shift){P.target={type:'stand',p:mouse.ground.clone()};}else if(!P.target||P.target.type==='point'){const tp=P.target&&P.target.p;if(!tp||tp.distanceTo(mouse.ground)>0.6){P.target={type:'point',p:mouse.ground.clone()};}}}
  }
  // ---- attack input: soft-lock the best enemy in front (stick direction wins), auto-approach, combo when held ----
  if(P.atk&&mouse.down&&mouse.downTarget&&mouse.downTarget.hp!==undefined&&!mouse.downTarget.dead)P.atk.queued=true;
  if((G.atkPress||G.atkHeld)&&!P.dash&&!P.spin&&!P.cast){
    if(P.atk)P.atk.queued=true;
    else{const e=softTarget(7);if(e)P.target={type:'enemy',e,auto:true};else{P.target=null;P.path=null;startCombo(null,0);}}
  }
  G.atkPress=false;
  if(P.atk&&(P.atk.phase==='rec'||(P.atk.hit&&P.atk.phase==='swing'&&!P.atk.C.finisher))&&wantsMove()){hero.anim.stop(0.16);P.atk=null;}
  if(P.hitAnim&&(hero.anim.oneName!=='Hit_Chest'||hero.anim.done(0.85))){if(hero.anim.oneName==='Hit_Chest')hero.anim.stop(0.18);P.hitAnim=false;}
  let speed=0;
  if(P.dash){const d=P.dash;d.t+=dt;const t=Math.min(1,d.t/d.dur);P.pos.lerpVectors(d.from,d.to,smooth01(t));
    for(let k=0;k<6;k++)fxAdd.emit({x:P.pos.x+(Math.random()-.5)*0.6,y:0.3+Math.random()*1.6,z:P.pos.z+(Math.random()-.5)*0.6,vx:(Math.random()-.5),vy:0.3,vz:(Math.random()-.5),life:0.45,size:0.25,size1:0.02,color:[0.8,1.4,2.6],color1:[0.1,0.2,0.6]});
    for(const e of enemies){if(e.dead||d.hit.has(e))continue;if(e.pos.distanceTo(P.pos)<1.4+e.r){d.hit.add(e);const r=rollDmg(1.2);damageEnemy(e,r.d,r.crit,d.from);impactFX(e,r.crit,false);e.knock.add(d.to.clone().sub(d.from).normalize().multiplyScalar(e.def.boss?0.5:6));}}
    if(t>=1){P.dash=null;shake(0.15);P.recover={t:0,dur:SKILLANIM.dash.rec};}
  } else if(P.spin){const s=P.spin;s.t+=dt;const t=s.t/s.dur;P.yaw=s.yaw0+smooth01(Math.min(t,1))*Math.PI*2;
    if(!s.hit&&t>0.35){s.hit=true;let n=0;for(const e of enemies){if(e.dead)continue;if(e.pos.distanceTo(P.pos)<3.4+e.r){const r=rollDmg(1.4);damageEnemy(e,r.d,r.crit);impactFX(e,r.crit,true);n++;}}if(n){G.hitstop=Math.max(G.hitstop,0.08);shake(0.3);}}
    if(t>=1){P.spin=null;P.recover={t:0,dur:SKILLANIM.whirl.rec};}
  } else if(P.cast){const c=P.cast;c.t+=dt;if(!c.fired&&c.t>SKILLANIM.fire.at){c.fired=true;spawnFireball(c.dir);}if(c.t>=c.dur){P.cast=null;hero.anim.stop(0.22);}}
  else if(P.atk){updateCombo(P.atk,dt);}
  else if(P.recover&&!wantsMove()){P.recover.t+=dt;if(P.recover.t>=P.recover.dur){P.recover=null;hero.anim.stop(0.25);}}
  else if(P.stick&&P.stick.m>STICK_DEAD&&!(G.atkHeld&&P.target&&P.target.type==='enemy')){
    if(P.recover){P.recover=null;hero.anim.stop(0.15);}
    P.target=null;P.path=null;const m=stickCurve(P.stick.m);const step=S.speed*m*dt;const ox=P.pos.x,oz=P.pos.z;
    moveEntity(P.pos,P.stick.x*step,P.stick.y*step,0.38);speed=Math.hypot(P.pos.x-ox,P.pos.z-oz)/Math.max(dt,1e-4);
    P.yaw=angleLerp(P.yaw,Math.atan2(P.stick.x,P.stick.y),1-Math.exp(-16*dt));
  } else {
    if(P.recover&&P.target){P.recover=null;hero.anim.stop(0.15);}
    const tg=P.target;let goal=null,stopDist=0.15;
    if(tg){if(tg.type==='enemy'){if(tg.e.dead)P.target=null;else{goal=tg.e.pos;stopDist=1.6+tg.e.r;}}
      else if(tg.type==='loot'){if(!loots.includes(tg.loot))P.target=null;else{goal=new THREE.Vector3(tg.loot.x,0,tg.loot.z);stopDist=1.0;}}
      else if(tg.type==='chest'){goal=new THREE.Vector3(tg.c.x,0,tg.c.z);stopDist=1.8;}
      else if(tg.type==='stand'){const f=tg.p.clone().sub(P.pos);P.yaw=Math.atan2(f.x,f.z);startCombo(null,0);P.target=null;}
      else goal=tg.p;}
    if(goal){
      const d=Math.hypot(goal.x-P.pos.x,goal.z-P.pos.z);
      if(d<=stopDist){
        if(tg.type==='enemy'){startCombo(tg.e,0);if(!mouse.down||tg.auto)P.target=null;}
        else if(tg.type==='loot'){pickup(tg.loot);P.target=null;}
        else if(tg.type==='chest'){openChest(tg.c);P.target=null;}
        else P.target=null;
      } else {
        let wp=goal;
        if(!los(D,P.pos.x,P.pos.z,goal.x,goal.z,0.32)){
          if(!P.path||!P.pathGoal||P.pathGoal.distanceTo(goal)>1.2){P.path=findPath(D,P.pos.x,P.pos.z,goal.x,goal.z);P.pathGoal=goal.clone();}
          if(P.path&&P.path.length){while(P.path.length>1&&los(D,P.pos.x,P.pos.z,P.path[1].x,P.path[1].z,0.32))P.path.shift();wp=P.path[0];if(Math.hypot(wp.x-P.pos.x,wp.z-P.pos.z)<0.3)P.path.shift();}
        } else P.path=null;
        const dx=wp.x-P.pos.x,dz=wp.z-P.pos.z,dl=Math.hypot(dx,dz)||1;const step=Math.min(S.speed*dt,dl);
        const ox=P.pos.x,oz=P.pos.z;moveEntity(P.pos,dx/dl*step,dz/dl*step,0.38);
        speed=Math.hypot(P.pos.x-ox,P.pos.z-oz)/Math.max(dt,1e-4);
        if(speed<0.2&&tg.type==='point'&&!mouse.down){P.stuck=(P.stuck||0)+dt;if(P.stuck>0.25){P.target=null;P.stuck=0;}}else P.stuck=0;
        P.yaw=angleLerp(P.yaw,Math.atan2(dx,dz),1-Math.exp(-16*dt));
      }
    }
  }
  hero.yaw=P.yaw;hero.root.rotation.y=P.yaw;hero.root.position.copy(P.pos);
  setLocomotion(hero,speed,S.speed,dt);P.speedNow=speed;
  const ci=toCell(P.pos.x),cj=toCell(P.pos.z);for(let j=cj-14;j<=cj+14;j++)for(let i=ci-14;i<=ci+14;i++)if(i>=0&&j>=0&&i<D.W&&j<D.H&&(i-ci)**2+(j-cj)**2<196)explored[j*D.W+i]=1;
  const br=D.boss;if(!G.bossAwake&&Math.hypot(P.pos.x-br.cx,P.pos.z-br.cy)<br.r*0.85){G.bossAwake=true;const b=enemies.find(e=>e.def.boss);if(b&&!b.dead){b.state='chase';aggro(b);banner('Varkoth, the Bone Warden','Lord of the Smoldering Deep');sfx.roar();shake(0.6);}}
}
// ---------- melee combo (real clips: UAL2 Sword_Regular_A / B / C) ----------
// hit = impact time in clip seconds (measured from blade-tip speed), end = where the next hit may chain in
const COMBO=[
  {clip:'Sword_Regular_A',rec:'Sword_Regular_A_Rec',hit:0.22,end:0.40,ts:1.15,mult:1.0,range:2.7,cone:0.3,lunge:1.8},
  {clip:'Sword_Regular_B',rec:'Sword_Regular_B_Rec',hit:0.25,end:0.48,ts:1.15,mult:1.15,range:2.7,cone:0.3,lunge:1.8},
  {clip:'Sword_Regular_C',rec:null,hit:0.62,end:0.95,ts:1.25,mult:1.9,range:3.0,cone:0.05,lunge:2.6,finisher:true,recMax:0.55}];
const SKILLANIM={fire:{clip:'Spell_Simple_Shoot',ts:1.0,at:0.15},whirl:{clip:'Sword_Regular_B',ts:1.0,from:0.0,rec:0.18},dash:{clip:'Sword_Dash',ts:1.35,from:0.05,rec:0.35}};
TEST.COMBO=COMBO;TEST.SKILLANIM=SKILLANIM;
function startAttack(e){startCombo(e,0);}
function startCombo(e,i){
  const C=COMBO[i];P.recover=null;P.hitAnim=false;
  if(e&&!e.dead){const f=e.pos.clone().sub(P.pos);if(f.lengthSq()>1e-4&&Math.abs(angDiff(P.yaw,Math.atan2(f.x,f.z)))>1.2)P.yaw=angleLerp(P.yaw,Math.atan2(f.x,f.z),0.6);}
  else if(P.stick&&P.stick.m>0.3)P.yaw=Math.atan2(P.stick.x,P.stick.y);
  hero.anim.play(C.clip,{fade:i===0?0.1:0.06,ts:C.ts*S.atkSpeed});
  P.atk={i,C,e,phase:'swing',hit:false,queued:false,whoosh:false,recT:0};P.path=null;
  TEST.comboLog&&TEST.comboLog.push(i);
}
function nextTarget(a){if(a.e&&!a.e.dead&&a.e.pos.distanceTo(P.pos)<4.5)return a.e;return softTarget(4.5);}
function updateCombo(a,dt){
  const C=a.C;const t=hero.anim.oneName===C.clip?hero.anim.time:(a.phase==='swing'?C.end:9);
  if(a.phase==='swing'){
    if(t<C.hit){// soft lock: keep turning into the target until the blade lands
      if(a.e&&!a.e.dead){const f=a.e.pos.clone().sub(P.pos);P.yaw=angleLerp(P.yaw,Math.atan2(f.x,f.z),1-Math.exp(-20*dt));}
      else if(P.stick&&P.stick.m>0.3)P.yaw=angleLerp(P.yaw,Math.atan2(P.stick.x,P.stick.y),1-Math.exp(-12*dt));}
    if(t>C.hit-0.18&&t<C.hit+0.03){const d=a.e&&!a.e.dead?Math.hypot(a.e.pos.x-P.pos.x,a.e.pos.z-P.pos.z)-a.e.r:9;if(d>1.2){const st=C.lunge*dt;moveEntity(P.pos,Math.sin(P.yaw)*st,Math.cos(P.yaw)*st,0.38);}}
    if(!a.whoosh&&t>=C.hit-0.1){a.whoosh=true;sfx.swing();}
    if(!a.hit&&t>=C.hit){a.hit=true;comboHit(a);}
    if(t>=C.end){
      if(a.queued&&a.i<COMBO.length-1){startCombo(nextTarget(a),a.i+1);return;}
      a.phase='rec';a.recT=0;a.queued=false;if(C.rec)hero.anim.play(C.rec,{fade:0.1,ts:1.1});
    }
  } else {
    a.recT+=dt;
    if(a.queued&&a.recT>0.03){startCombo(nextTarget(a),(a.i+1)%COMBO.length);return;}
    if(a.recT>(C.recMax||0.85)||(hero.anim.oneName===C.rec&&hero.anim.done(0.96))){hero.anim.stop(0.28);P.atk=null;}
  }
}
const _tipA=new THREE.Vector3(),_tipB=new THREE.Vector3();
function comboHit(a){
  const C=a.C;const f=new THREE.Vector3(Math.sin(P.yaw),0,Math.cos(P.yaw));let n=0;
  for(const e of enemies){if(e.dead)continue;const to=e.pos.clone().sub(P.pos).setY(0);const d=to.length();
    if(d<C.range+e.r){to.normalize();if(to.dot(f)>C.cone||(e===a.e&&d<C.range+e.r+0.4)){const r=rollDmg(C.mult);damageEnemy(e,r.d,r.crit,P.pos);if(C.finisher&&!e.def.boss)e.knock.multiplyScalar(1.8);impactFX(e,r.crit,C.finisher);n++;}}}
  if(n){G.hitstop=Math.max(G.hitstop,C.finisher?0.11:0.055);shake(C.finisher?0.42:0.17);}
  TEST.hits=(TEST.hits||0)+n;
}
// sparks + a hot flash at the contact point, thrown along the blade's direction of travel
function impactFX(e,crit,big){
  const sc=e.def.scale||1;const p=e.pos.clone();p.y=1.15*sc;const toP=P.pos.clone().sub(e.pos).setY(0).normalize();p.addScaledVector(toP,e.r*0.8);
  const sw=hero.tipVel?hero.tipVel.clone():new THREE.Vector3(Math.cos(P.yaw),0,-Math.sin(P.yaw));if(sw.lengthSq()<1e-4)sw.set(1,0,0);sw.normalize();
  const N=(big?26:14)+(crit?8:0);
  for(let k=0;k<N;k++){const sp=6+Math.random()*12;const v=sw.clone().multiplyScalar(sp*(0.5+Math.random()*0.7)).add(new THREE.Vector3((Math.random()-.5)*6,Math.random()*5,(Math.random()-.5)*6));
    fxAdd.emit({x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,life:0.12+Math.random()*0.22,grav:16,drag:3.5,size:0.05+Math.random()*0.05,size1:0.005,color:[3,2,0.9],color1:[1.2,0.3,0.03],floor:true});}
  fxAdd.emit({x:p.x,y:p.y,z:p.z,life:0.07,size:big?0.55:0.36,size1:0.05,color:[3,2.2,1.4],color1:[1,0.4,0.1]});
  flash(p,0xffb070,big?7:4,0.1,4);
}
function softTarget(maxD=7){
  // keep the current lock if it is still valid
  const cur=P.target&&P.target.type==='enemy'&&!P.target.e.dead?P.target.e:(P.atk&&P.atk.e&&!P.atk.e.dead?P.atk.e:null);
  const useStick=P.stick&&P.stick.m>0.35;const fy=useStick?Math.atan2(P.stick.x,P.stick.y):P.yaw;const fx=Math.sin(fy),fz=Math.cos(fy);
  let best=null,bs=1e9;
  for(const e of enemies){if(e.dead||!e.c.root.visible)continue;const dx=e.pos.x-P.pos.x,dz=e.pos.z-P.pos.z;const d=Math.hypot(dx,dz);if(d>maxD)continue;
    const dot=d>1e-3?(dx*fx+dz*fz)/d:1;if(dot<-0.2&&d>2.4)continue;if(d>2.5&&!los(D,P.pos.x,P.pos.z,e.pos.x,e.pos.z,0.15))continue;
    let sc=d*(1.6-dot*(useStick?1.2:0.7));if(e===cur&&!useStick)sc*=0.6;if(sc<bs){bs=sc;best=e;}}
  return best;
}
function wantsMove(){return (P.stick&&P.stick.m>0.3)||(P.target&&P.target.type!=='enemy')||(P.target&&P.target.type==='enemy'&&!P.target.e.dead&&P.target.e.pos.distanceTo(P.pos)>3.2+P.target.e.r);}
const STICK_DEAD=0.12;function stickCurve(m){const x=clamp((m-STICK_DEAD)/(1-STICK_DEAD),0,1);return x<0.55?0.22+x*0.9:Math.min(1,0.715+(x-0.55)*0.75);}
function openChest(c){if(c.opened)return;c.opened=true;sfx.item();flash(new THREE.Vector3(c.x,1.2,c.z),0xffc060,40,1,8);
  for(let k=0;k<60;k++)fxAdd.emit({x:c.x,y:0.7,z:c.z,vx:(Math.random()-.5)*3,vy:2+Math.random()*4,vz:(Math.random()-.5)*3,life:1,grav:5,size:0.08,size1:0.01,color:[5,3.5,1.2]});
  c.obj.traverse(o=>{if(o.name&&o.name.toLowerCase().includes('lid'))o.rotation.x=-1.1;});
  const n=c.boss?4:2;for(let k=0;k<n;k++){const a=Math.random()*3.14,d=1.2+Math.random();dropLoot(c.x+Math.cos(a)*d,c.z+Math.sin(a)*d+0.6,rollItem(Math.random,G.depth*3+P.level,k===0?'magic':'common',0.08));}
  dropLoot(c.x+0.3,c.z+1.4,null,Math.round(20+Math.random()*50*G.depth));}
function updateEnemies(dt){
  const hp=P.pos;
  for(const e of enemies){
    const c=e.c;const dist=Math.hypot(e.pos.x-hp.x,e.pos.z-hp.z);
    const vis=dist<(IS_MOBILE?22:28)&&!e.removed;c.root.visible=vis;const csh=!IS_MOBILE&&dist<11;if(c.shOn!==csh){c.shOn=csh;c.root.traverse(o=>{if(o.isMesh)o.castShadow=csh;});}
    if(e.dead){e.deadT+=dt;
      const dz=e.def.boss?3.2:2.0;if(e.deadT>dz&&c.dis){const q=Math.min(1,(e.deadT-dz)/1.6);c.dis.value=q*1.05;if(!e.eyesOff){e.eyesOff=true;c.root.traverse(o=>{if(o.isMesh&&/Eye/.test(o.material.name||''))o.visible=false;});}
        if(Math.random()<dt*40&&q<1)fxAdd.emit({x:e.pos.x+(Math.random()-.5)*0.7,y:0.2+Math.random()*1.2*(1-q),z:e.pos.z+(Math.random()-.5)*0.7,vy:0.6+Math.random()*1.2,vx:(Math.random()-.5)*0.4,vz:(Math.random()-.5)*0.4,life:0.8+Math.random()*0.6,size:0.05,size1:0.0,color:[3,1.1,0.25]});}
      if(e.deadT>dz+1.8&&!e.removed){e.removed=true;level.remove(c.root);}
      continue;}
    e.flash=Math.max(0,e.flash-dt*9);e.hurt=Math.max(0,e.hurt-dt*5);
    if(e.hitAnim&&(!e.c.anim.oneName||!e.c.anim.oneName.startsWith('Hit_')||e.c.anim.done(0.8))){if(e.c.anim.oneName&&e.c.anim.oneName.startsWith('Hit_'))e.c.anim.stop(0.2);e.hitAnim=false;}
    setEmissive(c,e.flash*0.13,e.flash*0.08,e.flash*0.05);
    if(e.knock.lengthSq()>0.001){moveEntity(e.pos,e.knock.x*dt*4,e.knock.z*dt*4,e.r);e.knock.multiplyScalar(Math.exp(-8*dt));}
    if(G.frozen){c.root.rotation.y=c.yaw;setLocomotion(c,0,1,dt);continue;}
    if(!vis&&e.state==='idle')continue;
    if(e.state==='idle'&&!P.dead&&!e.def.boss){if(dist<(e.def.ranged?12:10)&&los(D,e.pos.x,e.pos.z,hp.x,hp.z,0.1))aggro(e);}
    let speed=0;e.cd-=dt;
    if(e.state==='chase'&&!P.dead){
      const face=Math.atan2(hp.x-e.pos.x,hp.z-e.pos.z);
      if(e.atkT>=0){e.atkT+=dt/e.def.atk;const t=e.atkT;c.yaw=angleLerp(c.yaw,face,1-Math.exp(-4*dt));
        if(!e.hitDone&&t>0.55){e.hitDone=true;
          if(e.def.ranged){const dir=new THREE.Vector3(hp.x-e.pos.x,0,hp.z-e.pos.z).normalize();const p=e.pos.clone().addScaledVector(dir,0.6);p.y=1.3;
            const m=new THREE.Mesh(new THREE.SphereGeometry(0.2,12,10),new THREE.MeshBasicMaterial({color:new THREE.Color(2.5,0.8,6)}));m.position.copy(p);m.userData.ownGeo=true;level.add(m);
            projectiles.push({kind:'bolt',mesh:m,pos:p,vel:dir.multiplyScalar(10),life:1.6,friendly:false,dmg:e.def.dmg,mul:e.dmgMul});sfx.bolt();}
          else if(e.slamming){e.slamming=false;}
          else if(dist<e.def.range+0.7){const d=e.def.dmg[0]+Math.random()*(e.def.dmg[1]-e.def.dmg[0]);hurtPlayer(d*e.dmgMul,e.pos);if(e.def.boss)shake(0.5);}
        }
        if(t>=1){e.atkT=-1;e.cd=e.def.ranged?1.2+Math.random():0.5+Math.random()*0.6;e.c.anim.stop(0.3);}
      } else {
        if(e.def.boss){e.slamCd-=dt;if(e.slamCd<=0&&dist<9){e.slamCd=6.5;bossSlam(e);}}
        const want=e.def.ranged?7:e.def.range;
        if(e.def.ranged&&dist<9&&e.cd<=0&&los(D,e.pos.x,e.pos.z,hp.x,hp.z,0.15)){e.atkT=0;e.hitDone=false;enemyAttackAnim(e);}
        else if(!e.def.ranged&&dist<=e.def.range&&e.cd<=0){e.atkT=0;e.hitDone=false;enemyAttackAnim(e);}
        else{
          let gx=hp.x,gz=hp.z;let flee=false;
          if(e.def.ranged&&dist<4.5){flee=true;gx=e.pos.x+(e.pos.x-hp.x);gz=e.pos.z+(e.pos.z-hp.z);}
          if(dist>want-0.2||flee){
            let wx=gx,wz=gz;
            if(!flee&&!los(D,e.pos.x,e.pos.z,gx,gz,e.r*0.8)){e.pathT-=dt;if(!e.path||e.pathT<=0){e.path=findPath(D,e.pos.x,e.pos.z,gx,gz);e.pathT=0.7;}if(e.path&&e.path.length){if(Math.hypot(e.path[0].x-e.pos.x,e.path[0].z-e.pos.z)<0.4)e.path.shift();if(e.path.length){wx=e.path[0].x;wz=e.path[0].z;}}}
            const dx=wx-e.pos.x,dz=wz-e.pos.z,dl=Math.hypot(dx,dz)||1;const sp=e.def.speed*(1+0.08*(G.depth-1))*(flee?0.8:1)*(e.hurt>0.5?0.4:1);
            const ox=e.pos.x,oz=e.pos.z;moveEntity(e.pos,dx/dl*sp*dt,dz/dl*sp*dt,e.r);speed=Math.hypot(e.pos.x-ox,e.pos.z-oz)/Math.max(dt,1e-4);
            c.yaw=angleLerp(c.yaw,flee?Math.atan2(dx,dz):Math.atan2(dx,dz),1-Math.exp(-8*dt));
          } else c.yaw=angleLerp(c.yaw,face,1-Math.exp(-8*dt));
        }
      }
    }
    for(const o of enemies){if(o===e||o.dead)continue;const dx=e.pos.x-o.pos.x,dz=e.pos.z-o.pos.z,d=Math.hypot(dx,dz),m=e.r+o.r;if(d<m&&d>1e-4)moveEntity(e.pos,dx/d*(m-d)*0.5,dz/d*(m-d)*0.5,e.r);}
    {const dx=e.pos.x-hp.x,dz=e.pos.z-hp.z,d=Math.hypot(dx,dz),m=e.r+0.4;if(d<m&&d>1e-4)moveEntity(e.pos,dx/d*(m-d),dz/d*(m-d),e.r);}
    c.root.rotation.y=c.yaw;setLocomotion(c,speed,e.def.speed,dt);
    if((e.def.elite||e.def.boss)&&vis&&Math.random()<dt*20)fxAdd.emit({x:e.pos.x+(Math.random()-.5)*1.2,y:0.1,z:e.pos.z+(Math.random()-.5)*1.2,vy:1+Math.random()*1.5,life:1,size:0.12,size1:0.02,color:[4,1.2,0.2],color1:[1,0.1,0]});
    if(c.orb&&vis&&Math.random()<dt*25){const p=new THREE.Vector3();c.orb.getWorldPosition(p);fxAdd.emit({x:p.x,y:p.y,z:p.z,vx:(Math.random()-.5)*.4,vy:0.6,vz:(Math.random()-.5)*.4,life:0.6,size:0.1,size1:0.01,color:[1.8,0.5,4]});}
  }
}
function enemyAttackAnim(e){e.hitAnim=false;e.c.anim.play(e.def.atkClip,{fade:0.12,ts:e.def.atkHit/(0.55*e.def.atk)});}
function bossSlam(e){
  e.atkT=0;e.hitDone=false;e.slamming=true;sfx.roar();enemyAttackAnim(e);
  const pos=P.pos.clone();const ring=new THREE.Mesh(new THREE.PlaneGeometry(7,7),ringMaterial([4,0.5,0.15]));ring.rotation.x=-Math.PI/2;ring.position.set(pos.x,0.06,pos.z);ring.userData.ownGeo=true;level.add(ring);
  telegraphs.push({mesh:ring,t:0,dur:1.1,pos,r:3.2,e});
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.life-=dt;
    p.pos.addScaledVector(p.vel,dt);p.mesh.position.copy(p.pos);let hit=p.life<=0||!walkable(D,p.pos.x,p.pos.z,0.1)||blockedByObs(p.pos.x,p.pos.z,0.1);
    if(p.kind==='fire'){p.light.position.copy(p.pos);p.light.userData.life=Math.max(p.light.userData.life,0.1);p.light.intensity=26;
      for(let k=0;k<5;k++)fxAdd.emit({x:p.pos.x+(Math.random()-.5)*0.25,y:p.pos.y+(Math.random()-.5)*0.25,z:p.pos.z+(Math.random()-.5)*0.25,vx:(Math.random()-.5),vy:0.8+Math.random(),vz:(Math.random()-.5),life:0.35+Math.random()*0.25,size:0.45,size1:0.05,color:[6,2.4,0.5],color1:[1.2,0.15,0.02]});
      if(Math.random()<0.5)fxAlpha.emit({x:p.pos.x,y:p.pos.y,z:p.pos.z,vy:0.6,life:0.8,size:0.4,size1:1.0,color:[0.06,0.05,0.05],alpha:0.35});
      for(const e of enemies){if(!e.dead&&Math.hypot(e.pos.x-p.pos.x,e.pos.z-p.pos.z)<e.r+0.4){hit=true;break;}}
      if(hit)explode(p.pos,2.7,1.7);
    } else {
      for(let k=0;k<2;k++)fxAdd.emit({x:p.pos.x,y:p.pos.y,z:p.pos.z,vx:(Math.random()-.5)*.6,vy:(Math.random()-.5)*.6,vz:(Math.random()-.5)*.6,life:0.4,size:0.3,size1:0.02,color:[2,0.6,5],color1:[0.4,0.05,1]});
      if(!P.dead&&Math.hypot(P.pos.x-p.pos.x,P.pos.z-p.pos.z)<0.6){hit=true;hurtPlayer((p.dmg[0]+Math.random()*(p.dmg[1]-p.dmg[0]))*p.mul,p.pos);}
      if(hit)for(let k=0;k<25;k++)fxAdd.emit({x:p.pos.x,y:p.pos.y,z:p.pos.z,vx:(Math.random()-.5)*6,vy:Math.random()*4,vz:(Math.random()-.5)*6,life:0.4,grav:5,size:0.12,size1:0.01,color:[2.5,0.8,6]});
    }
    if(hit){level.remove(p.mesh);if(p.light)p.light.userData.life=0.15;projectiles.splice(i,1);}
  }
}
function updateFX(dt,rdt=dt){
  fxAdd.update(rdt);fxAlpha.update(rdt);
  for(let i=slashes.length-1;i>=0;i--){const s=slashes[i];s.t+=dt;const p=Math.max(0,s.t/s.dur);
    if(s.kind==='slash'){if(s.t<0){s.mesh.visible=false;continue;}s.mesh.visible=true;s.mesh.position.set(P.pos.x,1.15,P.pos.z);s.mesh.rotation.set(0.12,s.yaw+lerp(0.5,-0.5,p),0);s.mesh.material.uniforms.uP.value=p;}
    if(s.kind==='whirl'){s.mesh.position.set(P.pos.x,1.0,P.pos.z);s.mesh.rotation.y=P.yaw;s.mesh.material.uniforms.uP.value=Math.min(1,p*1.1);s.mesh.scale.setScalar(0.8+p*0.3);}
    if(s.kind==='shock'){s.mesh.scale.setScalar(0.3+p*0.9);s.mesh.material.uniforms.uA.value=1-p;}
    if(s.kind==='pillar'){s.mesh.position.x=P.pos.x;s.mesh.position.z=P.pos.z;s.mesh.material.uniforms.uT.value+=dt;s.mesh.scale.set(1-p*0.6,1,1-p*0.6);s.mesh.material.uniforms.uColor.value.setRGB(2.2*(1-p),1.6*(1-p),0.6*(1-p));}
    if(p>=1){level.remove(s.mesh);slashes.splice(i,1);}
  }
  for(let i=telegraphs.length-1;i>=0;i--){const t=telegraphs[i];t.t+=dt;const p=t.t/t.dur;t.mesh.material.uniforms.uFill.value=p;t.mesh.material.uniforms.uA.value=0.6+0.4*Math.sin(t.t*20);
    if(p>=1){level.remove(t.mesh);telegraphs.splice(i,1);sfx.slam();shake(1.0);explodeDebris(t.pos);if(!P.dead&&P.pos.distanceTo(t.pos)<t.r+0.3)hurtPlayer(40*t.e.dmgMul,t.pos);}}
  for(const l of fxLights){const u=l.userData;if(u.life>0){u.life-=dt;l.intensity=u.base*Math.max(0,u.life/u.max);}else l.intensity=0;}
  if(marker&&marker.visible){marker.userData.t+=dt;const t=marker.userData.t;marker.scale.setScalar(Math.max(0.01,1-t*1.5));marker.material.uniforms.uA.value=1-t*2;if(t>0.5)marker.visible=false;}
  for(const L of loots){L.t+=dt;
    if(L.y>0||L.vy>0){L.vy-=dt*14;L.y=Math.max(0,L.y+L.vy*dt);if(L.y===0&&Math.abs(L.vy)>2)L.vy=-L.vy*0.3;else if(L.y===0)L.vy=0;}
    L.g.position.y=L.y;if(L.beam)L.beam.material.uniforms.uT.value=L.t;
    if((L.gold||L.item.type==='potion')&&L.t>0.5&&L.y===0&&Math.hypot(P.pos.x-L.x,P.pos.z-L.z)<1.3){if(pickup(L))continue;}
    if(L.item&&L.item.rarity!=='common'&&L.item.type!=='potion'&&Math.random()<dt*6)fxAdd.emit({x:L.x+(Math.random()-.5)*0.4,y:0.1,z:L.z+(Math.random()-.5)*0.4,vy:0.8+Math.random(),life:1.2,size:0.06,size1:0.01,color:RARITY[L.item.rarity].beam});
  }
  if(Math.random()<dt*14)fxAlpha.emit({x:P.pos.x+(Math.random()-.5)*14,y:Math.random()*3,z:P.pos.z+(Math.random()-.5)*10,vx:(Math.random()-.5)*0.15,vy:0.05,vz:(Math.random()-.5)*0.15,life:4+Math.random()*3,size:0.035,size1:0.035,color:[0.9,0.75,0.55],alpha:0.6});
}
function explodeDebris(pos){for(let k=0;k<70;k++){const a=Math.random()*6.28,s=2+Math.random()*7;fxAlpha.emit({x:pos.x,y:0.2,z:pos.z,vx:Math.cos(a)*s,vy:2+Math.random()*6,vz:Math.sin(a)*s,life:1+Math.random(),grav:16,drag:0.5,size:0.15+Math.random()*0.2,size1:0.1,color:[0.25,0.22,0.2],alpha:1,floor:true});}
  for(let k=0;k<50;k++){const a=Math.random()*6.28,s=3+Math.random()*4;fxAdd.emit({x:pos.x,y:0.2,z:pos.z,vx:Math.cos(a)*s,vy:Math.random()*2,vz:Math.sin(a)*s,life:0.6,drag:2,size:0.5,size1:0.1,color:[4,0.6,0.15],color1:[0.6,0.05,0]});}
  flash(pos.clone().setY(1),0xff3010,60,0.8,12);addDecal(pos.x,pos.z,3,Math.random,0.6,false);}
let torchTimer=0;
function updateTorches(dt){
  torchTimer-=dt;
  if(torchTimer<=0){torchTimer=0.25;
    const near=torches.map(t=>[Math.hypot(t.fx-P.pos.x,t.fz-P.pos.z),t]).filter(a=>a[0]<30).sort((a,b)=>a[0]-b[0]).slice(0,torchLights.length).map(a=>a[1]);
    const free=[];for(const l of torchLights){if(!near.includes(l.userData.torch)){l.userData.torch=null;free.push(l);}}
    for(const t of near){if(torchLights.some(l=>l.userData.torch===t))continue;const l=free.shift();if(l){l.userData.torch=t;l.userData.fade=0;}}
  }
  const time=G.time;
  for(const l of torchLights){const t=l.userData.torch;if(!t){l.intensity=0;continue;}l.userData.fade=Math.min(1,l.userData.fade+dt*3);
    const n=Math.sin(time*9.1+t.phase)*0.5+Math.sin(time*23.7+t.phase*2)*0.3+Math.sin(time*3.3+t.phase)*0.4;const ki=t.int||1;l.color.set(t.col||0xff7a2e);l.intensity=(TORCH_I+n*TORCH_I*(t.kind?0.06:0.2))*l.userData.fade*ki;
    l.position.set(t.fx+Math.sin(time*7+t.phase)*0.04,t.fy+0.3,t.fz+Math.cos(time*6+t.phase)*0.04);}
  for(const t of torches){const d=Math.hypot(t.fx-P.pos.x,t.fz-P.pos.z);if(d>30)continue;
    if(t.kind==='crystal'){if(Math.random()<dt*4)fxAdd.emit({x:t.fx+(Math.random()-.5)*0.8,y:0.2+Math.random()*1.2,z:t.fz+(Math.random()-.5)*0.6,vy:0.15,life:1.6,size:0.035,size1:0.005,color:t.ec});continue;}
    if(t.kind==='lava'){if(Math.random()<dt*5)fxAdd.emit({x:t.fx+(Math.random()-.5)*2,y:0.05,z:t.fz+(Math.random()-.5)*2,vx:(Math.random()-.5)*0.3,vy:0.6+Math.random()*0.9,vz:(Math.random()-.5)*0.3,life:1.2,drag:0.3,size:0.04,size1:0.01,color:[5,1.6,0.3]});if(Math.random()<dt*1.5)fxAlpha.emit({x:t.fx+(Math.random()-.5)*1.5,y:0.1,z:t.fz+(Math.random()-.5)*1.5,vy:0.5,life:2.5,size:0.4,size1:1.3,color:[0.06,0.05,0.045],alpha:0.22});continue;}
    for(let q=0;q<(t.big?3:1);q++)if(Math.random()<dt*55)fxAdd.emit({x:t.fx+(Math.random()-.5)*(t.big?0.6:0.12),y:t.fy+0.05,z:t.fz+(Math.random()-.5)*(t.big?0.6:0.12),vx:(Math.random()-.5)*0.2,vy:1.2+Math.random()*0.8,vz:(Math.random()-.5)*0.2,life:0.35+Math.random()*0.25,size:t.big?0.6:0.42,size1:0.08,color:[5,2.2,0.6],color1:[1.4,0.25,0.03]});
    if(Math.random()<dt*3)fxAdd.emit({x:t.fx,y:t.fy+0.3,z:t.fz,vx:(Math.random()-.5)*0.6,vy:1+Math.random()*1.5,vz:(Math.random()-.5)*0.6,life:1.4,drag:0.4,size:0.04,size1:0.01,color:[5,2,0.4]});
    if(Math.random()<dt*2)fxAlpha.emit({x:t.fx,y:t.fy+0.6,z:t.fz,vx:(Math.random()-.5)*0.2,vy:0.6,vz:0.1,life:2,size:0.3,size1:0.9,color:[0.05,0.045,0.04],alpha:0.25});
  }
}
let TORCH_I=20;let dripT=0;
function updateAmbient(dt){LAVA_U.uT.value=G.time;dripT-=dt;
  if(dripT<=0&&puddles.length){dripT=0.6+Math.random()*1.4;const near=puddles.filter(p=>Math.hypot(p.x-P.pos.x,p.z-P.pos.z)<16);const p=near[Math.floor(Math.random()*near.length)];
    if(p){fxAdd.emit({x:p.x+(Math.random()-.5)*0.4,y:4.2,z:p.z+(Math.random()-.5)*0.3,vy:-1,grav:14,life:0.55,size:0.03,size1:0.03,color:[0.5,0.6,0.75]});
      setTimeout(()=>{for(let k=0;k<6;k++){const a=Math.random()*6.28;fxAdd.emit({x:p.x+Math.cos(a)*0.05,y:0.05,z:p.z+Math.sin(a)*0.05,vx:Math.cos(a)*0.6,vy:0.8+Math.random(),vz:Math.sin(a)*0.6,grav:9,life:0.3,size:0.018,size1:0.01,color:[0.5,0.6,0.8]});}if(Math.hypot(p.x-P.pos.x,p.z-P.pos.z)<12)sfx.drip&&sfx.drip();},520);}}
  for(const m of shafts){const d=Math.hypot(m.position.x-P.pos.x,m.position.z-P.pos.z);m.visible=d<30;if(d<18&&Math.random()<dt*10)fxAlpha.emit({x:m.position.x+(Math.random()-.5)*4,y:Math.random()*3.5,z:m.position.z+(Math.random()-.5)*4,vx:(Math.random()-.5)*0.1,vy:-0.03,vz:(Math.random()-.5)*0.1,life:5,size:0.03,size1:0.03,color:[1.4,1.4,1.5],alpha:0.55});}
}
// ---------- camera ----------
const camOff=new THREE.Vector3(0,14,10.2);let camZoom=1;const camBase=()=>{const a=innerWidth/innerHeight;return a<0.6?1.38:a<0.85?1.28:a<1.2?1.12:1;};const camPos=new THREE.Vector3();const camLook=new THREE.Vector3();const camLead=new THREE.Vector3(),_cl=new THREE.Vector3();
addEventListener('wheel',e=>{camZoom=clamp(camZoom+e.deltaY*0.0008,0.7,1.35);},{passive:true});
function updateCamera(dt){
  // smooth follow with a small look-ahead in the direction of travel (critically damped feel)
  const sp=P.speedNow||0;camLead.lerp(_cl.set(Math.sin(P.yaw)*sp*0.16,0,Math.cos(P.yaw)*sp*0.16),1-Math.exp(-3*dt));
  camLook.lerp(_cl.set(P.pos.x+camLead.x,0.9,P.pos.z+camLead.z),1-Math.exp(-7*dt));
  camPos.copy(camLook).addScaledVector(camOff,camZoom*camBase());
  G.shake=Math.max(0,G.shake-dt*2.2);const s=G.shake*G.shake*0.6;
  camera.position.set(camPos.x+(Math.random()-.5)*s,camPos.y+(Math.random()-.5)*s,camPos.z+(Math.random()-.5)*s);
  camera.lookAt(camLook);
  if(G.state==='title'){const a=G.time*0.06+0.6;const sx=Math.sin(a),cz=Math.cos(a);camera.position.set(camLook.x+sx*6.5,3.2,camLook.z+cz*6.5);camera.lookAt(camLook.x-sx*3.5-cz*1.8,1.9,camLook.z-cz*3.5+sx*1.8);if(Math.random()<0.5)fxAdd.emit({x:camLook.x+(Math.random()-.5)*10,y:0.2,z:camLook.z+(Math.random()-.5)*10,vx:(Math.random()-.5)*0.3,vy:0.5+Math.random()*0.8,vz:(Math.random()-.5)*0.3,life:3+Math.random()*2,size:0.04,size1:0.0,color:[3,1.2,0.3]});}
  if(TEST.camOv){camera.position.copy(TEST.camOv.pos);camera.lookAt(TEST.camOv.look);}
  U.player.value.copy(P.pos);U.cam.value.copy(camera.position);
  heroLight.position.set(P.pos.x-0.4,3.3,P.pos.z+1.0);
}
// ---------- UI ----------
// rendered skill art (generated painted icons) inside forged-metal bezels
function uiImg(k){return A.ui&&A.ui[k];}
const BEZ={ornate:{img:'bezel_ornate',inner:0.5963,rot:45},small:{img:'bezel_small',inner:0.72,rot:0}};
function hudButton(el,icon,bz,res){
  const B=BEZ[bz];el.classList.add('hb','bz-'+bz);
  el.insertAdjacentHTML('afterbegin',`<div class=ic style="background-image:url(${uiImg('i_'+icon)})"></div><div class=gloss></div><canvas class=cdc width=${res} height=${res}></canvas><img class=bz alt="" src="${uiImg(B.img)}" style="width:${(100/(B.inner*0.985)).toFixed(1)}%;transform:translate(-50%,-50%) rotate(${B.rot}deg)"><span class=cdt></span>`);
}
const orbL=$('orbL').getContext('2d'),orbM=$('orbM').getContext('2d');
function drawOrb(g,frac,c1,c2,c3,t){
  const s=g.canvas.width,r=s/2-2;g.clearRect(0,0,s,s);g.save();g.beginPath();g.arc(s/2,s/2,r,0,7);g.clip();
  const bg=g.createRadialGradient(s/2,s/2,0,s/2,s/2,r);bg.addColorStop(0,'#0d0a09');bg.addColorStop(1,'#020101');g.fillStyle=bg;g.fillRect(0,0,s,s);
  const lvl=s/2+r-clamp(frac,0,1)*2*r;
  const gr=g.createRadialGradient(s*0.42,s*0.62,4,s/2,s/2,r*1.1);gr.addColorStop(0,c1);gr.addColorStop(0.55,c2);gr.addColorStop(1,c3);g.fillStyle=gr;
  g.beginPath();g.moveTo(0,s);for(let x=0;x<=s;x+=3)g.lineTo(x,lvl+Math.sin(x*0.05+t*2.2)*2.5+Math.sin(x*0.11-t*3.1)*1.4);g.lineTo(s,s);g.closePath();g.fill();
  g.globalCompositeOperation='lighter';for(let k=0;k<6;k++){const a=t*0.35+k*1.1;g.fillStyle='rgba(255,255,255,0.03)';g.beginPath();g.ellipse(s/2+Math.cos(a)*r*0.4,Math.max(lvl+r*0.25,s/2+Math.sin(a*1.3)*r*0.45),r*0.4,r*0.16,a,0,7);g.fill();}
  g.globalCompositeOperation='source-over';
  g.fillStyle='rgba(255,255,255,0.18)';g.fillRect(0,lvl-1,s,1.5);
  const sh=g.createRadialGradient(s/2,s/2,r*0.55,s/2,s/2,r);sh.addColorStop(0,'rgba(0,0,0,0)');sh.addColorStop(1,'rgba(0,0,0,0.8)');g.fillStyle=sh;g.fillRect(0,0,s,s);
  const hl=g.createRadialGradient(s*0.4,s*0.3,2,s*0.4,s*0.3,r*0.5);hl.addColorStop(0,'rgba(255,255,255,0.38)');hl.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=hl;g.beginPath();g.ellipse(s*0.4,s*0.3,r*0.48,r*0.3,-0.5,0,7);g.fill();
  g.restore();
}
function buildOrbFrame(cv){const g=cv.getContext('2d'),s=cv.width,c=s/2,r=s*0.355;
  const ring=(r0,r1,stops)=>{const gr=g.createLinearGradient(0,0,s,s);stops.forEach(([o,col])=>gr.addColorStop(o,col));g.beginPath();g.arc(c,c,r1,0,7);g.arc(c,c,r0,0,7,true);g.fillStyle=gr;g.fill();};
  g.save();g.translate(c,c);for(let k=0;k<8;k++){g.rotate(Math.PI/4);const big=k%2===1;const gr=g.createLinearGradient(0,-r*1.45,0,-r);gr.addColorStop(0,'#1c150e');gr.addColorStop(1,'#7c5f34');g.fillStyle=gr;g.beginPath();g.moveTo(0,-r*(big?1.42:1.3));g.quadraticCurveTo(r*0.08,-r*1.12,r*0.16,-r*1.02);g.lineTo(-r*0.16,-r*1.02);g.quadraticCurveTo(-r*0.08,-r*1.12,0,-r*(big?1.42:1.3));g.fill();g.strokeStyle='#0c0805';g.lineWidth=1.5;g.stroke();}g.restore();
  ring(r*1.0,r*1.15,[[0,'#d8b673'],[0.3,'#4a3420'],[0.5,'#a8854a'],[0.75,'#2f2214'],[1,'#c9a362']]);
  ring(r*1.15,r*1.2,[[0,'#0e0a06'],[1,'#0e0a06']]);ring(r*0.965,r*1.0,[[0,'#0a0705'],[1,'#0a0705']]);
  for(let k=0;k<16;k++){const a=k/16*Math.PI*2;const x=c+Math.cos(a)*r*1.075,y=c+Math.sin(a)*r*1.075;const gr=g.createRadialGradient(x-1,y-1,0,x,y,3);gr.addColorStop(0,'#ffe9b8');gr.addColorStop(1,'#3a2812');g.fillStyle=gr;g.beginPath();g.arc(x,y,2.6,0,7);g.fill();}
}
for(const id of ['orbLF','orbMF'])$(id).src=uiImg('bezel_ornate');
document.documentElement.style.setProperty('--leather',`url(${uiImg('tex_leather')})`);document.documentElement.style.setProperty('--corner',`url(${uiImg('orn_corner')})`);
const SLOT_DEF=[{id:'lmb',icon:'attack',key:'LMB',name:'Attack',desc:'Strike the enemy under the cursor. Hold to keep attacking or moving. Shift: attack in place.'},{id:'whirl',icon:'whirl',key:'1',skill:'whirl'},{id:'fire',icon:'fire',key:'2 / RMB',skill:'fire'},{id:'dash',icon:'dash',key:'3',skill:'dash'},{id:'potion',icon:'potion',key:'Q',name:'Healing Potion',desc:'Restore 45% of your Life.'}];
for(const d of SLOT_DEF){const el=document.createElement('div');el.className='slot';el.innerHTML=`<div class=ic style="background-image:url(${uiImg('i_'+d.icon)})"></div><div class=gloss></div><canvas class=cdc width=96 height=96></canvas><span class=cdt></span><span class=key>${d.key}</span>${d.id==='potion'?'<span class=cnt></span>':''}`;
  $('slots').appendChild(el);d.el=el;d.cdc=el.querySelector('.cdc');d.cdg=d.cdc.getContext('2d');d.cdt=el.querySelector('.cdt');d.lastF=-1;
  const sk=d.skill?SKILLS[d.skill]:d;el.addEventListener('pointerenter',()=>showTip(`<div class="tt skill"><div class=tt-name style="color:#e8d8b0">${sk.name}</div>${d.skill?`<div class=tt-sub>Cost: ${sk.mana} Mana · Cooldown ${sk.cd}s</div>`:''}<div class=tt-desc>${sk.desc}</div></div>`,el));
  el.addEventListener('pointerleave',hideTip);
  el.addEventListener('pointerdown',ev=>{ev.stopPropagation();initAudio();if(G.state!=='play')return;let aim=mouse.ground.clone();
    if(ev.pointerType!=='mouse')aim=autoAim(d.skill);
    if(d.skill)useSkill(d.skill,aim);else if(d.id==='potion')drinkPotion();});
}
function showTip(html,el){const t=$('tooltip');t.innerHTML=html;t.style.display='block';const r=el.getBoundingClientRect();t.style.left=clamp(r.left+r.width/2-t.offsetWidth/2,8,innerWidth-t.offsetWidth-8)+'px';let top=r.top-t.offsetHeight-10;if(top<8)top=r.bottom+10;t.style.top=top+'px';}
function hideTip(){$('tooltip').style.display='none';}
// Diablo-style character panel: paperdoll with slots around the figure + 8x5 bag grid with painted icons
const SLOTS=[['helm','Helm',14,13],['chest','Chest Armor',14,40,1],['gloves','Gloves',14,68],['amulet','Amulet',86,13],['ring','Ring',86,40],['boots','Boots',86,68],['weapon','Weapon',50,87,1]];
const itemIcon=it=>uiImg(it.type==='potion'?'i_potion':'it_'+it.type);
function cmpLine(it){const cur=P.equip[it.slot];if(!cur||cur===it)return '';const a=it.dmg?(it.dmg[0]+it.dmg[1])/2:it.armor||0,b=cur.dmg?(cur.dmg[0]+cur.dmg[1])/2:cur.armor||0;if(!a&&!b)return '';const d=Math.round(a-b);return d>0?`<span class=up>▲ ${d} ${it.dmg?'Damage':'Armor'}</span>`:d<0?`<span class=dn>▼ ${-d} ${it.dmg?'Damage':'Armor'}</span>`:'<span>= Same as equipped</span>';}
function itemTip(it,cmp){const R=RARITY[it.rarity]||RARITY.common;const rn=R.name+' '+(it.slot==='weapon'?it.base:(it.base||''));
  let h=`<div class="tt r-${it.rarity}" style="--rc:${R.color}"><div class=tt-head><div class=tt-name style="color:${R.color}">${it.name}</div><div class=tt-sub>${rn}</div>${it.power?`<div class=tt-pow>${it.power} Item Power</div>`:''}</div><div class=tt-body>`;
  if(it.dmg)h+=`<div class=tt-big>${it.dmg[0]}–${it.dmg[1]}<small>Damage per Hit</small></div>`;if(it.armor)h+=`<div class=tt-big>${it.armor}<small>Armor</small></div>`;
  if(it.lines&&it.lines.length)h+='<div class=tt-sep></div>'+it.lines.map(l=>`<div class=tt-aff>${l}</div>`).join('');
  if(it.special)h+=`<div class=tt-leg>${it.special}</div>`;if(it.flavor)h+=`<div class=tt-flav>${it.flavor}</div>`;
  h+=`<div class=tt-foot><span>Item Level ${it.ilvl||1}</span>${cmp?cmpLine(it)||(IS_MOBILE?'':'<span>Click to equip</span>'):'<span>Equipped</span>'}</div></div></div>`;return h;}
function refreshInv(){
  $('equip').style.setProperty('--doll',`url(${uiImg('paperdoll')})`);
  const eq=$('equip');eq.innerHTML='';for(const [k,n,x,y,tall] of SLOTS){const it=P.equip[k];const el=document.createElement('div');el.className='eslot s-'+k+(tall?' tall':'')+(it?' r-'+it.rarity:'');el.style.left=x+'%';el.style.top=y+'%';
    el.innerHTML=it?`<img src="${itemIcon(it)}" alt="">`:`<span class=ph>${n}</span>`;if(it){if(IS_MOBILE)el.onclick=()=>showSheet(it,false);else{el.onpointerenter=()=>showTip(itemTip(it),el);el.onpointerleave=hideTip;}}eq.appendChild(el);}
  const gr=$('grid');gr.innerHTML='';for(let i=0;i<40;i++){const it=P.inv[i];const el=document.createElement('div');el.className='cell'+(it?' r-'+it.rarity+(it.isNew?' new':''):'');
    if(it){el.innerHTML=`<img src="${itemIcon(it)}" alt="">`;el.dataset.id=it.id;if(IS_MOBILE){el.onclick=()=>{it.isNew=false;showSheet(it,true);};}else{el.onpointerenter=()=>{it.isNew=false;el.classList.remove('new');showTip(itemTip(it,true),el);};el.onpointerleave=hideTip;el.onclick=()=>{hideTip();equip(it);};el.oncontextmenu=e=>{e.preventDefault();hideTip();salvage(it);};}}gr.appendChild(el);}
  const s=S;$('cstats').innerHTML=`<div><span>Damage</span><b>${s.dmgMin}–${s.dmgMax}</b></div><div><span>Armor</span><b>${s.armor}</b></div><div><span>Life</span><b>${s.maxHp}</b></div><div><span>Crit</span><b>${s.crit}%</b></div><div><span>Strength</span><b>${s.str}</b></div><div><span>Vitality</span><b>${s.vit}</b></div>`;
  $('invGold').innerHTML=`<img src="${uiImg('it_gold')}" alt="">${P.gold.toLocaleString()}`;
  $('invHint').textContent=`${P.inv.length} / 40  ·  `+(IS_MOBILE?'Tap an item to inspect or equip':'Hover to inspect · click to equip');
}
function toggleInv(){$('inv').classList.toggle('show');hideTip();hideSheet();refreshInv();}
$('invbtn').addEventListener('pointerdown',e=>{e.stopPropagation();toggleInv();});
$('invclose').addEventListener('pointerdown',e=>{e.stopPropagation();toggleInv();});
const mm=$('minimap').getContext('2d');
function drawMinimap(){
  const s=mm.canvas.width,sc=2.3,ci=P.pos.x,cj=P.pos.z;mm.clearRect(0,0,s,s);
  mm.save();mm.beginPath();mm.arc(s/2,s/2,s/2-3,0,7);mm.clip();mm.fillStyle='rgba(5,4,3,0.6)';mm.fillRect(0,0,s,s);
  mm.translate(s/2-ci*sc,s/2-cj*sc);
  // explored floor as soft blobs, cave outline from the real wall contour
  mm.fillStyle='rgba(120,100,70,0.22)';for(let j=0;j<D.H;j+=1)for(let i=0;i<D.W;i+=1){if(!explored[j*D.W+i]||!isFloor(D,i,j))continue;mm.fillRect(i*sc-0.3,j*sc-0.3,sc+0.6,sc+0.6);}
  mm.strokeStyle='rgba(205,175,115,0.85)';mm.lineWidth=1.3;mm.beginPath();
  for(const L of D.loops){let pen=false;for(const [x,z] of L.pts){const i=Math.floor(x),j=Math.floor(z);let ex=false;for(let dj=-1;dj<=1&&!ex;dj++)for(let di=-1;di<=1;di++){const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<D.W&&b<D.H&&explored[b*D.W+a]){ex=true;break;}}
    if(ex){if(pen)mm.lineTo(x*sc,z*sc);else mm.moveTo(x*sc,z*sc);pen=true;}else pen=false;}}
  mm.stroke();
  for(const e of enemies){if(e.dead)continue;const i=toCell(e.pos.x),j=toCell(e.pos.z);if(!explored[j*D.W+i])continue;mm.fillStyle=e.def.boss||e.def.elite?'#ffb030':'#c81e0e';mm.beginPath();mm.arc(e.pos.x/CELL*sc,e.pos.z/CELL*sc,e.def.boss?3.5:2,0,7);mm.fill();}
  for(const L of loots){if(L.item&&L.item.rarity!=='common'){mm.fillStyle=RARITY[L.item.rarity].color;mm.fillRect(L.x/CELL*sc-1.5,L.z/CELL*sc-1.5,3,3);}}
  mm.restore();mm.save();mm.translate(s/2,s/2);mm.rotate(-P.yaw+Math.PI);mm.fillStyle='#fff3c8';mm.beginPath();mm.moveTo(0,-6);mm.lineTo(4,4);mm.lineTo(-4,4);mm.closePath();mm.fill();mm.restore();
}
function updateUI(dt){
  drawOrb(orbL,P.hp/S.maxHp,'#ff5a40','#a00d0b','#2a0202',G.time);drawOrb(orbM,P.mana/S.maxMana,'#78a8ff','#1838b0','#030a30',G.time+3);
  $('lifeTxt').textContent=`${Math.ceil(P.hp)} / ${S.maxHp}`;$('manaTxt').textContent=`${Math.floor(P.mana)} / ${S.maxMana}`;
  $('xpfill').style.width=(P.xp/xpNeed()*100)+'%';$('lvl').textContent=P.level;$('goldv').textContent=P.gold.toLocaleString();
  for(const d of SLOT_DEF){if(d.skill){const sk=SKILLS[d.skill];const f=P.cd[d.skill]/sk.cd;if(!IS_MOBILE)drawCD(d,f,P.cd[d.skill],true);d.el.classList.toggle('nomana',P.mana<sk.mana);}
    if(d.id==='potion'){d.el.querySelector('.cnt').textContent=P.potions;d.el.classList.toggle('nomana',P.potions<=0);}}
  if(IS_MOBILE){$('mxp').firstChild.style.width=(P.xp/xpNeed()*100)+'%';$('mlvlv').textContent=P.level;
    for(const b of TB){if(b.skill){const sk=SKILLS[b.skill];const f=P.cd[b.skill]/sk.cd;drawCD(b,f,P.cd[b.skill]);b.el.classList.toggle('nomana',P.mana<sk.mana);}
      if(b.id==='bAtk')b.el.classList.toggle('locked',!!(P.atk&&P.atk.e&&!P.atk.e.dead));
      if(b.id==='bPot'){b.el.querySelector('.cnt').textContent=P.potions;b.el.classList.toggle('nomana',P.potions<=0);}}}
  const hov=G.state==='play'&&(!mouse.touch||mouse.down)?pickEnemy(mouse.x,mouse.y):null;mouse.hover=hov;
  const tgt=hov||(P.target&&P.target.type==='enemy'?P.target.e:null)||(G.bossAwake?enemies.find(e=>e.def.boss&&!e.dead):null);
  document.body.classList.toggle('attackcur',!!hov);
  if(tgt&&!tgt.dead){$('target').style.display='block';$('tname').textContent=tgt.name;$('target').className=tgt.def.boss?'boss':tgt.def.elite?'elite':'';$('tfill').style.width=Math.max(0,tgt.hp/tgt.maxHp*100)+'%';}else $('target').style.display='none';
  for(const e of enemies){if(e.dead)continue;const show=(e.hp<e.maxHp||e===hov||e.def.elite)&&e.c.root.visible&&!e.def.boss;e.bar.style.display=show?'block':'none';if(show){const [x,y]=screenOf(e.pos,2.15*(e.def.scale||1));const f=Math.max(0,e.hp/e.maxHp);e.chip=e.chip>f?Math.max(f,e.chip-dt*0.6):f;const bw=e.bar.offsetWidth||56;e.bar.style.transform=`translate(${x-bw/2}px,${y}px)`;e.bar.firstChild.style.width=(f*100)+'%';e.bar.children[1].style.width=(e.chip*100)+'%';}
    if(e===hov&&e.flash<0.2)setEmissive(e.c,0.22,0.05,0.03);}
  const placed=[];$('labels').style.visibility=G.state==='title'?'hidden':'visible';
  for(const L of loots){const [x,y0,z]=screenOf(L.g.position,0.55);let y=y0;const yMax=innerHeight-(IS_MOBILE?(parseFloat(document.documentElement.style.getPropertyValue('--dockH'))||0):80)-4;const on=z<1&&x>-50&&x<innerWidth+50&&y>(IS_MOBILE?(innerWidth>innerHeight?34:60):-20)&&y<yMax+60&&Math.hypot(L.x-P.pos.x,L.z-P.pos.z)<26;if(y>yMax)y=yMax;L.label.style.display=on?'flex':'none';
    if(on){const w=L.label.offsetWidth||100;for(let k=0;k<8;k++){const hit=placed.find(p=>Math.abs(p.x-x)<(p.w+w)/2&&Math.abs(p.y-y)<20);if(!hit)break;y=hit.y-21;}placed.push({x,y,w});L.label.style.transform=`translate(${x}px,${y}px) translate(-50%,-100%)`;}}
  for(let i=floats.length-1;i>=0;i--){const f=floats[i];f.t+=dt;const [x,y]=screenOf(f.pos,f.pos.y);f.el.style.transform=`translate(${x+f.dx*f.t}px,${y-f.t*70}px) translate(-50%,-50%) scale(${f.t<0.12?1+(0.12-f.t)*6:1})`;f.el.style.opacity=f.t>0.7?Math.max(0,1-(f.t-0.7)/0.4):1;if(f.t>1.1){f.el.remove();floats.splice(i,1);}}
  document.body.classList.toggle('lootcur',!hov&&!!pickChest(mouse.x,mouse.y));
  grade.uniforms.uHurt.value=Math.max(G.hurt*0.8,P.hp/S.maxHp<0.3?0.35+0.15*Math.sin(G.time*5):0);G.hurt=Math.max(0,G.hurt-dt*1.5);
  if((G.frame++)%3===0)drawMinimap();
}
G.frame=0;
let frames=0,fpsT=0;let lowCount=0;
function applyQuality(){const q=QL[qLevel];const pr=Math.min(devicePixelRatio,q.pr);renderer.setPixelRatio(pr);composer.setPixelRatio(pr);composer.setSize(innerWidth,innerHeight);
  torchLights.forEach(l=>l.castShadow=q.ts&&l.userData.canShadow);heroLight.castShadow=q.hs;for(const p of [fxAdd,fxAlpha])p.uniforms.uScale.value=innerHeight*pr*0.75;TEST.qLevel=qLevel;}
function adapt(f){if(G.state!=='play'||QS.has('noadapt')||document.hidden)return;if(f<(IS_MOBILE?28:40)){lowCount++;if(lowCount>=3&&qLevel<QL.length-1){qLevel++;lowCount=0;applyQuality();console.log('quality ->',qLevel);}}else lowCount=0;}
function loop(){
  requestAnimationFrame(loop);
  const dt=Math.min(clock.getDelta(),0.05);frames++;fpsT+=dt;if(fpsT>1){TEST.fps=frames/fpsT;frames=0;fpsT=0;adapt(TEST.fps);if(QS.has('fps'))$('fps').textContent=TEST.fps.toFixed(0)+' fps';}
  if(G.state==='loading'||G.paused)return;
  step(dt);
}
function step(dt,noRender){
  G.time+=dt;
  let gdt=dt;if(G.hitstop>0){G.hitstop-=dt;gdt=dt*0.08;}
  if(G.state==='play'){updatePlayer(gdt);updateEnemies(gdt);updateProjectiles(gdt);}
  updateFX(gdt,Math.max(gdt,dt*0.6));updateTorches(dt);updateAmbient(dt);
  if(P.dead||G.state!=='play')hero.anim.update(gdt,0);
  hero.mixer.update(gdt);updateTrail(gdt);
  // cape removed (flat plane read as cheap); the ranger outfit has its own cloth
  for(const e of enemies){if(!e.c.root.visible||e.removed)continue;if(e.dead&&e.deadT>2.6)continue;if(e.dead)e.c.anim.update(gdt,0);e.c.mixer.update(gdt);}
  updateCamera(dt);
  grade.uniforms.uTime.value=G.time;charTime.value=G.time;
  if(!noRender)composer.render();
  updateUI(dt);
}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
  for(const p of [fxAdd,fxAlpha])p.uniforms.uScale.value=innerHeight*renderer.getPixelRatio()*0.75;layoutTouch();applyViewOffset();}
function applyViewOffset(){const W=innerWidth,H=innerHeight;const dh=IS_MOBILE?(parseFloat(document.documentElement.style.getPropertyValue('--dockH'))||0):60;const dy=Math.round(dh*0.45);camera.setViewOffset(W,H,0,dy,W,H);camera.updateProjectionMatrix();}
applyViewOffset();
addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,250));
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{if(Math.abs(innerWidth-renderer.domElement.clientWidth)>1||Math.abs(innerHeight-renderer.domElement.clientHeight)>1)onResize();});
// ---------- boot ----------
const PROPS=['treasure_chest','wine_barrel_01','gothic_statue','kite_shield','wooden_handle_saber','wooden_crate_01'];
async function boot(){
  const all=await Promise.all(['hero_ual',...PROPS].map(parse));for(const k of ['ch_ranger_m','ch_ranger_lo','ch_peasant_lo','ch_head_m','ch_head_lo']){MODELS[k]=await parse(k);const b=new THREE.Box3().setFromObject(MODELS[k].scene);MODELS[k].h=b.max.y-b.min.y;}
  MODELS.ual=all[0];PROPS.forEach((k,i)=>MODELS[k]=all[i+1]);registerClips(MODELS.ual.animations);
  const bb=new THREE.Box3().setFromObject(MODELS.ual.scene);MODELS.ualH=bb.max.y-bb.min.y;
  for(const p of [fxAdd,fxAlpha])p.uniforms.uScale.value=innerHeight*renderer.getPixelRatio()*0.75;
  hero=makeCharacter('hero');scene.add(hero.root);
  hero.sword=attach(hero.bones.rHand,cloneProp('wooden_handle_saber'),WPOS,WROT,1.25);setupBlade(hero);trail=new SwordTrail(scene);hero.sword.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.roughness=1;o.material.color.multiplyScalar(0.8);o.material.envMapIntensity=0.5;}});
  hero.shield=attach(hero.bones.lFore,cloneProp('kite_shield'),SPOS,SROT,0.55);
  P.equip.weapon={id:0,type:'sword',slot:'weapon',rarity:'common',base:'Broadsword',name:'Rusted Broadsword',ilvl:1,dmg:[5,9],stats:{},lines:[]};
  P.equip.chest={id:-1,type:'armor',slot:'chest',rarity:'common',base:'Hauberk',name:'Tattered Hauberk',ilvl:1,armor:14,stats:{},lines:[]};
  S=stats();P.hp=S.maxHp;P.mana=S.maxMana;
  buildLevel();refreshInv();
  camLook.set(P.pos.x,0.9,P.pos.z);
  G.state='title';$('loading').style.display='none';$('title').classList.add('show');
  renderer.compile(scene,camera);
  TEST.ready=true;
}
const SPOS=[0.0,0.14,-0.07],SROT=[0,0,Math.PI/2];
// blade base/tip markers on the sword mesh (longest local axis, far end = tip) for the swing trail
let trail=null;
function setupBlade(c){
  const sw=c.sword;sw.updateMatrixWorld(true);const box=new THREE.Box3();sw.traverse(o=>{if(o.isMesh){o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().copy(sw.matrixWorld).invert().multiply(o.matrixWorld));box.union(b);}});
  const sz=box.getSize(new THREE.Vector3());const ax=sz.x>sz.y&&sz.x>sz.z?'x':sz.y>sz.z?'y':'z';
  const far=Math.abs(box.max[ax])>Math.abs(box.min[ax])?box.max[ax]:box.min[ax];
  const tip=new THREE.Object3D(),base=new THREE.Object3D();tip.position[ax]=far;base.position[ax]=far*0.18;sw.add(tip);sw.add(base);c.bladeTip=tip;c.bladeBase=base;c.tipPrev=null;c.tipVel=new THREE.Vector3();
  TEST.bladeAxis=ax;TEST.bladeLen=far;
}
const _bb=new THREE.Vector3(),_bt=new THREE.Vector3();
function updateTrail(dt){
  if(!trail||!hero.bladeTip)return;hero.root.updateMatrixWorld(true);hero.bladeBase.getWorldPosition(_bb);hero.bladeTip.getWorldPosition(_bt);
  if(hero.tipPrev&&dt>0){hero.tipVel.subVectors(_bt,hero.tipPrev).divideScalar(dt);}hero.tipPrev=(hero.tipPrev||new THREE.Vector3()).copy(_bt);
  let on=false;const a=P.atk;
  if(a&&a.phase==='swing'&&hero.anim.oneName===a.C.clip){const t=hero.anim.time;on=t>a.C.hit-(a.C.finisher?0.26:0.17)&&t<a.C.hit+0.07;}
  if(P.spin)on=true;if(P.dash)on=true;
  trail.mat.uniforms.uC.value.setRGB(...(P.dash?[0.6,1.0,2.6]:P.spin?[2.6,1.6,0.8]:a&&a.C.finisher?[3.2,1.6,0.6]:[2.2,1.5,0.9]));
  trail.update(dt,_bb,_bt,on);
}
function startGame(){initAudio();if(IS_MOBILE&&!QS.has('nofs')){try{const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el,{navigationUI:'hide'})?.catch?.(()=>{});}catch(_){}}$('title').classList.remove('show');G.state='play';$('hud').classList.add('show');banner('The Smoldering Depths','Depth '+G.depth);}
$('enter').addEventListener('click',startGame);
$('respawn').addEventListener('click',()=>{P.dead=false;hero.anim.stop(0.1);P.atk=null;$('death').classList.remove('show');S=stats();P.hp=S.maxHp;P.mana=S.maxMana;P.gold=Math.floor(P.gold*0.9);const s=D.start;P.pos.set(s.cx,0,s.cy);P.target=null;hero.tilt.rotation.x=0;for(const e of enemies)if(!e.dead){e.state='idle';e.atkT=-1;}G.bossAwake=false;});
$('deeper').addEventListener('click',()=>{$('victory').classList.remove('show');G.depth++;G.seed++;buildLevel();});
Object.assign(TEST,{fxAdd,fxAlpha,fxL:()=>fxLights.map(l=>+l.intensity.toFixed(1)),BoxGeometry:THREE.BoxGeometry,MBM:THREE.MeshBasicMaterial,Mesh:THREE.Mesh,CLIPS,getTrail:()=>trail,softTarget,startCombo,run(n,dt=1/30){for(let i=0;i<n;i++)step(dt,i<n-1);},P,G,enemies,loots,get S(){return S;},useSkill,setMoveTarget,step,startGame,
  attackNearest(){const e=enemies.filter(e=>!e.dead).sort((a,b)=>a.pos.distanceTo(P.pos)-b.pos.distanceTo(P.pos))[0];P.target={type:'enemy',e};return e;},
  teleport(x,z){P.pos.set(x,0,z);camLook.set(x,0.9,z);},
  teleportNear(e,d=3){const dir=new THREE.Vector3(0,0,1);for(let a=0;a<12;a++){const p=e.pos.clone().addScaledVector(dir,d);if(walkable(D,p.x,p.z,0.4)&&!blockedByObs(p.x,p.z,0.4)){P.pos.copy(p);camLook.set(p.x,0.9,p.z);return true;}dir.applyAxisAngle(UPV,0.52);}return false;},
  dropTest(){const s=['legendary','rare','magic','common','gold'];let k=0;for(let a=0;a<40&&k<s.length;a++){const ang=a*0.9,d=2.2+(a%3)*0.5;const x=P.pos.x+Math.sin(ang)*d,z=P.pos.z+Math.cos(ang)*d;if(!walkable(D,x,z,0.3)||blockedByObs(x,z,0.3))continue;if(s[k]==='gold')dropLoot(x,z,null,87);else dropLoot(x,z,rollItem(Math.random,8,s[k]));k++;}},
  ground:(x,y)=>groundAt(x,y,new THREE.Vector3()),screenOf,camera,scene,renderer,hero:()=>hero,D:()=>D,pickup,refreshInv,toggleInv,buildLevel,
  setTorch(v){TORCH_I=v;},heroLight,bloom,camOff,setZoom(z){camZoom=z;},POSE,rotateBoneWorld});
boot().catch(e=>{console.error(e);$('loading').textContent='Failed to load: '+e.message;});
loop();
// ---------- hero cape ----------
const capeMat=new THREE.MeshStandardMaterial({color:0x3a0807,roughness:0.9,side:THREE.DoubleSide});
let cape=null;const _cp=new THREE.Vector3();
function makeCape(){
  const g=new THREE.PlaneGeometry(0.42,1.05,8,12);g.translate(0,-0.525,0);
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i);p.setXYZ(i,x*(1+(-y)*0.55),y,-Math.cos(x*6)*0.07-0.02);}
  g.computeVertexNormals();cape=new THREE.Mesh(g,capeMat);cape.castShadow=false;cape.userData.base=Float32Array.from(p.array);scene.add(cape);
}
function updateCape(dt,speed){
  if(!hero)return;if(!cape)makeCape();
  hero.bones.spine2.getWorldPosition(_cp);
  const F=new THREE.Vector3(Math.sin(P.yaw),0,Math.cos(P.yaw));
  cape.position.copy(_cp).addScaledVector(F,-0.13);cape.position.y+=0.2;
  cape.rotation.set(0,0,0);cape.rotateY(P.yaw);
  const sw=clamp(speed/6,0,1);cape.userData.sw=lerp(cape.userData.sw||0,sw,1-Math.exp(-5*dt));
  cape.rotateX(0.12+cape.userData.sw*0.55+(P.dash?0.6:0));
  const p=cape.geometry.attributes.position,b=cape.userData.base,t=G.time;
  for(let i=0;i<p.count;i++){const x=b[i*3],y=b[i*3+1];const d=-y;p.setZ(i,b[i*3+2]-d*d*0.25*cape.userData.sw+Math.sin(t*(4+cape.userData.sw*8)+d*5+x*3)*0.035*d*(0.4+cape.userData.sw));}
  p.needsUpdate=true;cape.geometry.computeVertexNormals();
  cape.visible=!P.dead;
}

// ---------- mobile / touch UI ----------
function nearestEnemy(maxD){let best=null,bd=maxD;for(const e of enemies){if(e.dead||!e.c.root.visible)continue;const d=e.pos.distanceTo(P.pos);if(d<bd){bd=d;best=e;}}return best;}
function autoAim(skill){
  if(skill==='dash'&&P.stick&&P.stick.m>0.2)return P.pos.clone().add(new THREE.Vector3(P.stick.x*6,0,P.stick.y*6));
  const t=softTarget(13);
  return t?t.pos.clone():P.pos.clone().add(new THREE.Vector3(Math.sin(P.yaw)*5,0,Math.cos(P.yaw)*5));
}
function showSheet(it,canEquip){const sh=$('sheet');sh.innerHTML=itemTip(it,canEquip)+`<div class=sheet-btns>${canEquip?'<button class="btn sm" id=shEq>Equip</button><button class="btn sm" id=shDr>Salvage</button>':''}<button class="btn sm" id=shX>Close</button></div>`;sh.classList.add('show');
  if(canEquip){$('shEq').onclick=()=>{equip(it);hideSheet();};$('shDr').onclick=()=>{salvage(it);hideSheet();};}$('shX').onclick=hideSheet;}
function hideSheet(){$('sheet').classList.remove('show');}
// ---------- mobile controls: floating analog stick (left) + attack / skill cluster (right) ----------
const TB=[{id:'bAtk',icon:'attack',bz:'ornate'},{id:'b1',icon:'whirl',skill:'whirl',bz:'small'},{id:'b2',icon:'fire',skill:'fire',bz:'small'},{id:'b3',icon:'dash',skill:'dash',bz:'small'},{id:'bPot',icon:'potion',bz:'small'}];
function setupTouch(){
  document.body.classList.add('stickmode');document.documentElement.style.setProperty('--ring',`url(${uiImg('bezel_small')})`);
  for(const b of TB){const el=$(b.id);b.el=el;hudButton(el,b.icon,b.bz,160);b.cdc=el.querySelector('.cdc');b.cdg=b.cdc.getContext('2d');b.cdt=el.querySelector('.cdt');b.lastF=-1;
    el.addEventListener('pointerdown',ev=>{ev.preventDefault();ev.stopPropagation();initAudio();if(G.state!=='play')return;el.classList.add('down');try{el.setPointerCapture(ev.pointerId);}catch(_){}
      if(b.id==='bAtk'){G.atkHeld=true;G.atkPress=true;b.pid=ev.pointerId;}
      else if(b.skill){if(!useSkill(b.skill,autoAim(b.skill))&&P.cd[b.skill]>0)el.classList.add('deny');setTimeout(()=>el.classList.remove('deny'),220);}
      else drinkPotion();});
    const up=ev=>{el.classList.remove('down');if(b.id==='bAtk'&&b.pid===ev.pointerId){G.atkHeld=false;b.pid=null;}};
    el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
  }
  hudButton($('bInv'),'bag','small',96);hudButton($('bMap'),'map','small',96);
  $('bInv').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();toggleInv();});
  $('bMap').addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();$('minimap').classList.toggle('hide');});
  // floating joystick: appears under the thumb, follows the thumb if dragged past its rim
  const zone=$('stickZone'),base=$('stickBase'),knob=$('stickKnob'),dirEl=$('stickDir');let sp=null,cx=0,cy=0;
  const place=()=>{base.style.left=cx+'px';base.style.top=cy+'px';};
  zone.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();initAudio();if(sp!==null||G.state!=='play')return;sp=e.pointerId;try{zone.setPointerCapture(sp);}catch(_){}
    const R=base.offsetWidth/2;cx=clamp(e.clientX,R+4,innerWidth-R-4);cy=clamp(e.clientY,R+4,innerHeight-R-4);place();base.classList.add('on');$('stickHint').classList.add('off');knob.style.transform='translate(-50%,-50%)';
    P.stick={x:0,y:0,m:0};});
  zone.addEventListener('pointermove',e=>{if(e.pointerId!==sp)return;e.preventDefault();const R=base.offsetWidth*0.4;let dx=e.clientX-cx,dy=e.clientY-cy;let l=Math.hypot(dx,dy);
    if(l>R*1.25){const k=(l-R*1.25)/l;cx+=dx*k;cy+=dy*k;place();dx=e.clientX-cx;dy=e.clientY-cy;l=Math.hypot(dx,dy);}
    const kl=Math.min(l,R);const nx=l?dx/l:0,ny=l?dy/l:0;knob.style.transform=`translate(calc(-50% + ${nx*kl}px),calc(-50% + ${ny*kl}px))`;
    const m=Math.min(1,l/R);P.stick={x:nx,y:ny,m};dirEl.style.opacity=m>STICK_DEAD?Math.min(1,m*1.4):0;dirEl.style.transform=`translate(-50%,-50%) rotate(${Math.atan2(ny,nx)*180/Math.PI+90}deg)`;});
  const end=e=>{if(e.pointerId!==sp)return;sp=null;base.classList.remove('on');$('stickHint').classList.remove('off');P.stick=null;dirEl.style.opacity=0;};
  zone.addEventListener('pointerup',end);zone.addEventListener('pointercancel',end);zone.addEventListener('lostpointercapture',end);
  // block browser gestures / menus / pinch-zoom / pull-to-refresh
  addEventListener('contextmenu',e=>e.preventDefault());
  document.addEventListener('gesturestart',e=>e.preventDefault());document.addEventListener('dblclick',e=>e.preventDefault());
  document.addEventListener('touchmove',e=>{if(!e.target.closest||!e.target.closest('#inv'))e.preventDefault();},{passive:false});
  document.addEventListener('touchstart',e=>{if(e.touches.length>1&&e.target.closest&&!e.target.closest('#inv'))e.preventDefault();},{passive:false});
  layoutTouch();applyViewOffset();
}
// one unified bottom dock: stick (left) · life orb · potion/bag/map plate · resource orb · attack + skill arc (right)
function layoutTouch(){
  if(!IS_MOBILE)return;const W=innerWidth,H=innerHeight;const vmin=Math.min(W,H);const land=W>H;
  const cs=getComputedStyle(document.documentElement);const sr=parseFloat(cs.getPropertyValue('--sar'))||0,sb=parseFloat(cs.getPropertyValue('--sab'))||0,sl=parseFloat(cs.getPropertyValue('--sal'))||0;
  const place=(id,x,y,sz,h)=>{const el=$(id);el.style.width=sz+'px';el.style.height=(h||sz)+'px';el.style.left=(x-sz/2)+'px';el.style.top=(y-(h||sz)/2)+'px';el.style.right='auto';el.style.bottom='auto';};
  const A=land?clamp(vmin*0.25,76,112):clamp(W*0.25,80,108),Sz=land?clamp(vmin*0.145,48,66):clamp(W*0.15,50,64),gap=Math.max(6,vmin*0.018);
  const RA=A*0.66,RS=Sz*0.68;const cx=W-sr-12-RA,cy=H-sb-10-RA;const R=RA+RS+gap;
  place('bAtk',cx,cy,A);
  const ang=land?[[ 'b1',186],['b2',232],['b3',278]]:[['b1',182],['b2',226],['b3',270]];
  ang.forEach(([id,a])=>{const r=a*Math.PI/180;place(id,cx+Math.cos(r)*R,cy+Math.sin(r)*R,Sz);});
  const hint=$('stickHint');const hs=clamp(vmin*0.27,96,132);hint.style.left=(sl+18)+'px';hint.style.bottom=(sb+16)+'px';hint.style.width=hint.style.height=hs+'px';
  const O=land?clamp(H*0.29,86,128):clamp(W*0.24,80,112),U=land?clamp(vmin*0.115,40,54):clamp(W*0.12,42,52);
  let oy,lx,mx,plateY,plateX0,plateX1,dockTop;
  if(land){oy=H-sb-O/2+2;lx=Math.max(sl+hs+30+O/2,W*0.29);mx=Math.min(cx-R-RS-14-O/2,W*0.67);plateX0=lx+O/2+4;plateX1=mx-O/2-4;plateY=H-sb-U/2-16;dockTop=H-Math.max(O*0.62,U+40);}
  else{const top=cy-R-RS-10;oy=top-O/2;lx=sl+8+O/2;mx=W-sr-8-O/2;plateX0=lx+O/2+2;plateX1=mx-O/2-2;plateY=oy+O*0.12;dockTop=oy-O*0.42;}
  for(const [id,x] of [['orbLife',lx],['orbMana',mx]])place(id,x,oy,O);
  const pw=plateX1-plateX0;const ux=[0.2,0.5,0.8].map(f=>plateX0+pw*f);
  place('bPot',ux[0],plateY,U);place('bInv',ux[1],plateY,U*0.9);place('bMap',ux[2],plateY,U*0.9);
  const plate=$('dockPlate');plate.style.left=(plateX0-2)+'px';plate.style.width=(pw+4)+'px';const ph=U+46;plate.style.top=(plateY-U/2-28-(H-dockTop-0))+'px';
  plate.style.top=(plateY-U/2-30-dockTop)+'px';plate.style.height=ph+'px';
  document.documentElement.style.setProperty('--dockH',(H-dockTop)+'px');
  const xp=$('mxp');xp.style.left=(plateX0+12)+'px';xp.style.width=(pw-24)+'px';xp.style.top=(plateY-U/2-22)+'px';
  const lv=$('mlvl');lv.style.left=(plateX0+12)+'px';lv.style.top=(plateY-U/2-16)+'px';
  const gd=$('gold');gd.style.left=(plateX1-12-90)+'px';gd.style.width='90px';gd.style.top=(plateY-U/2-16)+'px';gd.style.textAlign='right';
  const zone=$('stickZone');zone.style.height=(land?100:62)+'%';zone.style.width=(land?48:55)+'%';
}
const _rdy=new Set();
function drawCD(b,f,remain,square){
  const cv=b.cdc,g=b.cdg,w=cv.width,c=w/2;const key=f>0?Math.round(f*240)+'|'+(remain>=1?Math.ceil(remain):remain.toFixed(1)):'0';if(key===b.lastKey)return;b.lastKey=key;
  g.clearRect(0,0,w,w);
  if(f<=0){if(b.lastF>0){b.el.classList.remove('ready');void b.el.offsetWidth;b.el.classList.add('ready');}b.lastF=0;b.cdt.textContent='';return;}
  b.lastF=f;const rr=square?c*1.5:c;const a0=-Math.PI/2,a1=a0+(1-f)*Math.PI*2;
  g.fillStyle='rgba(4,3,2,0.72)';g.beginPath();g.moveTo(c,c);g.arc(c,c,rr,a1,a0+Math.PI*2);g.closePath();g.fill();
  g.save();g.globalCompositeOperation='lighter';g.lineCap='round';
  const ex=c+Math.cos(a1)*rr,ey=c+Math.sin(a1)*rr;const gr=g.createLinearGradient(c,c,ex,ey);gr.addColorStop(0,'rgba(255,200,120,0)');gr.addColorStop(1,'rgba(255,214,140,1)');
  g.strokeStyle=gr;g.lineWidth=w*0.03;g.shadowColor='rgba(255,140,40,1)';g.shadowBlur=w*0.09;g.beginPath();g.moveTo(c,c);g.lineTo(ex,ey);g.stroke();
  if(!square){g.strokeStyle='rgba(255,170,70,0.7)';g.lineWidth=w*0.04;g.beginPath();g.arc(c,c,c*0.955,a0,a1);g.stroke();}
  g.restore();b.cdt.textContent=remain>=1?Math.ceil(remain):remain.toFixed(1);
}

if(IS_MOBILE)setupTouch();
Object.assign(TEST,{pickup,heroAnim:()=>hero.anim.oneName,IS_MOBILE,layoutTouch,get qLevel(){return qLevel;}});
Object.assign(TEST,{renderer,camera,toScreen(v){const p=v.clone().project(camera);return [(p.x+1)/2*innerWidth,(1-p.y)/2*innerHeight];}});
Object.assign(TEST,{hemi,debugLight(k){hemi.intensity=0.7*k;scene.fog.far=k>1?400:44;scene.fog.near=k>1?300:20;}});
Object.assign(TEST,{normView(on){scene.overrideMaterial=on?new THREE.MeshNormalMaterial():null;}});
