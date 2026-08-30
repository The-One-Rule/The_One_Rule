-- ===================================================================
-- LOT A — le socle d'identité.
--
-- Ce que cette migration installe est INVISIBLE pour un joueur : aucune
-- fonctionnalité de jeu n'en dépend, et TOR reste intégralement jouable
-- sans qu'une seule ligne n'existe ici.
--
-- Trois couches d'identité, jamais confondues (voir shared/compte.ts) :
--   · l'appareil    — anonId en localStorage, ne disparaît jamais ;
--   · le compte TOR — utilisateur.id, opaque, permanent ;
--   · la plateforme — lien_plateforme, N vers 1, révocable.
--
-- C'est ce découpage, et lui seul, qui rendra Steam ou Epic gratuits plus
-- tard : une ligne de plus dans lien_plateforme, aucune reprise de données,
-- aucune migration de l'identité.
-- ===================================================================

-- -------------------------------------------------------------------
-- utilisateur
-- -------------------------------------------------------------------
create table if not exists utilisateur (
  -- Opaque, généré par nous. JAMAIS dérivé d'un e-mail ni d'un identifiant
  -- de fournisseur : le jour où Steam impose le sien, il devient un lien de
  -- plus, pas une clé primaire à changer.
  id             text primary key,

  -- Le pseudo n'est PAS unique — voir normalisePseudo() dans shared/compte.ts.
  -- L'unicité créerait de la friction à l'inscription au pire moment sans
  -- empêcher l'usurpation (les homoglyphes passent tout filtre raisonnable).
  -- Deux joueurs du même nom se distinguent par leur glyphe.
  pseudo         text not null default '',

  -- Sac OUVERT, en JSONB, et c'est le point d'évolutivité principal de cette
  -- table. Il ne porte aujourd'hui que { "glyphe": n }. L'habillage des
  -- cartes de partie, puis ce qui s'y accrochera, s'ajoutera comme une clé
  -- de plus — sans migration, sans déploiement coordonné, et sans toucher au
  -- protocole des salons. Ce qui manquera alors est une table de possession
  -- et une règle dans apparenceAutorisee() : rien d'autre.
  apparence      jsonb   not null default '{"glyphe": 0}'::jsonb,

  -- Carnet, série, records — voir Agregats dans shared/compte.ts.
  -- En JSONB parce que ce sont des dictionnaires courts et toujours lus
  -- ensemble : les normaliser coûterait trois jointures pour zéro requête
  -- que l'on souhaite écrire.
  agregats       jsonb   not null default '{}'::jsonb,

  -- Concurrence optimiste. La fusion des agrégats est écrite UNE fois, en
  -- TypeScript (fusionne()), et surtout pas redite en plpgsql : deux
  -- implémentations de la même règle finiraient par diverger, et le symptôme
  -- serait un carnet qui rétrécit — invisible, définitif.
  -- L'atomicité vient donc d'un compare-and-swap sur cette colonne, pas
  -- d'une fusion côté base.
  revision       integer not null default 0,

  -- Révocation à une colonne : « se déconnecter partout » = +1.
  -- Le serveur de salons ne peut pas la vérifier (il n'a pas de base, et lui
  -- en donner une mettrait un aller-retour réseau sur le chemin d'entrée du
  -- multijoueur). La durée de vie du jeton — 24 h — EST donc la fenêtre de
  -- révocation en multi. Voir shared/jeton.ts.
  version_jeton  integer not null default 0,

  -- Cumul de suspicion. Rien ne l'écrit au lot A ; il existe pour que le
  -- durcissement du lot D n'ait pas à migrer la table.
  drapeaux       integer not null default 0,

  cree_le        timestamptz not null default now(),
  vu_le          timestamptz not null default now(),
  banni_le       timestamptz,

  -- Effacement LOGIQUE d'abord : le lien de plateforme, lui, part tout de
  -- suite (voir plus bas), sinon se reconnecter ressusciterait un compte
  -- supprimé.
  supprime_le    timestamptz
);

-- Aucune colonne e-mail, et c'est délibéré. L'identifiant du fournisseur
-- suffit à retrouver un compte ; stocker l'adresse ajouterait une donnée
-- personnelle sans usage, c'est-à-dire de la responsabilité pure. Le jour où
-- une récupération hors fournisseur sera nécessaire, ce sera une colonne de
-- plus — pas une reprise.

-- -------------------------------------------------------------------
-- lien_plateforme
-- -------------------------------------------------------------------
create table if not exists lien_plateforme (
  -- 'google' | 'discord' aujourd'hui. 'steam' | 'epic' un jour, sans que
  -- rien d'autre ne bouge.
  fournisseur     text not null,
  id_externe      text not null,
  utilisateur_id  text not null references utilisateur(id) on delete cascade,
  cree_le         timestamptz not null default now(),
  primary key (fournisseur, id_externe)
);

create index if not exists lien_plateforme_utilisateur
  on lien_plateforme (utilisateur_id);

-- -------------------------------------------------------------------
-- Accès
-- -------------------------------------------------------------------
-- RLS activé SANS aucune politique : la clé anonyme ne peut donc rien lire
-- ni écrire. Tous les accès passent par les fonctions edge, qui portent la
-- clé de service. C'est le défaut sûr — une table sans RLS dans Supabase est
-- lisible par quiconque trouve la clé publique, qui est par construction
-- dans le bundle du navigateur.
alter table utilisateur      enable row level security;
alter table lien_plateforme  enable row level security;
