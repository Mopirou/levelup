import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton } from '@ionic/angular';
import { GameService } from '../../core/game.service';
import { SocialService } from '../../core/social.service';
import { IconComponent } from '../../shared/icon.component';

@Component({
  selector: 'app-tabs',
  imports: [IonTabs, IonTabBar, IonTabButton, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ion-tabs>
      <ion-tab-bar slot="bottom" class="lu-tabbar">
        @for (t of tabs; track t.tab) {
          <ion-tab-button [tab]="t.tab" [attr.aria-label]="t.label">
            <span class="pill">
              <lu-icon [name]="t.icon" [size]="20" />
              @if (t.tab === 'quests' && game.dailyLeft() > 0) {
                <b class="count" [attr.aria-label]="game.dailyLeft() + ' quêtes restantes'">{{ game.dailyLeft() }}</b>
              }
              @if (t.tab === 'village' && social.requests().length > 0) {
                <b class="count">{{ social.requests().length }}</b>
              }
            </span>
            <span class="lbl">{{ t.label }}</span>
          </ion-tab-button>
        }
      </ion-tab-bar>
    </ion-tabs>
  `,
})
export class TabsPage implements OnInit {
  protected game = inject(GameService);
  protected social = inject(SocialService);
  readonly tabs = [
    { tab: 'tavern', label: 'Taverne', icon: 'house' },
    { tab: 'quests', label: 'Quêtes', icon: 'swords' },
    { tab: 'village', label: 'Village', icon: 'users' },
    { tab: 'hero', label: 'Héros', icon: 'user-round' },
    { tab: 'chronicle', label: 'Chronique', icon: 'book-open' },
  ];

  ngOnInit(): void {
    this.social.start();
  }
}
