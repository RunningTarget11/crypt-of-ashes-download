# Processes generated UI art (ui/*.jpg) into game-ready webp assets
from PIL import Image, ImageFilter; import numpy as np
def bezel(src,dst,cx,cy,rin,rout,H,sy=1.0,size=384):
    im=Image.open(src).convert('RGB')
    if sy!=1.0: im=im.resize((im.width,int(im.height*sy)),Image.LANCZOS); cy=int(cy*sy)
    big=Image.new('RGB',(2*H,2*H)); big.paste(im,(H-cx,H-cy))
    a=np.asarray(big).astype(float)/255; lum=a.max(axis=2)
    yy,xx=np.mgrid[0:2*H,0:2*H]; r=np.hypot(xx-H,yy-H)
    band=((r>rin+5)&(r<rout-4)).astype(float)
    alpha=np.maximum(band,np.clip((lum-0.035)/0.08,0,1)); alpha[r<rin-2]=0
    A=Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out=big.convert('RGBA'); out.putalpha(A); out=out.resize((size,size),Image.LANCZOS)
    out.save(dst,quality=86); print(dst,'inner frac',round(rin/H,4))
bezel('ui/bezel_ring.jpg','ui/bezel_ornate.webp',510,508,322,425,540,sy=320/298,size=448)
bezel('ui/bezel_small.jpg','ui/bezel_small.webp',513,500,324,439,450,size=320)
for n in ['attack','whirl','fire','dash','potion','bag','map']:
    im=Image.open(f'ui/icon_{n}.jpg').convert('RGB')
    if n=='fire': im=im.crop((112,112,912,912))
    if n=='potion': im=im.crop((60,40,964,944))
    im.resize((256,256),Image.LANCZOS).save(f'ui/i_{n}.webp',quality=82)
