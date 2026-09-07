import {XMLParser,XMLValidator} from 'fast-xml-parser';
export type Song={id:string;name:string;artist:string;bpm:number;variable:boolean};
export function parseRekordbox(xml:string):Song[]{
 if(xml.length>5*1024*1024)throw new Error('XMLは5MB以内の選択した曲だけを書き出してください。');
 if(/<!DOCTYPE|<!ENTITY/i.test(xml)||XMLValidator.validate(xml)!==true)throw new Error('正しいrekordbox XMLを選んでください。');
 const doc=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'',parseAttributeValue:false,isArray:(_name,path)=>path==='DJ_PLAYLISTS.COLLECTION.TRACK'||path==='DJ_PLAYLISTS.COLLECTION.TRACK.TEMPO'}).parse(xml);
 const tracks=doc?.DJ_PLAYLISTS?.COLLECTION?.TRACK;
 if(!Array.isArray(tracks))throw new Error('曲のCOLLECTIONがありません。rekordboxのXML形式で書き出してください。');
 const songs:Song[]=[],seen=new Set<string>();
 for(const track of tracks){
  const bpm=Number(track.AverageBpm),name=String(track.Name||'').slice(0,200),artist=String(track.Artist||'').slice(0,200);
  if(!name||!Number.isFinite(bpm)||bpm<40||bpm>300)continue;
  const tempos=(track.TEMPO||[]).map((t:{Bpm?:string})=>Number(t.Bpm)).filter((n:number)=>Number.isFinite(n)&&n>0);
  const variable=tempos.length>0&&Math.max(...tempos)-Math.min(...tempos)>.5;
  const id=`${name}|${artist}|${bpm}`;if(seen.has(id))continue;seen.add(id);
  songs.push({id,name,artist,bpm,variable});if(songs.length>=5000)break;
 }
 if(!songs.length)throw new Error('40〜300 BPMの解析済みの曲がありません。rekordboxで解析してから書き出してください。');
 return songs;
}
