import * as THREE from 'three';
export class Particles{
  constructor(max,additive,scene){
    this.max=max;this.i=0;
    const g=new THREE.BufferGeometry();
    this.pos=new Float32Array(max*3);this.col=new Float32Array(max*3);this.size=new Float32Array(max);this.alpha=new Float32Array(max);
    this.vel=new Float32Array(max*3);this.life=new Float32Array(max);this.ml=new Float32Array(max);this.grav=new Float32Array(max);this.drag=new Float32Array(max);
    this.s0=new Float32Array(max);this.s1=new Float32Array(max);this.a0=new Float32Array(max);this.c0=new Float32Array(max*3);this.c1=new Float32Array(max*3);this.floor=new Uint8Array(max);
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color',new THREE.BufferAttribute(this.col,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha',new THREE.BufferAttribute(this.alpha,1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms={uScale:{value:600},uSoft:{value:additive?1.6:2.5}};
    const m=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
      vertexShader:`attribute float size;attribute float alpha;attribute vec3 color;varying vec3 vC;varying float vA;uniform float uScale;
      void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=size*uScale/-mv.z;vC=color;vA=alpha;if(alpha<=0.001)gl_PointSize=0.;}`,
      fragmentShader:`varying vec3 vC;varying float vA;uniform float uSoft;void main(){float d=length(gl_PointCoord-.5)*2.;float a=pow(clamp(1.-d,0.,1.),uSoft);if(a*vA<0.003)discard;gl_FragColor=vec4(vC,a*vA);}`});
    this.points=new THREE.Points(g,m);this.points.frustumCulled=false;this.points.renderOrder=5;scene.add(this.points);this.geo=g;
  }
  emit(o){
    const i=this.i;this.i=(this.i+1)%this.max;
    this.pos[i*3]=o.x;this.pos[i*3+1]=o.y;this.pos[i*3+2]=o.z;
    this.vel[i*3]=o.vx||0;this.vel[i*3+1]=o.vy||0;this.vel[i*3+2]=o.vz||0;
    this.life[i]=this.ml[i]=o.life||1;this.grav[i]=o.grav||0;this.drag[i]=o.drag||0;
    this.s0[i]=o.size||0.2;this.s1[i]=o.size1!==undefined?o.size1:this.s0[i]*0.2;this.a0[i]=o.alpha!==undefined?o.alpha:1;
    const c=o.color,c1=o.color1||o.color;this.c0[i*3]=c[0];this.c0[i*3+1]=c[1];this.c0[i*3+2]=c[2];this.c1[i*3]=c1[0];this.c1[i*3+1]=c1[1];this.c1[i*3+2]=c1[2];
    this.floor[i]=o.floor?1:0;
  }
  update(dt){
    for(let i=0;i<this.max;i++){
      if(this.life[i]<=0){this.alpha[i]=0;continue;}
      this.life[i]-=dt;const t=1-Math.max(this.life[i],0)/this.ml[i];
      const dr=Math.max(0,1-this.drag[i]*dt);
      this.vel[i*3]*=dr;this.vel[i*3+1]=this.vel[i*3+1]*dr-this.grav[i]*dt;this.vel[i*3+2]*=dr;
      this.pos[i*3]+=this.vel[i*3]*dt;this.pos[i*3+1]+=this.vel[i*3+1]*dt;this.pos[i*3+2]+=this.vel[i*3+2]*dt;
      if(this.floor[i]&&this.pos[i*3+1]<0.03){this.pos[i*3+1]=0.03;this.vel[i*3+1]*=-0.25;this.vel[i*3]*=0.5;this.vel[i*3+2]*=0.5;}
      this.size[i]=this.s0[i]+(this.s1[i]-this.s0[i])*t;
      const fade=t<0.1?t/0.1:1-(t-0.1)/0.9;this.alpha[i]=this.a0[i]*Math.max(0,fade);
      for(let k=0;k<3;k++)this.col[i*3+k]=this.c0[i*3+k]+(this.c1[i*3+k]-this.c0[i*3+k])*t;
    }
    for(const k of ['position','color','size','alpha'])this.geo.attributes[k].needsUpdate=true;
  }
  clear(){this.life.fill(0);}
}
export function canvasTex(w,h,draw,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;}
export function bloodTex(rng){
  return canvasTex(256,256,(g,w,h)=>{
    g.translate(w/2,h/2);
    const blob=(x,y,r,a)=>{const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,`rgba(255,255,255,${a})`);gr.addColorStop(0.7,`rgba(255,255,255,${a*0.9})`);gr.addColorStop(1,'rgba(255,255,255,0)');g.fillStyle=gr;g.beginPath();g.arc(x,y,r,0,7);g.fill();};
    blob(0,0,60,1);for(let k=0;k<26;k++){const a=rng()*7,d=30+rng()*80;blob(Math.cos(a)*d,Math.sin(a)*d,4+rng()*18*(1-d/120),0.95);}
    for(let k=0;k<8;k++){const a=rng()*7;g.strokeStyle='rgba(255,255,255,.8)';g.lineWidth=3+rng()*5;g.lineCap='round';g.beginPath();g.moveTo(Math.cos(a)*40,Math.sin(a)*40);g.lineTo(Math.cos(a)*(70+rng()*50),Math.sin(a)*(70+rng()*50));g.stroke();}
  },false);
}
export function makeArcGeo(inner,outer,theta,seg=48){
  const p=[],u=[],idx=[];
  for(let s=0;s<=seg;s++){const t=s/seg,a=-theta/2+theta*t;for(const [r,v] of [[inner,0],[outer,1]]){p.push(Math.sin(a)*r,0,Math.cos(a)*r);u.push(t,v);}}
  for(let s=0;s<seg;s++){const a=s*2;idx.push(a,a+1,a+3,a,a+3,a+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(idx);return g;
}
export function slashMaterial(color,tail=0.75){
  return new THREE.ShaderMaterial({uniforms:{uP:{value:0},uTail:{value:tail},uColor:{value:new THREE.Color(...color)}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform float uP;uniform float uTail;uniform vec3 uColor;void main(){
    float head=uP*1.3;float t=vUv.x;float tail=pow(smoothstep(head-uTail,head,t),2.)*step(t,head);
    float edge=pow(vUv.y,5.0)*(1.-smoothstep(0.94,1.,vUv.y));
    float a=tail*edge*(1.-smoothstep(0.7,1.,uP));
    vec3 c=mix(uColor,vec3(2.6,2.3,2.0),pow(edge,6.));gl_FragColor=vec4(c,a*0.85);}`});
}
export function beamMaterial(color){
  return new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(...color)},uT:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uT;void main(){float x=abs(vUv.x-.5)*2.;float core=exp(-x*x*18.);float glow=exp(-x*x*3.)*.35;
  float v=pow(1.-vUv.y,1.6)*smoothstep(0.,.06,vUv.y);float fl=.85+.15*sin(uT*3.+vUv.y*10.);
  gl_FragColor=vec4(uColor*(core*2.+glow),(core+glow)*v*fl);}`});
}
export function ringMaterial(color){
  return new THREE.ShaderMaterial({uniforms:{uColor:{value:new THREE.Color(...color)},uA:{value:1},uFill:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
  vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`varying vec2 vUv;uniform vec3 uColor;uniform float uA;uniform float uFill;void main(){float d=length(vUv-.5)*2.;float ring=smoothstep(.86,.95,d)*(1.-smoothstep(.95,1.,d));
  float fill=step(d,uFill)*.35*smoothstep(0.,1.,d);gl_FragColor=vec4(uColor,(ring+fill)*uA);}`});
}
export function flareTex(){return canvasTex(64,64,(g,w)=>{const gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.25,'rgba(255,220,180,.55)');gr.addColorStop(1,'rgba(255,140,40,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);});}
