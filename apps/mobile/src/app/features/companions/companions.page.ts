import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { IonContent, IonRefresher, IonRefresherContent } from '@ionic/angular';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { CLASSES } from '@levelup/engine';
import { AuthService } from '../../core/auth.service';
import { BackendService } from '../../core/backend.service';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { UiService } from '../../core/ui.service';
import { env } from '../../core/env';
import type { FriendRow, PendingRequest, ProfileCard } from '../../core/api/types';
import { PageHeaderComponent, AvatarComponent, EmptyComponent } from '../../shared/ui';
import { IconComponent } from '../../shared/icon.component';
import { ModalComponent } from '../../shared/modal.component';
import { relativeTime } from '../../shared/format';

const REQUEST_MESSAGES: Record<string, string> = {
  sent: 'Demande envoyée.',
  accepted: 'Vous êtes maintenant amis !',
  already_friends: 'Vous êtes déjà amis.',
  already_sent: 'Ta demande est déjà en attente.',
  not_found: 'Aucun utilisateur trouvé.',
  rate_limit: 'Tu as atteint la limite de 50 demandes par jour.',
  limit_reached: 'Tu as atteint la limite de 200 amis.',
};

@Component({
  selector: 'app-companions',
  imports: [IonContent, IonRefresher, IonRefresherContent, PageHeaderComponent, AvatarComponent, EmptyComponent, IconComponent, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content /></ion-refresher>
      <lu-page-header [back]="true" eyebrow="Amis" title="Tes amis">
        <p class="lead">Des visages familiers, des encouragements sincères. Ici, on avance côte à côte.</p>
      </lu-page-header>

      <div class="lu-page">
        <!-- Ajouter -->
        <section class="lu-section">
          <div class="lu-section-title"><h2>Ajouter un ami</h2></div>
          <div class="search">
            <lu-icon name="search" [size]="17" />
            <input type="search" class="inp" placeholder="Rechercher par pseudo…" [value]="query()" (input)="onQuery($any($event.target).value)" aria-label="Rechercher par pseudo" autocapitalize="none" />
          </div>
          @for (r of results(); track r.profileId) {
            <div class="lu-card flat person">
              <lu-avatar [name]="r.name ?? r.username" [size]="42" />
              <div class="pm"><strong>{{ r.name }}</strong><span class="xs muted">&#64;{{ r.username }} · Niv. {{ r.level }}</span></div>
              @if (r.isFriend) { <span class="lu-chip mint">Ami</span> }
              @else if (r.requestStatus === 'sent') { <span class="lu-chip">Demande envoyée</span> }
              @else { <button type="button" class="lu-btn small mint" (click)="request(r)">Demander</button> }
            </div>
          } @empty {
            @if (query().trim().length >= 3 && !searching()) { <p class="small muted">Aucun utilisateur trouvé.</p> }
          }
          <div class="row2">
            <button type="button" class="lu-btn ghost small" (click)="codeEntry.set(true)"><lu-icon name="key" [size]="15" /> Saisir un code ami</button>
            <button type="button" class="lu-btn ghost small" (click)="openScan()"><lu-icon name="scan" [size]="15" /> Scanner un QR</button>
          </div>
        </section>

        <!-- Inviter -->
        <section class="lu-card invite">
          <h3>Inviter un ami</h3>
          <div class="codewrap">
            <img [src]="qr()" alt="QR code de ton invitation" class="qr" />
            <div class="code"><span class="xs muted">TON CODE AMI</span><strong>{{ code() }}</strong></div>
          </div>
          <p class="small muted">Partage ton code ou fais scanner ton QR à un proche.</p>
          <div class="row2">
            <button type="button" class="lu-btn small" (click)="copy()"><lu-icon name="copy" [size]="15" /> Copier le code</button>
            <button type="button" class="lu-btn small mint" (click)="share()"><lu-icon name="share" [size]="15" /> Partager</button>
          </div>
        </section>

        <!-- Demandes -->
        @if (received().length || sent().length) {
          <section class="lu-section">
            <div class="lu-section-title"><h2>Demandes d’amis</h2><span class="lu-link" style="color: var(--lu-text-2)">{{ received().length }} demande{{ received().length > 1 ? 's' : '' }}</span></div>
            @for (r of received(); track r.id) {
              <article class="lu-card req">
                <div class="person">
                  <lu-avatar [name]="r.card.name ?? r.card.username" [size]="44" tone="gold" />
                  <div class="pm"><strong>{{ r.card.name ?? r.card.username }}</strong><span class="xs muted">&#64;{{ r.card.username }} · Demande reçue {{ ago(r.createdAt) }}</span></div>
                </div>
                <div class="row2">
                  <button type="button" class="lu-btn small mint" (click)="respond(r, true)">Accepter</button>
                  <button type="button" class="lu-btn small ghost" (click)="respond(r, false)">Pas maintenant</button>
                </div>
                <button type="button" class="lu-link" style="align-self: flex-start" (click)="ui.go(['/companions', r.card.username])">Voir la fiche →</button>
              </article>
            }
            @for (r of sent(); track r.id) {
              <div class="lu-card flat person">
                <lu-avatar [name]="r.card.name ?? r.card.username" [size]="38" />
                <div class="pm"><strong>{{ r.card.name ?? r.card.username }}</strong><span class="xs muted">Demande envoyée</span></div>
                <button type="button" class="lu-btn small ghost" (click)="cancel(r)">Annuler</button>
              </div>
            }
          </section>
        }

        <!-- Cercle -->
        <section class="lu-section">
          <div class="lu-section-title"><h2>Ton cercle proche</h2><span class="lu-link" style="color: var(--lu-text-2)">{{ friends().length }} ami{{ friends().length > 1 ? 's' : '' }}</span></div>
          @if (friends().length > 1) {
            <div class="lu-seg"><button type="button" [class.on]="sort() === 'activity'" (click)="sort.set('activity')">Activité</button><button type="button" [class.on]="sort() === 'level'" (click)="sort.set('level')">Niveau</button></div>
          }
          @for (f of sorted(); track f.profileId) {
            <button type="button" class="lu-card flat friend" (click)="ui.go(['/companions', f.username])">
              <lu-avatar [name]="f.name" [size]="44" [ring]="f.frameColor" />
              <div class="pm"><strong>{{ f.name }}</strong><span class="xs muted">&#64;{{ f.username }} · {{ className(f.classId) }}</span><span class="xs dim">{{ f.lastTitle ? f.lastTitle + ' · ' + ago(f.lastAt!) : 'Pas encore d’activité' }}</span></div>
              <span class="lvl">Niv. {{ f.level }}</span>
            </button>
          } @empty {
            <lu-empty icon="users" title="Pas encore d’amis" text="Invite un proche avec ton code ami, ton QR ou ton lien d’invitation." />
          }
          <p class="xs dim center">Pas d’abonnés publics. Juste tes amis.</p>
        </section>
      </div>

      @if (codeEntry()) {
        <lu-modal label="Saisir un code ami" (close)="codeEntry.set(false)">
          <h2>Saisir un code ami</h2>
          <div class="lu-field"><label for="cd">Code ami</label><input id="cd" class="lu-input" placeholder="ELAN-ALEX-4821" autocapitalize="characters" [value]="codeInput()" (input)="codeInput.set($any($event.target).value)" /></div>
          <button type="button" class="lu-btn mint" [disabled]="!codeInput().trim()" (click)="sendCode(codeInput())">Envoyer la demande</button>
        </lu-modal>
      }
      @if (scanning()) {
        <lu-modal label="Scanner un QR code" (close)="closeScan()">
          <h2>Scanner un QR code</h2>
          <div class="cam"><video #video playsinline muted></video><div class="frame"></div></div>
          @if (scanError()) { <p class="err">{{ scanError() }}</p> } @else { <p class="small muted">Place le QR code de ton ami dans le cadre.</p> }
        </lu-modal>
      }
    </ion-content>
  `,
  styles: `
    .lead { font-size: 14px; line-height: 1.5; color: var(--lu-text-2); }
    .search { display: flex; align-items: center; gap: 10px; height: 48px; padding: 0 14px; border-radius: 16px; background: var(--lu-surface-2); border: 1px solid var(--lu-border); color: var(--lu-muted); }
    .inp { flex: 1; background: none; border: 0; outline: 0; color: var(--lu-text); font: 400 14px var(--lu-font-body); min-width: 0; }
    .person { display: flex; flex-direction: row; align-items: center; gap: 12px; }
    .pm { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: left; }
    .pm strong { font-size: 14px; }
    .row2 { display: flex; gap: 10px; } .row2 .lu-btn { flex: 1; }
    .invite { gap: 14px; }
    .codewrap { display: flex; align-items: center; gap: 16px; }
    .qr { width: 118px; height: 118px; border-radius: 14px; background: #fff; padding: 8px; }
    .code { display: flex; flex-direction: column; gap: 6px; }
    .code strong { font-family: var(--lu-font-title); font-size: 21px; letter-spacing: .02em; word-break: break-all; }
    .req { gap: 12px; }
    .friend { flex-direction: row; align-items: center; gap: 12px; width: 100%; cursor: pointer; color: inherit; font: inherit; }
    .lvl { font-family: var(--lu-font-title); font-size: 16px; color: var(--lu-gold); }
    .center { text-align: center; }
    .cam { position: relative; border-radius: 18px; overflow: hidden; aspect-ratio: 1; background: #000; }
    .cam video { width: 100%; height: 100%; object-fit: cover; }
    .frame { position: absolute; inset: 18%; border: 3px solid var(--lu-accent); border-radius: 18px; box-shadow: 0 0 0 999px rgba(0,0,0,.35); }
    .err { color: var(--lu-danger); font-size: 13px; }
  `,
})
export class CompanionsPage implements OnDestroy {
  protected ui = inject(UiService);
  private be = inject(BackendService);
  private auth = inject(AuthService);
  private game = inject(GameService);
  private social = inject(SocialService);
  readonly query = signal('');
  readonly results = signal<ProfileCard[]>([]);
  readonly searching = signal(false);
  readonly friends = signal<FriendRow[]>([]);
  readonly pending = signal<PendingRequest[]>([]);
  readonly sort = signal<'activity' | 'level'>('activity');
  readonly qr = signal('');
  readonly codeEntry = signal(false);
  readonly codeInput = signal('');
  readonly scanning = signal(false);
  readonly scanError = signal('');
  private video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly code = computed(() => this.auth.profile()?.friendCode ?? '…');
  readonly link = computed(() => `${env.publicUrl}/i/${this.code()}`);
  readonly received = computed(() => this.pending().filter((p) => p.direction === 'received'));
  readonly sent = computed(() => this.pending().filter((p) => p.direction === 'sent'));
  readonly sorted = computed(() => [...this.friends()].sort((a, b) => (this.sort() === 'level' ? b.level - a.level : (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))));
  ago = (iso: string) => relativeTime(iso, this.game.now()).toLowerCase().replace('à l’instant', 'à l’instant');
  className = (id: string) => CLASSES.find((c) => c.id === id)?.name ?? '';

  constructor() {
    void this.load();
    effect(() => {
      const url = this.link();
      if (this.code() !== '…') void QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#0b1a14', light: '#ffffff' } }).then((d) => this.qr.set(d));
    });
    effect(() => {
      if (this.scanning() && this.video()) void this.startScan();
    });
  }

  ngOnDestroy(): void {
    this.stopScan();
  }

  async load(): Promise<void> {
    try {
      const [f, p] = await Promise.all([this.be.social.friends(), this.be.social.pendingRequests()]);
      this.friends.set(f);
      this.pending.set(p);
    } catch {
      /* hors ligne */
    }
  }

  async refresh(ev: CustomEvent): Promise<void> {
    await this.load();
    (ev.target as HTMLIonRefresherElement).complete();
  }

  onQuery(v: string): void {
    this.query.set(v);
    clearTimeout(this.timer);
    if (v.trim().length < 3) {
      this.results.set([]);
      return;
    }
    this.searching.set(true);
    this.timer = setTimeout(async () => {
      try {
        this.results.set(await this.be.social.searchProfiles(v.trim()));
      } catch {
        this.results.set([]);
      } finally {
        this.searching.set(false);
      }
    }, 300);
  }

  private notify(res: string): void {
    this.game.toast(REQUEST_MESSAGES[res] ?? 'Aucun utilisateur trouvé.', res === 'sent' || res === 'accepted' ? 'success' : 'info');
  }

  async request(r: ProfileCard): Promise<void> {
    if (!r.profileId) return;
    const res = await this.be.social.sendRequest(r.profileId);
    this.notify(res);
    await this.load();
    this.results.update((l) => l.map((x) => (x.profileId === r.profileId ? { ...x, requestStatus: res === 'accepted' ? 'accepted' : 'sent', isFriend: res === 'accepted' } : x)));
  }

  async sendCode(code: string): Promise<void> {
    try {
      const res = await this.be.social.sendRequestByCode(code.trim().toUpperCase());
      this.notify(res);
      this.codeEntry.set(false);
      this.codeInput.set('');
      await this.load();
    } catch {
      this.game.toast('Impossible d’envoyer la demande pour le moment.', 'error');
    }
  }

  async respond(r: PendingRequest, accept: boolean): Promise<void> {
    const res = await this.be.social.respond(r.id, accept);
    if (res === 'accepted') this.game.toast(`${r.card.name ?? r.card.username} est maintenant ton ami !`, 'success');
    else if (res === 'limit_reached') this.game.toast(REQUEST_MESSAGES['limit_reached'], 'error');
    await Promise.all([this.load(), this.social.loadRequests()]);
  }

  async cancel(r: PendingRequest): Promise<void> {
    await this.be.social.cancelRequest(r.id);
    await this.load();
  }

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.game.toast('Code ami copié.', 'success');
    } catch {
      this.game.toast(this.code(), 'info');
    }
  }

  async share(): Promise<void> {
    const text = `Rejoins-moi sur Level Up ! Mon code ami : ${this.code()}`;
    try {
      if (Capacitor.isNativePlatform()) await Share.share({ title: 'Level Up', text, url: this.link(), dialogTitle: 'Inviter un ami' });
      else if (navigator.share) await navigator.share({ title: 'Level Up', text, url: this.link() });
      else {
        await navigator.clipboard.writeText(`${text} ${this.link()}`);
        this.game.toast('Lien d’invitation copié.', 'success');
      }
    } catch {
      /* partage annulé */
    }
  }

  // ───── Scanner de QR code (caméra + jsQR)
  openScan(): void {
    this.scanError.set('');
    this.scanning.set(true);
  }
  closeScan(): void {
    this.scanning.set(false);
    this.stopScan();
  }
  private stopScan(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
  private async startScan(): Promise<void> {
    if (this.stream) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const el = this.video()!.nativeElement;
      el.srcObject = this.stream;
      await el.play();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      const tick = async () => {
        if (!this.scanning()) return;
        if (el.readyState >= 2) {
          canvas.width = el.videoWidth;
          canvas.height = el.videoHeight;
          ctx.drawImage(el, 0, 0);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const q = jsQR(img.data, img.width, img.height);
          if (q?.data) {
            const m = q.data.match(/ELAN-[A-Z0-9]+-\d{4}/i);
            if (m) {
              this.closeScan();
              await this.sendCode(m[0]);
              return;
            }
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      this.scanError.set('Impossible d’accéder à la caméra. Autorise-la dans les réglages ou saisis le code à la main.');
    }
  }
}
