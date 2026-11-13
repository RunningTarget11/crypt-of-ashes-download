import * as THREE from 'three';
const NOISE=`
float hsh(vec3 p){p=fract(p*0.3183099+.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vnoise(vec3 x){vec3 i=floor(x);vec3 f=fract(x);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hsh(i+vec3(0,0,0)),hsh(i+vec3(1,0,0)),f.x),mix(hsh(i+vec3(0,1,0)),hsh(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hsh(i+vec3(0,0,1)),hsh(i+vec3(1,0,1)),f.x),mix(hsh(i+vec3(0,1,1)),hsh(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p*=2.03;a*=.5;}return s;}
vec3 perturbN(vec3 surf_pos,vec3 surf_norm,vec2 dHdxy,float fd){vec3 sx=dFdx(surf_pos);vec3 sy=dFdy(surf_pos);vec3 R1=cross(sy,surf_norm);vec3 R2=cross(surf_norm,sx);float det=dot(sx,R1)*fd;vec3 g=sign(det)*(dHdxy.x*R1+dHdxy.y*R2);return normalize(abs(det)*surf_norm-g);}
`;
export const charTime={value:0};
// opts: color, metalness, roughness, roughVar, dirt, bump, freq, crack:[r,g,b] or null, crackW, emissive
export function charMaterial(o,invH){
  const m=new THREE.MeshStandardMaterial({color:o.color,metalness:o.metalness??0,roughness:o.roughness??0.6,emissive:o.emissive??0x000000,emissiveIntensity:o.emissiveIntensity??1});
  const u={uNS:{value:(o.freq??10)*invH},uRV:{value:o.roughVar??0.3},uDirt:{value:o.dirt??0.4},uBump:{value:o.bump??0.02},uCrack:{value:new THREE.Color(...(o.crack||[0,0,0]))},uCW:{value:o.crackW??0.03},uCK:{value:o.crack?1:0},uT:charTime,uRim:{value:new THREE.Color(...(o.rim||[0.05,0.045,0.04]))}};
  m.onBeforeCompile=sh=>{
    Object.assign(sh.uniforms,u);
    sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uNS;varying vec3 vOP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvOP=position*uNS;');
    sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uRV,uDirt,uBump,uCW,uT,uCK;uniform vec3 uCrack;uniform vec3 uRim;varying vec3 vOP;'+NOISE)
     .replace('#include <color_fragment>','#include <color_fragment>\nfloat nA=fbm(vOP);float nB=fbm(vOP*3.7+7.1);float nC=fbm(vOP*0.6+3.3);\ndiffuseColor.rgb*=mix(1.0-uDirt,1.0+uDirt*0.3,smoothstep(.25,.75,nC))*(0.93+0.14*nB);')
     .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+(nB-.5)*uRV*2.0+(1.0-smoothstep(.3,.7,nC))*uRV*.5,0.06,1.0);')
     .replace('#include <normal_fragment_maps>','#include <normal_fragment_maps>\nfloat hgt=nA*0.6+nB*0.4;float crk=uCK*(1.0-smoothstep(0.0,uCW,abs(nA-0.5)));hgt-=crk*0.5;\nnormal=perturbN(-vViewPosition,normal,vec2(dFdx(hgt),dFdy(hgt))*uBump*50.0,faceDirection);')
     .replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=uCrack*crk*(0.75+0.25*sin(uT*2.0+nC*12.0));diffuseColor.rgb*=1.0-crk*0.8;\n{float fr=pow(1.0-clamp(dot(normal,normalize(vViewPosition)),0.0,1.0),3.0);totalEmissiveRadiance+=uRim*fr;}');
  };
  m.customProgramCacheKey=()=>'charmat';
  return m;
}
