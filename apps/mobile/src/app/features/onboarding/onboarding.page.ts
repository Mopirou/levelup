import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular';
import {
  ABILITIES,
  ABILITY_COLOR,
  ABILITY_LABEL,
  ABILITY_TAGLINE,
  BALANCED_SCORES,
  CLASSES,
  MIN_SCORE,
  POINT_BUY_BUDGET,
  POINT_BUY_COST,
  POINT_BUY_MAX,
  abilityModifier,
  pointBuySpent,
  scoresFromAssessment,
  type AbilityId,
  type ClassDef,
  type SelfAssessmentQuestion,
} from '@levelup/engine';
import names from '@levelup/content/names.fr.json';
import assessment from '@levelup/content/self-assessment.fr.json';
import { AuthService } from '../../core/auth.service';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { IconComponent } from '../../shared/icon.component';
import { AbilityBadgeComponent, BarComponent, PORTRAIT_IDS, PortraitComponent, RadarComponent } from '../../shared/ui';

const STEPS = ['Accueil', 'Le principe', 'Le nom', 'La classe', 'Le pseudo', 'Les caractéristiques', 'L’apparence', 'Le Serment'] as const;
const FRAMES = ['#2f5a47', '#4a82b8', '#8a6bb8', '#c8553d', '#e0893d', '#d9ae3a', '#5f9e6e', '#a8c0b0'];
const DRAFT_KEY = 'lu-onboarding-draft';

interface Draft {
  step: number;
  name: string;
  classId: string | null;
  username: string;
  scores: Record<AbilityId, number>;
  portraitId: string;
  frameColor: string;
  motto: string;
  oath: string;
  answers: Record<string, number>;
}

function loadDraft(): Draft | null {
  try {
    return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null');
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-onboarding',
  imports: [IonContent, IconComponent, AbilityBadgeComponent, BarComponent, PortraitComponent, RadarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        <header class="top">
          @if (step() > 0) {
            <button type="button" class="lu-icon-btn" (click)="prev()" aria-label="Retour"><lu-icon name="chevron-left" [size]="18" /></button>
          } @else { <span style="width: 36px"></span> }
          <div class="prog" role="progressbar" [attr.aria-valuenow]="step() + 1" aria-valuemin="1" [attr.aria-valuemax]="steps.length" [attr.aria-label]="'Étape ' + (step() + 1) + ' sur ' + steps.length">
            <lu-bar [value]="step() + 1" [max]="steps.length" />
          </div>
          <span class="xs muted">{{ step() + 1 }}/{{ steps.length }}</span>
        </header>

        @switch (step()) {
          @case (0) {
            <section class="step fade-in center">
              <svg viewBox="0 0 200 220" class="door" aria-hidden="true">
                <defs><radialGradient id="dl" cx="0.5" cy="0.6" r="0.6"><stop offset="0" stop-color="#f2d38a" stop-opacity=".95" /><stop offset="1" stop-color="#f2d38a" stop-opacity="0" /></radialGradient></defs>
                <ellipse cx="100" cy="150" rx="95" ry="70" fill="url(#dl)" />
                <path d="M40 220 V100 a60 60 0 0 1 120 0 V220 Z" fill="#3a2a1a" stroke="#c9a15a" stroke-width="4" />
                <path d="M100 40 V220 M46 130 h108 M46 175 h108" stroke="#1d140b" stroke-width="3" />
                <circle cx="124" cy="150" r="5" fill="#f2d38a" />
              </svg>
              <h1 class="lu-title">Tout héros commence quelque part.</h1>
              <p class="lead">Le tien commence ici, ce soir, avec une décision.</p>
              <button type="button" class="lu-btn" (click)="next()">Pousser la porte</button>
            </section>
          }
          @case (1) {
            <section class="step fade-in">
              <h1 class="lu-title s">Comment ça marche</h1>
              <div class="cards">
                @for (c of principle; track c.t; let i = $index) {
                  <article class="lu-card" [class.on]="card() === i" (click)="card.set(i)">
                    <span class="lu-badge big"><lu-icon [name]="c.i" [size]="24" /></span>
                    <h3>{{ c.t }}</h3>
                    <p class="small muted">{{ c.d }}</p>
                  </article>
                }
              </div>
              <div class="dots">@for (c of principle; track c.t; let i = $index) { <i [class.on]="card() === i"></i> }</div>
              <button type="button" class="lu-btn" (click)="next()">J’ai compris</button>
            </section>
          }
          @case (2) {
            <section class="step fade-in">
              <h1 class="lu-title s">Comment s’appelle ton personnage ?</h1>
              <p class="lead">Un nom de fantasy, ou ton vrai nom : comme tu veux.</p>
              <div class="lu-field">
                <label for="nm">Nom du personnage</label>
                <div class="row">
                  <input id="nm" class="lu-input" [value]="name()" maxlength="30" (input)="name.set($any($event.target).value)" placeholder="Aldric" autocomplete="off" />
                  <button type="button" class="lu-icon-btn dice" (click)="randomName()" aria-label="Nom aléatoire"><lu-icon name="dices" [size]="20" /></button>
                </div>
                <span class="hint">2 à 30 caractères.</span>
              </div>
              <button type="button" class="lu-btn" [disabled]="!nameOk()" (click)="next()">Continuer</button>
            </section>
          }
          @case (3) {
            <section class="step fade-in">
              <h1 class="lu-title s">Choisis ta classe</h1>
              <p class="lead">Elle donne la maîtrise de deux caractéristiques. Elle ne bloque rien : toutes les quêtes restent accessibles.</p>
              <div class="classes">
                @for (c of classes; track c.id) {
                  <button type="button" class="class" [class.on]="classId() === c.id" (click)="openClass.set(c)">
                    <lu-icon [name]="c.icon === 'footsteps-outline' ? 'footprints' : iconFor(c)" [size]="24" />
                    <strong>{{ c.name }}</strong>
                    <span class="pills"><i [style.--c]="color(c.masteries[0])">{{ short(c.masteries[0]) }}</i><i [style.--c]="color(c.masteries[1])">{{ short(c.masteries[1]) }}</i></span>
                    <span class="xs muted">{{ c.profile }}</span>
                  </button>
                }
              </div>
            </section>
            @if (openClass(); as c) {
              <div class="modal" role="dialog" aria-modal="true" [attr.aria-label]="c.name" (click)="openClass.set(null)">
                <div class="panel" (click)="$event.stopPropagation()">
                  <h2>{{ c.name }}</h2>
                  <p class="muted small">{{ c.profile }}</p>
                  <div class="pills big">@for (m of c.masteries; track m) { <i [style.--c]="color(m)">{{ label(m) }}</i> }</div>
                  <p class="lead">{{ c.description }}</p>
                  <div class="lu-label">Quêtes favorisées</div>
                  <ul class="list">@for (q of c.favoredQuests; track q) { <li>{{ q }}</li> }</ul>
                  <div class="lu-label">Voies au niveau 3</div>
                  <ul class="list">@for (p of c.paths; track p.id) { <li><strong>{{ p.name }}</strong> — {{ label(p.ability) }}</li> }</ul>
                  <button type="button" class="lu-btn mint" (click)="chooseClass(c)">Choisir cette classe</button>
                  <button type="button" class="lu-btn text" (click)="openClass.set(null)">Fermer</button>
                </div>
              </div>
            }
          }
          @case (4) {
            <section class="step fade-in">
              <h1 class="lu-title s">Ton pseudo public</h1>
              <p class="lead">C’est lui que tes amis cherchent pour te retrouver. Lettres, chiffres et tirets, 3 à 20 caractères.</p>
              <div class="lu-field">
                <label for="us">Pseudo</label>
                <input id="us" class="lu-input" [value]="username()" maxlength="20" (input)="onUsername($any($event.target).value)" placeholder="alex-en-chemin" autocapitalize="none" autocorrect="off" spellcheck="false" />
                @if (userState() === 'checking') { <span class="hint">Vérification…</span> }
                @if (userState() === 'ok') { <span class="hint ok">✓ Ce pseudo est libre.</span> }
                @if (userState() === 'taken') { <span class="err">Ce pseudo est déjà pris.</span> }
                @if (userState() === 'bad') { <span class="err">3 à 20 caractères : lettres, chiffres et tirets.</span> }
              </div>
              <button type="button" class="lu-btn" [disabled]="userState() !== 'ok'" (click)="next()">Continuer</button>
            </section>
          }
          @case (5) {
            <section class="step fade-in">
              <h1 class="lu-title s">Tes caractéristiques</h1>
              <div class="lu-seg">
                <button type="button" [class.on]="tab() === 'buy'" (click)="tab.set('buy')">Achat de points</button>
                <button type="button" [class.on]="tab() === 'quiz'" (click)="tab.set('quiz')">Auto-évaluation</button>
              </div>
              @if (tab() === 'buy') {
                <div class="remaining" [class.zero]="remaining() === 0">Points restants : <strong>{{ remaining() }}</strong></div>
                <div class="abil">
                  @for (a of abilities; track a) {
                    <div class="arow">
                      <lu-ability-badge [ability]="a" [size]="36" />
                      <div class="atxt"><strong>{{ label(a) }}</strong><span class="xs muted">{{ tagline(a) }}</span></div>
                      <div class="stepper">
                        <button type="button" (click)="bump(a, -1)" [disabled]="scores()[a] <= min" [attr.aria-label]="'Moins de ' + label(a)">−</button>
                        <b>{{ scores()[a] }}</b><em>{{ mod(scores()[a]) }}</em>
                        <button type="button" (click)="bump(a, 1)" [disabled]="!canBump(a)" [attr.aria-label]="'Plus de ' + label(a)">+</button>
                      </div>
                    </div>
                  }
                </div>
                <button type="button" class="lu-btn ghost small inline" (click)="balanced()">Répartition équilibrée</button>
              } @else {
                <p class="lead">Réponds honnêtement : tu partiras d’un portrait de toi, avec tes forces et tes faiblesses. Tu pourras le modifier ensuite.</p>
                @for (q of quiz; track q.id) {
                  <div class="q">
                    <p class="qt">{{ q.text }}</p>
                    <input type="range" min="1" max="5" step="1" [value]="answers()[q.id] ?? 3" (input)="answer(q.id, $any($event.target).value)" [attr.aria-label]="q.text" />
                    <div class="ends"><span>{{ q.low }}</span><span>{{ q.high }}</span></div>
                  </div>
                }
                <button type="button" class="lu-btn mint" (click)="applyQuiz()">Calculer ma répartition</button>
              }
              <lu-radar [scores]="scores()" [max]="15" />
              <button type="button" class="lu-btn" (click)="next()">Continuer</button>
            </section>
          }
          @case (6) {
            <section class="step fade-in">
              <h1 class="lu-title s">Ton apparence</h1>
              <div class="center"><lu-portrait [id]="portraitId()" [size]="104" [frame]="frameColor()" /></div>
              <div class="lu-label">Portrait</div>
              <div class="portraits">
                @for (p of portraits; track p) {
                  <button type="button" [class.on]="portraitId() === p" (click)="portraitId.set(p)" [attr.aria-label]="'Portrait ' + p" [attr.aria-pressed]="portraitId() === p">
                    <lu-portrait [id]="p" [size]="52" [frame]="portraitId() === p ? frameColor() : 'transparent'" />
                  </button>
                }
              </div>
              <div class="lu-label">Couleur du cadre</div>
              <div class="frames">
                @for (f of frames; track f) { <button type="button" [style.background]="f" [class.on]="frameColor() === f" (click)="frameColor.set(f)" [attr.aria-label]="'Cadre ' + f"></button> }
              </div>
              <div class="lu-field">
                <label for="mo">Devise · facultatif</label>
                <input id="mo" class="lu-input" maxlength="80" [value]="motto()" (input)="motto.set($any($event.target).value)" placeholder="Un pas après l’autre" />
              </div>
              <button type="button" class="lu-btn" (click)="next()">Continuer</button>
            </section>
          }
          @case (7) {
            <section class="step fade-in">
              <h1 class="lu-title s">Le Serment</h1>
              <div class="lu-card recap">
                <lu-portrait [id]="portraitId()" [size]="72" [frame]="frameColor()" />
                <h3>{{ name() }}</h3>
                <p class="small muted">{{ chosenClass()?.name }} · @{{ username() }}</p>
                @if (motto()) { <p class="mot">« {{ motto() }} »</p> }
              </div>
              <lu-radar [scores]="scores()" [max]="15" />
              <div class="lu-field">
                <label for="oa">Pourquoi entreprends-tu cette quête ? · facultatif</label>
                <textarea id="oa" class="lu-input area" rows="3" [value]="oath()" (input)="oath.set($any($event.target).value)" placeholder="Pour retrouver de l’énergie, pour apprendre à me connaître…"></textarea>
                <span class="hint">Ce texte reste privé. Il te sera rappelé dans ta Chronique.</span>
              </div>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              <button type="button" class="lu-btn mint seal" [disabled]="busy()" (click)="swear()">
                <lu-icon name="scroll" [size]="18" /> Prêter serment
              </button>
            </section>
          }
        }
        @if (sealing()) {
          <div class="sealing" aria-live="assertive">
            <div class="wax pop"><lu-icon name="sparkles" [size]="46" /></div>
            <p>Le sceau est apposé…</p>
          </div>
        }
      </div>
    </ion-content>
  `,
  styles: `
    ion-content { --background: var(--lu-bg-grad); }
    .wrap { max-width: 480px; margin: 0 auto; padding: calc(var(--lu-safe-top) + 14px) 20px calc(32px + var(--lu-safe-bottom)); min-height: 100%; display: flex; flex-direction: column; gap: 16px; }
    .top { display: flex; align-items: center; gap: 12px; }
    .prog { flex: 1; }
    .step { display: flex; flex-direction: column; gap: 16px; }
    .center { align-items: center; text-align: center; }
    .lu-title { font-size: 32px; } .lu-title.s { font-size: 27px; }
    .lead { font-size: 14px; line-height: 1.55; color: var(--lu-text-2); }
    .door { width: 190px; height: auto; margin: 10px auto 0; }
    .cards { display: flex; flex-direction: column; gap: 12px; }
    .cards .lu-card { opacity: .6; transition: opacity .2s, transform .2s; }
    .cards .lu-card.on { opacity: 1; transform: scale(1.01); border-color: var(--lu-accent); }
    .lu-badge.big { width: 48px; height: 48px; }
    .dots { display: flex; justify-content: center; gap: 6px; }
    .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--lu-track); }
    .dots i.on { background: var(--lu-accent); }
    .row { display: flex; gap: 10px; }
    .dice { width: 48px; height: 48px; border-radius: 16px; }
    .classes { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .class { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; text-align: left; padding: 14px; border-radius: 18px; border: 1px solid var(--lu-border); background: var(--lu-surface-grad); color: var(--lu-text); cursor: pointer; }
    .class.on { border-color: var(--lu-accent); }
    .class lu-icon { color: var(--lu-accent); }
    .class strong { font-family: var(--lu-font-title); font-size: 18px; font-weight: 500; }
    .pills { display: flex; gap: 6px; }
    .pills i { font-style: normal; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px; color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
    .pills.big i { font-size: 12px; padding: 4px 12px; }
    .modal { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: flex-end; justify-content: center; background: var(--lu-overlay); }
    .panel { width: min(480px, 100%); max-height: 92vh; overflow-y: auto; background: var(--lu-bg); border-radius: 24px 24px 0 0; padding: 22px 20px calc(24px + var(--lu-safe-bottom)); display: flex; flex-direction: column; gap: 12px; }
    .panel h2 { font-size: 28px; }
    .list { margin: 0; padding-left: 18px; font-size: 13px; line-height: 1.6; color: var(--lu-text-2); }
    .remaining { text-align: center; font-size: 14px; padding: 10px; border-radius: 14px; background: var(--lu-surface-2); }
    .remaining strong { font-size: 18px; color: var(--lu-accent); }
    .remaining.zero strong { color: var(--lu-danger); }
    .abil { display: flex; flex-direction: column; gap: 4px; }
    .arow { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--lu-border); }
    .atxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .atxt strong { font-size: 14px; }
    .stepper { display: flex; align-items: center; gap: 8px; }
    .stepper button { width: 38px; height: 38px; border-radius: 50%; border: 1px solid var(--lu-border-strong); background: var(--lu-surface-2); color: var(--lu-text); font-size: 20px; cursor: pointer; }
    .stepper button:disabled { opacity: .3; }
    .stepper b { font-family: var(--lu-font-title); font-size: 22px; min-width: 28px; text-align: center; font-weight: 500; }
    .stepper em { font-style: normal; font-size: 11px; color: var(--lu-gold); width: 24px; }
    .q { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--lu-border); }
    .qt { font-size: 13px; line-height: 1.4; }
    .q input[type='range'] { width: 100%; accent-color: var(--lu-accent); height: 32px; }
    .ends { display: flex; justify-content: space-between; font-size: 10px; color: var(--lu-muted); }
    .portraits { display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; }
    .portraits button { background: none; border: 0; padding: 0; cursor: pointer; border-radius: 50%; opacity: .75; }
    .portraits button.on { opacity: 1; }
    .frames { display: flex; gap: 10px; flex-wrap: wrap; }
    .frames button { width: 32px; height: 32px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; }
    .frames button.on { border-color: var(--lu-text); }
    .recap { align-items: center; text-align: center; }
    .mot { font-family: var(--lu-font-title); font-style: italic; font-size: 14px; color: var(--lu-text-2); }
    .err { color: var(--lu-danger); font-size: 12px; }
    .ok { color: var(--lu-accent); }
    .sealing { position: fixed; inset: 0; z-index: 15000; display: grid; place-content: center; justify-items: center; gap: 16px; background: var(--lu-overlay); backdrop-filter: blur(6px); color: #fff; }
    .wax { width: 120px; height: 120px; border-radius: 50%; display: grid; place-items: center; background: radial-gradient(circle at 35% 30%, #d9603c, #8d2a14 70%); color: #ffd9b8; box-shadow: 0 10px 40px rgba(0,0,0,.5), inset 0 0 0 6px rgba(255,255,255,.08); animation: stamp .7s cubic-bezier(.2,1.5,.4,1) both; }
    @keyframes stamp { 0% { transform: scale(2.2) rotate(-18deg); opacity: 0; } 70% { transform: scale(.94) rotate(3deg); opacity: 1; } 100% { transform: scale(1) rotate(0); } }
  `,
})
export class OnboardingPage {
  private router = inject(Router);
  private be = inject(BackendService);
  private auth = inject(AuthService);
  private game = inject(GameService);
  readonly steps = STEPS;
  readonly classes = CLASSES;
  readonly abilities = ABILITIES;
  readonly portraits = PORTRAIT_IDS;
  readonly frames = FRAMES;
  readonly min = MIN_SCORE;
  readonly quiz = assessment as SelfAssessmentQuestion[];
  readonly principle = [
    { i: 'swords', t: 'Accomplis des quêtes réelles', d: 'Marcher, lire, respirer, appeler un ami : chaque action concrète devient une quête.' },
    { i: 'trending', t: 'Gagne de l’XP dans 6 caractéristiques', d: 'Force, Dextérité, Constitution, Intelligence, Sagesse et Charisme progressent chacune à leur rythme.' },
    { i: 'crown', t: 'Monte de niveau', d: 'Ton héros grandit avec toi : nouvelles quêtes, titres, trophées, et des compagnons pour t’encourager.' },
  ];

  private d = loadDraft();
  readonly step = signal(this.d?.step ?? 0);
  readonly card = signal(0);
  readonly name = signal(this.d?.name ?? '');
  readonly classId = signal<string | null>(this.d?.classId ?? null);
  readonly openClass = signal<ClassDef | null>(null);
  readonly username = signal(this.d?.username ?? '');
  readonly userState = signal<'idle' | 'checking' | 'ok' | 'taken' | 'bad'>('idle');
  readonly scores = signal<Record<AbilityId, number>>(this.d?.scores ?? { FOR: 8, DEX: 8, CON: 8, INT: 8, SAG: 8, CHA: 8 });
  readonly tab = signal<'buy' | 'quiz'>('buy');
  readonly answers = signal<Record<string, number>>(this.d?.answers ?? {});
  readonly portraitId = signal(this.d?.portraitId ?? 'p01');
  readonly frameColor = signal(this.d?.frameColor ?? FRAMES[0]);
  readonly motto = signal(this.d?.motto ?? '');
  readonly oath = signal(this.d?.oath ?? '');
  readonly busy = signal(false);
  readonly sealing = signal(false);
  readonly error = signal('');

  readonly chosenClass = computed(() => CLASSES.find((c) => c.id === this.classId()));
  readonly nameOk = computed(() => this.name().trim().length >= 2 && this.name().trim().length <= 30);
  readonly remaining = computed(() => POINT_BUY_BUDGET - pointBuySpent(this.scores()));
  private checkTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // Brouillon gardé en mémoire de session (aucune donnée n'est enregistrée avant le serment).
    effect(() => {
      const draft: Draft = {
        step: this.step(), name: this.name(), classId: this.classId(), username: this.username(), scores: this.scores(),
        portraitId: this.portraitId(), frameColor: this.frameColor(), motto: this.motto(), oath: this.oath(), answers: this.answers(),
      };
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        /* ignore */
      }
    });
    if (this.username()) this.onUsername(this.username());
  }

  label = (a: AbilityId) => ABILITY_LABEL[a];
  short = (a: AbilityId) => ABILITY_LABEL[a];
  color = (a: AbilityId) => ABILITY_COLOR[a];
  tagline = (a: AbilityId) => ABILITY_TAGLINE[a];
  mod = (s: number) => (abilityModifier(s) >= 0 ? '+' : '') + abilityModifier(s);
  iconFor(c: ClassDef): string {
    return ({ aventurier: 'compass', artisan: 'hammer', troubadour: 'music', rassembleur: 'users', erudit: 'library', gardien: 'heart', explorateur: 'leaf', eclaireur: 'footprints' } as Record<string, string>)[c.id] ?? 'sparkles';
  }

  next(): void {
    this.step.update((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo?.(0, 0);
  }
  prev(): void {
    this.step.update((s) => Math.max(s - 1, 0));
  }

  randomName(): void {
    const list = names as string[];
    this.name.set(list[Math.floor(Math.random() * list.length)]);
  }

  chooseClass(c: ClassDef): void {
    this.classId.set(c.id);
    this.openClass.set(null);
    this.next();
  }

  onUsername(v: string): void {
    const u = v.trim();
    this.username.set(u);
    clearTimeout(this.checkTimer);
    if (!/^[A-Za-z0-9-]{3,20}$/.test(u)) {
      this.userState.set(u ? 'bad' : 'idle');
      return;
    }
    this.userState.set('checking');
    this.checkTimer = setTimeout(async () => {
      try {
        const own = (await this.be.auth.getProfile())?.username?.toLowerCase() === u.toLowerCase();
        this.userState.set(own || (await this.be.auth.usernameAvailable(u)) ? 'ok' : 'taken');
      } catch {
        this.userState.set('ok');
      }
    }, 350);
  }

  canBump(a: AbilityId): boolean {
    const s = this.scores()[a];
    if (s >= POINT_BUY_MAX) return false;
    return pointBuySpent({ ...this.scores(), [a]: s + 1 }) <= POINT_BUY_BUDGET;
  }
  bump(a: AbilityId, d: number): void {
    const s = this.scores()[a] + d;
    if (s < MIN_SCORE || s > POINT_BUY_MAX || POINT_BUY_COST[s] === undefined) return;
    if (d > 0 && !this.canBump(a)) return;
    this.scores.update((x) => ({ ...x, [a]: s }));
  }
  balanced(): void {
    this.scores.set({ ...BALANCED_SCORES });
  }
  answer(id: string, v: string): void {
    this.answers.update((a) => ({ ...a, [id]: Number(v) }));
  }
  applyQuiz(): void {
    this.scores.set(scoresFromAssessment(this.quiz, this.answers()));
    this.tab.set('buy');
  }

  async swear(): Promise<void> {
    this.error.set('');
    this.busy.set(true);
    try {
      const username = this.username();
      const profile = await this.be.auth.getProfile();
      if (profile && profile.username.toLowerCase() !== username.toLowerCase()) {
        if (!(await this.be.auth.usernameAvailable(username))) {
          this.step.set(4);
          this.userState.set('taken');
          return;
        }
        await this.be.auth.updateUsername(username);
        await this.auth.loadProfile();
      }
      this.sealing.set(true);
      const [r] = await Promise.all([
        this.be.game.createCharacter({
          name: this.name().trim(),
          classId: this.classId()!,
          scores: this.scores(),
          portraitId: this.portraitId(),
          frameColor: this.frameColor(),
          motto: this.motto().trim(),
          oath: this.oath().trim(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris',
        }),
        new Promise((res) => setTimeout(res, 1100)),
      ]);
      if (!r.ok) {
        this.sealing.set(false);
        this.error.set(r.message ?? 'Impossible de créer le personnage.');
        return;
      }
      try {
        sessionStorage.removeItem(DRAFT_KEY);
        const invite = localStorage.getItem('lu-invite');
        if (invite) {
          await this.be.social.sendRequestByCode(invite).catch(() => undefined);
          localStorage.removeItem('lu-invite');
        }
      } catch {
        /* ignore */
      }
      this.game.loaded.set(false);
      await this.game.load();
      await this.router.navigateByUrl('/tabs/tavern', { replaceUrl: true });
    } catch (e) {
      this.sealing.set(false);
      this.error.set(String((e as Error)?.message ?? 'Une erreur est survenue.'));
    } finally {
      this.busy.set(false);
      this.sealing.set(false);
    }
  }
}
