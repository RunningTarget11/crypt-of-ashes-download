import * as THREE from 'three';
export const CELL=2, WALL_H=3.6;
export function generate(rng,depth){
  const W=58,H=58,grid=new Uint8Array(W*H);
  const ri=(a,b)=>a+Math.floor(rng()*(b-a+1));
  const rooms=[];
  const overlaps=(r)=>rooms.some(o=>r.x<o.x+o.w+3&&r.x+r.w+3>o.x&&r.y<o.y+o.h+3&&r.y+r.h+3>o.y);
  // start room top-left-ish, boss bottom-right-ish (or flipped)
  const flip=rng()<0.5;
  const start={x:flip?W-12:3,y:3,w:7,h:7,kind:'start'};
  const boss={x:flip?3:W-15,y:H-15,w:12,h:12,kind:'boss'};
  rooms.push(start,boss);
  for(let t=0;t<600&&rooms.length<11;t++){
    const r={x:ri(2,W-12),y:ri(2,H-12),w:ri(6,10),h:ri(6,10),kind:'normal'};
    if(r.x+r.w>=W-2||r.y+r.h>=H-2)continue;
    if(!overlaps(r))rooms.push(r);
  }
  const cx=r=>r.x+(r.w>>1), cy=r=>r.y+(r.h>>1);
  const carve=(x,y)=>{if(x>0&&y>0&&x<W-1&&y<H-1)grid[y*W+x]=1;};
  for(const r of rooms)for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++)carve(x,y);
  // order: start, others by distance from start, boss last
  const others=rooms.filter(r=>r.kind==='normal');
  // nearest-neighbour chain
  const order=[start];let cur=start;const left=[...others];
  while(left.length){left.sort((a,b)=>Math.hypot(cx(a)-cx(cur),cy(a)-cy(cur))-Math.hypot(cx(b)-cx(cur),cy(b)-cy(cur)));cur=left.shift();order.push(cur);}
  order.push(boss);
  const corridor=(a,b)=>{
    let x=cx(a),y=cy(a);const tx=cx(b),ty=cy(b);const hFirst=rng()<0.5;
    const stepX=()=>{while(x!==tx){x+=Math.sign(tx-x);carve(x,y);carve(x,y+1);}};
    const stepY=()=>{while(y!==ty){y+=Math.sign(ty-y);carve(x,y);carve(x+1,y);}};
    if(hFirst){stepX();stepY();}else{stepY();stepX();}
  };
  for(let i=0;i<order.length-1;i++)corridor(order[i],order[i+1]);
  // a couple of loops
  for(let k=0;k<2&&order.length>4;k++){const a=order[1+Math.floor(rng()*(order.length-3))],b=order[1+Math.floor(rng()*(order.length-3))];if(a!==b)corridor(a,b);}
  // remove 1-cell-thick wall slivers (improves look)
  for(let pass=0;pass<2;pass++)for(let y=1;y<H-1;y++)for(let x=1;x<W-1;x++){
    if(grid[y*W+x])continue;
    const l=grid[y*W+x-1],r=grid[y*W+x+1],u=grid[(y-1)*W+x],d=grid[(y+1)*W+x];
    if((l&&r)||(u&&d))grid[y*W+x]=1;
  }
  return {W,H,grid,rooms,order,start,boss};
}
export function isFloor(d,i,j){return i>=0&&j>=0&&i<d.W&&j<d.H&&d.grid[j*d.W+i]===1;}
export const toCell=v=>Math.floor(v/CELL);
export const cellCenter=i=>i*CELL+CELL/2;
export function walkable(d,x,z,r){
  return isFloor(d,toCell(x-r),toCell(z-r))&&isFloor(d,toCell(x+r),toCell(z-r))&&isFloor(d,toCell(x-r),toCell(z+r))&&isFloor(d,toCell(x+r),toCell(z+r));
}
export function los(d,ax,az,bx,bz,r=0.3){
  const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz),n=Math.ceil(len/0.4);
  for(let k=1;k<n;k++){const t=k/n;if(!walkable(d,ax+dx*t,az+dz*t,r))return false;}
  return true;
}
export function findPath(d,sx,sz,tx,tz){
  const W=d.W,si=toCell(sx),sj=toCell(sz);let ti=toCell(tx),tj=toCell(tz);
  if(!isFloor(d,ti,tj)){ // nearest floor cell
    let best=null,bd=1e9;for(let j=tj-3;j<=tj+3;j++)for(let i=ti-3;i<=ti+3;i++)if(isFloor(d,i,j)){const dd=(i-ti)**2+(j-tj)**2;if(dd<bd){bd=dd;best=[i,j];}}
    if(!best)return null;[ti,tj]=best;
  }
  const N=W*d.H,g=new Float32Array(N).fill(1e9),came=new Int32Array(N).fill(-1),closed=new Uint8Array(N);
  const heap=[];const push=(n,f)=>{heap.push([f,n]);let i=heap.length-1;while(i>0){const p=(i-1)>>1;if(heap[p][0]<=heap[i][0])break;[heap[p],heap[i]]=[heap[i],heap[p]];i=p;}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let i=0;for(;;){const l=2*i+1,r=l+1;let m=i;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===i)break;[heap[m],heap[i]]=[heap[i],heap[m]];i=m;}}return top[1];};
  const h=(i,j)=>{const a=Math.abs(i-ti),b=Math.abs(j-tj);return (a+b)+(1.414-2)*Math.min(a,b);};
  const s=sj*W+si,t=tj*W+ti;g[s]=0;push(s,h(si,sj));let iter=0;
  while(heap.length&&iter++<6000){
    const n=pop();if(n===t)break;if(closed[n])continue;closed[n]=1;
    const i=n%W,j=(n/W)|0;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){
      if(!di&&!dj)continue;const ni=i+di,nj=j+dj;if(!isFloor(d,ni,nj))continue;
      if(di&&dj&&(!isFloor(d,i+di,j)||!isFloor(d,i,j+dj)))continue;
      const nn=nj*W+ni,ng=g[n]+(di&&dj?1.414:1);
      if(ng<g[nn]){g[nn]=ng;came[nn]=n;push(nn,ng+h(ni,nj));}
    }
  }
  if(came[t]<0&&t!==s)return null;
  const pts=[];let n=t;while(n!==s&&n>=0){pts.push(new THREE.Vector3(cellCenter(n%W),0,cellCenter((n/W)|0)));n=came[n];}
  pts.reverse();if(pts.length)pts[pts.length-1].set(tx,0,tz);
  if(!isFloor(d,toCell(tx),toCell(tz))&&pts.length)pts.pop();
  return pts;
}
// ---------- geometry ----------
export function buildGeometry(d){
  const W=d.W,H=d.H;
  // floor with corner AO
  const fp=[],fn=[],fu=[],fc=[],fi=[];
  const cornerAO=(x,y)=>{let w=0;for(const [a,b] of [[x-1,y-1],[x,y-1],[x-1,y],[x,y]])if(!isFloor(d,a,b))w++;return w?0.42:1;};
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    if(!isFloor(d,i,j))continue;
    const b=fp.length/3;
    for(const [ci,cj] of [[i,j],[i+1,j],[i+1,j+1],[i,j+1]]){
      fp.push(ci*CELL,0,cj*CELL);fn.push(0,1,0);fu.push(ci*CELL/3,cj*CELL/3);const a=cornerAO(ci,cj);fc.push(a,a,a);
    }
    fi.push(b,b+2,b+1,b,b+3,b+2);
  }
  const floor=new THREE.BufferGeometry();
  floor.setAttribute('position',new THREE.Float32BufferAttribute(fp,3));floor.setAttribute('normal',new THREE.Float32BufferAttribute(fn,3));
  floor.setAttribute('uv',new THREE.Float32BufferAttribute(fu,2));floor.setAttribute('color',new THREE.Float32BufferAttribute(fc,3));floor.setIndex(fi);
  // walls: vertical quads facing into floor cells, split for bottom AO gradient
  const wp=[],wn=[],wu=[],wc=[],wi=[];const faces=[];
  const hs=[0,0.5,1.4,WALL_H-0.25,WALL_H],shade=[0.35,0.7,1,1,0.75];
  const addWall=(x0,z0,x1,z1,nx,nz)=>{
    const b=wp.length/3;const len=Math.hypot(x1-x0,z1-z0);
    const u0=(x0+z0)/4,u1=u0+len/4*Math.sign((x1-x0)+(z1-z0));
    for(let k=0;k<hs.length;k++){
      wp.push(x0,hs[k],z0,x1,hs[k],z1);wn.push(nx,0,nz,nx,0,nz);wu.push(u0,hs[k]/4,u1,hs[k]/4);wc.push(shade[k],shade[k],shade[k],shade[k],shade[k],shade[k]);
    }
    for(let k=0;k<hs.length-1;k++){const a=b+k*2;wi.push(a,a+1,a+3,a,a+3,a+2);}
  };
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    if(!isFloor(d,i,j))continue;
    const x=i*CELL,z=j*CELL;
    if(!isFloor(d,i,j-1)){addWall(x,z,x+CELL,z,0,1);faces.push({i,j,side:'n',x:x+CELL/2,z:z,nx:0,nz:1});}
    if(!isFloor(d,i,j+1)){addWall(x+CELL,z+CELL,x,z+CELL,0,-1);faces.push({i,j,side:'s',x:x+CELL/2,z:z+CELL,nx:0,nz:-1});}
    if(!isFloor(d,i-1,j)){addWall(x,z+CELL,x,z,1,0);faces.push({i,j,side:'w',x:x,z:z+CELL/2,nx:1,nz:0});}
    if(!isFloor(d,i+1,j)){addWall(x+CELL,z,x+CELL,z+CELL,-1,0);faces.push({i,j,side:'e',x:x+CELL,z:z+CELL/2,nx:-1,nz:0});}
  }
  // fix winding: ensure triangles face along normal
  const walls=new THREE.BufferGeometry();
  walls.setAttribute('position',new THREE.Float32BufferAttribute(wp,3));walls.setAttribute('normal',new THREE.Float32BufferAttribute(wn,3));
  walls.setAttribute('uv',new THREE.Float32BufferAttribute(wu,2));walls.setAttribute('color',new THREE.Float32BufferAttribute(wc,3));walls.setIndex(wi);
  fixWinding(walls);fixWinding(floor);
  // wall caps on wall cells adjacent to floor
  const cp=[],ci=[],cu=[];
  for(let j=0;j<H;j++)for(let i=0;i<W;i++){
    if(isFloor(d,i,j))continue;let adj=false;
    for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++)if(isFloor(d,i+di,j+dj))adj=true;
    if(!adj)continue;const b=cp.length/3,x=i*CELL,z=j*CELL;
    cp.push(x,WALL_H,z,x+CELL,WALL_H,z,x+CELL,WALL_H,z+CELL,x,WALL_H,z+CELL);cu.push(x/4,z/4,(x+CELL)/4,z/4,(x+CELL)/4,(z+CELL)/4,x/4,(z+CELL)/4);ci.push(b,b+2,b+1,b,b+3,b+2);
  }
  const caps=new THREE.BufferGeometry();caps.setAttribute('position',new THREE.Float32BufferAttribute(cp,3));caps.setAttribute('uv',new THREE.Float32BufferAttribute(cu,2));caps.setIndex(ci);caps.computeVertexNormals();
  fixWinding(caps,new THREE.Vector3(0,1,0));
  return {floor,walls,caps,faces};
}
function fixWinding(geo,forceN){
  const p=geo.attributes.position,n=geo.attributes.normal,idx=geo.index.array;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),nn=new THREE.Vector3();
  for(let t=0;t<idx.length;t+=3){
    a.fromBufferAttribute(p,idx[t]);b.fromBufferAttribute(p,idx[t+1]);c.fromBufferAttribute(p,idx[t+2]);
    const fn=b.sub(a).cross(c.sub(a));
    if(forceN)nn.copy(forceN);else nn.fromBufferAttribute(n,idx[t]);
    if(fn.dot(nn)<0){const tmp=idx[t+1];idx[t+1]=idx[t+2];idx[t+2]=tmp;}
  }
  geo.index.needsUpdate=true;
}
