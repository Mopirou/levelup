import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => document.getElementById('boot')?.remove())
  .catch((err) => {
    console.error(err);
    const b = document.getElementById('boot');
    if (b) b.innerHTML = '<span>Oups, impossible de démarrer. Recharge la page.</span>';
  });
