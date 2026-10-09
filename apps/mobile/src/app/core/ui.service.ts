import { Injectable, inject } from '@angular/core';
import { ActionSheetController, AlertController, NavController } from '@ionic/angular';
import { GameService } from './game.service';

/** Navigation, menu secondaire, confirmations. */
@Injectable({ providedIn: 'root' })
export class UiService {
  private sheet = inject(ActionSheetController);
  private alert = inject(AlertController);
  readonly nav = inject(NavController);
  private game = inject(GameService);

  go(path: string | unknown[], extras?: Record<string, unknown>): void {
    void this.nav.navigateForward(path as string, extras);
  }

  /** Menu secondaire : Amis, Catalogue, Créer une quête, Succès, Réglages. */
  async bag(): Promise<void> {
    const forge = this.game.unlocks().forge;
    const sheet = await this.sheet.create({
      header: 'Menu',
      cssClass: 'lu-sheet',
      buttons: [
        { text: 'Mes amis', icon: undefined, handler: () => this.go('/companions') },
        { text: 'Catalogue — toutes les quêtes', handler: () => this.go('/grimoire') },
        { text: forge ? 'Créer une quête' : 'Créer une quête (niveau 2)', handler: () => (forge ? this.go('/forge') : this.game.toast('Créer ses propres quêtes s’ouvre au niveau 2.', 'info')) },
        { text: 'Succès', handler: () => this.go('/trophies') },
        { text: 'Réglages', handler: () => this.go('/settings') },
        { text: 'Fermer', role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** Liste de choix (feuille d'actions). Renvoie la valeur choisie, ou null. */
  async choose<T extends string>(header: string, options: { text: string; value: T }[]): Promise<T | null> {
    return new Promise<T | null>(async (resolve) => {
      const s = await this.sheet.create({
        header,
        cssClass: 'lu-sheet',
        buttons: [...options.map((o) => ({ text: o.text, handler: () => resolve(o.value) })), { text: 'Fermer', role: 'cancel', handler: () => resolve(null) }],
      });
      s.onDidDismiss().then(() => resolve(null));
      await s.present();
    });
  }

  async confirm(opts: { title: string; message?: string; confirm: string; danger?: boolean }): Promise<boolean> {
    return new Promise<boolean>(async (resolve) => {
      const a = await this.alert.create({
        header: opts.title,
        message: opts.message,
        cssClass: 'lu-alert',
        buttons: [
          { text: 'Annuler', role: 'cancel', handler: () => resolve(false) },
          { text: opts.confirm, role: opts.danger ? 'destructive' : 'confirm', handler: () => resolve(true) },
        ],
        backdropDismiss: true,
      });
      a.onDidDismiss().then(() => resolve(false));
      await a.present();
    });
  }

  async prompt(opts: { title: string; message?: string; placeholder?: string; confirm: string; value?: string }): Promise<string | null> {
    return new Promise<string | null>(async (resolve) => {
      const a = await this.alert.create({
        header: opts.title,
        message: opts.message,
        cssClass: 'lu-alert',
        inputs: [{ name: 'v', type: 'text', placeholder: opts.placeholder, value: opts.value }],
        buttons: [
          { text: 'Annuler', role: 'cancel', handler: () => resolve(null) },
          { text: opts.confirm, role: 'confirm', handler: (d: { v: string }) => resolve(d.v) },
        ],
      });
      a.onDidDismiss().then(() => resolve(null));
      await a.present();
    });
  }
}
