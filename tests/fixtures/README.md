# Synthetic audio fixture

`synthetic-150-aac.mov` contains 12 seconds of generated drum pulses and a sine tone from `rhythmFixture(150, {seconds: 12, noise: 0})` in `../audio-fixtures.mjs`. It contains no music recordings, people, or user-uploaded media.

Generated as 22,050 Hz mono 16-bit WAV, then packaged with FFmpeg using `-c:a aac -b:a 48k -f mov`. The QuickTime brand and negative AAC priming/edit list are intentional. The browser test also creates a 500 ms leading edit and a PCM MOV without audio encoders. Tests compare decoded samples and timeline positions rather than using a fixed expected BPM as a substitute for decoding.

`sync-120.mp4` and `sync-150.mp4` add 30 seconds of solid-color H.264 video (320×180, 30 fps) to generated 120/150 BPM audio (22,050 Hz mono AAC). They exercise real video decoding, unequal playback rates, audio-clock startup, beat analysis and saved settings. Generate them with `node tests/make-sync-fixtures.mjs` (FFmpeg required). They contain no user media or recorded music. `node tests/built-sync.mjs` runs them against the built application; optional `SYNC_REFERENCE` and `SYNC_SELF` paths allow local-only verification of other videos.
