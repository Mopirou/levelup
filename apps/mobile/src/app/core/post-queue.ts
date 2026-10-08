import { Injectable, inject, signal } from '@angular/core';
import { BackendService } from './backend.service';
import { GameService } from './game.service';
import { offline, type QueuedPost } from './offline';
import type { FeedPost, NewPost } from './api/types';

/** Publications faites hors ligne : mises en file, marquées « En attente », envoyées au retour du réseau. */
@Injectable({ providedIn: 'root' })
export class PostQueue {
  private be = inject(BackendService);
  private game = inject(GameService);
  readonly queued = signal<QueuedPost[]>([]);
  private flushing = false;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.flush());
  }

  async refresh(): Promise<void> {
    this.queued.set(await offline.queuedPosts());
  }

  /** Publication de secours : renvoie true si elle est partie, false si elle a été mise en file. */
  async publish(p: NewPost): Promise<boolean> {
    try {
      await this.be.social.publish(p);
      return true;
    } catch (e) {
      const msg = String((e as Error)?.message ?? '');
      if (msg.includes('community_rules') || msg.includes('rate_limit')) throw e;
      if (!navigator.onLine || /fetch|network|Failed/i.test(msg)) {
        await offline.queuePost({ type: p.type, text: p.text, visibility: p.visibility, instanceId: p.instanceId ?? null, media: p.media.map((m) => ({ blob: m.blob, ext: m.ext, width: m.width, height: m.height })) });
        await this.refresh();
        return false;
      }
      throw e;
    }
  }

  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const row of await offline.queuedPosts()) {
        try {
          await this.be.social.publish({ ...row.post });
          await offline.removePost(row.id!);
          this.game.toast('Une publication en attente est partie.', 'success');
        } catch (e) {
          const msg = String((e as Error)?.message ?? '');
          if (msg.includes('community_rules')) await offline.removePost(row.id!);
          else break;
        }
      }
    } finally {
      this.flushing = false;
      await this.refresh();
    }
  }

  /** Aperçu dans le fil : publications en attente. */
  asFeed(): FeedPost[] {
    const c = this.game.character();
    if (!c) return [];
    return this.queued().map((q) => ({
      id: `pending-${q.id}`,
      author: { id: this.be.game.userId(), username: '', name: c.name, level: c.level, classId: c.classId, portraitId: c.portraitId, frameColor: c.frameColor },
      type: q.post.type,
      text: q.post.text,
      visibility: q.post.visibility,
      createdAt: q.createdAt,
      payload: {},
      quest: null,
      media: q.post.media.map((m, i) => ({ id: `pending-${q.id}-${i}`, path: '', url: URL.createObjectURL(m.blob), width: m.width, height: m.height, alt: null })),
      reactions: { bravo: 0, inspirant: 0, respect: 0, rire: 0 },
      myReaction: null,
      commentCount: 0,
      comments: [],
      pending: true,
    }));
  }
}
