import * as THREE from 'three';
export function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export function b64ToBuf(s){const bin=atob(s);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer;}
export function angleLerp(a,b,t){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return a+d*t;}
export function angDiff(a,b){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d;}
const _q=new THREE.Quaternion(),_pq=new THREE.Quaternion(),_pqi=new THREE.Quaternion();
// rotate a bone around a WORLD axis (applied on top of current pose)
export function rotateBoneWorld(bone,axis,angle){
  if(!bone||Math.abs(angle)<1e-5)return;
  bone.parent.getWorldQuaternion(_pq);_pqi.copy(_pq).invert();
  _q.setFromAxisAngle(axis,angle);
  // local = pqi * q * pq * local
  bone.quaternion.premultiply(_pq).premultiply(_q).premultiply(_pqi);
  bone.updateMatrixWorld(true);
}
export function smooth01(t){t=clamp(t,0,1);return t*t*(3-2*t);}
