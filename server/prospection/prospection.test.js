// La prospection : doublons, relances, liste du jour, sources, mails, messages.

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import * as R from './regles.js';
import { agentsDesAnnonces, candidatsDuFichier, lireCsv, casse } from './sources.js';
import { mailDeCriteres, prenomDeLAgent } from './mails.js';
import { siteDeLAlerte, candidatsDesAnnonces } from './alertes.js';
import { messageDuMatin, pointDeLaSemaine, aParis } from './matin.js';
import { colonneParTitre, valeursProspect } from './monday.js';
import { trouverProspects, nettoyerReglages } from './index.js';
import { lireXlsx } from '../xlsx.js';

test('les statuts de Monday, lus en clés', () => {
  assert.equal(R.cleStatut('À recontacter'), 'a_recontacter');
  assert.equal(R.cleStatut('Pas de réponse'), 'pas_de_reponse');
  assert.equal(R.cleStatut('No rep'), 'pas_de_reponse');
  assert.equal(R.cleStatut('Contact régulier'), 'regulier');
  assert.equal(R.cleStatut('Passé en Agent immo'), 'converti');
  assert.equal(R.cleStatut(''), null);
});

test('un agent déjà connu : par mail, par téléphone, par nom et agence', () => {
  assert.equal(R.normTel('+33 6 51 96 69 14'), R.normTel('06.51.96.69.14'));
  assert.equal(R.normEmail('Yannick <Y.Blanc@proprietes-privees.com>'), 'y.blanc@proprietes-privees.com');
  assert.equal(R.normEmail('alerte@seloger.com'), null, 'une adresse de portail n\'est pas un agent');
  const connus = [
    { nom: 'Yannick Blanc', email: 'y.blanc@proprietes-privees.com' },
    { nom: 'Ornella Montella', telephone: '0667452233' },
    { nom: 'Rosario Aiello', agence: 'Aiello Immobilier' },
  ];
  const candidats = [
    { nom: 'Y. Blanc', email: 'Y.BLANC@proprietes-privees.com' },
    { nom: 'Ornella', telephone: '+33 6 67 45 22 33' },
    { nom: 'rosario aiello', agence: 'Aiello immobilier' },
    { nom: 'Sophie Martin', agence: 'Barnes', telephone: '06 12 34 56 78' },
    { nom: 'Sophie M.', telephone: '0612345678' },
    { nom: 'Sans contact' },
  ];
  assert.deepEqual(R.nouveauxAgents(candidats, connus).map((c) => c.nom), ['Sophie Martin'], 'deux sources pour le même agent n\'en font qu\'un');
});

test('la prochaine relance : jours ouvrés, trois essais puis trois mois, la date dite', () => {
  const vendredi = new Date('2026-09-25T10:00:00+02:00');
  assert.deepEqual(R.prochaineRelance('pas_de_reponse', { tentatives: 1, maintenant: vendredi }), { date: '2026-09-29' }, 'vendredi + 2 jours ouvrés = mardi');
  assert.deepEqual(R.prochaineRelance('pas_de_reponse', { tentatives: 3, maintenant: vendredi }), { date: '2026-12-24', dormant: true });
  assert.deepEqual(R.prochaineRelance('a_recontacter', { dite: '2026-09-28', maintenant: vendredi }), { date: '2026-09-28' });
  assert.deepEqual(R.prochaineRelance('a_recontacter', { dite: '2026-09-27', maintenant: vendredi }), { date: '2026-09-28' }, 'un dimanche glisse au lundi');
  assert.deepEqual(R.prochaineRelance('a_recontacter', { maintenant: vendredi }), { date: '2026-10-02' });
  assert.deepEqual(R.prochaineRelance('interesse', { maintenant: vendredi }), { date: '2026-10-09' });
  assert.deepEqual(R.prochaineRelance('regulier', { maintenant: vendredi }), { date: '2026-10-26' }, 'samedi 24 octobre + 30 → lundi 26');
  assert.deepEqual(R.prochaineRelance('mort', { maintenant: vendredi }), { date: null });
});

test('la liste du jour : les dus, dans l\'ordre, partagés sans doublon, figés dans la journée', () => {
  const maintenant = new Date('2026-09-25T08:00:00+02:00');
  const prospects = [
    { id: '1', nom: 'Promis', statut: 'À recontacter', prochaine_relance: '2026-09-25', telephone: '0600000001', collaborateurs: [] },
    { id: '2', nom: 'Nouveau petit', statut: 'Nouveau contact', telephone: '0600000002', collaborateurs: [] },
    { id: '3', nom: 'Nouveau gros', statut: 'Nouveau contact', telephone: '0600000003', collaborateurs: [] },
    { id: '4', nom: 'Plus tard', statut: 'À recontacter', prochaine_relance: '2026-10-01', telephone: '0600000004', collaborateurs: [] },
    { id: '5', nom: 'Mort', statut: 'Mort', telephone: '0600000005', collaborateurs: [] },
    { id: '6', nom: 'A Paul', statut: 'Pas de réponse', prochaine_relance: '2026-09-24', telephone: '0600000006', collaborateurs: ['paul@k.fr'] },
    { id: '7', nom: 'Sans numéro', statut: 'Nouveau contact', collaborateurs: [] },
  ];
  const suivis = { 2: { annonces: 1, source: 'Equimmox' }, 3: { annonces: 12, source: 'Equimmox' }, 6: { tentatives: 1 } };
  const extras = [{ id: 'dossier:d1', genre: 'dossier', nom: 'Laurent', raison: 'relancer pour le bail', collaborateurs: [] }];
  const r = R.listeDuJour(prospects, { prospecteurs: ['jules@k.fr', 'paul@k.fr'], suivis, maintenant, extras });
  const tous = [...r.parPersonne['jules@k.fr'], ...r.parPersonne['paul@k.fr']].map((p) => p.id).sort();
  assert.deepEqual(tous, ['1', '2', '3', '6', 'dossier:d1']);
  assert.ok(r.parPersonne['paul@k.fr'].some((p) => p.id === '6'), 'un agent attitré reste à sa personne');
  const jules = r.parPersonne['jules@k.fr'];
  assert.ok(jules.findIndex((p) => p.id === '3') < jules.findIndex((p) => p.id === '2') || !jules.some((p) => p.id === '2'), 'le gros publieur avant le petit');
  assert.match(r.parPersonne['paul@k.fr'].find((p) => p.id === '6').raison, /essai 2 sur 3/);
  // Le lendemain matin, rien ; dans la journée, la répartition ne bouge pas.
  const r2 = R.listeDuJour(prospects.filter((p) => p.id !== '1'), { prospecteurs: ['jules@k.fr', 'paul@k.fr'], suivis, maintenant, extras, fige: r.attribution });
  for (const [id, qui] of Object.entries(r2.attribution)) assert.equal(qui, r.attribution[id], `${id} reste chez ${r.attribution[id]}`);
  const plein = R.listeDuJour(prospects, { prospecteurs: ['jules@k.fr'], suivis, maintenant, max: 2 });
  assert.equal(plein.parPersonne['jules@k.fr'].length, 2);
  assert.equal(plein.reportes.length, 2);
});

test('ce qui a bougé dans Monday est un appel ; la relance touchée à la main est respectée', () => {
  const avant = R.instantaneDe([{ id: '1', statut: 'Nouveau contact' }, { id: '2', statut: 'Pas de réponse', remarques: '' }, { id: '3', statut: 'Moyenne' }]);
  const ch = R.changements(avant, [
    { id: '1', statut: 'Pas de réponse' },
    { id: '2', statut: 'Pas de réponse', remarques: 'rappeler après 14 h', prochaine_relance: '2026-10-01' },
    { id: '3', statut: 'Moyenne' },
    { id: '4', statut: 'Nouveau contact' },
  ]);
  assert.deepEqual(ch.map((c) => [c.id, c.relance_touchee]), [['1', false], ['2', true]]);
});

test('une remarque datée devant les précédentes', () => {
  assert.equal(R.ajouterRemarque('24/09 : répondeur', 'deux murs à Cannes', { maintenant: new Date('2026-09-25T10:00:00+02:00'), par: 'Jules' }), '25/09 Jules : deux murs à Cannes / 24/09 : répondeur');
});

// Un .xlsx minimal, fait à la main : une archive zip avec les chaînes partagées et une feuille.
function xlsx(lignes) {
  const chaines = [...new Set(lignes.flat())];
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, '&apos;');
  const partagees = `<sst>${chaines.map((c) => `<si><t>${esc(c)}</t></si>`).join('')}</sst>`;
  const lettre = (i) => String.fromCharCode(65 + i);
  const feuille = `<worksheet><sheetData>${lignes.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => `<c r="${lettre(c)}${r + 1}" t="s"><v>${chaines.indexOf(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const fichiers = [['xl/sharedStrings.xml', partagees], ['xl/worksheets/sheet1.xml', feuille]];
  const locaux = []; const central = []; let decalage = 0;
  for (const [nom, contenu] of fichiers) {
    const donnees = zlib.deflateRawSync(Buffer.from(contenu));
    const n = Buffer.from(nom);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(8, 8); l.writeUInt32LE(donnees.length, 18); l.writeUInt32LE(contenu.length, 22); l.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(8, 10); c.writeUInt32LE(donnees.length, 20); c.writeUInt32LE(contenu.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(decalage, 42);
    locaux.push(l, n, donnees); central.push(c, n);
    decalage += 30 + n.length + donnees.length;
  }
  const taille = central.reduce((t, b) => t + b.length, 0);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10); fin.writeUInt32LE(taille, 12); fin.writeUInt32LE(decalage, 16);
  return Buffer.concat([...locaux, ...central, fin]);
}

test('l\'export Equimmox : un agent par mail, ses annonces comptées, les masqués et les bureaux laissés', () => {
  const entete = ['publication date', 'deleted_date', 'asset class', 'city', 'address', 'price', 'surface', 'broker network', 'agency name', 'agent email', 'agent contact', 'provider', 'url'];
  const lignes = lireXlsx(xlsx([
    entete,
    ['46289', '', 'Commercial', 'Cannes', '24 Rue Hoche 06400 Cannes', '1620000', '127', 'Century 21, Century 21', 'century 21 cce, cce immobilier d\'entreprise', 'cce@century21.fr, cce@century21.fr', '04 93 68 68 69, 04 93 68 68 69', 'seloger, leboncoin', 'https://app.equimmox.com/resultat?id=1'],
    ['46200', '', 'Commercial', 'Cannes', '', '400000', '60', 'Century 21', 'century 21 cce', 'cce@century21.fr', '04 93 68 68 69', 'bureauxlocaux', 'u2'],
    ['46100', '', 'Commercial', 'Cannes', '', '300000', '50', '', 'realpoint immobilier, office patrimonial', 'romain@realpoint.com, info@office.com', '0659929054, 0607243998', 'properstar', 'u3'],
    ['46100', '', 'Office', 'Cannes', '', '300000', '50', '', 'bureaux sa', 'b@bureaux.fr', '0600000000', 'seloger', 'u4'],
    ['46100', '', 'Commercial', 'Cannes', '', '130000', '22', '', '', 'hidden', 'hidden', 'leboncoin', 'u5'],
    ['46100', '46150', 'Commercial', 'Cannes', '', '130000', '22', '', 'retiree', 'r@r.fr', '0611111111', 'seloger', 'u6'],
  ]));
  assert.equal(lignes.length, 6);
  const agents = agentsDesAnnonces(lignes, { ville: 'Cannes' });
  assert.deepEqual(agents.map((a) => [a.email, a.annonces]), [['cce@century21.fr', 2], ['info@office.com', 1], ['romain@realpoint.com', 1]]);
  assert.equal(agents[0].agence, 'Century 21 Cce (Century 21)');
  assert.equal(agents[0].telephone, '04 93 68 68 69');
  assert.equal(agents[0].adresse, '24 Rue Hoche 06400 Cannes', 'l\'adresse de la dernière annonce');
  assert.equal(agents[2].agence, 'Realpoint Immobilier', 'deux agences sur un bien : chacune le sien');
  assert.match(agents[0].remarque, /2 annonces de commerce en vente à Cannes, la dernière du 24\/09\/2026/);
  assert.equal(casse("cce immobilier d'entreprise"), "Cce Immobilier D'Entreprise");
});

test('un fichier Apollo ou une Google Sheet : les colonnes par leur nom', () => {
  const apollo = lireCsv('﻿First Name,Last Name,Title,Company,Email,Mobile Phone,City\nSophie,Martin,Directrice,Barnes,sophie@barnes.fr,"+33 6 12 34 56 78",Cannes\nPaul,Sans,,,,,Nice\n');
  const r = candidatsDuFichier(apollo, { source: 'Apollo' });
  assert.equal(r.sansContact, 1);
  assert.deepEqual(r.candidats[0], { nom: 'Sophie Martin', agence: 'Barnes', email: 'sophie@barnes.fr', telephone: '06 12 34 56 78', ville: 'Cannes', adresse: null, source: 'Apollo', annonces: 0, remarque: 'Apollo : Directrice.' });
  const sheet = candidatsDuFichier(lireCsv('Nom;Agence;Téléphone;Ville\nRosario Aiello;Aiello Immo;06 51 96 69 14;Cannes\n'), { source: 'Google Sheet' });
  assert.equal(sheet.candidats[0].telephone, '06 51 96 69 14');
  assert.equal(sheet.candidats[0].agence, 'Aiello Immo');
});

test('le mail de critères : le prénom quand c\'est une personne, le texte des réglages', () => {
  assert.equal(prenomDeLAgent('Sophie Martin'), 'Sophie');
  assert.equal(prenomDeLAgent('Century 21 Cce'), null);
  const m = mailDeCriteres({ nom: 'Sophie Martin', agence: 'Barnes', ville: 'Cannes' }, { criteres: '- Murs loués, 6,5 % net minimum' });
  assert.match(m.corps, /^Bonjour Sophie,/);
  assert.match(m.corps, /- Murs loués, 6,5 % net minimum/);
  assert.match(m.corps, /\{signature\}$/);
  const entier = mailDeCriteres({ nom: 'Century 21 Cce', ville: 'Cannes' }, { criteres: 'Bonjour {prenom},\n\nÀ {ville}, nous cherchons des murs.\n\n{signature}' });
  assert.match(entier.corps, /^Bonjour,\n\nÀ Cannes, nous cherchons des murs\./);
});

test('les alertes des sites : reconnues par l\'expéditeur, une agence par candidat', () => {
  assert.equal(siteDeLAlerte({ de_email: 'noreply@alertes.seloger.com' }), 'SeLoger');
  assert.equal(siteDeLAlerte({ de_email: 'sophie@barnes.fr' }), null);
  const c = candidatsDesAnnonces([
    { titre: 'Murs loués 80 m²', ville: 'Cannes', agence: 'Barnes Cannes', telephone: '06 12 34 56 78' },
    { titre: 'Local 120 m²', ville: 'Cannes', agence: 'Barnes Cannes', telephone: '0612345678' },
    { titre: 'Boutique', ville: 'Nice', agence: 'Particulier' },
    { titre: 'Sans agence', ville: 'Nice' },
  ], 'SeLoger');
  assert.equal(c.length, 1);
  assert.equal(c[0].annonces, 2);
  assert.equal(c[0].source, 'alerte SeLoger');
});

test('le message du matin et le point du lundi', () => {
  const liste = [
    { nom: 'Century 21 Cce', agence: 'Century 21 Cce', telephone_affiche: '04 93 68 68 69', raison: 'premier appel (Equimmox), 7 annonces commerciales à Cannes' },
    { nom: 'Rosario Aiello', agence: 'Aiello Immo', telephone_affiche: '06 51 96 69 14', raison: 'rappel promis pour le 25/09', remarques: '24/09 Jules : deux murs à Cannes / 20/09 : répondeur' },
  ];
  const texte = messageDuMatin(liste, { prenom: 'Jules', lien: 'https://k/Prospection' });
  assert.match(texte, /^Jules, tes appels du jour : 2\./);
  assert.match(texte, /2\. Rosario Aiello \(Aiello Immo\), 06 51 96 69 14 : rappel promis pour le 25\/09 ; dernier mot : « 24\/09 Jules : deux murs à Cannes »/);
  assert.equal(messageDuMatin([], {}), null);
  const maintenant = new Date('2026-10-05T09:30:00+02:00');
  const p = pointDeLaSemaine({
    fiches: [
      { le: '2026-09-29T10:00:00Z', etape: 'oui', agent_email: 'a@x.fr' },
      { le: '2026-09-30T10:00:00Z', etape: 'non', agent_email: 'b@x.fr' },
      { le: '2026-10-01T10:00:00Z', etape: 'recue' },
    ],
    appels: Array.from({ length: 27 }, () => ({ le: '2026-09-30T10:00:00Z', statut: 'Pas de réponse' })),
    sourceDe: (e) => (e === 'a@x.fr' ? 'Equimmox' : null),
    maintenant,
  });
  assert.equal(p.semaine, '2026-09-28');
  assert.match(p.texte, /3 fiches reçues \(record : 3, battu cette semaine\), 1 Oui \(33 %\)/);
  assert.match(p.texte, /27 appels de prospection, soit 9 appels par fiche/);
  assert.match(p.texte, /1 par Equimmox/);
  assert.deepEqual(aParis(new Date('2026-09-28T06:30:00Z')), { heure: 8, jour: 1 });
});

test('Monday : les colonnes par leur titre, les valeurs au bon format', () => {
  const cols = [{ id: 'name', title: 'Name', type: 'name' }, { id: 'status', title: 'Priorité Status', type: 'status' }, { id: 'date4', title: 'Date', type: 'date' }, { id: 'date_x', title: 'Prochaine relance', type: 'date' }, { id: 't1', title: 'Remarques', type: 'text' }];
  assert.equal(colonneParTitre(cols, ['Priorité Status', 'Priorité'], 'status'), 'status');
  assert.equal(colonneParTitre(cols, ['Prochaine relance'], 'date'), 'date_x');
  const v = valeursProspect({ statut: 'status', prochaine_relance: 'date_x', remarques: 't1', date: 'date4' }, { statut: 'interesse', prochaine_relance: '2026-10-09', remarques: 'critères demandés' });
  assert.deepEqual(v, { t1: 'critères demandés', status: { label: 'Intéressé' }, date_x: { date: '2026-10-09' } });
  assert.deepEqual(valeursProspect({ prochaine_relance: 'date_x' }, { prochaine_relance: null }), { date_x: null }, 'une relance effacée');
});

test('retrouver l\'agent dicté à AK, et des réglages bornés', () => {
  const liste = [
    { id: '1', nom: 'Rosario Aiello', agence: 'Aiello Immo', telephone: '0651966914', ville: 'Cannes' },
    { id: '2', nom: 'Century 21 Cce', agence: 'Century 21', ville: 'Cannes' },
    { id: '3', nom: 'Century 21 Nice', agence: 'Century 21', ville: 'Nice' },
  ];
  assert.deepEqual(trouverProspects(liste, 'Rosario').map((p) => p.id), ['1']);
  assert.deepEqual(trouverProspects(liste, '06 51 96 69 14').map((p) => p.id), ['1']);
  assert.deepEqual(trouverProspects(liste, 'century 21 cannes').map((p) => p.id), ['2']);
  assert.deepEqual(trouverProspects(liste, 'century').map((p) => p.id).sort(), ['2', '3']);
  const r = nettoyerReglages({ villes: 'Cannes, Nice,\nCannes', prospecteurs: ['Jules.B@klocka.immo', 'pas une adresse'], max: 500, par_nuit: -3 });
  assert.deepEqual(r, { villes: ['Cannes', 'Nice'], prospecteurs: ['jules.b@klocka.immo'], max: 80, par_nuit: 0 });
});
