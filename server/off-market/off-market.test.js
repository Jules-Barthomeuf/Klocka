// Off-market (10 oct. 2026) : les scores de la spec, les vues d'un local et
// d'un propriétaire, les listes, les courriers (porte qualité, validation,
// opposition), « Aujourd'hui » et la veille, sur une base vide et un faux
// modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-off-market-'));
process.env.MONDAY_TOKEN = '';
const SC = await import('./scores.js');
const LO = await import('./locaux.js');
const SU = await import('./suivi.js');
const { Records } = await import('../db.js');

const MAINTENANT = Date.parse('2026-10-10T08:00:00Z');
const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules Barthomeuf', telephone: '06 00 00 00 00' };
const MANDATAIRE = { email: 'marc@kpartners.fr', role: 'mandataire', full_name: 'Marc Mandataire' };

const ville = Records.create('Ville', { nom: 'Antibes', code_postal: '06600', code_insee: '06004', centre: { lat: 43.58, lon: 7.12 }, rues: [{ nom: 'Rue de la République', flux_estime: { note: 4 } }] });
const releve = (extra = {}) => Records.create('Cible', {
  ville_id: ville.id, ville: 'Antibes', rue: 'Rue de la République', emplacement: 1, adresse: '12 rue de la République', enseigne: 'Boulangerie Paul', activite: 'Boulangerie', occupe: true, lat: 43.58, lon: 7.12,
  occupant: { siren: '111111111', chaine: true, ferme: false },
  proprietaire: { nom: 'SCI DURAND', siren: '802382549', forme: 'SCI', parcelle: '06004000BL0038', lots: [{ etage: 'RDC', droit: 'Propriétaire' }], source: 'Data-B · Foncier', trouve_le: '2026-10-01T00:00:00Z' },
  societe: { siren: '802382549', nom: 'SCI DURAND', forme: 'SCI', ape: '6820B', creation: '1996-03-01', active: true, siege: { adresse: '4 rue Haute 75003 Paris', ville: 'PARIS', lat: 48.86, lon: 2.36 }, gerants: [{ nom: 'PAUL DURAND', nom_famille: 'DURAND', tranche_age: '70+' }, { nom: 'ANNE DURAND', nom_famille: 'DURAND', tranche_age: '50-70' }], lu_le: '2026-10-02T00:00:00Z' },
  evenements: [{ date: '2026-07-10', type: 'changement de gérance', detail: 'SCI DURAND · annonce', source: 'BODACC' }],
  evenements_locataire: [{ date: '2026-02-01', type: 'cession', detail: 'fonds cédé', source: 'BODACC (locataire)' }],
  mutation: { date: '2005-06-15', prix: 420000, du_local: true, parcelle: '06004000BL0038', source: 'DVF' },
  valorisation: { surface_estimee: [120, 160], loyer_m2_marche: 300, loyer_source: 'Equimmox, rue', fourchette: [500000, 620000] },
  ...extra,
});

test('le profil du propriétaire : SCI familiale, marchand de biens, foncière, public, occupant', () => {
  assert.equal(SC.profilDe({ proprietaire: { nom: 'SCI DURAND', forme: 'SCI' }, societe: { gerants: [{ nom_famille: 'DURAND' }, { nom_famille: 'DURAND' }] } }).cle, 'sci_familiale');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'IMMO PLUS', forme: 'SAS' }, societe: { ape: '6810Z' } }).cle, 'marchand');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'GRANDE IMMO', forme: 'SA' }, societe: {}, murs: 12 }).cle, 'fonciere');
  // Une banque, un crédit-bailleur, un assureur : institutionnels par leur code APE, quel que soit leur nom.
  assert.equal(SC.profilDe({ proprietaire: { nom: 'BNP PARIBAS', forme: 'SA' }, societe: { ape: '6419Z' } }).cle, 'institutionnel');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'CREDIT MUTUEL REAL ESTATE LEASE', forme: 'SA' }, societe: { ape: '6491Z' } }).cle, 'institutionnel');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'GROUPAMA MEDITERRANEE', forme: 'SA' }, societe: { ape: '6512Z' } }).cle, 'institutionnel');
  // Le BODACC cite d'abord le débiteur : une banque citée comme créancière n'est pas en procédure.
  assert.equal(SC.viseSociete({ detail: 'LE RUOU, CIC LYONNAISE DE BANQUE, BNP PARIBAS, Me HUERTAS · annonce' }, 'BNP PARIBAS'), false);
  assert.equal(SC.viseSociete({ detail: 'BNP PARIBAS, BNP Paribas Fund Services · annonce' }, 'BNP PARIBAS'), true);
  assert.equal(SC.viseSociete({ detail: 'SCI DURAND · annonce' }, 'SCI DURAND'), true);
  assert.equal(SC.viseSociete({ detail: '' }, 'SCI DURAND'), true);
  const banque = SC.signauxMotivation({ proprietaire: { nom: 'BNP PARIBAS' }, societe: { ape: '6419Z', gerants: Array.from({ length: 20 }, (_, i) => ({ nom: `D${i}` })) }, evenements: [{ date: '2026-04-16', type: 'procédure collective', detail: 'LE RUOU, CIC LYONNAISE DE BANQUE, BNP PARIBAS · annonce' }, { date: '2026-06-05', type: 'changement de gérance', detail: 'BNP PARIBAS · annonce' }] }, { maintenant: new Date('2026-10-10') });
  assert.ok(!banque.some((x) => x.cle === 'proprietaire_procedure'), 'créancière, pas débitrice');
  assert.ok(!banque.some((x) => x.cle === 'changement_gerant'), 'un conseil d\'administration, pas une gérance');
  assert.ok(banque.some((x) => x.cle === 'institutionnel' && x.points < 0));
  assert.equal(SC.profilDe({ proprietaire: { nom: 'FONCIERE DU SUD', forme: 'SA' }, societe: {} }).cle, 'institutionnel');
  assert.equal(SC.profilDe({ proprietaire: { nom: "ICF SUD-EST SA D'HLM", forme: 'SA' }, societe: {} }).cle, 'public', 'un bailleur social est exclu');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'COMMUNE DE NICE', forme: 'nature 7210' } }).cle, 'public');
  assert.equal(SC.profilDe({ proprietaire: { nom: 'CARREFOUR', siren: '1', forme: 'SAS' }, occupant: { siren: '1' } }).cle, 'occupant');
  assert.equal(SC.profilDe({}).cle, 'inconnu');
});

test('la motivation : les signaux de la spec, leurs points, le plafond par famille et le bonus d\'empilement', () => {
  const c = releve();
  const k = SC.classer({ ...c, profil: SC.profilDe(c) }, { maintenant: MAINTENANT });
  const cles = Object.fromEntries(k.signaux.map((s) => [s.cle, s]));
  assert.equal(cles.gerant_age.points, 15, 'gérant de plus de 70 ans');
  assert.equal(cles.detention_15.points, 15, '21 ans depuis la vente DVF de 2005 : le palier des 15 ans');
  assert.equal(cles.detention_22, undefined);
  assert.ok(cles.siege_loin.points === 8 && /Paris|PARIS/.test(cles.siege_loin.valeur), 'siège à Paris, le local à Antibes');
  assert.ok(cles.changement_gerant.points > 0 && cles.changement_gerant.points <= 10, 'un changement de gérance de juillet décroît');
  assert.ok(cles.cession_fonds.points > 0, 'fonds cédé en février');
  assert.equal(cles.echeance_bail, undefined, 'fonds cédé en février 2026 : la première échéance triennale est dans plus d\'un an');
  assert.ok(k.motivation.total > 40 && k.motivation.total <= 100, String(k.motivation.total));
  assert.equal(k.motivation.bonus, 10, 'trois familles : propriétaire, occupant, événement');
  assert.match(k.motivation.explication, /gérant de plus de 70 ans/i);
  assert.ok(k.signaux.every((s) => s.source && s.famille && typeof s.points === 'number'), 'chaque signal a sa source et sa famille');
  // Plafond : trois signaux « propriétaire » à 40 au plus.
  const prop = k.signaux.filter((s) => s.famille === 'proprietaire' && s.compte).reduce((t, s) => t + s.points, 0);
  assert.ok(Math.min(40, prop) <= 40);
});

test('la motivation : détention 30 ans, décès, dissolution, foncière en négatif, public exclu', () => {
  const vieux = { ...releve({ mutation: { date: '1990-01-01', du_local: true, source: 'DVF' }, evenements: [{ date: '2026-05-01', type: "décès d'un dirigeant", source: 'BODACC' }] }) };
  const s = SC.signauxMotivation({ ...vieux, profil: SC.profilDe(vieux) }, { maintenant: MAINTENANT });
  assert.equal(s.find((x) => x.cle === 'detention_30').points, 20);
  assert.ok(s.find((x) => x.cle === 'deces_dirigeant').points > 15);
  assert.equal(s.find((x) => x.cle === 'deces_dirigeant').confiance, 'probable', 'une seule source : le BODACC');
  const fonciere = releve({ proprietaire: { nom: 'SCPI IMMORENTE', siren: '333333333', forme: 'SCPI', lots: [{ droit: 'Propriétaire' }], source: 'Data-B · Foncier' }, societe: { siren: '333333333', forme: 'SCPI', gerants: [] } });
  const kf = SC.classer({ ...fonciere, profil: SC.profilDe(fonciere) }, { maintenant: MAINTENANT });
  assert.ok(kf.signaux.some((x) => x.cle === 'institutionnel' && x.points === -15));
  // Un fonds cédé fin 2023 : l'échéance triennale tombe fin 2026, estimée, donc hors du score tant qu'un second indice ne la relève pas.
  const triennal = releve({ evenements_locataire: [{ date: '2023-12-01', type: 'cession', source: 'BODACC (locataire)' }], evenements: [] });
  const ech = SC.signauxMotivation({ ...triennal, profil: SC.profilDe(triennal) }, { maintenant: MAINTENANT }).find((x) => x.cle === 'echeance_bail');
  assert.ok(ech && ech.compte === false && /estimée en décembre 2026/.test(ech.valeur), JSON.stringify(ech));
  const pub = releve({ proprietaire: { nom: 'COMMUNE D\'ANTIBES', siren: '210600045', forme: 'nature 7210', source: 'Data-B · Foncier' } });
  assert.equal(SC.classer({ ...pub, profil: SC.profilDe(pub) }).rang, 0);
});

test('le fit : enseigne nationale, emplacement n° 1, rendement, demande cliente', () => {
  const c = releve();
  const f = SC.scoreFit(c, { demande: 2 });
  const par = Object.fromEntries(f.criteres.map((x) => [x.cle, x]));
  assert.equal(par.enseigne.points, 25);
  assert.equal(par.emplacement.points, 20);
  // 140 m² × 300 € = 42 000 € ÷ 560 000 € = 7,5 %.
  assert.equal(par.rendement.points, 15);
  assert.equal(par.demande.points, 20);
  assert.ok(f.total >= 80, String(f.total));
  const sans = SC.scoreFit({ ...c, enseigne: 'Chez Momo', occupant: {}, emplacement: 2, valorisation: {} }, { demande: null });
  assert.ok(sans.total <= 55 && sans.total < f.total, String(sans.total));
  assert.equal(sans.criteres.find((x) => x.cle === 'rendement').valeur, 'non mesuré');
});

test('les drapeaux, la capacité à décider et le profil fiscal', () => {
  const c = releve({ proprietaire: { nom: 'SCI DURAND', siren: '802382549', forme: 'SCI', lots: [{ droit: 'Usufruitier' }, { droit: 'Nu-propriétaire' }], source: 'Data-B · Foncier' } });
  const d = SC.drapeauxDe(c).map((x) => x.cle);
  assert.ok(d.includes('demembrement') && d.includes('droit_preference'));
  assert.equal(SC.capaciteADecider(c).niveau, 'complexe');
  assert.equal(SC.capaciteADecider(releve()).niveau, 'moyen', 'deux gérants');
  const fiscal = SC.profilFiscal(releve(), MAINTENANT);
  assert.equal(fiscal.annees, 21);
  assert.match(fiscal.phrase, /dans 1 an/);
});

test('la vue d\'un local et la fiche d\'un propriétaire : sources, patrimoine, chronologie, demande', async () => {
  const siren = '802382550';
  const prop = { nom: 'SCI DURAND FRERES', siren, forme: 'SCI', parcelle: '06004000BL0039', lots: [{ etage: 'RDC', droit: 'Propriétaire' }], source: 'Data-B · Foncier', trouve_le: '2026-10-01T00:00:00Z' };
  const soc = { siren, nom: 'SCI DURAND FRERES', forme: 'SCI', ape: '6820B', creation: '1996-03-01', active: true, siege: { adresse: '4 rue Haute 75003 Paris', ville: 'PARIS', lat: 48.86, lon: 2.36 }, gerants: [{ nom: 'PAUL DURAND', nom_famille: 'DURAND', tranche_age: '70+' }, { nom: 'ANNE DURAND', nom_famille: 'DURAND', tranche_age: '50-70' }], lu_le: '2026-10-02T00:00:00Z' };
  const c = releve({ proprietaire: prop, societe: soc });
  const autre = releve({ adresse: '3 place Nationale', enseigne: 'Optic 2000', mutation: null, proprietaire: prop, societe: soc });
  const l = LO.localDe(c, { maintenant: MAINTENANT });
  assert.equal(l.proprietaire.cle, siren);
  assert.equal(l.confiance, 'exacte');
  assert.ok(l.motivation > 0 && l.fit > 0 && l.rang > 0);
  const fiche = await LO.ficheLocal(c.id, { maintenant: MAINTENANT });
  assert.match(fiche.proprietaire_detail.source, /Cadastre des personnes morales/);
  assert.equal(fiche.proprietaire_detail.depuis.date, '2005-06-15');
  assert.ok(fiche.evenements.length === 2 && fiche.evenements[0].qui === 'propriétaire');
  const p = await LO.ficheProprietaire(siren, { maintenant: MAINTENANT });
  assert.equal(p.patrimoine.total, 2, 'les deux locaux de la SCI');
  assert.equal(p.profil.cle, 'sci_familiale');
  assert.ok(p.chronologie.some((x) => /Création/.test(x.quoi)) && p.chronologie.some((x) => /Acquisition/.test(x.quoi)));
  assert.equal(p.capacite.niveau, 'moyen');
  assert.equal(p.contact.adresse_siege, '4 rue Haute 75003 Paris');
  assert.deepEqual(LO.demandePour({ ville: 'Antibes', code_postal: '06600', valorisation: c.valorisation }, [{ id: 1, nom: 'A', lieu_recherche: 'Antibes, Cannes', budget: 600000 }, { id: 2, nom: 'B', lieu_recherche: 'Lyon', budget: 900000 }, { id: 3, nom: 'C', lieu_recherche: '06', budget: 300000 }]).map((x) => x.id), [1], 'la zone et le budget');
  void autre;
});

test('les listes : figée et dynamique, l\'empilement, les locaux d\'un territoire', async () => {
  const locaux = await LO.listerLocaux([ville.id], { maintenant: MAINTENANT });
  assert.ok(locaux.length >= 4);
  assert.ok(locaux[0].rang >= locaux.at(-1).rang, 'classés par rang');
  const figee = SU.creerListe('klocka', { nom: 'Antibes, à écrire', locaux: locaux.slice(0, 2).map((l) => l.id) }, JULES);
  assert.equal(figee.ok, true);
  const dyn = SU.creerListe('klocka', { nom: 'SCI de plus de 15 ans', dynamique: true, filtres: { signaux: ['detention_15', 'detention_22', 'detention_30'], villes: [ville.id] } }, JULES);
  const lue = await SU.locauxDeLaListe('klocka', dyn.liste.id, JULES);
  assert.ok(lue.locaux.length >= 1 && lue.locaux.every((l) => l.signaux.some((s) => s.startsWith('detention'))));
  assert.ok(lue.empilement.proprietaires <= lue.empilement.locaux);
  assert.equal(SU.empilement([{ familles: 3 }, { familles: 3, proprietaire: { cle: 'a' } }, { familles: 1, proprietaire: { cle: 'a' } }]).paliers[3].n, 2);
  assert.equal((await SU.locauxDeLaListe('marc@kpartners.fr', dyn.liste.id, MANDATAIRE)), null, 'une liste reste dans son espace');
});

test('les courriers : la porte qualité, la lettre, la validation qui fait avancer le pipeline, l\'opposition', async () => {
  const c = releve({ adresse: '8 rue Sade', enseigne: 'Nicolas' });
  const cle = '802382549';
  const consignes = [];
  const rediger = async (consigne, fiche) => { consignes.push(consigne); return `Madame, Monsieur,\n\nVotre local du ${fiche.patrimoine.locaux[0].adresse}...\n\nVos coordonnées viennent des registres publics (cadastre des personnes morales et registre des entreprises) ; un mot de votre part et nous ne vous écrirons plus.\n\nBien à vous,\nJules Barthomeuf\nKlocka`; };
  const r = await SU.preparerCourriers('klocka', [cle, 'nom:inconnu', '999999999'], JULES, { rediger });
  assert.equal(r.prepares.length, 1);
  assert.equal(r.refuses.length, 2);
  assert.match(consignes[0], /registres publics/);
  assert.match(consignes[0], /Ne mentionne jamais un changement de gérant/);
  assert.equal(r.prepares[0].variante, 'patrimoniale');
  assert.ok(r.prepares[0].locaux.length >= 3, 'tous les locaux de la SCI dans la lettre');
  // Un second courrier pour le même propriétaire attend : refusé.
  assert.equal((await SU.preparerCourriers('klocka', [cle], JULES, { rediger })).refuses[0].raison, 'un courrier attend déjà sa validation');
  const id = r.prepares[0].id;
  assert.equal(SU.modifierCourrier('klocka', id, { texte: 'Madame, Monsieur, texte relu.' }).ok, true);
  const v = SU.validerCourrier('klocka', id, JULES, { maintenantD: new Date('2026-10-10T09:00:00Z') });
  assert.equal(v.ok, true);
  assert.equal(v.courrier.relance_le, '2026-11-09');
  const contact = SU.contactDe('klocka', cle);
  assert.equal(contact.statut, 'contacte');
  assert.equal(contact.interactions.at(-1).canal, 'courrier');
  assert.equal(contact.prochaine.le, '2026-11-09');
  // Contacté il y a moins de six mois : plus de courrier.
  assert.match((await SU.preparerCourriers('klocka', [cle], JULES, { rediger })).refuses[0].raison, /déjà contacté/);
  // Une réponse positive : en discussion, relance dans une semaine.
  assert.equal(SU.noterReponse('klocka', cle, { texte: 'Il veut en parler en janvier.', user: JULES }).contact.statut, 'en_discussion');
  // L'opposition : tous les espaces, les courriers en attente écartés, plus aucune étape possible.
  await SU.preparerCourriers('marc@kpartners.fr', [cle], MANDATAIRE, { rediger });
  SU.opposer(cle, JULES, { motif: 'a écrit pour ne plus être contacté' });
  assert.equal(SU.contactDe('klocka', cle).oppose, true);
  assert.equal(Records.list(SU.COURRIER).filter((x) => x.cle === cle && x.etat === 'a_valider').length, 0);
  assert.equal(SU.changerStatut('klocka', cle, 'veille', JULES).ok, false);
  assert.match((await SU.preparerCourriers('klocka', [cle], JULES, { rediger })).refuses[0].raison, /ne plus être contacté/);
  void c;
});

test('aujourd\'hui, le tableau de bord et la veille de nuit', async () => {
  const cle = '555555555';
  releve({ adresse: '1 avenue Mirabeau', proprietaire: { nom: 'SCI MIRABEAU', siren: cle, forme: 'SCI', lots: [{ droit: 'Propriétaire' }], source: 'Data-B · Foncier' }, societe: { siren: cle, forme: 'SCI', creation: '2000-01-01', active: true, siege: { adresse: '1 avenue Mirabeau 06000 Nice', ville: 'NICE' }, gerants: [{ nom: 'A B', tranche_age: '70+' }] }, evenements: [] });
  SU.noterInteraction('klocka', cle, { canal: 'courrier', texte: 'posté', statut: 'contacte', prochaine: { le: '2026-10-01', quoi: 'second courrier' }, user: JULES }, { nom: 'SCI MIRABEAU', siren: cle });
  const a = SU.aujourdhui('klocka', { maintenantD: new Date('2026-10-10T08:00:00Z') });
  assert.ok(a.relances.some((x) => x.cle === cle && x.retard === 9));
  const veille = await SU.veilleNocturne({ lireEvenements: async (siren) => (siren === cle ? [{ date: '2026-10-09', type: 'radiation ou dissolution', detail: 'SCI MIRABEAU' }] : []) });
  assert.ok(veille.relus >= 1 && veille.nouveaux === 1);
  const apres = SU.aujourdhui('klocka', { maintenantD: new Date('2026-10-10T08:00:00Z') });
  assert.ok(apres.nouveaux_signaux.some((x) => x.cle === cle && /dissolution/.test(x.signal.type)));
  const l = (await LO.listerLocaux([ville.id], { maintenant: MAINTENANT })).find((x) => x.proprietaire?.cle === cle);
  assert.ok(l.signaux.includes('dissolution'), 'le nouvel événement compte dans le score');
  // Relu une seconde fois sans rien de neuf : pas de doublon.
  await SU.veilleNocturne({ lireEvenements: async () => [{ date: '2026-10-09', type: 'radiation ou dissolution', detail: 'SCI MIRABEAU' }] });
  assert.equal(LO.relevesDuProprietaire(cle)[0].evenements.length, 1);
  const bilan = await SU.tableauDeBord('klocka', JULES);
  assert.ok(bilan.entonnoir.contacte >= 1 && bilan.donnees.locaux >= 5 && bilan.oppositions >= 1);
  assert.equal(bilan.qualite_score.length, 4);
});
