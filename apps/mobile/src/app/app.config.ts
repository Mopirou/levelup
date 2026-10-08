import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideServiceWorker } from '@angular/service-worker';
import { provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { BackendService } from './core/backend.service';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { NativeService } from './core/native.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
    provideIonicAngular({ mode: 'md', animated: true, swipeBackEnabled: true }),
    provideAppInitializer(async () => {
      // Les services sont récupérés avant le premier await (contexte d'injection).
      const backend = inject(BackendService);
      const auth = inject(AuthService);
      const theme = inject(ThemeService);
      const native = inject(NativeService);
      await backend.init();
      await auth.init();
      theme.init();
      void native.init();
    }),
  ],
};
