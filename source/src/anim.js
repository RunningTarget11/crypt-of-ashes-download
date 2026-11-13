// Skeletal animation controller: phase-synced locomotion blend + crossfaded one-shot actions.
// All clips are real keyframed clips from the Quaternius Universal Animation Library 1 & 2 (CC0).
import * as THREE from 'three';
import {clamp,lerp} from './util.js';
export const CLIPS={};
export function registerClips(anims){for(const c of anims)CLIPS[c.name]=c;}
// stride speeds (m/s) of the locomotion loops at 1.83m character height, measured from foot travel
export const STRIDE={Walk_Loop:1.25,Zombie_Walk_Fwd_Loop:1.05,Jog_Fwd_Loop:2.9,Sprint_Loop:4.0};
export class Animator{
  constructor(mixer,set,heightScale){
    this.mixer=mixer;this.set=set;this.k=heightScale;this.phase=Math.random();this.one=null;this.oneName=null;this.fading=[];this.moveBlend=0;this.speed=0;
    this.idle=this._loop(set.idle);this.idle.play();
    this.loco=set.loco.map(n=>{const a=this._loop(n);a.timeScale=0;a.setEffectiveWeight(0);a.play();return {n,a,v:STRIDE[n]*heightScale,d:CLIPS[n].duration};});
  }
  _loop(n){const a=this.mixer.clipAction(CLIPS[n]);a.setLoop(THREE.LoopRepeat,Infinity);return a;}
  action(n){return this.mixer.clipAction(CLIPS[n]);}
  // play a one-shot clip, crossfading from whatever is playing. Weights are driven here (not by three's
  // fade interpolants) so locomotion + one-shots always sum to exactly 1 on every frame (no bind-pose pops).
  play(n,o={}){
    const fade=Math.max(1e-3,o.fade??0.1);const a=this.action(n);
    if(this.one&&this.one!==a){this.one.userData_t=0;this.one._rate=1/fade;this.fading.push(this.one);}
    this.fading=this.fading.filter(x=>x!==a);
    const wasW=a.isRunning()?(a._w||0):0;
    a.reset();a.setLoop(o.loop?THREE.LoopRepeat:THREE.LoopOnce,Infinity);a.clampWhenFinished=true;
    a.timeScale=o.ts??1;a.time=o.from??0;a._w=wasW;a._max=o.w??1;a._rate=1/fade;a.setEffectiveWeight(a._w);a.play();
    this.one=a;this.oneName=n;return a;
  }
  stop(fade=0.2){if(this.one){this.one._rate=1/Math.max(1e-3,fade);this.fading.push(this.one);this.one=null;this.oneName=null;}}
  get time(){return this.one?this.one.time:0;}
  done(frac=1){return !this.one||this.one.time>=this.one.getClip().duration*frac-1e-4;}
  // speed: current ground speed (m/s)
  update(dt,speed){
    this.speed=lerp(this.speed,speed,1-Math.exp(-14*dt));const sp=this.speed;
    let ow=0;const one=this.one;
    if(one){one._w=Math.min(one._max,(one._w||0)+dt*one._rate);}
    this.fading=this.fading.filter(a=>{a._w=Math.max(0,(a._w||0)-dt*a._rate);if(a._w<=1e-3){a.setEffectiveWeight(0);a.stop();a._w=0;return false;}return true;});
    // normalise: the newest one-shot takes what it needs, fading ones share the rest, locomotion gets the remainder
    let tot=(one?one._w:0);let fsum=0;for(const a of this.fading)fsum+=a._w;
    const fk=fsum>0?Math.min(1,Math.max(0,1-tot)/fsum):0;
    if(one)one.setEffectiveWeight(one._w);for(const a of this.fading)a.setEffectiveWeight(a._w*fk);
    ow=clamp(tot+fsum*fk,0,1);const base=1-ow;
    const L=this.loco;const mv=clamp(sp/(L[0].v*0.55),0,1);this.moveBlend=lerp(this.moveBlend,mv,1-Math.exp(-12*dt));
    // 1D blend between adjacent loops by speed, all sharing one normalized phase so feet stay in sync
    let i=0;while(i<L.length-1&&sp>L[i+1].v)i++;
    let wB=0;if(i<L.length-1)wB=clamp((sp-L[i].v)/(L[i+1].v-L[i].v),0,1);
    const A=L[i],B=L[Math.min(i+1,L.length-1)];
    const cyc=lerp(A.v*A.d,B.v*B.d,wB);this.phase=(this.phase+Math.max(sp,0.35*this.moveBlend)*dt/cyc)%1;
    for(const l of L){const w=l===A?(1-wB):l===B?wB:0;l.a.setEffectiveWeight(w*this.moveBlend*base);l.a.time=this.phase*l.d;}
    this.idle.setEffectiveWeight((1-this.moveBlend)*base);
  }
}
