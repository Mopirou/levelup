import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import type { FriendRow, RaidMemberView } from '../../core/api/types';
import { ModalComponent } from '../../shared/modal.component';
import { PortraitComponent } from '../../shared/ui';
import { fmt } from '../../shared/format';

const CHEST_NAME: Record<string, string> = { bois: 'de bois', bronze: 'de bronze', argent: 'd’argent', or: 'd’or', mythique: 'mythique' };

/** Carte « Raid d'amis » de l'onglet Aventure (docs/DONJONS.md §8) : boss de la semaine, équipe, encouragements. */
@Component({
  selector: 'lu-raid-card',
  imports: [ModalComponent, PortraitComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (r(); as st) {
      <section class="lu-card" [class.off]="!st.available" aria-labelledby="h-raid" data-testid="raid-card">
        <div class="row">
          <h2 id="h-raid" class="sh"><span aria-hidden="true">⚔️</span> Raid d’amis</h2>
          <span class="lu-chip" data-testid="raid-week">{{ st.week }}</span>
        </div>

        <div class="boss">
          <span class="bg" aria-hidden="true">{{ st.boss.glyph }}</span>
          <div class="bt">
            <strong data-testid="raid-boss">{{ st.boss.name }}</strong>
            <span class="xs muted">{{ st.boss.blurb }}</span>
          </div>
        </div>

        @if (!st.available) {
          <p class="small" data-testid="raid-local">Les raids se jouent entre amis : crée un compte et ajoute des amis pour affronter le boss de la semaine ensemble. En mode local, tu peux seulement voir le boss.</p>
        } @else {
          @if (st.hit; as hit) {
            <p class="hit" role="status" data-testid="raid-hit">
              ⚔️ Ton coup du jour : <strong>{{ fmt(hit.damage) }}</strong> dégâts{{ hit.encouragements > 0 ? ' (encouragements compris)' : '' }}.
              @if (hit.victory) { <strong> Le boss est tombé !</strong> }
            </p>
          }

          @if (st.team; as t) {
            <div class="hp">
              <div class="bar" role="progressbar" aria-label="Points de vie du boss" [attr.aria-valuenow]="pct(t.ratio)" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuetext]="fmt(t.hpLeft) + ' sur ' + fmt(t.maxHp) + ' PV restants'">
                <span class="fill" [style.width.%]="100 - pct(t.ratio)"></span>
              </div>
              <div class="row">
                <span class="xs" data-testid="raid-hp">{{ fmt(t.hpLeft) }} / {{ fmt(t.maxHp) }} PV</span>
                <span class="xs muted">
                  @switch (t.status) {
                    @case ('victory') { Victoire en {{ t.daysToKill }} jour{{ (t.daysToKill ?? 0) > 1 ? 's' : '' }} }
                    @case ('defeat') { Le boss a tenu bon }
                    @case ('void') { Raid annulé }
                    @default { {{ t.daysLeft }} jour{{ t.daysLeft > 1 ? 's' : '' }} restant{{ t.daysLeft > 1 ? 's' : '' }} }
                  }
                </span>
              </div>
            </div>

            @if (t.status === 'forming') {
              <p class="small muted">Ton équipe est en formation : invite au moins un ami pour pouvoir vaincre le boss. Tu frappes déjà chaque jour.</p>
            }
            @if (t.chaBonus > 0) { <p class="xs muted">Bonus de charisme du groupe : +{{ pct(t.chaBonus) }} % de dégâts.</p> }

            <ul class="team" aria-label="Équipe">
              @for (m of t.members; track m.profileId) {
                <li class="mem">
                  <lu-portrait [id]="m.portraitId" [size]="40" [frame]="m.frameColor" />
                  <span class="mt">
                    <strong>{{ m.name }}{{ m.isMe ? ' (toi)' : '' }}{{ m.isLeader ? ' · chef' : '' }}</strong>
                    <span class="xs muted">{{ fmt(m.power) }} PP · {{ m.hitToday ? 'a frappé aujourd’hui (' + fmt(m.damageToday) + ')' : 'n’a pas encore frappé' }}</span>
                    <span class="xs muted">Semaine : {{ fmt(m.damageWeek) }} dégâts{{ m.encouragementsToday > 0 ? ' · +' + m.encouragementsToday * 5 + ' % encouragé' : '' }}</span>
                  </span>
                  @if (!m.isMe && t.status !== 'victory' && t.status !== 'defeat' && t.status !== 'void') {
                    <button type="button" class="lu-btn small ghost" [disabled]="busy() || m.encouragedByMe" [attr.aria-label]="(m.encouragedByMe ? 'Déjà encouragé : ' : 'Encourager ') + m.name" (click)="encourage(m)">
                      {{ m.encouragedByMe ? 'Encouragé' : '👏 Encourager' }}
                    </button>
                  }
                </li>
              }
            </ul>

            @if (t.pending.length) {
              <p class="xs muted">Invitations en attente : {{ pendingNames(t.pending) }}.</p>
            }

            <div class="acts">
              @if (t.leaderId === meId(t.members) && t.status !== 'victory' && t.status !== 'defeat' && t.status !== 'void') {
                <button type="button" class="lu-btn small" data-testid="raid-invite" [disabled]="busy() || slots(t.members.length, t.pending.length) === 0" (click)="openInvite()">
                  Inviter un ami
                </button>
              }
              @if (t.status === 'forming' || t.status === 'active') {
                <button type="button" class="lu-btn small ghost danger" [disabled]="busy()" (click)="leave()">Quitter l’équipe</button>
              }
            </div>
          } @else {
            <p class="small muted">Tu n’as pas encore d’équipe cette semaine. Forme une équipe de 2 à 6 amis : chacun frappe le boss une fois par jour, automatiquement. S’il tombe avant dimanche, un coffre d’or attend chacun (mythique en moins de 4 jours).</p>
            <button type="button" class="lu-btn mint" data-testid="raid-create" [disabled]="busy()" (click)="create()">Créer une équipe</button>
          }

          @if (st.invitations.length) {
            <h3 class="sh2">Invitations</h3>
            <ul class="inv">
              @for (i of st.invitations; track i.teamId) {
                <li class="irow">
                  <span class="mt"><strong>{{ i.leaderName }}</strong><span class="xs muted">{{ i.members }} membre{{ i.members > 1 ? 's' : '' }} dans l’équipe</span></span>
                  @if (!st.team) {
                    <button type="button" class="lu-btn small" [disabled]="busy()" [attr.aria-label]="'Rejoindre l’équipe de ' + i.leaderName" (click)="join(i.teamId)">Rejoindre</button>
                  }
                  <button type="button" class="lu-btn small ghost" [disabled]="busy()" [attr.aria-label]="'Refuser l’invitation de ' + i.leaderName" (click)="decline(i.teamId)">Refuser</button>
                </li>
              }
            </ul>
          }

          @if (st.lastResult; as lr) {
            <p class="xs muted" data-testid="raid-last">
              Dernier raid ({{ lr.boss.name }}) :
              @switch (lr.outcome) {
                @case ('victory') { victoire en {{ lr.daysToKill }} jour{{ (lr.daysToKill ?? 0) > 1 ? 's' : '' }}{{ lr.reward ? ', coffre ' + chestName(lr.reward) : '' }}. }
                @case ('defeat') { le boss a résisté ({{ fmt(lr.damage) }} / {{ fmt(lr.maxHp) }} PV). Nouvelle chance cette semaine. }
                @default { annulé, l’équipe n’a jamais compté deux membres. }
              }
            </p>
          }
        }
      </section>

      @if (inviting()) {
        <lu-modal label="Inviter un ami au raid" (close)="inviting.set(false)">
          <h2 class="mt2">Inviter un ami</h2>
          <p class="xs muted">Il reste {{ slotsLeft() }} place{{ slotsLeft() > 1 ? 's' : '' }} dans l’équipe. Seuls tes amis acceptés peuvent être invités.</p>
          @if (candidates().length === 0) {
            <p class="small muted">{{ friends().length === 0 ? 'Tu n’as pas encore d’amis. Ajoute-en depuis l’onglet Amis.' : 'Tous tes amis sont déjà dans l’équipe ou invités.' }}</p>
          } @else {
            <ul class="inv">
              @for (f of candidates(); track f.profileId) {
                <li class="irow">
                  <lu-portrait [id]="f.portraitId" [size]="36" [frame]="f.frameColor" />
                  <span class="mt"><strong>{{ f.name }}</strong><span class="xs muted">&#64;{{ f.username }} · niveau {{ f.level }}</span></span>
                  <button type="button" class="lu-btn small" [disabled]="busy() || slotsLeft() === 0" [attr.aria-label]="'Inviter ' + f.name" (click)="invite(f)">Inviter</button>
                </li>
              }
            </ul>
          }
          <button type="button" class="lu-btn ghost" (click)="inviting.set(false)">Fermer</button>
        </lu-modal>
      }
    }
  `,
  styles: `
    :host { display: block; }
    .off { border-style: dashed; background: var(--lu-surface-2); }
    .off .boss { background: var(--lu-surface); }
    .sh { font-size: 19px; margin: 0; display: flex; align-items: center; gap: 8px; }
    .sh2 { font-size: 14px; margin: 6px 0 0; color: var(--lu-text-2); }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
    .boss { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); }
    .bg { font-size: 38px; line-height: 1; flex: none; }
    .bt, .mt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .mt2 { font-size: 20px; margin: 0; padding-right: 36px; }
    .hit { margin: 0; font-size: 14px; }
    .bar { height: 12px; border-radius: 6px; background: var(--lu-surface-2); border: 1px solid var(--lu-border-strong); overflow: hidden; }
    .fill { display: block; height: 100%; background: var(--lu-danger); border-radius: 6px; transition: width 0.4s; }
    .hp { display: flex; flex-direction: column; gap: 6px; }
    .team, .inv { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
    .mem, .irow { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 14px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); flex-wrap: wrap; }
    .mem .mt { min-width: 140px; }
    .mt strong { font-size: 14px; }
    .acts { display: flex; flex-wrap: wrap; gap: 8px; }
    .danger { color: var(--lu-danger); }
  `,
})
export class RaidCardComponent {
  private game = inject(GameService);
  private be = inject(BackendService);
  private ui = inject(UiService);
  readonly fmt = fmt;
  readonly r = this.game.raid;
  readonly busy = signal(false);
  readonly inviting = signal(false);
  readonly friends = signal<FriendRow[]>([]);

  readonly slotsLeft = computed(() => {
    const t = this.r()?.team;
    return t ? this.slots(t.members.length, t.pending.length) : 0;
  });
  /** Amis acceptés qui ne sont ni dans l'équipe ni déjà invités. */
  readonly candidates = computed(() => {
    const t = this.r()?.team;
    const taken = new Set([...(t?.members ?? []).map((m) => m.profileId), ...(t?.pending ?? []).map((p) => p.profileId)]);
    return this.friends().filter((f) => !taken.has(f.profileId));
  });

  constructor() {
    void this.game.loadRaid();
  }

  pct = (ratio: number): number => Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  chestName = (c: string): string => CHEST_NAME[c] ?? c;
  slots = (members: number, pending: number): number => Math.max(0, (this.r()?.rules.maxMembers ?? 6) - members - pending);
  meId = (members: RaidMemberView[]): string | undefined => members.find((m) => m.isMe)?.profileId;
  pendingNames = (p: { name: string }[]): string => p.map((x) => x.name).join(', ');

  private async run(fn: () => Promise<unknown>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await fn();
    } finally {
      this.busy.set(false);
    }
  }

  create = (): Promise<void> => this.run(() => this.game.createRaid());
  join = (teamId: string): Promise<void> => this.run(() => this.game.joinRaid(teamId));
  decline = (teamId: string): Promise<void> => this.run(() => this.game.leaveRaid(teamId));
  encourage = (m: RaidMemberView): Promise<void> => this.run(() => this.game.encourageRaid(m.profileId));

  async leave(): Promise<void> {
    const ok = await this.ui.confirm({
      title: 'Quitter l’équipe ?',
      message: 'Tu emportes tes dégâts de la semaine : ils ne compteront plus pour l’équipe.',
      confirm: 'Quitter',
      danger: true,
    });
    if (ok) await this.run(() => this.game.leaveRaid());
  }

  async openInvite(): Promise<void> {
    this.inviting.set(true);
    try {
      this.friends.set(await this.be.social.friends());
    } catch {
      this.friends.set([]);
    }
  }

  async invite(f: FriendRow): Promise<void> {
    await this.run(() => this.game.inviteToRaid(f.profileId));
    if (this.slotsLeft() === 0) this.inviting.set(false);
  }
}
