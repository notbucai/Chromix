export async function probeAudioFingerprint(page) {
 return page.evaluate(async()=>{
  const samples=[];
  for(let run=0;run<2;run++){
   const context=new OfflineAudioContext(1,5000,44100);
   const oscillator=context.createOscillator();oscillator.type='triangle';oscillator.frequency.value=10000;
   const compressor=context.createDynamicsCompressor();compressor.threshold.value=-50;compressor.knee.value=40;compressor.ratio.value=12;compressor.attack.value=0;compressor.release.value=.25;
   oscillator.connect(compressor);compressor.connect(context.destination);oscillator.start(0);
   const buffer=await context.startRendering(),data=buffer.getChannelData(0),copy=new Float32Array(data.length);buffer.copyFromChannel(copy,0);
   const bits=new Uint32Array(data.buffer,data.byteOffset,data.length);let hash=2166136261,sum=0;
   for(const value of bits){hash^=value;hash=Math.imul(hash,16777619);}
   for(let i=4500;i<5000;i++)sum+=Math.abs(data[i]);
   samples.push({hash:(hash>>>0).toString(16).padStart(8,'0'),sum,copyMatches:data.every((v,i)=>Object.is(v,copy[i]))});
  }
  return {samples,stable:samples[0].hash===samples[1].hash};
 });
}
