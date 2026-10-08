import { Routes } from '@angular/router';
import { authGuard, characterGuard, guestGuard, onboardingGuard } from './core/auth.service';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'tabs/tavern' },
  { path: 'auth', canActivate: [guestGuard], loadComponent: () => import('./features/auth/auth.page').then((m) => m.AuthPage) },
  { path: 'onboarding', canActivate: [onboardingGuard], loadComponent: () => import('./features/onboarding/onboarding.page').then((m) => m.OnboardingPage) },
  {
    path: 'tabs',
    canActivate: [characterGuard],
    loadComponent: () => import('./features/tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tavern' },
      { path: 'tavern', loadComponent: () => import('./features/tavern/tavern.page').then((m) => m.TavernPage) },
      { path: 'quests', loadComponent: () => import('./features/quest/quest-board.page').then((m) => m.QuestBoardPage) },
    ],
  },
  { path: 'quest/:id', canActivate: [characterGuard], loadComponent: () => import('./features/quest/quest-detail.page').then((m) => m.QuestDetailPage) },
  { path: '**', redirectTo: 'tabs/tavern' },
];
