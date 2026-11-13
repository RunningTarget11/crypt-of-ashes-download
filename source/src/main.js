import * as THREE from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {EffectComposer} from 'three/examples/jsm/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/examples/jsm/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/examples/jsm/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/examples/jsm/postprocessing/ShaderPass.js';
import {mulberry32,clamp,lerp,b64ToBuf,angleLerp,angDiff,rotateBoneWorld,smooth01} from './util.js';
import {generate,buildGeometry,isFloor,walkable,los,findPath,toCell,cellCenter,CELL,WALL_H} from './dungeon.js';
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
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
$('game').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(0x020202);
scene.fog=new THREE.Fog(0x030303,20,44);
const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,0.5,140);
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromScene(new RoomEnvironment(),0.04).texture;scene.environmentIntensity=0.07;
scene.add(new THREE.HemisphereLight(0x3a4458,0x120c08,0.7));

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
  float vig=smoothstep(0.95,0.32,r*1.15);col*=mix(0.18,1.,vig);
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
const floorMat=new THREE.MeshStandardMaterial({map:T('medieval_blocks_02_diff',true),normalMap:T('medieval_blocks_02_nor'),roughnessMap:T('medieval_blocks_02_arm'),aoMap:T('medieval_blocks_02_arm'),vertexColors:true,color:0x7a746c,normalScale:new THREE.Vector2(1.5,1.5)});
const wallMat=addCutout(new THREE.MeshStandardMaterial({map:T('castle_wall_slates_diff',true),normalMap:T('castle_wall_slates_nor'),roughnessMap:T('castle_wall_slates_arm'),aoMap:T('castle_wall_slates_arm'),vertexColors:true,color:0x8a8178,normalScale:new THREE.Vector2(1.6,1.6),shadowSide:THREE.DoubleSide}));
const capMat=addCutout(new THREE.MeshStandardMaterial({color:0x1a1714,roughness:1,map:T('stacked_stone_wall_diff',true,0.5),normalMap:T('stacked_stone_wall_nor',false,0.5)}));
const pillarMat=new THREE.MeshStandardMaterial({map:T('stacked_stone_wall_diff',true),normalMap:T('stacked_stone_wall_nor'),roughnessMap:T('stacked_stone_wall_arm'),color:0x8a8278,normalScale:new THREE.Vector2(1.5,1.5)});
const rockMat=new THREE.MeshStandardMaterial({map:pillarMat.map,normalMap:pillarMat.normalMap,roughness:0.95,color:0x6e665e});
const ironMat=new THREE.MeshStandardMaterial({color:0x1e1b18,metalness:0.85,roughness:0.5});
const goldMat=new THREE.MeshStandardMaterial({color:0xd9a441,metalness:1,roughness:0.28,emissive:0x3a2200,emissiveIntensity:0.6});

const gltfLoader=new GLTFLoader();
const parse=(k)=>new Promise((res,rej)=>gltfLoader.parse(b64ToBuf(A.glb[k]),'',res,rej));
const MODELS={};
const fxAdd=new Particles(4000,true,scene);
const fxAlpha=new Particles(2000,false,scene);
const rngFx=mulberry32(99);
const bloodTexs=[bloodTex(rngFx),bloodTex(rngFx),bloodTex(rngFx)];
const heroLight=new THREE.PointLight(0xffc58f,30,16,1.6);heroLight.castShadow=QL[qLevel].hs;heroLight.shadow.mapSize.set(IS_MOBILE?512:768,IS_MOBILE?512:768);heroLight.shadow.bias=-0.004;heroLight.shadow.camera.near=0.2;heroLight.shadow.camera.far=16;scene.add(heroLight);
const torchLights=[];for(let k=0;k<7;k++){const l=new THREE.PointLight(0xff7a2e,0,12,1.8);if(k<2){l.userData0=true;l.castShadow=QL[qLevel].ts;l.shadow.mapSize.set(512,512);l.shadow.bias=-0.004;l.shadow.camera.near=0.2;l.shadow.camera.far=12;}l.userData={torch:null,fade:0,canShadow:k<2};scene.add(l);torchLights.push(l);}
const fxLights=[];for(let k=0;k<4;k++){const l=new THREE.PointLight(0xff8030,0,10,1.6);l.userData={life:0,max:1,base:0};scene.add(l);fxLights.push(l);}
function flash(pos,color,intensity,life,dist=10){let l=fxLights.find(l=>l.userData.life<=0)||fxLights.reduce((a,b)=>a.userData.life<b.userData.life?a:b);l.position.copy(pos);l.color.set(color);l.distance=dist;l.userData={life,max:life,base:intensity};return l;}

const G={depth:1,seed:+(QS.get('seed')||7),state:'loading',time:0,hitstop:0,shake:0,hurt:0,kills:0};
let D=null;let level=new THREE.Group();scene.add(level);
const torches=[];const obstacles=[];const enemies=[];const loots=[];const projectiles=[];const decals=[];const slashes=[];const chests=[];const telegraphs=[];
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
function makeCharacter(kind,scale=1){
  const L=LOOKS[kind];const src=MODELS.ual;
  const model=SkeletonUtils.clone(src.scene);
  const mats=[];
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
    const isJ=o.name.includes('Joints')||(o.material&&o.material.name.includes('Joints'));if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();const gh=o.geometry.boundingBox.max.y-o.geometry.boundingBox.min.y;const m=charMaterial(isJ?L.joint:L.surf,1/Math.max(gh,1e-3));if(isJ)mats.push(m);else mats.unshift(m);o.material=m;}});
  const k=L.h/MODELS.ualH;const s=k*scale;model.scale.setScalar(s);
  const root=new THREE.Group(),tilt=new THREE.Group();tilt.add(model);root.add(tilt);
  const mixer=new THREE.AnimationMixer(model);
  const bones={};model.traverse(o=>{if(o.isBone){for(const b in BONES)if(o.name===BONES[b])bones[b]=o;if(GRIP[o.name])o.quaternion.fromArray(GRIP[o.name]);}});
  // close the sword hand a little more than the source pose so the grip reads at game camera distance
  const anim=new Animator(mixer,ANIMSET[kind],k*scale);
  root.updateMatrixWorld(true);
  const c={kind,root,tilt,model,mixer,anim,bones,mats,scale:s,yaw:0};
  if(L.eye){for(const sx of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({color:new THREE.Color(...L.eye)}));attachModel(c,bones.head,e,[sx*0.034,0.07,0.095],0.016);}}
  return c;
}
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
  torches.length=0;obstacles.length=0;
  for(const e of enemies){e.bar?.remove();}enemies.length=0;
  for(const l of loots)l.label?.remove();loots.length=0;projectiles.length=0;decals.length=0;slashes.length=0;chests.length=0;telegraphs.length=0;
  for(const l of torchLights){l.intensity=0;l.userData.torch=null;}
  fxAdd.clear();fxAlpha.clear();
}
function buildLevel(){
  clearLevel();
  const rng=mulberry32(G.seed*31+G.depth*977);
  D=generate(rng,G.depth);explored=new Uint8Array(D.W*D.H);
  const geo=buildGeometry(D);
  const floor=new THREE.Mesh(geo.floor,floorMat);floor.receiveShadow=true;floor.userData.ownGeo=true;level.add(floor);
  const walls=new THREE.Mesh(geo.walls,wallMat);walls.receiveShadow=true;walls.castShadow=true;walls.userData.ownGeo=true;level.add(walls);
  const caps=new THREE.Mesh(geo.caps,capMat);caps.userData.ownGeo=true;level.add(caps);
  const faces=geo.faces.filter(f=>f.side!=='s');
  const shuffled=faces.map(f=>[rng(),f]).sort((a,b)=>a[0]-b[0]).map(x=>x[1]);
  const cupGeo=new THREE.CylinderGeometry(0.11,0.06,0.28,8);const armGeo=new THREE.BoxGeometry(0.06,0.06,0.42);const plateGeo=new THREE.BoxGeometry(0.22,0.4,0.04);
  for(const f of shuffled){
    if(torches.some(t=>Math.hypot(t.wx-f.x,t.wz-f.z)<7.5))continue;
    const g=new THREE.Group();const arm=new THREE.Mesh(armGeo,ironMat);arm.position.set(0,-0.18,0.2);arm.rotation.x=0.6;g.add(arm);
    const cup=new THREE.Mesh(cupGeo,ironMat);cup.position.set(0,0,0.38);g.add(cup);
    const plate=new THREE.Mesh(plateGeo,ironMat);plate.position.set(0,-0.25,0.02);g.add(plate);
    g.position.set(f.x,2.35,f.z);g.rotation.y=Math.atan2(f.nx,f.nz);level.add(g);
    torches.push({wx:f.x,wz:f.z,fx:f.x+f.nx*0.38,fy:2.5,fz:f.z+f.nz*0.38,phase:rng()*100});
  }
  const ri=(a,b)=>a+Math.floor(rng()*(b-a+1));
  const addObs=(x,z,r)=>obstacles.push({x,z,r});
  const place=(obj,x,z,ry=0,s=1,obsR=0)=>{obj.position.set(x,0,z);obj.rotation.y=ry;obj.scale.multiplyScalar(s);level.add(obj);if(obsR)addObs(x,z,obsR);return obj;};
  const roomCells=r=>{const out=[];for(let j=r.y;j<r.y+r.h;j++)for(let i=r.x;i<r.x+r.w;i++)out.push([i,j]);return out;};
  const wx=i=>i*CELL,wz=j=>j*CELL;
  for(const r of D.rooms){
    const x0=wx(r.x),z0=wz(r.y),x1=wx(r.x+r.w),z1=wz(r.y+r.h);
    if(r.w>=8&&r.h>=8){
      for(const [px,pz] of [[x0+3.2,z0+3.2],[x1-3.2,z0+3.2],[x0+3.2,z1-3.2],[x1-3.2,z1-3.2]]){
        const g=new THREE.Group();
        const sh=new THREE.Mesh(new THREE.CylinderGeometry(0.42,0.46,WALL_H,12),pillarMat);sh.position.y=WALL_H/2;g.add(sh);const cap=new THREE.Mesh(new THREE.BoxGeometry(1.1,0.3,1.1),pillarMat);cap.position.y=WALL_H-0.1;g.add(cap);
        const base=new THREE.Mesh(new THREE.BoxGeometry(1.25,0.45,1.25),pillarMat);base.position.y=0.22;g.add(base);
        const base2=new THREE.Mesh(new THREE.BoxGeometry(1.05,0.25,1.05),pillarMat);base2.position.y=0.55;g.add(base2);
        g.traverse(o=>{o.castShadow=o.receiveShadow=true;});place(g,px,pz,0,1,0.75);
      }
    }
    if(r.kind==='normal'&&rng()<0.75){const st=cloneProp('gothic_statue');place(st,(x0+x1)/2+(rng()-.5)*2,z0+1.05,0,1.15,1.0);}
    if(r.kind==='boss'){for(const sx of [-4,4]){const st=cloneProp('gothic_statue');place(st,(x0+x1)/2+sx,z0+1.05,0,1.5,1.2);}
      for(const [bx,bz] of [[x0+4,z0+4],[x1-4,z0+4],[x0+4,z1-4],[x1-4,z1-4]]){const g=new THREE.Group();
        const leg=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.14,1.1,8),ironMat);leg.position.y=0.55;g.add(leg);
        const bowl=new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.22,0.35,14,1,true),ironMat);bowl.position.y=1.2;bowl.material.side=THREE.DoubleSide;g.add(bowl);
        const coal=new THREE.Mesh(new THREE.CircleGeometry(0.45,14),new THREE.MeshBasicMaterial({color:new THREE.Color(3,0.8,0.15)}));coal.rotation.x=-Math.PI/2;coal.position.y=1.3;g.add(coal);
        g.traverse(o=>{o.castShadow=true;});place(g,bx,bz,0,1,0.55);torches.push({wx:bx,wz:bz,fx:bx,fy:1.35,fz:bz,phase:rng()*100,big:true});}}
    const corners=[[x0+0.9,z0+0.9],[x1-0.9,z0+0.9],[x0+0.9,z1-0.9],[x1-0.9,z1-0.9]];
    for(const [cx,cz] of corners){if(rng()<0.55){
      const n=ri(1,3);for(let k=0;k<n;k++){const isB=rng()<0.6;const o=cloneProp(isB?'wine_barrel_01':'wooden_crate_01');
        const ox=cx+(rng()-.5)*1.4*(k>0),oz=cz+(rng()-.5)*1.4*(k>0);place(o,clamp(ox,x0+0.6,x1-0.6),clamp(oz,z0+0.6,z1-0.6),rng()*6,isB?1.05:1.3,0.5);
        if(!isB&&rng()<0.4){const o2=cloneProp('wooden_crate_01');o2.position.set(o.position.x,0.44,o.position.z);o2.rotation.y=rng()*6;o2.scale.multiplyScalar(1.1);level.add(o2);}}
    }}
    for(let k=0;k<ri(3,8);k++){const g=new THREE.IcosahedronGeometry(0.12+rng()*0.25,0);const p=g.attributes.position;for(let v=0;v<p.count;v++)p.setXYZ(v,p.getX(v)*(0.7+rng()*.6),p.getY(v)*(0.5+rng()*.4),p.getZ(v)*(0.7+rng()*.6));g.computeVertexNormals();
      const m=new THREE.Mesh(g,rockMat);m.castShadow=m.receiveShadow=true;m.userData.ownGeo=true;const along=rng();const side=rng()<.5;
      m.position.set(side?lerp(x0+0.4,x1-0.4,along):(rng()<.5?x0+0.4:x1-0.4),0.05,side?(rng()<.5?z0+0.4:z1-0.4):lerp(z0+0.4,z1-0.4,along));m.rotation.set(rng()*6,rng()*6,rng()*6);level.add(m);}
    if(r.kind!=='start')for(let k=0;k<ri(0,2);k++)addDecal(lerp(x0+1,x1-1,rng()),lerp(z0+1,z1-1,rng()),1.2+rng()*1.8,rng,0.75,false);
    if((r.kind==='normal'&&rng()<0.3)||r.kind==='boss'){
      const ch=cloneProp('treasure_chest');const cx=r.kind==='boss'?(x0+x1)/2:lerp(x0+1.5,x1-1.5,rng()),cz=r.kind==='boss'?z0+3:z0+1.2;
      place(ch,cx,cz,0,1.25,0.7);chests.push({obj:ch,x:cx,z:cz,opened:false,boss:r.kind==='boss'});
    }
  }
  const types=['skeleton','skeleton','skeleton','caller'];
  const eliteRoom=D.order[Math.max(2,Math.floor(D.order.length*0.6))];
  for(const r of D.order){
    if(r.kind==='start')continue;
    const cells=roomCells(r).filter(([i,j])=>i>r.x&&j>r.y&&i<r.x+r.w-1&&j<r.y+r.h-1);
    const pick=()=>{const [i,j]=cells[Math.floor(rng()*cells.length)];return [cellCenter(i)+(rng()-.5),cellCenter(j)+(rng()-.5)];};
    if(r.kind==='boss'){const bx=(wx(r.x)+wx(r.x+r.w))/2,bz=(wz(r.y)+wz(r.y+r.h))/2;spawnEnemy('boss',bx,bz,rng);for(let k=0;k<3;k++){const [x,z]=pick();spawnEnemy('skeleton',x,z,rng);}continue;}
    const n=ri(3,5)+Math.min(3,G.depth-1);
    for(let k=0;k<n;k++){const [x,z]=pick();spawnEnemy(types[Math.floor(rng()*types.length)],x,z,rng);}
    if(r===eliteRoom){const [x,z]=pick();spawnEnemy('brute',x,z,rng);}
  }
  const s=D.start;P.pos.set(cellCenter(s.x+(s.w>>1)),0,cellCenter(s.y+(s.h>>1)));P.path=null;P.target=null;
  hero.root.position.copy(P.pos);
  G.bossAwake=false;
  if(G.state==='play')banner('The Sunken Ossuary','Depth '+G.depth);
}
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
  const bar=document.createElement('div');bar.className='ebar'+(T0.elite?' elite':'');bar.innerHTML='<i></i>';$('labels').appendChild(bar);e.bar=bar;
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
    if(R.beam){const h=item.rarity==='legendary'?5.5:4;beam=new THREE.Mesh(new THREE.PlaneGeometry(0.8,h),beamMaterial(R.beam));beam.position.y=h/2;g.add(beam);}
  }
  g.position.set(x,0,z);level.add(g);
  const lab=document.createElement('div');lab.className='loot '+(gold?'gold':item.rarity||'common');
  lab.textContent=gold?`${gold} Gold`:item.name;$('labels').appendChild(lab);
  const L={g,item,gold,label:lab,beam,x,z,t:0,vy:3+Math.random()*2,y:1.2};
  lab.addEventListener('pointerdown',ev=>{ev.stopPropagation();initAudio();if(ev.button===0){P.target={type:'loot',loot:L};P.path=null;}});
  loots.push(L);
  if(item&&(item.rarity==='legendary'||item.rarity==='rare')){flash(new THREE.Vector3(x,1.5,z),item.rarity==='legendary'?0xff8a1e:0xf2d24b,30,1.2,9);if(item.rarity==='legendary')sfx.legendary();}
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
function pickup(L){
  if(L.gold){P.gold+=L.gold;sfx.coin();floatText(L.g.position.clone().setY(1),'+'+L.gold+' gold','goldt');}
  else if(L.item.type==='potion'){P.potions=Math.min(P.potions+1,9);sfx.potion();}
  else{if(P.inv.length>=40){floatText(P.pos.clone().setY(2),'Inventory full','info');return;}P.inv.push(L.item);sfx.item();if(!P.equip[L.item.slot])equip(L.item);refreshInv();}
  level.remove(L.g);L.label.remove();loots.splice(loots.indexOf(L),1);
}
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
  const en=pickEnemy(mouse.x,mouse.y,e.pointerType==='touch'?1.7:1);const ch=!en&&pickChest(mouse.x,mouse.y);
  if(en){P.target={type:'enemy',e:en};mouse.downTarget=en;}
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
  if(P.atk&&P.atk.phase==='rec'&&wantsMove()){hero.anim.stop(0.16);P.atk=null;}
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
  const ci=toCell(P.pos.x),cj=toCell(P.pos.z);for(let j=cj-8;j<=cj+8;j++)for(let i=ci-8;i<=ci+8;i++)if(i>=0&&j>=0&&i<D.W&&j<D.H&&(i-ci)**2+(j-cj)**2<64)explored[j*D.W+i]=1;
  const br=D.boss;if(!G.bossAwake&&ci>=br.x&&ci<br.x+br.w&&cj>=br.y&&cj<br.y+br.h){G.bossAwake=true;const b=enemies.find(e=>e.def.boss);if(b&&!b.dead){b.state='chase';aggro(b);banner('Varkoth, the Bone Warden','Lord of the Ossuary');sfx.roar();shake(0.6);}}
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
    const vis=dist<28&&!e.removed;c.root.visible=vis;const csh=dist<13;if(c.shOn!==csh){c.shOn=csh;c.root.traverse(o=>{if(o.isMesh)o.castShadow=csh;});}
    if(e.dead){e.deadT+=dt;
      if(e.deadT>5)c.tilt.position.y=-(e.deadT-5)*0.3;if(e.deadT>7&&!e.removed){e.removed=true;level.remove(c.root);}
      continue;}
    e.flash=Math.max(0,e.flash-dt*9);e.hurt=Math.max(0,e.hurt-dt*5);
    if(e.hitAnim&&(!e.c.anim.oneName||!e.c.anim.oneName.startsWith('Hit_')||e.c.anim.done(0.8))){if(e.c.anim.oneName&&e.c.anim.oneName.startsWith('Hit_'))e.c.anim.stop(0.2);e.hitAnim=false;}
    c.mats[0].emissive.setRGB(e.flash*0.13,e.flash*0.08,e.flash*0.05);
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
    if(L.gold&&L.t>0.5&&Math.hypot(P.pos.x-L.x,P.pos.z-L.z)<1.3){pickup(L);continue;}
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
    const n=Math.sin(time*9.1+t.phase)*0.5+Math.sin(time*23.7+t.phase*2)*0.3+Math.sin(time*3.3+t.phase)*0.4;l.intensity=(TORCH_I+n*TORCH_I*0.2)*l.userData.fade;
    l.position.set(t.fx+Math.sin(time*7+t.phase)*0.04,t.fy+0.3,t.fz+Math.cos(time*6+t.phase)*0.04);}
  for(const t of torches){const d=Math.hypot(t.fx-P.pos.x,t.fz-P.pos.z);if(d>30)continue;
    for(let q=0;q<(t.big?3:1);q++)if(Math.random()<dt*55)fxAdd.emit({x:t.fx+(Math.random()-.5)*(t.big?0.6:0.12),y:t.fy+0.05,z:t.fz+(Math.random()-.5)*(t.big?0.6:0.12),vx:(Math.random()-.5)*0.2,vy:1.2+Math.random()*0.8,vz:(Math.random()-.5)*0.2,life:0.35+Math.random()*0.25,size:t.big?0.6:0.42,size1:0.08,color:[5,2.2,0.6],color1:[1.4,0.25,0.03]});
    if(Math.random()<dt*3)fxAdd.emit({x:t.fx,y:t.fy+0.3,z:t.fz,vx:(Math.random()-.5)*0.6,vy:1+Math.random()*1.5,vz:(Math.random()-.5)*0.6,life:1.4,drag:0.4,size:0.04,size1:0.01,color:[5,2,0.4]});
    if(Math.random()<dt*2)fxAlpha.emit({x:t.fx,y:t.fy+0.6,z:t.fz,vx:(Math.random()-.5)*0.2,vy:0.6,vz:0.1,life:2,size:0.3,size1:0.9,color:[0.05,0.045,0.04],alpha:0.25});
  }
}
let TORCH_I=16;
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
  if(G.state==='title'){const a=G.time*0.1;camera.position.set(camLook.x+Math.sin(a)*9,7.5,camLook.z+Math.cos(a)*9);camera.lookAt(camLook.x,1.2,camLook.z);}
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
const SLOT_DEF=[{id:'lmb',icon:'attack',key:'LMB',name:'Attack',desc:'Strike the enemy under the cursor. Hold to keep attacking or moving. Shift: attack in place.'},{id:'whirl',icon:'whirl',key:'1',skill:'whirl'},{id:'fire',icon:'fire',key:'2 / RMB',skill:'fire'},{id:'dash',icon:'dash',key:'3',skill:'dash'},{id:'potion',icon:'potion',key:'Q',name:'Healing Potion',desc:'Restore 45% of your Life.'}];
for(const d of SLOT_DEF){const el=document.createElement('div');el.className='slot';el.innerHTML=`<div class=ic style="background-image:url(${uiImg('i_'+d.icon)})"></div><div class=gloss></div><canvas class=cdc width=96 height=96></canvas><span class=cdt></span><span class=key>${d.key}</span>${d.id==='potion'?'<span class=cnt></span>':''}`;
  $('slots').appendChild(el);d.el=el;d.cdc=el.querySelector('.cdc');d.cdg=d.cdc.getContext('2d');d.cdt=el.querySelector('.cdt');d.lastF=-1;
  const sk=d.skill?SKILLS[d.skill]:d;el.addEventListener('pointerenter',()=>showTip(`<div class=tt-name style="color:#e8d8b0">${sk.name}</div>${d.skill?`<div class=tt-sub>Cost: ${sk.mana} Mana · Cooldown ${sk.cd}s</div>`:''}<div class=tt-desc>${sk.desc}</div>`,el));
  el.addEventListener('pointerleave',hideTip);
  el.addEventListener('pointerdown',ev=>{ev.stopPropagation();initAudio();if(G.state!=='play')return;let aim=mouse.ground.clone();
    if(ev.pointerType!=='mouse')aim=autoAim(d.skill);
    if(d.skill)useSkill(d.skill,aim);else if(d.id==='potion')drinkPotion();});
}
function showTip(html,el){const t=$('tooltip');t.innerHTML=html;t.style.display='block';const r=el.getBoundingClientRect();t.style.left=clamp(r.left+r.width/2-t.offsetWidth/2,8,innerWidth-t.offsetWidth-8)+'px';let top=r.top-t.offsetHeight-10;if(top<8)top=r.bottom+10;t.style.top=top+'px';}
function hideTip(){$('tooltip').style.display='none';}
const SLOTS=[['helm','Helm'],['amulet','Amulet'],['weapon','Weapon'],['chest','Chest'],['gloves','Gloves'],['ring','Ring'],['boots','Boots']];
function itemTip(it,cmp){const R=RARITY[it.rarity];let h=`<div class=tt-name style="color:${R.color}">${it.name}</div><div class=tt-sub>${R.name} ${it.base}</div><div class=tt-sep></div>`;
  if(it.dmg)h+=`<div class=tt-big>${it.dmg[0]}–${it.dmg[1]}</div><div class=tt-sub>Damage</div>`;if(it.armor)h+=`<div class=tt-big>${it.armor}</div><div class=tt-sub>Armor</div>`;
  if(it.lines.length)h+='<div class=tt-sep></div>'+it.lines.map(l=>`<div class=tt-aff>◆ ${l}</div>`).join('');
  if(it.special)h+=`<div class=tt-leg>${it.special}</div>`;h+=`<div class=tt-foot>Item Level ${it.ilvl}${cmp?' · Click to equip':''}</div>`;return h;}
function refreshInv(){
  const eq=$('equip');eq.innerHTML='';for(const [k,n] of SLOTS){const it=P.equip[k];const el=document.createElement('div');el.className='eslot s-'+k+(it?' r-'+it.rarity:'');el.innerHTML=`<canvas width=96 height=96></canvas><span>${n}</span>`;if(it){drawIcon(el.querySelector('canvas').getContext('2d'),it.type,96);if(IS_MOBILE)el.onclick=()=>showSheet(it,false);else{el.onpointerenter=()=>showTip(itemTip(it),el);el.onpointerleave=hideTip;}}eq.appendChild(el);}
  const gr=$('grid');gr.innerHTML='';for(let i=0;i<40;i++){const it=P.inv[i];const el=document.createElement('div');el.className='cell'+(it?' r-'+it.rarity:'');
    if(it){el.innerHTML='<canvas width=96 height=96></canvas>';drawIcon(el.querySelector('canvas').getContext('2d'),it.type,96);if(IS_MOBILE){el.onclick=()=>showSheet(it,true);}else{el.onpointerenter=()=>showTip(itemTip(it,true),el);el.onpointerleave=hideTip;el.onclick=()=>{hideTip();equip(it);};}}gr.appendChild(el);}
  const s=S;$('cstats').innerHTML=`<div><b>${s.dmgMin}–${s.dmgMax}</b><span>Damage</span></div><div><b>${s.armor}</b><span>Armor</span></div><div><b>${s.maxHp}</b><span>Life</span></div><div><b>${s.crit}%</b><span>Crit</span></div><div><b>${s.str}</b><span>Strength</span></div><div><b>${s.vit}</b><span>Vitality</span></div>`;
}
function toggleInv(){$('inv').classList.toggle('show');hideTip();hideSheet();refreshInv();}
$('invbtn').addEventListener('pointerdown',e=>{e.stopPropagation();toggleInv();});
$('invclose').addEventListener('pointerdown',e=>{e.stopPropagation();toggleInv();});
const mm=$('minimap').getContext('2d');
function drawMinimap(){
  const s=mm.canvas.width,sc=4.2,ci=P.pos.x/CELL,cj=P.pos.z/CELL;mm.clearRect(0,0,s,s);
  mm.save();mm.beginPath();mm.arc(s/2,s/2,s/2-3,0,7);mm.clip();mm.fillStyle='rgba(5,4,3,0.6)';mm.fillRect(0,0,s,s);
  mm.translate(s/2-ci*sc,s/2-cj*sc);mm.fillStyle='rgba(120,100,70,0.2)';mm.strokeStyle='rgba(205,175,115,0.85)';mm.lineWidth=1.2;
  mm.beginPath();
  for(let j=0;j<D.H;j++)for(let i=0;i<D.W;i++){if(!explored[j*D.W+i]||!isFloor(D,i,j))continue;mm.fillRect(i*sc,j*sc,sc,sc);
    if(!isFloor(D,i,j-1)){mm.moveTo(i*sc,j*sc);mm.lineTo(i*sc+sc,j*sc);}if(!isFloor(D,i,j+1)){mm.moveTo(i*sc,j*sc+sc);mm.lineTo(i*sc+sc,j*sc+sc);}if(!isFloor(D,i-1,j)){mm.moveTo(i*sc,j*sc);mm.lineTo(i*sc,j*sc+sc);}if(!isFloor(D,i+1,j)){mm.moveTo(i*sc+sc,j*sc);mm.lineTo(i*sc+sc,j*sc+sc);}}
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
  for(const e of enemies){if(e.dead)continue;const show=(e.hp<e.maxHp||e===hov||e.def.elite)&&e.c.root.visible&&!e.def.boss;e.bar.style.display=show?'block':'none';if(show){const [x,y]=screenOf(e.pos,2.15*(e.def.scale||1));e.bar.style.transform=`translate(${x-28}px,${y}px)`;e.bar.firstChild.style.width=(e.hp/e.maxHp*100)+'%';}
    if(e===hov&&e.flash<0.2)e.c.mats[0].emissive.setRGB(0.22,0.05,0.03);}
  const placed=[];
  for(const L of loots){const [x,y0,z]=screenOf(L.g.position,0.55);let y=y0;const on=z<1&&x>-50&&x<innerWidth+50&&y>(IS_MOBILE?Math.min(innerWidth,innerHeight)*0.36:-20)&&y<innerHeight+20&&Math.hypot(L.x-P.pos.x,L.z-P.pos.z)<26;L.label.style.display=on?'block':'none';
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
  updateFX(gdt,Math.max(gdt,dt*0.6));updateTorches(dt);
  if(P.dead||G.state!=='play')hero.anim.update(gdt,0);
  hero.mixer.update(gdt);updateTrail(gdt);
  updateCape(gdt,P.speedNow||0);
  for(const e of enemies){if(!e.c.root.visible||e.removed)continue;if(e.dead&&e.deadT>2.6)continue;if(e.dead)e.c.anim.update(gdt,0);e.c.mixer.update(gdt);}
  updateCamera(dt);
  grade.uniforms.uTime.value=G.time;charTime.value=G.time;
  if(!noRender)composer.render();
  updateUI(dt);
}
function onResize(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);
  for(const p of [fxAdd,fxAlpha])p.uniforms.uScale.value=innerHeight*renderer.getPixelRatio()*0.75;layoutTouch();}
addEventListener('resize',onResize);addEventListener('orientationchange',()=>setTimeout(onResize,250));
if(window.visualViewport)visualViewport.addEventListener('resize',()=>{if(Math.abs(innerWidth-renderer.domElement.clientWidth)>1||Math.abs(innerHeight-renderer.domElement.clientHeight)>1)onResize();});
// ---------- boot ----------
const PROPS=['treasure_chest','wine_barrel_01','gothic_statue','kite_shield','wooden_handle_saber','wooden_crate_01'];
async function boot(){
  const all=await Promise.all(['hero_ual',...PROPS].map(parse));
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
function startGame(){initAudio();if(IS_MOBILE&&!QS.has('nofs')){try{const el=document.documentElement;(el.requestFullscreen||el.webkitRequestFullscreen)?.call(el,{navigationUI:'hide'})?.catch?.(()=>{});}catch(_){}}$('title').classList.remove('show');G.state='play';$('hud').classList.add('show');banner('The Sunken Ossuary','Depth '+G.depth);}
$('enter').addEventListener('click',startGame);
$('respawn').addEventListener('click',()=>{P.dead=false;hero.anim.stop(0.1);P.atk=null;$('death').classList.remove('show');S=stats();P.hp=S.maxHp;P.mana=S.maxMana;P.gold=Math.floor(P.gold*0.9);const s=D.start;P.pos.set(cellCenter(s.x+(s.w>>1)),0,cellCenter(s.y+(s.h>>1)));P.target=null;hero.tilt.rotation.x=0;for(const e of enemies)if(!e.dead){e.state='idle';e.atkT=-1;}G.bossAwake=false;});
$('deeper').addEventListener('click',()=>{$('victory').classList.remove('show');G.depth++;G.seed++;buildLevel();});
Object.assign(TEST,{fxAdd,fxAlpha,fxL:()=>fxLights.map(l=>+l.intensity.toFixed(1)),BoxGeometry:THREE.BoxGeometry,MBM:THREE.MeshBasicMaterial,Mesh:THREE.Mesh,CLIPS,getTrail:()=>trail,softTarget,startCombo,run(n,dt=1/30){for(let i=0;i<n;i++)step(dt,i<n-1);},P,G,enemies,loots,get S(){return S;},useSkill,setMoveTarget,step,startGame,
  attackNearest(){const e=enemies.filter(e=>!e.dead).sort((a,b)=>a.pos.distanceTo(P.pos)-b.pos.distanceTo(P.pos))[0];P.target={type:'enemy',e};return e;},
  teleport(x,z){P.pos.set(x,0,z);camLook.set(x,0.9,z);},
  teleportNear(e,d=3){const dir=new THREE.Vector3(0,0,1);for(let a=0;a<12;a++){const p=e.pos.clone().addScaledVector(dir,d);if(walkable(D,p.x,p.z,0.4)&&!blockedByObs(p.x,p.z,0.4)){P.pos.copy(p);camLook.set(p.x,0.9,p.z);return true;}dir.applyAxisAngle(UPV,0.52);}return false;},
  dropTest(){const s=['legendary','rare','magic','common','gold'];let k=0;for(let a=0;a<40&&k<s.length;a++){const ang=a*0.9,d=2.2+(a%3)*0.5;const x=P.pos.x+Math.sin(ang)*d,z=P.pos.z+Math.cos(ang)*d;if(!walkable(D,x,z,0.3)||blockedByObs(x,z,0.3))continue;if(s[k]==='gold')dropLoot(x,z,null,87);else dropLoot(x,z,rollItem(Math.random,8,s[k]));k++;}},
  ground:(x,y)=>groundAt(x,y,new THREE.Vector3()),screenOf,camera,scene,renderer,hero:()=>hero,D:()=>D,pickup,refreshInv,toggleInv,
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
function showSheet(it,canEquip){const sh=$('sheet');sh.innerHTML=itemTip(it)+`<div class=sheet-btns>${canEquip?'<button class="btn sm" id=shEq>Equip</button>':''}<button class="btn sm" id=shX>Close</button></div>`;sh.classList.add('show');
  if(canEquip)$('shEq').onclick=()=>{equip(it);hideSheet();};$('shX').onclick=hideSheet;}
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
  layoutTouch();
}
function layoutTouch(){
  if(!IS_MOBILE)return;const W=innerWidth,H=innerHeight;const vmin=Math.min(W,H);
  const A=clamp(vmin*0.19,62,92),Sz=clamp(vmin*0.128,44,62),gap=Math.max(5,vmin*0.016);
  const cs=getComputedStyle(document.documentElement);const sr=parseFloat(cs.getPropertyValue('--sar'))||0,sb=parseFloat(cs.getPropertyValue('--sab'))||0;
  const RA=A*0.66,RS=Sz*0.68;const cx=W-sr-10-RA,cy=H-sb-10-RA;const R=RA+RS+gap;
  const place=(id,x,y,sz)=>{const el=$(id);el.style.width=el.style.height=sz+'px';el.style.left=(x-sz/2)+'px';el.style.top=(y-sz/2)+'px';};
  place('bAtk',cx,cy,A);
  [['b1',182],['b2',226],['b3',270]].forEach(([id,a])=>{const r=a*Math.PI/180;place(id,cx+Math.cos(r)*R,cy+Math.sin(r)*R,Sz);});
  place('bPot',cx-R-RS*2-gap*1.5,cy+RA-RS*0.9,Sz*0.86);
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
