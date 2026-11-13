// Builds CC0 Quaternius outfit characters (Modular Character Outfits - Fantasy + Universal Base Characters)
// into compact GLBs that share the UAL 65-bone skeleton. Output: glb/ch_*.glb
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,dedup,weld,simplify,textureCompress,resample} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';import sharp from 'sharp';import fs from 'fs';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const O='/workspace/chars/outfits/Modular Character Outfits - Fantasy[Standard]/Exports/glTF (Godot-Unreal)/Outfits/';
const B='/workspace/chars/base/Universal Base Characters[Standard]/Base Characters/Godot - UE/';
await MeshoptSimplifier.ready;
async function build(src,out,{drop=[],headOnly=false,ratio=0.55,tex=1024,keepMesh=null,error=0.0015}){
  const doc=await io.read(src);const r=doc.getRoot();
  for(const m of r.listMeshes()){if(drop.some(d=>m.getName().includes(d))||(keepMesh&&!keepMesh(m.getName()))){for(const n of r.listNodes())if(n.getMesh()===m)n.dispose();m.dispose();}}
  if(headOnly){// keep only triangles whose vertices are mostly weighted to neck/Head (cut the body away under the outfit)
    const sk=r.listSkins()[0];const J=sk.listJoints().map(j=>j.getName());
    for(const m of r.listMeshes())for(const p of m.listPrimitives()){if(p.getMaterial()?.getName()!=='MI_Superhero_Male'&&p.getMaterial()?.getName()!=='MI_Superhero_Female')continue;
      const jo=p.getAttribute('JOINTS_0'),wt=p.getAttribute('WEIGHTS_0'),idx=p.getIndices();const a=[],b=[];
      const headish=v=>{jo.getElement(v,a);wt.getElement(v,b);let h=0;for(let k=0;k<4;k++){const n=J[a[k]];if(n==='Head'||n==='neck_01')h+=b[k];}return h>0.5;};
      const arr=idx.getArray();const keep=[];for(let t=0;t<arr.length;t+=3)if(headish(arr[t])&&headish(arr[t+1])&&headish(arr[t+2]))keep.push(arr[t],arr[t+1],arr[t+2]);
      idx.setArray(new Uint32Array(keep));}
  }
  for(const t of r.listTextures()){const n=t.getName()||t.getURI()||'';if(/(Ranger|Peasant)_BaseColor/.test(n)){t.setImage(await sharp(Buffer.from(t.getImage())).modulate({saturation:0.18,brightness:0.8}).linear(1.15,-12).png().toBuffer());t.setMimeType('image/png');}}
  await doc.transform(weld(),simplify({simplifier:MeshoptSimplifier,ratio,error,lockBorder:true}),dedup(),prune(),
    textureCompress({encoder:sharp,targetFormat:'webp',resize:[tex,tex],quality:80}));
  let tris=0;for(const m of r.listMeshes())for(const p of m.listPrimitives())tris+=p.getIndices().getCount()/3;
  await io.write('glb/'+out,doc);console.log(out,'tris',tris,'KB',(fs.statSync('glb/'+out).size/1024)|0);
}
await build(O+'Male_Ranger.gltf','ch_ranger_m.glb',{ratio:0.5,drop:['Belt_1.001']});
await build(O+'Male_Peasant.gltf','ch_peasant_m.glb',{ratio:0.5,tex:512});
await build(B+'Superhero_Male_FullBody.gltf','ch_head_m.glb',{headOnly:true,ratio:0.7,tex:512});
// low-poly LODs for enemies (smaller on screen, many at once): keeps mobile under budget
await build(O+'Male_Ranger.gltf','ch_ranger_lo.glb',{ratio:0.16,error:0.02,tex:512,drop:['Belt_1.001']});
await build(O+'Male_Peasant.gltf','ch_peasant_lo.glb',{ratio:0.28,error:0.02,tex:512});
await build(B+'Superhero_Male_FullBody.gltf','ch_head_lo.glb',{headOnly:true,ratio:0.3,error:0.02,tex:256});
