import { ABILITY_COLOR, ABILITY_LABEL, type AbilityId } from '@levelup/engine';

export interface SheetImageInput {
  name: string;
  className: string;
  level: number;
  title: string;
  scores: Record<AbilityId, number>;
  base: Record<AbilityId, number>;
  streak: number;
  motto: string;
  legendary: boolean;
}

const AXES: AbilityId[] = ['CON', 'SAG', 'INT', 'CHA', 'DEX', 'FOR'];

/** Image PNG de la fiche de personnage (canvas), à enregistrer ou partager. */
export async function renderSheetPng(s: SheetImageInput): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  const gold = s.legendary;
  try {
    await document.fonts.load('600 64px "Lora Variable"');
    await document.fonts.load('500 28px "Inter Variable"');
  } catch {
    /* polices système */
  }
  const serif = '"Lora Variable", Georgia, serif';
  const sans = '"Inter Variable", system-ui, sans-serif';

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#0b1a14');
  bg.addColorStop(0.5, '#16302a');
  bg.addColorStop(1, '#0b1a14');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = gold ? '#d4af37' : 'rgba(143,214,168,.4)';
  g.lineWidth = gold ? 6 : 2;
  roundRect(g, 30, 30, W - 60, H - 60, 44);
  g.stroke();

  // en-tête
  g.fillStyle = '#8fd6a8';
  g.font = `700 26px ${sans}`;
  g.textAlign = 'center';
  g.fillText('LEVEL UP · FICHE DE PERSONNAGE', W / 2, 110);
  g.fillStyle = '#f3f7f2';
  g.font = `500 88px ${serif}`;
  g.fillText(s.name, W / 2, 215);
  g.fillStyle = '#c7d8c9';
  g.font = `400 34px ${sans}`;
  g.fillText(`${s.className} · ${s.title}`, W / 2, 272);
  if (s.motto) {
    g.font = `italic 400 30px ${serif}`;
    g.fillStyle = '#a8c0b0';
    g.fillText(`« ${s.motto} »`, W / 2, 322);
  }

  // niveau
  g.beginPath();
  g.arc(W / 2, 450, 78, 0, Math.PI * 2);
  g.fillStyle = gold ? '#2a2418' : '#13261f';
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = gold ? '#d4af37' : '#8fd6a8';
  g.stroke();
  g.fillStyle = gold ? '#f2d38a' : '#f3f7f2';
  g.font = `600 92px ${serif}`;
  g.fillText(String(s.level), W / 2, 482);
  g.font = `700 20px ${sans}`;
  g.fillStyle = '#a8c0b0';
  g.fillText('NIVEAU', W / 2, 395);

  // radar
  const cx = W / 2;
  const cy = 860;
  const R = 300;
  const pt = (i: number, v: number): [number, number] => {
    const a = (-90 + i * 60) * (Math.PI / 180);
    return [cx + (v / 20) * R * Math.cos(a), cy + (v / 20) * R * Math.sin(a)];
  };
  g.lineWidth = 2;
  for (const r of [5, 10, 15, 20]) {
    g.beginPath();
    AXES.forEach((_, i) => {
      const [x, y] = pt(i, r);
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.strokeStyle = 'rgba(143,214,168,.25)';
    g.stroke();
  }
  const poly = (m: Record<AbilityId, number>, fill: string, stroke: string, dash: number[]) => {
    g.beginPath();
    AXES.forEach((a, i) => {
      const [x, y] = pt(i, Math.min(m[a], 20));
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    });
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.setLineDash(dash);
    g.strokeStyle = stroke;
    g.lineWidth = 4;
    g.stroke();
    g.setLineDash([]);
  };
  poly(s.base, 'rgba(168,192,176,.12)', '#a8c0b0', [10, 10]);
  poly(s.scores, 'rgba(143,214,168,.3)', '#8fd6a8', []);
  AXES.forEach((a, i) => {
    const [lx, ly] = pt(i, 24.5);
    g.fillStyle = ABILITY_COLOR[a];
    g.font = `700 30px ${sans}`;
    g.fillText(ABILITY_LABEL[a], lx, ly - 6);
    g.fillStyle = '#f3f7f2';
    g.font = `600 44px ${serif}`;
    g.fillText(String(s.scores[a]), lx, ly + 40);
  });

  // pied
  g.fillStyle = '#f2d38a';
  g.font = `600 30px ${sans}`;
  g.fillText(`🔥 ${s.streak} jour${s.streak > 1 ? 's' : ''} de série`, W / 2, H - 100);
  g.fillStyle = '#738077';
  g.font = `500 22px ${sans}`;
  g.fillText('Un petit pas, un grand élan.', W / 2, H - 58);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
