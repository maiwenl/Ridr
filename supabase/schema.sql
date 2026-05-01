-- ============================================================
-- StableConnect — Schéma Supabase
-- Saison 2026-2027
-- ============================================================

-- --------------------------------------------------------
-- Tables
-- --------------------------------------------------------

CREATE TABLE cours (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL,
  jour        text NOT NULL,
  heure_debut time NOT NULL,
  heure_fin   time NOT NULL,
  niveaux     text[] DEFAULT '{}',
  capacite    integer NOT NULL,
  description text
);

CREATE TABLE forfaits (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  libelle text    NOT NULL,
  detail  text    NOT NULL,
  age_min integer,
  age_max integer,
  prix    numeric NOT NULL
);

CREATE TABLE adherents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom                text    NOT NULL,
  prenom             text    NOT NULL,
  email              text    NOT NULL,
  telephone          text    NOT NULL,
  adresse            text    NOT NULL,
  date_naissance     date    NOT NULL,
  galop              text    NOT NULL,
  droit_image        boolean NOT NULL DEFAULT false,
  cours_id           uuid    REFERENCES cours(id),
  forfait_id         uuid    REFERENCES forfaits(id),
  forfait2_id        uuid    REFERENCES forfaits(id),
  remise_famille     boolean NOT NULL DEFAULT false,
  remise_famille_nom text,
  mode_paiement      text    NOT NULL CHECK (mode_paiement IN ('1_fois','3_fois','10_fois')),
  mode_reglement     text    NOT NULL CHECK (mode_reglement IN ('cheque','virement','carte')),
  montant_total      numeric NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE responsables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adherent_id uuid NOT NULL REFERENCES adherents(id) ON DELETE CASCADE,
  rang        integer NOT NULL CHECK (rang IN (1, 2)),
  nom_prenom  text    NOT NULL,
  telephone   text    NOT NULL,
  adresse     text,
  meme_adresse boolean NOT NULL DEFAULT false
);

CREATE TABLE parametres (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle    text NOT NULL UNIQUE,
  valeur text NOT NULL
);

-- --------------------------------------------------------
-- Row Level Security
-- --------------------------------------------------------

ALTER TABLE cours       ENABLE ROW LEVEL SECURITY;
ALTER TABLE forfaits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE adherents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE responsables ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres  ENABLE ROW LEVEL SECURITY;

-- Politique : accès complet aux utilisateurs authentifiés uniquement

CREATE POLICY "authenticated_full_access" ON cours
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON forfaits
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON adherents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON responsables
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON parametres
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- --------------------------------------------------------
-- Données initiales
-- --------------------------------------------------------

INSERT INTO forfaits (libelle, detail, age_min, age_max, prix) VALUES
  ('Baby poney — Découverte',              '3 séances',                     3, 5,    60),
  ('Baby poney — Annuel',                  '10 séances renouvelables',      3, 5,   150),
  ('Baby poney débrouillard — Découverte', '3 séances',                     6, 8,    80),
  ('Baby poney débrouillard — Annuel',     '36 séances',                    6, 8,   630),
  ('Découverte',                           '3 heures',                      9, null, 100),
  ('J''aime',                              '10 heures',                     9, null, 300),
  ('Un peu',                               '20 heures',                     9, null, 550),
  ('Beaucoup',                             '30 heures',                     9, null, 660),
  ('Passionnément',                        'Annuel — heures selon semaines', 9, null, 690);

INSERT INTO parametres (cle, valeur) VALUES
  ('licence_mineur',       '25'),
  ('licence_majeur',       '36'),
  ('remise_2eme_forfait',  '50');
