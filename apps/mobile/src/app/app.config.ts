import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withPreloading, PreloadAllModules } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { routes } from './app.routes';
import { BackendService } from './core/backend.service';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withPreloading(PreloadAllModules)),
    provideIonicAngular({ mode: 'md', animated: true, swipeBackEnabled: true }),
    provideAppInitializer(async () => {
      // Les services sont récupérés avant le premier await (contexte d'injection).
      const backend = inject(BackendService);
      const auth = inject(AuthService);
      const theme = inject(ThemeService);
      await backend.init();
      await auth.init();
      theme.init();
    }),
  ],
};
