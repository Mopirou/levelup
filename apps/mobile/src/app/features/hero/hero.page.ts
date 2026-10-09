import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { IonContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_LABEL,
  ABILITY_TAGLINE,
  ACHIEVEMENTS,
  abilityModifier,
  abilityProgress,
  abilityProgressOf,
  addDays,
  gameDate,
  type AbilityId,
  type QuestInstance,
} from '@levelup/engine';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { BackendService } from '../../core/backend.service';
import { AuthService } from '../../core/auth.service';
import { GameService } from '../../core/game.service';
import { UiService } from '../../core/ui.service';
import { PageHeaderComponent, PortraitComponent, BarComponent, RadarComponent, AbilityBadgeComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { fmt } from '../../shared/format';
import { renderSheetPng } from './sheet-image';

const DAY_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

@Component({
  selector: 'app-hero',
  imports: [IonContent, PageHeaderComponent, PortraitComponent, BarComponent, RadarComponent, AbilityBadgeComponent, IconComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header eyebrow="Profil" icon="user-round" title="Ta progression">
        <div actions>
          <button type="button" class="lu-icon-btn" aria-label="Partager ma fiche" (click)="shareSheet()"><lu-icon name="share" [size]="17" /></button>
          <button type="button" class="lu-icon-btn" aria-label="Réglages" (click)="ui.go('/settings')"><lu-icon name="settings" [size]="17" /></button>
        </div>
      </lu-page-header>

      @if (c(); as ch) {
        <div class="lu-page">
          <!-- Identité -->
          <section class="lu-card ident" [class.legend]="game.level() >= 20">
            <div class="top">
              <lu-portrait [id]="ch.portraitId" [size]="92" [frame]="ch.frameColor" />
              <div class="id">
                <h2 class="nm">{{ ch.name }}</h2>
                <p class="cls">{{ game.classDef()?.name }}{{ game.pathDef() ? ' · ' + game.pathDef()!.name : '' }}</p>
                @if (ch.motto) { <p class="mot">« {{ ch.motto }} »</p> }
                <p class="xs muted">&#64;{{ auth.profile()?.username }} · Depuis {{ since() }}</p>
              </div>
            </div>
            <div class="chips">
              <span class="lu-chip mint">Niveau {{ ch.level }}</span>
              <button type="button" class="lu-chip gold" (click)="pickTitle()" aria-label="Choisir mon titre">{{ game.displayTitle() }} ⌄</button>
              <span class="lu-chip">Maîtrise +{{ game.proficiency() }}</span>
            </div>
            <div class="xp"><span>{{ fmt(game.levelInfo().current) }} / {{ fmt(game.levelInfo().needed) }} XP</span><span class="mint">{{ game.levelInfo().nextLevelXp ? 'Niveau ' + (ch.level + 1) + ' →' : 'Niveau maximum' }}</span></div>
            <lu-bar [value]="game.levelInfo().ratio" [thick]="true" />
            <p class="xs muted">{{ fmt(ch.totalXp) }} XP cumulés · {{ totalDone() }} quêtes accomplies</p>
          </section>

          <!-- Tes six caractéristiques -->
          <section class="lu-section">
            <div class="lu-section-title"><h2>Tes six caractéristiques</h2></div>
            <div class="lu-card radar">
              <div class="rhead"><span class="lu-eyebrow">PROFIL ACTUEL</span><span class="xs dim">Échelle de 0 à 20 · pointillés : à ta création</span></div>
              <lu-radar [scores]="game.scores()" [base]="ch.baseScores" [highlight]="game.weakest()" />
            </div>
            <div class="grid">
              @for (a of order; track a) {
                <button type="button" class="lu-card flat ab" (click)="openAbility(a)" [attr.aria-label]="label(a) + ' ' + game.scores()[a] + ' : voir le détail'">
                  <div class="ah"><lu-ability-badge [ability]="a" [size]="30" />@if (game.masteries().includes(a)) { <span class="mast" title="Maîtrise de ta classe">★</span> }</div>
                  <span class="an">{{ label(a) }}</span>
                  <span class="av" [class.leg]="info(a).legendary">{{ game.scores()[a] }}</span>
                  <span class="mod">Mod. {{ mod(game.scores()[a]) }}</span>
                  @if (info(a).needed) {
                    <lu-bar [value]="info(a).current" [max]="info(a).needed" />
                    <span class="xs muted">{{ fmt(info(a).current) }} / {{ fmt(info(a).needed) }} XP</span>
                  } @else { <span class="xs gold">Maximum</span> }
                </button>
              }
            </div>
            <p class="xs muted">Les modificateurs reflètent tes forces acquises. Chaque caractéristique évolue avec les quêtes qui lui sont liées.</p>
          </section>

          <!-- Série -->
          <section class="lu-card">
            <div class="srow">
              <span class="big"><lu-icon name="flame" [size]="22" /> {{ ch.streakCurrent }} jour{{ ch.streakCurrent > 1 ? 's' : '' }} d’élan</span>
              <span class="insp"><lu-icon name="sparkles" [size]="16" /> {{ ch.inspiration }} inspiration{{ ch.inspiration > 1 ? 's' : '' }}</span>
            </div>
            <div class="days">
              @for (d of week(); track d.date) {
                <div class="dd" [class.on]="d.done" [class.today]="d.today" [class.rest]="d.rest">
                  <span class="dl">{{ d.letter }}</span>
                  <span class="dc">@if (d.done) { <lu-icon name="check" [size]="13" [stroke]="3" /> } @else if (d.rest) { <lu-icon name="moon" [size]="12" /> }</span>
                </div>
              }
            </div>
            <p class="xs muted">1 inspiration = une relance de quête, sans attendre demain. Record : {{ ch.streakBest }} jours.</p>
          </section>

          <!-- Traits -->
          <section class="lu-card flat traits">
            <div class="t"><strong>{{ counts().easy }}</strong><span>Faciles</span></div>
            <div class="t"><strong>{{ counts().medium }}</strong><span>Modérées</span></div>
            <div class="t"><strong>{{ counts().high }}</strong><span>Audacieuses</span></div>
            <div class="t"><strong>{{ counts().expert }}</strong><span>Légendaires</span></div>
          </section>

          <!-- Succès et améliorations -->
          <section class="lu-section">
            <div class="lu-section-title">
              <h2>Ton parcours</h2>
              <button type="button" class="lu-link" (click)="ui.go('/trophies')">Tout voir →</button>
            </div>
            @if (recentTrophies().length) {
              <div class="trophies">
                @for (t of recentTrophies(); track t.id) {
                  <div class="lu-card flat tr"><span class="ti"><lu-icon name="award" [size]="20" /></span><strong>{{ t.name }}</strong><span class="xs muted">{{ t.description }}</span></div>
                }
              </div>
            } @else {
              <p class="small muted">Tes premiers succès arrivent avec tes premières quêtes.</p>
            }
            @if (game.pendingImprovements() > 0) {
              <button type="button" class="lu-card gold up" (click)="game.checkPending()"><lu-icon name="sparkles" [size]="20" /><span><strong>Amélioration disponible</strong><br /><span class="xs">+2 à répartir entre tes caractéristiques</span></span><b>Choisir</b></button>
            } @else if (game.pendingPath()) {
              <button type="button" class="lu-card gold up" (click)="game.checkPending()"><lu-icon name="compass" [size]="20" /><span><strong>Choisis ta spécialité</strong><br /><span class="xs">Une affinité secondaire et un titre</span></span><b>Choisir</b></button>
            } @else {
              <div class="lu-card flat up"><lu-icon name="gem" [size]="20" /><span><strong>{{ nextUnlock().title }}</strong><br /><span class="xs muted">{{ nextUnlock().text }}</span></span></div>
            }
            @if (improvements().length) {
              <p class="xs muted">Améliorations choisies : {{ improvements().join(' · ') }}</p>
            }
          </section>

          @if (ch.motto || oath()) {
            <section class="lu-card flat">
              <span class="lu-eyebrow">MON ENGAGEMENT</span>
              <p class="oath">{{ oath() || 'Tu n’as pas écrit d’engagement. Tu peux le faire dans les Réglages.' }}</p>
            </section>
          }
          <button type="button" class="lu-btn ghost" (click)="shareSheet()"><lu-icon name="download" [size]="17" /> Partager ma fiche (image)</button>
        </div>
      }

      @if (detail(); as a) {
        <lu-modal [label]="label(a)" (close)="detail.set(null)">
          <div class="dh"><lu-ability-badge [ability]="a" [size]="52" /><div><h2>{{ label(a) }}</h2><p class="xs muted">{{ tagline(a) }}</p></div></div>
          <div class="dstat">
            <div><strong>{{ game.scores()[a] }}</strong><span>Score</span></div>
            <div><strong>{{ mod(game.scores()[a]) }}</strong><span>Modificateur</span></div>
            <div><strong>{{ fmt(c()!.abilityXp[a]) }}</strong><span>XP gagnée</span></div>
          </div>
          @if (info(a).needed) { <lu-bar [value]="info(a).current" [max]="info(a).needed" /><p class="xs muted">{{ fmt(info(a).current) }} / {{ fmt(info(a).needed) }} XP avant le point suivant</p> }
          <div class="lu-label">Évolution sur 6 mois</div>
          <svg viewBox="0 0 300 90" class="spark" role="img" aria-label="Historique du score">
            <polyline [attr.points]="history(a).line" fill="none" stroke="var(--lu-accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
            @for (p of history(a).dots; track p[0]) { <circle [attr.cx]="p[0]" [attr.cy]="p[1]" r="3.5" fill="var(--lu-accent)" /> }
          </svg>
          <div class="lu-label">Quêtes les plus accomplies</div>
          @for (q of topQuests(a); track q.title) { <p class="small">{{ q.title }} <span class="muted">· {{ q.n }} fois</span></p> } @empty { <p class="small muted">Rien encore dans cette caractéristique.</p> }
          <button type="button" class="lu-btn" (click)="goGrimoire(a)">Voir les quêtes de {{ label(a) }}</button>
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    .ident { gap: 12px; }
    .ident.legend { border-color: var(--lu-gold-strong); box-shadow: 0 0 0 1px var(--lu-gold-strong), var(--lu-shadow); }
    .top { display: flex; gap: 16px; align-items: center; }
    .id { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .nm { font-size: 30px; line-height: 1.1; font-weight: 500; }
    .cls { font-size: 13px; color: var(--lu-text-2); }
    .mot { font-family: var(--lu-font-title); font-style: italic; font-size: 13px; color: var(--lu-muted); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chips .lu-chip { cursor: default; } .chips button.lu-chip { cursor: pointer; }
    .xp { display: flex; justify-content: space-between; font-size: 11px; }
    .mint { color: var(--lu-accent); }
    .radar { gap: 8px; }
    .rhead { display: flex; justify-content: space-between; align-items: baseline; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .ab { padding: 14px; gap: 6px; align-items: flex-start; cursor: pointer; text-align: left; color: inherit; font: inherit; }
    .ah { display: flex; width: 100%; justify-content: space-between; align-items: center; }
    .mast { color: var(--lu-gold); font-size: 14px; }
    .an { font-size: 12px; color: var(--lu-muted); }
    .av { font-family: var(--lu-font-title); font-size: 34px; line-height: 1.05; }
    .av.leg { color: var(--lu-gold); }
    .mod { font-size: 11px; font-weight: 600; color: var(--lu-accent); }
    .ab lu-bar { width: 100%; }
    .srow { display: flex; justify-content: space-between; align-items: center; }
    .big { display: inline-flex; gap: 8px; align-items: center; font-family: var(--lu-font-title); font-size: 21px; }
    .big lu-icon, .insp { color: var(--lu-gold); }
    .insp { display: inline-flex; gap: 6px; align-items: center; font-size: 12px; font-weight: 600; }
    .days { display: flex; justify-content: space-between; }
    .dd { display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .dl { font-size: 10px; font-weight: 700; color: var(--lu-muted); }
    .dc { width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-surface-2); border: 1.5px solid var(--lu-border); color: var(--lu-accent-ink); }
    .dd.on .dc { background: var(--lu-accent); border-color: var(--lu-accent); }
    .dd.today .dc { border-color: var(--lu-gold); }
    .dd.rest .dc { color: var(--lu-muted); }
    .traits { flex-direction: row; justify-content: space-around; padding: 14px 8px; }
    .t { display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .t strong { font-family: var(--lu-font-title); font-size: 24px; font-weight: 500; }
    .t span { font-size: 10px; color: var(--lu-muted); }
    .trophies { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .tr { padding: 12px 10px; gap: 6px; align-items: center; text-align: center; }
    .tr strong { font-size: 12px; line-height: 1.25; }
    .ti { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: var(--lu-gold-bg); color: var(--lu-gold); }
    .up { flex-direction: row; align-items: center; gap: 12px; text-align: left; padding: 14px; cursor: pointer; color: inherit; font: inherit; width: 100%; }
    .up b { margin-left: auto; font-size: 12px; color: var(--lu-gold); }
    .oath { font-family: var(--lu-font-title); font-style: italic; font-size: 15px; line-height: 1.55; }
    .dh { display: flex; gap: 14px; align-items: center; padding-right: 40px; }
    .dh h2 { font-size: 26px; }
    .dstat { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; text-align: center; }
    .dstat div { display: flex; flex-direction: column; gap: 2px; padding: 10px 4px; background: var(--lu-surface-2); border-radius: 14px; }
    .dstat strong { font-family: var(--lu-font-title); font-size: 24px; font-weight: 500; }
    .dstat span { font-size: 10px; color: var(--lu-muted); }
    .spark { width: 100%; height: 90px; }
  `,
})
export class HeroPage {
  protected game = inject(GameService);
  protected ui = inject(UiService);
  protected auth = inject(AuthService);
  private be = inject(BackendService);
  readonly fmt = fmt;
  readonly c = this.game.character;
  readonly order: AbilityId[] = ['CON', 'SAG', 'INT', 'CHA', 'DEX', 'FOR'];
  readonly detail = signal<AbilityId | null>(null);
  readonly history$ = signal<QuestInstance[]>([]);
  readonly events = signal<{ ability: AbilityId; amount: number; gameDate: string }[]>([]);
  readonly oath = signal('');

  label = (a: AbilityId) => ABILITY_LABEL[a];
  tagline = (a: AbilityId) => ABILITY_TAGLINE[a];
  mod = (s: number) => (abilityModifier(s) >= 0 ? '+' : '') + abilityModifier(s);
  info = (a: AbilityId) => abilityProgressOf(this.game.character()!, a);

  readonly since = computed(() => new Date(this.auth.profile()?.createdAt ?? this.c()?.createdAt ?? Date.now()).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }));
  readonly totalDone = computed(() => this.history$().filter((i) => i.status === 'completed').length || this.game.recent().filter((i) => i.status === 'completed').length);
  readonly counts = computed(() => {
    const out = { easy: 0, medium: 0, high: 0, expert: 0 };
    for (const i of this.history$()) if (i.status === 'completed') out[i.snapshot.difficulty]++;
    return out;
  });
  readonly recentTrophies = computed(() => {
    const u = [...this.game.unlocked()].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt)).slice(0, 3);
    return u.map((x) => ACHIEVEMENTS.find((a) => a.id === x.achievementId)).filter((a): a is NonNullable<typeof a> => !!a);
  });
  readonly improvements = computed(() => {
    const imp = this.c()?.improvements;
    return imp ? ABILITIES.filter((a) => imp[a] > 0).map((a) => `${ABILITY_LABEL[a]} +${imp[a]}`) : [];
  });
  readonly nextUnlock = computed(() => {
    const l = this.game.level();
    const marks: [number, string, string][] = [
      [2, 'Créer ses quêtes', 'Crée tes propres quêtes au niveau 2.'],
      [3, 'Une voie à choisir', 'Une affinité secondaire au niveau 3.'],
      [4, 'Une amélioration', '+2 à répartir au niveau 4.'],
      [5, '4 quêtes par jour', '4 quêtes par jour au niveau 5.'],
      [6, 'Une quête de plus', 'Une 3e quête hebdomadaire au niveau 6.'],
      [8, 'Une amélioration', '+2 à répartir au niveau 8.'],
      [10, 'Routine ancrée', '5 quêtes par jour et 2 quêtes mensuelles au niveau 10.'],
      [11, 'Quêtes de niveau 4', 'Quêtes légendaires et épiques au niveau 11.'],
      [12, 'Une amélioration', '+2 à répartir au niveau 12.'],
      [14, 'Une quête de plus', 'Une 4e quête hebdomadaire au niveau 14.'],
      [16, 'Une amélioration', '+2 à répartir au niveau 16.'],
      [17, '6 quêtes par jour', '6 quêtes par jour au niveau 17.'],
      [19, 'Dernière amélioration', '+2 à répartir au niveau 19.'],
      [20, 'Titre final', 'Le titre final au niveau 20.'],
    ];
    const n = marks.find((m) => m[0] > l);
    return n ? { title: n[1], text: n[2] } : { title: 'Au sommet', text: 'Tu as atteint tous les déblocages. Continue pour les rangs légendaires.' };
  });
  readonly week = computed(() => {
    const today = this.game.today();
    const tz = this.game.tz();
    const reset = this.game.settings()?.resetHour ?? 4;
    const doneDays = new Set(
      this.game.recent().concat(this.game.instances()).filter((i) => i.period === 'daily' && i.status === 'completed' && i.completedAt).map((i) => gameDate(Date.parse(i.completedAt!), tz, reset)),
    );
    const rest = new Set(this.game.restDays());
    return Array.from({ length: 7 }, (_, k) => {
      const date = addDays(today, k - 6);
      return { date, letter: DAY_LETTERS[new Date(`${date}T12:00:00`).getDay()], done: doneDays.has(date), today: date === today, rest: rest.has(date) };
    });
  });

  constructor() {
    void this.loadHistory();
    void this.be.game.store.getCharacter(this.be.game.userId());
    void this.loadOath();
  }

  private async loadHistory(): Promise<void> {
    try {
      const uid = this.be.game.userId();
      this.history$.set(await this.be.game.store.listInstances(uid, { status: 'completed' }));
      this.events.set(await this.be.game.store.listXpEvents(uid, addDays(this.game.today(), -190)));
    } catch {
      /* hors ligne */
    }
  }

  private async loadOath(): Promise<void> {
    try {
      const c = await this.be.game.store.getCharacter(this.be.game.userId());
      this.oath.set(c?.oath ?? '');
    } catch {
      /* hors ligne */
    }
  }

  openAbility(a: AbilityId): void {
    this.detail.set(a);
  }

  /** Score de fin de mois sur 6 mois, reconstruit depuis le registre d'XP. */
  history(a: AbilityId): { line: string; dots: [number, number][] } {
    const c = this.c();
    if (!c) return { line: '', dots: [] };
    const today = this.game.today();
    const evs = this.events().filter((e) => e.ability === a);
    const total = c.abilityXp[a];
    const pts: number[] = [];
    for (let m = 5; m >= 0; m--) {
      const cutoff = addDays(today, -30 * m);
      const after = evs.filter((e) => e.gameDate > cutoff).reduce((n, e) => n + e.amount, 0);
      pts.push(abilityProgress(c.baseScores[a], Math.max(total - after, 0), c.improvements[a]).score);
    }
    const lo = Math.min(...pts) - 0.5;
    const hi = Math.max(...pts) + 0.5;
    const dots = pts.map((v, i) => [10 + (i * 280) / 5, 80 - ((v - lo) / (hi - lo || 1)) * 70] as [number, number]);
    return { line: dots.map((d) => d.join(',')).join(' '), dots };
  }

  topQuests(a: AbilityId): { title: string; n: number }[] {
    const m = new Map<string, number>();
    for (const i of this.history$()) if (i.status === 'completed' && i.snapshot.ability === a) m.set(i.snapshot.title, (m.get(i.snapshot.title) ?? 0) + 1);
    return [...m.entries()].map(([title, n]) => ({ title, n })).sort((x, y) => y.n - x.n).slice(0, 3);
  }

  goGrimoire(a: AbilityId): void {
    this.detail.set(null);
    this.ui.go('/grimoire', { queryParams: { ability: a } });
  }

  async pickTitle(): Promise<void> {
    const titles = this.game.titles();
    if (!titles.length) {
      this.game.toast('Débloque des succès pour gagner des titres honorifiques.', 'info');
      return;
    }
    const choice = await this.ui.choose('Titre affiché', [
      { text: 'Titre de palier : ' + this.game.tier().name, value: '__tier__' },
      ...titles.map((t) => ({ text: t, value: t })),
    ]);
    if (choice === null) return;
    await this.game.equipTitle(choice === '__tier__' ? null : choice);
  }

  async shareSheet(): Promise<void> {
    const c = this.c();
    if (!c) return;
    const blob = await renderSheetPng({
      name: c.name,
      className: this.game.classDef()?.name ?? '',
      level: c.level,
      title: this.game.displayTitle(),
      scores: this.game.scores(),
      base: c.baseScores,
      streak: c.streakCurrent,
      motto: c.motto,
      legendary: c.level >= 20,
    });
    const file = new File([blob], 'ma-fiche-level-up.png', { type: 'image/png' });
    try {
      if (!Capacitor.isNativePlatform() && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Ma fiche Level Up' });
        return;
      }
      if (Capacitor.isNativePlatform()) {
        const url = URL.createObjectURL(blob);
        await Share.share({ title: 'Ma fiche Level Up', url });
        return;
      }
    } catch {
      /* partage annulé : on télécharge */
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ma-fiche-level-up.png';
    a.click();
    this.game.toast('Fiche enregistrée en image.', 'success');
  }
}
