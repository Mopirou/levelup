import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ABILITIES, DUNGEONS, EQUIP_SLOTS, ITEMS, dungeonBase, dungeonUnlockLevel, type TrackDef } from '../src';

const data = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', f), 'utf8'));

describe('contenu de l’aventure', () => {
  it('48 objets : 8 par emplacement, chaque caractéristique présente dans chaque emplacement', () => {
    expect(ITEMS).toHaveLength(48);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(48);
    for (const slot of EQUIP_SLOTS) {
      const inSlot = ITEMS.filter((i) => i.slot === slot);
      expect(inSlot).toHaveLength(8);
      for (const a of ABILITIES) expect(inSlot.some((i) => i.ability === a)).toBe(true);
    }
    for (const i of ITEMS) {
      expect(i.name.trim().length).toBeGreaterThan(3);
      expect(i.glyph.trim()).not.toBe('');
      expect(i.blurb.trim().length).toBeGreaterThan(10);
    }
    // les JSON embarqués sont ceux du contenu généré
    expect(ITEMS).toEqual(data('items.fr.json'));
  });

  it('un donjon par thème de parcours, 5 salles, paliers de 4 donjons, niveau requis cohérent avec le moteur', () => {
    const themes = new Set((data('tracks.fr.json') as TrackDef[]).map((t) => t.theme));
    expect(new Set(DUNGEONS.map((d) => d.theme))).toEqual(themes);
    expect(DUNGEONS).toHaveLength(themes.size);
    expect(new Set(DUNGEONS.map((d) => d.id)).size).toBe(DUNGEONS.length);
    for (const [i, d] of DUNGEONS.entries()) {
      expect(d.id).toBe(`dj-${d.theme}`);
      expect(d.rooms).toHaveLength(5);
      expect(d.rooms.every((r) => /^(un|une) /.test(r))).toBe(true);
      expect(/^(le|la|l’) ?/.test(d.boss)).toBe(true);
      expect(d.tier).toBe(Math.floor(i / 4) + 1);
      expect(d.unlockLevel).toBe(dungeonUnlockLevel(d.tier));
      expect(d.unlockLevel).toBeLessThanOrEqual(20);
      expect(d.glyph.trim()).not.toBe('');
    }
    expect(dungeonBase(DUNGEONS.at(-1)!.tier)).toBeGreaterThan(dungeonBase(1));
    expect(DUNGEONS).toEqual(data('dungeons.fr.json'));
  });
});
