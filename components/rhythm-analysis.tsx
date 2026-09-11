'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { analyzeRhythmFile } from '@/lib/analyze-rhythm-file';
import type { AnalyzedGrid, RhythmAnalysisResult } from '@/lib/analyzed-grid';
import './rhythm-analysis.css';

type SourceKind = 'video' | 'audio';

type Props = {
  mainPlaying: boolean;
  file: File | null;
  remote: boolean;
  pause: () => void;
  apply: (bpm: number, origin: number) => boolean;
  applyBpmOnly: (bpm: number) => void;
};

const MIN_BPM = 40;
const MAX_BPM = 300;
const MAX_GRID_LINES = 2400;
const WAVE_WINDOW_SECONDS = 8;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function precise(value: number) {
  // Avoid the visible 0.010000000000000002 artefacts from the nudge buttons
  // without rounding a value supplied by the analyser or the user.
  return Number(value.toPrecision(15));
}

function secondsLabel(value: number) {
  if (!finite(value) || value < 0) return '—';
  const minutes = Math.floor(value / 60);
  const seconds = value - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function gridIsUsable(grid: AnalyzedGrid | null | undefined) {
  return Boolean(
    grid &&
      finite(grid.bpm) &&
      grid.bpm >= MIN_BPM &&
      grid.bpm <= MAX_BPM &&
      finite(grid.origin) &&
      grid.origin >= 0,
  );
}

function normaliseWaveform(values: number[]) {
  const samples = values.filter(finite);
  const peak = Math.max(1, ...samples.map((value) => Math.abs(value)));
  return values.map((value) => (finite(value) ? clamp(value / peak, -1, 1) : 0));
}

function waveformPath(values: number[]) {
  if (!values.length) return '';
  const normalised = normaliseWaveform(values);
  const mid = 72;
  const amplitude = 47;
  const points = normalised.map((value, index) => {
    const x = normalised.length === 1 ? 0 : (index / (normalised.length - 1)) * 1000;
    return `${x.toFixed(2)},${(mid - value * amplitude).toFixed(2)}`;
  });
  const lower = normalised
    .map((value, index) => {
      const x = normalised.length === 1 ? 0 : (index / (normalised.length - 1)) * 1000;
      return `${x.toFixed(2)},${(mid + value * amplitude).toFixed(2)}`;
    })
    .reverse();
  return `M ${points.join(' L ')} L ${lower.join(' L ')} Z`;
}

function waveformWindow(values: number[], duration: number, start: number, end: number) {
  const source = values.filter(finite);
  if (!source.length || !finite(duration) || duration <= 0 || end <= start) return source;
  const sampleCount = clamp(Math.round((source.length * (end - start)) / duration), 24, 400);
  return Array.from({ length: sampleCount }, (_, index) => {
    const ratio = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    // Each peak describes a bin centred at (i + .5) / count of the duration.
    const sourceIndex = clamp(((start + ratio * (end - start)) / duration) * source.length - .5, 0, source.length - 1);
    const low = Math.floor(sourceIndex);
    const high = Math.min(source.length - 1, low + 1);
    const weight = sourceIndex - low;
    return source[low] * (1 - weight) + source[high] * weight;
  });
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const audioWindow = window as Window &
    typeof globalThis & {
      webkitAudioContext?: typeof AudioContext;
    };
  const Context = window.AudioContext || audioWindow.webkitAudioContext;
  if (!Context) return null;
  return new Context();
}

export function RhythmAnalysis({ mainPlaying, file, remote, pause, apply, applyBpmOnly }: Props) {
  const [source, setSource] = useState<SourceKind>(file ? 'video' : 'audio');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [result, setResult] = useState<RhythmAnalysisResult | null>(null);
  const [bpmText, setBpmText] = useState('');
  const [originText, setOriginText] = useState('');
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [hasStarted, setHasStarted] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const frameRef = useRef<number | null>(null);
  const previewRequest = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const clickNodesRef = useRef<Set<OscillatorNode>>(new Set());
  const lastScheduledBeatRef = useRef<number | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const pauseRef = useRef(pause);
  const activeFile = source === 'video' ? file : audioFile;

  useEffect(() => {
    pauseRef.current = pause;
  }, [pause]);

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const stopClicks = useCallback(() => {
    // Keep the last index until an explicit reset. Removing it on a timer
    // would allow a just-passed beat to be scheduled again on the next frame.
    lastScheduledBeatRef.current = null;
    clickNodesRef.current.forEach((node) => {
      try {
        node.stop();
      } catch {
        // A click may have ended between the pause and cleanup calls.
      }
      try {
        node.disconnect();
      } catch {
        // The node can already be disconnected by its onended callback.
      }
    });
    clickNodesRef.current.clear();
  }, []);

  const closeAudioContext = useCallback(() => {
    stopClicks();
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context) void context.close().catch(() => undefined);
  }, [stopClicks]);

  const stopPreview = useCallback(
    (closeContext = false) => {
      previewRequest.current++;
      stopFrame();
      stopClicks();
      if (audioRef.current) audioRef.current.pause();
      setPlaying(false);
      if (closeContext) closeAudioContext();
    },
    [closeAudioContext, stopClicks, stopFrame],
  );

  useEffect(() => {if(mainPlaying) stopPreview();}, [mainPlaying, stopPreview]);
  useEffect(() => {
    const hide=()=>{if(document.hidden)stopPreview();};
    document.addEventListener('visibilitychange',hide);
    return()=>document.removeEventListener('visibilitychange',hide);
  }, [stopPreview]);

  const resetAnalysis = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setResult(null);
    setBpmText('');
    setOriginText('');
    setMessage('');
    setError('');
    setHasStarted(false);
  }, []);

  // A new imported video is a new time base. Drop a previously selected
  // soundtrack so its offset cannot accidentally be applied to that video.
  useEffect(() => {
    pauseRef.current();
    stopPreview(true);
    resetAnalysis();
    setAudioFile(null);
    setSource(file ? 'video' : 'audio');
    setPosition(0);
  }, [file, resetAnalysis, stopPreview]);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    stopPreview(true);
    setResult(null);
    setBpmText('');
    setOriginText('');
    setMessage('');
    setError('');
    setHasStarted(false);
    setPosition(0);
    if (!activeFile) {
      setAudioUrl(null);
      return undefined;
    }
    const url = URL.createObjectURL(activeFile);
    setAudioUrl(url);
    return () => {
      stopPreview(true);
      URL.revokeObjectURL(url);
    };
  }, [activeFile, stopPreview]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      controllerRef.current = null;
      pauseRef.current();
      stopPreview(true);
    };
  }, [stopPreview]);

  useEffect(() => {
    const grid = result?.grid;
    if (!grid) return;
    if (finite(grid.bpm)) setBpmText(String(grid.bpm));
    if (finite(grid.origin)) setOriginText(String(grid.origin));
  }, [result]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const update = () => setPosition(finite(audio.currentTime) ? audio.currentTime : 0);
    const ended = () => {
      stopFrame();
      stopClicks();
      setPlaying(false);
      update();
    };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('loadedmetadata', update);
    audio.addEventListener('ended', ended);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('loadedmetadata', update);
      audio.removeEventListener('ended', ended);
    };
  }, [audioUrl, stopClicks, stopFrame]);

  const duration = finite(result?.duration) && result.duration > 0 ? result.duration : 0;
  const grid = result?.grid ?? null;
  const previewBpm = Number(bpmText);
  const previewOrigin = Number(originText);
  const validDraft =
    finite(previewBpm) &&
    previewBpm >= MIN_BPM &&
    previewBpm <= MAX_BPM &&
    finite(previewOrigin) &&
    previewOrigin >= 0 &&
    (!duration || previewOrigin <= duration);
  const hasBeats = Boolean(result?.beats.some(finite));

  useEffect(() => {
    // A changed draft grid invalidates clicks already scheduled against the
    // previous phase or tempo. The next animation frame schedules fresh ones.
    stopClicks();
  }, [playing, previewBpm, previewOrigin, stopClicks]);

  const automaticApplyReady = Boolean(
    (file||remote) && result && hasBeats && gridIsUsable(grid) && validDraft && !grid?.variable,
  );
  const analysisInput = activeFile;

  const windowStart = duration
    ? clamp(position - WAVE_WINDOW_SECONDS / 2, 0, Math.max(0, duration - WAVE_WINDOW_SECONDS))
    : 0;
  const windowEnd = duration ? Math.min(duration, windowStart + WAVE_WINDOW_SECONDS) : 0;
  const windowDuration = Math.max(0.001, windowEnd - windowStart);

  const previewLines = useMemo(() => {
    if (!duration || !validDraft || windowEnd <= windowStart) return [];
    const period = 60 / previewBpm;
    if (!finite(period) || period <= 0) return [];
    const first = Math.ceil((windowStart - previewOrigin - 0.004) / period);
    const count = Math.min(
      MAX_GRID_LINES,
      Math.max(0, Math.floor((windowEnd - previewOrigin) / period) - first + 2),
    );
    return Array.from({ length: count }, (_, offset) => {
      const index = first + offset;
      const time = previewOrigin + index * period;
      return {
        index,
        time,
        accent: ((index % 4) + 4) % 4 === 0,
        label: ((index % 8) + 8) % 8 + 1,
      };
    }).filter((line) => line.time >= windowStart && line.time <= windowEnd);
  }, [duration, previewBpm, previewOrigin, validDraft, windowEnd, windowStart]);

  const wavePath = useMemo(
    () => waveformPath(waveformWindow(result?.waveform ?? [], duration, windowStart, windowEnd)),
    [duration, result, windowEnd, windowStart],
  );

  const playheadPercent = duration ? clamp((position - windowStart) / windowDuration, 0, 1) * 100 : 0;

  const scheduleClick = useCallback(
    (index: number, targetTime: number, accent: boolean) => {
      const context = audioContextRef.current;
      if (
        !context ||
        context.state !== 'running' ||
        (lastScheduledBeatRef.current !== null && index <= lastScheduledBeatRef.current)
      ) return false;
      const audio = audioRef.current;
      if (!audio || audio.seeking || audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
      const delta = targetTime - audio.currentTime;
      // A small tolerance absorbs media-clock jitter, while preventing a
      // passed beat from becoming an immediate (and repeated) click.
      if (delta < -0.004 || delta > 0.22) return false;
      const delay = Math.max(0, delta);
      const when = context.currentTime + delay / Math.max(0.01, audio.playbackRate || 1);
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(accent ? 1320 : 880, when);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(accent ? 0.14 : 0.075, when + 0.002);
        gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.055);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.onended = () => {
          clickNodesRef.current.delete(oscillator);
          try {
            oscillator.disconnect();
            gain.disconnect();
          } catch {
            // Already disconnected during cleanup.
          }
        };
        clickNodesRef.current.add(oscillator);
        oscillator.start(when);
        oscillator.stop(when + 0.06);
        lastScheduledBeatRef.current = index;
        return true;
      } catch {
        // AudioContext is optional. The waveform preview remains usable.
        return false;
      }
    },
    [],
  );

  const scheduleClicks = useCallback(() => {
    const audio = audioRef.current;
    const context = audioContextRef.current;
    if (
      !audio ||
      !context ||
      context.state !== 'running' ||
      audio.paused ||
      audio.seeking ||
      audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA ||
      !validDraft
    ) return;
    const period = 60 / previewBpm;
    const first = Math.max(0, Math.ceil((audio.currentTime - previewOrigin - 0.004) / period));
    for (let index = first; index <= first + 2; index += 1) {
      const targetTime = previewOrigin + index * period;
      if (targetTime >= 0 && targetTime <= duration) {
        const scheduled = scheduleClick(index, targetTime, index % 4 === 0);
        // The click function only accepts a short look-ahead. Later beats are
        // not candidates yet, so stop until the next animation frame.
        if (!scheduled && targetTime - audio.currentTime > 0.22) break;
      }
    }
  }, [duration, previewBpm, previewOrigin, scheduleClick, validDraft]);

  const tick = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPosition(finite(audio.currentTime) ? audio.currentTime : 0);
    scheduleClicks();
    if (!audio.paused && !audio.ended) frameRef.current = requestAnimationFrame(tick);
  }, [scheduleClicks]);

  const beginFrame = useCallback(() => {
    stopFrame();
    frameRef.current = requestAnimationFrame(tick);
  }, [stopFrame, tick]);

  // `tick` captures the current BPM and phase. Restarting the loop when that
  // callback changes keeps an already playing preview from using stale grid
  // values after the user edits either field.
  useEffect(() => {
    if (playing) beginFrame();
  }, [beginFrame, playing]);

  const ensureClickContext = useCallback(async () => {
    if (!audioContextRef.current) audioContextRef.current = getAudioContext();
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }
  }, []);

  const togglePreview = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    pauseRef.current();
    if (!audio.paused) {
      stopPreview();
      return;
    }
    lastScheduledBeatRef.current = null;
    const request = ++previewRequest.current;
    try {
      // Both requests begin within the same user gesture, before any await (Safari).
      const playPromise = audio.play();
      void playPromise.catch(()=>undefined);
      await Promise.all([playPromise, ensureClickContext()]);
      if (!mountedRef.current||request!==previewRequest.current||audioRef.current!==audio||audio.paused) return;
      setPlaying(true);
      beginFrame();
    } catch {
      if(!mountedRef.current||request!==previewRequest.current)return;
      stopPreview();
      setError('音声を再生できませんでした。もう一度再生ボタンを押してください。');
    }
  }, [audioUrl, beginFrame, ensureClickContext, stopPreview]);

  const seek = useCallback(
    (next: number) => {
      const audio = audioRef.current;
      const value = clamp(next, 0, duration || next);
      if (audio) audio.currentTime = value;
      setPosition(value);
      stopClicks();
      if (playing) beginFrame();
    },
    [beginFrame, duration, playing, stopClicks],
  );

  const onWaveformKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      seek(position - 1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      seek(position + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      seek(windowStart);
    } else if (event.key === 'End') {
      event.preventDefault();
      seek(windowEnd);
    }
  };

  const chooseAudio = (next: File) => {
    pauseRef.current();
    stopPreview(true);
    resetAnalysis();
    setAudioFile(next);
    setSource('audio');
    setPosition(0);
    setError('');
    setMessage('別音声を選択しました。動画と音声の時刻はずれる場合があります。');
  };

  const startAnalysis = async () => {
    if (!analysisInput || busy) return;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    pauseRef.current();
    stopPreview(true);
    setBusy(true);
    setResult(null);
    setBpmText('');
    setOriginText('');
    setError('');
    setHasStarted(true);
    setMessage('音声を準備中…');
    try {
      const next = await analyzeRhythmFile(analysisInput, controller.signal, (progress: string) => {
        if (mountedRef.current && !controller.signal.aborted) setMessage(progress);
      });
      if (controller.signal.aborted || !mountedRef.current) return;
      setResult(next);
      if (!next.beats.length || !next.grid) {
        setMessage('拍を十分に検出できませんでした。別の音声か、手動の拍設定を試してください。');
      } else if (next.grid.variable) {
        setMessage('検出拍が一定の拍として安定しません。固定グリッドの自動適用はできません。');
      } else {
        setMessage('波形と白線を確認し、「1」の位置を合わせてください。');
      }
    } catch (cause) {
      if (!controller.signal.aborted && mountedRef.current) {
        setError(cause instanceof Error ? cause.message : '音声を解析できませんでした。');
        setMessage('解析できませんでした。');
      }
    } finally {
      if (mountedRef.current && controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  };

  const cancelAnalysis = () => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setBusy(false);
    setMessage('解析を中止しました。');
    stopPreview(true);
  };

  const commitBpm = () => {
    const value = Number(bpmText);
    if (finite(value) && value >= MIN_BPM && value <= MAX_BPM) setBpmText(String(value));
    else if (grid && finite(grid.bpm)) setBpmText(String(grid.bpm));
  };

  const commitOrigin = () => {
    const value = Number(originText);
    if (finite(value) && value >= 0 && (!duration || value <= duration)) {
      setOriginText(String(precise(value)));
    } else if (grid && finite(grid.origin)) setOriginText(String(grid.origin));
  };

  const adjustOrigin = (delta: number) => {
    const current = finite(Number(originText)) ? Number(originText) : grid?.origin ?? 0;
    const next = precise(clamp(current + delta, 0, duration || Number.MAX_SAFE_INTEGER));
    setOriginText(String(next));
  };

  const markDanceOne = () => {
    if (!result || !hasBeats || !validDraft) return;
    // Snap to the current fitted grid, preserving any manual phase nudge.
    // Raw detections contain timing jitter and would undo that nudge.
    const period = 60 / previewBpm;
    if (!finite(period) || period <= 0) return;
    const nearestIndex = Math.round((position - previewOrigin) / period);
    const next = previewOrigin + nearestIndex * period;
    if (finite(next)) setOriginText(String(precise(clamp(next, 0, duration || next))));
  };

  const adopt = () => {
    const bpm = Number(bpmText);
    const origin = Number(originText);
    if (!automaticApplyReady || !finite(bpm) || !finite(origin)) return;
    pauseRef.current();
    stopPreview(true);
    if (source === 'video' && file) {
      if(!apply(bpm, origin)){setError('設定を保存できませんでした。動画の読み込みと端末の保存領域を確認して、もう一度お試しください。');return;}
    }
    else applyBpmOnly(bpm);
    setMessage(source === 'video' && file ? 'BPMと拍の位置を設定しました。' : 'BPMだけを設定しました。別音声の時刻は動画へ移しません。');
  };

  const sourceLabel = source === 'video' && file ? '動画の音声' : '別の音声';
  const resultGrid = result?.grid;

  useEffect(() => {
    if (!result || busy) return undefined;
    const frame = requestAnimationFrame(() => {
      resultRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [busy, result]);

  return (
    <section className="rhythm-analysis" aria-label="BPMと拍の自動解析">
      <div className="rhythm-analysis__heading">
        <h2>BPM・拍を音声から調べる</h2>
        <span className="rhythm-analysis__source-badge">{sourceLabel}</span>
      </div>

      <details className="rhythm-analysis__settings" open={!result}>
        <summary>{result ? '音源を選ぶ・再解析' : '音源を選ぶ'}</summary>
        <div className="rhythm-analysis__settings-body">
          <div className="rhythm-analysis__source-row">
            {file && (
              <button
                type="button"
                className={`button mini ${source === 'video' ? 'chosen' : ''}`}
                aria-pressed={source === 'video'}
                onClick={() => {
                  pauseRef.current();
                  stopPreview(true);
                  resetAnalysis();
                  setSource('video');
                  setError('');
                  setMessage('動画の音声を選択しました。');
                }}
              >
                動画の音声
              </button>
            )}
            {audioFile && (
              <button
                type="button"
                className={`button mini ${source === 'audio' ? 'chosen' : ''}`}
                aria-pressed={source === 'audio'}
                onClick={() => {
                  pauseRef.current();
                  stopPreview(true);
                  resetAnalysis();
                  setSource('audio');
                  setError('');
                  setMessage('別音声を選択しました。動画と音声の時刻はずれる場合があります。');
                }}
              >
                選択した音声
              </button>
            )}
            <label className="button mini file-button">
              別の音声を選ぶ
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
                aria-label="BPM解析用の別音声を選ぶ"
                disabled={busy}
                onChange={(event) => {
                  const next = event.target.files?.[0];
                  event.target.value = '';
                  if (next) chooseAudio(next);
                }}
              />
            </label>
          </div>

          {remote && !file && (
            <p className="rhythm-analysis__hint">
              外部動画の音声は直接解析できません。手元の音声を選んでください。別音声からはBPMだけを設定できます。
            </p>
          )}
          {source === 'audio' && audioFile && (
            <p className="rhythm-analysis__hint">
              別音声の時刻は、読み込んだ動画の時刻と一致しない場合があります。動画へ拍の位置を自動適用しません。
            </p>
          )}
          {!analysisInput && (
            <p className="rhythm-analysis__hint">動画の音声、または解析する音声ファイルを選んでください。</p>
          )}
          <p className="rhythm-analysis__hint">解析はこの端末内で行います。初回だけ解析用データをダウンロードします。</p>

          <div className="rhythm-analysis__actions">
            <button type="button" className="button primary" disabled={!analysisInput || busy} onClick={() => void startAnalysis()}>
              {busy ? '解析中…' : hasStarted ? 'もう一度解析' : '解析を開始'}
            </button>
            {busy && (
              <button type="button" className="button" onClick={cancelAnalysis}>
                中止
              </button>
            )}
          </div>
        </div>
      </details>
      {busy && (
        <p className="rhythm-analysis__status" role="status" aria-live="polite">
          {message || '解析中…'}
        </p>
      )}
      {error && <p className="rhythm-analysis__error" role="alert">{error}</p>}

      {result && (
        <div className="rhythm-analysis__result" ref={resultRef}>
          <div className="rhythm-analysis__meta">
            <span>{secondsLabel(duration)}</span>
            <span>{result.beats.length}拍を検出</span>
            {resultGrid && gridIsUsable(resultGrid) && <strong>{resultGrid.bpm.toFixed(3)} BPM</strong>}
          </div>
          <div
            className="rhythm-analysis__waveform"
            role="slider"
            tabIndex={duration ? 0 : -1}
            aria-label="音声の再生位置"
            aria-valuemin={windowStart}
            aria-valuemax={windowEnd}
            aria-valuenow={position}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              if (!rect.width) return;
              seek(windowStart + ((event.clientX - rect.left) / rect.width) * windowDuration);
            }}
            onKeyDown={onWaveformKeyDown}
          >
            <svg viewBox="0 0 1000 144" preserveAspectRatio="none" aria-hidden="true">
              <path className="rhythm-analysis__wave-base" d="M0 72H1000" />
              {wavePath && <path className="rhythm-analysis__wave" d={wavePath} />}
              {previewLines.map((line) => {
                const x = ((line.time - windowStart) / windowDuration) * 1000;
                return (
                  <g key={`${line.index}-${line.time}`} className={line.accent ? 'rhythm-analysis__beat accent' : 'rhythm-analysis__beat'}>
                    <line x1={x} x2={x} y1={line.accent ? 12 : 30} y2="132" />
                    {line.accent && <text x={x + 4} y="22">{line.label}</text>}
                  </g>
                );
              })}
              <line className="rhythm-analysis__playhead" x1={`${playheadPercent * 10}`} x2={`${playheadPercent * 10}`} y1="0" y2="144" />
            </svg>
          </div>
          <div className="rhythm-analysis__wave-labels" aria-hidden="true">
            <span>{secondsLabel(windowStart)}</span>
            <span>{secondsLabel(windowEnd)}</span>
          </div>
          <div className="rhythm-analysis__preview-row">
            <button type="button" className="button mini" disabled={!audioUrl} onClick={() => seek(0)}>最初</button>
            <button type="button" className="button mini" disabled={!audioUrl} onClick={() => seek(duration / 2)}>中間</button>
            <button type="button" className="button mini" disabled={!audioUrl} onClick={() => seek(Math.max(0, duration - 8))}>最後</button>
            <button type="button" className="button mini primary" disabled={!audioUrl} onClick={() => void togglePreview()}>
              {playing ? '停止' : '拍音で再生'}
            </button>
          </div>
          <label className="rhythm-analysis__whole-seek">
            <span>曲全体の再生位置</span>
            <input
              type="range"
              min={0}
              max={duration}
              step="0.01"
              value={clamp(position, 0, duration)}
              onChange={(event) => seek(Number(event.target.value))}
              aria-label="曲全体の再生位置"
            />
            <output>{secondsLabel(position)} / {secondsLabel(duration)}</output>
          </label>
          {hasBeats && (
            <p className="rhythm-analysis__click-note">白線は拍。「1」と「5」の拍音を高くしています。赤線は再生位置です。</p>
          )}

          {resultGrid ? (
            <>
              {resultGrid.variable && (
                <p className="rhythm-analysis__warning" role="alert">
                  検出拍が一定の拍として安定しません。固定BPMの白線は途中でずれる可能性があるため、自動適用を止めています。必要なら手動の拍設定を使ってください。
                </p>
              )}
              <details className="rhythm-analysis__metrics">
                <summary>解析の目安</summary>
                <div className="rhythm-analysis__metrics-body">
                  <div className="rhythm-analysis__grid-readout" aria-label="解析結果">
                    <span>拍のばらつき {finite(resultGrid.errorMs) ? `${resultGrid.errorMs.toFixed(1)}ms` : '—'}</span>
                    <span>区間差 {finite(resultGrid.driftMs) ? `${resultGrid.driftMs.toFixed(1)}ms` : '—'}</span>
                    <span>カバー率 {finite(resultGrid.coverage) ? `${Math.round(resultGrid.coverage * 100)}%` : '—'}</span>
                  </div>
                  <p className="rhythm-analysis__hint">検出拍の整合性を見る目安です。音声や動画の正確さを保証する値ではありません。</p>
                </div>
              </details>
              {hasBeats && (
                <div className="rhythm-analysis__fields">
                  <label className="numeric">
                    <span>BPM <button type="button" className="button mini" aria-label="確認中のBPMを半分にする" disabled={!validDraft||previewBpm<80} onClick={()=>setBpmText(String(previewBpm/2))}>½</button> <button type="button" className="button mini" aria-label="確認中のBPMを2倍にする" disabled={!validDraft||previewBpm>150} onClick={()=>setBpmText(String(previewBpm*2))}>×2</button></span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={MIN_BPM}
                      max={MAX_BPM}
                      step="any"
                      value={bpmText}
                      onChange={(event) => setBpmText(event.target.value)}
                      onBlur={commitBpm}
                      aria-label="解析BPM"
                    />
                  </label>
                  <label className="numeric">
                    <span>「1」の位置（秒）</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={duration || undefined}
                      step="any"
                      value={originText}
                      onChange={(event) => setOriginText(event.target.value)}
                      onBlur={commitOrigin}
                      aria-label="1拍目の位置（秒）"
                    />
                  </label>
                </div>
              )}
              {hasBeats && (
                <div className="rhythm-analysis__nudge-row">
                  <button type="button" className="button mini" disabled={!validDraft} onClick={() => adjustOrigin(-0.01)}>−0.01秒</button>
                  <button type="button" className="button mini" disabled={!validDraft} onClick={() => adjustOrigin(0.01)}>＋0.01秒</button>
                  <button type="button" className="button mini" disabled={!validDraft} onClick={() => adjustOrigin(-(60 / previewBpm))}>−1拍</button>
                  <button type="button" className="button mini" disabled={!validDraft} onClick={() => adjustOrigin(60 / previewBpm)}>＋1拍</button>
                </div>
              )}
              {hasBeats && (
                <button type="button" className="button" disabled={!validDraft} onClick={markDanceOne}>
                  今の再生位置を「1」にする
                </button>
              )}
              <button type="button" className="button primary wide" disabled={!automaticApplyReady} onClick={adopt}>
                {source === 'video' && file ? 'BPMと拍を使う' : 'BPMだけ使う'}
              </button>
              {!automaticApplyReady && !resultGrid.variable && (
                <p className="rhythm-analysis__hint">BPM・拍の位置・検出結果を確認すると適用できます。</p>
              )}
            </>
          ) : (
            <p className="rhythm-analysis__warning" role="alert">
              拍のグリッドを作れませんでした。音源を変えるか、手動の拍設定を使ってください。
            </p>
          )}
        </div>
      )}

      <audio ref={audioRef} src={audioUrl ?? undefined} preload="metadata" className="rhythm-analysis__audio" aria-label="解析音声" />
      {message && !busy && <p className="rhythm-analysis__status" role="status">{message}</p>}
    </section>
  );
}
