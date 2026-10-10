import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { ABILITIES, ABILITY_LABEL, ACHIEVEMENTS, CLASSES, MIN_SCORE, abilityScores, emptyAbilityRecord, type AbilityId, type ReactionKind } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { PostActions } from '../../core/post-actions';
import { UiService } from '../../core/ui.service';
import type { CompanionSheet, FeedPost } from '../../core/api/types';
import { PageHeaderComponent, PortraitComponent, RadarComponent, AvatarComponent, AbilityBadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { PostCardComponent } from '../../shared/post-card.component';

/** La Fiche d'un ami : lecture seule. L’engagement et le journal ne sont jamais visibles. */
@Component({
  selector: 'app-companion-profile',
  imports: [IonContent, PageHeaderComponent, PortraitComponent, RadarComponent, AvatarComponent, AbilityBadgeComponent, IconComponent, PostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <lu-page-header [back]="true" eyebrow="Profil d’un ami" [title]="sheet()?.card?.name ?? username()">
        <div actions><button type="button" class="lu-icon-btn" aria-label="Plus d’options" (click)="menu()"><lu-icon name="ellipsis" [size]="17" /></button></div>
      </lu-page-header>
      @if (loading()) {
        <div class="lu-page"><div class="lu-skeleton" style="height: 220px"></div></div>
      } @else if (sheet(); as s) {
        <div class="lu-page">
          @if (s.character; as ch) {
            <section class="lu-card ident">
              <lu-portrait [id]="ch.portraitId" [size]="92" [frame]="ch.frameColor" />
              <h2>{{ ch.name }}</h2>
              <p class="small muted">{{ className() }}{{ pathName() ? ' · ' + pathName() : '' }} · Niv. {{ ch.level }}</p>
              @if (ch.titleEquipped) { <span class="lu-chip gold">{{ ch.titleEquipped }}</span> }
              @if (ch.motto) { <p class="mot">« {{ ch.motto }} »</p> }
              <p class="small"><lu-icon name="flame" [size]="14" /> {{ ch.streakCurrent }} jour{{ ch.streakCurrent > 1 ? 's' : '' }} de série</p>
            </section>
            <section class="lu-card"><lu-radar [scores]="scores()" /></section>
            <div class="grid">
              @for (a of order; track a) {
                <div class="lu-card flat ab"><lu-ability-badge [ability]="a" [size]="26" /><strong>{{ scores()[a] }}</strong><span class="xs muted">{{ label(a) }}</span></div>
              }
            </div>
            @if (s.trophies.length) {
              <section class="lu-section">
                <div class="lu-section-title"><h2>Succès</h2></div>
                <div class="troph">@for (t of trophies(); track t.id) { <span class="lu-chip gold"><lu-icon name="award" [size]="12" /> {{ t.name }}</span> }</div>
              </section>
            }
            <section class="lu-section">
              <div class="lu-section-title"><h2>Ses publications</h2></div>
              @for (p of posts(); track p.id) {
                <lu-post-card [post]="p" [now]="game.now()" (react)="react(p, $event)" (comments)="ui.go(['/post', p.id])" (menu)="postMenu(p)" (profile)="0" (reactors)="actions.showReactors(p)" />
              } @empty { <p class="small muted">Rien à voir pour le moment.</p> }
            </section>
          } @else {
            <section class="lu-card ident">
              <lu-avatar [name]="s.card.name ?? s.card.username" [size]="80" />
              <h2>{{ s.card.name ?? s.card.username }}</h2>
              <p class="small muted">&#64;{{ s.card.username }} · Niv. {{ s.card.level }}</p>
              <p class="small muted">Seuls tes amis voient sa fiche complète et ses publications.</p>
              @if (s.card.requestStatus === 'sent') { <span class="lu-chip">Demande envoyée</span> }
              @else if (s.card.requestStatus === 'received') { <button type="button" class="lu-btn mint" (click)="accept()">Accepter sa demande</button> }
              @else { <button type="button" class="lu-btn mint" (click)="request()"><lu-icon name="user-plus" [size]="17" /> Demander à rejoindre sa compagnie</button> }
            </section>
          }
        </div>
      } @else {
        <div class="lu-page"><p class="muted">Aucun utilisateur trouvé.</p></div>
      }
    </ion-content>
  `,
  styles: `
    .ident { align-items: center; text-align: center; gap: 10px; } .ident h2 { font-size: 28px; font-weight: 500; }
    .mot { font-family: var(--lu-font-title); font-style: italic; font-size: 14px; color: var(--lu-text-2); }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .ab { align-items: center; padding: 12px 6px; gap: 4px; text-align: center; } .ab strong { font-family: var(--lu-font-title); font-size: 22px; font-weight: 500; }
    .troph { display: flex; flex-wrap: wrap; gap: 8px; }
  `,
})
export class CompanionProfilePage {
  readonly username = input.required<string>();
  protected game = inject(GameService);
  protected ui = inject(UiService);
  protected actions = inject(PostActions);
  private be = inject(BackendService);
  readonly sheet = signal<CompanionSheet | null>(null);
  readonly posts = signal<FeedPost[]>([]);
  readonly loading = signal(true);
  readonly order: AbilityId[] = ['CON', 'SAG', 'INT', 'CHA', 'DEX', 'FOR'];
  readonly abilities = ABILITIES;
  label = (a: AbilityId) => ABILITY_LABEL[a];
  readonly scores = computed(() => {
    const ch = this.sheet()?.character;
    return ch ? abilityScores({ baseScores: ch.baseScores, improvements: ch.improvements, abilityXp: ch.abilityXp }) : emptyAbilityRecord(MIN_SCORE);
  });
  readonly className = computed(() => CLASSES.find((c) => c.id === this.sheet()?.character?.classId)?.name ?? '');
  readonly pathName = computed(() => CLASSES.flatMap((c) => c.paths).find((p) => p.id === this.sheet()?.character?.pathId)?.name ?? '');
  readonly trophies = computed(() => (this.sheet()?.trophies ?? []).map((id) => ACHIEVEMENTS.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a).slice(0, 12));

  constructor() {
    queueMicrotask(() => void this.load());
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const s = await this.be.social.companionSheet(this.username());
      this.sheet.set(s);
      if (s?.card.isFriend && s.card.profileId) this.posts.set(await this.be.social.companionPosts(s.card.profileId));
    } catch {
      this.sheet.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async request(): Promise<void> {
    const id = this.sheet()?.card.profileId;
    if (!id) return;
    const r = await this.be.social.sendRequest(id);
    this.game.toast(r === 'sent' || r === 'accepted' ? 'Demande envoyée.' : 'Aucun utilisateur trouvé.', r === 'sent' || r === 'accepted' ? 'success' : 'info');
    await this.load();
  }

  async accept(): Promise<void> {
    const pending = (await this.be.social.pendingRequests()).find((p) => p.card.username === this.username() && p.direction === 'received');
    if (pending) {
      await this.be.social.respond(pending.id, true);
      await this.load();
    }
  }

  async react(p: FeedPost, kind: ReactionKind | null): Promise<void> {
    const next = await this.actions.react(p, kind);
    this.posts.update((l) => l.map((x) => (x.id === p.id ? next : x)));
  }

  async postMenu(p: FeedPost): Promise<void> {
    const r = await this.actions.menu(p, this.be.game.userId());
    if (r) await this.load();
  }

  async menu(): Promise<void> {
    const s = this.sheet();
    if (!s?.card.profileId) return;
    const buttons: { label: string; value: string }[] = [];
    if (s.card.isFriend) buttons.push({ label: 'Retirer des amis', value: 'remove' });
    buttons.push({ label: 'Signaler', value: 'report' }, { label: 'Bloquer', value: 'block' });
    const v = await this.ui.choose(s.card.name ?? s.card.username, buttons.map((b) => ({ text: b.label, value: b.value })));
    const id = s.card.profileId;
    if (v === 'remove' && (await this.ui.confirm({ title: 'Retirer cet ami ?', message: 'C’est silencieux : il ne sera pas prévenu.', confirm: 'Retirer', danger: true }))) {
      await this.be.social.removeFriend(id);
      this.ui.nav.navigateBack('/companions');
    } else if (v === 'block' && (await this.ui.confirm({ title: 'Bloquer cet utilisateur ?', message: 'Vous ne verrez plus vos publications respectives.', confirm: 'Bloquer', danger: true }))) {
      await this.be.social.block(id);
      this.game.toast('Utilisateur bloqué.', 'info');
      this.ui.nav.navigateBack('/companions');
    } else if (v === 'report') await this.actions.report('profile', id);
  }
}
