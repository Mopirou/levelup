import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { BackendService } from './backend.service';

/** Rappels locaux (quotidien, fin de semaine) et enregistrement des notifications push (FCM / APNs). */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private be = inject(BackendService);
  readonly native = Capacitor.isNativePlatform();

  async requestPermission(): Promise<boolean> {
    try {
      if (this.native) {
        const { LocalNotifications } = await import('@capacitor/local-notifications');
        const r = await LocalNotifications.requestPermissions();
        return r.display === 'granted';
      }
      if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
    } catch {
      /* refusé ou indisponible */
    }
    return false;
  }

  /** Programme le rappel quotidien (même hors ligne) et celui de fin de semaine. */
  async schedule(opts: { daily: boolean; dailyTime: string; weekEnd: boolean }): Promise<void> {
    if (!this.native) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: [{ id: 1001 }, { id: 1002 }] });
      const notifications = [];
      if (opts.daily) {
        const [h, m] = opts.dailyTime.split(':').map(Number);
        notifications.push({ id: 1001, title: 'Tes quêtes du jour t’attendent', body: 'Un petit pas suffit pour garder ta flamme.', schedule: { on: { hour: h, minute: m }, allowWhileIdle: true } });
      }
      if (opts.weekEnd) {
        notifications.push({ id: 1002, title: 'La semaine touche à sa fin', body: 'Il te reste quelques jours pour terminer tes quêtes hebdomadaires.', schedule: { on: { weekday: 1, hour: 18, minute: 0 }, allowWhileIdle: true } });
      }
      if (notifications.length) await LocalNotifications.schedule({ notifications });
    } catch {
      /* permissions refusées */
    }
  }

  /** Notification locale à la fin d'un minuteur de quête. */
  async notifyAt(at: Date, title: string, body: string): Promise<void> {
    if (!this.native) return;
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.schedule({ notifications: [{ id: 2000 + Math.floor(Math.random() * 900), title, body, schedule: { at } }] });
    } catch {
      /* ignore */
    }
  }

  async registerPush(): Promise<void> {
    if (!this.native || this.be.mode !== 'cloud') return;
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return;
      await PushNotifications.addListener('registration', (t) => void this.be.social.registerDevice(t.value, Capacitor.getPlatform() === 'ios' ? 'ios' : 'android'));
      await PushNotifications.register();
    } catch {
      /* push non configuré */
    }
  }
}
