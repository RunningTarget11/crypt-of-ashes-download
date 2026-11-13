// Headless desktop test: mouse click-to-move, Space-hold combo, click-attack, skills, perf.
import {chromium} from 'playwright';
const SS='/workspace/dungeon-crawler/screenshots';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:720}});page.setDefaultTimeout(240000);
const errs=[];page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt');
await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:180000});
const r={};const fail=[];const ok=(c,m)=>{if(!c)fail.push(m);};
r.isMobile=await page.evaluate(()=>__TEST.IS_MOBILE);ok(!r.isMobile,'detected as mobile');
await page.click('#enter');await page.evaluate(()=>{const T=__TEST;T.G.paused=true;T.G.god=true;T.run(3);});
// click-to-move
const p0=await page.evaluate(()=>__TEST.P.pos.toArray());await page.mouse.click(640,250);await page.evaluate(()=>__TEST.run(40));
const p1=await page.evaluate(()=>__TEST.P.pos.toArray());r.clickMove=+Math.hypot(p1[0]-p0[0],p1[2]-p0[2]).toFixed(2);ok(r.clickMove>1,'click-to-move');
// enemies in front
await page.evaluate(()=>{const T=__TEST;const D=T.D();const rm=D.order.filter(r=>r.kind==='normal'&&r.w>=8&&r.h>=8)[0]||D.order[2];
  T.teleport((rm.x+rm.w/2)*2,(rm.y+rm.h*0.62)*2);T.run(4);
  const es=T.enemies.filter(e=>!e.def.boss).sort((a,b)=>a.pos.distanceTo(T.P.pos)-b.pos.distanceTo(T.P.pos)).slice(0,3);
  es.forEach((e,i)=>{e.pos.set(T.P.pos.x+(i-1)*1.4,0,T.P.pos.z-2.2);e.state='chase';e.cd=99;e.hp=e.maxHp=9999;});T.run(30);T.comboLog=[];T.hits=0;T.P.mana=999;});
await page.mouse.move(640,300);await page.keyboard.down('Space');
for(let i=0;i<9;i++)await page.evaluate(()=>__TEST.run(6));
await page.keyboard.up('Space');
r.spaceCombo=await page.evaluate(()=>({combo:__TEST.comboLog.slice(),hits:__TEST.hits}));ok(r.spaceCombo.combo.slice(0,3).join()==='0,1,2'&&r.spaceCombo.hits>0,'space combo');
await page.evaluate(()=>{__TEST.run(40);__TEST.comboLog=[];__TEST.hits=0;});
const [ex,ey]=await page.evaluate(()=>{const T=__TEST;const e=T.enemies.filter(e=>!e.dead&&!e.def.boss).sort((a,b)=>a.pos.distanceTo(T.P.pos)-b.pos.distanceTo(T.P.pos))[0];return T.toScreen(e.pos.clone().setY(1));});
await page.mouse.move(ex,ey);await page.evaluate(()=>__TEST.run(1));await page.mouse.down();for(let i=0;i<6;i++)await page.evaluate(()=>__TEST.run(6));await page.mouse.up();
r.mouseHoldCombo=await page.evaluate(()=>({combo:__TEST.comboLog.slice(),hits:__TEST.hits}));ok(r.mouseHoldCombo.hits>0,'mouse attack');
await page.evaluate(()=>__TEST.run(30));
r.cds={};for(const [k,n] of [['1','whirl'],['2','fire'],['3','dash']]){await page.keyboard.press(k);await page.evaluate(()=>__TEST.run(2));r.cds[n]=+(await page.evaluate(n=>__TEST.P.cd[n],n)).toFixed(2);if(n!=='dash')await page.evaluate(()=>__TEST.run(40));}
ok(r.cds.whirl>0&&r.cds.fire>0&&r.cds.dash>0,'skills');
await page.evaluate(()=>__TEST.run(1));await page.screenshot({path:`${SS}/desktop_combat_hud.jpg`,quality:88});
// perf: average render+sim step at 1280x720 (swiftshader = CPU rendering, so absolute numbers are pessimistic)
r.perf=await page.evaluate(()=>{const T=__TEST;let t=performance.now();for(let i=0;i<10;i++)T.step(1/60);const ren=(performance.now()-t)/10;t=performance.now();for(let i=0;i<30;i++)T.step(1/60,true);const sim=(performance.now()-t)/30;T.renderer.info.autoReset=false;T.renderer.info.reset();T.step(1/60);const inf={...T.renderer.info.render};T.renderer.info.autoReset=true;return {frameMsSwiftshader:+ren.toFixed(1),simOnlyMs:+sim.toFixed(2),calls:inf.calls,tris:inf.triangles};});
r.errors=errs;ok(!errs.length,'console errors '+errs.slice(0,3).join('|'));
console.log(JSON.stringify(r,null,1));console.log(fail.length?'FAIL:\n'+fail.join('\n'):'ALL DESKTOP CHECKS PASSED');await browser.close();
