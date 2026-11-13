// Sword swing trail: a ribbon that follows the real blade (base->tip) world positions sampled every frame.
import * as THREE from 'three';
const MAXS=48;
export class SwordTrail{
  constructor(scene,color=[2.4,1.5,0.8]){
    this.n=0;this.base=[];this.tip=[];this.age=[];this.on=false;this.life=0.16;
    const g=new THREE.BufferGeometry();this.pos=new Float32Array(MAXS*2*3);this.attr=new Float32Array(MAXS*2*2);
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aT',new THREE.BufferAttribute(this.attr,2).setUsage(THREE.DynamicDrawUsage));
    const idx=[];for(let i=0;i<MAXS-1;i++){const a=i*2,b=a+1,c=a+2,d=a+3;idx.push(a,b,c,b,d,c);}g.setIndex(idx);
    this.mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      uniforms:{uC:{value:new THREE.Color(...color)},uI:{value:1}},
      vertexShader:`attribute vec2 aT;varying vec2 vT;void main(){vT=aT;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`uniform vec3 uC;uniform float uI;varying vec2 vT;void main(){float age=clamp(vT.x,0.,1.);float s=clamp(vT.y,0.,1.);float ia=max(1.-age,0.);
        float a=pow(ia,2.2)*smoothstep(0.,0.6,s)*s*s*0.42;float core=pow(max(s,1e-4),10.)*pow(ia,4.)*0.8;
        vec3 c=uC*a+vec3(2.2,1.9,1.6)*core;c=min(c*uI,vec3(3.));gl_FragColor=vec4(c,1.);}`});
    this.mesh=new THREE.Mesh(g,this.mat);this.mesh.frustumCulled=false;this.mesh.renderOrder=5;scene.add(this.mesh);this.g=g;
  }
  push(b,t){if(this.n&&this.tip[0].distanceToSquared(t)<0.0009)return;this.base.unshift(b.clone());this.tip.unshift(t.clone());this.age.unshift(0);if(this.base.length>MAXS){this.base.pop();this.tip.pop();this.age.pop();}this.n=this.base.length;}
  // b,t = current blade base/tip in world space
  update(dt,b,t,active){
    for(let i=0;i<this.n;i++)this.age[i]+=dt;
    if(active&&this.n){// insert interpolated samples (quadratic through last two) to keep the arc round when the blade moves fast
      const d=this.tip[0].distanceTo(t);const k=Math.min(4,Math.floor(d/0.12));
      for(let s=1;s<=k;s++){const f=s/(k+1);const pb=this.base[0].clone().lerp(b,f),pt=this.tip[0].clone().lerp(t,f);
        if(this.n>1){const ext=this.tip[0].clone().sub(this.tip[1]);pt.addScaledVector(ext,f*(1-f)*0.5);}
        this.base.unshift(pb);this.tip.unshift(pt);this.age.unshift(dt*(1-f));}
      while(this.base.length>MAXS){this.base.pop();this.tip.pop();this.age.pop();}this.n=this.base.length;}
    if(active)this.push(b,t);
    while(this.n&&this.age[this.n-1]>this.life){this.base.pop();this.tip.pop();this.age.pop();this.n--;}
    const P=this.pos,T=this.attr;for(let i=0;i<MAXS;i++){const j=Math.min(i,Math.max(0,this.n-1));const bb=this.base[j],tt=this.tip[j];
      if(!bb){P.fill(0,i*6,i*6+6);continue;}
      // ribbon from 35% along the blade to the tip
      P[i*6]=bb.x+(tt.x-bb.x)*0.6;P[i*6+1]=bb.y+(tt.y-bb.y)*0.6;P[i*6+2]=bb.z+(tt.z-bb.z)*0.6;P[i*6+3]=tt.x;P[i*6+4]=tt.y;P[i*6+5]=tt.z;
      const age=Math.min(1,this.age[j]/this.life);T[i*4]=age;T[i*4+1]=0;T[i*4+2]=age;T[i*4+3]=1;}
    this.g.attributes.position.needsUpdate=true;this.g.attributes.aT.needsUpdate=true;
    this.g.setDrawRange(0,Math.max(0,this.n-1)*6);this.mesh.visible=this.n>1;
  }
  clear(){this.base=[];this.tip=[];this.age=[];this.n=0;this.mesh.visible=false;}
}
