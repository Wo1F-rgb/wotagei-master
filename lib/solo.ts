type PreviewMedia = { pause(): void; muted: boolean; playbackRate: number };
/** BPM tapping must use the selected source at its original speed, with its own audio. */
export function prepareSoloPlayback(selected: PreviewMedia, other: PreviewMedia | null) {
  other?.pause();
  if (other) other.muted = true;
  selected.playbackRate = 1;
  selected.muted = false;
}
export function restoreComparisonAudio(reference: PreviewMedia | null, self: PreviewMedia | null, source:0|1=0) {
  if (reference) reference.muted = source!==0;
  if (self) self.muted = source!==1;
}
