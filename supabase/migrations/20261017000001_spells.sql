-- V4 : butin de classe fidèle à D&D (docs/CLASSES.md). Migration idempotente : elle peut être rejouée sans erreur.
-- 1. Table des capacités connues (le Grimoire). 2. Migration des objets existants vers les nouveaux modèles de classe.
-- Toutes les écritures passent par la fonction « game » (rôle service) ; le joueur ne peut que lire ses propres lignes.

-- ═══════════════════════════ Capacités connues ═══════════════════════════

create table if not exists public.spells_known (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant de la capacité (spells.fr.json), ex. « boule-de-feu ».
  spell_id text not null,
  -- Niveau 1 à 5 : un doublon obtenu dans un coffre monte le niveau.
  level int not null default 1 check (level between 1 and 5),
  -- Emplacement du Grimoire (1 à 3) si la capacité est équipée.
  equipped_slot int check (equipped_slot between 1 and 3),
  created_at timestamptz not null default now(),
  primary key (profile_id, spell_id)
);

-- Un seul sort par emplacement du Grimoire et par joueur.
create unique index if not exists spells_known_one_per_slot on public.spells_known (profile_id, equipped_slot) where equipped_slot is not null;

alter table public.spells_known enable row level security;
drop policy if exists spells_known_select on public.spells_known;
create policy spells_known_select on public.spells_known for select to authenticated using (profile_id = auth.uid());
revoke insert, update, delete on public.spells_known from anon, authenticated;

-- ═══════════════════════════ Migration des objets existants ═══════════════════════════
-- Chaque ancien modèle devient un modèle de même emplacement et de même caractéristique (universel si possible, sinon un objet de
-- classe). Aucun objet n'est supprimé ; rareté, niveau, état équipé et date restent intacts, donc au plus un objet équipé par emplacement.
-- Rejouable : un identifiant déjà migré n'est plus une clé de la table (les deux modèles qui gardent leur identifiant restent inchangés).

update public.inventory_items i
set template_id = m.new_id
from (values
('epee-du-sentier', 'espadon'),
('dague-vive', 'arc-long'),
('baton-des-sages', 'baton-du-mage'),
('arc-de-l-aube', 'masse-d-armes'),
('sceptre-d-eloquence', 'sceptre-de-heraut'),
('masse-du-rempart', 'gourdin-de-voyageur'),
('hache-du-forgeron', 'marteau-de-guerre'),
('fleuret-leger', 'rapiere'),
('casque-de-fer', 'heaume'),
('chapeau-de-voyageur', 'chapeau-de-voyageur'),
('couronne-de-lauriers', 'heaume-de-brillance'),
('diademe-du-savant', 'capuche-de-voleur'),
('capuche-du-veilleur', 'capuchon-de-pisteur'),
('bandeau-du-guerrier', 'bandeau-de-combattant'),
('heaume-du-gardien', 'mitre'),
('lunettes-d-erudit', 'chapeau-de-sorcier'),
('cotte-de-mailles', 'robe-consacree'),
('tunique-du-voyageur', 'armure-de-cuir-cloute'),
('armure-de-plates', 'harnois'),
('robe-de-sagesse', 'manteau-de-pelerin'),
('manteau-d-orateur', 'pourpoint-de-velours'),
('veste-de-l-artisan', 'veste-d-erudit'),
('plastron-de-cuir', 'robe-d-archimage'),
('cape-du-conteur', 'pourpoint-de-velours'),
('gantelets-de-force', 'gants-de-travail'),
('gants-d-artisan', 'gants-de-nage-et-d-escalade'),
('bracelets-de-calme', 'mitaines-de-benediction'),
('mitaines-d-ecriture', 'outils-de-voleur'),
('poignets-du-rempart', 'anneau-de-protection'),
('gants-de-velours', 'gantelets-de-serment'),
('poings-d-acier', 'gantelets-de-puissance-d-ogre'),
('anneau-de-vivacite', 'gants-de-menestrel'),
('bottes-de-sept-lieues', 'bottes-de-danse'),
('sandales-du-pelerin', 'bottes-elfiques'),
('bottes-de-fer', 'bottes-de-marche-et-de-saut'),
('souliers-de-danse', 'bottes-d-apparat'),
('chaussons-de-lecture', 'pantoufles-d-erudit'),
('sabots-du-bucheron', 'sabatons-benis'),
('bottines-de-sentier', 'sandales-de-pelerin'),
('baskets-du-coureur', 'souliers-de-velours'),
('pendentif-du-sage', 'amulette-de-protection-contre-la-detection'),
('talisman-de-force', 'talisman-de-force'),
('medaillon-de-l-aube', 'medaillon-de-pensees'),
('collier-du-troubadour', 'reliquaire'),
('amulette-de-vigueur', 'amulette-de-sante'),
('breloque-agile', 'pierre-de-chance'),
('sautoir-d-erudit', 'grimoire'),
('sceau-du-gardien', 'symbole-sacre')
) as m (old_id, new_id)
where i.template_id = m.old_id and m.old_id <> m.new_id;
