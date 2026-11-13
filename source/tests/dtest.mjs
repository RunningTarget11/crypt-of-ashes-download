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
await page.evaluate(()=>{const T=__TEST;const D=T.D();const rm=D.order.filter(r=>r.kind!=='start'&&r.kind!=='boss'&&r.r>=4)[0]||D.order[2];
  T.teleport(rm.cx,rm.cy);T.run(4);
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
// inventory: I opens it, hover shows a D4 tooltip, click equips, painted icons (img) not canvases
await page.evaluate(()=>{const T=__TEST;T.dropTest();T.run(40);for(const L of T.loots.slice())if(!L.gold)T.P.inv.push(L.item);T.refreshInv();});
await page.keyboard.press('i');await page.evaluate(()=>__TEST.run(8));await page.waitForTimeout(300);
r.inv=await page.evaluate(()=>({open:document.getElementById('inv').classList.contains('show'),imgs:document.querySelectorAll('#inv img').length,canvases:document.querySelectorAll('#inv canvas').length,doll:getComputedStyle(document.getElementById('equip')).backgroundImage.startsWith('url(')}));
ok(r.inv.open&&r.inv.imgs>0&&r.inv.canvases===0&&r.inv.doll,'inventory panel');
const cb=await page.evaluate(()=>{const c=document.querySelector('#grid .cell img');const b=c.parentElement.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
await page.mouse.move(cb[0],cb[1]);await page.waitForTimeout(200);
r.tip=await page.evaluate(()=>{const t=document.getElementById('tooltip');return {shown:t.style.display==='block',name:t.querySelector('.tt-name')?.textContent,color:t.querySelector('.tt-name')?.style.color,flavor:!!t.querySelector('.tt-flav')};});ok(r.tip.shown&&r.tip.name,'tooltip');
await page.screenshot({path:`${SS}/desktop_inventory.jpg`,quality:90});
const n0=await page.evaluate(()=>__TEST.P.inv.length);await page.mouse.click(cb[0],cb[1]);r.equipClick=await page.evaluate(n0=>__TEST.P.inv.length<=n0,n0);
await page.keyboard.press('i');
// stick/move input cancels attack recovery (desktop: click-to-move during recovery)
r.recoverCancel=await page.evaluate(()=>{const T=__TEST;for(const e of T.enemies)e.cd=99;T.startCombo(null,0);let k=0;while(!(T.P.atk&&T.P.atk.phase==='rec')&&k<60){T.run(1);k++;}const had=!!(T.P.atk&&T.P.atk.phase==='rec');const a=T.P.pos.clone();T.P.stick={x:1,y:0,m:1};T.run(4);const moved=T.P.pos.distanceTo(a);T.P.stick={x:0,y:0,m:0};return {hadRecovery:had,moved:+moved.toFixed(2),recoverNow:!!T.P.atk};});
ok(r.recoverCancel.hadRecovery&&r.recoverCancel.moved>0.2&&!r.recoverCancel.recoverNow,'stick did not cancel recovery');
r.errors=errs;ok(!errs.length,'console errors '+errs.slice(0,3).join('|'));
console.log(JSON.stringify(r,null,1));console.log(fail.length?'FAIL:\n'+fail.join('\n'):'ALL DESKTOP CHECKS PASSED');await browser.close();
