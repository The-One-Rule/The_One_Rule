-- ===================================================================
-- LOT C — les performances.
--
-- ⚠️ CETTE TABLE NE CONTIENT QUE DU VÉRIFIÉ.
--
-- Une performance y entre uniquement si le serveur a REJOUÉ son journal
-- d'entrées avec le moteur pur (src/engine/verify.ts) et produit le score
-- lui-même. On ne stocke jamais un score affirmé par un client.
--
-- Tout le reste — carnet, série, records d'entraînement et d'escalade —
-- vit dans utilisateur.agregats, qui est explicitement NON vérifiable et
-- ne sert qu'au joueur lui-même. Les deux ne doivent jamais se confondre :
-- c'est ce qui garantit qu'un futur classement ne partira pas de faits
-- invérifiables hérités d'avant les comptes.
--
-- Aucun classement n'est construit ici. Cette table est l'infrastructure
-- qui en rendra un possible, rien de plus — d'où l'index sur la clé de
-- comparabilité, qui est la seule chose qu'un classement aurait à lire.
-- ===================================================================

create table if not exists performance (
  id              bigserial primary key,
  utilisateur_id  text not null references utilisateur(id) on delete cascade,

  -- 'daily' aujourd'hui, et lui seul : c'est le seul mode dont deux
  -- résultats se comparent directement (même graine, même règle pour tout
  -- le monde). L'escalade demanderait d'étendre verify.ts aux PILES de
  -- règles, et le multijoueur n'est pas classable tant que les salons sont
  -- privés à code — deux amis y produiraient cent victoires en une soirée.
  mode            text not null,

  -- La clé de comparabilité : mode + régime + version de contenu + jour.
  -- Deux performances ne se comparent QUE si elle est identique. C'est la
  -- loi de shared/compte.ts, matérialisée ici pour qu'un classement n'ait
  -- qu'un index à lire.
  cle             text not null,

  -- Dénormalisées depuis la clé pour pouvoir filtrer sans la décomposer.
  version_contenu text not null,
  jour            integer,

  graine          bigint not null,
  regle           text not null,

  -- valeur : ce qui se compare. valeur2 : ce qui départage — la durée pour
  -- le run du jour, où beaucoup de joueurs finissent les 40 manches.
  valeur          integer not null,
  valeur2         integer not null default 0,

  -- Toujours vrai dans cette table. La colonne existe pour qu'une requête
  -- de classement porte le filtre explicitement plutôt que de s'appuyer sur
  -- une convention qu'on aura oubliée.
  verifiee        boolean not null default true,

  -- Le verdict du contrôle d'automatisation (src/ranked/antibot.ts).
  -- « douteux » est conservé mais ne devra jamais alimenter un classement.
  verdict_bot     text not null default 'humain',

  cree_le         timestamptz not null default now()
);

-- UNE performance par compte et par clé.
--
-- Pour le run du jour, la clé contient le jour : c'est donc une soumission
-- par compte et par jour, ce qui borne gratuitement la triche par
-- répétition. C'est aussi la raison pour laquelle la forme quotidienne est
-- la seule forme de classement raisonnable à ce stade.
create unique index if not exists performance_unique
  on performance (utilisateur_id, cle);

-- L'index qu'un classement lirait : meilleure valeur d'abord, départage
-- croissant sur valeur2 (la durée). Il ne sert à rien aujourd'hui, et il
-- coûte trois lignes — c'est exactement ce qu'on entend par « préparer
-- l'infrastructure sans construire la fonctionnalité ».
create index if not exists performance_classement
  on performance (cle, valeur desc, valeur2 asc)
  where verifiee;

alter table performance enable row level security;
