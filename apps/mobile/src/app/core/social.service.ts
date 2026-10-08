import { Injectable, inject, signal } from '@angular/core';
import { BackendService } from './backend.service';
import type { FeedPost, LeaderRow, PendingRequest } from './api/types';

/** Compteurs et aperçus partagés (pastille du Corbeau, demandes d'amis, nouvelles du Village) + temps réel. */
@Injectable({ providedIn: 'root' })
export class SocialService {
  private be = inject(BackendService);
  readonly unread = signal(0);
  readonly requests = signal<PendingRequest[]>([]);
  readonly preview = signal<FeedPost[]>([]);
  readonly weekXp = signal(0);
  readonly feedVersion = signal(0);
  private stop: (() => void) | null = null;

  get api() {
    return this.be.social;
  }

  start(): void {
    if (this.stop) return;
    void this.refresh();
    this.stop = this.be.social.subscribe({
      onFeed: () => {
        this.feedVersion.update((v) => v + 1);
        void this.loadPreview();
      },
      onNotification: () => void this.loadUnread(),
      onRequest: () => void this.loadRequests(),
    });
  }

  halt(): void {
    this.stop?.();
    this.stop = null;
    this.unread.set(0);
    this.requests.set([]);
    this.preview.set([]);
  }

  async refresh(): Promise<void> {
    await Promise.all([this.loadUnread(), this.loadRequests(), this.loadPreview()]);
  }

  async loadUnread(): Promise<void> {
    try {
      this.unread.set(await this.be.social.unreadCount());
    } catch {
      /* hors ligne */
    }
  }

  async loadRequests(): Promise<void> {
    try {
      this.requests.set((await this.be.social.pendingRequests()).filter((r) => r.direction === 'received'));
    } catch {
      /* hors ligne */
    }
  }

  async loadPreview(): Promise<void> {
    try {
      const [feed, board] = await Promise.all([this.be.social.feed(null, 4), this.be.social.leaderboard()]);
      this.preview.set(feed.posts);
      this.weekXp.set(board.reduce((n: number, r: LeaderRow) => n + r.xp, 0));
    } catch {
      /* hors ligne */
    }
  }
}
