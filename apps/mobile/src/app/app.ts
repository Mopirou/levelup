import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';
import { OverlayHostComponent } from './shared/overlay-host.component';
import { ToastHostComponent } from './shared/toast-host.component';

@Component({
  selector: 'app-root',
  imports: [IonApp, IonRouterOutlet, OverlayHostComponent, ToastHostComponent],
  template: `
    <ion-app>
      <ion-router-outlet></ion-router-outlet>
      <lu-overlay-host />
      <lu-toast-host />
    </ion-app>
  `,
})
export class App {}
