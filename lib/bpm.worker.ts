import {analyzeWindows,type AnalysisWindow} from './bpm-analysis';
self.onmessage=(event:MessageEvent<{windows:AnalysisWindow[]}>)=>{try{self.postMessage({result:analyzeWindows(event.data.windows)});}catch(e){self.postMessage({error:e instanceof Error?e.message:'解析できませんでした。'});}};
