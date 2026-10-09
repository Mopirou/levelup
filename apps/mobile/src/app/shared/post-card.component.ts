import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ABILITY_LABEL, DIFFICULTY_LABEL, REACTION_EMOJI, REACTION_KINDS, REACTION_LABEL, type AbilityId, type ReactionKind } from '@levelup/engine';
import type { FeedPost } from '../core/api/types';
import { IconComponent } from './icon.component';
import { AvatarComponent, AbilityBadgeComponent } from './ui';
import { relativeTime } from './format';
import { CLASSES } from '@levelup/engine';

/** Carte de publication de la Fil des amis : quête accomplie, photo, montée de niveau, succès, série. */
@Component({
  selector: 'lu-post-card',
  imports: [IconComponent, AvatarComponent, AbilityBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="lu-card post" [class.gold]="isEvent()" [attr.aria-label]="'Publication de ' + post().author.name">
      <header class="head">
        <button type="button" class="who" (click)="profile.emit()" [attr.aria-label]="'Voir la fiche de ' + post().author.name">
          <lu-avatar [name]="post().author.name" [size]="40" [tone]="isEvent() ? 'gold' : 'dark'" [ring]="post().author.frameColor" />
          <span class="names">
            <strong>{{ post().author.name }}</strong>
            <span class="xs muted">{{ className() }} · Niv. {{ post().author.level }} · {{ when() }}</span>
          </span>
        </button>
        @if (post().pending) {
          <span class="lu-chip gold">En attente</span>
        }
        @if (post().visibility === 'private') {
          <span class="lu-chip"><lu-icon name="lock" [size]="11" /> Privé</span>
        }
        <button type="button" class="more" aria-label="Plus d’options" (click)="menu.emit()"><lu-icon name="ellipsis" [size]="18" /></button>
      </header>

      @switch (post().type) {
        @case ('level_up') {
          <div class="event">
            <span class="big pop">{{ post().payload['level'] }}</span>
            <p><strong>{{ firstName() }} atteint le niveau {{ post().payload['level'] }}</strong></p>
          </div>
        }
        @case ('achievement') {
          <div class="event">
            <span class="trophy pop"><lu-icon name="trophy" [size]="30" /></span>
            <p><strong>{{ post().payload['name'] }}</strong></p>
            <p class="small muted">{{ post().payload['description'] }}</p>
          </div>
        }
        @case ('streak') {
          <div class="event">
            <span class="trophy pop"><lu-icon name="flame" [size]="30" /></span>
            <p><strong>{{ post().payload['days'] }} jours sans faillir</strong></p>
          </div>
        }
        @default {
          @if (post().quest; as q) {
            <div class="quest">
              <lu-ability-badge [ability]="q.ability" [size]="32" />
              <div class="qm">
                <strong>{{ q.title }}</strong>
                <span class="xs muted">{{ abilityLabel(q.ability) }} · {{ diffLabel(q.difficulty) }}</span>
              </div>
              @if (q.xp) { <span class="gold small">+{{ q.xp }} XP</span> }
            </div>
          }
          @if (post().media.length) {
            <div class="media" [class.single]="post().media.length === 1" tabindex="0" role="group" aria-label="Photos">
              @for (m of post().media; track m.id) {
                @if (m.url) {
                  <img [src]="m.url" [alt]="m.alt || 'Photo partagée par ' + post().author.name" loading="lazy" />
                } @else {
                  <div class="ph"><lu-icon name="image" [size]="24" /></div>
                }
              }
            </div>
          }
          @if (post().text) {
            <p class="text">{{ post().text }}</p>
          }
        }
      }

      <div class="react" role="group" aria-label="Encouragements">
        @for (k of kinds; track k) {
          <button type="button" class="r" [class.on]="post().myReaction === k" [attr.aria-pressed]="post().myReaction === k" [attr.aria-label]="label(k) + ' : ' + post().reactions[k]" (click)="onReact(k)" (contextmenu)="$event.preventDefault(); reactors.emit()" (pointerdown)="down()" (pointerup)="up()" (pointerleave)="up()">
            <span class="e">{{ emoji(k) }}</span>
            @if (post().reactions[k]) { <b>{{ post().reactions[k] }}</b> }
          </button>
        }
        <button type="button" class="r c" (click)="comments.emit()" [attr.aria-label]="post().commentCount + ' commentaires'">
          <lu-icon name="message" [size]="16" /> @if (post().commentCount) { <b>{{ post().commentCount }}</b> }
        </button>
      </div>

      @if (total()) {
        <button type="button" class="who2" (click)="reactors.emit()">{{ total() }} encouragement{{ total() > 1 ? 's' : '' }}</button>
      }
      @if (post().comments.length) {
        <div class="cm">
          @for (c of post().comments; track c.id) {
            <p class="small"><strong>{{ c.authorName.split(' ')[0] }}</strong> : {{ c.text }}</p>
          }
          @if (post().commentCount > post().comments.length) {
            <button type="button" class="lu-link" (click)="comments.emit()">Voir les {{ post().commentCount }} commentaires</button>
          }
        </div>
      }
    </article>
  `,
  styles: `
    .post { gap: 12px; }
    .head { display: flex; align-items: center; gap: 8px; }
    .who { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; background: none; border: 0; padding: 0; color: inherit; text-align: left; cursor: pointer; }
    .names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .names strong { font-size: 14px; }
    .more { background: none; border: 0; color: var(--lu-muted); padding: 6px; cursor: pointer; border-radius: 50%; }
    .quest { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--lu-surface-2); }
    .qm { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .qm strong { font-family: var(--lu-font-title); font-weight: 500; font-size: 16px; }
    .media { display: flex; gap: 6px; overflow-x: auto; scroll-snap-type: x mandatory; border-radius: 14px; scrollbar-width: none; }
    .media::-webkit-scrollbar { display: none; }
    .media img, .media .ph { flex: 0 0 82%; scroll-snap-align: center; height: 240px; object-fit: cover; border-radius: 14px; background: var(--lu-surface-2); }
    .media.single img, .media.single .ph { flex-basis: 100%; height: 260px; }
    .ph { display: grid; place-items: center; color: var(--lu-dim); }
    .text { font-size: 14px; line-height: 1.55; color: var(--lu-text); white-space: pre-wrap; overflow-wrap: anywhere; }
    .event { display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center; padding: 8px 0; }
    .big { font-family: var(--lu-font-title); font-size: 64px; line-height: 1; background: linear-gradient(180deg, #fbe8b0, #d4af37); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .trophy { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; color: var(--lu-gold); background: color-mix(in srgb, var(--lu-gold) 18%, transparent); }
    .react { display: flex; gap: 6px; flex-wrap: wrap; }
    .r { min-height: 36px; padding: 0 12px; border-radius: 100px; border: 1px solid var(--lu-border); background: var(--lu-surface-2); color: var(--lu-text-2); display: inline-flex; align-items: center; gap: 6px; font: 600 12px var(--lu-font-body); cursor: pointer; user-select: none; -webkit-user-select: none; }
    .r .e { font-size: 15px; }
    .r.on { background: color-mix(in srgb, var(--lu-accent) 20%, transparent); border-color: var(--lu-accent); color: var(--lu-accent); }
    .r.c { margin-left: auto; }
    .who2 { background: none; border: 0; padding: 0; text-align: left; font-size: 11px; color: var(--lu-muted); cursor: pointer; }
    .cm { display: flex; flex-direction: column; gap: 6px; }
    .cm strong { font-weight: 600; }
  `,
})
export class PostCardComponent {
  readonly post = input.required<FeedPost>();
  readonly now = input(Date.now());
  readonly react = output<ReactionKind | null>();
  readonly comments = output<void>();
  readonly menu = output<void>();
  readonly profile = output<void>();
  readonly reactors = output<void>();
  readonly kinds = REACTION_KINDS;
  private pressTimer: ReturnType<typeof setTimeout> | undefined;

  readonly isEvent = computed(() => ['level_up', 'achievement', 'streak'].includes(this.post().type));
  readonly firstName = computed(() => this.post().author.name.split(' ')[0]);
  readonly total = computed(() => REACTION_KINDS.reduce((n, k) => n + this.post().reactions[k], 0));
  readonly className = computed(() => CLASSES.find((c) => c.id === this.post().author.classId)?.name ?? '');
  readonly when = computed(() => relativeTime(this.post().createdAt, this.now()));
  abilityLabel = (a: AbilityId) => ABILITY_LABEL[a];
  diffLabel = (d: keyof typeof DIFFICULTY_LABEL) => DIFFICULTY_LABEL[d];
  label = (k: ReactionKind) => REACTION_LABEL[k];
  emoji = (k: ReactionKind) => REACTION_EMOJI[k];

  private longPressed = false;

  onReact(k: ReactionKind): void {
    if (this.longPressed) {
      this.longPressed = false;
      return;
    }
    this.react.emit(this.post().myReaction === k ? null : k);
  }

  /** Appui long sur une réaction : qui a réagi. */
  down(): void {
    this.longPressed = false;
    this.pressTimer = setTimeout(() => {
      this.longPressed = true;
      this.reactors.emit();
    }, 600);
  }
  up(): void {
    clearTimeout(this.pressTimer);
  }
}
