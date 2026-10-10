import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { ABILITY_LABEL, addDays, type AbilityId } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { PostQueue } from '../../core/post-queue';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import type { FeedPost } from '../../core/api/types';
import type { QuestInstance } from '@levelup/engine';
import { PageHeaderComponent, BarComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { PostCardComponent } from '../../shared/post-card.component';
import { ShareFormComponent, type ShareDraft } from '../../shared/share-card.component';

const PROMPTS: Record<AbilityId | 'any', string[]> = {
  any: ['Ce que je lis en ce moment', 'Le sommet du jour', 'Mon plat de la semaine', 'Ce que j’ai appris', 'Mon geste pour quelqu’un aujourd’hui'],
  FOR: ['Ce que j’ai osé aujourd’hui', 'Mon record du jour', 'Ma séance, en une phrase'],
  DEX: ['Ce que j’ai créé aujourd’hui', 'Mon petit chef-d’œuvre', 'Ce que mes mains ont fait'],
  CON: ['Ma balade du jour', 'Le sommet du jour', 'Mon plat de la semaine'],
  INT: ['Ce que je lis en ce moment', 'Ce que j’ai appris', 'La phrase qui m’a marqué'],
  SAG: ['Mon moment de calme', 'Ce que j’ai observé', 'Ma gratitude du jour'],
  CHA: ['Mon geste pour quelqu’un aujourd’hui', 'Une belle rencontre', 'Un mot qui a fait du bien'],
};

/** La Plume du Crieur : publier une photo et un mot en trois gestes. */
@Component({
  selector: 'app-publish',
  imports: [IonContent, PageHeaderComponent, BarComponent, IconComponent, PostCardComponent, ShareFormComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <lu-page-header [back]="true" eyebrow="Publication" icon="feather" title="Partager un moment" />
      <div class="lu-page">
        <section class="lu-section">
          <div class="lu-section-title"><h2>Une amorce ?</h2></div>
          <div class="lu-pills">
            @for (p of prompts(); track p) { <button type="button" (click)="usePrompt(p)">{{ p }}</button> }
          </div>
        </section>

        <lu-share-form #form placeholder="Raconte en quelques mots…" (draftChange)="draft.set($event)" />

        <section class="lu-section">
          <div class="lu-section-title"><h2>Rattacher une quête</h2><span class="xs muted">facultatif</span></div>
          @if (recent().length) {
            <div class="quests">
              @for (q of recent(); track q.id) {
                <button type="button" class="lu-card flat qopt" [class.on]="quest()?.id === q.id" (click)="toggle(q)">
                  <span><strong>{{ q.snapshot.title }}</strong><small class="xs muted">{{ label(q.snapshot.ability) }} · +{{ q.xpAwarded }} XP</small></span>
                  @if (quest()?.id === q.id) { <lu-icon name="check" [size]="16" /> }
                </button>
              }
            </div>
          } @else { <p class="small muted">Aucune quête accomplie ces 7 derniers jours.</p> }
        </section>

        <section class="lu-section">
          <div class="lu-section-title"><h2>Aperçu</h2></div>
          <lu-post-card [post]="preview()" [now]="game.now()" />
        </section>

        @if (sending()) { <lu-bar [value]="progress()" [max]="100" [thick]="true" /> }
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
        <button type="button" class="lu-btn mint" [disabled]="!canSend() || sending()" (click)="send()"><lu-icon name="send" [size]="17" /> Publier</button>
        <p class="xs muted center">Les photos sont redimensionnées et leurs données de position (GPS) sont supprimées avant l’envoi.</p>
      </div>
    </ion-content>
  `,
  styles: `
    .quests { display: flex; flex-direction: column; gap: 8px; }
    .qopt { flex-direction: row; align-items: center; justify-content: space-between; cursor: pointer; width: 100%; text-align: left; color: inherit; font: inherit; padding: 12px 14px; }
    .qopt span { display: flex; flex-direction: column; gap: 2px; } .qopt.on { border-color: var(--lu-accent); color: var(--lu-accent); }
    .err { color: var(--lu-danger); font-size: 13px; } .center { text-align: center; }
  `,
})
export class PublishPage {
  protected game = inject(GameService);
  private be = inject(BackendService);
  private queue = inject(PostQueue);
  private social = inject(SocialService);
  private ui = inject(UiService);
  private form = viewChild.required<ShareFormComponent>('form');
  readonly draft = signal<ShareDraft>({ text: '', visibility: 'friends', photos: [] });
  readonly recent = signal<QuestInstance[]>([]);
  readonly quest = signal<QuestInstance | null>(null);
  readonly sending = signal(false);
  readonly progress = signal(0);
  readonly error = signal('');
  label = (a: AbilityId) => ABILITY_LABEL[a];

  readonly prompts = computed(() => PROMPTS[this.quest()?.snapshot.ability ?? 'any']);
  readonly canSend = computed(() => !!this.draft().text.trim() || this.draft().photos.length > 0);
  readonly preview = computed<FeedPost>(() => {
    const c = this.game.character()!;
    const d = this.draft();
    const q = this.quest();
    return {
      id: 'preview',
      author: { id: '', username: '', name: c.name, level: c.level, classId: c.classId, portraitId: c.portraitId, frameColor: c.frameColor },
      type: q ? 'quest' : 'photo',
      text: d.text || 'Ton message apparaîtra ici.',
      visibility: d.visibility,
      createdAt: new Date().toISOString(),
      payload: {},
      quest: q ? { ability: q.snapshot.ability, difficulty: q.snapshot.difficulty, title: q.snapshot.title, period: q.period, xp: q.xpAwarded } : null,
      media: d.photos.map((p, i) => ({ id: 'p' + i, path: '', url: p.previewUrl, width: p.width, height: p.height, alt: null })),
      reactions: { bravo: 0, inspirant: 0, respect: 0, rire: 0 },
      myReaction: null,
      commentCount: 0,
      comments: [],
    };
  });

  constructor() {
    void this.loadRecent();
  }

  private async loadRecent(): Promise<void> {
    try {
      const uid = this.be.game.userId();
      const since = Date.now() - 7 * 86400000;
      const list = await this.be.game.store.listInstances(uid, { status: 'completed', from: addDays(this.game.today(), -9) });
      this.recent.set(list.filter((q) => q.completedAt && Date.parse(q.completedAt) >= since).sort((a, b) => b.completedAt!.localeCompare(a.completedAt!)));
    } catch {
      /* hors ligne */
    }
  }

  usePrompt(p: string): void {
    this.form().text.set(p + ' : ');
    this.form().changed();
  }

  toggle(q: QuestInstance): void {
    this.quest.set(this.quest()?.id === q.id ? null : q);
  }

  async send(): Promise<void> {
    const d = this.draft();
    this.error.set('');
    this.sending.set(true);
    this.progress.set(10);
    const tick = setInterval(() => this.progress.update((p) => Math.min(p + 8, 90)), 250);
    try {
      const sent = await this.queue.publish({
        type: this.quest() ? 'quest' : 'photo',
        text: d.text.trim(),
        visibility: d.visibility,
        instanceId: this.quest()?.id ?? null,
        media: d.photos.map((p) => ({ blob: p.blob, ext: p.ext, width: p.width, height: p.height })),
      });
      this.progress.set(100);
      this.game.toast(sent ? (d.visibility === 'friends' ? 'Publié pour tes amis !' : 'Enregistré dans ton historique.') : 'Hors ligne : ta publication partira au retour du réseau.', sent ? 'success' : 'info');
      void this.social.loadPreview();
      this.ui.nav.navigateBack('/tabs/village');
    } catch (e) {
      const m = String((e as Error)?.message ?? '');
      this.error.set(m.includes('community_rules') ? 'Ce message ne respecte pas les règles de la communauté.' : m.includes('rate_limit') ? 'Tu as atteint la limite de 20 publications par jour.' : 'Impossible de publier pour le moment. Réessaie.');
    } finally {
      clearInterval(tick);
      this.sending.set(false);
    }
  }
}
