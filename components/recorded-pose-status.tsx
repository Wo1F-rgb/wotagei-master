import type {RecordedPoseState} from '@/lib/use-recorded-poses';
export function recordedPoseLabel(state:RecordedPoseState){return state.status==='ready'?'骨格の事前解析済み':state.status==='error'?'骨格を解析できませんでした':state.status==='loading'?`骨格を事前解析中${state.total?' '+Math.round(state.done/state.total*100)+'%':''}`:'骨格の事前解析を待機中';}
export function RecordedPoseStatus({state,retry}:{state:RecordedPoseState;retry:()=>void}){
 return <div className="recorded-pose-status" data-status={state.status}><span role="status">{recordedPoseLabel(state)}</span>{state.status==='loading'&&<progress aria-label="骨格の事前解析" value={state.done} max={state.total||1}/>}<small>{state.status==='error'?state.message:state.status==='loading'?'表示をOFFにすると解析を中止できます。':''}</small>{(state.status==='ready'||state.status==='error')&&<button className="button mini" onClick={retry}>{state.status==='error'?'もう一度解析':'骨格を再解析'}</button>}</div>;
}
