-- Classes D&D (V4a, docs/CLASSES.md) : les 8 anciennes classes laissent la place à 7 classes (idempotent).
-- Aucun personnage ne perd de niveau, d'XP, de série ni d'objet : seuls la classe, la voie et les titres sont convertis.
-- Mêmes tables que packages/engine/src/legacy-classes.ts (un test vérifie qu'elles restent identiques).

-- « Ta classe a évolué » (affiché une fois) et reclassification gratuite déjà utilisée.
-- Comme les autres colonnes de jeu, elles ne sont pas modifiables par le joueur : seule l'Edge Function `game` y écrit.
alter table public.characters add column if not exists class_notice boolean not null default false;
alter table public.characters add column if not exists class_changed boolean not null default false;

-- 1. Voies : l'ancienne voie devient la voie équivalente de la nouvelle classe (même caractéristique si possible,
--    sinon la première voie). Avant la classe, car la correspondance se lit sur l'ancien identifiant de voie.
update public.characters c
set path_id = case c.path_id
  when 'eclaireur-sentier' then 'guerrier-champion'
  when 'eclaireur-bastion' then 'guerrier-champion'
  when 'aventurier-ombre' then 'rodeur-chasseur'
  when 'aventurier-tempete' then 'rodeur-belluaire'
  when 'artisan-inventeur' then 'roublard-voleur'
  when 'artisan-maitre' then 'roublard-voleur'
  when 'troubadour-conteur' then 'barde-savoir'
  when 'troubadour-meneur' then 'barde-vaillance'
  when 'rassembleur-feu' then 'paladin-devotion'
  when 'rassembleur-roc' then 'paladin-vengeance'
  when 'erudit-savant' then 'magicien-evocation'
  when 'erudit-ermite' then 'magicien-abjuration'
  when 'gardien-guerisseur' then 'clerc-vie'
  when 'gardien-protecteur' then 'clerc-vie'
  when 'explorateur-druide' then 'clerc-savoir'
  when 'explorateur-nomade' then 'clerc-vie'
  else c.path_id
end
where c.path_id in (
  'eclaireur-sentier', 'eclaireur-bastion', 'aventurier-ombre', 'aventurier-tempete', 'artisan-inventeur', 'artisan-maitre',
  'troubadour-conteur', 'troubadour-meneur', 'rassembleur-feu', 'rassembleur-roc', 'erudit-savant', 'erudit-ermite',
  'gardien-guerisseur', 'gardien-protecteur', 'explorateur-druide', 'explorateur-nomade'
);

-- 2. Classes : table de correspondance du §4, et annonce « Ta classe a évolué » pour les personnages concernés
--    (seulement eux : un second passage ne trouve plus d'ancien identifiant et ne rallume rien).
update public.characters c
set class_notice = true,
    class_id = case c.class_id
      when 'eclaireur' then 'guerrier'
      when 'rassembleur' then 'paladin'
      when 'aventurier' then 'rodeur'
      when 'explorateur' then 'clerc'
      when 'troubadour' then 'barde'
      when 'artisan' then 'roublard'
      when 'erudit' then 'magicien'
      when 'gardien' then 'clerc'
    end
where c.class_id in ('eclaireur', 'rassembleur', 'aventurier', 'explorateur', 'troubadour', 'artisan', 'erudit', 'gardien');

-- 3. Titre honorifique qui citait une ancienne classe (le catalogue des trophées est aussi mis à jour par le seed).
update public.characters set title_equipped = 'Cœur de la compagnie' where title_equipped = 'Rassembleur';
update public.achievements set title_unlocked = 'Cœur de la compagnie' where title_unlocked = 'Rassembleur';
update public.achievements set name = 'Fouilleur du catalogue' where name = 'Explorateur du catalogue';
