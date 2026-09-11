// MOV playback and Web Audio decoding use different container readers on Safari.
// Extract the audio locally; never decode/re-encode the video to analyse its beat.
export const ANALYSIS_SAMPLE_RATE = 22050;
const durationError = '8秒〜10分の音源で解析してください。';
class AudioReadError extends Error {}

function checkDuration(duration: number) {
  if (!Number.isFinite(duration) || duration < 8 || duration > 600) throw new AudioReadError(durationError);
}

async function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new DOMException('解析を中止しました', 'AbortError'));
    signal.addEventListener('abort', abort, {once: true});
    operation.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => {
      signal.removeEventListener('abort', abort); reject(error);
    });
  });
}

// Keep the movie's clock, including leading silence and negative AAC priming.
// Native decoders may discard a container's empty edit: do not rely on it to pad.
export function placeAnalysisAudio(buffer: Pick<AudioBuffer, 'length' | 'sampleRate' | 'numberOfChannels' | 'getChannelData'>, timestamp: number, duration: number) {
  checkDuration(duration);
  if (buffer.sampleRate !== ANALYSIS_SAMPLE_RATE || !Number.isFinite(timestamp)) throw new Error('Invalid analysis audio clock');
  const samples = new Float32Array(Math.ceil(duration * ANALYSIS_SAMPLE_RATE));
  const offset = Math.round(timestamp * ANALYSIS_SAMPLE_RATE);
  const start = Math.max(0, -offset), end = Math.min(buffer.length, samples.length - offset);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = start; i < end; i++) samples[i + offset] += channel[i] / buffer.numberOfChannels;
  }
  return {samples, duration: samples.length / ANALYSIS_SAMPLE_RATE};
}

async function nativeDecode(data: ArrayBuffer, signal: AbortSignal) {
  signal.throwIfAborted();
  const context = new OfflineAudioContext(1, 1, ANALYSIS_SAMPLE_RATE);
  const buffer = await abortable(context.decodeAudioData(data), signal);
  signal.throwIfAborted();
  return buffer;
}

async function extractAudio(file: Blob, signal: AbortSignal, onStage: (message: string) => void) {
  onStage('動画から音声だけを取り出しています…');
  const {Input, BlobSource, ALL_FORMATS, PCM_AUDIO_CODECS, AudioBufferSink, EncodedPacketSink, EncodedAudioPacketSource, Output, BufferTarget, Mp4OutputFormat} = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({source: new BlobSource(file), formats: ALL_FORMATS});
  let output: InstanceType<typeof Output> | undefined, finalized = false, disposed = false;
  const dispose = () => { if (!disposed) { disposed = true; input.dispose(); } };
  const abort = () => { dispose(); void output?.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once: true});
  try {
    signal.throwIfAborted();
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new AudioReadError('この動画には音声トラックがありません。「別の音声を選ぶ」で曲を指定してください。');
    const duration = await input.computeDuration();
    checkDuration(duration);
    const codec = await track.getCodec();
    if (!codec) throw new AudioReadError('この動画の音声形式を読み出せませんでした。MP3・M4A・WAVの別音声でも解析できます。');
    signal.throwIfAborted();
    const pcmCodec = (PCM_AUDIO_CODECS as readonly string[]).includes(codec);

    if (!pcmCodec) {
      // Copy compressed packets, even when AudioDecoder / AudioEncoder are absent.
      // Normalise only the temporary audio file, then restore its original timestamp.
      // Conversion's trim can require an AAC decoder to cut negative priming packets.
      const sink = new EncodedPacketSink(track), first = await sink.getFirstPacket();
      if (!first) throw new AudioReadError('動画の音声が空でした。「別の音声を選ぶ」で曲を指定してください。');
      const target = new BufferTarget(), source = new EncodedAudioPacketSource(codec);
      output = new Output({format: new Mp4OutputFormat(), target});
      output.addAudioTrack(source);
      await output.start();
      const meta = {decoderConfig: (await track.getDecoderConfig()) ?? undefined};
      for await (const packet of sink.packets(first)) {
        signal.throwIfAborted();
        await source.add(packet.clone({timestamp: packet.timestamp - first.timestamp}), meta);
      }
      source.close();
      await output.finalize(); finalized = true;
      signal.throwIfAborted();
      if (!target.buffer) throw new Error('Empty extracted audio');
      onStage('取り出した音声を読み込み中…');
      try {
        const decoded = await nativeDecode(target.buffer, signal);
        return placeAnalysisAudio(decoded, first.timestamp, duration);
      } catch (error) {
        signal.throwIfAborted();
        if (!(await track.canDecode())) throw error;
        // If Web Audio also rejects the audio-only file, try the packet decoder.
      }
    }

    onStage('音声を別の方法で読み込み中…');
    if (!(await track.canDecode())) throw new Error('Audio codec not supported');
    const sampleRate = await track.getSampleRate();
    if (!Number.isFinite(sampleRate) || sampleRate <= 0 || sampleRate * duration > 32_000_000) {
      throw new AudioReadError('この高音質の音声は長すぎます。短く切り出すか、別音声で解析してください。');
    }
    const context = new OfflineAudioContext(1, Math.ceil(duration * ANALYSIS_SAMPLE_RATE), ANALYSIS_SAMPLE_RATE);
    const timeline = context.createBuffer(1, Math.ceil(duration * sampleRate), sampleRate), mono = timeline.getChannelData(0);
    let count = 0;
    // PCM is decoded inside mediabunny and does not require WebCodecs on iPhone.
    for await (const {buffer, timestamp} of new AudioBufferSink(track).buffers()) {
      signal.throwIfAborted();
      if (buffer.sampleRate !== sampleRate) throw new Error('Audio sample rate changed');
      const offset = Math.round(timestamp * sampleRate), start = Math.max(0, -offset), end = Math.min(buffer.length, mono.length - offset);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const channel = buffer.getChannelData(c);
        for (let i = start; i < end; i++) mono[i + offset] += channel[i] / buffer.numberOfChannels;
      }
      count++;
      // Yield even for internally decoded PCM so Cancel and progress can paint.
      if (count % 64 === 0) await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
    if (!count) throw new Error('Empty audio samples');
    signal.throwIfAborted();
    const source = context.createBufferSource(); source.buffer = timeline; source.connect(context.destination); source.start();
    const rendered = await abortable(context.startRendering(), signal);
    signal.throwIfAborted();
    return placeAnalysisAudio(rendered, 0, duration);
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof AudioReadError) throw error;
    throw new AudioReadError('動画から音声を取り出せませんでした。この音声形式に端末が対応していないか、ファイルが不完全な可能性があります。MP3・M4A・WAVの別音声でも解析できます。', {cause: error});
  } finally {
    signal.removeEventListener('abort', abort);
    if (output && !finalized) await output.cancel().catch(() => {});
    dispose();
  }
}

export async function decodeAnalysisAudio(file: Blob, signal: AbortSignal, onStage: (message: string) => void) {
  signal.throwIfAborted();
  if (file.size > 160 * 1024 * 1024) throw new AudioReadError('160MBを超える動画は、音源ファイルを選ぶか短く切り出してください。');
  onStage('動画・音源の音を読み込み中…');
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  signal.throwIfAborted();
  const box = String.fromCharCode(...header.subarray(4, 8));
  const movieContainer = box === 'ftyp' || /^(video\/(quicktime|mp4)|audio\/(mp4|x-m4a))$/.test(file.type)
    || ('name' in file && /\.(mov|mp4|m4a|m4b|m4v)$/i.test(String(file.name)));
  // MOV/MP4 go straight to extraction. Even a successful whole-file native
  // decode can discard their leading edit, so restore the media clock ourselves.
  if (!movieContainer) {
    try {
      const buffer = await nativeDecode(await file.arrayBuffer(), signal);
      return placeAnalysisAudio(buffer, 0, buffer.duration);
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof AudioReadError) throw error;
    }
  }
  return extractAudio(file, signal, onStage);
}
