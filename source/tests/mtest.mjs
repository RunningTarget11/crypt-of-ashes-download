// Headless mobile test: Pixel 7 emulation (touch), landscape + portrait.
import {chromium,devices} from 'playwright';
const SS='/workspace/dungeon-crawler/screenshots';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const res={};let fail=[];
const ok=(c,m)=>{if(!c)fail.push(m);return !!c;};
for(const orient of ['landscape','portrait']){
  const d={...devices['Pixel 7']};if(orient==='landscape')d.viewport={width:915,height:412};
  const ctx=await browser.newContext({...d});const page=await ctx.newPage();page.setDefaultTimeout(240000);
  const errs=[];page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt');
  await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:180000});
  await page.waitForTimeout(800);
  await page.screenshot({path:`${SS}/mobile_${orient}_title.jpg`,quality:85});
  const r={};r.isMobile=await page.evaluate(()=>__TEST.IS_MOBILE);
  const eb=await page.locator('#enter').boundingBox();await page.touchscreen.tap(eb.x+eb.width/2,eb.y+eb.height/2);
  await page.waitForTimeout(400);
  await page.evaluate(()=>{const T=__TEST;T.G.paused=true;T.G.god=true;T.run(3);});
  r.state=await page.evaluate(()=>__TEST.G.state);
  const vp=page.viewportSize();const cdp=await ctx.newCDPSession(page);
  const touch=(type,pts)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:pts});
  const ctr=async id=>{const b=await page.locator(id).boundingBox();return [b.x+b.width/2,b.y+b.height/2];};
  // 1) floating joystick: touch down anywhere in the left half, drag right+up
  const sx=vp.width*0.2,sy=vp.height*0.72;
  await touch('touchStart',[{x:sx,y:sy,id:1}]);await touch('touchMove',[{x:sx+30,y:sy-10,id:1}]);await touch('touchMove',[{x:sx+60,y:sy-20,id:1}]);
  r.stickVisible=await page.evaluate(()=>{const b=document.getElementById('stickBase');return getComputedStyle(b).opacity>0.5||b.classList.contains('on')||document.getElementById('touch').classList.contains('sticking');});
  const mv=await page.evaluate(()=>{const T=__TEST;const a=T.P.pos.clone();T.run(25);const b=T.P.pos.clone();const dx=b.x-a.x,dz=b.z-a.z;
    let dy=Math.atan2(dx,dz)-T.P.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));return {dist:+Math.hypot(dx,dz).toFixed(2),m:+T.P.stick.m.toFixed(2),faceErrDeg:+(dy*57.3).toFixed(1)};});
  r.joystick=mv;ok(mv.dist>1,orient+' joystick did not move player');ok(Math.abs(mv.faceErrDeg)<20,orient+' hero not facing move dir');
  await page.screenshot({path:`${SS}/mobile_${orient}_joystick.jpg`,quality:85});
  // small drag inside deadzone should not move
  await touch('touchMove',[{x:sx+3,y:sy,id:1}]);
  r.deadzone=await page.evaluate(()=>{const T=__TEST;T.run(4);const a=T.P.pos.clone();T.run(10);return +T.P.pos.distanceTo(a).toFixed(3);});
  ok(r.deadzone<0.05,orient+' deadzone moved');
  await touch('touchEnd',[]);
  r.afterRelease=await page.evaluate(()=>{const T=__TEST;T.run(6);const a=T.P.pos.clone();T.run(10);return +T.P.pos.distanceTo(a).toFixed(3);});
  ok(r.afterRelease<0.05,orient+' moving after release');
  // 2) combat: bring 3 enemies close, hold the attack button with a real touch
  await page.evaluate(()=>{const T=__TEST;const D=T.D();const rm=D.order.filter(r=>r.kind==='normal'&&r.w>=8&&r.h>=8)[0]||D.order[2];
    T.teleport((rm.x+rm.w/2)*2,(rm.y+rm.h*0.62)*2);T.run(4);
    const es=T.enemies.filter(e=>!e.def.boss).sort((a,b)=>a.pos.distanceTo(T.P.pos)-b.pos.distanceTo(T.P.pos)).slice(0,3);
    es.forEach((e,i)=>{e.pos.set(T.P.pos.x+(i-1)*1.4+0.6,0,T.P.pos.z+2.2);e.state='chase';e.cd=99;e.hp=e.maxHp=9999;});
    T.P.yaw=-Math.PI/2;/* facing away-ish: soft lock must turn us */T.run(3);T.comboLog=[];T.hits=0;T.P.mana=999;});
  const hp0=await page.evaluate(()=>__TEST.enemies.reduce((s,e)=>s+(e.dead?0:e.hp),0));
  const [ax,ay]=await ctr('#bAtk');
  await touch('touchStart',[{x:ax,y:ay,id:5}]);
  const seq=[];
  for(let i=0;i<9;i++){seq.push(await page.evaluate(()=>{const T=__TEST;T.run(6);return T.heroAnim();}));
    if(i===2)await page.screenshot({path:`${SS}/mobile_${orient}_attack.jpg`,quality:85});}
  await touch('touchEnd',[]);
  const cb=await page.evaluate(()=>({combo:__TEST.comboLog.slice(),hits:__TEST.hits}));
  const hp1=await page.evaluate(()=>__TEST.enemies.reduce((s,e)=>s+(e.dead?0:e.hp),0));
  r.attack={...cb,clips:[...new Set(seq.filter(Boolean))],dmg:Math.round(hp0-hp1)};
  ok(cb.combo.length>=3&&cb.combo[0]===0&&cb.combo[1]===1&&cb.combo[2]===2,orient+' combo chain A-B-C missing');ok(hp0-hp1>0,orient+' no damage');
  // 3) multitouch: joystick + attack at the same time
  await page.evaluate(()=>{__TEST.comboLog=[];__TEST.run(20);});
  await touch('touchStart',[{x:sx,y:sy,id:1}]);await touch('touchMove',[{x:sx-60,y:sy,id:1}]);
  await touch('touchStart',[{x:sx-60,y:sy,id:1},{x:ax,y:ay,id:2}]);
  r.multi=await page.evaluate(()=>{const T=__TEST;T.run(20);return {stick:+T.P.stick.m.toFixed(2),atkHeld:!!T.G.atkHeld,combo:T.comboLog.slice()};});
  await touch('touchEnd',[]);ok(r.multi.stick>0.3&&r.multi.combo.length>0,orient+' multitouch failed');
  // 4) skills + cooldown ring
  await page.evaluate(()=>__TEST.run(30));
  const tapEl=async id=>{const [x,y]=await ctr(id);await page.touchscreen.tap(x,y);};
  await tapEl('#b2');await page.evaluate(()=>__TEST.run(6));r.cdFire=+(await page.evaluate(()=>__TEST.P.cd.fire)).toFixed(2);
  await tapEl('#b1');await page.evaluate(()=>__TEST.run(6));r.cdWhirl=+(await page.evaluate(()=>__TEST.P.cd.whirl)).toFixed(2);
  await page.evaluate(()=>__TEST.run(25));
  await tapEl('#b3');await page.evaluate(()=>__TEST.run(3));r.cdDash=+(await page.evaluate(()=>__TEST.P.cd.dash)).toFixed(2);
  await page.evaluate(()=>__TEST.run(1));
  await page.screenshot({path:`${SS}/mobile_${orient}_cooldowns.jpg`,quality:88});
  ok(r.cdFire>0&&r.cdWhirl>0&&r.cdDash>0,orient+' skill cooldowns not set');
  r.ringDrawn=await page.evaluate(()=>{const c=document.querySelector('#b1 canvas, #b1 .cdc');if(!c||!c.getContext)return null;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)n++;return n;});
  ok(r.ringDrawn>100,orient+' cooldown ring not drawn');
  await page.evaluate(()=>{__TEST.P.hp=50;});const p0=await page.evaluate(()=>__TEST.P.potions);await tapEl('#bPot');r.potion=p0-await page.evaluate(()=>__TEST.P.potions);ok(r.potion===1,orient+' potion');
  await tapEl('#bInv');await page.evaluate(()=>__TEST.run(1));r.inv=await page.evaluate(()=>document.getElementById('inv').classList.contains('show'));ok(r.inv,orient+' inventory');
  await tapEl('#invclose');
  r.scroll=await page.evaluate(()=>({sx:scrollX,sy:scrollY,ta:getComputedStyle(document.body).touchAction}));
  r.errors=errs.slice(0,10);ok(errs.length===0,orient+' console errors: '+errs.slice(0,3).join(' | '));
  res[orient]=r;await ctx.close();
}
console.log(JSON.stringify(res,null,1));console.log(fail.length?'FAIL:\n'+fail.join('\n'):'ALL MOBILE CHECKS PASSED');await browser.close();
