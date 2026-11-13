import {chromium,devices} from 'playwright';
const mobile=process.argv[2]==='m';const out=process.argv[3]||'/tmp/sw';const N=+(process.argv[4]||36);const every=+(process.argv[5]||2);
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const ctx=await browser.newContext(mobile?{...devices['Pixel 7'],viewport:{width:915,height:412}}:{viewport:{width:1000,height:640}});
const page=await ctx.newPage();await page.addInitScript('window.ZOOM='+(process.env.ZOOM||0.72));const errs=[];page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push(m.type()+': '+m.text());});page.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
await page.goto('file:///workspace/dungeon-crawler/index.html?noadapt'+(mobile?'&mobile':'&desktop'));
await page.waitForFunction(()=>window.__TEST&&window.__TEST.ready,null,{timeout:120000});
await page.addStyleTag({content:'#banner{display:none!important}'});
await page.evaluate(()=>{const T=__TEST;T.startGame();T.G.paused=true;T.G.god=true;T.run(3);const D=T.D();const r=D.order.filter(r=>r.kind==='normal'&&r.w>=8&&r.h>=8)[0]||D.order[2];
  T.teleport((r.x+r.w/2)*2,(r.y+r.h*0.62)*2);T.run(4);
  // bring two enemies right in front of the hero
  const es=T.enemies.filter(e=>!e.def.boss).sort((a,b)=>a.pos.distanceTo(T.P.pos)-b.pos.distanceTo(T.P.pos)).slice(0,3);
  es.forEach((e,i)=>{e.pos.set(T.P.pos.x+(i-1)*1.3,0,T.P.pos.z-1.9-(i%2)*0.4);e.state='chase';e.cd=99;e.hp=e.maxHp=9999;});
  T.P.yaw=Math.PI;T.setZoom(+(window.ZOOM||0.72));T.run(30);T.G.atkHeld=true;T.G.atkPress=true;T.comboLog=[];T.hits=0;});
for(let i=0;i<N;i++){await page.evaluate(()=>{__TEST.run(1);__TEST.step(0,false);});if(i%every===0)await page.screenshot({path:`${out}_${String(i).padStart(3,'0')}.jpg`,quality:72});}
const r=await page.evaluate(()=>({combo:__TEST.comboLog,hits:__TEST.hits}));console.log(JSON.stringify(r),errs.slice(0,5));await browser.close();
