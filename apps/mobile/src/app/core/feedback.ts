import { Capacitor } from '@capacitor/core';

/** Retours sensoriels : vibration légère et sons courts synthétisés (aucun fichier audio à charger). */
let ctx: AudioContext | null = null;

export async function haptic(kind: 'light' | 'success' = 'light'): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
      if (kind === 'success') await Haptics.notification({ type: NotificationType.Success });
      else await Haptics.impact({ style: ImpactStyle.Light });
    } else if (navigator.vibrate) {
      navigator.vibrate(kind === 'success' ? [18, 40, 28] : 12);
    }
  } catch {
    /* non disponible */
  }
}

function tone(freq: number, start: number, dur: number, vol = 0.07, type: OscillatorType = 'sine'): void {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, ctx.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, ctx.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.05);
}

export function playSound(name: 'xp' | 'level' | 'trophy' | 'tap', enabled: boolean): void {
  if (!enabled) return;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    switch (name) {
      case 'tap':
        tone(660, 0, 0.08, 0.04);
        break;
      case 'xp':
        tone(523, 0, 0.14);
        tone(784, 0.1, 0.22);
        break;
      case 'trophy':
        tone(659, 0, 0.12);
        tone(880, 0.1, 0.12);
        tone(1175, 0.2, 0.3);
        break;
      case 'level':
        [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, 0.08, 'triangle'));
        break;
    }
  } catch {
    /* audio bloqué */
  }
}
