import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Le matin importe la base : une base jetable, jamais celle du poste.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-biens-'));
import { ETAPES_BIEN, bienDe, bienDuProprietaire, enAttenteDuProprietaire, etapeDuBien, regrouperBiens, statutDuBien } from '../src/lib/biens-mandataire.js';

const jeu = () => ({
  estimations: [{ id: 'e1', bien: 'Boulangerie Masséna', statut: 'envoye', proprietaire_id: 'p1', cree_le: '2026-10-01' }, { id: 'e2', bien: 'Cordonnerie', statut: 'brouillon', cree_le: '2026-10-02' }],
  mandats: [{ id: 'm1', bien: 'Boulangerie Masséna', statut: 'signe', estimation_id: 'e1', prix: 450000, cree_le: '2026-10-05' }, { id: 'm2', bien: 'Tabac', statut: 'demande_envoyee', cree_le: '2026-10-06' }],
  dossiers: [{ id: 'd1', bien: 'Boulangerie Masséna', statut: 'go', mandat: { id: 'm1' }, estimation: { id: 'e1' }, activite: '2026-10-10' }],
  marches: [{ id: 'k1', dossier_id: 'd1', bien: 'Boulangerie Masséna', statut: 'offre', offres: [{ id: 'o1' }], cree_le: '2026-10-12' }],
  proprietaires: [
    { id: 'p1', commerce: 'Boulangerie Masséna', ville: 'Nice', statut: 'mandat_signe' },
    { id: 'p2', commerce: 'Primeur', ville: 'Nice', statut: 'rdv_pris' },
    { id: 'p3', commerce: 'Opticien', ville: 'Nice', statut: 'a_appeler' },
    { id: 'p4', commerce: 'Fleuriste', ville: 'Nice', statut: 'pas_vendeur' },
  ],
});

test('les biens du mandataire : un objet rangé une fois, chaque bien relié de l’estimation à la mise en marché', () => {
  const biens = regrouperBiens(jeu());
  // Le propriétaire contacté sans estimation est un bien ; à appeler ou pas vendeur, il n'est pas dans les cartes.
  assert.equal(biens.length, 4);
  const b = bienDe(biens, 'dossier:d1');
  assert.equal(b.cle, 'proprietaire:p1');
  assert.deepEqual([b.proprietaire.id, b.estimation.id, b.mandat.id, b.dossier.id, b.marche.id], ['p1', 'e1', 'm1', 'd1', 'k1']);
  // Sept étapes : la mise en marché présentée (offre reçue), il reste Offres puis Vente.
  assert.equal(ETAPES_BIEN[b.etape - 1].id, 'offre');
  assert.equal(b.statut, 'Offre reçue');
  assert.deepEqual([...b.faites].sort(), ['estimation', 'mandat', 'marche', 'previsite']);
  assert.equal(ETAPES_BIEN[bienDe(biens, 'mandat:m2').etape - 1].id, 'mandat', 'un mandat demandé suppose l’avis accepté');
  assert.equal(ETAPES_BIEN[bienDe(biens, 'estimation:e2').etape - 1].id, 'estimation');
  assert.equal(bienDe(biens, 'estimation:e2').statut, 'Avis en cours');
  const rdv = bienDe(biens, 'proprietaire:p2');
  assert.equal(ETAPES_BIEN[rdv.etape - 1].id, 'previsite', 'au rendez-vous fixé, on prépare la visite');
  assert.equal(rdv.statut, 'Rendez-vous fixé');
  assert.equal(bienDe(biens, 'proprietaire:p3'), null, 'à contacter : pas dans Biens');
  assert.equal(bienDuProprietaire(jeu().proprietaires, 'proprietaire:p3').statut, 'À contacter');
  assert.equal(bienDuProprietaire(jeu().proprietaires, 'estimation:e1'), null);
  assert.deepEqual([...bienDe(biens, 'estimation:e2').faites].sort(), ['previsite'], 'un avis commencé suppose la visite faite');
  assert.equal(bienDe(biens, 'inconnu:x'), null);
});

test('l’étape d’un bien : le dernier objet qui existe la dit, la vente dès le compromis', () => {
  assert.equal(etapeDuBien({}), 1);
  assert.equal(etapeDuBien({ estimation: { statut: 'brouillon' } }), 2);
  assert.equal(etapeDuBien({ marche: { statut: 'preparation' } }), 4, 'un ancien bien né en mise en marché n’est pas renvoyé au rendez-vous');
  assert.equal(etapeDuBien({ marche: { statut: 'compromis' } }), 6);
  // Les mots d'avant le 26 oct. 2026 : la visite faite mène à l'avis, le prix d'accord au mandat.
  assert.equal(etapeDuBien({ proprietaire: { statut: 'rdv_pris', biens: { validee: 'visite' } } }), 2, 'Visité (ancien) : l’avis de valeur');
  assert.equal(etapeDuBien({ proprietaire: { statut: 'rdv_pris', biens: { validee: 'rdv' } } }), 1, 'rendez-vous pris : la pré-visite');
  assert.equal(etapeDuBien({ proprietaire: { statut: 'rdv_pris', biens: { validee: 'prix_accord' } } }), 3, 'Prix d’accord (ancien) : le mandat');
  // L'avis envoyé attend le propriétaire ; son accord sur un prix fait l'étape.
  const envoye = { proprietaire: { id: 'x', statut: 'rdv_pris', biens: { validee: 'rdv' } }, estimation: { statut: 'envoye' } };
  assert.equal(etapeDuBien(envoye), 2);
  assert.equal(statutDuBien(envoye), 'Estimation envoyée');
  assert.equal(enAttenteDuProprietaire(envoye), true);
  const accepte = { ...envoye, proprietaire: { ...envoye.proprietaire, biens: { validee: 'rdv', prix_accord: 680000 } } };
  assert.equal(etapeDuBien(accepte), 3);
  assert.equal(enAttenteDuProprietaire(accepte), false);
  assert.equal(etapeDuBien({ estimation: { statut: 'envoye' } }), 3, 'un avis sans fiche, envoyé, est fait');
});

test('le matin : les dues d’abord avec un signal, dix au plus, l’argument et le moyen de contact', async () => {
  const { aContacter, argumentDe, contactDe, phraseDuMatin, aLancer, ARGUMENT_PAR_DEFAUT } = await import('./mandataire-matin.js');
  const hier = '2026-10-23T09:00:00.000Z', demain = '2026-10-30T09:00:00.000Z';
  const fiches = [
    { id: 'a', statut: 'a_appeler', commerce: 'Tabac', ville: 'Nice', telephone: '06 11 22 33 44', prochaine_action_le: hier },
    { id: 'b', statut: 'a_appeler', commerce: 'Cordonnier', ville: 'Nice', adresse: '3 rue Pastorelli', prochaine_action_le: hier, commerce_simple_id: 'c1' },
    { id: 'c', statut: 'a_appeler', commerce: 'Plus tard', prochaine_action_le: demain },
    { id: 'd', statut: 'contacte', commerce: 'Déjà joint', prochaine_action_le: hier },
  ];
  const drapeaux = (c) => (c.id === 'c1' ? [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus', source: 'Registre' }] : []);
  const { liste, reste } = aContacter(fiches, { commerceDe: (p) => (p.commerce_simple_id ? { id: p.commerce_simple_id } : null), drapeaux, aujourdhui: new Date('2026-10-24T08:00:00.000Z') });
  assert.deepEqual(liste.map((x) => x.id), ['b', 'a'], 'le signal passe devant, demain et déjà joint restent dehors');
  assert.equal(reste, 0);
  assert.equal(liste[0].signal, 'Gérant de 70 ans et plus');
  assert.equal(liste[0].contact.moyen, 'passage');
  assert.equal(liste[1].argument, ARGUMENT_PAR_DEFAUT);
  assert.notEqual(argumentDe([{ cle: 'fonds_cede' }]), ARGUMENT_PAR_DEFAUT);
  assert.equal(contactDe({ telephone: '06', email: 'x@y.fr' }).moyen, 'telephone');
  const beaucoup = Array.from({ length: 14 }, (_, i) => ({ id: `x${i}`, statut: 'a_appeler', prochaine_action_le: hier }));
  assert.equal(aContacter(beaucoup, { aujourdhui: new Date('2026-10-24T08:00:00.000Z') }).reste, 4);
  assert.equal(phraseDuMatin({ a_contacter: [1, 2], a_contacter_reste: 1, relances: [1], rdv: [1] }), '3 propriétaires à contacter, 1 relance et 1 rendez-vous');
  assert.equal(phraseDuMatin({}), null, 'rien à faire, pas de notification');
  assert.equal(aLancer({ maintenant: new Date('2026-10-26T06:00:00.000Z') }), false, 'avant 8 h à Paris');
  assert.equal(aLancer({ maintenant: new Date('2026-10-26T08:00:00.000Z') }), true, 'lundi 9 h à Paris');
  assert.equal(aLancer({ maintenant: new Date('2026-10-25T09:00:00.000Z') }), false, 'dimanche');
  assert.equal(aLancer({ maintenant: new Date('2026-10-26T08:00:00.000Z'), dernier: '2026-10-26' }), false, 'une fois par jour');
});

test('prospecter pour un client : signaux, propriétaire et exploitant connus, budget au rendement voulu, les plus forts d’abord', async () => {
  const { pointsPourClient, prixPourClient, forceDe } = await import('./mandataire-prospecter.js');
  const est = (loyer) => ({ loyer_an: { basse: loyer, haute: loyer }, prix: { basse: loyer / 0.075, moyenne: loyer / 0.065, haute: loyer / 0.055 } });
  const c = (id, extra = {}) => ({ id, lat: 45.76, lon: 4.83, activite: 'Boulangerie', exploitant: { nom: 'Exploitant' }, proprietaire: { nom: 'SCI Murs' }, drapeaux: [{ cle: 'detention_30', texte: 'Propriétaire créé il y a 40 ans' }], estimation: est(31500), ...extra });
  const client = { budget_max: 500000, budget_min: 300000, rendement_min: 7, remarque: 'Pas de boîte de nuit.' };
  // 31 500 € de loyer à 7 % : 450 000 €, dans le budget ; au taux de Lyon (6,5 %), il aurait coûté 485 000 €.
  assert.equal(prixPourClient(est(31500), client).moyenne, 450000);
  assert.equal(prixPourClient({ prix: { moyenne: 1 } }, client), null, 'un rendement exigé sans loyer connu : pas de prix');
  const liste = [
    c('fort', { drapeaux: [{ cle: 'fonds_cede', texte: 'Fonds cédé' }, { cle: 'gerant_age', texte: 'Gérant de 70 ans' }] }),
    c('simple'),
    c('sans-signal', { drapeaux: [] }),
    c('sans-proprio', { proprietaire: null }),
    c('sans-exploitant', { exploitant: {} }),
    c('trop-cher', { estimation: est(90000) }),
    c('nuit', { activite: 'Discothèque' }),
    c('sans-prix', { estimation: null }),
  ];
  const p = pointsPourClient(liste, client);
  // Le prix ne filtre plus (pas assez fiable) : il range. Un mur sans prix reste, « prix à vérifier » ; un mur trop cher
  // reste aussi, après ceux dans son budget.
  assert.deepEqual(p.map((x) => x.id), ['fort', 'simple', 'trop-cher', 'sans-prix']);
  assert.equal(p[1].dans_budget, true);
  assert.equal(p[2].dans_budget, false);
  assert.equal(p[3].prix_a_verifier, true);
  assert.ok(forceDe([{ cle: 'fonds_cede' }]) > forceDe([{ cle: 'detention_22' }]));
  assert.equal(pointsPourClient(Array.from({ length: 80 }, (_, i) => c(`x${i}`)), client).length, 50, 'une cinquantaine par ville, pas des milliers');
});

test('les clients d’essai se posent une fois, et un client supprimé ne revient pas', async () => {
  const { Records } = await import('./db.js');
  const { semerClientsEssai, CLIENTS_ESSAI } = await import('./mandataire-demandes-essai.js');
  assert.equal(semerClientsEssai(), CLIENTS_ESSAI.length);
  assert.equal(semerClientsEssai(), 0);
  const un = Records.list('DemandeClient').find((d) => d.cle_essai === 'paris-bordeaux');
  Records.delete('DemandeClient', un.id);
  assert.equal(semerClientsEssai(), 0);
  const lyon = Records.list('DemandeClient').find((d) => d.cle_essai === 'lyon-macon-500');
  assert.deepEqual(lyon.zones, ['Lyon', 'Mâcon']);
  const { exclusionsDe } = await import('../src/lib/clients-commerces.js');
  assert.deepEqual(exclusionsDe(lyon).map((f) => f.cle), ['nuit'], 'pas de boîte de nuit n’écarte pas les bars');
});

test('les villes d’un secteur : les Villes Klocka du contour et les communes cochées, créées avec leur centre', async () => {
  const { Records } = await import('./db.js');
  const { assurerVille, etatVille } = await import('./villes-secteur.js');
  const lire = async () => ({ ok: true, json: async () => ({ nom: 'Mâcon', code: '71270', centre: { type: 'Point', coordinates: [4.83, 46.31] }, codesPostaux: ['71000'] }) });
  const v = await assurerVille({ nom: 'Mâcon', code: '71270' }, { lire });
  assert.deepEqual(v.centre, { lat: 46.31, lon: 4.83 });
  assert.equal(v.code_insee, '71270');
  assert.equal(v.code_postal, '71000');
  const encore = await assurerVille({ nom: 'Macon', code: '71270' }, { lire: async () => { throw new Error('pas d’appel'); } });
  assert.equal(encore.id, v.id, 'retrouvée par son code, sans doublon ni appel');
  assert.equal(etatVille(Records.get('Ville', v.id)), 'a_lire', 'sans commerces, elle reste à lire');
});

test('les villes d’un secteur : l’équipe choisit parmi les communes du contour, et la lecture suit ce choix', async () => {
  const { Records } = await import('./db.js');
  const VS = await import('./villes-secteur.js');
  const s = Records.create('SecteurMandataire', { nom: 'Mâconnais', mandataire_email: 'choix@kpartners.fr', unites: [{ niveau: 'commune', code: '71270', nom: 'Mâcon' }, { niveau: 'commune', code: '71105', nom: 'Charnay-lès-Mâcon' }], polygones: [] });
  const r = await VS.choisirVilles(s.id, ['71270', '69123'], { email: 'jules.b@klocka.immo' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.villes.map((v) => v.nom), ['Mâcon'], 'Lyon n’est pas dans le contour : écartée');
  const lu = Records.get('SecteurMandataire', s.id);
  assert.deepEqual((await VS.communesALire(lu)).map((c) => c.code), ['71270']);
  const choix = await VS.communesDuChoix(lu);
  assert.deepEqual(choix.map((c) => [c.nom, c.choisie]), [['Mâcon', true], ['Charnay-lès-Mâcon', false]]);
  assert.match(lu.historique.at(-1).action, /villes : Mâcon/);
});

test('pourquoi un client n’a pas de mur, et pourquoi un mur est une bonne cible', async () => {
  const { pourquoiVide } = await import('./mandataire-prospecter.js');
  const lyon = [{ nom: 'Lyon' }];
  assert.match(pourquoiVide({ commerces: 0 }, {}, lyon), /pas encore lus/);
  assert.match(pourquoiVide({ commerces: 10, signal: 0 }, {}, lyon), /signal de vente/);
  assert.match(pourquoiVide({ commerces: 10, signal: 4, connus: 0 }, {}, lyon), /propriétaire ou leur exploitant/);
  assert.match(pourquoiVide({ commerces: 10, signal: 4, connus: 3, prix: 2, criteres: 0 }, {}, lyon), /critères/);
  assert.match(pourquoiVide({}, {}, []), /aucune des villes choisies/);
  const { pourquoiCible } = await import('../src/lib/clients-commerces.js');
  assert.match(pourquoiCible({ signaux: ['Fonds cédé'], lien: 'tiers', proprietaire_type: 'sci' }, {}), /prix à vérifier\.$/);
  assert.equal(pourquoiCible({ signaux: ['Gérant de 70 ans et plus (le registre ne donne que des tranches)'], lien: 'exploitant_certain', prix: { moyenne: 450000, au_rendement: 7 } }, { budget_max: 500000 }),
    "Gérant de 70 ans et plus, l'exploitant possède les murs, environ 450 k€ pour 7 %, dans son budget (jusqu'à 500 k€).");
});

test('les propriétaires se cherchent trois à la fois, jamais plus, et tous les commerces y passent', async () => {
  const { Records } = await import('./db.js');
  const { tourDeFond, PARALLELE_PROPRIETAIRES } = await import('./off-market/simple.js');
  const v = Records.create('Ville', { nom: 'Parallèle', centre: { lat: 45.7, lon: 4.8 } });
  for (let i = 0; i < 10; i += 1) Records.create('CommerceSimple', { ville_id: v.id, siret: `9${i}`, nom: `C${i}`, adresse: `${i} rue Test`, lat: 45.7, lon: 4.8, etat_recherche: 'a_faire' });
  let enCours = 0, maxi = 0;
  const resoudre = async (id) => { enCours += 1; maxi = Math.max(maxi, enCours); await new Promise((r) => setTimeout(r, 20)); Records.update('CommerceSimple', id, { etat_recherche: 'fait' }); enCours -= 1; };
  const reste = await tourDeFond(v.id, { resoudre, max: 10 });
  assert.equal(reste, 0);
  assert.equal(maxi, PARALLELE_PROPRIETAIRES);
});

test('la fiche très courte : exploitant et depuis quand, murs (SCI, gérant, âge), signal, accroche', async () => {
  const { ficheCourte } = await import('./mandataire-matin.js');
  const commerce = { lien: 'tiers', depuis: '2008-03-01', exploitant: { nom: 'BOULANGERIE DU PONT' }, proprietaire: { nom: 'SCI LES TILLEULS', forme: 'SCI', gerants: [{ nom: 'Jean Martin', tranche_age: '70+' }] } };
  const drapeaux = () => [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus (le registre ne donne que des tranches)' }];
  const f = ficheCourte({ p: { commerce: 'Boulangerie du Pont' }, commerce, drapeaux });
  assert.equal(f.exploitant, 'BOULANGERIE DU PONT');
  assert.equal(f.depuis, 2008);
  assert.equal(f.proprietaire, 'SCI LES TILLEULS');
  assert.deepEqual(f.gerant, { nom: 'Jean Martin', age: '70 ans et plus' });
  assert.equal(f.signal, 'Gérant de 70 ans et plus');
  assert.match(f.accroche, /bail continue/);
  const occupant = ficheCourte({ commerce: { ...commerce, lien: 'exploitant_certain' }, drapeaux: () => [] });
  assert.equal(occupant.proprietaire, "L'exploitant lui-même");
  assert.equal(occupant.gerant, null);
});

test('la fiche : à qui agit d’abord, la dictée propose puis applique, le rendez-vous la passe dans Biens', async () => {
  const { Records } = await import('./db.js');
  const F = await import('./fiche-mandataire.js');
  const A = { email: 'fiche-a@kpartners.fr', role: 'mandataire' };
  const B = { email: 'fiche-b@kpartners.fr', role: 'mandataire' };
  const c = Records.create('CommerceSimple', { nom: 'TABAC DU PORT', ville: 'Nice', adresse: '3 quai Papacino', lien: 'tiers', proprietaire: { nom: 'SCI PORT', forme: 'SCI' }, exploitant: { nom: 'TABAC DU PORT' }, drapeaux: [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus' }] });
  const a = await F.ficheDuCommerce(c.id, A);
  assert.equal(a.ok, true);
  assert.equal((await F.ficheDuCommerce(c.id, B)).ok, false, 'un autre mandataire ne peut pas la prendre');
  assert.equal((await F.ficheDuCommerce(c.id, A)).deja, true);
  const id = a.proprietaire.id;
  // Haka propose, rien n'est écrit.
  const llm = async () => ({ compris: 'Il est intéressé.', issue: 'rdv', rdv_quand: null, infos: [{ champ: 'telephone', valeur: '06 12 34 56 78', a_confirmer: true }], tache: { quoi: 'Rappeler M. Bernard', quand: '2026-10-27' }, note: 'Intéressé, rendez-vous à caler.' });
  const lu = await F.lireDictee(id, { texte: 'Il est intéressé, son voisin m’a donné le 06 12 34 56 78' }, A, { llm });
  assert.equal(lu.ok, true);
  assert.equal(lu.proposition.issue, 'rdv');
  assert.equal(Records.get('ProprietaireMandataire', id).statut, 'a_appeler', 'rien écrit avant confirmation');
  // Confirmé : infos (à confirmer, d'un tiers), rendez-vous → Biens, tâche.
  const ap = await F.appliquerDictee(id, lu.proposition, A);
  assert.equal(ap.ok, true);
  const p = Records.get('ProprietaireMandataire', id);
  assert.equal(p.statut, 'rdv_pris');
  assert.equal(F.dansBiens(p), true);
  assert.equal(p.telephone, '06 12 34 56 78');
  assert.equal(p.a_confirmer.telephone, true);
  assert.equal(p.prochaine_action, 'Rappeler M. Bernard');
  assert.ok(Records.list('Rappel').some((r) => r.proprietaire_id === id && r.quoi === 'Rappeler M. Bernard'));
  // Dans Biens : une étape validée, puis la pause et sa relance.
  assert.equal(F.validerEtape(id, 'visite', A).ok, true);
  const vue = await F.fiche(id, A);
  assert.equal(vue.fiche.biens.en_cours, 'estimation');
  assert.match(vue.fiche.historique[0].texte, /Étape validée : Visite/);
  const pause = await F.mettreEnPause(id, {}, A);
  assert.equal(pause.ok, true);
  assert.ok(Records.get('ProprietaireMandataire', id).biens.pause.argument);
  assert.equal(F.reprendre(id, A).ok, true);
  assert.equal(Records.get('ProprietaireMandataire', id).biens.pause, null);
  assert.equal((await F.fiche(id, B)).ok, false, 'la fiche d’un autre reste fermée');
  // Modifiée à la main : les corrections passent devant les registres, un numéro saisi n'est plus à confirmer.
  const E = await import('./mandataire-espace.js');
  assert.equal(E.modifierProprietaire(id, { murs: 'SCI DU QUAI', gerant: 'Paul Bernard', telephone: '06 00 00 00 01' }, A).ok, true);
  const v2 = (await F.fiche(id, A)).fiche;
  assert.equal(v2.murs.proprietaire, 'SCI DU QUAI');
  assert.equal(v2.murs.gerant.nom, 'Paul Bernard');
  assert.equal(v2.contact.telephone, '06 00 00 00 01');
  assert.equal(v2.contact.a_confirmer.telephone, undefined);
  assert.equal('accroche' in v2, false, 'plus d’accroche dans la fiche');
  E.modifierProprietaire(id, { murs: '' }, A);
  assert.equal((await F.fiche(id, A)).fiche.murs.proprietaire, 'SCI PORT', 'vide, la lecture des registres revient');
  assert.equal(E.modifierProprietaire(id, { murs: 'X' }, B).ok, false);
});

test('les signaux se disent en français : « Société propriétaire créée il y a 43 ans »', async () => {
  const { drapeauxDe, texteDrapeau } = await import('./off-market/simple.js');
  const d = drapeauxDe({ proprietaire: { nom: 'SCI X', creation: '1983-09-02' }, exploitant: {}, evenements: [] }, { maintenantMs: Date.parse('2026-10-24') });
  assert.equal(d[0].texte, 'Société propriétaire créée il y a 43 ans');
  assert.equal(texteDrapeau('Propriétaire créé il y a 43 ans'), 'Société propriétaire créée il y a 43 ans', 'un signal enregistré avant la correction se relit bien');
  assert.equal(texteDrapeau('Fonds cédé en 2025-08'), 'Fonds cédé en 2025-08');
});

test('le détail de chaque rangée de la fiche : société, SIREN, siège, gérants, sources', async () => {
  const F = await import('./fiche-mandataire.js');
  const d = F.detailsDe({
    p: {},
    commerce: {
      depuis: '2008-01-01', activite: 'Pharmacie', lien_motif: 'société distincte',
      exploitant: { nom: 'PHARMACIE DU PORT', forme: 'SELARL', siren: '552120222', creation: '2008-03-01', source: 'Annuaire des entreprises', derniers_comptes: { ca: 2400000, resultat_net: 180000 } },
      proprietaire: { nom: 'SCI DU PORT', forme: 'SCI', siren: '390759603', parcelle: '06088000AB0012', source: 'DGFiP · locaux des personnes morales', gerants: [{ nom: 'PAUL BERNARD', qualite: 'Gérant', tranche_age: '70+' }, { nom: 'KPMG', personne_morale: true }, { nom: 'ANNE BERNARD', qualite: 'Associée', tranche_age: '50-70' }] },
    },
    signaux: [{ texte: 'Gérant de 70 ans et plus', source: 'Registre des entreprises', date: null }],
  });
  assert.ok(d.exploitant.includes('SIREN 552 120 222'));
  assert.ok(d.exploitant.some((l) => /Chiffre d'affaires : 2,4 M€/.test(l)));
  assert.ok(d.murs.includes('Parcelle cadastrale 06088000AB0012'));
  assert.ok(d.murs.includes('Source : DGFiP · locaux des personnes morales'));
  assert.deepEqual(d.gerant, ['PAUL BERNARD · Gérant · 70 ans et plus', 'ANNE BERNARD · Associée · 50 à 70 ans'], 'les personnes, pas les commissaires aux comptes');
  assert.equal(d.signaux.length, 1);
  assert.deepEqual(F.detailsDe({}).exploitant, [], 'rien à dire : pas de flèche');
});

test('les clients déjà prospectés se retiennent par mandataire, avec la date', async () => {
  const P = await import('./mandataire-prospecter.js');
  const A = { email: 'prospecte-a@kpartners.fr' };
  assert.deepEqual(P.prospectes(A), {});
  P.noterProspecte(A, 'client-1', 7);
  assert.equal(P.prospectes(A)['client-1'].n, 7);
  assert.ok(Date.parse(P.prospectes(A)['client-1'].le));
  assert.deepEqual(P.prospectes({ email: 'autre@kpartners.fr' }), {}, 'chacun les siens');
});

test('revoir les murs d’un client ne refait pas sa prospection : seul le geste la date', async () => {
  const src = fs.readFileSync(new URL('./mandataire-prospecter.js', import.meta.url), 'utf8');
  assert.match(src, /if \(noter\) noterProspecte/);
  const ecran = fs.readFileSync(new URL('../src/components/mandataire/ProspecterClients.jsx', import.meta.url), 'utf8');
  assert.match(ecran, /\?prospecter=1/);
});

test('tous les commerces du secteur : la même forme qu’un point pour un client, sans budget', async () => {
  const { pointDuSecteur } = await import('./mandataire-prospecter.js');
  const p = pointDuSecteur(
    { enseigne: 'TABAC DU PORT', exploitant: { nom: 'SARL TABAC' }, drapeaux: [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus' }], estimation: { prix: { moyenne: 400000 } } },
    { id: 'c1', lat: 1, lon: 2 }, 'Nice',
  );
  assert.equal(p.titre, 'TABAC DU PORT');
  assert.equal(p.force, 2);
  assert.equal(p.dans_budget, null);
  assert.equal(p.prix_a_verifier, false);
  assert.equal(p.ville, 'Nice');
  assert.equal(pointDuSecteur({ nom: 'X', exploitant: {} }, { id: 'c2' }, 'Nice').prix_a_verifier, true);
});

test('l’aperçu d’un commerce sans fiche : la même fiche, rien n’est créé, refusée si un autre la tient', async () => {
  const { Records } = await import('./db.js');
  const F = await import('./fiche-mandataire.js');
  const A = { email: 'apercu-a@kpartners.fr', role: 'mandataire' };
  const B = { email: 'apercu-b@kpartners.fr', role: 'mandataire' };
  const c = Records.create('CommerceSimple', { nom: 'BOUCHERIE SAINTE-ANNE', ville: 'Lyon', adresse: '18 rue Sainte-Anne', lien: 'tiers', proprietaire: { nom: 'SCI ANNE', forme: 'SCI' }, exploitant: { nom: 'BOUCHERIE SAINTE-ANNE' }, drapeaux: [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus' }] });
  const avant = Records.list('ProprietaireMandataire').length;
  const a = await F.ficheDeCommerce(c.id, A);
  assert.equal(a.ok, true);
  assert.equal(a.fiche.apercu, true);
  assert.equal(a.fiche.id, null);
  assert.equal(a.fiche.statut_mot, 'Pas encore de fiche');
  assert.equal(a.fiche.murs.proprietaire, 'SCI ANNE');
  assert.equal(Records.list('ProprietaireMandataire').length, avant, 'rien n’est créé');
  await F.ficheDuCommerce(c.id, A);
  const apres = await F.ficheDeCommerce(c.id, A);
  assert.equal(apres.fiche.apercu, false, 'une fois créée, c’est sa vraie fiche');
  assert.equal((await F.ficheDeCommerce(c.id, B)).ok, false, 'un autre mandataire ne la voit pas');
});

test('ajouter à ma liste fait naître la fiche ; une fiche déjà née entre dans la liste sans doublon ; changer de liste la déplace', async () => {
  const { Records } = await import('./db.js');
  const S = await import('./off-market/simple.js');
  const F = await import('./fiche-mandataire.js');
  const A = { email: 'liste-a@kpartners.fr', role: 'mandataire' };
  const c1 = Records.create('CommerceSimple', { nom: 'OPTIQUE DU COURS', ville: 'Lyon', adresse: '40 cours Lafayette', lien: 'tiers', proprietaire: { nom: 'SCI COURS' }, exploitant: { nom: 'OPTIQUE DU COURS' } });
  const r = await S.envoyerVersListe([c1.id], { nom: 'Lyon', user: A });
  assert.equal(r.ajoutes, 1);
  const vue = await F.ficheDeCommerce(c1.id, A);
  assert.equal(vue.fiche.apercu, false, 'la carte devient la fiche');
  assert.equal(vue.fiche.liste.nom, 'Lyon');
  // Une fiche née d'un geste, hors liste : elle entre dans la liste, sans seconde fiche.
  const c2 = Records.create('CommerceSimple', { nom: 'TABAC', ville: 'Lyon', adresse: '2 rue', lien: 'tiers', exploitant: { nom: 'TABAC' } });
  await F.ficheDuCommerce(c2.id, A);
  const avant = Records.list('ProprietaireMandataire').filter((p) => p.commerce_simple_id === c2.id).length;
  await S.envoyerVersListe([c2.id], { liste_id: r.liste.id, user: A });
  assert.equal(Records.list('ProprietaireMandataire').filter((p) => p.commerce_simple_id === c2.id).length, avant);
  assert.equal((await F.ficheDeCommerce(c2.id, A)).fiche.liste.id, r.liste.id);
  // Changer de liste.
  const d = S.changerDeListe(vue.fiche.id, { nom: 'Villeurbanne', user: A });
  assert.equal(d.ok, true);
  assert.equal((await F.ficheDeCommerce(c1.id, A)).fiche.liste.nom, 'Villeurbanne');
  assert.equal(Records.get('CommerceSimple', c1.id).listes_mandataires['liste-a@kpartners.fr'].nom, 'Villeurbanne');
  assert.equal(S.changerDeListe(vue.fiche.id, { nom: 'X', user: { email: 'autre@kpartners.fr' } }).ok, false);
});

test('avancer un bien depuis Haka : rien n’est écrit, l’étape revient à confirmer d’un tap', async () => {
  const { Records } = await import('./db.js');
  const M = await import('./mandataire.js');
  const A = { email: 'avancer-a@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Boucherie Sainte-Anne', ville: 'Avignon', statut: 'rdv_pris', biens: { validee: 'rdv' }, historique: [] });
  const r = await M.executerOutilMandataire({ name: 'avancer_bien', input: { qui: 'Boucherie Sainte-Anne', etape: 'visite' } }, A);
  assert.equal(r.ok, true);
  assert.equal(r.a_confirmer, true);
  assert.equal(r.proprietaire_id, p.id);
  assert.equal(r.mot, 'Visite');
  assert.equal(r.etape, 'previsite');
  assert.equal(Records.get('ProprietaireMandataire', p.id).biens.validee, 'rdv', 'rien n’est écrit avant le tap');
  const prix = await M.executerOutilMandataire({ name: 'avancer_bien', input: { proprietaire_id: p.id, etape: 'estimation', prix: '460 k€' } }, A);
  assert.equal(prix.prix, 460000);
  assert.equal(prix.etape, 'prix_accord', 'l’accord se confirme par la route du prix');
  const pasBiens = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Tabac du Port', statut: 'a_appeler', historique: [] });
  assert.equal((await M.executerOutilMandataire({ name: 'avancer_bien', input: { proprietaire_id: pasBiens.id, etape: 'visite' } }, A)).ok, false, 'pas encore dans Biens');
});

test('le terrain : la distance, et les commerces où l’on est passé aujourd’hui', async () => {
  const T = await import('../src/lib/terrain.js');
  const m = T.distance({ lat: 45.764, lon: 4.8357 }, { lat: 45.765, lon: 4.8357 });
  assert.ok(m > 100 && m < 120, `≈111 m, reçu ${m}`);
  assert.equal(T.distanceLisible(111), '110 m');
  assert.equal(T.distanceLisible(2450), '2,5 km');
  assert.equal(T.passeAujourdhui({ historique: [{ type: 'note', le: '2026-10-25T09:00:00Z' }] }, '2026-10-25'), true);
  assert.equal(T.passeAujourdhui({ historique: [{ type: 'creation', le: '2026-10-25T09:00:00Z' }] }, '2026-10-25'), false, 'la création ne compte pas');
});

test('le fil du bien : une conversation par fiche, écrite d’où qu’on parle, relue par Haka, jamais effacée', async () => {
  const { Records, Conversations } = await import('./db.js');
  const B = await import('./bien-etapes.js');
  const A = { email: 'fil-a@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Boucherie Sainte-Anne', ville: 'Lyon', statut: 'rdv_pris', liste_id: 'l1', historique: [] });
  assert.equal(B.filDuBien(p, A), null, 'pas de fil avant le premier échange');
  const id = B.versLeFil(p, A, [{ role: 'user', contenu: 'Visite faite, 110 m², bail de 2019.' }, { role: 'assistant', contenu: 'Noté. Il me faut le bail.' }]);
  assert.ok(id);
  assert.equal(Records.get('ProprietaireMandataire', p.id).biens.conversation_id, id, 'la fiche garde son fil');
  B.versLeFil(Records.get('ProprietaireMandataire', p.id), A, [{ role: 'user', contenu: 'Il est d’accord à 460 k€.' }, { role: 'assistant', contenu: 'Je passe en Prix d’accord ?' }]);
  assert.equal(Conversations.get(id).messages.length, 4, 'le même fil, complété');
  assert.equal(Conversations.get(id).metadata.bien, p.id, 'marqué comme fil d’un bien');
  const ctx = B.contexteDuFil(Records.get('ProprietaireMandataire', p.id), A);
  assert.equal(ctx[0].role, 'user');
  assert.match(ctx.at(-1).contenu, /Prix d’accord/);
  assert.deepEqual(B.contexteDuFil(Records.get('ProprietaireMandataire', p.id), { email: 'autre@kpartners.fr' }), [], 'le fil d’un autre ne se lit pas');
  assert.match(B.lienDuFil(Records.get('ProprietaireMandataire', p.id)).lien, /MandataireBiens\?bien=proprietaire:/);
});

test('la préparation du rendez-vous : composée de la fiche, mise à jour et notifiée la veille à 18 h, une seule fois', async () => {
  const { Records } = await import('./db.js');
  const R = await import('./preparation-rdv.js');
  const prep = R.composerPreparation({
    p: { commerce: 'Boucherie', adresse: '18 rue Mercière' },
    commerce: { numero: '18', rue: 'Rue Mercière', activite: 'Boucherie', estimation: { prix: { basse: 480000, haute: 540000, moyenne: 510000 }, loyer_m2: {} } },
    courte: { proprietaire: 'SCI EXEMPLE', forme: 'SCI', gerant: { nom: 'PAUL', age: '70 ans et plus' }, exploitant: 'BOUCHERIE', depuis: 2008, signal: 'Gérant de 70 ans et plus' },
    investisseurs: [{ reference: 'Client A', budget: '500 k€' }],
  });
  assert.equal(prep.pre_estimation.basse, 480000);
  assert.equal(prep.murs.gerant, 'PAUL, 70 ans et plus');
  assert.equal(prep.locataire, 'BOUCHERIE · depuis 2008 · Boucherie');
  assert.equal(prep.rue, '18 Rue Mercière');
  assert.deepEqual(prep.clients, ['Client A · 500 k€']);
  assert.ok(prep.a_demander.length >= 5);
  // La veille à 18 h : mise à jour et notification, une seule fois par rendez-vous.
  const A = { email: 'prep-a@kpartners.fr' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Boucherie Sainte-Anne', statut: 'rdv_pris', historique: [] });
  const soir = new Date('2026-10-26T17:30:00Z'); // 18 h 30 à Paris
  Records.create('Rappel', { genre: 'rdv', proprietaire_id: p.id, echeance: '2026-10-27T08:00:00Z', fait_le: null });
  assert.equal(await R.tourDeLaVeille(new Date('2026-10-26T15:00:00Z')), 0, 'pas avant 18 h');
  assert.equal(await R.tourDeLaVeille(soir), 1);
  assert.ok(Records.get('ProprietaireMandataire', p.id).preparation, 'la préparation est faite');
  const notif = Records.list('Notification').find((n) => n.pour === A.email && /préparation est prête/.test(n.titre));
  assert.match(notif.titre, /^Demain 09 h 00, Boucherie Sainte-Anne/);
  assert.match(notif.lien, /etape=rdv/);
  assert.equal(await R.tourDeLaVeille(soir), 0, 'une seule fois');
});

test('la Pré-visite refaite : sources, « à confirmer », questions et objections selon le profil, gestes du rendez-vous', async () => {
  const { Records } = await import('./db.js');
  const R = await import('./preparation-rdv.js');
  const commerce = { numero: '18', rue: 'Rue Mercière', ville: 'Lyon', activite: 'Boucherie', estimation: { surface: [80, 100], loyer_m2: { basse: 200, haute: 250, source: 'Data-B' }, loyer_an: { basse: 16000, haute: 25000 }, taux: 6.5, taux_source: 'Barème Klocka', prix: { basse: 246000, moyenne: 300000, haute: 385000 } } };
  const historique = [
    { type: 'note', le: '2026-10-01', texte: 'Rendez-vous fixé.' },
    { type: 'appel', le: '2026-10-02', texte: 'Appel sans réponse (tentative 1)' },
    { type: 'appel', le: '2026-10-05', texte: 'Il pense à la retraite dans deux ans, ses enfants ne reprendront pas.' },
  ];
  const bailleur = R.composerPreparation({
    p: { commerce: 'Boucherie', historique }, commerce, annee: 2026,
    courte: { proprietaire: 'SCI EXEMPLE', forme: 'SCI', gerant: { nom: 'PAUL', age: '70 ans et plus' }, exploitant: 'BOUCHERIE', depuis: 2012, signal: 'Gérant de 70 ans et plus' },
    investisseurs: [{ reference: 'Client A', budget: '300 – 450 k€', budget_max: 450000 }, { reference: 'Client B', budget: '600 k€', budget_max: 600000 }],
    rdv: { id: 'r1', echeance: '2026-10-27T08:00:00Z', avec: 'M. Paul' },
    ventes: [{ date: '2024-03-01', adresse: '12 rue X', surface: 50, prix: 300000, prix_m2: 6000 }],
  });
  assert.equal(bailleur.v, 2);
  assert.equal(bailleur.profil, 'bailleur');
  assert.deepEqual(bailleur.personne.deja_dit.map((d) => d.texte), ['Il pense à la retraite dans deux ans, ses enfants ne reprendront pas.'], 'ni les notes automatiques ni « sans réponse »');
  assert.equal(bailleur.personne.deja_dit[0].source, 'appel');
  assert.equal(bailleur.bien.loyer.a_confirmer, true, 'le loyer probable est à confirmer');
  assert.deepEqual(bailleur.bien.fin_bail, { annee: 2030, depuis: 2012, a_confirmer: true }, 'bail 3-6-9 depuis 2012 : 2021, puis 2030');
  assert.equal(bailleur.clients_compatibles.plafond, 600000);
  assert.match(bailleur.estimation.calcul, /÷ taux de 6,5 %/);
  assert.match(bailleur.estimation.sensibilite[0], /^Si le loyer dépasse 25 k€ par an, la valeur passe au-dessus de 385 k€/);
  assert.equal(bailleur.estimation.comparables[0].source, 'DVF');
  assert.equal(bailleur.questions.indispensables.length, 3);
  assert.match(bailleur.questions.indispensables[0], /^Le bail et le loyer/);
  assert.ok(bailleur.questions.a_confirmer.some((x) => /surface exacte/.test(x)), 'une question née de la surface estimée');
  assert.ok(bailleur.objections.length >= 2 && bailleur.objections.length <= 3);
  assert.ok(bailleur.objections.some((o) => /associés/.test(o.objection)), 'une SCI : les associés');
  assert.equal(bailleur.rdv.adresse, '18 Rue Mercière, Lyon');
  // Le propriétaire exploitant : pas de questions sur le bail, mais ses projets et la vente occupée.
  const exploitant = R.composerPreparation({ p: { commerce: 'Boulangerie', historique: [] }, commerce, courte: { proprietaire: "L'exploitant lui-même", exploitant: 'BOULANGERIE', depuis: 2012 } });
  assert.equal(exploitant.profil, 'exploitant');
  assert.ok(!exploitant.questions.indispensables.some((x) => /bail et le loyer/i.test(x)));
  assert.ok(exploitant.questions.indispensables.some((x) => /vente occupée/i.test(x)));
  assert.equal(exploitant.bien.fin_bail, null);
  assert.ok(exploitant.documents.includes('Titre de propriété'));
  // Les gestes : décaler (la notification repart), annuler (en pause), la visite notée, le rappel une heure avant.
  const A = { email: 'previsite-a@kpartners.fr' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Cave Exemple', adresse: '3 rue Exemple, Lyon', statut: 'rdv_pris', historique: [] });
  const rdv = Records.create('Rappel', { genre: 'rdv', proprietaire_id: p.id, echeance: new Date(Date.now() + 2 * 86400000).toISOString(), fait_le: null, preparation_notifiee: 'oui' });
  assert.equal((await R.decalerRdv(p.id, '2026-12-03T15:00', { email: 'autre@kpartners.fr' })).ok, false, 'la fiche d’un autre');
  assert.equal((await R.decalerRdv(p.id, 'demain', A)).ok, false, 'une date lisible');
  const decale = await R.decalerRdv(p.id, '2026-12-03T15:00', A);
  assert.equal(decale.ok, true);
  assert.equal(Records.get('Rappel', rdv.id).echeance, '2026-12-03T14:00:00.000Z', '15 h à Paris en hiver');
  assert.equal(Records.get('Rappel', rdv.id).preparation_notifiee, null, 'la notification de la veille repart');
  assert.equal(R.noterVisite(p.id, { reponses: { loyer: '1 800 € par mois', pirate: 'x' } }, A).proprietaire.biens.visite.reponses.loyer, '1 800 € par mois');
  assert.equal(Records.get('ProprietaireMandataire', p.id).biens.visite.reponses.pirate, undefined);
  assert.equal(R.cocherDocuments(p.id, ['Dernier avis de taxe foncière'], A).proprietaire.preparation.documents_recus[0], 'Dernier avis de taxe foncière');
  const mail = R.mailDesDocuments(p.id, A);
  assert.ok(!/Dernier avis de taxe foncière/.test(mail.texte), 'le mail ne redemande pas ce qui est reçu');
  assert.equal(await R.tourDeLHeure(new Date(Date.parse('2026-12-03T14:00:00Z') - 3 * 3600000)), 0, 'pas trois heures avant');
  assert.equal(await R.tourDeLHeure(new Date(Date.parse('2026-12-03T14:00:00Z') - 50 * 60000)), 1, 'une heure avant');
  assert.equal(await R.tourDeLHeure(new Date(Date.parse('2026-12-03T14:00:00Z') - 40 * 60000)), 0, 'une seule fois');
  const annule = await R.annulerRdv(p.id, { motif: 'Il est malade' }, A);
  assert.equal(annule.ok, true);
  assert.ok(Records.get('ProprietaireMandataire', p.id).biens.pause, 'en pause, avec une relance');
  assert.ok(Records.get('Rappel', rdv.id).fait_le, 'le rendez-vous est clos');
});

test('le compte rendu de visite : le bon rendez-vous, rien d’écrasé sans le dire, les questions reprises, et toujours « Passer à l’estimation ? »', async () => {
  const { Records } = await import('./db.js');
  const R = await import('./preparation-rdv.js');
  const A = { email: 'cr-a@kpartners.fr' };
  const commerce = { numero: '5', rue: 'Rue Exemple', ville: 'Lyon', estimation: { surface: [60, 70], loyer_m2: { basse: 200, haute: 250, source: 'Data-B' }, loyer_an: { basse: 13000, haute: 17000 }, taux: 6.5, prix: { basse: 200000, moyenne: 230000, haute: 260000 } } };
  const prep = { ...R.composerPreparation({ p: { commerce: 'Cave', historique: [] }, commerce, courte: { proprietaire: 'SCI CAVE', forme: 'SCI', exploitant: 'CAVE', depuis: 2015 } }), v: 2 };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Cave Exemple', ville: 'Lyon', statut: 'rdv_pris', historique: [], preparation: prep });
  Records.create('Rappel', { genre: 'rdv', proprietaire_id: p.id, echeance: new Date(Date.now() - 3600000).toISOString(), fait_le: null });
  const candidats = R.visiteDuMoment(A);
  assert.equal(candidats[0].fiche_id, p.id, 'le rendez-vous d’il y a une heure');
  assert.deepEqual(R.visiteDuMoment({ email: 'autre@kpartners.fr' }), [], 'jamais celui d’un autre');
  const r = R.enregistrerCompteRendu(p.id, {
    bien: { loyer_annuel: 24000, surface: 65, fin_bail: '2030', refacturees: true },
    proprietaire: { prix: 300000, delai: 'six mois', decideur: 'avec ses associés' },
    documents: { remis: ['le bail'], promis: ['taxe foncière'] },
    a_confirmer: ['loyer dit, pas vu sur le bail'],
    reponses: [{ question: prep.questions.indispensables[0], reponse: 'Bail de 2015, 2 000 € par mois' }],
  }, A);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ecarts.find((x) => x.champ === 'loyer').dit, '24 k€ par an', 'le loyer dicté sort de la fourchette : les deux sont montrés');
  assert.match(r.ecarts.find((x) => x.champ === 'loyer').connu, /13 k€ à 17 k€/);
  assert.ok(r.ecarts.some((x) => x.champ === 'fin_bail'), '2030 dicté, 2033 déduite (bail 3-6-9 depuis 2015)');
  assert.equal(r.compte_rendu.questions[0].repondue, true);
  assert.ok(r.sans_reponse.length >= 2, 'les autres questions sont signalées');
  assert.equal(r.question, 'Passer à l’estimation ?'.replace('’', "'"));
  assert.deepEqual(r.boutons.map((b) => b.libelle), ["Oui, passer à l'estimation", 'Non, pas maintenant']);
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.equal(f.biens.compte_rendu.source, 'visite');
  assert.ok(f.preparation.documents_recus.includes('Bail commercial et avenants'), 'le bail remis coche le document de la liste');
  assert.match(f.historique.at(-1).texte, /^Compte rendu de visite · loyer 24 k€\/an/);
  assert.equal(Records.list('EstimationMandataire').filter((e) => e.proprietaire_id === p.id).length, 0, 'aucune estimation lancée sans son oui');
  const fini = R.enregistrerCompteRendu(p.id, { proprietaire: { vendeur: false } }, A);
  assert.deepEqual(fini.boutons.map((b) => b.libelle), ['Mettre en pause', 'Perdu'], 'plus vendeur : pause ou perdu');
  assert.equal(R.enregistrerCompteRendu(p.id, {}, { email: 'autre@kpartners.fr' }).ok, false);
});

test('le fil relu par Haka part au format de l’API (content), sinon l’API refuse « messages.0.content: Field required »', () => {
  const src = fs.readFileSync(new URL('./mandataire.js', import.meta.url), 'utf8');
  assert.match(src, /contexteDuFil\(ficheOuverte, user\)\.map\(\(m\) => \(\{ role: m\.role, content: m\.contenu \}\)\)/);
});

test('Haka complète une fiche existante : le numéro va sur la fiche, sans doublon ni relance', async () => {
  const { Records } = await import('./db.js');
  const M = await import('./mandataire.js');
  const A = { email: 'modif-a@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Boulangerie de Lyon', nom: 'Regie Carron', ville: 'Lyon', statut: 'a_appeler', historique: [] });
  const avant = Records.list('ProprietaireMandataire').length;
  const r = await M.executerOutilMandataire({ name: 'modifier_fiche', input: { qui: 'Regie Carron', telephone: '06 11 11 11 11' } }, A);
  assert.equal(r.ok, true);
  const q = Records.get('ProprietaireMandataire', p.id);
  assert.equal(q.telephone, '06 11 11 11 11');
  assert.equal(q.telephone_source, 'dit à Haka');
  assert.equal(Records.list('ProprietaireMandataire').length, avant, 'pas de doublon');
  const tiers = await M.executerOutilMandataire({ name: 'modifier_fiche', input: { proprietaire_id: p.id, email: 'carron@exemple.fr', a_confirmer: true } }, A);
  assert.equal(tiers.ok, true);
  assert.equal(Records.get('ProprietaireMandataire', p.id).a_confirmer.email, true);
});

test('Haka modifie toute la fiche : champs, statut, liste, et parties libres ajoutées, réécrites, retirées', async () => {
  const { Records } = await import('./db.js');
  const M = await import('./mandataire.js');
  const A = { email: 'toute-a@kpartners.fr', role: 'mandataire' };
  const p = Records.create('ProprietaireMandataire', { mandataire_email: A.email, commerce: 'Tabac', ville: 'Lyon', statut: 'a_appeler', historique: [] });
  const go = (input) => M.executerOutilMandataire({ name: 'modifier_fiche', input: { proprietaire_id: p.id, ...input } }, A);
  assert.equal((await go({ adresse: '3 rue Neuve', activite: 'Tabac presse', prochaine_action: 'Rappeler', prochaine_action_le: '2026-10-28T09:00' })).ok, true);
  let q = Records.get('ProprietaireMandataire', p.id);
  assert.equal(q.adresse, '3 rue Neuve');
  assert.equal(q.activite, 'Tabac presse');
  assert.ok(q.prochaine_action_le);
  await go({ section: { action: 'ajouter', titre: 'Travaux', texte: 'Toiture refaite en 2022' } });
  await go({ section: { action: 'modifier', titre: 'travaux', texte: 'Toiture et vitrine refaites' } });
  q = Records.get('ProprietaireMandataire', p.id);
  assert.deepEqual(q.sections, [{ titre: 'travaux', texte: 'Toiture et vitrine refaites' }]);
  await go({ section: { action: 'retirer', titre: 'Travaux' } });
  assert.deepEqual(Records.get('ProprietaireMandataire', p.id).sections, []);
  assert.equal((await go({ statut: 'contacte', liste: 'Lyon centre' })).ok, true);
  q = Records.get('ProprietaireMandataire', p.id);
  assert.equal(q.statut, 'contacte');
  assert.equal(Records.get('ListeMandataire', q.liste_id).nom, 'Lyon centre');
});

test('la classe d’actif : commerce, bureaux, entrepôt ; le filtre et le client la respectent', async () => {
  const S = await import('./off-market/simple.js');
  assert.equal(S.classeDeCode('47.11F'), 'commerce');
  assert.equal(S.classeDeCode('70.22Z'), 'bureau');
  assert.equal(S.classeDeCode('5210B'), 'entrepot');
  assert.equal(S.classeDeCode('68.20B'), null, 'une SCI n’est pas un local à prospecter');
  const F = await import('../src/lib/off-market-simple.js');
  const f = { ...F.FILTRES_SIMPLE, emplacement: 'partout', classes: ['bureau'] };
  assert.equal(F.passeSimple({ classe: 'bureau', drapeaux: [], adresse: '' }, f), true);
  assert.equal(F.passeSimple({ drapeaux: [], adresse: '' }, f), false, 'sans classe, c’est un commerce');
  const C = await import('../src/lib/clients-commerces.js');
  assert.equal(C.classeCherchee({ type_commerce: 'Plateau de bureaux 300 m²' }), 'bureau');
  assert.equal(C.classeCherchee({ type_commerce: 'Pharmacie' }), 'commerce');
  assert.equal(C.pourClient({ classe: 'bureau', activite: 'Conseil' }, { type_commerce: 'Bureaux' }), true);
  assert.equal(C.pourClient({ classe: 'commerce', activite: 'Pharmacie' }, { type_commerce: 'Bureaux' }), false);
  assert.equal(C.pourClient({ classe: 'bureau', activite: 'Conseil' }, { type_commerce: 'Pharmacie' }), false);
});

test('tout le secteur : un point allégé garde ce que lisent la carte, les filtres et le tableau, rien de vide', async () => {
  const { leger } = await import('./mandataire-prospecter.js');
  const p = leger({ id: 'a', lat: 45.7620977, lon: 4.83604399, classe: 'commerce', titre: 'Evao', nom: 'Evao', exploitant: 'Evao', adresse_brute: '30 RUE X', siret: '1', drapeaux: [], signaux: ['long texte'], centre: false, chaine: false, liste: null, prix: null, force: 0, proprietaire: 'G a I', fiche: null });
  assert.deepEqual(p, { lat: 45.7621, lon: 4.83604, id: 'a', force: 0, drapeaux: [], proprietaire: 'G a I', centre: false, titre: 'Evao' });
  const b = leger({ id: 'b', lat: 1, lon: 2, classe: 'bureau', titre: 'T', nom: 'Autre', drapeaux: ['gerant_age'], chaine: true, centre: true, fiche: { id: 'f' } });
  assert.equal(b.classe, 'bureau');
  assert.equal(b.nom, 'Autre');
  assert.equal(b.chaine, true);
  assert.deepEqual(b.fiche, { id: 'f' });
});
