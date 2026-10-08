import { Routes } from '@angular/router';
import { authGuard, characterGuard, guestGuard, onboardingGuard } from './core/auth.service';

const guarded = (path: string, load: () => Promise<unknown>, extra: Partial<Routes[number]> = {}): Routes[number] => ({
  path,
  canActivate: [characterGuard],
  loadComponent: load as never,
  ...extra,
});

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tabs/tavern' },

  // Les Portes de la Cité, Le Seuil
  { path: 'auth', canActivate: [guestGuard], loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage) },
  { path: 'auth/callback', loadComponent: () => import('./features/auth/auth-callback.page').then((m) => m.AuthCallbackPage) },
  { path: 'onboarding', canActivate: [onboardingGuard], loadComponent: () => import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage) },
  { path: 'i/:code', loadComponent: () => import('./features/invite/invite.page').then((m) => m.InvitePage) },

  // Onglets : Taverne, Quêtes, Village, Héros, Chronique
  {
    path: 'tabs',
    canActivate: [characterGuard],
    loadComponent: () => import('./features/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tavern' },
      { path: 'tavern', loadComponent: () => import('./features/tavern/tavern.page').then((m) => m.TavernPage) },
      { path: 'quests', loadComponent: () => import('./features/quest/quest-board.page').then((m) => m.QuestBoardPage) },
      { path: 'village', loadComponent: () => import('./features/village/village.page').then((m) => m.VillagePage) },
      { path: 'hero', loadComponent: () => import('./features/hero/hero.page').then((m) => m.HeroPage) },
      { path: 'chronicle', loadComponent: () => import('./features/chronicle/chronicle.page').then((m) => m.ChroniclePage) },
    ],
  },

  guarded('quest/:id', () => import('./features/quest/quest-detail.page').then((m) => m.QuestDetailPage)),
  guarded('publish', () => import('./features/publish/publish.page').then((m) => m.PublishPage)),
  guarded('post/:id', () => import('./features/village/post-detail.page').then((m) => m.PostDetailPage)),
  guarded('companions', () => import('./features/companions/companions.page').then((m) => m.CompanionsPage)),
  guarded('companions/:username', () => import('./features/companions/companion-profile.page').then((m) => m.CompanionProfilePage)),
  guarded('messenger', () => import('./features/messenger/messenger.page').then((m) => m.MessengerPage)),
  guarded('grimoire', () => import('./features/grimoire/grimoire.page').then((m) => m.GrimoirePage)),
  guarded('forge', () => import('./features/forge/forge.page').then((m) => m.ForgePage)),
  guarded('forge/:id', () => import('./features/forge/forge.page').then((m) => m.ForgePage)),
  guarded('trophies', () => import('./features/trophies/trophies.page').then((m) => m.TrophiesPage)),
  guarded('settings', () => import('./features/settings/settings.page').then((m) => m.SettingsPage)),

  // Documents légaux : accessibles sans compte (liens de l'inscription)
  { path: 'legal/:doc', loadComponent: () => import('./features/legal/legal.page').then((m) => m.LegalPage) },

  { path: '**', redirectTo: 'tabs/tavern' },
];

void authGuard;
