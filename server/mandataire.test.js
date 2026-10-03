import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandataire-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const { anonymiser, heureDeParis, tableauDuJour, agirSurRappel, executerOutilMandataire, OUTILS_MANDATAIRE } = await import('./mandataire.js');

const MOI = { email: 'm@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'autre@kpartners.fr', role: 'mandataire' };

test("les demandes des clients sortent sans rien qui permette de les joindre", () => {
  const clients = [
    { id: '1', nom: 'Yann Jaffré', email: 'yann@x.fr', revenu: 90000, fonds_propres: 200000, budget: 600000, lieu_recherche: 'Villeurbanne, Lyon', objectif: 'rendement' },
    { id: '2', nom: 'Anne B', budget: 300000, lieu_recherche: 'Nice', objectif: null },
  ];
  const d = anonymiser(clients, 'villeurbanne');
  assert.deepEqual(d, [{ client: 'Client A', lieu_recherche: 'Villeurbanne, Lyon', budget: 600000, objectif: 'rendement' }]);
  assert.doesNotMatch(JSON.stringify(anonymiser(clients)), /Jaffr|yann@|90000|200000|Anne B/);
});

test("l'heure dite est celle de Paris, été comme hiver", () => {
  assert.equal(heureDeParis('2026-10-02T14:00:00').toISOString(), '2026-10-02T12:00:00.000Z');
  assert.equal(heureDeParis('2026-12-03T14:00').toISOString(), '2026-12-03T13:00:00.000Z');
  assert.equal(heureDeParis('2026-10-02T14:00:00Z').toISOString(), '2026-10-02T14:00:00.000Z');
  assert.equal(heureDeParis('jeudi'), null);
});

test("aucun outil du mandataire n'envoie, ne lit les dossiers ni ne touche Monday", () => {
  const noms = OUTILS_MANDATAIRE.map((o) => o.name);
  assert.deepEqual(noms.sort(), [
    'annuler_derniere', 'appel_sans_reponse', 'avis_de_marche', 'bail_estimation', 'corriger_mandat', 'demander_mandat', 'demandes_clients', 'lancer_estimation', 'mes_dossiers', 'mes_proprietaires',
    'mes_rappels', 'noter_rdv', 'noter_relance', 'nouveau_contact', 'preparer_mail', 'ranger_piece', 'resultat_appel',
  ]);
});

test('le mandataire ne voit et ne touche que ses propres rappels', async () => {
  const hier = new Date(Date.now() - 86400000).toISOString();
  Records.create('Rappel', { quoi: 'Rappel de l\'équipe, sans auteur', echeance: hier, cree_par: null, fait_le: null });
  Records.create('Rappel', { quoi: 'Rappel d\'un autre', echeance: hier, cree_par: AUTRE.email, fait_le: null });
  const rdv = await executerOutilMandataire({ name: 'noter_rdv', input: { quand: new Date().toISOString().slice(0, 10) + 'T15:00', avec: 'M. Durand', objet: 'estimation' } }, MOI);
  assert.equal(rdv.ok, true);
  const relance = Records.create('Rappel', { espace: 'mandataire', genre: 'relance', nom: 'Tabac de Mâcon', quoi: 'rappeler le tabac', echeance: hier, cree_par: MOI.email, fait_le: null });
  // Un rappel du même compte posé depuis le dashboard admin : il reste là-bas.
  Records.create('Rappel', { quoi: 'Relancer le dossier de Dieppe', echeance: hier, cree_par: MOI.email, fait_le: null });

  const jour = await tableauDuJour(MOI);
  assert.deepEqual(jour.rappels.map((l) => l.id), [relance.id], 'ni le rappel sans auteur, ni celui d\'un autre');
  assert.equal(jour.en_retard, 1);
  assert.deepEqual(jour.a_faire.map((l) => l.id), [rdv.rappel_id]);

  const autre = Records.list('Rappel').find((r) => r.cree_par === AUTRE.email);
  assert.equal((await agirSurRappel(autre.id, 'supprimer', MOI)).ok, false);
  assert.equal((await agirSurRappel(relance.id, 'demain', MOI)).ok, true);
  assert.equal((await tableauDuJour(MOI)).rappels.length, 0, 'reporté à demain');
  assert.equal((await agirSurRappel(rdv.rappel_id, 'supprimer', MOI)).ok, true, "l'Annuler du chat");
  assert.equal(Records.get('Rappel', rdv.rappel_id), null);
});

test("le dashboard admin et l'espace mandataire ne se voient pas", async () => {
  const ADMIN = { email: 'jules.b@klocka.immo', role: 'admin' };
  const hier = new Date(Date.now() - 86400000).toISOString();
  Records.create('Rappel', { quoi: 'Relancer le dossier de Tours', echeance: hier, cree_par: ADMIN.email, fait_le: null });
  const r = await executerOutilMandataire({ name: 'noter_rdv', input: { quand: new Date().toISOString().slice(0, 10) + 'T16:00', avec: 'Mme Roux' } }, ADMIN);
  const { listerRappels } = await import('./rappels.js');
  const admin = listerRappels(ADMIN);
  assert.equal([...admin.dus, ...admin.a_venir].some((x) => x.id === r.rappel_id), false, 'le RDV noté en vue mandataire ne remonte pas chez l\'admin');
  const vueMandataire = await tableauDuJour(ADMIN);
  assert.deepEqual([...vueMandataire.rappels, ...vueMandataire.a_faire, ...vueMandataire.a_venir].map((x) => x.id), [r.rappel_id], 'ni ses relances d\'admin en vue mandataire');
});

test('activiteRepond : racines, mots courts, variantes', async () => {
  const { activiteRepond } = await import('./mandataire-recherche.js');
  assert.ok(activiteRepond('Coiffure beaute', ['coiffeur']), 'coiffeur trouve Coiffure');
  assert.ok(activiteRepond('Boulangerie-pâtisserie', ['boulangerie']));
  assert.ok(activiteRepond('Restauration rapide', ['restaurant']), 'restaurant trouve Restauration');
  assert.ok(activiteRepond('Bar-tabac Le Marigny', ['bar']), 'bar, mot court, en mot isolé');
  assert.ok(!activiteRepond('Barbier moderne', ['bar']), 'bar ne prend pas barbier');
  assert.ok(activiteRepond('Assurances AXA', ['assurance']));
  assert.ok(!activiteRepond('Pharmacie Centrale', ['boulangerie']));
  assert.ok(activiteRepond("n'importe quoi", []), 'aucune activité : tout passe');
});

test('activiteRepond : une activité à plusieurs mots les exige tous', async () => {
  const { activiteRepond } = await import('./mandataire-recherche.js');
  assert.ok(activiteRepond('Auto-école Codes Rousseau', ['auto-école']));
  assert.ok(!activiteRepond('Laverie automatique', ['auto-école']), 'auto seul ne suffit pas');
  assert.ok(!activiteRepond('Station-service automobile', ['auto-école']));
  assert.ok(activiteRepond('Agence immobilière Laforêt', ['agence immobilière']));
  assert.ok(!activiteRepond('Agence bancaire LCL', ['agence immobilière']), 'une agence seule ne suffit pas');
});

test("interpreterAffinage : sans modèle, une activité reste un nom de commerce", async () => {
  // Les gardes de sortie (charset, longueur) se testent sur la forme pure.
  const { interpreterAffinage } = await import('./mandataire-recherche.js');
  const r = await interpreterAffinage('', { activites: ['boulangerie'], emplacement: 1 });
  assert.deepEqual(r, { activites: ['boulangerie'], emplacement: 1, autre_ville: null });
});

test('echeanceReportee : le jour choisi, 9 h pour une relance, l\'heure gardée pour un rdv', async () => {
  const { echeanceReportee } = await import('./mandataire.js');
  const { instantParis } = await import('./rappels.js');
  const relance = await echeanceReportee('2026-10-01T07:00:00.000Z', 'relance', '2026-10-15');
  assert.equal(relance.toISOString(), instantParis(2026, 10, 15, 9, 0).toISOString());
  const rdv = await echeanceReportee(instantParis(2026, 10, 2, 14, 30).toISOString(), 'rdv', '2026-10-20');
  assert.equal(rdv.toISOString(), instantParis(2026, 10, 20, 14, 30).toISOString());
  assert.equal(await echeanceReportee(null, 'relance', 'demain'), null, 'une date mal formée rend null');
});

test("annuler une relance ou un RDV remet la fiche dans son état d'avant", async () => {
  const { creerProprietaire, noterSansReponse } = await import('./mandataire-espace.js');
  const { executerOutilMandataire } = await import('./mandataire.js');
  const moi = { email: 'retour@test.fr', role: 'mandataire' };
  const { proprietaire: p } = creerProprietaire({ nom: 'M. Noir', commerce: 'Presse du Centre', ville: 'Mâcon', telephone: '06' }, moi);
  // Pas de réponse : tentative comptée, relance posée.
  const r = noterSansReponse(p.id, moi);
  assert.equal(r.tentatives, 1);
  // Annuler la relance : la tentative est décomptée, la prochaine action revient.
  const a = await executerOutilMandataire({ name: 'annuler_derniere', input: {} }, moi);
  assert.equal(a.annule, true);
  const apres = Records.get('ProprietaireMandataire', p.id);
  assert.equal(apres.tentatives, 0, 'la tentative est décomptée');
  assert.equal(apres.statut, 'a_appeler', "le statut d'avant revient");
  // Un RDV sur la fiche, puis son annulation : le statut rdv_pris s'efface.
  await executerOutilMandataire({ name: 'noter_rdv', input: { qui: 'Presse du Centre', avec: 'M. Noir', quand: '2026-12-01T14:00' } }, moi);
  assert.equal(Records.get('ProprietaireMandataire', p.id).statut, 'rdv_pris');
  await executerOutilMandataire({ name: 'annuler_derniere', input: { genre: 'rdv' } }, moi);
  assert.equal(Records.get('ProprietaireMandataire', p.id).statut, 'a_appeler', 'le RDV annulé rend la fiche comme avant');
});

test('rueDeLAdresse : le nom de rue sans le numéro', async () => {
  const { rueDeLAdresse } = await import('./mandataire-lancement.js');
  assert.equal(rueDeLAdresse('12 Rue Carnot'), 'Rue Carnot');
  assert.equal(rueDeLAdresse('3 bis Avenue de la Gare'), 'Avenue de la Gare');
  assert.equal(rueDeLAdresse('Place aux Herbes'), 'Place aux Herbes');
  assert.equal(rueDeLAdresse(''), null);
});

test('memePersonne : civilités, ordre des mots et formes juridiques ignorés', async () => {
  const { memePersonne } = await import('./mandataire-lancement.js');
  assert.ok(memePersonne('M. Georges Lacroix', 'LACROIX GEORGES'));
  assert.ok(memePersonne('Georges Lacroix', 'SCI LACROIX GEORGES'));
  assert.ok(!memePersonne('Georges Lacroix', 'SCI DU PORT'));
  assert.ok(!memePersonne('Georges Lacroix', 'Marie Lacroix'));
  assert.ok(!memePersonne('', 'Georges Lacroix'));
});

test('colonnesDeCible : la même personne ne remplit pas trois colonnes', async () => {
  const { colonnesDeCible } = await import('./mandataire-lancement.js');
  const c = colonnesDeCible({
    enseigne: 'Boulangerie', proprietaire: { nom: 'LACROIX GEORGES', forme: null },
    societe: { nom: 'GEORGES LACROIX', forme: null, gerants: [{ nom: 'Georges Lacroix', tranche_age: '50-70' }] },
  });
  assert.equal(c.proprietaire, 'LACROIX GEORGES');
  assert.equal(c.proprietaire_age, '50-70');
  assert.equal(c.societe.nom, null);
  assert.ok(c.societe.en_nom_propre);
  assert.equal(c.gerant, null);
  const sci = colonnesDeCible({ proprietaire: { nom: 'LACROIX GEORGES' }, societe: { nom: 'SCI LACROIX GEORGES', forme: 'SCI', gerants: [{ nom: 'Marie Durand', tranche_age: '30-50' }] } });
  assert.equal(sci.societe.nom, null, 'la SCI homonyme ne répète pas le nom');
  assert.ok(!sci.societe.en_nom_propre, 'mais elle reste une SCI');
  assert.equal(sci.gerant.nom, 'Marie Durand', 'un gérant différent reste montré');
});

test('activiteRepond reste sourde aux accents du texte', async () => {
  const { activiteRepond } = await import('./mandataire-recherche.js');
  assert.ok(activiteRepond('Boulangerie pâtisserie Mâcon', ['pâtisserie']));
});

test("veille mandataire : une cible vérifiée a un propriétaire joignable, l'ordre d'appel tient", async () => {
  const { cibleVerifiee, scoreCible, bailleurPublic } = await import('./mandataire-veille.js');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI DUPONT' }, murs_telephone: '06' }), true);
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI DUPONT' } }), false, 'sans numéro, rien à appeler');
  // Le dirigeant du commerce connaît son bailleur : son numéro suffit (2 oct. 2026).
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI DUPONT' }, dirigeant_telephone: '06 12 34 56 78' }), true, 'le numéro du dirigeant du commerce suffit');
  // Le numéro du commerce seul n'est jamais celui du propriétaire.
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI DUPONT' }, telephone: '04 78 00 00 00' }), false, 'le seul numéro du commerce ne suffit pas');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'COMMUNE DE LYON' }, dirigeant_telephone: '06' }), false, 'un bailleur public reste écarté');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'COMMUNE DE MACON' }, murs_telephone: '03' }), false, 'un bailleur public ne se démarche pas');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'M. Blanc' }, proprietaire_occupant: true, telephone: '03' }), true, 'le propriétaire-occupant se joint par son commerce');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI X' }, murs_telephone: '06', activite_exclue: true }), false);
  assert.equal(bailleurPublic('OFFICE PUBLIC DE L HABITAT'), true);
  const n1 = scoreCible({ emplacement: 1, proprietaire: { forme: 'SCI' }, societe: { gerants: [{ tranche_age: '70+' }] }, murs_telephone: '06' });
  const n2 = scoreCible({ emplacement: 2, proprietaire: {}, societe: {} });
  assert.ok(n1 > n2, 'n°1, 70 ans et SCI passent devant');
});

test("enseigne nationale propriétaire de ses murs : écartée ; l'indépendant qui lui loue : gardé", async () => {
  const { enseigneNationale, cibleVerifiee } = await import('./mandataire-veille.js');
  assert.equal(enseigneNationale('SOCIETE GENERALE'), true);
  assert.equal(enseigneNationale('CARREFOUR PROPERTY FRANCE'), true);
  assert.equal(enseigneNationale('SCI DE LA CROIX SACCARD'), false);
  assert.equal(enseigneNationale('FINAMUR'), false);
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SOCIETE GENERALE' }, proprietaire_occupant: true, telephone: '03', enseigne: 'SG' }), false, 'la banque qui tient son agence ne se démarche pas');
  assert.equal(cibleVerifiee({ proprietaire: { nom: 'SCI DUPONT' }, murs_telephone: '06', enseigne: 'Carrefour City' }), true, "l'indépendant qui loue à Carrefour, si");
});

test('prospection : la question du mode porte ses deux boutons', async () => {
  const { BOUTONS_MODE, poseLaQuestionDuMode } = await import('./mandataire-prospective.js');
  assert.deepEqual(BOUTONS_MODE.map((b) => b.texte), ['Recherche multicritère', 'Suggestion intelligente']);
  assert.ok(BOUTONS_MODE.every((b) => b.detail), 'chaque bouton dit ce qu\'il fait');
  assert.equal(poseLaQuestionDuMode('Recherche multicritère, ou suggestion intelligente ?'), true);
  assert.equal(poseLaQuestionDuMode('La page s\'ouvre avec la suggestion intelligente.'), false, 'une phrase de lancement ne pose pas la question');
});

test('prospection : une rue dite en clair se résout sans ambiguïté inutile', async () => {
  const { lireRue, rueExacte } = await import('./mandataire-prospective.js');
  assert.deepEqual(lireRue('la rue Carnot'), { complet: 'rue carnot', cle: 'carnot', type: 'rue' });
  const rues = [{ nom: 'Rue Carnot' }, { nom: 'Place Carnot' }];
  assert.equal(rueExacte(rues, 'la rue Carnot')?.nom, 'Rue Carnot');
  assert.equal(rueExacte(rues, 'place carnot')?.nom, 'Place Carnot');
  assert.equal(rueExacte(rues, 'Carnot'), null, 'le nom seul reste ambigu : on demande');
});

test("agent : la raison d'appeler se dit en quelques mots", async () => {
  const { raisonDe } = await import('./mandataire-agent.js');
  assert.equal(raisonDe({ emplacement: 1, proprietaire: { nom: 'SCI X', forme: 'SCI' }, societe: { gerants: [{ tranche_age: '70+' }] } }), 'emplacement n°1 · murs en SCI · dirigeant de plus de 70 ans');
  assert.equal(raisonDe({ proprietaire_occupant: true, emplacement: 2 }), 'rue commerçante · propriétaire exploitant');
});

test('Monday : le statut Klocka devient la colonne Mandat, la date ne bouge pas à la mise à jour', async () => {
  const { colonnesProspect } = await import('./mandataire-monday.js');
  const base = { mandataire_email: 'a@b.fr', commerce: 'Cave', nom: 'M. X' };
  assert.equal(colonnesProspect({ ...base, statut: 'a_appeler' }).color_mm0ekshq.label, 'Non proposé');
  assert.equal(colonnesProspect({ ...base, statut: 'rdv_pris' }).color_mm0ekshq.label, 'En cours');
  assert.equal(colonnesProspect({ ...base, statut: 'mandat_signe' }).color_mm0ekshq.label, 'Signé');
  assert.ok(colonnesProspect(base).date_mm0e7d4j, 'la date à la création');
  assert.equal(colonnesProspect(base, { miseAJour: true }).date_mm0e7d4j, undefined, 'pas à la mise à jour');
  assert.match(colonnesProspect({ ...base, statut: 'rdv_pris' }).long_text_mm0e7nsh.text, /Statut Klocka : RDV pris/);
});

test("investisseurs : une zone dite par un client couvre la commune par ville, département ou région", async () => {
  const { zoneCouvre } = await import('./mandataire-agent.js');
  const macon = { ville: 'Mâcon', departement: 'Saône-et-Loire', region: 'Bourgogne-Franche-Comté' };
  assert.equal(zoneCouvre('PACA/Rhone-Alpes', { ville: 'Lyon', departement: 'Rhône', region: 'Auvergne-Rhône-Alpes' }), true);
  assert.equal(zoneCouvre('SUD (bordeaux-lyon)', { ville: 'Lyon' }), true, 'une ville nommée dans la zone');
  assert.equal(zoneCouvre('SUD (bordeaux-lyon)', macon), false);
  assert.equal(zoneCouvre('Bourgogne', macon), true, 'la région');
  assert.equal(zoneCouvre('Toute la France', macon), false, 'une zone vague ne compte pas');
});

test("avis de valeur : les questions dépendent du type et de l'occupation ; les chiffres se calculent", async () => {
  const { manquants, chiffrer, surfacesDe } = await import('./mandataire-avis.js');
  const base = { type_bien: 'murs_commerce', occupe: true, adresse: '14 rue du Marché, Annecy', demandeur: 'SCI Les Tilleuls', surface_utile: 92, etat: 'bon', date_visite: '24 septembre 2026', facade: '7 m', emplacement: 'n°1 bis' };
  assert.ok(manquants(base).includes('loyer_annuel_hc'), 'occupé : le bail se demande');
  assert.ok(!manquants({ ...base, occupe: false }).includes('loyer_annuel_hc'), 'libre : pas de bail');
  assert.ok(manquants({ ...base, type_bien: 'bureaux' }).includes('etage'), 'bureaux : l\'étage');
  // Le cas du modèle : 28 800 € à 5,9 %, 92 m² à 5 300 €/m².
  const c = chiffrer({ ...base, loyer_annuel_hc: 28800 }, { taux: 5.9, prix_m2: 5300, loyer_marche_m2: 304 });
  assert.equal(c.capitalisation, 488000);
  assert.equal(c.comparaison, 487600);
  assert.equal(c.valeur, 490000);
  assert.ok(c.bas < c.valeur && c.haut > c.valeur);
  assert.equal(c.prix_affiche, 514500, 'honoraires 5 % inclus');
  assert.equal(surfacesDe({ ...base, reserve: '30 m²' }).at(-1).ponderee, 6, 'la réserve à 0,2');
});

test('dictée : les noms du secteur reprennent leur orthographe, le maçon reste un maçon', async () => {
  const { corrigerDictee } = await import('./dictee-lexique.js');
  const lexique = ['Charnay-lès-Mâcon', 'Mâcon', 'Durand', 'Pharmacie de la Gare'];
  assert.equal(
    corrigerDictee("j'ai eu monsieur Durant ce matin au sujet de la pharmacie de la gare à Charnay-les-Macons.", [...lexique, 'Durant et fils']),
    "j'ai eu monsieur Durant ce matin au sujet de la Pharmacie de la Gare à Charnay-lès-Mâcon.",
    'le lieu composé se répare, la ponctuation reste'
  );
  assert.equal(corrigerDictee('rendez-vous a macon lundi', lexique), 'rendez-vous a Mâcon lundi', 'après une préposition, même sans majuscule');
  assert.equal(corrigerDictee('il cherche un macon pour les travaux', lexique), 'il cherche un macon pour les travaux', 'un nom commun ne se remplace pas');
  assert.equal(corrigerDictee('Macon, Charnay les Macon et Charnay-lès-Mâcon.', lexique), 'Mâcon, Charnay-lès-Mâcon et Charnay-lès-Mâcon.', 'majuscule seule, pluriel absent, déjà bon');
  assert.equal(corrigerDictee('monsieur Duran est passé', lexique), 'monsieur Duran est passé', 'Duran n’égale pas Durand : on ne devine pas');
  assert.equal(corrigerDictee('', lexique), '', 'le vide reste vide');
});

test("la liste d'appels tient quand une cible a disparu, et garde l'ordre des scores", async () => {
  const QUI = { email: 'appels@kpartners.fr', role: 'mandataire' };
  const hier = new Date(Date.now() - 86400000).toISOString();
  const cible = Records.create('Cible', { enseigne: 'Tabac du Pont', emplacement: 1, telephone: '03 85 00 00 00', proprietaire_occupant: true });
  Records.create('ProprietaireMandataire', { mandataire_email: QUI.email, nom: 'M. Avec Cible', commerce: 'Tabac du Pont', telephone: '06 11 11 11 11', statut: 'a_appeler', prochaine_action_le: hier, cible_id: cible.id });
  // La cible de celui-ci n'existe plus : la journée doit tenir quand même.
  Records.create('ProprietaireMandataire', { mandataire_email: QUI.email, nom: 'M. Sans Cible', commerce: 'Presse de la Gare', telephone: '06 22 22 22 22', statut: 'a_appeler', prochaine_action_le: hier, cible_id: 'cible-disparue' });
  const jour = await tableauDuJour(QUI);
  const appels = jour.a_faire.filter((l) => l.genre === 'appel');
  assert.equal(appels.length, 2, 'les deux appels sortent');
  assert.match(appels[0].titre, /Tabac du Pont/, "l'emplacement n°1 passe devant la fiche sans cible");
});

test('demanderMandat lit les nombres comme on les dit', async () => {
  const { demanderMandat } = await import('./mandataire-portes.js');
  const QUI = { email: 'mandat@kpartners.fr', role: 'mandataire' };
  const r = demanderMandat({ vendeur: 'M. Martin', bien: 'Boulangerie Martin', prix: '450 000 €', honoraires: '5 %', type: 'exclusif', duree_mois: '12 mois' }, QUI);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.mandat.prix, 450000);
  assert.equal(r.mandat.honoraires, 5);
  assert.equal(r.mandat.duree_mois, 12);
  const sans = demanderMandat({ vendeur: 'M. Martin', bien: 'Presse', prix: 'bientôt', honoraires: '5 %', type: 'simple', duree_mois: 12 }, QUI);
  assert.equal(sans.ok, false, 'un prix sans chiffre reste refusé');
});

test("une exception d'outil devient un refus propre, jamais une exception qui remonte", async () => {
  // Une fiche à appeler dont la cible manque faisait tomber mes_rappels en
  // exception ; le filet doit rendre un refus lisible pour tout outil qui casse.
  const r = await executerOutilMandataire({ name: 'noter_rdv', input: { quand: { pas: 'une date' }, avec: 'M. Objet' } }, MOI);
  assert.equal(typeof r, 'object');
  assert.ok(r.ok === false || r.ok === true, 'toujours une réponse, jamais un throw');
  if (r.ok === false) assert.ok((r.error || '').length > 5, 'le refus se lit');
});

test('premierNombre lit le premier nombre, format français compris', async () => {
  const { premierNombre } = await import('./mandataire-avis.js');
  assert.equal(premierNombre('85 m² dont une réserve de 25 m²'), 85);
  assert.equal(premierNombre('28 800 € HT HC'), 28800);
  assert.equal(premierNombre('490 000'), 490000);
  assert.equal(premierNombre('1.250.000'), 1250000);
  assert.equal(premierNombre('5,9 %'), 5.9);
  assert.equal(premierNombre(42), 42);
  assert.equal(premierNombre('aucun chiffre ici'), null);
  assert.equal(premierNombre(''), null);
});

test('chiffrer : occupé, la capitalisation fait la valeur (modèle Annecy) ; libre, la comparaison', async () => {
  const { chiffrer } = await import('./mandataire-avis.js');
  const occ = chiffrer({ occupe: true, loyer_annuel_hc: 28800, surface_utile: 85 }, { taux: 5.9, prix_m2: 5737 });
  assert.equal(occ.valeur, 490000, 'capitalisation 28 800 / 5,9 % arrondie');
  assert.equal(occ.prix_affiche, 514500, 'honoraires 5 % inclus');
  assert.ok(occ.bas <= occ.valeur && occ.valeur <= occ.haut, 'la fourchette encadre la valeur');
  assert.ok(Math.abs(occ.rendement - 5.9) < 0.2);
  const libre = chiffrer({ occupe: false, surface_utile: 100 }, { taux: 6, prix_m2: 2000 });
  assert.equal(libre.comparaison, 200000);
  assert.equal(libre.capitalisation, null, 'pas de loyer : pas de capitalisation');
  assert.ok(libre.bas <= libre.valeur && libre.valeur <= libre.haut);
  const rien = chiffrer({ occupe: false }, { taux: 6, prix_m2: null });
  assert.equal(rien, null, 'sans loyer ni surface x prix, pas de chiffre inventé');
});

test('zoneCouvre : villes nommées, départements entiers, jamais les zones vagues', async () => {
  const { zoneCouvre } = await import('./mandataire-agent.js');
  assert.equal(zoneCouvre('SUD (bordeaux-lyon)', { ville: 'Lyon' }), true);
  assert.equal(zoneCouvre('Saône-et-Loire', { ville: 'Mâcon', departement: 'Saône-et-Loire' }), true);
  assert.equal(zoneCouvre('Bretagne', { ville: 'Mâcon', departement: 'Saône-et-Loire', region: 'Bourgogne-Franche-Comté' }), false);
  assert.equal(zoneCouvre('toute la France', { ville: 'Mâcon' }), false, 'une zone vague ne matche rien');
});

test("enseigneNationale : l'enseigne propriétaire oui, le carrefour routier non", async () => {
  const { enseigneNationale, bailleurPublic } = await import('./mandataire-veille.js');
  assert.equal(enseigneNationale('Carrefour Property France'), true);
  assert.equal(enseigneNationale('SCI du Carrefour'), false, 'le carrefour de rues n\'est pas l\'enseigne');
  assert.equal(enseigneNationale('Société Générale'), true);
  assert.equal(enseigneNationale('SCI des Trois Tilleuls'), false);
  assert.equal(bailleurPublic('Ville de Mâcon'), true);
  assert.equal(bailleurPublic('SCI de la Villette'), false);
});

test('dansPolygone et chevauchement de secteurs : géométrie de base', async () => {
  const { dansPolygone, seChevauchent } = await import('./mandataire-espace.js');
  const carre = [[0, 0], [0, 10], [10, 10], [10, 0]];
  assert.equal(dansPolygone([5, 5], carre), true);
  assert.equal(dansPolygone([15, 5], carre), false);
  const loin = [[20, 20], [20, 30], [30, 30], [30, 20]];
  assert.equal(seChevauchent(carre, loin), false);
  const dedans = [[4, 4], [4, 6], [6, 6], [6, 4]];
  assert.equal(seChevauchent(carre, dedans), true);
});

test('page Compte : le mandataire tient ses mentions, jamais ses habilitations', async () => {
  const { compteMandataire, poserCompteMandataire, poserFicheMandataire } = await import('./mandataire-espace.js');
  const QUI = { email: 'compte@kpartners.fr', role: 'mandataire' };
  poserFicheMandataire(QUI.email, { rsac: '912 345 678', carte_t: 'CPI 7101' }, { email: 'jules.b@klocka.immo', role: 'admin' });
  const r = poserCompteMandataire(QUI, { telephone: '06 11 22 33 44', ville_signature: 'Mâcon', rsac: 'PIRATE', carte_t: 'PIRATE' });
  assert.equal(r.ok, true);
  assert.equal(r.modifiable.telephone, '06 11 22 33 44');
  assert.equal(r.modifiable.ville_signature, 'Mâcon');
  assert.equal(r.klocka.rsac, '912 345 678', 'le RSAC ne se change pas depuis le compte');
  assert.equal(r.klocka.carte_t, 'CPI 7101');
  assert.equal(poserCompteMandataire(QUI, { email_avis: 'pas-un-mail' }).ok, false, 'un e-mail illisible est refusé');
  assert.equal(compteMandataire({ email: 'autre@kpartners.fr' }).modifiable.telephone, null, 'chacun sa fiche');
});
