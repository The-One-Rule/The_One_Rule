-- ===================================================================
-- LOT E — les DEMANDES d'ami.
--
-- Rapporté par Pierre : « si on veut ajouter quelqu'un en ami on ne lui
-- demande même pas l'autorisation ». Jusqu'ici, taper un code liait les
-- deux comptes d'office (« donner son code vaut accord »). C'était défendable
-- tant qu'un code ne circulait qu'à l'oral ; mais un code se recopie, se
-- montre, se devine sur un écran — et être ajouté par quelqu'un qu'on ne
-- connaît pas, c'est lui ouvrir ses scores de la semaine.
--
-- Une demande est ORIENTÉE (de → à) et stockée UNE fois. L'amitié ne naît
-- que de l'acceptation, et elle reste stockée dans les deux sens (0003).
-- Les amitiés déjà nouées ne bougent pas : elles ont été faites sous
-- l'ancienne règle, et les défaire en silence ferait disparaître des amis.
--
-- Comme les précédentes, invisible pour qui ne s'en sert pas (n°12).
-- ===================================================================

create table if not exists demande_ami (
  de_id    text not null references utilisateur(id) on delete cascade,
  a_id     text not null references utilisateur(id) on delete cascade,
  cree_le  timestamptz not null default now(),
  primary key (de_id, a_id),
  check (de_id <> a_id)
);

-- Les demandes REÇUES se lisent par destinataire.
create index if not exists demande_ami_par_destinataire on demande_ami (a_id);

alter table demande_ami enable row level security;
