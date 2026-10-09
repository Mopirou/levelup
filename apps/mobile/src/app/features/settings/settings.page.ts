import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { IonContent } from '@ionic/angular';
import { zipSync, strToU8 } from 'fflate';
import { CLASSES, type SettingsRecord } from '@levelup/engine';
import { AuthService } from '../../core/auth.service';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { NotificationsService } from '../../core/notifications.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { env } from '../../core/env';
import { authMessage } from '../auth/auth.page';
import { PageHeaderComponent, PortraitComponent, PORTRAIT_IDS, SwitchComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';

const ZONES = ['Europe/Paris', 'Europe/Brussels', 'Europe/Zurich', 'Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Berlin', 'Africa/Casablanca', 'Africa/Algiers', 'Africa/Tunis', 'Africa/Dakar', 'America/Montreal', 'America/New_York', 'America/Martinique', 'America/Guadeloupe', 'Indian/Reunion', 'Pacific/Tahiti', 'Pacific/Noumea'];
const FRAMES = ['#2f5a47', '#4a82b8', '#8a6bb8', '#c8553d', '#e0893d', '#d9ae3a', '#5f9e6e', '#a8c0b0'];

/** Réglages : compte, personnage, rythme, partage, notifications, confidentialité, apparence, données. */
@Component({
  selector: 'app-settings',
  imports: [IonContent, RouterLink, PageHeaderComponent, PortraitComponent, SwitchComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <lu-page-header [back]="true" eyebrow="Compte et préférences" icon="settings" title="Réglages" />
      @if (s(); as st) {
        <div class="lu-page">
          <!-- Compte -->
          <section class="lu-card">
            <h3>Compte</h3>
            <div class="lu-row"><div class="grow"><span class="label">Pseudo</span><div class="sub">&#64;{{ auth.profile()?.username }}</div></div><button type="button" class="lu-btn small ghost" (click)="editUsername()">Modifier</button></div>
            <div class="lu-row"><div class="grow"><span class="label">E-mail</span><div class="sub">{{ auth.user()?.email ?? '—' }}</div></div><button type="button" class="lu-btn small ghost" (click)="editEmail()">Modifier</button></div>
            <div class="lu-row"><div class="grow"><span class="label">Mot de passe</span><div class="sub">Au moins 8 caractères</div></div><button type="button" class="lu-btn small ghost" (click)="editPassword()">Changer</button></div>
            <div class="lu-row"><div class="grow"><span class="label">Connexions liées</span><div class="sub">{{ providers().join(', ') || 'e-mail' }}</div></div></div>
            <div class="lu-row"><div class="grow"><span class="label">Code ami</span><div class="sub">{{ auth.profile()?.friendCode }}</div></div><button type="button" class="lu-btn small ghost" (click)="ui.go('/companions')">QR code</button></div>
          </section>

          <!-- Personnage -->
          <section class="lu-card">
            <h3>Personnage</h3>
            <div class="char">
              <lu-portrait [id]="portrait()" [size]="76" [frame]="frame()" />
              <div class="lu-field grow"><label for="cn">Nom</label><input id="cn" class="lu-input" maxlength="30" [value]="name()" (input)="name.set($any($event.target).value)" (change)="saveAppearance()" /></div>
            </div>
            <div class="portraits">@for (p of portraits; track p) { <button type="button" [class.on]="portrait() === p" (click)="portrait.set(p); saveAppearance()" [attr.aria-label]="'Portrait ' + p"><lu-portrait [id]="p" [size]="40" frame="transparent" /></button> }</div>
            <div class="frames">@for (f of frames; track f) { <button type="button" [style.background]="f" [class.on]="frame() === f" (click)="frame.set(f); saveAppearance()" [attr.aria-label]="'Cadre ' + f"></button> }</div>
            <div class="lu-field"><label for="cm">Devise</label><input id="cm" class="lu-input" maxlength="80" [value]="motto()" (input)="motto.set($any($event.target).value)" (change)="saveAppearance()" /></div>
            <div class="lu-field"><label for="co">Engagement</label><textarea id="co" class="lu-input area" rows="3" [value]="oath()" (input)="oath.set($any($event.target).value)" (change)="saveAppearance()"></textarea><span class="hint">Privé : jamais visible par tes amis.</span></div>
            <p class="xs muted">Classe : {{ className() }} · Les scores ne sont pas modifiables : ils progressent avec tes quêtes.</p>
          </section>

          <!-- Rythme -->
          <section class="lu-card">
            <h3>Rythme</h3>
            <div class="lu-field"><label for="rh">Heure de reset des quêtes</label>
              <select id="rh" class="lu-input" [value]="st.resetHour" (change)="update({ resetHour: +$any($event.target).value })">@for (h of hours; track h) { <option [value]="h" [selected]="h === st.resetHour">{{ h }} h</option> }</select>
              <span class="hint">Une quête validée avant cette heure compte pour la veille (défaut : 4 h).</span></div>
            <div class="lu-field"><label for="tz">Fuseau horaire</label>
              <select id="tz" class="lu-input" (change)="update({ timezone: $any($event.target).value })">@for (z of zones(); track z) { <option [value]="z" [selected]="z === st.timezone">{{ z }}</option> }</select></div>
            <div class="lu-field"><label for="dq">Quêtes journalières souhaitées</label>
              <select id="dq" class="lu-input" (change)="update({ dailyQuestCount: +$any($event.target).value })">@for (n of dailyOptions(); track n) { <option [value]="n" [selected]="n === effectiveDaily()">{{ n }}</option> }</select>
              <span class="hint">Limité par ton niveau. Prend effet au prochain tirage.</span></div>
            <div class="lu-row"><div class="grow"><span class="label">Mode Hardcore</span><div class="sub">Une quête abandonnée ou expirée retire 10 % de son XP de base.</div></div><lu-switch [checked]="st.hardcore" label="Mode Hardcore" (changed)="toggleHardcore($event)" /></div>
          </section>

          <!-- Partage -->
          <section class="lu-card">
            <h3>Partage</h3>
            <div class="lu-row"><div class="grow"><span class="label">Publier mes montées de niveau</span></div><lu-switch [checked]="st.autoShare.level" label="Montées de niveau" (changed)="share('level', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Publier mes succès</span></div><lu-switch [checked]="st.autoShare.achievement" label="Succès" (changed)="share('achievement', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Publier mes séries (7, 30, 100 jours…)</span></div><lu-switch [checked]="st.autoShare.streak" label="Séries" (changed)="share('streak', $event)" /></div>
            <div class="lu-field"><label>Visibilité par défaut</label><div class="lu-seg"><button type="button" [class.on]="st.defaultVisibility === 'friends'" (click)="update({ defaultVisibility: 'friends' })">Amis</button><button type="button" [class.on]="st.defaultVisibility === 'private'" (click)="update({ defaultVisibility: 'private' })">Privé</button></div></div>
            <div class="lu-row"><div class="grow"><span class="label">Participer au classement de tes amis</span><div class="sub">Désactivé : ton XP n’y apparaît pas et tu ne le vois plus.</div></div><lu-switch [checked]="st.leaderboardOptIn" label="Classement" (changed)="update({ leaderboardOptIn: $event })" /></div>
          </section>

          <!-- Notifications -->
          <section class="lu-card">
            <h3>Notifications</h3>
            @if (!notif.native) { <p class="xs muted">Les rappels programmés fonctionnent dans l’application mobile. Sur le web, tu retrouves tout dans les notifications.</p> }
            <div class="lu-row"><div class="grow"><span class="label">Rappel quotidien</span></div><input type="time" class="lu-input time" [value]="pref('dailyTime', '09:00')" (change)="setPref('dailyTime', $any($event.target).value)" aria-label="Heure du rappel" /><lu-switch [checked]="flag('daily')" label="Rappel quotidien" (changed)="setPref('daily', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Rappel de fin de semaine</span></div><lu-switch [checked]="flag('weekEnd')" label="Rappel de fin de semaine" (changed)="setPref('weekEnd', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Demandes d’ami</span></div><lu-switch [checked]="flag('friendRequests')" label="Demandes d’ami" (changed)="setPref('friendRequests', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Réactions</span></div><lu-switch [checked]="flag('reactions')" label="Réactions" (changed)="setPref('reactions', $event)" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Commentaires</span></div><lu-switch [checked]="flag('comments')" label="Commentaires" (changed)="setPref('comments', $event)" /></div>
            <button type="button" class="lu-btn small ghost inline" (click)="askPermission()"><lu-icon name="bell" [size]="15" /> Autoriser les notifications</button>
          </section>

          <!-- Confidentialité -->
          <section class="lu-card">
            <h3>Confidentialité</h3>
            <div class="lu-field"><label for="fr">Qui peut m’envoyer une demande d’ami ?</label>
              <select id="fr" class="lu-input" (change)="update({ friendRequestsFrom: $any($event.target).value })">
                <option value="everyone" [selected]="st.friendRequestsFrom === 'everyone'">Tout le monde</option>
                <option value="code" [selected]="st.friendRequestsFrom === 'code'">Code ami seulement</option>
                <option value="nobody" [selected]="st.friendRequestsFrom === 'nobody'">Personne</option>
              </select></div>
            <div class="lu-label">Utilisateurs bloqués</div>
            @for (b of blocked(); track b.profileId) { <div class="lu-row"><div class="grow">&#64;{{ b.username }}</div><button type="button" class="lu-btn small ghost" (click)="unblock(b.profileId)">Débloquer</button></div> }
            @empty { <p class="small muted">Personne n’est bloqué.</p> }
          </section>

          <!-- Apparence -->
          <section class="lu-card">
            <h3>Apparence</h3>
            <div class="lu-seg"><button type="button" [class.on]="st.theme === 'auto'" (click)="update({ theme: 'auto' })">Auto</button><button type="button" [class.on]="st.theme === 'light'" (click)="update({ theme: 'light' })">Clair</button><button type="button" [class.on]="st.theme === 'dark'" (click)="update({ theme: 'dark' })">Sombre</button></div>
            <div class="lu-row"><div class="grow"><span class="label">Sons</span></div><lu-switch [checked]="st.sounds" label="Sons" (changed)="update({ sounds: $event })" /></div>
            <div class="lu-row"><div class="grow"><span class="label">Animations réduites</span></div><lu-switch [checked]="st.reducedMotion" label="Animations réduites" (changed)="update({ reducedMotion: $event })" /></div>
          </section>

          <!-- Données -->
          <section class="lu-card">
            <h3>Mes données</h3>
            <p class="small muted">Télécharge toutes tes données (fichier JSON et photos), conformément au droit à la portabilité.</p>
            <button type="button" class="lu-btn ghost" [disabled]="exporting()" (click)="exportAll()"><lu-icon name="download" [size]="17" /> {{ exporting() ? 'Préparation…' : 'Télécharger mes données' }}</button>
          </section>

          <!-- Danger -->
          <section class="lu-card danger">
            <h3>Zone de danger</h3>
            <button type="button" class="lu-btn danger" (click)="resetAdventure()">Réinitialiser ma progression</button>
            <p class="xs muted">Remet ton personnage à zéro. Ton compte et tes amis sont conservés.</p>
            <button type="button" class="lu-btn danger" (click)="deleteAccount()">Supprimer mon compte</button>
            <p class="xs muted">Tes publications et photos sont retirées immédiatement ; tes données personnelles sont effacées sous 30 jours.</p>
          </section>

          <button type="button" class="lu-btn ghost" (click)="signOut()"><lu-icon name="log-out" [size]="17" /> Se déconnecter</button>

          <section class="lu-card flat about">
            <h3>À propos</h3>
            <p class="small muted">Level Up · version 1.0.0 · {{ backendLabel }}</p>
            <a routerLink="/legal/terms">Conditions d’utilisation</a>
            <a routerLink="/legal/privacy">Politique de confidentialité</a>
            <a routerLink="/legal/community">Règles de la communauté</a>
            <a routerLink="/legal/legal-notice">Mentions légales</a>
            <a routerLink="/legal/credits">Crédits</a>
            <a [href]="'mailto:' + contact">{{ contact }}</a>
          </section>
        </div>
      }
    </ion-content>
  `,
  styles: `
    h3 { font-size: 20px; }
    .char { display: flex; gap: 14px; align-items: flex-end; } .grow { flex: 1; min-width: 0; }
    .portraits { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; } .portraits button { background: none; border: 0; padding: 0; border-radius: 50%; cursor: pointer; opacity: .7; } .portraits button.on { opacity: 1; outline: 2px solid var(--lu-accent); }
    .frames { display: flex; gap: 10px; flex-wrap: wrap; } .frames button { width: 30px; height: 30px; border-radius: 50%; border: 3px solid transparent; cursor: pointer; } .frames button.on { border-color: var(--lu-text); }
    .time { width: 110px; min-height: 40px; }
    .danger { border-color: color-mix(in srgb, var(--lu-danger) 35%, transparent); }
    .about { gap: 8px; } .about a { font-size: 13px; padding: 4px 0; }
  `,
})
export class SettingsPage {
  protected game = inject(GameService);
  protected auth = inject(AuthService);
  protected ui = inject(UiService);
  protected notif = inject(NotificationsService);
  private be = inject(BackendService);
  private social = inject(SocialService);
  private router = inject(Router);
  readonly s = this.game.settings;
  readonly portraits = PORTRAIT_IDS.slice(0, 24);
  readonly frames = FRAMES;
  readonly hours = [0, 1, 2, 3, 4, 5, 6];
  readonly contact = env.contactEmail;
  readonly backendLabel = this.be.mode === 'cloud' ? 'en ligne' : 'mode local (démo)';
  readonly name = signal(this.game.character()?.name ?? '');
  readonly portrait = signal(this.game.character()?.portraitId ?? 'p01');
  readonly frame = signal(this.game.character()?.frameColor ?? FRAMES[0]);
  readonly motto = signal(this.game.character()?.motto ?? '');
  readonly oath = signal('');
  readonly providers = signal<string[]>([]);
  readonly blocked = signal<{ profileId: string; username: string }[]>([]);
  readonly exporting = signal(false);
  readonly className = computed(() => CLASSES.find((c) => c.id === this.game.character()?.classId)?.name ?? '');
  readonly zones = computed(() => {
    const cur = this.s()?.timezone;
    const set = new Set([...ZONES, Intl.DateTimeFormat().resolvedOptions().timeZone, ...(cur ? [cur] : [])]);
    return [...set];
  });
  readonly effectiveDaily = computed(() => Math.min(this.s()?.dailyQuestCount ?? 6, this.game.unlocks().dailyQuests));
  readonly dailyOptions = computed(() => Array.from({ length: this.game.unlocks().dailyQuests }, (_, i) => i + 1));

  constructor() {
    void this.be.auth.linkedProviders().then((p) => this.providers.set(p)).catch(() => undefined);
    void this.be.social.blocked().then((b) => this.blocked.set(b)).catch(() => undefined);
    void this.be.game.store.getCharacter(this.be.game.userId()).then((c) => this.oath.set(c?.oath ?? '')).catch(() => undefined);
  }

  pref = (k: string, d: string) => String(this.s()?.notifPrefs[k] ?? d);
  flag = (k: string) => this.s()?.notifPrefs[k] !== false;

  async update(patch: Partial<SettingsRecord>): Promise<void> {
    await this.game.saveSettings(patch);
    if (patch.dailyQuestCount) this.game.toast('Pris en compte au prochain tirage.', 'info');
  }

  async toggleHardcore(on: boolean): Promise<void> {
    if (on && !(await this.ui.confirm({ title: 'Activer le mode Hardcore ?', message: 'Une quête abandonnée ou expirée retirera 10 % de son XP de base.', confirm: 'Activer', danger: true }))) return;
    await this.update({ hardcore: on });
  }

  async share(k: 'level' | 'achievement' | 'streak', on: boolean): Promise<void> {
    await this.update({ autoShare: { ...this.s()!.autoShare, [k]: on } });
  }

  async setPref(k: string, v: boolean | string): Promise<void> {
    const prefs = { ...this.s()!.notifPrefs, [k]: v };
    await this.update({ notifPrefs: prefs });
    if (k === 'daily' || k === 'dailyTime' || k === 'weekEnd') {
      await this.notif.schedule({ daily: prefs['daily'] !== false, dailyTime: String(prefs['dailyTime'] ?? '09:00'), weekEnd: prefs['weekEnd'] !== false });
    }
  }

  async askPermission(): Promise<void> {
    const ok = await this.notif.requestPermission();
    if (ok) {
      await this.notif.registerPush();
      await this.notif.schedule({ daily: this.flag('daily'), dailyTime: this.pref('dailyTime', '09:00'), weekEnd: this.flag('weekEnd') });
    }
    this.game.toast(ok ? 'Notifications autorisées.' : 'Autorisation refusée : tu peux la changer dans les réglages du téléphone.', ok ? 'success' : 'info');
  }

  async saveAppearance(): Promise<void> {
    const name = this.name().trim();
    if (name.length < 2) return;
    await this.be.game.updateAppearance({ name, portraitId: this.portrait(), frameColor: this.frame(), motto: this.motto().trim(), oath: this.oath().trim() });
    await this.game.refreshCharacter();
  }

  async editUsername(): Promise<void> {
    const v = await this.ui.prompt({ title: 'Nouveau pseudo', message: '3 à 20 caractères : lettres, chiffres et tirets.', value: this.auth.profile()?.username, confirm: 'Enregistrer' });
    if (!v || v === this.auth.profile()?.username) return;
    if (!(await this.be.auth.usernameAvailable(v))) return this.game.toast('Ce pseudo est indisponible.', 'error');
    try {
      await this.be.auth.updateUsername(v);
      await this.auth.loadProfile();
      this.game.toast('Pseudo mis à jour.', 'success');
    } catch (e) {
      this.game.toast(authMessage(e), 'error');
    }
  }
  async editEmail(): Promise<void> {
    const v = await this.ui.prompt({ title: 'Nouvel e-mail', message: 'Un message de confirmation sera envoyé.', placeholder: 'nom@exemple.fr', confirm: 'Enregistrer' });
    if (!v) return;
    try {
      await this.be.auth.updateEmail(v.trim());
      this.game.toast('Vérifie ta boîte mail pour confirmer.', 'success');
    } catch (e) {
      this.game.toast(authMessage(e), 'error');
    }
  }
  async editPassword(): Promise<void> {
    const v = await this.ui.prompt({ title: 'Nouveau mot de passe', message: '8 caractères minimum.', confirm: 'Changer' });
    if (!v) return;
    if (v.length < 8) return this.game.toast('8 caractères minimum.', 'error');
    try {
      await this.be.auth.updatePassword(v);
      this.game.toast('Mot de passe mis à jour.', 'success');
    } catch (e) {
      this.game.toast(authMessage(e), 'error');
    }
  }

  async unblock(id: string): Promise<void> {
    await this.be.social.unblock(id);
    this.blocked.update((l) => l.filter((b) => b.profileId !== id));
  }

  async exportAll(): Promise<void> {
    this.exporting.set(true);
    try {
      const data = (await this.be.game.exportData()) as Record<string, any>;
      const files: Record<string, Uint8Array> = { 'mes-donnees.json': strToU8(JSON.stringify(data, null, 2)) };
      for (const p of (data['photos'] as { path: string; url: string | null }[] | undefined) ?? []) {
        if (!p.url) continue;
        try {
          files['photos/' + p.path.split('/').pop()] = new Uint8Array(await (await fetch(p.url)).arrayBuffer());
        } catch {
          /* photo indisponible */
        }
      }
      const blob = new Blob([zipSync(files) as BlobPart], { type: 'application/zip' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'level-up-mes-donnees.zip';
      a.click();
      this.game.toast('Tes données ont été téléchargées.', 'success');
    } catch {
      this.game.toast('Export impossible pour le moment.', 'error');
    } finally {
      this.exporting.set(false);
    }
  }

  async resetAdventure(): Promise<void> {
    if (!(await this.ui.confirm({ title: 'Réinitialiser ma progression ?', message: 'Ton personnage, ton XP, tes quêtes et tes succès seront remis à zéro. Ton compte et tes amis restent.', confirm: 'Tout recommencer', danger: true }))) return;
    await this.be.game.resetAdventure();
    this.game.reset();
    await this.router.navigateByUrl('/onboarding', { replaceUrl: true });
  }

  async deleteAccount(): Promise<void> {
    const username = this.auth.profile()?.username ?? '';
    const typed = await this.ui.prompt({ title: 'Supprimer mon compte', message: `Cette action est définitive. Saisis ton pseudo (${username}) pour confirmer.`, placeholder: username, confirm: 'Supprimer définitivement' });
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== username.toLowerCase()) return this.game.toast('Le pseudo saisi ne correspond pas.', 'error');
    try {
      await this.be.game.deleteAccount();
      this.game.reset();
      this.social.halt();
      await this.auth.signOut().catch(() => undefined);
      await this.router.navigateByUrl('/auth', { replaceUrl: true });
    } catch {
      this.game.toast('Suppression impossible pour le moment. Réessaie.', 'error');
    }
  }

  async signOut(): Promise<void> {
    this.social.halt();
    await this.auth.signOut();
    this.game.reset();
    await this.router.navigateByUrl('/auth', { replaceUrl: true });
  }
}
