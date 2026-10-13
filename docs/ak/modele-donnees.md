LE MODÈLE DE DONNÉES DE KLOCKA (ce que lire_entite et chercher_entites lisent)

Le parcours d'un bien : une offre (OM, fiche commerciale, mail d'agent) devient un DOSSIER (Deal), analysé lot par lot ; un dossier retenu devient un PROJET (Project), suivi jusqu'au financement ; d'un projet partent la PRÉSENTATION BANCAIRE, la LETTRE D'INTENTION et la data room.

Dossier — type « dossier » (entité Deal)
- Deux identifiants : `id` (la ligne) et `deal_id` (celui des liens /Dossiers?deal_id=… et des outils). Cherche et cite toujours `deal_id`.
- `nom`, `statut` (analyse, projet_cree, abandonne, depouille), `responsables`, `source`, `cree_par`, `cree_le`.
- Les chiffres sont PAR LOT, dans `lots[]` : `lots[i].lot` (adresse, prix_fai, loyer_annuel_ht_hc, surface_m2, locataire_nom, locataire_activite, bail_echeance, bail_type, occupe, rendement_annonce), `lots[i].simulateur` (prixBienFAI, prixBienNegocie, loyerInitialHTHC, surface, taux et frais), `lots[i].evaluation` (verdict, motifs, réserves, manquants).
- `projet_id` quand le dossier est devenu projet (statut projet_cree) : dès lors, c'est le projet qui fait foi.

Projet — type « projet » (entité Project)
- `titre`, `statut` (prospect, analyse, negociation, en_cours, financement, disponible), `adresse_complete`, `client_emails`, `surface_m2`.
- Le prix et le loyer existent à plusieurs endroits ; l'ordre de foi est celui de la plateforme :
  - loyer annuel : `sim_loyer_initial_ht` (onglet Simulateur), sinon `loyer_annuel_ht` (fiche), sinon `bail_loyer_actuel` (onglet Analyse du bail) ;
  - prix : `sim_prix_bien_negocie`, sinon `prix_acquisition`, sinon `sim_prix_bien_fai` (frais d'agence inclus) ;
  - surface : `surface_m2`, sinon `sim_surface` ; échéance du bail : `bail_date_echeance`, sinon `echeance_bail`.
- Les champs `sim_*` sont le simulateur (indexation, durée et taux du crédit, apport, frais, rendements nets) ; `marche_*` l'onglet Marché ; `rendement_locatif` est un rendement déjà calculé, à recalculer par le code avant de le citer.
- Lien vers le dossier d'origine : `deal_id` (rare, 6 projets sur 236) ; sinon le dossier porte `projet_id`.

Présentation bancaire — type « presentation » (PresentationBancaire) : `projet_id`, `titre`, `diapos[]` (seize, chacune avec ses champs et sa source), `pdf_url`.
Lettre d'intention — type « loi » (LettreIntention) : `projet_id` ou `deal_id`, `champs` (acquéreur, vendeur, prix, conditions), `textes`, `modele`.

Agents immobiliers — type « agent » (AgentImmo) : `nom`, `prenom`, `agence`, `ville`, `villes`, `telephones`, `emails`, `statut`, `score`, `annonces`. Agences de la prospection — type « agence » (AgenceProspect) : `nom`, `liste_id`, `adresse`, `telephone`, `site`, `siren`, `gerants`, `note_google`. Une agence a ses agents ; Monday garde les fiches d'appel (lire_fiche_monday).
Listes de prospection — type « liste_agences » (ListeAgences) : une par ville (`ville`, `etat`).
Prospections ALX — type « prospection » (Prospection) : `adresse`, `activite`, `rayon_m`, `commerces`, `retenus`.
Off-market — type « commerce » (CommerceSimple) : un commerce d'une ville (`nom`, `enseigne`, `activite`, `adresse`, `ville`, `siren`, `exploitant`, `proprietaire`, `foncier`, `lien`). Le propriétaire des murs est dans `proprietaire`, le lien exploitant / propriétaire et sa preuve dans `lien` et `lien_motif`.
Relances — type « relance » (Rappel) : `quoi`, `nom`, `echeance`, `note`, `telephone`, `cree_par`.
Côté mandataires : « dossier_mandataire » (DossierMandataire : bien, adresse, prix, surface_m2, loyer_annuel, analyste_email, statut), « proprietaire_mandataire » (ProprietaireMandataire : un propriétaire à appeler, sa liste, son historique).

Pièges connus
- Un chiffre cité vient d'une fiche lue dans cette conversation, jamais de mémoire ; si deux sources divergent (dossier et projet, simulateur et fiche), dis-le avec les deux valeurs.
- « HT/HC » : les loyers des fiches sont hors taxes et hors charges sauf mention contraire.
- Le prix FAI inclut les honoraires d'agence (`honoraires_inclus`, `montant_honoraires`) ; le rendement se calcule sur le prix que la personne retient : dis lequel.
- Un statut « abandonne » ou un projet « disponible » n'est pas un bien en cours : ne le propose pas comme tel.
