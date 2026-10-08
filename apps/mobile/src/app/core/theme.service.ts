import { Injectable, effect, inject } from '@angular/core';
import { GameService } from './game.service';

/** Thème clair « parchemin » / sombre « donjon » / automatique, sons et animations réduites. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private game = inject(GameService);

  constructor() {
    effect(() => {
      const s = this.game.settings();
      if (!s) return;
      this.apply(s.theme, s.reducedMotion);
    });
  }

  init(): void {
    /* l'effet est enregistré dans le constructeur (contexte d'injection) */
  }

  apply(theme: 'auto' | 'light' | 'dark', reducedMotion: boolean): void {
    const root = document.documentElement;
    if (theme === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    root.classList.toggle('reduce-motion', reducedMotion);
    const dark = theme === 'dark' || (theme === 'auto' && !matchMedia('(prefers-color-scheme: light)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#0b1a14' : '#f6f0e1');
    try {
      localStorage.setItem('levelup-theme', theme);
      localStorage.setItem('levelup-reduce-motion', reducedMotion ? '1' : '0');
    } catch {
      /* stockage indisponible */
    }
  }
}
