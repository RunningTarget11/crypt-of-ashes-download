let ctx=null,master=null,noiseBuf=null;
export function initAudio(){
  if(ctx){if(ctx.state==='suspended')ctx.resume();return;}try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  master=ctx.createGain();master.gain.value=0.55;const comp=ctx.createDynamicsCompressor();master.connect(comp);comp.connect(ctx.destination);
  noiseBuf=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
  // ambient drone + wind
  const dr=ctx.createOscillator();dr.type='sawtooth';dr.frequency.value=43.6;const dr2=ctx.createOscillator();dr2.type='sawtooth';dr2.frequency.value=65.2;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=180;const dg=ctx.createGain();dg.gain.value=0.05;
  dr.connect(lp);dr2.connect(lp);lp.connect(dg);dg.connect(master);dr.start();dr2.start();
  const wn=ctx.createBufferSource();wn.buffer=noiseBuf;wn.loop=true;const bp=ctx.createBiquadFilter();bp.type='bandpass';bp.frequency.value=400;bp.Q.value=0.7;const wg=ctx.createGain();wg.gain.value=0.025;
  const lfo=ctx.createOscillator();lfo.frequency.value=0.07;const lg=ctx.createGain();lg.gain.value=250;lfo.connect(lg);lg.connect(bp.frequency);lfo.start();
  wn.connect(bp);bp.connect(wg);wg.connect(master);wn.start();
  // cave bed: deep sub rumble (lowpassed noise) + sparse distant drips with a long stone echo
  const rb=ctx.createBufferSource();rb.buffer=noiseBuf;rb.loop=true;const rl=ctx.createBiquadFilter();rl.type='lowpass';rl.frequency.value=70;const rg=ctx.createGain();rg.gain.value=0.22;rb.connect(rl);rl.connect(rg);rg.connect(master);rb.start();
  echo=ctx.createDelay(1.5);echo.delayTime.value=0.31;const fb=ctx.createGain();fb.gain.value=0.42;const ef=ctx.createBiquadFilter();ef.type='lowpass';ef.frequency.value=2200;echo.connect(ef);ef.connect(fb);fb.connect(echo);const eo=ctx.createGain();eo.gain.value=0.5;ef.connect(eo);eo.connect(master);
  const amb=()=>{if(!ctx)return;if(ctx.state==='running'){const r=Math.random();if(r<0.75)drip(0.03+Math.random()*0.04,true);else if(r<0.85)rumble();}setTimeout(amb,900+Math.random()*2600);};setTimeout(amb,1500);
}
let echo=null;
function drip(vol,far){if(!ctx)return;const t=ctx.currentTime;const o=ctx.createOscillator();o.type='sine';const f=900+Math.random()*900;o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*2.2,t+0.05);
  const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.004);g.gain.exponentialRampToValueAtTime(0.0001,t+0.09);o.connect(g);g.connect(far&&echo?echo:master);if(!far&&echo)g.connect(echo);o.start(t);o.stop(t+0.12);}
function rumble(){noise(2.5,120,60,0.7,0.18,'lowpass');noise(0.6,2500,1200,3,0.015,'bandpass',0.4+Math.random());}
function noise(dur,f0,f1,q,vol,type='bandpass',delay=0){if(!ctx)return;const t=ctx.currentTime+delay;const s=ctx.createBufferSource();s.buffer=noiseBuf;const f=ctx.createBiquadFilter();f.type=type;f.Q.value=q;f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(f);f.connect(g);g.connect(master);s.start(t,Math.random());s.stop(t+dur+0.05);}
function tone(dur,f0,f1,vol,type='sine',delay=0){if(!ctx)return;const t=ctx.currentTime+delay;const o=ctx.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(Math.max(f1,1),t+dur);
  const g=ctx.createGain();g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+0.008);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(master);o.start(t);o.stop(t+dur+0.05);}
export const sfx={
  swing(){noise(0.22,600,2400,1.2,0.25);},
  hit(crit){noise(0.12,2500,600,0.8,0.5);tone(0.18,140,50,0.5,'triangle');if(crit){tone(0.25,1800,900,0.08,'square');noise(0.3,5000,1500,2,0.25);}},
  bone(){noise(0.08,3000,1200,4,0.3);noise(0.1,1800,800,6,0.25,'bandpass',0.05);},
  die(){noise(0.5,1200,200,1,0.35);tone(0.4,90,30,0.4,'triangle');},
  fireball(){noise(0.5,300,1500,0.8,0.3);tone(0.3,200,500,0.08,'sawtooth');},
  boom(){noise(0.9,1800,80,0.6,0.7,'lowpass');tone(0.6,90,25,0.7,'sine');},
  whirl(){noise(0.5,400,3000,1.5,0.35);noise(0.4,3000,500,1.5,0.25,'bandpass',0.15);},
  dash(){noise(0.35,200,3500,1,0.35);},
  coin(){for(let k=0;k<3;k++)tone(0.18,2400+k*500,2300+k*500,0.06,'triangle',k*0.05);},
  item(){noise(0.12,1800,900,1.2,0.22);noise(0.09,4200,2600,6,0.12,'bandpass',0.06);tone(0.35,660,650,0.05,'triangle',0.04);tone(0.5,990,980,0.035,'sine',0.08);},
  drip(){drip(0.06,false);},
  deny(){tone(0.18,160,120,0.18,'square');tone(0.18,120,90,0.12,'square',0.09);},
  legendary(){[523,659,784,1046].forEach((f,k)=>tone(1.2,f,f,0.07,'triangle',k*0.07));noise(1.2,6000,2000,2,0.08);},
  hurt(){tone(0.2,180,90,0.25,'sawtooth');noise(0.15,900,300,1,0.25);},
  levelup(){[392,523,659,784,1046].forEach((f,k)=>tone(1.6,f,f,0.07,'triangle',k*0.09));noise(1.5,8000,1500,1,0.06);},
  potion(){tone(0.4,300,700,0.12,'sine');noise(0.3,1500,3000,3,0.1);},
  bolt(){tone(0.3,600,200,0.08,'sawtooth');noise(0.25,2000,800,3,0.1);},
  slam(){noise(1.2,900,50,0.5,0.8,'lowpass');tone(0.9,60,20,0.8,'sine');},
  roar(){tone(1.2,110,60,0.25,'sawtooth');tone(1.2,113,58,0.2,'sawtooth');noise(1.2,600,200,1,0.25);},
};
