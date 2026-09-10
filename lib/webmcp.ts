import {MIN_PRACTICE_RATE,MAX_PRACTICE_RATE} from './practice-rate.ts';
export type PracticeConfig = {referenceBpm?:number;selfBpm?:number;rate?:number};
export type Tool = {name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
export type ModelContext = {registerTool:(tool:Tool,options?:{signal?:AbortSignal})=>void|Promise<void>};
export function validateConfig(input:unknown):PracticeConfig{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Expected a configuration object');
 const value=input as Record<string,unknown>,allowed=['referenceBpm','selfBpm','rate'];
 if(!Object.keys(value).length||Object.keys(value).some(k=>!allowed.includes(k)))throw new Error('Provide referenceBpm, selfBpm or rate');
 for(const [key,v] of Object.entries(value)){const min=key==='rate'?MIN_PRACTICE_RATE:40,max=key==='rate'?MAX_PRACTICE_RATE:300;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(`Invalid ${key}: expected ${min}–${max}`);}
 return value as PracticeConfig;
}
export function registerStudioTools(context:ModelContext,read:()=>unknown,configure:(config:PracticeConfig)=>void){
 const lifecycle=new AbortController();
 const tools:Tool[]=[{name:'read_practice_state',description:'Read the loaded-video flags, tempo, beat origins, playback position and loop state.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>read()},{name:'configure_practice_tempo',description:'Pause playback and set reference BPM, self-video BPM or practice speed using the same settings as the visible controls. Does not start playback.',inputSchema:{type:'object',properties:{referenceBpm:{type:'number',minimum:40,maximum:300},selfBpm:{type:'number',minimum:40,maximum:300},rate:{type:'number',minimum:MIN_PRACTICE_RATE,maximum:MAX_PRACTICE_RATE}},minProperties:1,additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:input=>{const config=validateConfig(input);configure(config);return read();}}];
 for(const tool of tools){try{void Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 return()=>lifecycle.abort();
}
