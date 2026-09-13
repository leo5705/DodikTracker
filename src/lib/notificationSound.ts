// Subtle, pleasant notification chime using Web Audio API

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playNotificationSound(type?: string) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Distinct pleasant pitch per category
    let note1 = 587.33; // D5
    let note2 = 880.00; // A5

    if (type === 'ACHIEVEMENT_UNLOCKED') {
      note1 = 523.25; // C5
      note2 = 1046.50; // C6 fanfare
    } else if (type === 'NEW_MESSAGE') {
      note1 = 659.25; // E5
      note2 = 783.99; // G5
    } else if (type === 'ADMIN_ALERT' || type === 'SYSTEM') {
      note1 = 440.00; // A4
      note2 = 659.25; // E5
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';

    osc1.frequency.setValueAtTime(note1, now);
    osc1.frequency.exponentialRampToValueAtTime(note2, now + 0.12);

    osc2.frequency.setValueAtTime(note2, now + 0.08);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now + 0.08);

    osc1.stop(now + 0.35);
    osc2.stop(now + 0.35);
  } catch (err) {
    // Non-blocking fallback for autoplay policies
  }
}
