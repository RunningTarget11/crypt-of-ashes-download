// Cave generation test across 6 seeds: chambers must be blob-shaped (rectangularity < 0.88; a square room = 1.0),
// no straight axis-aligned wall run >= 9m on the 0.5m contour (the smallest square room would have 10m+ sides;
// rendered walls are additionally displaced by fbm noise), and every floor cell reachable from the start.
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:960,height:540}});const errs=[];page.on('pageerror',e=>errs.push(e.message));page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt&desktop');await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:180000});
const r=await page.evaluate(()=>{const T=__TEST;const out=[];
  for(let s=0;s<6;s++){T.G.seed=100+s*7;T.buildLevel();const D=T.D();
    // rectangularity of each chamber: floor cells within 1.4r of the centre vs. their bounding box (a square room -> ~1.0, a blob -> ~0.7)
    const fills=D.rooms.map(rm=>{let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,n=0;const R=rm.r*1.4;for(let y=Math.floor(rm.cy-R);y<=rm.cy+R;y++)for(let x=Math.floor(rm.cx-R);x<=rm.cx+R;x++){if(x<0||y<0||x>=D.W||y>=D.H||!D.grid[y*D.W+x])continue;if(Math.hypot(x+0.5-rm.cx,y+0.5-rm.cy)>R)continue;n++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}return n/((x1-x0+1)*(y1-y0+1));});
    // longest straight axis-aligned wall run in the contour loops (a square room would give a long one)
    let run=0;for(const L of D.loops){const p=L.pts;let cur=0,dir=null;for(let i=1;i<p.length;i++){const dx=p[i][0]-p[i-1][0],dz=p[i][1]-p[i-1][1];const d=Math.abs(dx)<1e-6?'v':Math.abs(dz)<1e-6?'h':null;const len=Math.hypot(dx,dz);if(d&&d===dir)cur+=len;else cur=d?len:0;dir=d;run=Math.max(run,cur);}}
    // connectivity: flood fill from start covers all floor
    const W=D.W,H=D.H,seen=new Uint8Array(W*H);const st=[[Math.floor(D.start.cx),Math.floor(D.start.cy)]];let n=0,tot=0;for(const v of D.grid)tot+=v?1:0;
    while(st.length){const [x,y]=st.pop();if(x<0||y<0||x>=W||y>=H)continue;const i=y*W+x;if(seen[i]||!D.grid[i])continue;seen[i]=1;n++;st.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);}
    out.push({seed:T.G.seed,rooms:D.rooms.length,maxRoomFill:+Math.max(...fills).toFixed(2),meanRoomFill:+(fills.reduce((a,b)=>a+b,0)/fills.length).toFixed(2),longestStraightWallM:+run.toFixed(1),connected:n===tot});}
  return out;});
const fail=r.filter(x=>x.maxRoomFill>0.88||x.longestStraightWallM>9||!x.connected);
console.log(JSON.stringify(r));console.log(errs.length?'ERRORS '+errs.slice(0,3):'no errors');console.log(fail.length?'FAIL '+JSON.stringify(fail):'ALL CAVE CHECKS PASSED');await browser.close();
