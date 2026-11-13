# item icons / panel art (AI-generated sources in gen2/) -> compact webp for the HUD + inventory
from PIL import Image,ImageFilter,ImageChops
import numpy as np,os
D=os.path.dirname(os.path.abspath(__file__))
def alpha_from_dark(im,lo=0.03,hi=0.14):
    a=np.asarray(im.convert('RGB')).astype(np.float32)/255;m=a.max(axis=2)
    al=np.clip((m-lo)/(hi-lo),0,1);al=Image.fromarray((al*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out=im.convert('RGBA');out.putalpha(al);return out
for t in ['sword','axe','mace','helm','armor','gloves','boots','ring','amulet','gold']:
    im=Image.open(f'{D}/gen2/it_{t}.jpg');im=alpha_from_dark(im);bb=im.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
    if bb:# square crop around content with margin
        cx,cy=(bb[0]+bb[2])/2,(bb[1]+bb[3])/2;s=max(bb[2]-bb[0],bb[3]-bb[1])*1.08/2;im=im.crop((int(cx-s),int(cy-s),int(cx+s),int(cy+s)))
    im.resize((192,192),Image.LANCZOS).save(f'{D}/it_{t}.webp',quality=86)
c=alpha_from_dark(Image.open(f'{D}/gen2/corner.jpg'),0.05,0.22).resize((256,256),Image.LANCZOS);c.save(f'{D}/orn_corner.webp',quality=88)
Image.open(f'{D}/gen2/tex_leather.jpg').convert('RGB').resize((384,384),Image.LANCZOS).save(f'{D}/tex_leather.webp',quality=80)
Image.open(f'{D}/gen2/paperdoll.jpg').convert('RGB').resize((360,480),Image.LANCZOS).save(f'{D}/paperdoll.webp',quality=78)
print('ok')
