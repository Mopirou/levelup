import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import type { Visibility } from '@levelup/engine';
import { GameService } from '../core/game.service';
import { pickPhotos, type PickedPhoto } from '../core/photo';
import { IconComponent } from './icon.component';

export interface ShareDraft {
  text: string;
  visibility: Visibility;
  photos: PickedPhoto[];
}

/** « Raconter cette victoire » : photos (1 à 4), un mot (500 caractères), visibilité. Utilisé après une validation et dans « Publier ». */
@Component({
  selector: 'lu-share-form',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="form">
      @if (photos().length) {
        <div class="photos" [class.one]="photos().length === 1">
          @for (p of photos(); track p.previewUrl; let i = $index) {
            <div class="ph">
              <img [src]="p.previewUrl" alt="Photo à partager" />
              <button type="button" class="x" (click)="remove(i)" aria-label="Retirer cette photo"><lu-icon name="x" [size]="14" /></button>
            </div>
          }
        </div>
      }
      @if (photos().length < 4) {
        <div class="pick">
          <button type="button" class="lu-btn ghost small" (click)="add('camera')"><lu-icon name="camera" [size]="16" /> Prendre une photo</button>
          <button type="button" class="lu-btn ghost small" (click)="add('gallery')"><lu-icon name="image" [size]="16" /> Galerie</button>
        </div>
      }
      <div class="msg">
        <label class="lab" [for]="id">Ton message · facultatif</label>
        <textarea [id]="id" class="lu-input area" maxlength="500" rows="3" [value]="text()" (input)="text.set($any($event.target).value); changed()" [placeholder]="placeholder()"></textarea>
        <span class="xs dim count">{{ text().length }}/500</span>
      </div>
      <div class="lu-seg" role="radiogroup" aria-label="Visibilité">
        <button type="button" role="radio" [attr.aria-checked]="visibility() === 'friends'" [class.on]="visibility() === 'friends'" (click)="setVis('friends')">Compagnons</button>
        <button type="button" role="radio" [attr.aria-checked]="visibility() === 'private'" [class.on]="visibility() === 'private'" (click)="setVis('private')">Privé</button>
      </div>
      <p class="xs muted">{{ visibility() === 'friends' ? 'Visible uniquement par tes compagnons.' : 'Souvenir privé : visible seulement dans ta Chronique.' }}</p>
      @if (error()) {
        <p class="err">{{ error() }}</p>
      }
    </div>
  `,
  styles: `
    .form { display: flex; flex-direction: column; gap: 12px; }
    .photos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .photos.one { grid-template-columns: 1fr; }
    .ph { position: relative; border-radius: 14px; overflow: hidden; aspect-ratio: 4 / 3; background: var(--lu-surface-2); }
    .photos.one .ph { aspect-ratio: 16 / 10; }
    .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .x { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; border: 0; background: rgba(0,0,0,.6); color: #fff; display: grid; place-items: center; cursor: pointer; }
    .pick { display: flex; gap: 8px; }
    .pick .lu-btn { flex: 1; }
    .msg { position: relative; display: flex; flex-direction: column; gap: 6px; }
    .lab { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--lu-text-2); }
    .count { position: absolute; right: 10px; bottom: 8px; }
    .err { color: var(--lu-danger); font-size: 12px; }
  `,
})
export class ShareFormComponent {
  private game = inject(GameService);
  readonly id = 'share-' + Math.random().toString(36).slice(2, 7);
  readonly initialText = input('');
  readonly placeholder = input('Une pause au grand air. Je me sens déjà plus léger 🌿');
  readonly photos = signal<PickedPhoto[]>([]);
  readonly text = signal('');
  readonly visibility = signal<Visibility>(this.game.settings()?.defaultVisibility ?? 'friends');
  readonly error = signal('');
  readonly change = output<ShareDraft>();

  readonly draft = computed<ShareDraft>(() => ({ text: this.text(), visibility: this.visibility(), photos: this.photos() }));

  ngOnInit(): void {
    if (this.initialText()) this.text.set(this.initialText());
  }

  changed(): void {
    this.change.emit(this.draft());
  }
  setVis(v: Visibility): void {
    this.visibility.set(v);
    this.changed();
  }
  remove(i: number): void {
    this.photos.update((l) => l.filter((_, k) => k !== i));
    this.changed();
  }
  async add(source: 'camera' | 'gallery'): Promise<void> {
    this.error.set('');
    try {
      const got = await pickPhotos(source, 4 - this.photos().length);
      this.photos.update((l) => [...l, ...got].slice(0, 4));
      this.changed();
    } catch (e) {
      this.error.set((e as Error).message || 'Impossible de charger cette photo.');
    }
  }
}
