// Organic cave generator: noisy blob chambers linked by winding tunnels, smoothed with cellular automata.
// Collision/pathing stay on a 1 m grid; the render meshes come from a smoothed field (marching squares),
// so walls are irregular rock faces with displacement, never square rooms or grid corridors.
import * as THREE from 'three';
export const CELL=1, WALL_H=4.6;
// --- tiny value noise (deterministic) ---
function hash3(x,y,z){let h=(x*374761393+y*668265263+z*2147483647)|0;h=(h^(h>>>13))*1274126177|0;return ((h^(h>>>16))>>>0)/4294967295;}
function vnoise(x,y,z){const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z);const xf=x-xi,yf=y-yi,zf=z-zi;const u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),w=zf*zf*(3-2*zf);
  const L=(a,b,t)=>a+(b-a)*t;const h=(i,j,k)=>hash3(xi+i,yi+j,zi+k);
  return L(L(L(h(0,0,0),h(1,0,0),u),L(h(0,1,0),h(1,1,0),u),v),L(L(h(0,0,1),h(1,0,1),u),L(h(0,1,1),h(1,1,1),u),v),w);}
export function fbm(x,y,z,o=4){let a=0.5,s=0;for(let i=0;i<o;i++){s+=a*vnoise(x,y,z);x*=2.03;y*=2.03;z*=2.03;a*=0.5;}return s/(1-Math.pow(0.5,o));}
export function generate(rng,depth){
  const W=120,H=120,grid=new Uint8Array(W*H);const seedZ=Math.floor(rng()*1000);
  const carveDisc=(cx,cy,r)=>{for(let y=Math.floor(cy-r*1.4-1);y<=cy+r*1.4+1;y++)for(let x=Math.floor(cx-r*1.4-1);x<=cx+r*1.4+1;x++){if(x<3||y<3||x>W-4||y>H-4)continue;const re=r*(0.6+0.85*fbm(x*0.13,y*0.13,seedZ+11,2));if((x+0.5-cx)**2+(y+0.5-cy)**2<=re*re)grid[y*W+x]=1;}};
  const flip=rng()<0.5;
  const rooms=[];
  const start={cx:flip?W-14:14,cy:14,r:5.5,kind:'start'};const boss={cx:flip?25:W-26,cy:H-25,r:11,kind:'boss'};
  rooms.push(start,boss);
  for(let t=0;t<900&&rooms.length<13;t++){const rr=5+rng()*4.5,mg=rr*1.9+4;const r={cx:mg+rng()*(W-2*mg),cy:mg+rng()*(H-2*mg),r:rr,kind:'normal'};
    if(rooms.some(o=>Math.hypot(o.cx-r.cx,o.cy-r.cy)<o.r+r.r+7))continue;rooms.push(r);}
  // blob chambers: radius modulated by angular noise
  for(const r of rooms){const ph=rng()*100;for(let y=Math.floor(r.cy-r.r*2.1);y<=r.cy+r.r*2.1;y++)for(let x=Math.floor(r.cx-r.r*2.1);x<=r.cx+r.r*2.1;x++){
      if(x<3||y<3||x>W-4||y>H-4)continue;const dx=x+0.5-r.cx,dy=y+0.5-r.cy;const a=Math.atan2(dy,dx);
      const R=r.r*(0.78+0.5*fbm(Math.cos(a)*1.6+ph,Math.sin(a)*1.6+ph,seedZ,3))*(1+0.18*Math.sin(a*2+ph));
      if(dx*dx/(1.15*1.15)+dy*dy<R*R)grid[y*W+x]=1;}}
  const others=rooms.filter(r=>r.kind==='normal');const order=[start];let cur=start;const left=[...others];
  while(left.length){left.sort((a,b)=>Math.hypot(a.cx-cur.cx,a.cy-cur.cy)-Math.hypot(b.cx-cur.cx,b.cy-cur.cy));cur=left.shift();order.push(cur);}
  order.push(boss);
  // winding tunnel: a meandering curve between chamber centres with varying width
  const tunnel=(a,b)=>{const dx=b.cx-a.cx,dy=b.cy-a.cy,L=Math.hypot(dx,dy);const nx=-dy/L,ny=dx/L;const ph=rng()*50,amp=2+rng()*4,freq=0.8+rng()*1.2;
    const n=Math.ceil(L*2);for(let k=0;k<=n;k++){const t=k/n;const env=Math.sin(Math.PI*t);
      const off=env*(amp*Math.sin(t*Math.PI*2*freq+ph)+1.6*Math.sin(t*L*0.33+ph*1.7)+4*(fbm(t*L*0.08+ph,ph,seedZ,2)-0.5));
      const w=1.55+1.0*fbm(t*4+ph,7.3,seedZ,2);carveDisc(a.cx+dx*t+nx*off,a.cy+dy*t+ny*off,w);}};
  for(let i=0;i<order.length-1;i++)tunnel(order[i],order[i+1]);
  for(let k=0;k<2&&order.length>4;k++){const a=order[1+Math.floor(rng()*(order.length-3))],b=order[1+Math.floor(rng()*(order.length-3))];if(a!==b)tunnel(a,b);}
  // cellular automata smoothing (4-5 rule) keeps shapes organic
  for(let pass=0;pass<3;pass++){const g2=grid.slice();for(let y=2;y<H-2;y++)for(let x=2;x<W-2;x++){let n=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)if(i||j)n+=grid[(y+j)*W+x+i];
      if(grid[y*W+x])g2[y*W+x]=n>=3?1:0;else g2[y*W+x]=n>=5?1:0;}grid.set(g2);}
  // keep only the region connected to the start
  const s0=Math.floor(start.cy)*W+Math.floor(start.cx);grid[s0]=1;const seen=new Uint8Array(W*H);const q=[s0];seen[s0]=1;
  while(q.length){const c=q.pop();const x=c%W,y=(c/W)|0;for(const [i,j] of [[1,0],[-1,0],[0,1],[0,-1]]){const n=(y+j)*W+x+i;if(grid[n]&&!seen[n]){seen[n]=1;q.push(n);}}}
  for(let i=0;i<W*H;i++)if(!seen[i])grid[i]=0;
  // chamber cell lists (for spawning) + bounding boxes for legacy code
  for(const r of rooms){r.cells=[];for(let y=Math.floor(r.cy-r.r);y<=r.cy+r.r;y++)for(let x=Math.floor(r.cx-r.r);x<=r.cx+r.r;x++){if(x>=0&&y>=0&&x<W&&y<H&&grid[y*W+x]&&Math.hypot(x+0.5-r.cx,y+0.5-r.cy)<r.r*0.8)r.cells.push([x,y]);}
    r.x=Math.floor(r.cx-r.r);r.y=Math.floor(r.cy-r.r);r.w=r.h=Math.ceil(r.r*2);}
  return {W,H,grid,rooms,order,start,boss,seedZ};
}
export function isFloor(d,i,j){return i>=0&&j>=0&&i<d.W&&j<d.H&&d.grid[j*d.W+i]===1;}
export const toCell=v=>Math.floor(v/CELL);
export const cellCenter=i=>i*CELL+CELL/2;
export function walkable(d,x,z,r){
  return isFloor(d,toCell(x-r),toCell(z-r))&&isFloor(d,toCell(x+r),toCell(z-r))&&isFloor(d,toCell(x-r),toCell(z+r))&&isFloor(d,toCell(x+r),toCell(z+r));
}
export function los(d,ax,az,bx,bz,r=0.3){const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),n=Math.ceil(len/0.4);for(let k=1;k<n;k++){const t=k/n;if(!walkable(d,ax+dx*t,az+dz*t,r))return false;}return true;}
export function findPath(d,sx,sz,tx,tz){
  const W=d.W,si=toCell(sx),sj=toCell(sz);let ti=toCell(tx),tj=toCell(tz);
  if(!isFloor(d,ti,tj)){let best=null,bd=1e9;for(let j=tj-4;j<=tj+4;j++)for(let i=ti-4;i<=ti+4;i++)if(isFloor(d,i,j)){const dd=(i-ti)**2+(j-tj)**2;if(dd<bd){bd=dd;best=[i,j];}}if(!best)return null;[ti,tj]=best;}
  const N=W*d.H,g=new Float32Array(N).fill(1e9),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const heap=[];const push=(n,f)=>{heap.push([f,n]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top[1];};
  const s=sj*W+si,t=tj*W+ti;if(!isFloor(d,si,sj))return null;g[s]=0;push(s,0);let it=0;
  // wall clearance penalty keeps paths in the middle of tunnels
  const near=(i,j)=>(isFloor(d,i+1,j)?0:1)+(isFloor(d,i-1,j)?0:1)+(isFloor(d,i,j+1)?0:1)+(isFloor(d,i,j-1)?0:1);
  while(heap.length&&it++<16000){const c=pop();if(c===t)break;if(closed[c])continue;closed[c]=1;const ci=c%W,cj=(c/W)|0;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ni=ci+di,nj=cj+dj;if(!isFloor(d,ni,nj))continue;if(di&&dj&&(!isFloor(d,ci+di,cj)||!isFloor(d,ci,cj+dj)))continue;
      const n=nj*W+ni;const ng=g[c]+(di&&dj?1.414:1)+near(ni,nj)*0.6;if(ng<g[n]){g[n]=ng;came[n]=c;push(n,ng+Math.hypot(ni-ti,nj-tj));}}}
  if(came[t]<0&&t!==s)return null;
  const pts=[];let n=t;while(n!==s&&n>=0){pts.push(new THREE.Vector3(cellCenter(n%W),0,cellCenter((n/W)|0)));n=came[n];}
  pts.reverse();
  // string-pull: drop points that are in direct line of sight
  const out=[];let a=new THREE.Vector3(sx,0,sz);for(let k=0;k<pts.length;k++){const nx=pts[k+1];if(nx&&los(d,a.x,a.z,nx.x,nx.z,0.35))continue;out.push(pts[k]);a=pts[k];}
  if(out.length)out[out.length-1].set(tx,0,tz);if(!isFloor(d,toCell(tx),toCell(tz))&&out.length)out.pop();
  return out;
}
// ---------- geometry ----------
const RINGS=[-0.05,0.35,0.9,1.6,2.4,3.2,3.9,4.6];
// walls between the floor and the (south-side) camera are kept low so they never hide the action
export function hMul(nz){if(nz>=0)return 1;const t=Math.min(1,-nz/0.75);return 1-0.74*t*t*(3-2*t);}
// world-space wall surface point for contour point p (x,z) with inward normal n at height y
export function wallOffset(x,z,y,seedZ){
  const bul=fbm(x*0.32,y*0.45,z*0.32+seedZ,3);const t=y/WALL_H;
  // lower wall: slightly concave; mid: bulging boulders; top: recedes so the top-down camera sees the floor
  return (bul-0.5)*1.3 - t*t*1.6 - 0.15 + (y<0.2?0.35:0);
}
export function buildGeometry(d){
  const W=d.W,H=d.H;
  // smoothed occupancy field
  let f=new Float32Array(W*H);for(let i=0;i<W*H;i++)f[i]=d.grid[i];
  for(let p=0;p<2;p++){const g=new Float32Array(W*H);for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){let s=0;for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)s+=f[(y+j)*W+x+i]*((i&&j)?0.5:1);g[y*W+x]=s/6;}f=g;}
  const F=(x,z)=>{const u=x-0.5,v=z-0.5;const i=Math.floor(u),j=Math.floor(v);const a=u-i,b=v-j;const g=(i,j)=>(i<0||j<0||i>=W||j>=H)?0:f[j*W+i];
    return (g(i,j)*(1-a)+g(i+1,j)*a)*(1-b)+(g(i,j+1)*(1-a)+g(i+1,j+1)*a)*b;};
  const ISO=0.5,hs=0.5,NX=Math.round(W/hs),NZ=Math.round(H/hs);
  const val=new Float32Array((NX+1)*(NZ+1));for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++)val[j*(NX+1)+i]=F(i*hs,j*hs);
  const V=(i,j)=>val[j*(NX+1)+i];
  // marching squares -> segments between edge points; edge key = unique id
  const pt=new Map();const ekey=(i,j,dir)=>(j*(NX+1)+i)*2+dir;// dir 0: horizontal edge (i,j)-(i+1,j); 1: vertical (i,j)-(i,j+1)
  const getP=(i,j,dir)=>{const k=ekey(i,j,dir);let p=pt.get(k);if(p)return k;const a=V(i,j),b=dir?V(i,j+1):V(i+1,j);const t=(ISO-a)/(b-a);
    const x=(i+(dir?0:t))*hs,z=(j+(dir?t:0))*hs;const e=0.05;const gx=F(x+e,z)-F(x-e,z),gz=F(x,z+e)-F(x,z-e);const gl=Math.hypot(gx,gz)||1;
    pt.set(k,{x,z,nx:gx/gl,nz:gz/gl,adj:[]});return k;};
  const segs=[];
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){const a=V(i,j)>ISO,b=V(i+1,j)>ISO,c=V(i+1,j+1)>ISO,dd=V(i,j+1)>ISO;const code=(a?1:0)|(b?2:0)|(c?4:0)|(dd?8:0);if(code===0||code===15)continue;
    const T=()=>getP(i,j,0),R=()=>getP(i+1,j,1),B=()=>getP(i,j+1,0),L=()=>getP(i,j,1);
    const add=(p,q)=>{segs.push([p,q]);pt.get(p).adj.push(q);pt.get(q).adj.push(p);};
    switch(code){case 1:case 14:add(L(),T());break;case 2:case 13:add(T(),R());break;case 3:case 12:add(L(),R());break;case 4:case 11:add(R(),B());break;
      case 6:case 9:add(T(),B());break;case 7:case 8:add(L(),B());break;case 5:add(L(),T());add(R(),B());break;case 10:add(T(),R());add(B(),L());break;}}
  // chain into loops for continuous UVs
  const used=new Set();const loops=[];
  for(const [k0] of pt){if(used.has(k0))continue;const loop=[k0];used.add(k0);let prev=-1,cur=k0;
    for(;;){const p=pt.get(cur);const nx=p.adj.find(q=>q!==prev&&!used.has(q));if(nx===undefined)break;loop.push(nx);used.add(nx);prev=cur;cur=nx;}
    const closed=pt.get(cur).adj.includes(k0)&&loop.length>2;loops.push({ids:loop,closed});}
  // walls
  const wp=[],wu=[],wc=[],wi=[];const torchSpots=[];
  for(const L of loops){const ids=L.closed?[...L.ids,L.ids[0]]:L.ids;let s=0;const base=wp.length/3;let px=null,pz=null;
    for(let m=0;m<ids.length;m++){const p=pt.get(ids[m]);if(px!==null)s+=Math.hypot(p.x-px,p.z-pz);px=p.x;pz=p.z;
      const hm=hMul(p.nz);for(let k=0;k<RINGS.length;k++){const y=RINGS[k]*hm;const o=wallOffset(p.x,p.z,RINGS[k],d.seedZ)*(0.5+0.5*hm);
        // n points toward the floor (increasing field)
        wp.push(p.x+p.nx*o,y+(k===RINGS.length-1?(fbm(p.x*0.3,9,p.z*0.3)-0.5)*1.2*hm:0),p.z+p.nz*o);wu.push(s/2.2,y/2.2);
        const sh=k===0?0.25:k===1?0.55:k<4?0.9:k<RINGS.length-1?0.8:0.35;wc.push(sh,sh,sh);}
      if(m>0){const a=base+(m-1)*RINGS.length,b=base+m*RINGS.length;for(let k=0;k<RINGS.length-1;k++)wi.push(a+k,b+k,b+k+1,a+k,b+k+1,a+k+1);}
      if(m%5===0)torchSpots.push({x:p.x,z:p.z,nx:p.nx,nz:p.nz,hm});}}
  const walls=new THREE.BufferGeometry();walls.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));walls.setAttribute('uv',new THREE.Float32BufferAttribute(wu,2));walls.setAttribute('color',new THREE.Float32BufferAttribute(wc,3));walls.setIndex(wi);
  walls.computeVertexNormals();orientToward(walls,d,F);
  // floor: uneven grid mesh where field > 0.18 (tucks under the walls)
  const fp=[],fu=[],fc=[],fi=[];const vid=new Int32Array((NX+1)*(NZ+1)).fill(-1);
  const fv=(i,j)=>{const k=j*(NX+1)+i;if(vid[k]>=0)return vid[k];const x=i*hs,z=j*hs;const v=V(i,j);const n=fbm(x*0.25,3.7,z*0.25);
    const y=(n-0.5)*0.12-(1-Math.min(1,v*1.6))*0.25;fp.push(x,y,z);fu.push(x/3.2,z/3.2);const ao=0.35+0.65*Math.min(1,Math.max(0,(v-0.35)*2.2));fc.push(ao,ao,ao);return vid[k]=fp.length/3-1;};
  for(let j=0;j<NZ;j++)for(let i=0;i<NX;i++){if(Math.max(V(i,j),V(i+1,j),V(i,j+1),V(i+1,j+1))<0.18)continue;const a=fv(i,j),b=fv(i+1,j),c=fv(i+1,j+1),e=fv(i,j+1);fi.push(a,e,c,a,c,b);}
  const floor=new THREE.BufferGeometry();floor.setAttribute('position',new THREE.Float32BufferAttribute(fp,3));floor.setAttribute('uv',new THREE.Float32BufferAttribute(fu,2));floor.setAttribute('color',new THREE.Float32BufferAttribute(fc,3));floor.setIndex(fi);floor.computeVertexNormals();
  // rock mass on top of the walls (where field < 0.5, within reach of the cave)
  const cp=[],cu=[],cc=[],ci=[];const cid=new Int32Array((NX+1)*(NZ+1)).fill(-1);
  const cv=(i,j)=>{const k=j*(NX+1)+i;if(cid[k]>=0)return cid[k];const x=i*hs,z=j*hs;const n=fbm(x*0.18,1.3,z*0.18);cp.push(x,WALL_H-0.1+(n-0.5)*1.4,z);cu.push(x/4,z/4);const sh=0.18+0.25*n;cc.push(sh,sh,sh);return cid[k]=cp.length/3-1;};
  const reach=new Uint8Array((NX+1)*(NZ+1));for(let j=0;j<=NZ;j++)for(let i=0;i<=NX;i++){if(V(i,j)>0.02){for(let dj=-6;dj<=6;dj++)for(let di=-6;di<=6;di++){const a=i+di,b=j+dj;if(a>=0&&b>=0&&a<=NX&&b<=NZ)reach[b*(NX+1)+a]=1;}}}
  for(let j=0;j<NZ;j+=2)for(let i=0;i<NX;i+=2){const i2=Math.min(NX,i+2),j2=Math.min(NZ,j+2);if(!reach[j*(NX+1)+i])continue;if(Math.max(V(i,j),V(i2,j),V(i,j2),V(i2,j2))>0.3)continue;
    const a=cv(i,j),b=cv(i2,j),c=cv(i2,j2),e=cv(i,j2);ci.push(a,e,c,a,c,b);}
  const caps=new THREE.BufferGeometry();caps.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));caps.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2));caps.setAttribute('color',new THREE.Float32BufferAttribute(cc,3));caps.setIndex(ci);caps.computeVertexNormals();
  const loopsXZ=loops.map(L=>({closed:L.closed,pts:L.ids.map(k=>{const p=pt.get(k);return [p.x,p.z];})}));
  return {floor,walls,caps,faces:torchSpots,loops:loopsXZ,F};
}
function orientToward(geo,d,F){// make wall triangles face the floor side
  const p=geo.attributes.position,idx=geo.index.array;const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();let flip=0,keep=0;
  for(let t=0;t<idx.length;t+=3){a.fromBufferAttribute(p,idx[t]);b.fromBufferAttribute(p,idx[t+1]);c.fromBufferAttribute(p,idx[t+2]);const n=b.clone().sub(a).cross(c.clone().sub(a));
    const m=a.clone().add(b).add(c).multiplyScalar(1/3);const e=0.3;const gx=F(m.x+e,m.z)-F(m.x-e,m.z),gz=F(m.x,m.z+e)-F(m.x,m.z-e);
    if(n.x*gx+n.z*gz<0){const tmp=idx[t+1];idx[t+1]=idx[t+2];idx[t+2]=tmp;flip++;}else keep++;}
  geo.index.needsUpdate=true;geo.computeVertexNormals();
}
