export type YouTubeLink = { id: string; start: number; url: string };
export function parseYouTubeLink(input: string): YouTubeLink {
 const url = new URL(input.trim());
 if (url.protocol !== 'https:' || url.username || url.password) throw new Error('YouTubeのHTTPSリンクを貼ってください。');
 const host = url.hostname.toLowerCase(), parts = url.pathname.split('/').filter(Boolean);
 let id: string | null = null;
 if (host === 'youtu.be' && parts.length === 1) id = parts[0];
 if (['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'].includes(host)) {
  if (url.pathname === '/watch') id = url.searchParams.get('v');
  else if (['shorts','embed','live'].includes(parts[0]) && parts.length === 2) id = parts[1];
 }
 if (!id || !/^[\w-]{11}$/.test(id)) throw new Error('動画の共有リンクを貼ってください。チャンネルや再生リストだけのリンクは使えません。');
 const raw = url.searchParams.get('t') || url.searchParams.get('start') || url.hash.match(/^#t=(.+)$/)?.[1] || '0';
 const match = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
 const start = /^\d+$/.test(raw) ? Number(raw) : match ? Number(match[1] || 0)*3600 + Number(match[2] || 0)*60 + Number(match[3] || 0) : 0;
 const safeStart = Number.isSafeInteger(start) && start <= 86400 ? start : 0;
 return {id, start: safeStart, url: `https://www.youtube.com/watch?v=${id}${safeStart ? `&t=${safeStart}s` : ''}`};
}

export interface YouTubePlayer {
 getCurrentTime(): number; getDuration(): number; getPlayerState(): number;
 getPlaybackRate(): number; getAvailablePlaybackRates(): number[];
 setPlaybackRate(rate: number): void; playVideo(): void; pauseVideo(): void;
 seekTo(time: number, allowSeekAhead: boolean): void;
 isMuted(): boolean; mute(): void; unMute(): void; destroy(): void;
}

/** A media clock backed by the official iframe API. It never reads video/audio data. */
export class YouTubeMedia {
 private pending: {resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>} | null = null;
 player: YouTubePlayer;
 confirmedPlaybackRate:number;
 constructor(player: YouTubePlayer) {this.player=player;this.confirmedPlaybackRate=player.getPlaybackRate()||1;}
 rateChanged(value:number){if(Number.isFinite(value)&&value>0)this.confirmedPlaybackRate=value;}
 get currentTime(){return this.player.getCurrentTime() || 0;}
 set currentTime(t: number){this.player.seekTo(Math.max(0,t),true);}
 get duration(){return this.player.getDuration() || 0;}
 get paused(){return this.player.getPlayerState()!==1;}
 get ended(){return this.player.getPlayerState()===0;}
 get seeking(){return this.player.getPlayerState()===3;}
 get readyState(){return this.seeking ? 2 : 4;}
 get playbackRate(){return this.player.getPlaybackRate() || 1;}
 set playbackRate(rate:number){if(this.playbackRate!==rate)this.player.setPlaybackRate(rate);}
 get muted(){return this.player.isMuted();}
 set muted(value:boolean){if(value)this.player.mute();else this.player.unMute();}
 get rates(){return this.player.getAvailablePlaybackRates().filter(n=>Number.isFinite(n)&&n>0);}
 play(): Promise<void> {
  this.cancel();
  if(this.player.getPlayerState()===1)return Promise.resolve();
  return new Promise((resolve,reject)=>{
   this.pending={resolve,reject,timer:setTimeout(()=>this.cancel('YouTubeの再生待ちが続いています。動画内の再生ボタンを押してから試してください。'),15000)};
   try{this.player.playVideo();}catch{this.cancel('YouTubeを再生できませんでした。');}
  });
 }
 pause(){this.cancel();this.player.pauseVideo();}
 stateChanged(state:number){if(state===1&&this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.resolve();}}
 cancel(message='再生を中止しました。'){if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(new Error(message));}}
}

export function youtubeError(code:number){
 if(code===100)return '動画が削除されたか、非公開になっています。';
 if(code===101||code===150)return 'この動画はアプリ内での再生が許可されていません。別の動画を選ぶか、YouTubeで開いてください。';
 if(code===153)return 'YouTubeがこのページからの再生を確認できません。公開先をSafariで開き直してください。';
 return `YouTubeを再生できません（${code}）。リンクを確認するか、別の動画を選んでください。`;
}
