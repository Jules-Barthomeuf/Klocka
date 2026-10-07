// Le mode appel : le tri d'une ville, le statut croisé avec Monday, la file,
// et le reçu qui ne dit vrai que s'il a relu Monday.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Jamais le vrai Monday ni la vraie boîte : dotenv ne remplace pas une variable déjà posée.
process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mode-appel-'));
const MA = await import('./mode-appel.js');
const { Records } = await import('../db.js');

const MAINTENANT = new Date('2026-10-06T09:00:00Z');

test('les agences de commerce remontent, le résidentiel descend', () => {
  assert.equal(MA.pertinence({ nom: 'AZUREA COMMERCES & ENTREPRISES' }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Liberté Commerces' }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Agence du Port', annonces_commerce: 5 }).specialite, 'commerce');
  assert.equal(MA.pertinence({ nom: 'Riviera Locations Saisonnières' }).specialite, 'residentiel');
  assert.equal(MA.pertinence({ nom: 'Agence Centrale' }).specialite, 'generaliste');
  assert.ok(MA.pertinence({ nom: 'Arthur Loyd Nice' }).score > MA.pertinence({ nom: 'Nice Prestige Villas' }).score);
});

test('le statut : jamais contactée, déjà en contact (qui, quand, quoi), probable, morte, relance due', () => {
  assert.equal(MA.statutDeLAgence({ nom: 'X' }, { maintenantD: MAINTENANT }).etat, 'jamais');
  const contact = MA.statutDeLAgence({ nom: 'X', monday_connu: { qui: 'thomas.r@klocka.immo', date: '2026-09-15', statut: 'Intéressé', confiance: 'sure' } }, { maintenantD: MAINTENANT });
  assert.equal(contact.etat, 'contact');
  assert.equal(contact.libelle, 'Déjà en contact');
  assert.equal(contact.detail, 'Thomas, il y a 3 semaines, intéressé');
  assert.equal(contact.interessee, true);
  const probable = MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Nouveau contact', confiance: 'probable' } }, { maintenantD: MAINTENANT });
  assert.equal(probable.libelle, 'Correspondance probable');
  assert.equal(MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Mort', confiance: 'sure' } }, { maintenantD: MAINTENANT }).etat, 'morte');
  // Un « Mort » qui n'est qu'une correspondance probable ne tue pas l'agence.
  assert.notEqual(MA.statutDeLAgence({ nom: 'X', monday_connu: { statut: 'Mort', confiance: 'probable' } }, { maintenantD: MAINTENANT }).etat, 'morte');
  assert.equal(MA.statutDeLAgence({ nom: 'X', fermee: true }, { maintenantD: MAINTENANT }).etat, 'morte');
  const due = MA.statutDeLAgence({ nom: 'X' }, { fiche: { prochaine: { le: '2026-10-02' }, dernier_contact_le: '2026-09-20' }, maintenantD: MAINTENANT });
  assert.equal(due.etat, 'relance');
  assert.equal(due.a_rappeler, true);
});

test("l'ordre : relance due en haut, le commerce avant le résidentiel, les mortes à la fin", () => {
  const lignes = [
    { nom: 'Riviera Locations', statut: { etat: 'jamais' }, pertinence: MA.pertinence({ nom: 'Riviera Locations' }) },
    { nom: 'Fermée', statut: { etat: 'morte' }, pertinence: MA.pertinence({ nom: 'Commerces Fermée' }) },
    { nom: 'Azurea Commerces', statut: { etat: 'jamais' }, pertinence: MA.pertinence({ nom: 'Azurea Commerces' }) },
    { nom: 'À rappeler', statut: { etat: 'relance' }, pertinence: MA.pertinence({ nom: 'À rappeler' }) },
  ];
  assert.deepEqual(MA.ordreDeLaVille(lignes).map((x) => x.nom), ['À rappeler', 'Azurea Commerces', 'Riviera Locations', 'Fermée']);
});

test('la barre de la ville compte ce qui compte', () => {
  const c = MA.chiffresDeLaVille([
    { statut: { etat: 'jamais' } },
    { statut: { etat: 'contact', appelee: true, interessee: true } },
    { statut: { etat: 'relance', a_rappeler: true } },
    { statut: { etat: 'morte' } },
  ]);
  assert.deepEqual(c, { agences: 4, appelees: 2, fait_pourcent: 67, interessees: 1, a_rappeler: 1, mortes: 1, independants: 0, annonceurs: 0, societes: 0 });
  // Une société seulement au registre, sans fiche Google ni annonce, n'est pas une agence ; suivie, elle le redevient.
  assert.equal(MA.genreDe({ nom: 'Mh Services', telephone: '04 93 00 00 00', sources: ['Data-B'] }), 'societe');
  assert.equal(MA.genreDe({ nom: 'Mh Services', sources: ['Data-B', 'Google Maps'] }), 'agence');
  assert.equal(MA.genreDe({ nom: 'Mh Services', sources: ['Data-B'], pour: ['nora.l@klocka.immo'] }), 'agence');
  // Les mandataires en nom propre et les noms d'annonces se comptent à part.
  assert.equal(MA.genreDe({ nom: 'Monsieur Nicolas Mouette', raison_sociale: 'MONSIEUR NICOLAS MOUETTE', sources: ['Data-B'] }), 'independant');
  assert.equal(MA.genreDe({ nom: 'Bnp', sources: ['Equimmox'] }), 'annonceur');
  assert.equal(MA.genreDe({ nom: 'Azurea Commerces', telephone: '04 93 35 08 68', sources: ['Google Maps'] }), 'agence');
  const d = MA.chiffresDeLaVille([{ genre: 'agence', statut: { etat: 'jamais' } }, { genre: 'independant', statut: { etat: 'jamais' } }, { genre: 'annonceur', statut: { etat: 'jamais' } }]);
  assert.deepEqual([d.agences, d.independants, d.annonceurs], [1, 1, 1]);
});

test('les recherches clients de la zone, en une ligne chacune', () => {
  const lignes = MA.recherchesDeLaZone([
    { active: true, visible: true, zones: ['Nice centre'], budget_min: 300000, budget_max: 800000 },
    { active: true, visible: true, zones: ['Lyon'], budget_min: 200000, budget_max: 400000 },
    { active: false, visible: true, zones: ['Nice'], budget_max: 500000 },
  ], 'Nice');
  assert.deepEqual(lignes, ['murs de commerce, 300 k€ à 800 k€, Nice centre']);
});

test("« pas de réponse » × 3 : J+2 à l'autre moment, puis J+30 ; aucune ligne Monday ; la session le compte", async () => {
  const L = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const ag = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence Test Commerces', telephone: '04 93 11 22 33', agents: [], gerants: [], sources: ['Google Maps'] });
  const user = { email: 'nora.l@klocka.immo', role: 'admin' };
  const s = MA.ouvrirSession(L.id, user).session;
  assert.ok(MA.fileDAppel(L.id, user, { maintenantD: MAINTENANT }).file.some((x) => x.id === ag.id), "l'agence est dans la file");
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_reponse', session_id: s.id, user });
  assert.equal(r.ok, true);
  assert.equal(r.simple, true);
  assert.match(r.recu.relance.texte, /^Relance /);
  assert.equal(r.recu.monday, null, 'un sans-réponse reste dans la plateforme');
  assert.equal(r.recu.mail, null);
  const fiche = () => Records.get('AgentImmo', Records.get('AgenceProspect', ag.id).carnet_id);
  // Aujourd'hui, elle sort de la file ; à sa date, elle revient en « 2e tentative ».
  assert.ok(!MA.fileDAppel(L.id, user).file.some((x) => x.id === ag.id), 'déjà appelée aujourd\'hui');
  const leJour = new Date(`${fiche().prochaine.le}T08:00:00Z`);
  const revenue = MA.fileDAppel(L.id, user, { maintenantD: leJour }).file.find((x) => x.id === ag.id);
  assert.equal(revenue?.badge, '2e tentative');
  const R = await import('./regles.js');
  assert.equal(R.suiteDeLIssue('pas_de_reponse', { tentatives: 2, maintenant: MAINTENANT }).prochaine.le, '2026-11-05', 'après la 3e tentative : J+30');
  const recap = MA.recapSession(s.id);
  assert.equal(recap.appels, 1);
  assert.equal(recap.sans_reponse, 1);
  assert.equal(recap.monday_a_jour, true);
  // « Passer · fermée » : l'agence sort de la file, en gris.
  const ag2 = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Numéro Mort', telephone: '04 93 99 88 77', agents: [], gerants: [] });
  assert.equal(MA.passer(ag2.id, 'fermee', user).ok, true);
  assert.equal(Records.get('AgenceProspect', ag2.id).morte, true);
  assert.ok(!MA.fileDAppel(L.id, user).file.some((x) => x.id === ag2.id));
});

test("Monday « Agents immobiliers » : la bonne ligne, Remarques allongées sans écraser, relu, annulable", async () => {
  const M = await import('./monday-agents.js');
  const cols = M.colonnesParTitre([
    { id: 'name', title: 'Nom', type: 'name' }, { id: 'text_p', title: 'Prénom', type: 'text' }, { id: 'spoc', title: 'SPOC', type: 'people' },
    { id: 'email', title: 'E-mail', type: 'email' }, { id: 'phone', title: 'Téléphone', type: 'phone' }, { id: 'text0', title: 'Ville', type: 'text' },
    { id: 'drop', title: 'Entreprise', type: 'dropdown' }, { id: 'text4', title: 'Remarques', type: 'text' }, { id: 'status5', title: 'Priorité', type: 'status' }, { id: 'date', title: 'Prochaine relance', type: 'date' },
  ]);
  assert.equal(cols.relance.id, 'date');
  assert.ok(!cols.priorite, 'Priorité ne se touche pas');
  const items = [
    { id: '1', nom: 'Sophie Martin', colonnes: { phone: '0612345678', email: 's.martin@riviera.fr', text0: 'Nice', drop: 'Riviera Commerce', text4: '12/09/2026 · Nora · Pas de réponse', date: '' } },
    { id: '2', nom: 'Paul Durand', colonnes: { phone: '0493000000', email: '', text0: 'Nice', drop: 'Riviera Commerce', text4: '', date: '' } },
    { id: '3', nom: 'Marc Petit', colonnes: { phone: '0493000000', email: '', text0: 'Nice', drop: 'Riviera Commerce', text4: '', date: '' } },
  ];
  const lignes = M.lignesDuTableau(items, cols);
  assert.equal(M.trouverLigne(lignes, { telephones: ['+33 6 12 34 56 78'] }).ligne.id, '1', 'par le téléphone normalisé');
  assert.equal(M.trouverLigne(lignes, { emails: ['S.Martin@riviera.fr'] }).ligne.id, '1', 'puis par le mail');
  assert.equal(M.trouverLigne(lignes, { telephones: ['04 93 00 00 00'] }).etat, 'doute', 'le standard de deux contacts : on demande');
  assert.equal(M.trouverLigne(lignes, { telephones: ['04 93 00 00 00'], contact: 'Marc Petit' }).ligne.id, '3');
  assert.equal(M.trouverLigne(lignes, { agence: 'Riviera Commerce', ville: 'Nice' }).etat, 'doute', 'agence connue, contact inconnu : on demande');
  assert.equal(M.trouverLigne(lignes, { telephones: ['0700000000'], agence: 'Autre Agence', ville: 'Nice' }).etat, 'nouvelle');
  // Écrire sur la ligne 1 : Remarques allongée, relance posée, rien d'autre d'écrasé.
  const etat = Object.fromEntries(items.map((x) => [x.id, JSON.parse(JSON.stringify(x))]));
  let cree = 0;
  const fonctions = {
    cols, lignes,
    lireElement: async (id) => (etat[id] ? { id, nom: etat[id].nom, colonnes: { ...etat[id].colonnes } } : null),
    majElement: async (_t, id, v) => { for (const [k, x] of Object.entries(v)) { if (k === 'name') etat[id].nom = x; else etat[id].colonnes[k] = typeof x === 'object' && x ? (x.date ?? x.labels?.[0] ?? x.phone ?? x.email ?? '') : x; } },
    creerElement: async (_t, nom, v) => { cree += 1; const id = String(100 + cree); etat[id] = { id, nom, colonnes: {} }; await fonctions.majElement(null, id, v); return { id }; },
    supprimerElement: async (id) => { delete etat[id]; },
  };
  const d = { contact: 'Sophie Martin', ville: 'Nice', agence: 'Riviera Commerce', remarque: M.ligneDeRemarque({ jour: '2026-10-07', analyste: 'Nora', issue: "Pas de bien pour l'instant", resume: 'Rien en ce moment, un mandat fin novembre.' }), relance: '2026-11-06', telephone: '06 12 34 56 78', email: 's.martin@riviera.fr', issue: "Pas de bien pour l'instant" };
  const r = await M.ecrire({ cible: { telephones: [d.telephone], agence: d.agence, ville: d.ville, contact: d.contact }, donnees: d }, { fonctions });
  assert.equal(r.etat, 'ok');
  assert.equal(r.cree, false);
  assert.equal(r.texte, "Riviera Commerce · Sophie Martin · Pas de bien pour l'instant");
  assert.equal(etat['1'].colonnes.text4, "12/09/2026 · Nora · Pas de réponse\n07/10/2026 · Nora · Pas de bien pour l'instant · Rien en ce moment, un mandat fin novembre.", 'ajoutée à la suite');
  assert.equal(etat['1'].colonnes.date, '2026-11-06');
  // Un nouvel essai ne double pas la remarque.
  await M.ecrire({ cible: { telephones: [d.telephone] }, donnees: d, ligne_id: '1' }, { fonctions: { ...fonctions, lignes: M.lignesDuTableau(Object.values(etat), cols) } });
  assert.equal(etat['1'].colonnes.text4.split('Pas de bien').length, 2);
  // Annuler : la ligne reprend ses valeurs d'avant.
  await M.restaurer(r, { fonctions });
  assert.equal(etat['1'].colonnes.text4, '12/09/2026 · Nora · Pas de réponse');
  assert.equal(etat['1'].colonnes.date, '');
  // Une ligne créée pour un inconnu s'appelle « Accueil » ; Annuler la retire.
  const n = await M.ecrire({ cible: { telephones: ['0700000000'], agence: 'Autre Agence', ville: 'Nice' }, donnees: { ...d, contact: null, agence: 'Autre Agence', telephone: '0700000000', email: null } }, { fonctions });
  assert.equal(n.cree, true);
  assert.equal(etat[n.item_id].nom, 'Accueil');
  await M.restaurer(n, { fonctions });
  assert.ok(!etat[n.item_id]);
  // Monday garde une autre valeur : le reçu reste orange.
  const faux = await M.ecrire({ cible: {}, donnees: d, ligne_id: '2' }, { fonctions: { ...fonctions, majElement: async () => {} } });
  assert.equal(faux.etat, 'attente');
  assert.match(faux.erreur, /Remarques : Monday affiche/);
});

test('les zones écrites à la main se rapprochent de la ville par son département', () => {
  assert.equal(MA.zoneCouvre('Toute la France', { ville: 'Nice', departement: '06' }), 'partout');
  assert.equal(MA.zoneCouvre('Côte d\'Azur', { ville: 'Nice', departement: '06' }), 'region');
  assert.equal(MA.zoneCouvre('Sud', { ville: 'Nice', departement: '06' }), 'region');
  assert.equal(MA.zoneCouvre('Est de la france en priorité', { ville: 'Nice', departement: '06' }), null);
  assert.equal(MA.zoneCouvre('Est de la france en priorité', { ville: 'Metz', departement: '57' }), 'region');
  assert.equal(MA.zoneCouvre('Proche Bretagne', { ville: 'Rennes', departement: '35' }), 'region');
  assert.equal(MA.zoneCouvre('Nice centre', { ville: 'Nice', departement: '06' }), 'ville');
  assert.equal(MA.departementDe([{ code_postal: '06000' }, { code_postal: '06300' }, { code_postal: '83000' }]), '06');
  const l = MA.recherchesDeLaZone([
    { active: true, zones: [], zone_libre: 'Toute la France', budget_min: 200000, budget_max: 300000 },
    { active: true, zones: [], zone_libre: 'Toute la France', budget_min: 850000, budget_max: 1150000 },
    { active: true, zones: ['Côte d\'Azur'], budget_min: 300000, budget_max: 800000 },
  ], 'Nice', { departement: '06' });
  assert.deepEqual(l, ['murs de commerce, 300 k€ à 800 k€, Côte d\'Azur', '2 clients partout en France, de 200 k€ à 1,2 M€']);
});

test("un ancien rapprochement Monday sans confiance : le nom ne donne qu'une correspondance probable", () => {
  assert.equal(MA.statutDeLAgence({ monday_connu: { par: 'nom', statut: 'Mort' } }).probable, true);
  assert.notEqual(MA.statutDeLAgence({ monday_connu: { par: 'nom', statut: 'Mort' } }).etat, 'morte');
  assert.equal(MA.statutDeLAgence({ monday_connu: { par: 'téléphone', statut: 'Mort' } }).etat, 'morte');
});

test("la file : mes relances dues, les sans-réponse à retenter, puis les jamais contactées ; ni les agents d'un collègue, ni ce qu'il a à l'écran", async () => {
  const L = Records.create('ListeAgences', { ville: 'Cannes', etat: 'fini', journal: [] });
  const moi = { email: 'nora.l@klocka.immo', role: 'admin' };
  const mienne = Records.create('AgenceProspect', { liste_id: L.id, nom: 'À moi', telephone: '04 93 00 00 01', pour: ['nora.l@klocka.immo'], monday_connu: { statut: 'Intéressé', date: '2026-09-01', relance: '2026-10-05', confiance: 'sure', qui: 'nora.l@klocka.immo' }, agents: [], gerants: [] });
  const libre = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Libre', telephone: '04 93 00 00 02', agents: [], gerants: [] });
  const prise = Records.create('AgenceProspect', { liste_id: L.id, nom: 'À Coralie', telephone: '04 93 00 00 03', pour: ['coralie.g@klocka.immo'], agents: [], gerants: [] });
  const connue = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Déjà connue', telephone: '04 93 00 00 04', monday_connu: { statut: 'Pas intéressé', date: '2025-01-01', confiance: 'sure' }, agents: [], gerants: [] });
  const deThomas = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Contact de Thomas', telephone: '04 93 00 00 05', monday_connu: { statut: 'A rappeler', relance: '2026-10-01', confiance: 'sure', qui: 'thomas@klocka.immo' }, agents: [], gerants: [] });
  const ecran = Records.create('AgenceProspect', { liste_id: L.id, nom: 'À l\'écran de Maxime', telephone: '04 93 00 00 06', reservee: { par: 'maxime.p@klocka.immo', jusqu: new Date(MAINTENANT.getTime() + 60000).toISOString() }, agents: [], gerants: [] });
  const f = MA.fileDAppel(L.id, moi, { maintenantD: MAINTENANT }).file;
  const ids = f.map((x) => x.id);
  assert.deepEqual(ids.slice(0, 2), [mienne.id, libre.id], 'ma relance due, puis la jamais contactée');
  assert.equal(f[0].badge, 'Relance');
  assert.equal(f[1].badge, 'Jamais contactée');
  assert.ok(!ids.includes(prise.id), 'la ligne d\'une collègue');
  assert.ok(!ids.includes(connue.id), 'déjà en contact, sans relance due');
  assert.ok(!ids.includes(deThomas.id), 'l\'agent d\'un collègue (premier à l\'avoir joint)');
  assert.ok(!ids.includes(ecran.id), 'à l\'écran d\'un collègue');
  // Réserver : un collègue ne la voit plus.
  assert.equal(MA.reserver(libre.id, moi, { maintenantD: MAINTENANT }).ok, true);
  assert.equal(MA.reserver(libre.id, { email: 'maxime.p@klocka.immo' }, { maintenantD: MAINTENANT }).ok, false);
  assert.ok(!MA.fileDAppel(L.id, { email: 'maxime.p@klocka.immo', role: 'admin' }, { maintenantD: MAINTENANT }).file.some((x) => x.id === libre.id));
  // Plus tard : revient demain, pas aujourd'hui.
  MA.passer(libre.id, 'plus_tard', moi, { maintenantD: MAINTENANT });
  assert.ok(!MA.fileDAppel(L.id, moi, { maintenantD: MAINTENANT }).file.some((x) => x.id === libre.id));
  assert.ok(MA.fileDAppel(L.id, moi, { maintenantD: new Date(MAINTENANT.getTime() + 86400000) }).file.some((x) => x.id === libre.id));
  // L'agent qui rappelle : retrouvé par son numéro.
  assert.equal(MA.chercher('04.93.00.00.02').resultats[0].agence_id, libre.id);
});

test("Apollo : seules les agences immobilières passent, par leurs codes d'activité", async () => {
  const A = await import('./agences-apollo.js');
  assert.equal(A.estAgenceApollo({ name: 'B\'Nice Immo', naics_codes: ['531210'], sic_codes: ['6531'] }), true);
  assert.equal(A.estAgenceApollo({ name: 'Immobleu Promotion', naics_codes: ['53111', '236117'], sic_codes: ['6512', '1521', '6531'] }), false, 'un promoteur');
  assert.equal(A.estAgenceApollo({ name: 'John rent immo conciergerie', naics_codes: ['53131'], sic_codes: ['6513'] }), false);
  assert.equal(A.estAgenceApollo({ name: 'FAYAT BATIMENT', naics_codes: ['236220'] }), false);
  assert.equal(A.estAgenceApollo({ name: "L'Immobiliere de Roseland" }), true, 'sans code, le nom suffit');
  assert.deepEqual(A.versAgence({ id: 'x', name: 'ARP IMMO', website_url: 'http://azurrivieraproperties.com', sanitized_phone: '+33497081452', linkedin_url: 'http://linkedin.com/company/arp' }),
    { nom: 'ARP IMMO', site: 'http://azurrivieraproperties.com', telephone: '04 97 08 14 52', linkedin: 'http://linkedin.com/company/arp', apollo_id: 'x' });
  process.env.APOLLO_API_KEY = 'test';
  const pages = [];
  const lire = async (url, opts) => { pages.push(JSON.parse(opts.body)); return { ok: true, status: 200, json: async () => ({ organizations: [{ id: `o${pages.length}`, name: `Agence ${pages.length} Immo`, naics_codes: ['531210'] }], pagination: { total_pages: 1 } }) }; };
  const r = await A.agencesDeLaVille('Nice', { lire, max_requetes: 3 });
  assert.equal(r.requetes, 3, 'le plafond de recherches tient');
  assert.equal(r.agences.length, 3);
  assert.deepEqual(pages[0].organization_locations, ['Nice, France']);
  delete process.env.APOLLO_API_KEY;
  assert.equal(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier commercial', 'fonds de commerce'] }).specialite, 'generaliste');
  assert.ok(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier commercial'] }).score >= 3);
  assert.equal(MA.pertinence({ nom: 'Agence du Port', apollo_mots: ['immobilier de luxe', 'investissements immobiliers'] }).specialite, 'residentiel');
});

test("le mode essai : tout le parcours, et rien n'en sort (ni Monday, ni mail, ni carnet, ni stats)", async () => {
  const user = { email: 'jules.b@klocka.immo', role: 'admin' };
  const { session } = MA.ouvrirEssai(user);
  assert.equal(session.essai, true);
  const f = MA.fileDAppel(session.liste_id, user);
  assert.equal(f.file.length, 4, 'quatre agences fictives');
  const a1 = f.file[0];
  const a2 = f.file.find((x) => x.email && x.id !== a1.id);
  // Pas de réponse : le reçu dit que Monday n'est pas touché.
  const r1 = await MA.noterIssue({ agence_id: a1.id, issue: 'pas_de_reponse', session_id: session.id, user });
  assert.equal(r1.recu.monday, null);
  // A un bien : actions, validation, mail resté brouillon d'essai, Monday pas touché.
  const r2 = await MA.noterIssue({ agence_id: a2.id, issue: 'a_des_murs', session_id: session.id, recit: 'Marc a deux murs à vendre, rappeler le 20', user });
  assert.equal(r2.simple, false);
  const choix = r2.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  const v = await MA.validerIssue({ appel_id: r2.appel.id, choix, session_id: session.id, user, issue: 'a_des_murs' });
  assert.equal(v.ok, true);
  assert.equal(v.recu.monday.etat, 'info');
  assert.match(v.recu.monday.texte, /^Essai/);
  assert.match(v.recu.diffusion.texte, /^Essai/);
  if (v.recu.mail) assert.match(v.recu.mail.texte, /^Essai : le mail/);
  const { aEnvoyer } = await import('./mails.js');
  assert.ok(!aEnvoyer().some((m) => m.essai), "« À envoyer » ne voit pas l'essai");
  const { agents } = await import('./carnet.js');
  assert.ok(!agents().some((x) => x.essai), 'le carnet ne voit pas les fiches d\'essai');
  const { appels } = await import('./appel.js');
  assert.ok(!appels().some((x) => x.essai), 'les stats ne voient pas les appels d\'essai');
  const recap = MA.recapSession(session.id);
  assert.equal(recap.appels, 2);
  assert.equal(recap.monday_a_jour, true, "aucune ligne Monday en attente en essai");
  // Un nouvel essai repart de zéro.
  const { session: s2 } = MA.ouvrirEssai(user);
  assert.equal(MA.fileDAppel(s2.liste_id, user).file.length, 4);
  // La liste d'essai n'apparaît pas parmi les villes.
  const { listes } = await import('./agent-ia.js');
  assert.ok(!listes().some((l) => l.ville === 'Essai'));
});

test("le même réseau contacté ce mois-ci se signale, pas les mots génériques", () => {
  const lignes = [
    { id: 'a', nom: 'Bruno Rey Metropole Commerces', statut: {} },
    { id: 'b', nom: 'Metropole Commerces Cimiez', statut: { quand: '2026-10-02' } },
    { id: 'c', nom: 'Agence Immobilier Commerces', statut: { quand: '2026-10-03' } },
    { id: 'd', nom: 'Agence du Port Immobilier', statut: {} },
  ];
  assert.equal(MA.reseauDe(lignes[3], lignes, MAINTENANT, 'Nice'), null);
  assert.match(MA.reseauDe(lignes[0], lignes, MAINTENANT, 'Nice'), /Même réseau que Metropole Commerces Cimiez, contactée le 02\/10/);
});
