// Final screenshot set -> /workspace/dungeon-crawler/screenshots/d4_*.jpg
import {chromium,devices} from 'playwright';
const SS='/workspace/dungeon-crawler/screenshots';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const setups={desktop:{viewport:{width:1600,height:900}},landscape:{...devices['Pixel 7'],viewport:{width:915,height:412}},portrait:{...devices['Pixel 7']}};
const errs=[];
for(const [mode,o] of Object.entries(setups)){
  const ctx=await browser.newContext(o);const page=await ctx.newPage();page.on('pageerror',e=>errs.push(mode+': '+e.message));page.on('console',m=>{if(m.type()==='error')errs.push(mode+': '+m.text());});
  await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt'+(mode==='desktop'?'&desktop':''));await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:180000});
  await page.waitForTimeout(2500);await page.screenshot({path:`${SS}/d4_title_${mode}.jpg`,quality:88});
  await page.evaluate(()=>{const T=__TEST;T.startGame();T.G.paused=true;T.G.god=true;T.run(20);document.getElementById('banner').style.display='none';});
  // gameplay: in a chamber with enemies, mid-combo, loot on the ground
  await page.evaluate(()=>{const T=__TEST;const D=T.D();const rm=D.order[2];T.teleport(rm.cx,rm.cy);T.run(4);
    const es=T.enemies.filter(e=>!e.def.boss).sort((a,b)=>a.pos.distanceTo(T.P.pos)-b.pos.distanceTo(T.P.pos)).slice(0,4);
    es.forEach((e,i)=>{e.pos.set(T.P.pos.x+(i-1.5)*1.5,0,T.P.pos.z+2.0+(i%2)*0.8);e.state='chase';e.cd=99;e.hp=e.maxHp*0.6;});
    T.dropTest();T.P.target={type:'enemy',e:es[0]};T.run(14);});
  await page.screenshot({path:`${SS}/d4_gameplay_${mode}.jpg`,quality:88});
  // HUD close-up: bottom part of the screen
  const vp=page.viewportSize();const hh=mode==='portrait'?Math.round(vp.height*0.42):Math.round(vp.height*0.34);
  await page.screenshot({path:`${SS}/d4_hudbar_${mode}.jpg`,quality:90,clip:{x:0,y:vp.height-hh,width:vp.width,height:hh}});
  // inventory with a varied bag
  await page.evaluate(()=>{const T=__TEST;for(const L of T.loots.slice())if(!L.gold)T.pickup(L);for(let k=0;k<3;k++){T.dropTest();T.run(30);for(const L of T.loots.slice())if(!L.gold){T.P.inv.push(L.item);L.label.remove();T.loots.splice(T.loots.indexOf(L),1);}}T.refreshInv();T.toggleInv();T.run(8);});
  await page.waitForTimeout(400);
  const c=await page.evaluate(()=>{const els=[...document.querySelectorAll('#grid .cell')].filter(e=>/r-(legendary|unique|rare)/.test(e.className));const el=els[0]||document.querySelector('#grid .cell img').parentElement;const b=el.getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
  if(mode==='desktop')await page.mouse.move(c[0],c[1]);else await page.touchscreen.tap(c[0],c[1]);
  await page.waitForTimeout(300);await page.screenshot({path:`${SS}/d4_inventory_${mode}.jpg`,quality:90});
  if(mode==='desktop'){
    await page.evaluate(()=>{__TEST.toggleInv();document.getElementById('tooltip').style.display='none';const T=__TEST;for(const L of T.loots.slice())T.pickup(L);T.P.inv.length=0;});
    // cave wide shot: camera pulled up over a chamber cluster (ambient x3 and fog pushed back so the whole layout reads in one still)
    await page.evaluate(()=>{const T=__TEST;const D=T.D();const r=D.order[4];T.teleport(r.cx,r.cy);T.run(30);T.debugLight(6);T.camOv={pos:new T.camera.position.constructor(r.cx,40,r.cy+20),look:new T.camera.position.constructor(r.cx,0,r.cy-2)};T.run(2);});
    await page.addStyleTag({content:'#target{display:none!important}'});
    await page.screenshot({path:`${SS}/d4_cave_wide.jpg`,quality:88});
    await page.evaluate(()=>{const T=__TEST;const D=T.D();const r=D.order[6];T.teleport(r.cx,r.cy);T.camOv={pos:new T.camera.position.constructor(r.cx-8,13,r.cy+12),look:new T.camera.position.constructor(r.cx,0,r.cy-1)};T.run(30);});
    await page.screenshot({path:`${SS}/d4_cave_chamber.jpg`,quality:88});
  }
  await ctx.close();
}
console.log(errs.length?'ERRORS '+errs.slice(0,5).join(' | '):'no errors');await browser.close();
