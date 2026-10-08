import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Legend, Filler);

/** Lit une variable CSS du thème (les graphiques suivent le thème clair/sombre). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

@Component({
  selector: 'lu-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="box" [style.height.px]="height()"><canvas #cv role="img" [attr.aria-label]="label()"></canvas></div>`,
  styles: ':host{display:block} .box{position:relative;width:100%}',
})
export class ChartComponent implements OnDestroy {
  readonly config = input.required<ChartConfiguration>();
  readonly label = input('Graphique');
  readonly height = input(180);
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const cfg = this.config();
      const el = this.canvas().nativeElement;
      this.chart?.destroy();
      Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
      Chart.defaults.color = cssVar('--lu-muted');
      this.chart = new Chart(el, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...(cfg.options ?? {}) } } as ChartConfiguration);
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }
}
