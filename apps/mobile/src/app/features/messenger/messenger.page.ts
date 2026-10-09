import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { REACTION_EMOJI, REACTION_LABEL, type ReactionKind } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import type { AppNotification } from '../../core/api/types';
import { PageHeaderComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { countdown, dayLabel, relativeTime } from '../../shared/format';

interface Row {
  key: string;
  icon: string;
  text: string;
  at: string;
  unread: boolean;
  ids: string[];
  go: () => void;
  actions?: boolean;
  requestId?: string;
}

/** Notifications : demandes d'amis, encouragements, commentaires, niveaux d'amis, rappels. */
@Component({
  selector: 'app-messenger',
  imports: [IonContent, IonRefresher, IonRefresherContent, PageHeaderComponent, EmptyComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <lu-page-header [back]="true" eyebrow="Activité" icon="bell" title="Notifications">
        <div actions><button type="button" class="lu-btn small ghost" [disabled]="!unread()" (click)="markAll()">Tout marquer comme lu</button></div>
      </lu-page-header>
      <div class="lu-page">
        @if (reminder(); as r) {
          <article class="lu-card gold rem"><lu-icon name="clock" [size]="18" /><span>{{ r }}</span></article>
        }
        @for (g of groups(); track g.label) {
          <p class="day">{{ g.label }}</p>
          @for (r of g.rows; track r.key) {
            <article class="row" [class.unread]="r.unread">
              <span class="ic"><lu-icon [name]="r.icon" [size]="18" /></span>
              <div class="tx">
                <button type="button" class="open" (click)="open(r)"><p>{{ r.text }}</p><span class="xs muted">{{ ago(r.at) }}</span></button>
                @if (r.actions) {
                  <div class="acts">
                    <button type="button" class="lu-btn small mint" (click)="answer(r, true)">Accepter</button>
                    <button type="button" class="lu-btn small ghost" (click)="answer(r, false)">Pas maintenant</button>
                  </div>
                }
              </div>
              @if (r.unread) { <span class="dot" role="img" aria-label="Non lue"></span> }
            </article>
          }
        } @empty {
          <lu-empty icon="bell" title="Rien pour le moment" text="Quand un ami t’encouragera ou t’écrira, tu le verras ici." />
        }
      </div>
    </ion-content>
  `,
  styles: `
    .rem { flex-direction: row; align-items: center; gap: 12px; font-size: 13px; }
    .day { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--lu-muted); margin: 6px 0 -8px; }
    .row { display: flex; align-items: flex-start; gap: 12px; padding: 14px; border-radius: 18px; background: var(--lu-surface); border: 1px solid var(--lu-border); cursor: pointer; }
    .row.unread { background: var(--lu-surface-2); border-color: var(--lu-border-strong); }
    .row.unread p { font-weight: 700; }
    .ic { width: 36px; height: 36px; border-radius: 50%; background: var(--lu-surface-2); display: grid; place-items: center; color: var(--lu-accent); flex: none; }
    .open { background: none; border: 0; padding: 0; text-align: left; color: inherit; font: inherit; cursor: pointer; display: flex; flex-direction: column; gap: 4px; }
    .tx { flex: 1; display: flex; flex-direction: column; gap: 4px; min-width: 0; } .tx p { font-size: 13px; line-height: 1.45; }
    .acts { display: flex; gap: 8px; margin-top: 6px; }
    .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--lu-gold); margin-top: 6px; flex: none; }
  `,
})
export class MessengerPage {
  protected game = inject(GameService);
  protected social = inject(SocialService);
  private be = inject(BackendService);
  private ui = inject(UiService);
  readonly items = signal<AppNotification[]>([]);
  readonly ago = (iso: string) => relativeTime(iso, this.game.now());
  readonly unread = computed(() => this.items().some((n) => !n.readAt));

  /** Rappel de quêtes (calculé en local, comme la notification de rappel quotidien). */
  readonly reminder = computed(() => {
    const left = this.game.dailyLeft();
    return left > 0 ? `Il te reste ${left} quête${left > 1 ? 's' : ''} et ${countdown(this.game.resetIn())} avant le renouvellement.` : null;
  });

  readonly rows = computed<Row[]>(() => {
    const out: Row[] = [];
    const reactionGroups = new Map<string, AppNotification[]>();
    const commentGroups = new Map<string, AppNotification[]>();
    for (const n of this.items()) {
      const p = n.payload;
      switch (n.type) {
        case 'friend_request':
          out.push({ key: n.id, icon: 'user-plus', text: `${p['username']} souhaite devenir ton ami.`, at: n.createdAt, unread: !n.readAt, ids: [n.id], actions: true, requestId: p['request'], go: () => this.ui.go('/companions') });
          break;
        case 'friend_accepted':
          out.push({ key: n.id, icon: 'users', text: `${p['username']} a accepté ta demande.`, at: n.createdAt, unread: !n.readAt, ids: [n.id], go: () => this.ui.go(['/companions', p['username']]) });
          break;
        case 'friend_level':
          out.push({ key: n.id, icon: 'crown', text: `${p['username']} a atteint le niveau ${p['level']}.`, at: n.createdAt, unread: !n.readAt, ids: [n.id], go: () => this.ui.go(p['post'] ? ['/post', p['post']] : '/tabs/village') });
          break;
        case 'reaction':
          reactionGroups.set(p['post'], [...(reactionGroups.get(p['post']) ?? []), n]);
          break;
        case 'comment':
          commentGroups.set(p['post'], [...(commentGroups.get(p['post']) ?? []), n]);
          break;
        default:
          out.push({ key: n.id, icon: 'bell', text: String(p['text'] ?? 'Nouvelle notification'), at: n.createdAt, unread: !n.readAt, ids: [n.id], go: () => undefined });
      }
    }
    const names = (list: AppNotification[]) => {
      const u = [...new Set(list.map((n) => n.payload['username']))];
      return u.length === 1 ? u[0] : `${u[0]} et ${u.length - 1} autre${u.length > 2 ? 's' : ''}`;
    };
    for (const [post, list] of reactionGroups) {
      const k = list[0].payload['kind'] as ReactionKind;
      out.push({ key: 'r' + post, icon: 'heart', text: `${names(list)} ${list.length > 1 || [...new Set(list.map((n) => n.payload['username']))].length > 1 ? 'ont' : 'a'} réagi à ta publication ${REACTION_EMOJI[k] ?? ''}`, at: list[0].createdAt, unread: list.some((n) => !n.readAt), ids: list.map((n) => n.id), go: () => this.ui.go(['/post', post]) });
    }
    for (const [post, list] of commentGroups) {
      out.push({ key: 'c' + post, icon: 'message', text: `${names(list)} a commenté ta publication.`, at: list[0].createdAt, unread: list.some((n) => !n.readAt), ids: list.map((n) => n.id), go: () => this.ui.go(['/post', post]) });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  });

  readonly groups = computed(() => {
    const out: { label: string; rows: Row[] }[] = [];
    for (const r of this.rows()) {
      const label = dayLabel(r.at, this.game.now());
      const last = out[out.length - 1];
      if (last?.label === label) last.rows.push(r);
      else out.push({ label, rows: [r] });
    }
    return out;
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.items.set(await this.be.social.notifications());
    } catch {
      /* hors ligne */
    }
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.load();
    await this.social.loadUnread();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  async open(r: Row): Promise<void> {
    if (r.unread) {
      await Promise.all(r.ids.map((id) => this.be.social.markRead(id)));
      this.items.update((l) => l.map((n) => (r.ids.includes(n.id) ? { ...n, readAt: new Date().toISOString() } : n)));
      void this.social.loadUnread();
    }
    r.go();
  }

  async answer(r: Row, accept: boolean): Promise<void> {
    if (!r.requestId) return;
    // En cloud l'identifiant de demande est celui de la ligne friendships ; en local, celui du profil.
    const res = await this.be.social.respond(r.requestId, accept);
    if (res === 'accepted') this.game.toast('Nouvel ami !', 'success');
    await Promise.all(r.ids.map((id) => this.be.social.markRead(id)));
    await Promise.all([this.load(), this.social.loadUnread(), this.social.loadRequests()]);
  }

  async markAll(): Promise<void> {
    await this.be.social.markAllRead();
    await this.load();
    void this.social.loadUnread();
  }
}
