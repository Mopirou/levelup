import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { type ReactionKind } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { PostActions } from '../../core/post-actions';
import { UiService } from '../../core/ui.service';
import type { FeedPost } from '../../core/api/types';
import { PageHeaderComponent, AvatarComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { PostCardComponent } from '../../shared/post-card.component';
import { relativeTime } from '../../shared/format';

@Component({
  selector: 'app-post-detail',
  imports: [IonContent, PageHeaderComponent, AvatarComponent, EmptyComponent, IconComponent, PostCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content>
      <lu-page-header [back]="true" eyebrow="Publication" icon="message" />
      <div class="lu-page">
        @if (post(); as p) {
          <lu-post-card [post]="detailPost()" [now]="game.now()" (react)="react($event)" (comments)="focus()" (menu)="menu()" (profile)="profile()" (reactors)="actions.showReactors(p)" />
          <section class="lu-section">
            <div class="lu-section-title"><h2>Commentaires</h2><span class="lu-link" style="color: var(--lu-text-2)">{{ p.comments.length }}</span></div>
            @for (c of p.comments; track c.id) {
              <div class="cm">
                <lu-avatar [name]="c.authorName" [size]="34" />
                <div class="body">
                  <p class="small"><strong>{{ c.authorName }}</strong> <span class="xs muted">· {{ ago(c.createdAt) }}</span></p>
                  <p class="t">{{ c.text }}</p>
                </div>
                <button type="button" class="more" aria-label="Options du commentaire" (click)="commentMenu(c.id, c.authorId)"><lu-icon name="ellipsis" [size]="16" /></button>
              </div>
            } @empty { <p class="small muted">Sois le premier à encourager.</p> }
            <form class="compose" (submit)="send($event)">
              <input id="cmt" class="lu-input" maxlength="300" [value]="text()" (input)="text.set($any($event.target).value)" placeholder="Un mot gentil…" aria-label="Ton commentaire" />
              <button type="submit" class="lu-btn small mint inline" [disabled]="!text().trim() || busy()" aria-label="Envoyer"><lu-icon name="send" [size]="16" /></button>
            </form>
            <p class="xs dim">{{ text().length }}/300</p>
          </section>
        } @else if (!loading()) {
          <lu-empty icon="message" title="Publication introuvable" text="Elle a peut-être été supprimée ou masquée." />
        }
      </div>
    </ion-content>
  `,
  styles: `
    .cm { display: flex; gap: 10px; align-items: flex-start; } .body { flex: 1; min-width: 0; } .t { font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
    .more { background: none; border: 0; color: var(--lu-muted); padding: 6px; cursor: pointer; }
    .compose { display: flex; gap: 8px; }
  `,
})
export class PostDetailPage {
  readonly id = input.required<string>();
  protected game = inject(GameService);
  protected actions = inject(PostActions);
  private be = inject(BackendService);
  private ui = inject(UiService);
  readonly post = signal<FeedPost | null>(null);
  readonly loading = signal(true);
  readonly text = signal('');
  readonly busy = signal(false);
  readonly detailPost = computed(() => ({ ...this.post()!, comments: [] }));
  ago = (iso: string) => relativeTime(iso, this.game.now());

  constructor() {
    queueMicrotask(() => void this.load());
  }

  async load(): Promise<void> {
    try {
      this.post.set(await this.be.social.post(this.id()));
    } catch {
      this.post.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  async react(kind: ReactionKind | null): Promise<void> {
    const p = this.post();
    if (p) this.post.set({ ...(await this.actions.react(p, kind)), comments: p.comments });
  }

  focus(): void {
    document.getElementById('cmt')?.focus();
  }

  profile(): void {
    const p = this.post();
    if (p && p.author.id !== this.be.game.userId()) this.ui.go(['/companions', p.author.username]);
  }

  async menu(): Promise<void> {
    const p = this.post();
    if (!p) return;
    const r = await this.actions.menu(p, this.be.game.userId());
    if (r === 'deleted' || r === 'blocked') this.ui.nav.navigateBack('/tabs/village');
    else if (r) await this.load();
  }

  async send(ev: Event): Promise<void> {
    ev.preventDefault();
    const t = this.text().trim();
    if (!t) return;
    this.busy.set(true);
    try {
      await this.be.social.comment(this.id(), t);
      this.text.set('');
      await this.load();
    } catch (e) {
      this.game.toast(String((e as Error).message).includes('community_rules') ? 'Ce message ne respecte pas les règles de la communauté.' : 'Impossible d’envoyer ton commentaire.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  async commentMenu(id: string, authorId: string): Promise<void> {
    const mine = authorId === this.be.game.userId();
    const v = await this.ui.choose('Commentaire', mine ? [{ text: 'Supprimer', value: 'del' }] : [{ text: 'Signaler', value: 'report' }]);
    if (v === 'del') {
      await this.be.social.deleteComment(id);
      await this.load();
    } else if (v === 'report') await this.actions.report('comment', id);
  }
}
