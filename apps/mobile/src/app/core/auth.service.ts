import { Injectable, computed, inject, signal } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { BackendService } from './backend.service';
import { GameService } from './game.service';
import type { AuthUser, MyProfile } from './api/types';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private be = inject(BackendService);
  private router = inject(Router);
  readonly user = signal<AuthUser | null>(null);
  readonly profile = signal<MyProfile | null>(null);
  readonly ready = signal(false);
  readonly signedIn = computed(() => !!this.user());

  async init(): Promise<void> {
    this.user.set(await this.be.auth.getUser());
    if (this.user()) await this.loadProfile();
    this.ready.set(true);
    this.be.auth.onChange(async (u) => {
      const changed = u?.id !== this.user()?.id;
      const hadUser = !!this.user();
      this.user.set(u);
      if (u && changed) await this.loadProfile();
      if (!u) this.profile.set(null);
      // Session retrouvée après coup (réseau revenu) : on quitte l'écran d'accueil ; session perdue : on y retourne.
      const url = this.router.url.split('?')[0];
      if (u && changed && url === '/auth') void this.router.navigateByUrl('/tabs/tavern', { replaceUrl: true });
      if (!u && hadUser && !url.startsWith('/auth') && !url.startsWith('/legal')) void this.router.navigateByUrl('/auth', { replaceUrl: true });
    });
  }

  async loadProfile(): Promise<void> {
    try {
      this.profile.set(await this.be.auth.getProfile());
    } catch {
      /* hors ligne : on garde l'ancien profil */
    }
  }

  async signOut(): Promise<void> {
    await this.be.auth.signOut();
    this.user.set(null);
    this.profile.set(null);
  }
}

/** Sans session : redirection vers /auth. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.signedIn() ? true : router.createUrlTree(['/auth']);
};

/** Avec session mais sans personnage : redirection vers /onboarding. Charge l'état du jeu au besoin. */
export const characterGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const game = inject(GameService);
  const router = inject(Router);
  if (!auth.signedIn()) return router.createUrlTree(['/auth']);
  if (!game.loaded()) await game.load();
  return game.character() ? true : router.createUrlTree(['/onboarding']);
};

/** Pour /auth et /onboarding : déjà connecté ou déjà un personnage → on redirige. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.signedIn() ? router.createUrlTree(['/tabs/tavern']) : true;
};

export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const game = inject(GameService);
  const router = inject(Router);
  if (!auth.signedIn()) return router.createUrlTree(['/auth']);
  if (!game.loaded()) await game.load();
  return game.character() ? router.createUrlTree(['/tabs/tavern']) : true;
};
