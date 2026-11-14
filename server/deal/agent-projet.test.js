// L'agent qui rentre le projet (13 nov. 2026, Jules) : la fiche relue remplit les cases vides, les dates du bail se
// déduisent, des photos entrent, et il dit ce qui lui manque. Rien ne part chez le modèle ni sur le réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-agent-projet-'));
const { Records } = await import('../db.js');
const A = await import('./agent-projet.js');
const { dateIsoDe } = await import('./projet.js');

const lu = (valeur, citation = null) => ({ absent: false, valeur, citation, confiance: 'haute' });
const FICHE = [
  'FICHE COMMERCIALE - MURS COMMERCIAUX OCCUPÉS',
  'Adresse : 12 rue de la République, 69002 Lyon',
  'Locataire en place : KFC (restauration rapide), enseigne nationale',
  'Bail commercial 3-6-9 signé le 23 avril 2024, échéance le 22 avril 2033',
  'Loyer annuel : 95 000 € HT HC',
  'Taxe foncière : 6 200 € par an, refacturée au locataire',
  'Surface : 180 m² (rez-de-chaussée commercial avec vitrine sur la rue)',
  'Prix de vente : 1 650 000 € FAI',
].join('\n');

function dossier(id, { rue = '12 rue de la République', fiche = FICHE } = {}) {
  return Records.create('Deal', {
    deal_id: id, nom: 'KFC Lyon', source: { type: 'texte', texte: fiche },
    lots: [{
      lot: {
        adresse: lu({ rue, code_postal: '69002', ville: 'Lyon' }),
        prix_fai: lu(1650000), loyer_annuel_ht_hc: lu(95000), surface_m2: lu(180),
        locataire_nom: lu('KFC'), locataire_activite: lu('restauration rapide'),
        bail_echeance: lu('22 avril 2033'), bail_type: lu('3-6-9'),
      },
      enrichissement: { commune: { nom: 'Lyon', departement: 'Rhône', region: 'Auvergne-Rhône-Alpes' } },
      simulateur: { prixBienFAI: 1650000, prixBienNegocie: 1650000, loyerInitialHTHC: 95000, surface: 180 },
    }],
  });
}

// La lecture du modèle, telle qu'il la rendrait pour la fiche ci-dessus.
const lecture = {
  champs: [
    { champ: 'bail_date_debut', valeur: '2024-04-23', citation: 'Bail commercial 3-6-9 signé le 23 avril 2024' },
    { champ: 'taxe_fonciere_an', valeur: '6200', citation: 'Taxe foncière : 6 200 € par an, refacturée au locataire' },
    { champ: 'sim_taxe_refacturable', valeur: 'oui', citation: 'refacturée au locataire' },
    { champ: 'profil_locataire', valeur: 'Enseigne nationale', citation: 'KFC (restauration rapide), enseigne nationale' },
    { champ: 'surface_detail', valeur: '180 m² en rez-de-chaussée avec vitrine', citation: 'Surface : 180 m² (rez-de-chaussée commercial avec vitrine sur la rue)' },
    // Déjà dans le projet : l'agent ne le réécrit pas.
    { champ: 'loyer_annuel_ht', valeur: '90000', citation: 'Loyer annuel : 90 000 €' },
  ],
  points_a_eclaircir: ['La fiche ne dit pas si le loyer est soumis à la TVA.'],
};
const outils = (extra = {}) => ({
  completer: async () => {},
  ville: async () => ({ ville_habitants_agglo: 1700000, ville_revenu_median: 24300 }),
  vente: async () => ({ annee: 2015, prix: 1200000 }),
  imageVille: async () => '/uploads/ville-lyon.jpg',
  lire: async () => lecture,
  photosVille: async () => ['/uploads/commerces/google-lyon-1.jpg', '/uploads/commerces/google-lyon-2.jpg', '/uploads/commerces/google-lyon-3.jpg', '/uploads/commerces/google-lyon-4.jpg'],
  secteur: async () => ({ residentiel: { nom: 'Lyon', prix_m2: 5028, evolution_1_an: { valeur: -1 }, evolution_5_ans: { valeur: -6 } }, rue: { nom: 'Rue de la République', loyer_m2_an: 304, rayon: '200m', du_marche: true, loyer_source: 'Equimmox' } }),
  ...extra,
});

test("les dates écrites en toutes lettres se lisent (« 22 avril 2033 », « 1er mars 2020 »)", () => {
  assert.equal(dateIsoDe('22 avril 2033'), '2033-04-22');
  assert.equal(dateIsoDe('1er mars 2020'), '2020-03-01');
  assert.equal(dateIsoDe('le 3 août 2029'), '2029-08-03');
  assert.equal(dateIsoDe('31/12/2030'), '2030-12-31');
  assert.equal(dateIsoDe('fin 2030'), null);
});

test('un bail 3-6-9 donne son début depuis l’échéance, et le locataire est en place depuis ce début', () => {
  const { changements } = A.deductions({ type_bail: '3-6-9', echeance_bail: '2033-04-22', bail_date_echeance: '2033-04-22', sim_loyer_initial_ht: 95000, sim_prix_bien_fai: 1650000 });
  const v = Object.fromEntries(changements.map((c) => [c.champ, c.valeur]));
  assert.equal(v.bail_date_debut, '2024-04-23');
  assert.equal(v.locataire_depuis, '2024-04-23');
  assert.equal(v.rendement_locatif, 5.76);
  assert.ok(changements.every((c) => c.source && c.raison), 'chaque déduction dit d’où elle vient');
});

test('une case modifiée à la main ne bouge pas, ni par la lecture ni par le calcul', () => {
  const projet = { type_bail: '3-6-9', echeance_bail: '2033-04-22', bail_date_echeance: '2033-04-22', champs_a_la_main: ['bail_date_debut', 'taxe_fonciere_an'] };
  assert.equal(A.deductions(projet).changements.find((c) => c.champ === 'bail_date_debut'), undefined);
  const { changements } = A.changementsDeLaLecture(projet, lecture);
  assert.equal(changements.find((c) => c.champ === 'bail_date_debut'), undefined);
  assert.equal(changements.find((c) => c.champ === 'taxe_fonciere_an'), undefined);
  assert.ok(changements.find((c) => c.champ === 'sim_taxe_refacturable'));
});

test("sans numéro dans l'adresse, l'agent demande l'adresse précise ; avec, il ne la demande pas", () => {
  assert.match(A.questionsPourFinir({ adresse_complete: 'rue de la République, 69002 Lyon' })[0], /adresse précise/);
  assert.ok(!A.questionsPourFinir({ adresse_complete: '12 rue de la République, 69002 Lyon' }).some((q) => /adresse/i.test(q)));
});

test('l’agent rentre le projet KFC : tout ce que la fiche dit, les dates du bail, les photos, et ce qui manque', async () => {
  dossier('KFC1');
  const r = A.lancerAgentProjet('KFC1', 0, { user: { email: 'nora@klocka.immo' }, outils: outils() });
  assert.equal(r.ok, true);
  await r.travail;
  const agent = Records.get('AgentProjet', r.agent.id);
  assert.equal(agent.etat, 'fini', agent.erreur || '');
  const p = Records.get('Project', agent.project_id);
  assert.equal(Records.findBy('Deal', 'deal_id', 'KFC1').projet_id, p.id);
  assert.equal(p.bail_date_debut, '2024-04-23');
  assert.equal(p.bail_date_echeance, '2033-04-22');
  assert.equal(p.echeance_bail, '2033-04-22');
  assert.equal(p.locataire_depuis, '2024-04-23');
  assert.equal(p.sim_loyer_initial_ht, 95000, 'le loyer de la fiche reste, la lecture ne le réécrit pas');
  assert.equal(p.taxe_fonciere_an, 6200);
  assert.equal(p.sim_taxe_fonciere, 6200);
  assert.equal(p.sim_taxe_refacturable, true);
  assert.equal(p.profil_locataire, 'Enseigne nationale');
  assert.equal(p.rendement_locatif, 5.76);
  assert.equal(p.sources_champs.bail_date_debut.source, 'Fiche du bien');
  assert.match(p.sources_champs.bail_date_debut.raison, /23 avril 2024/);
  assert.deepEqual(p.photos, ['/uploads/commerces/google-lyon-1.jpg', '/uploads/commerces/google-lyon-2.jpg', '/uploads/commerces/google-lyon-3.jpg'], 'trois photos Google de la ville, à la place de la couverture Wikipédia');
  const marche = agent.etapes.find((e) => /résidentiel/.test(e.texte));
  assert.ok(marche.lignes.some((l) => /5 028 €\/m², -1 % sur un an, -6 % sur cinq ans/.test(l)));
  assert.ok(marche.lignes.some((l) => /304 €\/m²\/an, celui de la partie Marché du dossier \(Rue de la République, 200m\)/.test(l)));
  // Ce qui manque : le point pas clair ; ni l'adresse (elle a son numéro), ni une pièce à réclamer (13 nov. 2026, Jules).
  assert.ok(agent.questions.some((q) => /TVA/.test(q)));
  assert.ok(!agent.questions.some((q) => /adresse|bail signé|déposer/i.test(q)));
  assert.match(p.questions_ouverture, /TVA/);
  assert.ok(agent.etapes.length >= 6 && agent.etapes.every((e) => e.etat !== 'en_cours'));
  assert.ok(agent.etapes.find((e) => /relis la fiche/.test(e.texte)).lignes.some((l) => /Début du bail : 23 avril 2024/.test(l)));
  // La carte de Nora le montre.
  const liste = A.agentsDe('nora@klocka.immo');
  assert.equal(liste[0].id, agent.id);
  assert.equal(liste[0].etat, 'fini');
});

test("une étape qui échoue (lecture, photos) est dite et n'empêche pas le projet", async () => {
  dossier('KFC2', { rue: 'rue de la République' });
  const r = A.lancerAgentProjet('KFC2', 0, { user: { email: 'nora@klocka.immo' }, outils: outils({ lire: async () => { throw new Error('modèle indisponible'); }, photosVille: async () => { throw new Error('Places Text Search a répondu 403'); } }) });
  await r.travail;
  const agent = Records.get('AgentProjet', r.agent.id);
  assert.equal(agent.etat, 'fini');
  assert.equal(agent.etapes.find((e) => /relis la fiche/.test(e.texte)).etat, 'echec');
  const p = Records.get('Project', agent.project_id);
  assert.equal(p.bail_date_debut, '2024-04-23', 'le calcul du 3-6-9 prend le relais');
  assert.match(agent.questions[0], /adresse précise/);
  assert.deepEqual(p.photos, ['/uploads/ville-lyon.jpg'], 'Google suspendu : la couverture Wikipédia reste seule');
  assert.ok(agent.etapes.find((e) => /photos de la ville/.test(e.texte)).lignes.some((l) => /suspendu/.test(l)));
});

test('un dossier qui a déjà son projet ne relance pas d’agent', () => {
  const r = A.lancerAgentProjet('KFC1', 0, { user: { email: 'nora@klocka.immo' }, outils: outils() });
  assert.equal(r.ok, false);
  assert.ok(r.project_id);
});

test('une carte fermée ne revient pas ; un travail sans nouvelles est dit interrompu', () => {
  const [a] = A.agentsDe('nora@klocka.immo');
  A.fermerAgent(a.id, 'nora@klocka.immo');
  assert.ok(!A.agentsDe('nora@klocka.immo').some((x) => x.id === a.id));
  const vieux = A.agentAffiche({ id: 'x', etat: 'en_cours', updated_date: new Date(Date.now() - 10 * 60000).toISOString() }, { vivant: false });
  assert.equal(vieux.etat, 'erreur');
  assert.match(vieux.erreur, /Interrompu/);
});

test("l'agent lit toutes les parties du dossier : la Pré-analyse saisie à la main, l'Analyse, le Marché", () => {
  const lot = { lot: { loyer_annuel_ht_hc: { absent: false, valeur: 98000, citation: 'Saisi à la main.', saisi_a_la_main: true }, surface_m2: lu(180, 'Surface : 180 m²') } };
  const analyse = { grilles: [{ id: 'bail', titre: 'Bail', lignes: [{ libelle: 'Dépôt de garantie', valeur: '23 750 €', statut: 'verifie' }] }] };
  const marche = [{ outil: 'locataire', resultat: { conclusion: 'Aucune procédure collective', points: [{ libelle: 'Avis clients', resultat: '4,1 sur 5 (1 200 avis)' }] } }];
  const t = A.texteDuDossier({ source: { texte: FICHE } }, lot, analyse, { marche });
  assert.match(t, /FICHE COMMERCIALE/);
  assert.match(t, /Loyer annuel HT HC : 98000 \(saisi à la main par l’équipe : fait foi\)/);
  assert.match(t, /Bail · Dépôt de garantie : 23 750 € \(vérifié par l’équipe\)/);
  assert.match(t, /locataire : Aucune procédure collective/);
  assert.match(t, /Avis clients : 4,1 sur 5/);
  assert.ok(!A.questionsPourFinir({ adresse_complete: '12 rue X, Lyon', statut_bail: 'en_cours' }).some((q) => /bail signé/.test(q)));
});

test('ce qui ne tient pas debout est dit : dates à l’envers, 3-6-9 de six ans, loyer mensuel pris pour annuel, loyer loin du Marché', () => {
  const ok = A.incoherences({ type_bail: '3-6-9', bail_date_debut: '2024-04-23', bail_date_echeance: '2033-04-22', sim_loyer_initial_ht: 95000, sim_prix_bien_fai: 1650000, sim_surface: 180 }, { loyerAutour: 304, aujourdHui: '2026-11-13' });
  assert.deepEqual(ok, []);
  assert.match(A.incoherences({ bail_date_debut: '2034-01-01', bail_date_echeance: '2033-04-22' }, { aujourdHui: '2026-11-13' })[0], /après son échéance/);
  assert.match(A.incoherences({ type_bail: '3-6-9', bail_date_debut: '2027-04-23', bail_date_echeance: '2033-04-22' }, { aujourdHui: '2026-11-13' })[0], /6 ans entre/);
  assert.match(A.incoherences({ sim_loyer_initial_ht: 7900, sim_prix_bien_fai: 1650000 }).join(' '), /loyer mensuel pris pour annuel/);
  assert.match(A.incoherences({ sim_loyer_initial_ht: 95000, sim_surface: 18, sim_prix_bien_fai: 1650000 }, { loyerAutour: 304 }).join(' '), /fois plus/);
  assert.match(A.incoherences({ sim_loyer_initial_ht: 95000, sim_prix_bien_fai: 1650000 }, { loyerQuittances: 84000 }).join(' '), /quittances/);
  assert.match(A.incoherences({ bail_date_echeance: '2025-01-01', statut_bail: 'en_cours' }, { aujourdHui: '2026-11-13' })[0], /est passée/);
});

test('les points à éclaircir sont de vraies contradictions, deux au plus', () => {
  assert.deepEqual(A.pointsUtiles([
    'Le bail 3-6-9 aurait une échéance au 22 avril 2033, soit 9 ans, ce qui est cohérent, mais le dossier ne précise pas la durée ferme.',
    "La fiche dit primeur, mais l'équipe a saisi traiteur : lequel est juste ?",
    'La rentabilité est annoncée à 8,63 % dans le titre et à 9,76 % dans le corps : laquelle retenir ?',
    'Le prix est net vendeur sans précision sur les frais.',
    'Troisième contradiction',
  ]), ["La fiche dit primeur, mais l'équipe a saisi traiteur : lequel est juste ?", 'La rentabilité est annoncée à 8,63 % dans le titre et à 9,76 % dans le corps : laquelle retenir ?']);
});

test("Equimmox fait attendre : le prix du résidentiel vient du Figaro seul, posé dans les cases du projet", async () => {
  dossier('KFC3', { rue: '14 rue de la République' });
  const r = A.lancerAgentProjet('KFC3', 0, { user: { email: 'nora@klocka.immo' }, outils: outils({
    secteur: async () => ({ en_cours: true }),
    residentiel: async () => ({ echelle: 'commune', nom: 'Lyon', prix_m2: 5028, evolution_1_an: { valeur: -1 }, evolution_5_ans: { valeur: -6 }, lien: 'https://immobilier.lefigaro.fr/prix-immobilier/lyon/ville-69123' }),
  }) });
  await r.travail;
  const agent = Records.get('AgentProjet', r.agent.id);
  const p = Records.get('Project', agent.project_id);
  assert.equal(p.marche_rue_prix_m2, 5028);
  assert.equal(p.marche_evolution_1an, -1);
  assert.equal(p.marche_evolution_5ans, -6);
  assert.equal(p.sources_champs.marche_rue_prix_m2.source, 'Le Figaro Immobilier');
  const marche = agent.etapes.find((e) => /résidentiel/.test(e.texte));
  assert.ok(marche.lignes.some((l) => /5 028 €\/m²/.test(l)));
  assert.ok(marche.lignes.some((l) => /arrive encore/.test(l)));
});

test("le locataire, l'activité et le prix que la Pré-analyse n'a pas lus viennent de la fiche ; le prix fait l'apport", () => {
  const projet = { nom_locataire: '', activite_locataire: '', prix_acquisition: 0, sim_prix_bien_fai: 0, sim_apport: 0 };
  const { changements } = A.changementsDeLaLecture(projet, { champs: [
    { champ: 'nom_locataire', valeur: 'CAFPI', citation: 'Locataire : CAFPI' },
    { champ: 'activite_locataire', valeur: 'Courtage en crédit immobilier', citation: 'courtier en crédit' },
    { champ: 'prix_acquisition', valeur: '420000', citation: 'Prix : 420 000 € FAI' },
  ] });
  const v = Object.fromEntries(changements.map((c) => [c.champ, c.valeur]));
  assert.equal(v.nom_locataire, 'CAFPI');
  assert.equal(v.sim_prix_bien_fai, 420000);
  assert.equal(v.sim_prix_bien_negocie, 420000);
  assert.equal(v.sim_apport, 63000);
});

test("la taxe foncière « refacturée » n'est dite que si la fiche le dit, pas d'après le réglage du simulateur", () => {
  const base = { adresse_complete: '3 rue X, Lyon', statut_bail: 'en_cours', sim_taxe_refacturable: true };
  assert.ok(A.questionsPourFinir(base).some((q) => q === 'Le montant de la taxe foncière, et si elle est refacturée au locataire'));
  assert.ok(A.questionsPourFinir({ ...base, sources_champs: { sim_taxe_refacturable: { source: 'Fiche du bien' } } }).some((q) => /la fiche dit seulement/.test(q)));
});
