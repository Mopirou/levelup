import { Injectable, inject } from '@angular/core';
import { ActionSheetController } from '@ionic/angular';
import { REACTION_EMOJI, REACTION_LABEL, type ReactionKind } from '@levelup/engine';
import { BackendService } from './backend.service';
import { GameService } from './game.service';
import { UiService } from './ui.service';
import type { FeedPost } from './api/types';

/** Actions communes aux cartes de publication (Fil des amis, fiche d'un ami, détail…). */
@Injectable({ providedIn: 'root' })
export class PostActions {
  private be = inject(BackendService);
  private game = inject(GameService);
  private ui = inject(UiService);
  private sheet = inject(ActionSheetController);

  /** Réaction : mise à jour optimiste ; renvoie la publication modifiée. */
  async react(post: FeedPost, kind: ReactionKind | null): Promise<FeedPost> {
    const next: FeedPost = { ...post, reactions: { ...post.reactions } };
    if (post.myReaction) next.reactions[post.myReaction]--;
    if (kind) next.reactions[kind]++;
    next.myReaction = kind;
    try {
      await this.be.social.react(post.id, kind);
    } catch {
      this.game.toast('Impossible d’envoyer ton encouragement pour le moment.', 'error');
      return post;
    }
    return next;
  }

  async showReactors(post: FeedPost): Promise<void> {
    try {
      const list = await this.be.social.reactors(post.id);
      if (!list.length) return;
      const s = await this.sheet.create({
        header: 'Ils ont encouragé',
        cssClass: 'lu-sheet',
        buttons: [...list.map((r) => ({ text: `${REACTION_EMOJI[r.kind]}  ${r.name} · ${REACTION_LABEL[r.kind]}` })), { text: 'Fermer', role: 'cancel' }],
      });
      await s.present();
    } catch {
      /* hors ligne */
    }
  }

  /** Menu « ⋯ » : modifier/supprimer pour ses publications, signaler/bloquer pour celles des autres. */
  async menu(post: FeedPost, myId: string): Promise<'deleted' | 'edited' | 'blocked' | 'reported' | null> {
    const mine = post.author.id === myId;
    return new Promise(async (resolve) => {
      const buttons: { text: string; role?: string; handler: () => void }[] = [];
      if (mine) {
        buttons.push({
          text: 'Modifier le texte',
          handler: async () => {
            const t = await this.ui.prompt({ title: 'Modifier ma publication', value: post.text, confirm: 'Enregistrer' });
            if (t === null) return resolve(null);
            try {
              await this.be.social.editPost(post.id, t.slice(0, 500));
              resolve('edited');
            } catch (e) {
              this.game.toast(String((e as Error).message).includes('community_rules') ? 'Ce message ne respecte pas les règles de la communauté.' : 'Modification impossible.', 'error');
              resolve(null);
            }
          },
        });
        buttons.push({
          text: 'Supprimer',
          role: 'destructive',
          handler: async () => {
            if (await this.ui.confirm({ title: 'Supprimer cette publication ?', message: 'Elle disparaîtra du fil.', confirm: 'Supprimer', danger: true })) {
              await this.be.social.deletePost(post.id);
              resolve('deleted');
            } else resolve(null);
          },
        });
      } else {
        buttons.push({
          text: 'Signaler cette publication',
          handler: async () => {
            await this.report('post', post.id);
            resolve('reported');
          },
        });
        buttons.push({
          text: `Bloquer ${post.author.name}`,
          role: 'destructive',
          handler: async () => {
            if (await this.ui.confirm({ title: `Bloquer ${post.author.name} ?`, message: 'Vous ne verrez plus vos publications respectives et le lien d’amitié sera supprimé.', confirm: 'Bloquer', danger: true })) {
              await this.be.social.block(post.author.id);
              this.game.toast('Utilisateur bloqué.', 'info');
              resolve('blocked');
            } else resolve(null);
          },
        });
      }
      buttons.push({ text: 'Fermer', role: 'cancel', handler: () => resolve(null) });
      const s = await this.sheet.create({ buttons, cssClass: 'lu-sheet' });
      await s.present();
    });
  }

  async report(target: 'post' | 'comment' | 'profile', id: string): Promise<void> {
    const reasons = ['Contenu choquant ou offensant', 'Harcèlement', 'Spam', 'Informations personnelles', 'Autre'];
    const s = await this.sheet.create({
      header: 'Pourquoi signaler ?',
      cssClass: 'lu-sheet',
      buttons: [
        ...reasons.map((r) => ({
          text: r,
          handler: async () => {
            try {
              await this.be.social.report(target, id, r);
              this.game.toast('Merci. Notre équipe examine ce signalement sous 48 h.', 'success');
            } catch {
              this.game.toast('Signalement impossible pour le moment.', 'error');
            }
          },
        })),
        { text: 'Annuler', role: 'cancel' },
      ],
    });
    await s.present();
  }
}
