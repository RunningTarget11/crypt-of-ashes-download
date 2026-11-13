// Builds glb/hero_ual.glb: Quaternius UAL mannequin (CC0) + selected CC0 animation clips from UAL1 + UAL2.
import {NodeIO} from '@gltf-transform/core';
import {resample,prune,dedup} from '@gltf-transform/functions';
const io=new NodeIO();
const U1='/workspace/anim/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
const U2='/workspace/anim/ual2/Universal Animation Library 2[Standard]/Unreal-Godot/UAL2_Standard.glb';
const KEEP1=['Idle_Loop','Sword_Idle','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Hit_Chest','Hit_Head','Death01','Spell_Simple_Shoot','Sword_Attack','Punch_Cross','Roll','Interact'];
const KEEP2=['Sword_Regular_A','Sword_Regular_A_Rec','Sword_Regular_B','Sword_Regular_B_Rec','Sword_Regular_C','Sword_Heavy_Combo','Sword_Dash','Hit_Knockback','Zombie_Idle_Loop','Zombie_Walk_Fwd_Loop','Zombie_Scratch','Consume','Chest_Open','Shield_OneShot'];
const doc=await io.read(U1);const src=await io.read(U2);
const root=doc.getRoot();const buf=root.listBuffers()[0];
for(const a of root.listAnimations())if(!KEEP1.includes(a.getName()))a.dispose();
const byName=new Map(root.listNodes().map(n=>[n.getName(),n]));
for(const a of src.getRoot().listAnimations()){
  if(!KEEP2.includes(a.getName()))continue;
  const na=doc.createAnimation(a.getName());const cache=new Map();
  const acc=(x)=>{if(cache.has(x))return cache.get(x);const y=doc.createAccessor().setType(x.getType()).setArray(x.getArray().slice()).setBuffer(buf);cache.set(x,y);return y;};
  for(const ch of a.listChannels()){const s=ch.getSampler();const tn=byName.get(ch.getTargetNode().getName());if(!tn)continue;
    const ns=doc.createAnimationSampler().setInput(acc(s.getInput())).setOutput(acc(s.getOutput())).setInterpolation(s.getInterpolation());
    na.addSampler(ns).addChannel(doc.createAnimationChannel().setSampler(ns).setTargetNode(tn).setTargetPath(ch.getTargetPath()));}
}
// drop scale channels (constant in these clips) to save space
const FING=/^(index|middle|pinky|ring|thumb)_/;
for(const a of root.listAnimations())for(const ch of a.listChannels()){const n=ch.getTargetNode().getName(),p=ch.getTargetPath();
  const keep=p==='rotation'?!FING.test(n):p==='translation'?(n==='pelvis'||n==='root'):false;
  if(!keep){ch.getSampler().dispose();ch.dispose();}}
await doc.transform(resample({tolerance:5e-4}),dedup(),prune());
const live=new Set();for(const a of root.listAnimations())for(const sm of a.listSamplers()){live.add(sm.getInput());live.add(sm.getOutput());}
for(const a of root.listAccessors()){const ps=a.listParents().filter(p=>p!==root);if(ps.length&&ps.every(p=>p.propertyType==='AnimationSampler')&&!live.has(a))a.dispose();else if(!ps.length)a.dispose();}
console.log(root.listAnimations().map(a=>a.getName()).join(', '));
await io.write('glb/hero_ual.glb',doc);
