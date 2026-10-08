/**
 * Configuration d'exécution, lue dans /env.js (chargé avant l'app) pour pouvoir changer de projet Supabase
 * sans recompiler. Sans URL Supabase, l'app tourne en mode local (données dans le navigateur).
 */
export interface RuntimeEnv {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** URL publique de l'app (liens d'invitation) */
  publicUrl?: string;
  sentryDsn?: string;
  contactEmail?: string;
}

declare global {
  interface Window {
    __LEVELUP_ENV__?: RuntimeEnv;
  }
}

const raw: RuntimeEnv = (typeof window !== 'undefined' && window.__LEVELUP_ENV__) || {};

export const env = {
  supabaseUrl: (raw.supabaseUrl ?? '').trim(),
  supabaseAnonKey: (raw.supabaseAnonKey ?? '').trim(),
  publicUrl: (raw.publicUrl ?? (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, ''),
  contactEmail: raw.contactEmail ?? 'contact@levelup.app',
  get cloud(): boolean {
    return !!this.supabaseUrl && !!this.supabaseAnonKey;
  },
};
