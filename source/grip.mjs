import * as THREE from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';import fs from 'fs';
const f='/workspace/anim/ual1/Universal Animation Library[Standard]/Unreal-Godot/UAL1_Standard.glb';
const buf=fs.readFileSync(f);const g=await new Promise((r,j)=>new GLTFLoader().parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',r,j));
const m=new THREE.AnimationMixer(g.scene);const c=g.animations.find(a=>a.name==='Sword_Idle');m.clipAction(c).play();m.setTime(0.3);
const out={};g.scene.traverse(o=>{if(o.isBone&&/^(index|middle|pinky|ring|thumb)_0[1-3]_[lr]$/.test(o.name))out[o.name]=o.quaternion.toArray().map(v=>+v.toFixed(4));});
fs.writeFileSync('src/grip.js','// finger grip pose sampled from Quaternius UAL1 "Sword_Idle" (CC0)\nexport const GRIP='+JSON.stringify(out)+';\n');console.log(Object.keys(out).length);
