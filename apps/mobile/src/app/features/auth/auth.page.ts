import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { BackendService } from '../../core/backend.service';
import { AuthService } from '../../core/auth.service';
import { env } from '../../core/env';
import { IconComponent } from '../../shared/icon.component';

type Mode = 'home' | 'signup' | 'login' | 'wait' | 'forgot' | 'sent';

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Trop court', 'Faible', 'Correct', 'Bon', 'Excellent'][s] };
}

export function authMessage(e: unknown): string {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  if (/already registered|already been registered|User already/i.test(m)) return 'Cet e-mail a déjà un compte. Connecte-toi ou réinitialise ton mot de passe.';
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return 'Confirme ton e-mail avant de te connecter : un corbeau t’a écrit.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.';
  if (/Password should be/i.test(m)) return 'Le mot de passe doit faire au moins 8 caractères.';
  if (/fetch|network/i.test(m)) return 'Pas de connexion. Vérifie ton réseau et réessaie.';
  return m || 'Quelque chose s’est mal passé. Réessaie.';
}

@Component({
  selector: 'app-auth',
  imports: [IonContent, IconComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <div class="wrap">
        <svg class="gates" viewBox="0 0 360 200" aria-hidden="true">
          <defs>
            <linearGradient id="sk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14382c" /><stop offset="1" stop-color="#0b1a14" /></linearGradient>
            <radialGradient id="gl" cx="0.5" cy="0.9" r="0.6"><stop offset="0" stop-color="#f2d38a" stop-opacity=".85" /><stop offset="1" stop-color="#f2d38a" stop-opacity="0" /></radialGradient>
          </defs>
          <rect width="360" height="200" fill="url(#sk)" />
          @for (s of stars; track $index) { <circle [attr.cx]="s[0]" [attr.cy]="s[1]" r="1.1" fill="#fff" opacity=".55" /> }
          <circle cx="290" cy="40" r="15" fill="#fff1c4" opacity=".95" />
          <path d="M0 200 V150 L40 150 V120 H60 V150 H110 V104 L125 92 L140 104 V200 Z" fill="#0f2a22" />
          <path d="M360 200 V150 L320 150 V120 H300 V150 H250 V104 L235 92 L220 104 V200 Z" fill="#0f2a22" />
          <path d="M120 200 V102 H240 V200 Z" fill="#163a2e" />
          <path d="M140 200 V132 a40 40 0 0 1 80 0 V200 Z" fill="url(#gl)" stroke="#285b46" stroke-width="3" />
          <path d="M180 92 V200" stroke="#0b1a14" stroke-width="3" />
          <path d="M112 102 h16 v-12 h-4 v-8 h-8 v8 h-4z M232 102 h16 v-12 h-4 v-8 h-8 v8 h-4z" fill="#285b46" />
        </svg>

        @switch (mode()) {
          @case ('home') {
            <div class="body fade-in">
              <h1 class="lu-title">Ton aventure commence par une porte.</h1>
              <p class="lead">Celle-ci s’ouvre sur ta propre vie.</p>
              @if (invite()) { <div class="invite"><lu-icon name="user-plus" [size]="16" /> Un compagnon t’invite à rejoindre sa compagnie.</div> }
              <div class="btns">
                @if (apple) { <button type="button" class="lu-btn light" (click)="oauth('apple')"><lu-icon name="globe" [size]="18" /> Continuer avec Apple</button> }
                <button type="button" class="lu-btn light" (click)="oauth('google')"><lu-icon name="globe" [size]="18" /> Continuer avec Google</button>
                <button type="button" class="lu-btn" (click)="mode.set('signup')"><lu-icon name="mail" [size]="18" /> Continuer avec un e-mail</button>
              </div>
              <button type="button" class="lu-btn text" (click)="mode.set('login')">J’ai déjà un compte</button>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              @if (local) {
                <p class="demo"><lu-icon name="info" [size]="13" /> Mode démo : tes données restent sur cet appareil. Pour jouer en ligne avec des compagnons, un projet Supabase est nécessaire (voir le guide).</p>
              }
            </div>
          }
          @case ('signup') {
            <form class="body fade-in" (submit)="signup($event)" novalidate>
              <h1 class="lu-title small">Créer mon compte</h1>
              <div class="lu-field">
                <label for="em">E-mail</label>
                <input id="em" class="lu-input" type="email" autocomplete="email" inputmode="email" [value]="email()" (input)="email.set($any($event.target).value)" required />
              </div>
              <div class="lu-field">
                <label for="pw">Mot de passe</label>
                <input id="pw" class="lu-input" [type]="show() ? 'text' : 'password'" autocomplete="new-password" [value]="pw()" (input)="pw.set($any($event.target).value)" required minlength="8" />
                <div class="meter" [attr.data-s]="pwStrength().score"><i></i><i></i><i></i><i></i></div>
                <span class="hint">{{ pwStrength().label }} · 8 caractères minimum</span>
              </div>
              <div class="lu-field">
                <label for="by">Année de naissance</label>
                <input id="by" class="lu-input" type="number" inputmode="numeric" [min]="1900" [max]="thisYear" placeholder="1995" [value]="birthYear()" (input)="birthYear.set($any($event.target).value)" required />
                <span class="hint">Il faut avoir au moins 15 ans pour jouer.</span>
              </div>
              <label class="terms">
                <input type="checkbox" [checked]="terms()" (change)="terms.set($any($event.target).checked)" />
                <span>J’accepte les <a routerLink="/legal/terms" target="_blank">conditions d’utilisation</a> et la <a routerLink="/legal/privacy" target="_blank">politique de confidentialité</a>.</span>
              </label>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              <button class="lu-btn" type="submit" [disabled]="busy()">Franchir la porte</button>
              <button type="button" class="lu-btn text" (click)="back()">Retour</button>
            </form>
          }
          @case ('login') {
            <form class="body fade-in" (submit)="login($event)" novalidate>
              <h1 class="lu-title small">Bon retour parmi nous</h1>
              <div class="lu-field">
                <label for="em2">E-mail</label>
                <input id="em2" class="lu-input" type="email" autocomplete="email" inputmode="email" [value]="email()" (input)="email.set($any($event.target).value)" required />
              </div>
              <div class="lu-field">
                <label for="pw2">Mot de passe</label>
                <input id="pw2" class="lu-input" [type]="show() ? 'text' : 'password'" autocomplete="current-password" [value]="pw()" (input)="pw.set($any($event.target).value)" required />
              </div>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              <button class="lu-btn" type="submit" [disabled]="busy()">Entrer dans la Cité</button>
              <button type="button" class="lu-btn text" (click)="mode.set('forgot')">Mot de passe oublié ?</button>
              <button type="button" class="lu-btn text" (click)="back()">Retour</button>
            </form>
          }
          @case ('forgot') {
            <form class="body fade-in" (submit)="forgot($event)" novalidate>
              <h1 class="lu-title small">Mot de passe oublié</h1>
              <p class="lead">Un lien magique t’est envoyé par e-mail : un clic et tu es de retour.</p>
              <div class="lu-field">
                <label for="em3">E-mail</label>
                <input id="em3" class="lu-input" type="email" autocomplete="email" [value]="email()" (input)="email.set($any($event.target).value)" required />
              </div>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              <button class="lu-btn" type="submit" [disabled]="busy()">Envoyer le lien</button>
              <button type="button" class="lu-btn text" (click)="mode.set('login')">Retour</button>
            </form>
          }
          @case ('wait') {
            <div class="body fade-in center">
              <lu-icon name="mail" [size]="40" />
              <h1 class="lu-title small">Un corbeau est parti vers ta boîte mail</h1>
              <p class="lead">Ouvre le message envoyé à <strong>{{ email() }}</strong> et clique sur le lien pour confirmer ton compte. Pense à regarder dans les indésirables.</p>
              @if (error()) { <p class="err" role="alert">{{ error() }}</p> }
              <button type="button" class="lu-btn ghost" [disabled]="busy()" (click)="resend()">Renvoyer le message</button>
              <button type="button" class="lu-btn text" (click)="mode.set('login')">J’ai confirmé, me connecter</button>
            </div>
          }
          @case ('sent') {
            <div class="body fade-in center">
              <lu-icon name="mail" [size]="40" />
              <h1 class="lu-title small">Lien envoyé</h1>
              <p class="lead">Si un compte existe pour {{ email() }}, un message vient de partir. Clique sur le lien pour te reconnecter.</p>
              <button type="button" class="lu-btn text" (click)="mode.set('login')">Retour</button>
            </div>
          }
        }
        <p class="foot">
          <a routerLink="/legal/terms">Conditions</a> · <a routerLink="/legal/privacy">Confidentialité</a> · <a routerLink="/legal/community">Règles de la communauté</a>
        </p>
      </div>
    </ion-content>
  `,
  styles: `
    ion-content { --background: var(--lu-bg); }
    .wrap { max-width: 480px; margin: 0 auto; min-height: 100%; display: flex; flex-direction: column; padding-bottom: calc(24px + var(--lu-safe-bottom)); }
    .gates { width: 100%; height: auto; display: block; margin-top: calc(var(--lu-safe-top)); mask-image: linear-gradient(#000 75%, transparent); }
    .body { display: flex; flex-direction: column; gap: 14px; padding: 6px 24px 8px; }
    .body.center { align-items: center; text-align: center; padding-top: 24px; color: var(--lu-accent); }
    .lu-title { font-size: 31px; }
    .lu-title.small { font-size: 27px; }
    .lead { font-size: 15px; line-height: 1.5; color: var(--lu-text-2); }
    .btns { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
    .err { color: var(--lu-danger); font-size: 13px; background: var(--lu-danger-bg); padding: 10px 12px; border-radius: 12px; }
    .demo { display: flex; gap: 8px; font-size: 11px; line-height: 1.5; color: var(--lu-muted); margin-top: 6px; }
    .invite { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-radius: 14px; background: var(--lu-gold-bg); color: var(--lu-gold); font-size: 13px; font-weight: 600; }
    .terms { display: flex; gap: 10px; font-size: 12px; line-height: 1.5; color: var(--lu-text-2); align-items: flex-start; }
    .terms input { width: 20px; height: 20px; margin-top: 1px; accent-color: var(--lu-accent); flex: none; }
    .meter { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
    .meter i { height: 4px; border-radius: 2px; background: var(--lu-track); }
    .meter[data-s='1'] i:nth-child(-n + 1) { background: var(--lu-danger); }
    .meter[data-s='2'] i:nth-child(-n + 2) { background: var(--lu-gold); }
    .meter[data-s='3'] i:nth-child(-n + 3) { background: var(--lu-accent); }
    .meter[data-s='4'] i { background: var(--lu-accent); }
    .foot { margin-top: auto; padding: 24px 24px 0; text-align: center; font-size: 11px; color: var(--lu-dim); }
    .foot a { color: var(--lu-muted); }
  `,
})
export class AuthPage {
  private be = inject(BackendService);
  private authSvc = inject(AuthService);
  private router = inject(Router);
  readonly mode = signal<Mode>('home');
  readonly email = signal('');
  readonly pw = signal('');
  readonly birthYear = signal('');
  readonly terms = signal(false);
  readonly show = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly thisYear = new Date().getFullYear();
  readonly local = !env.cloud;
  readonly apple = Capacitor.getPlatform() === 'ios';
  readonly stars = Array.from({ length: 26 }, (_, i) => [(i * 97) % 360, (i * 53) % 90] as [number, number]);
  readonly pwStrength = computed(() => strength(this.pw()));
  readonly invite = signal(this.readInvite());

  private readInvite(): string | null {
    try {
      return localStorage.getItem('lu-invite');
    } catch {
      return null;
    }
  }

  back(): void {
    this.error.set('');
    this.mode.set('home');
  }

  private async afterSignIn(): Promise<void> {
    await this.router.navigateByUrl('/tabs/tavern', { replaceUrl: true });
  }

  async oauth(p: 'google' | 'apple'): Promise<void> {
    this.error.set('');
    try {
      await this.be.auth.signInOAuth(p);
    } catch (e) {
      this.error.set(authMessage(e));
    }
  }

  async signup(ev: Event): Promise<void> {
    ev.preventDefault();
    this.error.set('');
    const email = this.email().trim();
    const by = Number(this.birthYear());
    if (!/^\S+@\S+\.\S+$/.test(email)) return this.error.set('Cet e-mail ne semble pas valide.');
    if (this.pw().length < 8) return this.error.set('Le mot de passe doit faire au moins 8 caractères.');
    if (!by || by < 1900 || by > this.thisYear) return this.error.set('Indique ton année de naissance.');
    if (this.thisYear - by < 15) return this.error.set('Il faut avoir au moins 15 ans pour utiliser Level Up.');
    if (!this.terms()) return this.error.set('Accepte les conditions d’utilisation et la politique de confidentialité pour continuer.');
    this.busy.set(true);
    try {
      const placeholder = 'aventurier' + Math.random().toString(36).slice(2, 8);
      const r = await this.be.auth.signUp({ email, password: this.pw(), username: placeholder, birthYear: by });
      if (r.confirmationRequired) this.mode.set('wait');
      else {
        await this.authSvc.init();
        await this.afterSignIn();
      }
    } catch (e) {
      this.error.set(authMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async login(ev: Event): Promise<void> {
    ev.preventDefault();
    this.error.set('');
    this.busy.set(true);
    try {
      await this.be.auth.signIn(this.email().trim(), this.pw());
      await this.authSvc.init();
      await this.afterSignIn();
    } catch (e) {
      this.error.set(authMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async forgot(ev: Event): Promise<void> {
    ev.preventDefault();
    this.error.set('');
    this.busy.set(true);
    try {
      await this.be.auth.sendMagicLink(this.email().trim());
      this.mode.set('sent');
    } catch (e) {
      this.error.set(authMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.be.auth.resendConfirmation(this.email().trim());
      this.error.set('');
    } catch (e) {
      this.error.set(authMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
