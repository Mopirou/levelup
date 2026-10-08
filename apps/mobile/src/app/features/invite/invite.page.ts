import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';

/** Lien d'invitation : levelup.app/i/ELAN-ALEX-4821. Mémorise le code, puis envoie la demande une fois connecté. */
@Component({
  selector: 'app-invite',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p style="padding: 40px; text-align: center; color: var(--lu-muted)">Ouverture de l’invitation…</p>`,
})
export class InvitePage {
  readonly code = input.required<string>();
  private router = inject(Router);
  private auth = inject(AuthService);
  private be = inject(BackendService);
  private game = inject(GameService);

  constructor() {
    queueMicrotask(() => void this.handle());
  }

  private async handle(): Promise<void> {
    const code = this.code().toUpperCase();
    if (!this.auth.signedIn()) {
      try {
        localStorage.setItem('lu-invite', code);
      } catch {
        /* ignore */
      }
      await this.router.navigateByUrl('/auth', { replaceUrl: true });
      return;
    }
    try {
      if (!this.game.loaded()) await this.game.load();
      if (!this.game.character()) {
        localStorage.setItem('lu-invite', code);
        await this.router.navigateByUrl('/onboarding', { replaceUrl: true });
        return;
      }
      const r = await this.be.social.sendRequestByCode(code);
      this.game.toast(r === 'sent' ? 'Demande envoyée !' : r === 'accepted' ? 'Vous êtes compagnons !' : r === 'already_friends' ? 'Vous êtes déjà compagnons.' : 'Aucun aventurier trouvé.', r === 'sent' || r === 'accepted' ? 'success' : 'info');
    } catch {
      this.game.toast('Invitation impossible pour le moment.', 'error');
    }
    await this.router.navigateByUrl('/companions', { replaceUrl: true });
  }
}
