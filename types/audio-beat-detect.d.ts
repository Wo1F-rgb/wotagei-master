// v1.0.3 ships index.d.ts but omits it from its export map.
declare module '@audio/beat-detect' {
 export default function detect(data:Float32Array|Float64Array,options?:{fs?:number;frameSize?:number;hopSize?:number;delta?:number;minBpm?:number;maxBpm?:number}):{bpm:number;confidence:number;beats:Float64Array;onsets:Float64Array};
}
