import {chromium,devices} from 'playwright';
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const res={};
for(const mode of ['desktop','landscape','portrait']){
 const d=mode==='desktop'?{viewport:{width:1366,height:768}}:{...devices['Pixel 7']};if(mode==='landscape')d.viewport={width:915,height:412};
 const ctx=await browser.newContext(d);const page=await ctx.newPage();const errs=[];page.on('console',m=>{if(m.type()==='error')errs.push(m.text());});page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
 await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt');await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:180000});
 await page.evaluate(()=>{const T=__TEST;T.startGame();T.G.paused=true;T.G.god=true;for(const e of T.enemies){e.dead=true;e.c.root.visible=false;}T.run(10);document.getElementById('banner').style.display='none';
   T.P.potions=2;T.dropTest();
   // also a potion
   T.run(40);});
 const before=await page.evaluate(()=>({inv:__TEST.P.inv.length,gold:__TEST.P.gold,loots:__TEST.loots.map(l=>l.gold?'gold':l.item.rarity+':'+l.item.type)}));
 await page.waitForTimeout(200);
 await page.screenshot({path:`/tmp/loot_${mode}_ground.jpg`,quality:85});
 // tap/click labels of gear one by one
 const picked=[];
 for(let k=0;k<6;k++){
   const r=await page.evaluate(()=>{const L=__TEST.loots.find(l=>!l.gold&&l.label.style.display!=='none');if(!L)return null;const b=L.label.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2,name:L.item.name}});
   if(!r)break;
   if(mode==='desktop')await page.mouse.click(r.x,r.y);else await page.touchscreen.tap(r.x,r.y);
   const tgt=await page.evaluate(()=>!!(__TEST.P.target&&__TEST.P.target.type==='loot'));
   await page.evaluate(()=>__TEST.run(120));
   picked.push({name:r.name,targeted:tgt,inInv:await page.evaluate(n=>__TEST.P.inv.some(i=>i.name===n)||Object.values(__TEST.P.equip).some(i=>i&&i.name===n),r.name)});
 }
 // walk-over gold: teleport onto any remaining gold
 const goldRes=await page.evaluate(()=>{const T=__TEST;const g0=T.P.gold;const L=T.loots.find(l=>l.gold);if(!L)return 'no gold left (auto-picked already)';T.teleport(L.x,L.z);T.run(5);return {before:g0,after:T.P.gold};});
 // potion walk-over
 const potRes=await page.evaluate(()=>{const T=__TEST;const p0=T.P.potions;return {p0};});
 // inventory full check
 const full=await page.evaluate(()=>{const T=__TEST;const filler=[];while(T.P.inv.length<40)T.P.inv.push({...T.P.inv[0]||{},id:9000+T.P.inv.length});T.dropTest();T.run(40);const L=T.loots.find(l=>!l.gold);if(!L)return 'none';const ok=T.pickup(L);const r={pickedWhenFull:ok,stillOnGround:T.loots.includes(L)};T.P.inv.length=Math.min(T.P.inv.length,40);T.P.inv=T.P.inv.filter(i=>!(i.id>=9000));return r;});
 await page.evaluate(()=>{__TEST.P.inv.length=0;});
 // repopulate inv with variety for screenshot
 await page.evaluate(()=>{const T=__TEST;T.loots.slice().forEach(l=>{if(!l.gold)T.pickup(l);});});
 await page.evaluate(()=>{__TEST.toggleInv();__TEST.run(8);});
 await page.waitForTimeout(400);
 const invOpen=await page.evaluate(()=>document.getElementById('inv').classList.contains('show')&&document.querySelectorAll('#grid .cell img').length);
 await page.screenshot({path:`/tmp/loot_${mode}_inv.jpg`,quality:88});
 // hover / tap a cell to show tooltip/sheet
 const cell=await page.evaluate(()=>{const c=document.querySelector('#grid .cell img');if(!c)return null;const b=c.parentElement.getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2}});
 if(cell){if(mode==='desktop')await page.mouse.move(cell.x,cell.y);else await page.touchscreen.tap(cell.x,cell.y);await page.waitForTimeout(300);await page.screenshot({path:`/tmp/loot_${mode}_tip.jpg`,quality:88});}
 const tipShown=await page.evaluate(()=>document.getElementById('tooltip').style.display==='block'||document.getElementById('sheet').classList.contains('show'));
 res[mode]={before,picked,goldRes,full,invOpen,tipShown,errs:errs.slice(0,5)};
 await ctx.close();
}
console.log(JSON.stringify(res,null,1));await browser.close();
