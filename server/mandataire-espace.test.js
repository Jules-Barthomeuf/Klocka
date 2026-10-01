// L'espace mandataire : la géométrie des secteurs, l'anonymat des demandes,
// la séquence de relance et le cloisonnement entre mandataires.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-espace-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const {
  dansPolygone, seChevauchent, poserSecteur, villesDuSecteur,
  demandeAnonyme, poserDemande, demandesVisibles, correspond,
  creerProprietaire, retrouverProprietaire, noterSansReponse, noterResultat,
  SEQUENCE_RELANCE, mesProprietaires,
} = await import('./mandataire-espace.js');
const { cibleRetenue, chercherCommerces } = await import('./mandataire-recherche.js');
const { tableauDuJour, agirSurRappel } = await import('./mandataire.js');

const ADMIN = { email: 'jules.b@klocka.immo', role: 'admin' };
const MOI = { email: 'marc@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'lea@kpartners.fr', role: 'mandataire' };

// Deux carrés disjoints, autour de Mâcon et de Nice.
const CARRE_MACON = [[46.2, 4.7], [46.4, 4.7], [46.4, 4.9], [46.2, 4.9]];
const CARRE_NICE = [[43.6, 7.1], [43.8, 7.1], [43.8, 7.4], [43.6, 7.4]];

test('la géométrie : dedans, dehors, chevauchement', () => {
  assert.equal(dansPolygone([46.3, 4.8], CARRE_MACON), true);
  assert.equal(dansPolygone([43.7, 7.26], CARRE_MACON), false);
  assert.equal(seChevauchent(CARRE_MACON, CARRE_NICE), false);
  assert.equal(seChevauchent(CARRE_MACON, [[46.3, 4.8], [46.5, 4.8], [46.5, 5.0], [46.3, 5.0]]), true);
  // Un polygone qui en contient un autre entièrement se chevauche aussi.
  assert.equal(seChevauchent(CARRE_MACON, [[46.25, 4.75], [46.35, 4.75], [46.35, 4.85], [46.25, 4.85]]), true);
});

test('un secteur refuse le chevauchement, et un mandataire n\'en a qu\'un', () => {
  const a = poserSecteur({ nom: 'Mâconnais', mandataire_email: MOI.email, points: CARRE_MACON }, ADMIN);
  assert.equal(a.ok, true);
  const conflit = poserSecteur({ nom: 'Empiète', mandataire_email: AUTRE.email, points: [[46.3, 4.8], [46.5, 4.8], [46.5, 5.0], [46.3, 5.0]] }, ADMIN);
  assert.equal(conflit.ok, false);
  assert.match(conflit.error, /empiète sur « Mâconnais »/);
  const deuxieme = poserSecteur({ nom: 'Autre', mandataire_email: MOI.email, points: CARRE_NICE }, ADMIN);
  assert.equal(deuxieme.ok, false);
  assert.match(deuxieme.error, /a déjà le secteur/);
  const b = poserSecteur({ nom: 'Niçois', mandataire_email: AUTRE.email, points: CARRE_NICE }, ADMIN);
  assert.equal(b.ok, true);
  assert.equal(a.secteur.historique[0].action, 'créé');
});

test('les villes du secteur : celles dont le centre tombe dans le polygone', () => {
  Records.create('Ville', { nom: 'Mâcon', centre: { lat: 46.3, lon: 4.83 }, code_insee: '71270' });
  Records.create('Ville', { nom: 'Nice', centre: { lat: 43.71, lon: 7.26 }, code_insee: '06088' });
  const secteur = Records.list('SecteurMandataire').find((s) => s.nom === 'Mâconnais');
  assert.deepEqual(villesDuSecteur(secteur).map((v) => v.nom), ['Mâcon']);
});

test('une demande sort anonymisée : ni nom, ni mail, ni société', () => {
  const r = poserDemande({ profil: 'SCI familiale', type_commerce: 'boulangerie', zones: 'Mâcon, Lyon 6e', budget_min: 400000, budget_max: 700000, rendement_min: 6, client_email: 'yann.jaffre@invest.fr' }, ADMIN);
  assert.equal(r.ok, true);
  const visibles = demandesVisibles();
  assert.equal(visibles.length, 1);
  assert.deepEqual(visibles[0].zones, ['Mâcon', 'Lyon 6e']);
  assert.doesNotMatch(JSON.stringify(visibles), /yann|jaffre|invest\.fr|client_email/i);
  assert.doesNotMatch(JSON.stringify(demandeAnonyme(r.demande)), /invest\.fr/);
  // Cachée par l'admin : elle disparaît du côté mandataire.
  poserDemande({ id: r.demande.id, ...r.demande, visible: false }, ADMIN);
  assert.equal(demandesVisibles().length, 0);
  poserDemande({ id: r.demande.id, ...r.demande, visible: true }, ADMIN);
});

test('la correspondance demande-commerce : activité et zone', () => {
  const d = Records.list('DemandeClient')[0];
  assert.equal(correspond({ activite: 'Boulangerie-pâtisserie', ville: 'Mâcon' }, d), true);
  assert.equal(correspond({ activite: 'Pharmacie', ville: 'Mâcon' }, d), false);
  assert.equal(correspond({ activite: 'Boulangerie', ville: 'Bordeaux' }, d), false);
});

test('la recherche reste dans le secteur et signale ce qui est pris', () => {
  const secteur = Records.list('SecteurMandataire').find((s) => s.nom === 'Mâconnais');
  const macon = Records.list('Ville').find((v) => v.nom === 'Mâcon');
  Records.create('Cible', { ville_id: macon.id, ville: 'Mâcon', adresse: '12 rue Carnot', enseigne: 'Boulangerie Martin', activite: 'Boulangerie', emplacement: 1, pile: 'surveiller', proprietaire: { nom: 'SCI CARNOT' } });
  Records.create('Cible', { ville_id: macon.id, ville: 'Mâcon', adresse: '3 rue Basse', enseigne: 'Tabac du Pont', activite: 'Tabac', emplacement: 2, pile: 'surveiller' });
  Records.create('Cible', { ville_id: macon.id, ville: 'Mâcon', adresse: '9 rue Franche', enseigne: 'Écartée', activite: 'Boulangerie', emplacement: 1, pile: 'ecartee' });

  assert.equal(cibleRetenue({ activite: 'Boulangerie', emplacement: 1, pile: 'surveiller' }, { activite: 'boulangeries', emplacement: 1 }), true);
  assert.equal(cibleRetenue({ activite: 'Boulangerie', emplacement: 2, pile: 'surveiller' }, { emplacement: 1 }), false);

  const r = chercherCommerces({ secteur, criteres: { activite: 'boulangerie', emplacement: 1 }, user: MOI });
  assert.equal(r.ok, true);
  assert.equal(r.resultats.length, 1, "l'écartée ne sort pas");
  assert.equal(r.resultats[0].enseigne, 'Boulangerie Martin');
  assert.equal(r.resultats[0].proprietaire_connu, true);
  assert.equal(r.resultats[0].correspondances, 1);
  assert.equal(r.resultats[0].statut.cle, 'nouveau');

  const horsSecteur = chercherCommerces({ secteur, criteres: { ville: 'Nice' }, user: MOI });
  assert.equal(horsSecteur.ok, false);
  assert.match(horsSecteur.error, /pas dans votre secteur/);
});

test('un commerce pris ne se démarche pas deux fois', () => {
  const cible = Records.list('Cible').find((c) => c.enseigne === 'Boulangerie Martin');
  const a = creerProprietaire({ cible_id: cible.id, nom: 'SCI CARNOT', commerce: 'Boulangerie Martin', ville: 'Mâcon', telephone: '0612345678' }, MOI);
  assert.equal(a.ok, true);
  assert.equal(creerProprietaire({ cible_id: cible.id, nom: 'X' }, MOI).error, 'Ce commerce est déjà dans votre liste.');
  assert.equal(creerProprietaire({ cible_id: cible.id, nom: 'X' }, AUTRE).error, 'Ce commerce est déjà suivi par un autre mandataire.');
  const secteur = Records.list('SecteurMandataire').find((s) => s.nom === 'Mâconnais');
  const r = chercherCommerces({ secteur, criteres: { activite: 'boulangerie' }, user: AUTRE });
  assert.equal(r.resultats.find((x) => x.enseigne === 'Boulangerie Martin').statut.cle, 'pris');
  // En discussion avec Klocka : refusé aussi.
  const klocka = Records.create('Cible', { ville_id: cible.ville_id, ville: 'Mâcon', adresse: '1 quai Sud', enseigne: 'Presse', activite: 'Presse', deal_id: 'deal-x', pile: 'surveiller' });
  assert.match(creerProprietaire({ cible_id: klocka.id, nom: 'Y' }, MOI).error, /avec Klocka/);
});

test('la séquence de relance : J+2, J+5, J+10, puis À recontacter à J+30', () => {
  assert.deepEqual(SEQUENCE_RELANCE.map((e) => e.apres_jours), [2, 5, 10, 30]);
  const p = mesProprietaires(MOI)[0];
  const attendus = [
    { jours: 2, statut: 'contacte' },
    { jours: 5, statut: 'contacte' },
    { jours: 10, statut: 'contacte' },
    { jours: 30, statut: 'a_recontacter' },
  ];
  for (const [i, attendu] of attendus.entries()) {
    const r = noterSansReponse(p.id, MOI);
    assert.equal(r.ok, true);
    assert.equal(r.tentatives, i + 1);
    const rappel = Records.get('Rappel', r.rappel_id);
    const jours = Math.round((new Date(rappel.echeance) - Date.now()) / 86400000);
    // J+n, ou le lundi qui suit quand J+n tombe un samedi ou un dimanche.
    assert.ok(jours - attendu.jours >= -1 && jours - attendu.jours <= 2, `tentative ${i + 1} : relance à J+${attendu.jours}, pas J+${jours}`);
    const jourSemaine = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(rappel.echeance));
    assert.ok(!['Sat', 'Sun'].includes(jourSemaine), `tentative ${i + 1} : jamais le week-end (${jourSemaine})`);
    assert.equal(Records.get('ProprietaireMandataire', p.id).statut, attendu.statut);
    // Une seule relance ouverte à la fois par fiche.
    assert.equal(Records.list('Rappel').filter((x) => x.proprietaire_id === p.id && !x.fait_le).length, 1);
    if (i === 0) assert.match(rappel.note || '', /revenir vers vous/, "l'accroche est proposée");
  }
  assert.equal(mesProprietaires(MOI)[0].statut, 'a_recontacter');
});

test('retrouver une fiche : un candidat net, ou la question à poser', () => {
  creerProprietaire({ nom: 'M. Durand', commerce: 'Tabac du Pont', activite: 'Tabac', ville: 'Mâcon' }, MOI);
  assert.equal(retrouverProprietaire('le tabac à Mâcon', MOI).candidats.length, 1);
  const flou = retrouverProprietaire('le commerce à Mâcon', MOI);
  assert.equal(flou.ambigu, true);
  assert.equal(retrouverProprietaire('la pharmacie de Lille', MOI).candidats.length, 0);
  assert.equal(retrouverProprietaire('le tabac à Mâcon', AUTRE).candidats.length, 0, "jamais la fiche d'un autre");
});

test('le résultat d\'appel change le statut et pose le rappel demandé', () => {
  const tabac = mesProprietaires(MOI).find((p) => p.commerce === 'Tabac du Pont');
  const r = noterResultat(tabac.id, { statut: 'pas_vendeur', texte: 'Pas vendeur', rappel_dans_jours: 180 }, MOI);
  assert.equal(r.ok, true);
  assert.equal(r.proprietaire.statut, 'pas_vendeur');
  const rappel = Records.get('Rappel', r.rappel_id);
  assert.ok(Math.abs(Math.round((new Date(rappel.echeance) - Date.now()) / 86400000) - 180) <= 1);
  assert.equal(noterResultat(tabac.id, { statut: 'inconnu' }, MOI).ok, false);
});

test('le À faire liste les propriétaires à appeler, avec leurs gestes', async () => {
  const r = creerProprietaire({ nom: 'Mme Roux', commerce: 'Fleuriste', ville: 'Mâcon', telephone: '0699887766' }, MOI);
  const jour = await tableauDuJour(MOI);
  const l = jour.a_faire.find((x) => x.id === r.proprietaire.id);
  assert.ok(l, 'la fiche à appeler est dans le À faire');
  assert.match(l.titre, /Appeler Fleuriste · Mâcon/);
  assert.equal((await agirSurRappel(r.proprietaire.id, 'demain', AUTRE)).ok, false, "pas la ligne d'un autre");
  assert.equal((await agirSurRappel(r.proprietaire.id, 'demain', MOI)).ok, true);
  assert.equal((await tableauDuJour(MOI)).a_faire.some((x) => x.id === r.proprietaire.id), false, 'reportée à demain');
});

test("un admin cumule le rôle mandataire sans rien perdre", async () => {
  const { cumulerMandataire, listerMandataires, estMandataire } = await import('./mandataire-espace.js');
  Records.create('User', { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules' });
  assert.equal(listerMandataires().some((m) => m.email === 'jules.b@klocka.immo'), false);
  assert.equal(cumulerMandataire(ADMIN, true).ok, true);
  const u = Records.list('User').find((x) => x.email === 'jules.b@klocka.immo');
  assert.equal(u.role, 'admin', 'le rôle admin ne bouge pas');
  assert.equal(estMandataire(u), true);
  assert.equal(listerMandataires().find((m) => m.email === 'jules.b@klocka.immo').admin, true);
  // Un secteur peut lui être attribué, et la recherche le trouve.
  const s = poserSecteur({ nom: 'Test Jules', mandataire_email: ADMIN.email, points: [[48.0, 1.0], [48.2, 1.0], [48.2, 1.2], [48.0, 1.2]] }, ADMIN);
  assert.equal(s.ok, true);
  assert.equal(cumulerMandataire(MOI, true).ok, false, "un mandataire ne s'octroie pas le cumul");
  cumulerMandataire(ADMIN, false);
  assert.equal(listerMandataires().some((m) => m.email === 'jules.b@klocka.immo'), false);
});

test("une ligne Monday devient une demande un peu anonymisée", async () => {
  const { demandeDepuisMonday } = await import('./mandataire-espace.js');
  const d = demandeDepuisMonday({ id: '42', nom: 'Yann Jaffré', statut: 'Recherche', budget: 412000, fonds_propres: 120000, revenu: 95000, lieu_recherche: 'PACA / Rhone-Alpes', objectif: 'Equilibre' });
  assert.deepEqual(d.zones, ['PACA', 'Rhone-Alpes']);
  assert.equal(d.budget_min, 350000, 'une fourchette arrondie, pas le chiffre exact');
  assert.equal(d.budget_max, 450000);
  assert.equal(d.profil, 'Investisseur privé · équilibre');
  // Depuis le 1er octobre 2026 : tout sort, sauf le nom et le revenu.
  // L'apport, les remarques (nom masqué) et la date d'entrée servent au mandataire.
  assert.equal(d.apport, 120000);
  assert.doesNotMatch(JSON.stringify(d), /Jaffr|95000|412000/);
  assert.equal(demandeDepuisMonday({ lieu_recherche: 'Partout', budget: 250000 }).zone_libre, 'Toute la France');
  assert.deepEqual(demandeDepuisMonday({ lieu_recherche: "idéalement autour d'Orléans à 1H30 / 2h" }).zones, ["idéalement autour d'Orléans à 1H30"]);

  // Le nom reste côté admin : la version servie au mandataire ne le porte pas.
  const cree = Records.create('DemandeClient', { ...d, client_nom: 'Yann Jaffré', source: 'monday', monday_id: '42', visible: true, active: true, ouverte_le: new Date().toISOString() });
  const servie = demandesVisibles().find((x) => x.id === cree.id);
  assert.ok(servie);
  assert.doesNotMatch(JSON.stringify(servie), /Jaffr|monday_id|client_nom/);
  // Retouchée à la main : l'import ne la réécrira plus.
  const r = poserDemande({ ...cree, id: cree.id, type_commerce: 'boulangerie' }, ADMIN);
  assert.equal(r.demande.edit_manuel, true);
  assert.equal(r.demande.client_nom, 'Yann Jaffré');
});

test("un secteur fait d'unités : plusieurs morceaux, une même unité jamais deux fois", async () => {
  const { secteursSeChevauchent, attribuerSecteur, dansSecteur } = await import('./mandataire-espace.js');
  // Deux « communes » carrées, loin des secteurs des autres tests.
  const a = [[44.0, -1.0], [44.1, -1.0], [44.1, -0.9], [44.0, -0.9]];
  const b = [[44.3, -1.0], [44.4, -1.0], [44.4, -0.9], [44.3, -0.9]];
  const r = poserSecteur({ nom: 'Landes', polygones: [a, b], unites: [{ niveau: 'commune', code: '40001', nom: 'A' }, { niveau: 'commune', code: '40002', nom: 'B' }] }, ADMIN);
  assert.equal(r.ok, true);
  assert.equal(r.secteur.polygones.length, 2);
  assert.equal(dansSecteur([44.35, -0.95], r.secteur), true, 'le second morceau compte');
  assert.equal(dansSecteur([44.2, -0.95], r.secteur), false, 'entre les deux, non');
  const doublon = poserSecteur({ nom: 'Doublon', polygones: [[[44.7, -1.0], [44.8, -1.0], [44.8, -0.9]]], unites: [{ niveau: 'commune', code: '40002', nom: 'B' }] }, ADMIN);
  assert.equal(doublon.ok, false, 'même commune, même si la géométrie diffère');
  // Deux voisins qui partagent une frontière ne se chevauchent pas.
  const voisin = [[44.1, -1.0], [44.2, -1.0], [44.2, -0.9], [44.1, -0.9]];
  assert.equal(secteursSeChevauchent({ polygones: [a] }, { polygones: [voisin] }), false);
  // Changer le mandataire ne touche pas au contour, et s'écrit dans l'historique.
  const att = attribuerSecteur(r.secteur.id, 'nouveau@kpartners.fr', ADMIN);
  assert.equal(att.ok, true);
  assert.equal(att.secteur.polygones.length, 2);
  assert.match(att.secteur.historique.at(-1).action, /attribué à nouveau@kpartners.fr/);
  assert.equal(attribuerSecteur(r.secteur.id, MOI.email, ADMIN).ok, false, 'un mandataire, un secteur');
});

test('un propriétaire devient un prospect K Partners : vendeur, local commercial, mandat non proposé', async () => {
  const { colonnesProspect } = await import('./mandataire-monday.js');
  const c = colonnesProspect({ nom: 'Test Exemple', email: 'exemple@test.fr', telephone: '0612345678', commerce: 'Tabac du Pont', ville: 'Mâcon', mandataire_email: 'marc@kpartners.fr' }, { personneId: '42', aujourdhui: new Date('2026-10-01T10:00:00Z') });
  assert.equal(c.text_mm0emb05, 'exemple@test.fr');
  assert.equal(c.text_mm0ejhqn, '0612345678');
  assert.deepEqual(c.dropdown_mm0n2ygh, { labels: ['Vendeur'] });
  assert.deepEqual(c.color_mm0ekshq, { label: 'Non proposé' });
  assert.deepEqual(c.color_mm0f65qr, { label: 'Local commercial' });
  assert.equal(c.date_mm0e7d4j.date, '2026-10-01');
  assert.deepEqual(c.multiple_person_mm7pp3f0, { personsAndTeams: [{ id: 42, kind: 'person' }] });
  assert.match(c.long_text_mm0e7nsh.text, /Tabac du Pont/);
  assert.equal(colonnesProspect({ nom: 'X', mandataire_email: 'm@k.fr' }).text_mm0emb05, undefined, 'pas de colonne vide');
});

test('communeDansSecteur : les codes des unités priment sur le centre de l’API Géo', async () => {
  const { communeDansSecteur } = await import('./mandataire-espace.js');
  const loin = { lat: 0, lon: 0 };
  const parCommunes = { unites: [{ niveau: 'commune', code: '71270', nom: 'Mâcon' }], polygones: [[[46, 4], [46, 5], [47, 5]]] };
  assert.equal(communeDansSecteur({ code: '71270', ...loin }, parCommunes), true);
  assert.equal(communeDansSecteur({ code: '69123', codeDepartement: '69', codeRegion: '84', lat: 46.5, lon: 4.9 }, parCommunes), false);
  const parDepartement = { unites: [{ niveau: 'departement', code: '71', nom: 'Saône-et-Loire' }] };
  assert.equal(communeDansSecteur({ code: '71105', codeDepartement: '71', ...loin }, parDepartement), true);
  const dessine = { polygones: [[[46, 4], [46, 5], [47, 5], [47, 4]]] };
  assert.equal(communeDansSecteur({ lat: 46.5, lon: 4.5 }, dessine), true);
  assert.equal(communeDansSecteur({ lat: 45, lon: 4.5 }, dessine), false);
});

test('les initiales du client, jamais son nom', async () => {
  const { initialesDe, demandeAnonyme } = await import('./mandataire-espace.js');
  assert.equal(initialesDe('Alexandre Roux'), 'AR');
  assert.equal(initialesDe('M. Jean-Pierre Dupont'), 'JP');
  assert.equal(initialesDe(''), null);
  const a = demandeAnonyme({ id: 'x', client_nom: 'Alexandre Roux', client_email: 'a@invest.fr', type_commerce: 'boulangerie' });
  assert.equal(a.reference, 'AR');
  assert.doesNotMatch(JSON.stringify(a), /Roux|invest\.fr/i, 'ni le nom ni le mail ne sortent');
});

test('la remarque sort avec le nom masqué, l\'apport et la date d\'entrée suivent', async () => {
  const { demandeDepuisMonday, demandeAnonyme, masquerNom } = await import('./mandataire-espace.js');
  assert.equal(masquerNom('M. Roux veut du Roux à Lyon', 'Alexandre Roux'), 'M. R. veut du R. à Lyon');
  const d = demandeDepuisMonday({ nom: 'Alexandre Roux', budget: 500000, fonds_propres: 150000, lieu_recherche: 'Lyon', objectif: 'Equilibre', remarque: 'Roux préfère le neuf', entre_le: '2026-03-12 09:00:00 UTC' });
  assert.equal(d.apport, 150000);
  assert.equal(d.remarque, 'R. préfère le neuf');
  assert.equal(d.entre_le, '2026-03-12 09:00:00 UTC');
  const a = demandeAnonyme({ id: 'x', client_nom: 'Alexandre Roux', ...d });
  assert.doesNotMatch(JSON.stringify(a), /Alexandre|Roux[^ ]/, 'le nom ne sort jamais');
  assert.equal(a.apport, 150000);
  assert.ok(a.remarque.includes('préfère'));
});
