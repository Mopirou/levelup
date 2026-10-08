import { Injectable } from '@angular/core';
import { env } from './env';
import type { AuthApi, Backend, GameApi, SocialApi } from './api/types';

/** Choisit au démarrage entre le back-end Supabase (en ligne) et le mode local (données dans le navigateur). */
@Injectable({ providedIn: 'root' })
export class BackendService {
  private backend!: Backend;

  async init(): Promise<void> {
    this.backend = env.cloud
      ? (await import('./api/cloud-backend')).createCloudBackend()
      : await (await import('./api/local-backend')).createLocalBackend();
  }

  get mode(): 'local' | 'cloud' {
    return this.backend.mode;
  }
  get auth(): AuthApi {
    return this.backend.auth;
  }
  get game(): GameApi {
    return this.backend.game;
  }
  get social(): SocialApi {
    return this.backend.social;
  }
}
