import type {RhythmAnalysisResult} from './analyzed-grid';

export type RhythmHistoryEntry = {
  key: string;
  source: 'video' | 'audio';
  audio: {blob: Blob; name: string; lastModified: number} | null;
  result: RhythmAnalysisResult;
  bpmText: string;
  originText: string;
  position: number;
  /** Settings that were applied to the production video when this draft was saved. */
  baseline?: {bpm: number; origin: number};
};
type StoredEntry = RhythmHistoryEntry & {version: 1; updatedAt: number; bytes: number};
export const RHYTHM_HISTORY_LIMITS = {items: 10, bytes: 160 * 1024 * 1024};
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const numbers = (a: unknown, max: number): a is number[] => Array.isArray(a) && a.length <= max && a.every(finite);

export function validRhythmHistory(value: unknown): value is StoredEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as StoredEntry, r = v.result, g = r?.grid;
  return v.version === 1 && typeof v.key === 'string' && v.key.length > 0 && v.key.length < 2048
    && (v.source === 'video' || v.source === 'audio') && finite(v.updatedAt) && finite(v.bytes) && v.bytes >= 0
    && typeof v.bpmText === 'string' && v.bpmText.length <= 128 && typeof v.originText === 'string' && v.originText.length <= 128
    && finite(v.position) && v.position >= 0 && Boolean(r) && finite(r.duration) && r.duration >= 8 && r.duration <= 600
    && v.position <= r.duration && typeof r.engine === 'string'
    && numbers(r.beats, 12000) && numbers(r.downbeats, 12000) && numbers(r.waveform, 60001)
    && (g === null || Boolean(g && finite(g.bpm) && g.bpm >= 40 && g.bpm <= 300 && finite(g.origin) && g.origin >= 0
      && finite(g.errorMs) && finite(g.driftMs) && finite(g.coverage) && finite(g.beatCount) && typeof g.variable === 'boolean'))
    && (v.audio === null || Boolean(v.source === 'audio' && v.audio.blob instanceof Blob && typeof v.audio.name === 'string' && finite(v.audio.lastModified)))
    && (v.baseline === undefined || Boolean(v.baseline && finite(v.baseline.bpm) && v.baseline.bpm >= 40 && v.baseline.bpm <= 300 && finite(v.baseline.origin) && v.baseline.origin >= 0));
}

/** A tab-local copy survives navigation even if IndexedDB is unavailable/full. */
export function createRhythmHistoryStore(factory: IDBFactory | undefined, name = 'wotagei-rhythm-history-v1') {
  const memory = new Map<string, StoredEntry>();
  const pending = new Map<string, StoredEntry>();
  const persisted = new WeakSet<StoredEntry>();
  let queue: Promise<unknown> = Promise.resolve(), generation = 0;
  function remember(entry: StoredEntry) {
    memory.delete(entry.key); memory.set(entry.key, entry);
    while (memory.size > RHYTHM_HISTORY_LIMITS.items) memory.delete(memory.keys().next().value!);
  }
  function open(): Promise<IDBDatabase> {
    if (!factory) return Promise.reject(new Error('解析履歴の保存領域を利用できません。'));
    return new Promise((resolve, reject) => {
      const request = factory.open(name, 1); let settled = false;
      const timer = setTimeout(() => { settled = true; reject(new Error('解析履歴を開けませんでした。')); }, 5000);
      request.onupgradeneeded = () => request.result.createObjectStore('results', {keyPath: 'key'});
      request.onsuccess = () => { clearTimeout(timer); if (settled) { request.result.close(); return; } settled = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); };
      request.onerror = () => { clearTimeout(timer); settled = true; reject(request.error); };
    });
  }
  async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, set: (v: T) => void) => void) {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('results', mode); let result: T;
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = tx.onabort = () => { db.close(); reject(tx.error ?? new Error('解析履歴を保存できませんでした。')); };
      try { run(tx.objectStore('results'), v => { result = v; }); } catch (e) { tx.abort(); db.close(); reject(e); }
    });
  }
  function ordered<T>(operation: () => Promise<T>) {
    const next = queue.then(operation, operation); queue = next.catch(() => undefined); return next;
  }
  function removeMatching(matches: (key: string) => boolean) {
    generation++;
    for (const key of memory.keys()) if (matches(key)) memory.delete(key);
    for (const key of pending.keys()) if (matches(key)) pending.delete(key);
    return ordered(() => transaction<void>('readwrite', (store, set) => {
      const request = store.getAllKeys(); request.onsuccess = () => { for (const key of request.result) if (matches(String(key))) store.delete(key); set(); };
    }));
  }
  return {
    peek: (key: string): RhythmHistoryEntry | null => pending.get(key) ?? memory.get(key) ?? null,
    async load(key: string): Promise<RhythmHistoryEntry | null> {
      if (pending.has(key) || memory.has(key)) return pending.get(key) ?? memory.get(key)!;
      const started = generation;
      const entry = await transaction<unknown>('readonly', (store, set) => { const r = store.get(key); r.onsuccess = () => set(r.result); });
      if (started !== generation) return null;
      if (pending.has(key) || memory.has(key)) return pending.get(key) ?? memory.get(key)!; // A newer draft can win while the read was pending.
      if (!validRhythmHistory(entry) || entry.key !== key) return null;
      persisted.add(entry); remember(entry); return entry;
    },
    save(value: RhythmHistoryEntry, persist = true): Promise<boolean> {
      const bytes = (value.audio?.blob.size ?? 0) + (value.result.waveform.length + value.result.beats.length + value.result.downbeats.length) * 8 + 2048;
      const entry: StoredEntry = {...value, version: 1, bytes, updatedAt: Date.now()};
      if (!validRhythmHistory(entry)) return Promise.resolve(false);
      remember(entry);
      if (!persist || bytes > RHYTHM_HISTORY_LIMITS.bytes) { pending.delete(entry.key); return Promise.resolve(false); }
      pending.set(entry.key, entry);
      return ordered(async () => {
        // Superseded writes do not re-copy a large waveform/audio blob.
        if (pending.get(entry.key) !== entry) return true;
        return transaction<boolean>('readwrite', (store, set) => {
          const r = store.getAll();
          r.onsuccess = () => {
            const all = (r.result as StoredEntry[]).filter(v => v.key !== entry.key).sort((a,b) => b.updatedAt - a.updatedAt);
            entry.updatedAt = Math.max(Date.now(), ...all.map(v => finite(v.updatedAt) ? v.updatedAt + 1 : 0));
            let count = 1, total = bytes;
            for (const old of all) {
              if (!validRhythmHistory(old) || count >= RHYTHM_HISTORY_LIMITS.items || total + old.bytes > RHYTHM_HISTORY_LIMITS.bytes) {
                store.delete(old.key);
                const cached = memory.get(old.key);
                if (cached && persisted.has(cached) && !pending.has(old.key) && cached.updatedAt <= old.updatedAt) memory.delete(old.key);
              }
              else { count++; total += old.bytes; }
            }
            store.put(entry); set(true);
          };
        });
      }).then(saved => { if (saved) persisted.add(entry); return saved; }).catch(() => false).finally(() => { if (pending.get(entry.key) === entry) pending.delete(entry.key); });
    },
    remove: (key: string) => removeMatching(k => k === key),
    removeMatching,
    clear() {
      generation++; memory.clear(); pending.clear();
      return ordered(() => transaction<void>('readwrite', (store, set) => { store.clear(); set(); }));
    },
  };
}

let browserStore: ReturnType<typeof createRhythmHistoryStore> | undefined;
export function rhythmHistory() {
  return browserStore ??= createRhythmHistoryStore(typeof indexedDB === 'undefined' ? undefined : indexedDB);
}
