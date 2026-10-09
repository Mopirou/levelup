import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { GameService } from '../../core/game.service';

/** Retour de connexion (lien magique, confirmation d'e-mail). */
@Component({
  selector: 'app-auth-callback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 40px; text-align: center; color: var(--lu-muted)">Connexion en cours…</p>`,
})
export class AuthCallbackPage {
  private router = inject(Router);
  private auth = inject(AuthService);
  private game = inject(GameService);

  constructor() {
    void this.finish();
  }

  private async finish(): Promise<void> {
    // Laisse au client le temps d'échanger le code contre une session.
    for (let i = 0; i < 20; i++) {
      await this.auth.init();
      if (this.auth.signedIn()) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!this.auth.signedIn()) {
      await this.router.navigateByUrl('/auth', { replaceUrl: true });
      return;
    }
    await this.game.load();
    await this.router.navigateByUrl(this.game.character() ? '/tabs/tavern' : '/onboarding', { replaceUrl: true });
  }
}
