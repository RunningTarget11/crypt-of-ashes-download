import fs from 'fs'; import sharp from 'sharp';
const out={tex:{},glb:{},font:{},ui:{}};
for (const f of fs.readdirSync('tex')) {
  const buf=await sharp('tex/'+f).resize(1024,1024).jpeg({quality: f.includes('nor')?88:82}).toBuffer();
  out.tex[f.replace('.jpg','')]='data:image/jpeg;base64,'+buf.toString('base64');
}
// props (Poly Haven, CC0) + characters/animations (Quaternius UAL, CC0) - the Mixamo Xbot is no longer used
for (const k of ['gothic_statue','kite_shield','treasure_chest','wine_barrel_01','wooden_crate_01','wooden_handle_saber','hero_ual']) out.glb[k]=fs.readFileSync('glb/'+k+'.glb').toString('base64');
for (const f of fs.readdirSync('ui').filter(f=>f.endsWith('.webp'))) out.ui[f.replace('.webp','')]='data:image/webp;base64,'+fs.readFileSync('ui/'+f).toString('base64');
out.font.cinzel='data:font/ttf;base64,'+fs.readFileSync('Cinzel.ttf').toString('base64');
out.font.cinzelDeco='data:font/ttf;base64,'+fs.readFileSync('CinzelDecorative.ttf').toString('base64');
fs.writeFileSync('../dungeon-crawler/assets.js','window.__ASSETS='+JSON.stringify(out)+';');
console.log(fs.statSync('../dungeon-crawler/assets.js').size);
