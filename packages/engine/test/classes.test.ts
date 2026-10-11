import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLASSES,
  LEGACY_CLASS_MAP,
  LEGACY_PATH_ABILITY,
  LEGACY_PATH_MAP,
  LEGACY_TITLE_MAP,
  MemoryStore,
  changeClass,
  choosePath,
  createCharacter,
  isLegacyClassId,
  masteriesFor,
  migrateLegacyClass,
  pathAbilityFor,
  type QuestTemplate,
  type ServerContext,
} from '../src';

const catalog = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'quests.fr.json'), 'utf8')).map(
  (q: QuestTemplate) => ({ ...q, source: 'catalog' }),
) as QuestTemplate[];

const U = 'user-classes';
const NEW_CLASSES = ['guerrier', 'paladin', 'rodeur', 'clerc', 'barde', 'roublard', 'magicien'];
const sql = readFileSync(join(__dirname, '..', '..', '..', 'supabase', 'migrations', '20261016000001_classes.sql'), 'utf8');

const heroInput = {
  name: 'Aldric',
  classId: 'guerrier',
  scores: { FOR: 5, DEX: 2, CON: 5, INT: 2, SAG: 2, CHA: 2 },
  portraitId: 'p1',
  frameColor: '#2f5a47',
  motto: '',
  oath: '',
  timezone: 'Europe/Paris',
};

async function setup(classId = 'guerrier') {
  const store = new MemoryStore(catalog);
  let n = 0;
  const ctx: ServerContext = { store, now: () => Date.parse('2026-10-05T09:00:00+02:00'), uuid: () => `cl-${++n}` };
  expect((await createCharacter(ctx, U, { ...heroInput, classId })).ok).toBe(true);
  return { store, ctx };
}

describe('classes D&D : table de migration', () => {
  it('chaque ancienne classe pointe vers une des 7 nouvelles classes ; les 7 sont couvertes', () => {
    expect(Object.keys(LEGACY_CLASS_MAP).sort()).toEqual(['aventurier', 'artisan', 'eclaireur', 'erudit', 'explorateur', 'gardien', 'rassembleur', 'troubadour'].sort());
    for (const v of Object.values(LEGACY_CLASS_MAP)) expect(NEW_CLASSES).toContain(v);
    expect(new Set(Object.values(LEGACY_CLASS_MAP))).toEqual(new Set(NEW_CLASSES));
    expect(LEGACY_CLASS_MAP).toMatchObject({ eclaireur: 'guerrier', rassembleur: 'paladin', aventurier: 'rodeur', explorateur: 'clerc', troubadour: 'barde', artisan: 'roublard', erudit: 'magicien', gardien: 'clerc' });
  });

  it('chaque ancienne voie devient une voie de la classe correspondante : même caractéristique si possible, sinon la première', () => {
    expect(Object.keys(LEGACY_PATH_MAP).sort()).toEqual(Object.keys(LEGACY_PATH_ABILITY).sort());
    for (const [oldPath, newPath] of Object.entries(LEGACY_PATH_MAP)) {
      const oldClass = oldPath.split('-')[0];
      const cls = CLASSES.find((c) => c.id === LEGACY_CLASS_MAP[oldClass])!;
      const target = cls.paths.find((p) => p.id === newPath);
      expect(target, `${oldPath} -> ${newPath}`).toBeDefined();
      const sameAbility = cls.paths.find((p) => p.ability === LEGACY_PATH_ABILITY[oldPath]);
      expect(newPath, oldPath).toBe((sameAbility ?? cls.paths[0]).id);
    }
  });

  it('la migration SQL applique exactement les mêmes tables', () => {
    for (const [o, n] of Object.entries(LEGACY_CLASS_MAP)) expect(sql).toContain(`when '${o}' then '${n}'`);
    for (const [o, n] of Object.entries(LEGACY_PATH_MAP)) expect(sql).toContain(`when '${o}' then '${n}'`);
    for (const [o, n] of Object.entries(LEGACY_TITLE_MAP)) expect(sql).toContain(`title_equipped = '${n}' where title_equipped = '${o}'`);
  });

  it('le titre de remplacement existe dans les trophées', () => {
    const ach = JSON.parse(readFileSync(join(__dirname, '..', '..', 'content', 'data', 'achievements.fr.json'), 'utf8')) as { titleUnlocked: string | null }[];
    for (const t of Object.values(LEGACY_TITLE_MAP)) expect(ach.some((a) => a.titleUnlocked === t)).toBe(true);
    for (const t of Object.keys(LEGACY_TITLE_MAP)) expect(ach.some((a) => a.titleUnlocked === t)).toBe(false);
  });
});

describe('migrateLegacyClass (mode local)', () => {
  it('convertit classe, voie et titre, lève l’annonce, et reste idempotent', () => {
    const before = { classId: 'gardien', pathId: 'gardien-protecteur', titleEquipped: 'Rassembleur', level: 7 };
    const after = migrateLegacyClass(before)!;
    expect(after).toMatchObject({ classId: 'clerc', pathId: 'clerc-vie', titleEquipped: 'Cœur de la compagnie', classNotice: true, classChanged: false, level: 7 });
    expect(migrateLegacyClass(after)).toBeNull();
  });
  it('un personnage sans voie ni titre garde ces valeurs vides', () => {
    expect(migrateLegacyClass({ classId: 'erudit' })).toMatchObject({ classId: 'magicien', pathId: null, titleEquipped: null, classNotice: true });
    expect(migrateLegacyClass({ classId: 'erudit', pathId: undefined, titleEquipped: undefined, classChanged: true })).toMatchObject({ classChanged: true });
  });
  it('ne touche pas un personnage déjà en classe D&D', () => {
    expect(migrateLegacyClass({ classId: 'barde', pathId: 'barde-savoir', titleEquipped: 'Centurion' })).toBeNull();
    expect(isLegacyClassId('barde')).toBe(false);
    expect(isLegacyClassId('toString')).toBe(false);
  });
  it('corrige aussi une voie ou un titre ancien sous une classe déjà convertie', () => {
    expect(migrateLegacyClass({ classId: 'clerc', pathId: 'explorateur-druide', classNotice: false })).toMatchObject({ classId: 'clerc', pathId: 'clerc-savoir', classNotice: false });
    expect(migrateLegacyClass({ classId: 'clerc', titleEquipped: 'Rassembleur', classNotice: true, classChanged: true })).toMatchObject({ titleEquipped: 'Cœur de la compagnie', classNotice: true, classChanged: true });
  });
});

describe('class-change : reclassification gratuite unique', () => {
  const flagLegacy = async (s: Awaited<ReturnType<typeof setup>>, patch: object = {}) => {
    const c = (await s.store.getCharacter(U))!;
    await s.store.saveCharacter(U, { ...c, classNotice: true, classChanged: false, ...patch });
  };

  it('est refusée aux personnages non migrés', async () => {
    const s = await setup();
    expect(await changeClass(s.ctx, U, 'paladin')).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await changeClass(s.ctx, 'inconnu', 'paladin')).toMatchObject({ ok: false, error: 'no-character' });
  });

  it('change de classe une seule fois, remet la voie à la première et referme l’annonce', async () => {
    const s = await setup();
    await flagLegacy(s, { pathId: 'guerrier-chevalier', level: 5 });
    expect(await changeClass(s.ctx, U, 'dragon')).toMatchObject({ ok: false, error: 'invalid' });
    const r = await changeClass(s.ctx, U, 'magicien');
    expect(r.ok && r.character).toMatchObject({ classId: 'magicien', pathId: 'magicien-evocation', classNotice: false, classChanged: true, level: 5 });
    expect(await s.store.getCharacter(U)).toMatchObject({ classId: 'magicien', classChanged: true });
    expect(masteriesFor({ classId: 'magicien' })).toEqual(['INT', 'CON']);
    expect(pathAbilityFor({ classId: 'magicien', pathId: 'magicien-evocation' })).toBe('INT');
    expect(await changeClass(s.ctx, U, 'barde')).toMatchObject({ ok: false, error: 'forbidden' });
    expect(await s.store.getCharacter(U)).toMatchObject({ classId: 'magicien' });
  });

  it('sans voie encore choisie, la voie reste à choisir au niveau 3', async () => {
    const s = await setup();
    await flagLegacy(s);
    const r = await changeClass(s.ctx, U, 'rodeur');
    expect(r.ok && r.character.pathId).toBeNull();
  });

  it('garder sa classe referme simplement l’annonce, sans consommer le changement ni toucher la voie', async () => {
    const s = await setup();
    await flagLegacy(s, { pathId: 'guerrier-chevalier' });
    const r = await changeClass(s.ctx, U, 'guerrier');
    expect(r.ok && r.character).toMatchObject({ classId: 'guerrier', pathId: 'guerrier-chevalier', classNotice: false, classChanged: false });
    expect(await changeClass(s.ctx, U, 'paladin')).toMatchObject({ ok: false, error: 'forbidden' });
  });

  it('le choix de voie suit la nouvelle classe', async () => {
    const s = await setup();
    await flagLegacy(s, { level: 5 });
    await changeClass(s.ctx, U, 'clerc');
    expect(await choosePath(s.ctx, U, 'guerrier-champion')).toMatchObject({ ok: false, error: 'invalid' });
    expect((await choosePath(s.ctx, U, 'clerc-savoir')).ok).toBe(true);
  });

  it('une création de personnage refuse les anciennes classes', async () => {
    const store = new MemoryStore(catalog);
    const ctx: ServerContext = { store, now: () => Date.now(), uuid: () => 'x' };
    expect(await createCharacter(ctx, U, { ...heroInput, classId: 'eclaireur' })).toMatchObject({ ok: false, error: 'invalid' });
  });
});
