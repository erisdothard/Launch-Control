# Audio credits

## v8-loop-v1.mp3

- Source: "Maserati GranTurismo S Exhaust" by lmartins, via Wikimedia Commons
  https://commons.wikimedia.org/wiki/File:Maserati_GranTurismo_S_Exhaust.ogg
  (original on Freesound: https://freesound.org/people/lmartins/sounds/465453/)
- License: CC BY 4.0 https://creativecommons.org/licenses/by/4.0
- Changes: 5.5 s idle segment (3.0 s to 8.5 s of the original) cut as a loop, mono, 44.1 kHz,
  loudness-normalised to -18 LUFS, 80 ms fade in/out. Pitched at runtime by engine rpm
  (WebAudio playbackRate, idle = 1.0).
- No .ogg shipped: the local ffmpeg build has no libvorbis. mp3 decodes everywhere WebAudio runs.
- Attribution text for the site footer: "Engine audio: Maserati GranTurismo S Exhaust by lmartins, CC BY 4.0".
- Fallback: if the file fails to load or decode, `src/lib/audio.ts` synthesises an oscillator-bank
  plus noise stand-in pitched to rpm.
