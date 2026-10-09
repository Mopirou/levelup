import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { IonContent, IonInfiniteScroll, IonInfiniteScrollContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import { BackendService } from '../../core/backend.service';
import { AuthService } from '../../core/auth.service';
import { GameService } from '../../core/game.service';
import { PostActions } from '../../core/post-actions';
import { PostQueue } from '../../core/post-queue';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { env } from '../../core/env';
import type { FeedPost, FriendRow, LeaderRow } from '../../core/api/types';
import { PageHeaderComponent, AvatarComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { PostCardComponent } from '../../shared/post-card.component';
import { dayLabel, fmt } from '../../shared/format';

@Component({
  selector: 'app-village',
  imports: [IonContent, IonRefresher, IonRefresherContent, IonInfiniteScroll, IonInfiniteScrollContent, PageHeaderComponent, AvatarComponent, EmptyComponent, IconComponent, PostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>

      <lu-page-header eyebrow="Amis" icon="users" title="Fil des amis">
        <div actions>
          <button type="button" class="lu-icon-btn" aria-label="Mes amis" (click)="ui.go('/companions')"><lu-icon name="user-plus" [size]="17" /></button>
        </div>
      </lu-page-header>

      <div class="lu-page">
        <div class="lu-seg" role="tablist">
          <button type="button" role="tab" [class.on]="tab() === 'feed'" [attr.aria-selected]="tab() === 'feed'" (click)="tab.set('feed')"> Fil </button>
          @if (game.settings()?.leaderboardOptIn !== false) {
            <button type="button" role="tab" [class.on]="tab() === 'board'" [attr.aria-selected]="tab() === 'board'" (click)="openBoard()">Classement</button>
          }
        </div>

        @if (tab() === 'feed') {
          <!-- Cercle -->
          <section class="lu-card tap circle" (click)="ui.go('/companions')" role="link" tabindex="0" (keydown.enter)="ui.go('/companions')">
            <div class="stack">
              @for (f of friends().slice(0, 4); track f.profileId; let i = $index) {
                <span class="s" [style.z-index]="10 - i"><lu-avatar [name]="f.name" [size]="32" [tone]="i % 2 ? 'gold' : 'dark'" [ring]="'var(--lu-bg)'" /></span>
              }
            </div>
            <div class="ctext">
              <strong>Ton cercle · {{ friends().length }} ami{{ friends().length > 1 ? 's' : '' }}</strong>
              <span class="xs muted">@if (social.requests().length) { {{ social.requests().length }} demande{{ social.requests().length > 1 ? 's' : '' }} en attente } @else { Pas d’abonnés publics. Juste tes amis. }</span>
            </div>
            <span class="lu-link">Gérer →</span>
          </section>

          <!-- Composer -->
          <button type="button" class="lu-card flat composer" (click)="ui.go('/publish')" aria-label="Partager un moment">
            <lu-avatar [name]="game.character()?.name ?? ''" [size]="38" tone="light" />
            <span class="ph">Quelque chose à partager ?</span>
            <lu-icon name="camera" [size]="18" />
          </button>

          @if (fresh() > 0) {
            <button type="button" class="lu-btn mint small fresh" (click)="reload()">{{ fresh() }} nouvelle{{ fresh() > 1 ? 's' : '' }} publication{{ fresh() > 1 ? 's' : '' }}</button>
          }

          @if (loading() && !posts().length) {
            <div class="lu-skeleton" style="height: 220px"></div>
            <div class="lu-skeleton" style="height: 180px"></div>
          } @else if (!posts().length) {
            <lu-empty icon="users" title="Rien pour le moment" text="Invite des amis pour suivre leur progression ici.">
              <button type="button" class="lu-btn" (click)="shareCode()"><lu-icon name="share" [size]="17" /> Partager mon code ami</button>
              <button type="button" class="lu-btn ghost" (click)="ui.go('/companions')"><lu-icon name="search" [size]="17" /> Trouver des amis</button>
            </lu-empty>
          } @else {
            <section class="lu-section">
              <div class="lu-section-title"><h2>Les nouvelles de tes amis</h2></div>
              @for (g of groups(); track g.label) {
                <p class="day">{{ g.label }}</p>
                @for (p of g.posts; track p.id) {
                  <lu-post-card
                    [post]="p"
                    [now]="game.now()"
                    (react)="react(p, $event)"
                    (comments)="ui.go(['/post', p.id])"
                    (menu)="menu(p)"
                    (profile)="openProfile(p)"
                    (reactors)="actions.showReactors(p)"
                  />
                }
              }
            </section>
            <ion-infinite-scroll [disabled]="!hasMore()" (ionInfinite)="more($event)">
              <ion-infinite-scroll-content />
            </ion-infinite-scroll>
            <p class="xs dim center">Visible uniquement par tes amis.</p>
          }
        } @else {
          <!-- Classement -->
          <section class="lu-section">
            <div class="lu-section-title"><h2>Tes amis cette semaine</h2></div>
            <p class="small muted">XP de la semaine en cours, remise à zéro lundi. Les quêtes personnalisées comptent pour 30 % maximum.</p>
            @if (!board().length) {
              <lu-empty icon="trophy" title="Pas encore de classement" text="Invite des amis pour comparer vos semaines, sans pression." />
            } @else {
              <div class="podium">
                @for (r of podium(); track r.profileId; let i = $index) {
                  <div class="pod" [class.first]="r.rank === 1">
                    <lu-avatar [name]="r.name" [size]="r.rank === 1 ? 62 : 48" [tone]="r.rank === 1 ? 'gold' : 'dark'" [ring]="r.frameColor" />
                    <strong>{{ r.name.split(' ')[0] }}</strong>
                    <span class="xs gold">{{ fmt(r.xp) }} XP</span>
                    <span class="bar" [style.height.px]="r.rank === 1 ? 70 : r.rank === 2 ? 52 : 38">{{ r.rank }}</span>
                  </div>
                }
              </div>
              <div class="lu-card flat list">
                @for (r of board(); track r.profileId; let i = $index) {
                  <div class="lrow" [class.me]="r.profileId === myId()">
                    <span class="rk">{{ i + 1 }}</span>
                    <lu-avatar [name]="r.name" [size]="34" [ring]="r.frameColor" />
                    <span class="nm">{{ r.name }}<small class="xs muted"> · Niv. {{ r.level }}</small></span>
                    <strong class="gold small">{{ fmt(r.xp) }} XP</strong>
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
    </ion-content>
  `,
  styles: `
    .circle { flex-direction: row; align-items: center; gap: 14px; padding: 14px; }
    .stack { display: flex; }
    .stack .s { margin-left: -10px; }
    .stack .s:first-child { margin-left: 0; }
    .ctext { flex: 1; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
    .ctext strong { font-size: 14px; }
    .composer { flex-direction: row; align-items: center; gap: 12px; cursor: pointer; width: 100%; text-align: left; color: var(--lu-text); font: inherit; }
    .composer .ph { flex: 1; color: var(--lu-muted); font-size: 13px; }
    .composer lu-icon { color: var(--lu-accent); }
    .fresh { align-self: center; }
    .day { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--lu-muted); margin-top: 6px; }
    .center { text-align: center; }
    .podium { display: flex; justify-content: center; align-items: flex-end; gap: 14px; padding: 8px 0; }
    .pod { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 90px; }
    .pod strong { font-size: 13px; }
    .pod .bar { width: 100%; display: grid; place-items: center; border-radius: 12px 12px 0 0; background: var(--lu-surface-2); font: 700 18px var(--lu-font-title); color: var(--lu-text-2); }
    .pod.first .bar { background: var(--lu-gold-bg); color: var(--lu-gold); }
    .list { padding: 8px 14px; gap: 0; }
    .lrow { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--lu-border); }
    .lrow:last-child { border-bottom: 0; }
    .lrow.me .nm { color: var(--lu-accent); font-weight: 700; }
    .rk { width: 20px; text-align: center; font: 700 13px var(--lu-font-body); color: var(--lu-muted); }
    .nm { flex: 1; font-size: 14px; }
  `,
})
export class VillagePage implements OnDestroy {
  protected game = inject(GameService);
  protected social = inject(SocialService);
  protected ui = inject(UiService);
  protected actions = inject(PostActions);
  private be = inject(BackendService);
  private auth = inject(AuthService);
  private queue = inject(PostQueue);
  readonly fmt = fmt;
  readonly tab = signal<'feed' | 'board'>('feed');
  readonly posts = signal<FeedPost[]>([]);
  readonly friends = signal<FriendRow[]>([]);
  readonly board = signal<LeaderRow[]>([]);
  readonly loading = signal(true);
  readonly hasMore = signal(false);
  readonly fresh = signal(0);
  readonly myId = computed(() => this.be.game.userId());
  private seenVersion = this.social.feedVersion();

  readonly groups = computed(() => {
    const out: { label: string; posts: FeedPost[] }[] = [];
    void this.queue.queued();
    for (const p of [...this.queue.asFeed(), ...this.posts()]) {
      const label = dayLabel(p.createdAt, this.game.now());
      const last = out[out.length - 1];
      if (last?.label === label) last.posts.push(p);
      else out.push({ label, posts: [p] });
    }
    return out;
  });
  readonly podium = computed(() => {
    const b = this.board().slice(0, 3).map((r, i) => ({ ...r, rank: i + 1 }));
    return [b[1], b[0], b[2]].filter(Boolean);
  });

  constructor() {
    void this.reload();
    void this.queue.refresh();
    void this.queue.flush();
    effect(() => {
      const v = this.social.feedVersion();
      untracked(() => {
        if (v !== this.seenVersion) {
          this.fresh.update((n) => n + 1);
          this.seenVersion = v;
        }
      });
    });
  }

  ngOnDestroy(): void {
    /* rien à libérer */
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    this.fresh.set(0);
    try {
      const [feed, friends] = await Promise.all([this.be.social.feed(null, 20), this.be.social.friends()]);
      this.posts.set(feed.posts);
      this.hasMore.set(feed.hasMore);
      this.friends.set(friends);
    } catch {
      /* hors ligne : on garde ce qui est affiché */
    } finally {
      this.loading.set(false);
    }
  }

  async more(ev: CustomEvent): Promise<void> {
    const last = this.posts()[this.posts().length - 1];
    try {
      const page = await this.be.social.feed(last?.createdAt ?? null, 20);
      this.posts.update((l) => [...l, ...page.posts]);
      this.hasMore.set(page.hasMore);
    } finally {
      (ev.target as HTMLIonInfiniteScrollElement).complete();
    }
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.reload();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  async openBoard(): Promise<void> {
    this.tab.set('board');
    try {
      this.board.set(await this.be.social.leaderboard());
    } catch {
      /* hors ligne */
    }
  }

  async react(p: FeedPost, kind: Parameters<PostActions['react']>[1]): Promise<void> {
    const next = await this.actions.react(p, kind);
    this.posts.update((l) => l.map((x) => (x.id === p.id ? next : x)));
  }

  async menu(p: FeedPost): Promise<void> {
    const r = await this.actions.menu(p, this.myId());
    if (r === 'deleted' || r === 'blocked') await this.reload();
    else if (r === 'edited') await this.reload();
  }

  openProfile(p: FeedPost): void {
    if (p.author.id !== this.myId()) this.ui.go(['/companions', p.author.username]);
    else this.ui.go('/tabs/hero');
  }

  async shareCode(): Promise<void> {
    const profile = this.auth.profile();
    if (!profile) return;
    const url = `${env.publicUrl}/i/${profile.friendCode}`;
    const text = `Rejoins-moi sur Level Up ! Mon code ami : ${profile.friendCode}`;
    try {
      if (Capacitor.isNativePlatform() || (navigator.share && navigator.canShare?.({ text }))) {
        if (Capacitor.isNativePlatform()) await Share.share({ title: 'Level Up', text, url, dialogTitle: 'Inviter un ami' });
        else await navigator.share({ title: 'Level Up', text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        this.game.toast('Lien d’invitation copié.', 'success');
      }
    } catch {
      /* partage annulé */
    }
  }
}
