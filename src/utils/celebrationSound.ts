// A short, synthesized celebration chime — no audio file to ship, no stock-sound
// cheese. An ascending major arpeggio (C–E–G–C) on a soft triangle wave with a
// quick decay reads triumphant without being tacky. Fully self-contained; fails
// silent if Web Audio isn't available or the browser blocks it (autoplay policy).
//
// Iris has no other sound (Scott, 2026-07-18: "apps are weirdly silent, I agree")
// — this is the first, deliberately reserved for a big rare moment.

let ctx: AudioContext | null = null;

export function playCelebrationChime(): void {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    // Browsers start the context suspended until a user gesture; resume is a
    // no-op if already running. A gesture (login/click) has happened by now.
    if (ctx.state === 'suspended') void ctx.resume();

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const start = now + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
      osc.connect(gain);
      gain.connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.55);
    });
  } catch {
    /* audio unavailable — celebration is still fully functional without it */
  }
}
