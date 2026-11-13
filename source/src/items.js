export const RARITY={common:{name:'Common',color:'#c8c3b8',beam:null},magic:{name:'Magic',color:'#6b8cff',beam:[0.25,0.4,1.6]},rare:{name:'Rare',color:'#f2d24b',beam:[1.5,1.2,0.25]},legendary:{name:'Legendary',color:'#ff8a1e',beam:[2.2,0.8,0.12]}};
const BASES=[
 {type:'sword',slot:'weapon',names:['Broadsword','Falchion','Bastard Sword','Gladius'],dmg:[[4,9],[6,12]]},
 {type:'axe',slot:'weapon',names:['War Axe','Cleaver','Bearded Axe'],dmg:[[5,11],[7,14]]},
 {type:'mace',slot:'weapon',names:['Flanged Mace','Morning Star','Maul'],dmg:[[6,10],[8,13]]},
 {type:'helm',slot:'helm',names:['Great Helm','Bascinet','Sallet','Bone Visage'],armor:[8,16]},
 {type:'armor',slot:'chest',names:['Hauberk','Brigandine','Plate Cuirass','Scale Coat'],armor:[18,34]},
 {type:'gloves',slot:'gloves',names:['Gauntlets','Grim Grips','Chain Gloves'],armor:[4,9]},
 {type:'boots',slot:'boots',names:['Greaves','Sabatons','Grave Treads'],armor:[5,10]},
 {type:'ring',slot:'ring',names:['Ring','Signet','Band'],},
 {type:'amulet',slot:'amulet',names:['Amulet','Talisman','Reliquary'],},
];
const AFFIX=[
 {k:'str',fmt:v=>`+${v} Strength`,r:[2,8]},
 {k:'vit',fmt:v=>`+${v} Vitality`,r:[2,8]},
 {k:'crit',fmt:v=>`+${v}% Critical Strike Chance`,r:[1,5]},
 {k:'life',fmt:v=>`+${v} Maximum Life`,r:[8,30]},
 {k:'mana',fmt:v=>`+${v} Maximum Mana`,r:[6,20]},
 {k:'fire',fmt:v=>`+${v}% Fire Damage`,r:[5,25]},
 {k:'loh',fmt:v=>`+${v} Life per Hit`,r:[1,5]},
 {k:'ms',fmt:v=>`+${v}% Movement Speed`,r:[3,10]},
 {k:'as',fmt:v=>`+${v}% Attack Speed`,r:[3,12]},
];
const PRE=['Grim','Ashen','Blood','Dread','Hollow','Rune','Wraith','Grave','Doom','Soul','Ember','Night'];
const SUF=['Bane','Fang','Shroud','Whisper','Howl','Ward','Thirst','Oath','Mark','Grasp','Veil','Reaver'];
const LEG=[{n:"Ashbringer's Oath",t:'sword'},{n:'The Gravewarden\'s Maw',t:'helm'},{n:'Cinderheart',t:'amulet'},{n:'Mourning Plate',t:'armor'},{n:'Hand of Varkoth',t:'gloves'},{n:'Ring of the Drowned King',t:'ring'},{n:'Skullsplitter',t:'axe'}];
let uid=1;
export function rollItem(rng,ilvl,minRarity='common',luck=0){
  const r=rng()+luck;let rar=r>0.97?'legendary':r>0.82?'rare':r>0.45?'magic':'common';
  const order=['common','magic','rare','legendary'];if(order.indexOf(rar)<order.indexOf(minRarity))rar=minRarity;
  let base=BASES[Math.floor(rng()*BASES.length)];let name;
  if(rar==='legendary'){const L=LEG[Math.floor(rng()*LEG.length)];base=BASES.find(b=>b.type===L.t);name=L.n;}
  const bn=base.names[Math.floor(rng()*base.names.length)];
  const it={id:uid++,type:base.type,slot:base.slot,rarity:rar,base:bn,ilvl,stats:{},lines:[]};
  const sc=1+ilvl*0.18;
  if(base.dmg){const d=base.dmg[Math.floor(rng()*2)];it.dmg=[Math.round(d[0]*sc),Math.round(d[1]*sc)];if(rar!=='common'){const m={magic:1.15,rare:1.3,legendary:1.6}[rar];it.dmg=it.dmg.map(v=>Math.round(v*m));}}
  if(base.armor){it.armor=Math.round((base.armor[0]+rng()*(base.armor[1]-base.armor[0]))*sc*({common:1,magic:1.15,rare:1.3,legendary:1.6}[rar]));}
  const nAff={common:0,magic:1+Math.floor(rng()*2),rare:3+Math.floor(rng()*2),legendary:4}[rar];
  const pool=[...AFFIX];
  for(let k=0;k<nAff;k++){const a=pool.splice(Math.floor(rng()*pool.length),1)[0];let v=Math.round(a.r[0]+rng()*(a.r[1]-a.r[0])*(rar==='legendary'?1.5:1));v=Math.round(v*(1+ilvl*0.08));it.stats[a.k]=v;it.lines.push(a.fmt(v));}
  if(rar==='legendary'){it.special={sword:'Strikes ignite enemies in a ring of fire',helm:'Killing blows heal you for 8% Life',amulet:'Fireball explodes twice',armor:'Taking damage has a chance to unleash a nova',gloves:'Cleave pulls enemies inward',ring:'Charge leaves a trail of frost',axe:'Critical hits shatter bone, dealing double damage'}[base.type];}
  if(rar==='common'||rar==='magic'){name=(rar==='magic'?(PRE[Math.floor(rng()*PRE.length)]+'touched '):'')+bn;if(rar==='magic'&&rng()<0.5)name=bn+' of '+SUF[Math.floor(rng()*SUF.length)];}
  if(rar==='rare')name=PRE[Math.floor(rng()*PRE.length)]+' '+SUF[Math.floor(rng()*SUF.length)];
  it.name=name;return it;
}
// ---------- icon painter ----------
export function drawIcon(g,type,s,accent='#c9b88a'){
  g.save();g.clearRect(0,0,s,s);g.scale(s/64,s/64);
  const steel=g.createLinearGradient(0,0,64,64);steel.addColorStop(0,'#e8e6e0');steel.addColorStop(.45,'#8d8a84');steel.addColorStop(.55,'#5d5a55');steel.addColorStop(1,'#b6b2a8');
  const dark=g.createLinearGradient(0,0,0,64);dark.addColorStop(0,'#5a4636');dark.addColorStop(1,'#241a12');
  const gold=g.createLinearGradient(0,0,64,64);gold.addColorStop(0,'#f6dd96');gold.addColorStop(.5,'#9b7a32');gold.addColorStop(1,'#e2c070');
  g.lineJoin='round';g.strokeStyle='rgba(0,0,0,.85)';g.lineWidth=2;
  const P=(pts,fill)=>{g.beginPath();g.moveTo(pts[0],pts[1]);for(let i=2;i<pts.length;i+=2)g.lineTo(pts[i],pts[i+1]);g.closePath();g.fillStyle=fill;g.fill();g.stroke();};
  g.shadowColor='rgba(0,0,0,.6)';g.shadowBlur=4;
  if(type==='sword'){P([46,6,58,6,58,18,24,50,16,44],steel);P([10,40,24,54,20,58,6,44],gold);P([6,52,12,58,6,62,2,58],dark);g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=1;g.beginPath();g.moveTo(54,10);g.lineTo(21,45);g.stroke();}
  else if(type==='axe'){P([14,58,18,60,44,12,40,8],dark);P([34,6,58,4,62,28,50,34,40,20],steel);}
  else if(type==='mace'){P([12,60,16,62,38,30,34,26],dark);g.beginPath();g.arc(42,20,14,0,7);g.fillStyle=steel;g.fill();g.stroke();for(let a=0;a<6;a++){const x=42+Math.cos(a)*18,y=20+Math.sin(a)*18;P([42+Math.cos(a-.3)*12,20+Math.sin(a-.3)*12,x,y,42+Math.cos(a+.3)*12,20+Math.sin(a+.3)*12],steel);}}
  else if(type==='helm'){P([12,40,12,22,22,8,42,8,52,22,52,40,46,56,18,56],steel);P([18,30,46,30,46,35,34,35,32,52,30,35,18,35],'#111');P([30,4,34,4,34,24,30,24],gold);}
  else if(type==='armor'){P([16,8,26,6,32,14,38,6,48,8,56,20,50,28,48,58,16,58,14,28,8,20],steel);P([24,24,40,24,38,46,26,46],gold);}
  else if(type==='gloves'){P([16,58,16,30,20,12,26,12,26,28,30,8,36,8,36,28,40,12,46,14,44,34,52,28,56,32,44,50,44,58],steel);P([16,50,44,50,44,58,16,58],dark);}
  else if(type==='boots'){P([18,6,36,6,36,38,58,46,58,58,14,58,16,40],steel);P([16,30,36,30,36,36,16,36],dark);}
  else if(type==='ring'){g.lineWidth=7;g.strokeStyle=gold;g.beginPath();g.arc(32,38,16,0,7);g.stroke();g.lineWidth=2;g.strokeStyle='#000';P([32,8,42,20,32,28,22,20],accent);}
  else if(type==='amulet'){g.lineWidth=2;g.strokeStyle=gold;g.beginPath();g.arc(32,18,16,Math.PI,0);g.stroke();g.strokeStyle='#000';P([32,26,46,40,32,60,18,40],gold);P([32,32,40,40,32,52,24,40],accent);}
  else if(type==='attack'){drawIcon(g,'sword',64);}
  else if(type==='fire'){g.shadowBlur=0;const gr=g.createRadialGradient(30,36,2,30,36,28);gr.addColorStop(0,'#fff6d0');gr.addColorStop(.3,'#ffb030');gr.addColorStop(.7,'#c0300a');gr.addColorStop(1,'rgba(60,0,0,0)');g.fillStyle=gr;g.beginPath();g.moveTo(30,6);g.bezierCurveTo(44,20,58,30,52,46);g.bezierCurveTo(46,62,16,62,10,46);g.bezierCurveTo(6,32,22,26,30,6);g.fill();g.fillStyle='rgba(255,250,220,.9)';g.beginPath();g.arc(32,44,7,0,7);g.fill();}
  else if(type==='whirl'){g.shadowBlur=6;g.shadowColor='#ffcf80';for(let k=0;k<3;k++){g.strokeStyle=k?'rgba(220,200,160,.75)':'#fff2d0';g.lineWidth=5-k;g.beginPath();g.arc(32,32,24-k*7,k,k+4.4);g.stroke();}P([50,12,58,4,60,16],steel);}
  else if(type==='dash'){g.shadowBlur=6;g.shadowColor='#9fd0ff';for(let k=0;k<4;k++){g.strokeStyle=`rgba(190,220,255,${.4+k*.15})`;g.lineWidth=3;g.beginPath();g.moveTo(6+k*3,18+k*9);g.lineTo(40+k*3,18+k*9);g.stroke();}P([36,12,60,32,36,52,42,32],steel);}
  else if(type==='potion'){g.shadowBlur=0;P([26,6,38,6,38,20,52,36,46,58,18,58,12,36,26,20],'rgba(40,10,10,.7)');const gr=g.createLinearGradient(0,30,0,58);gr.addColorStop(0,'#ff3b30');gr.addColorStop(1,'#6a0505');g.fillStyle=gr;g.beginPath();g.moveTo(14,36);g.lineTo(50,36);g.lineTo(45,57);g.lineTo(19,57);g.closePath();g.fill();P([24,2,40,2,40,8,24,8],'#7a5a3a');g.fillStyle='rgba(255,255,255,.35)';g.fillRect(19,26,3,22);}
  g.restore();
}
