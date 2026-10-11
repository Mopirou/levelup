import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SEASON_FRAME_DEFS, SEASON_WEEKS, SEASON_MIN_SPAN_DAYS, rankSeason, type SeasonFrame } from '@levelup/engine';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import type { SeasonResultView, SeasonRow } from '../../core/api/types';
import { PortraitComponent } from '../../shared/ui';
import { fmt } from '../../shared/format';

/** Carte « Saison » de l'onglet Aventure (docs/DONJONS.md §9) : classement de puissance entre amis, jours restants, récompense. */
@Component({
  selector: 'lu-season-card',
  imports: [PortraitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (s(); as st) {
      <section class="lu-card" aria-labelledby="h-season" data-testid="season-card">
        <div class="row">
          <h2 id="h-season" class="sh"><span aria-hidden="true">🏅</span> {{ st.season.name }}</h2>
          <span class="lu-chip" data-testid="season-days">{{ st.season.daysLeft }} jour{{ st.season.daysLeft > 1 ? 's' : '' }} restant{{ st.season.daysLeft > 1 ? 's' : '' }}</span>
        </div>

        @for (r of news(); track r.seasonKey) {
          <div class="award" role="status" data-testid="season-reward">
            <span class="aw-g" aria-hidden="true">{{ r.frame ? frameDef(r.frame).glyph : '🏅' }}</span>
            <div class="aw-t">
              <strong>{{ r.name }} terminée !</strong>
              @if (r.frame) {
                <span class="small">
                  @if (r.rank) { Tu finis {{ rankLabel(r.rank) }} sur {{ r.participants }}. }
                  {{ frameDef(r.frame).label }} et coffre d’or ajoutés : ton cadre est déjà sur ton portrait.
                </span>
              } @else {
                <span class="small">Il fallait jouer une semaine pour toucher la récompense : à la prochaine saison !</span>
              }
            </div>
            <button type="button" class="lu-btn small ghost" (click)="dismiss()">Compris</button>
          </div>
        }

        <div class="bar" role="progressbar" aria-label="Avancement de la saison" [attr.aria-valuenow]="st.season.week" aria-valuemin="1" [attr.aria-valuemax]="weeks" [attr.aria-valuetext]="'Semaine ' + st.season.week + ' sur ' + weeks">
          <span class="fill" [style.width.%]="st.season.progress * 100"></span>
        </div>
        <p class="xs muted">Semaine {{ st.season.week }} sur {{ weeks }} · ta puissance : <strong data-testid="season-power">{{ fmt(st.power) }} PP</strong></p>

        <h3 class="sh2">Classement entre amis</h3>
        @if (!st.optedIn) {
          <p class="small muted" data-testid="season-optout">Tu as désactivé le classement dans les réglages : tu ne vois pas tes amis et ils ne te voient pas. Tu touches quand même la récompense de participation.</p>
        } @else {
          <ol class="board" data-testid="season-board" aria-label="Classement de puissance de la saison">
            @for (row of ranked(); track row.profileId) {
              <li [class.me]="row.profileId === meId()" [attr.data-testid]="row.profileId === meId() ? 'season-me' : null">
                <span class="rk" [attr.aria-label]="rankLabel(row.rank)">{{ row.rank }}</span>
                <lu-portrait [id]="row.portraitId" [size]="36" [frame]="row.frameColor" [frameStyle]="row.frameStyle" />
                <span class="nm"><strong>{{ row.name }}</strong><span class="xs muted">Niv. {{ row.level }}{{ row.profileId === meId() ? ' · toi' : '' }}</span></span>
                <span class="pw">{{ fmt(row.power) }} PP</span>
              </li>
            }
          </ol>
          @if (ranked().length < 2) {
            <p class="small muted">Ajoute des compagnons pour te comparer à eux : seuls tes amis acceptés, qui acceptent aussi le classement, apparaissent ici.</p>
          }
        }

        <h3 class="sh2">Récompense de fin de saison</h3>
        <div class="reward" data-testid="season-prize">
          <span class="aw-g" aria-hidden="true">{{ st.reward.frameGlyph }}</span>
          <div class="aw-t">
            <strong>{{ st.reward.frameLabel }} + coffre d’or</strong>
            <span class="xs muted">
              Podium : cadre d’or, d’argent ou de bronze. Les autres reçoivent le cadre de laurier. Il faut avoir joué au moins une semaine
              ({{ min(st.daysPlayed, minDays + 1) }}/{{ minDays + 1 }} jours).
            </span>
          </div>
        </div>
        @if (st.frame; as f) {
          <p class="xs muted">Ton cadre actuel : {{ f.glyph }} {{ f.label }} ({{ f.season }}).</p>
        }

        @if (st.results.length) {
          <h3 class="sh2">Saisons passées</h3>
          <ul class="past" data-testid="season-past">
            @for (r of st.results; track r.seasonKey) {
              <li>
                <span aria-hidden="true">{{ r.frame ? frameDef(r.frame).glyph : '·' }}</span>
                <strong>{{ r.name }}</strong>
                <span class="xs muted">{{ resultLabel(r) }}</span>
              </li>
            }
          </ul>
        }
      </section>
    }
  `,
  styles: `
    :host { display: block; }
    .sh { font-size: 19px; margin: 0; display: flex; align-items: center; gap: 8px; }
    .sh2 { font-size: 14px; margin: 6px 0 0; color: var(--lu-text-2); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .bar { height: 10px; border-radius: 6px; background: var(--lu-surface-2); border: 1px solid var(--lu-border-strong); overflow: hidden; }
    .fill { display: block; height: 100%; background: var(--lu-gold); border-radius: 6px; }
    .board, .past { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .board li { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); }
    .board li.me { border-color: var(--lu-gold); }
    .rk { width: 22px; text-align: center; font-weight: 700; font-variant-numeric: tabular-nums; }
    .nm { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .nm strong { font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pw { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .award, .reward { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); }
    .award { border: 2px solid var(--lu-gold); }
    .aw-g { font-size: 30px; line-height: 1; flex: none; }
    .aw-t { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .past li { display: flex; align-items: center; gap: 8px; }
  `,
})
export class SeasonCardComponent {
  private game = inject(GameService);
  private be = inject(BackendService);
  readonly fmt = fmt;
  readonly weeks = SEASON_WEEKS;
  readonly minDays = SEASON_MIN_SPAN_DAYS;
  readonly s = this.game.season;
  /** Récompenses de fin de saison encore à lire */
  readonly news = this.game.seasonNews;
  readonly board = signal<SeasonRow[]>([]);
  readonly meId = computed(() => this.game.character()?.profileId ?? '');
  /** Le classement serveur, rangs partagés en cas d'égalité */
  readonly ranked = computed(() => {
    const rows = this.board();
    const byId = new Map(rows.map((r) => [r.profileId, r]));
    return rankSeason(rows).map((r) => ({ ...byId.get(r.profileId)!, rank: r.rank }));
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    const st = await this.game.loadSeason();
    if (!st) return;
    try {
      this.board.set(await this.be.social.seasonLeaderboard(st.season.key));
    } catch {
      this.board.set([]);
    }
  }

  min = Math.min;
  dismiss = (): void => this.game.seasonNews.set([]);
  frameDef = (f: SeasonFrame | string) => SEASON_FRAME_DEFS[f as SeasonFrame] ?? SEASON_FRAME_DEFS.laurier;
  rankLabel = (rank: number): string => (rank === 1 ? '1er' : `${rank}e`);
  resultLabel(r: SeasonResultView): string {
    if (!r.frame) return 'Participation insuffisante';
    const rank = r.rank ? `${this.rankLabel(r.rank)} sur ${r.participants}` : 'Non classé';
    return `${rank} · ${this.frameDef(r.frame).label}`;
  }
}
