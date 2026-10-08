import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';

/** Intégration native (Android / iOS) : liens profonds, bouton retour, barre d'état, écran de démarrage. */
@Injectable({ providedIn: 'root' })
export class NativeService {
  private router = inject(Router);
  private nav = inject(NavController);

  async init(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      const { App } = await import('@capacitor/app');
      // https://levelup.app/i/CODE ou app.levelup.mobile://callback#… → route interne
      await App.addListener('appUrlOpen', ({ url }) => {
        try {
          const u = new URL(url);
          const path = u.protocol.startsWith('http') ? u.pathname + u.search + u.hash : `/auth/callback${u.search}${u.hash}`;
          void this.router.navigateByUrl(path);
        } catch {
          /* lien invalide */
        }
      });
      await App.addListener('backButton', () => {
        const root = ['/tabs/tavern', '/auth', '/onboarding'].some((p) => this.router.url.startsWith(p));
        if (root) void App.exitApp();
        else void this.nav.back();
      });
    } catch {
      /* plugin indisponible */
    }
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === 'android') await StatusBar.setBackgroundColor({ color: '#0b1a14' });
    } catch {
      /* ignore */
    }
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch {
      /* ignore */
    }
  }
}
