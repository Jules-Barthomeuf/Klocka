// La prospection : doublons, suite d'un appel, liste du jour, propositions
// d'AK, sources, mails, tableau de bord, Monday.

import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'zlib';
import * as R from './regles.js';
import { agentsDesAnnonces, candidatsDuFichier, lireCsv } from './sources.js';
import { mailDeCriteres, prenomDeLAgent, mailRelance } from './mails.js';
import { siteDeLAlerte, candidatsDesAnnonces } from './alertes.js';
import { ficheDuCandidat, fusion, trouver } from './carnet.js';
import { propositions, messageDAK, decouperWav } from './appel.js';
import { tableauDeBord, recapitulatif } from './semaine.js';
import { colonneParTitre, valeursAgent, etapeMonday } from './monday.js';
import { nettoyer } from './reglages.js';
import { lireXlsx } from '../xlsx.js';

const vendrediMatin = new Date('2026-09-25T10:00:00+02:00');

test('un agent déjà connu : par mail, par téléphone, par nom et agence', () => {
  assert.equal(R.normTel('+33 6 51 96 69 14'), R.normTel('06.51.96.69.14'));
  assert.equal(R.normEmail('alerte@seloger.com'), null, 'une adresse de portail n\'est pas un agent');
  const index = R.indexer([{ id: 1, nom: 'Yannick Blanc', emails: ['y.blanc@pp.com'] }, { id: 2, nom: 'Ornella', telephones: ['06 67 45 22 33'] }]);
  assert.equal(R.dejaConnu(index, { email: 'Y.BLANC@pp.com' })?.id, 1);
  assert.equal(R.dejaConnu(index, { telephone: '+33667452233' })?.id, 2);
  assert.equal(R.dejaConnu(index, { nom: 'Sophie', telephone: '0612345678' }), null);
});

test('la suite d\'un appel, issue par issue', () => {
  const pdr = R.suiteDeLIssue('pas_de_reponse', { tentatives: 0, maintenant: vendrediMatin });
  assert.equal(pdr.prochaine.le, '2026-09-29', 'deux jours ouvrés');
  assert.match(pdr.prochaine.quoi, /essai 2 sur 3\), plutôt l'après-midi/);
  const troisieme = R.suiteDeLIssue('pas_de_reponse', { tentatives: 2, maintenant: vendrediMatin });
  assert.equal(troisieme.statut, 'pause');
  assert.deepEqual(troisieme.mails, ['sans_reponse']);
  assert.equal(troisieme.sms, true);
  assert.equal(troisieme.prochaine.le, '2026-10-26', 'un mois de pause, glissé au lundi');
  const murs = R.suiteDeLIssue('pas_de_murs', { maintenant: vendrediMatin, date_dite: '2026-10-31' });
  assert.deepEqual([murs.statut, murs.prochaine.le, murs.mails[0]], ['pas_de_murs', '2026-11-02', 'presentation'], 'la date du mandat, glissée au lundi');
  const a = R.suiteDeLIssue('a_des_murs', { maintenant: vendrediMatin });
  assert.deepEqual([a.mails[0], a.relance_mail_jours, a.prochaine.le], ['demande_fiche', 3, '2026-10-02']);
  assert.equal(R.suiteDeLIssue('pas_interesse', { maintenant: vendrediMatin }).prochaine.le, '2027-03-26');
  assert.deepEqual([R.suiteDeLIssue('invalide').statut, R.suiteDeLIssue('invalide').autre_contact], ['archive', true]);
});

test('la liste du jour : les relances d\'abord, puis ceux qui publient régulièrement dans la ville du jour', () => {
  const agents = [
    { id: '1', nom: 'Relance', telephones: ['0600000001'], prochaine: { quoi: 'rappeler pour le mandat', le: '2026-09-25' }, statut: 'pas_de_murs', dernier_contact_le: '2026-09-01' },
    { id: '2', nom: 'Gros Cannes', telephones: ['0600000002'], annonces_par_ville: { Cannes: 7 }, statut: 'nouveau' },
    { id: '3', nom: 'Vides Cannes', telephones: ['0600000003'], annonces_par_ville: { Cannes: 3 }, vides_par_ville: { Cannes: 2 }, statut: 'nouveau' },
    { id: '4', nom: 'Une seule annonce', telephones: ['0600000004'], annonces_par_ville: { Cannes: 1 }, statut: 'nouveau', source: 'Equimmox' },
    { id: '5', nom: 'Nice', telephones: ['0600000005'], annonces_par_ville: { Nice: 9 }, statut: 'nouveau' },
    { id: '6', nom: 'Appelé il y a 10 jours', telephones: ['0600000006'], annonces_par_ville: { Cannes: 9 }, dernier_contact_le: '2026-09-15', statut: 'pas_de_murs' },
    { id: '7', nom: 'Apollo Cannes', telephones: ['0600000007'], ville: 'Cannes', source: 'Apollo', statut: 'nouveau' },
    { id: '8', nom: 'En pause', telephones: ['0600000008'], annonces_par_ville: { Cannes: 12 }, statut: 'pause', prochaine: { quoi: 'six mois', le: '2027-03-01' } },
  ];
  const l = R.listeDuJour(agents, { villes: ['cannes'], maintenant: vendrediMatin });
  assert.deepEqual(l.map((a) => a.id), ['1', '3', '2', '7']);
  assert.match(l[1].raison, /3 annonces de commerce sur Equimmox dans la ville, dont 2 murs vides/);
  assert.deepEqual(R.listeDuJour(agents, { villes: [], maintenant: vendrediMatin }).map((a) => a.id), ['1'], 'sans ville du jour, les relances seules');
});

test('le verrou, le score, l\'heure de Paris', () => {
  assert.equal(R.heureDe(new Date('2026-09-25T03:30:00Z')), 5);
  assert.equal(R.verrouTenu({ par: 'a', le: new Date(Date.now() - 10 * 60000).toISOString() }), true);
  assert.equal(R.verrouTenu({ par: 'a', le: new Date(Date.now() - 40 * 60000).toISOString() }), false);
  assert.equal(R.scoreDe({ fiches: 3, oui: 1, non: 2 }), 41);
});

test('le carnet : un candidat devient une fiche, un connu est complété', () => {
  const f = ficheDuCandidat({ nom: 'Century 21 Cce', email: 'cce@c21.fr', telephone: '0493686869', ville: 'Cannes', annonces_par_ville: { Cannes: 7 }, vides_par_ville: { Cannes: 1 }, source: 'Equimmox', remarque: 'Equimmox : 7 annonces.' });
  assert.deepEqual([f.telephones, f.emails, f.statut, f.villes], [['04 93 68 68 69'], ['cce@c21.fr'], 'nouveau', ['Cannes']]);
  const m = fusion({ ...f, annonces_par_ville: { Cannes: 7, Nice: 2 }, vides_par_ville: { Cannes: 1 } }, { email: 'autre@c21.fr', annonces_par_ville: { Cannes: 9 }, vides_par_ville: {} });
  assert.deepEqual(m.emails, ['cce@c21.fr', 'autre@c21.fr']);
  assert.deepEqual(m.annonces_par_ville, { Cannes: 9, Nice: 2 });
  assert.equal(m.vides_par_ville.Cannes, 0, 'plus de murs vides à Cannes au dernier export');
  assert.equal(m.annonces, 11);
  const liste = [{ id: '1', nom: 'Rosario Aiello', agence: 'Aiello Immo', telephones: ['06 51 96 69 14'], ville: 'Cannes' }, { id: '2', nom: 'Century 21 Cce', ville: 'Cannes' }, { id: '3', nom: 'Century 21 Nice', ville: 'Nice' }];
  assert.deepEqual(trouver(liste, 'Rosario').map((a) => a.id), ['1']);
  assert.deepEqual(trouver(liste, '06 51 96 69 14').map((a) => a.id), ['1']);
  assert.deepEqual(trouver(liste, 'century 21 cannes').map((a) => a.id), ['2']);
  assert.equal(trouver(liste, 'century').length, 2, 'ambigu');
});

test('ce qu\'AK propose après un appel', () => {
  const a = { id: 'a1', nom: 'Sophie Martin', agence: 'Barnes', ville: 'Cannes', emails: ['sophie@barnes.fr'], telephones: ['06 12 34 56 78'], secteurs: ['Cannes'], statut: 'nouveau', tentatives: 0 };
  const { issue, propositions: p } = propositions(a, { resume: 'Rien pour l\'instant, un mandat de murs à Antibes fin octobre.', issue: 'pas_de_murs', date_dite: '2026-10-30', secteurs: ['Cannes', 'Antibes'], mandats: ['murs à Antibes, fin octobre'] }, { maintenant: vendrediMatin, criteres: '- Murs loués, 6,5 % net' });
  assert.equal(issue, 'pas_de_murs');
  assert.deepEqual(p.map((x) => x.id), ['statut', 'mail', 'relance', 'fiche']);
  assert.equal(p[1].a, 'sophie@barnes.fr');
  assert.match(p[1].corps, /^Bonjour Sophie,/);
  assert.match(p[1].corps, /6,5 % net/);
  assert.equal(p[2].prochaine.le, '2026-10-30');
  assert.deepEqual(p[3].infos.secteurs, ['Antibes']);
  const msg = messageDAK(a, { resume: 'Rien pour l\'instant.' }, p);
  assert.match(msg, /^Appel avec Sophie Martin \(Barnes\) : Rien pour l'instant\.\nVoici ce que je te propose :\n1\. Lui envoyer/);
  assert.match(msg, /Rien ne part sans toi/);
  const murs = propositions(a, { resume: 'Deux murs à Cannes.', issue: 'a_des_murs', mail_objet: 'Les murs de la rue d\'Antibes', mail_corps: 'Merci pour l\'appel. Pouvez-vous nous envoyer la fiche ?' }, { maintenant: vendrediMatin });
  assert.deepEqual(murs.propositions.map((x) => x.id), ['statut', 'mail', 'relance_mail', 'relance']);
  assert.match(murs.propositions[1].corps, /^Bonjour Sophie,\n\nMerci pour l'appel\..*\n\nBien à vous,\n\{signature\}$/s);
  const rien = propositions({ ...a, tentatives: 2 }, { issue: 'pas_de_reponse' }, { maintenant: vendrediMatin });
  assert.deepEqual(rien.propositions.map((x) => x.id), ['statut', 'mail', 'sms', 'relance'], 'au troisième échec : mail, SMS, pause');
  const invalide = propositions(a, { issue: 'invalide' }, { autres_de_l_agence: [{ id: 'b2', nom: 'Paul Barnes', telephones: ['0600000000'] }] });
  assert.deepEqual(invalide.propositions.map((x) => x.id), ['statut', 'autre_b2']);
});

test('un enregistrement découpé en morceaux de quatre minutes', () => {
  const freq = 8000;
  const pcm = Buffer.alloc(freq * 2 * 600); // dix minutes
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(freq, 24); h.writeUInt32LE(freq * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  const m = decouperWav(Buffer.concat([h, pcm]));
  assert.equal(m.length, 3);
  assert.equal(m[0].readUInt32LE(40), freq * 2 * 240);
  assert.equal(m[2].readUInt32LE(40), freq * 2 * 120);
  assert.equal(m[2].toString('ascii', 0, 4), 'RIFF');
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

test('l\'export Equimmox : un agent par mail, ses annonces par ville et ses murs vides', () => {
  const entete = ['publication date', 'deleted_date', 'asset class', 'city', 'address', 'price', 'surface', 'occupation', 'broker network', 'agency name', 'agent email', 'agent contact', 'provider', 'url'];
  const lignes = lireXlsx(xlsx([
    entete,
    ['46289', '', 'Commercial', 'Cannes', '24 Rue Hoche 06400 Cannes', '1620000', '127', 'false', 'Century 21, Century 21', 'century 21 cce, cce immobilier', 'cce@century21.fr, cce@century21.fr', '04 93 68 68 69', 'seloger, leboncoin', 'u1'],
    ['46200', '', 'Commercial', 'Cannes', '', '400000', '60', 'true', 'Century 21', 'century 21 cce', 'cce@century21.fr', '04 93 68 68 69', 'bureauxlocaux', 'u2'],
    ['46100', '', 'Office', 'Cannes', '', '300000', '50', 'false', '', 'bureaux sa', 'b@bureaux.fr', '0600000000', 'seloger', 'u4'],
    ['46100', '', 'Commercial', 'Cannes', '', '130000', '22', 'true', '', '', 'hidden', 'hidden', 'leboncoin', 'u5'],
  ]));
  const agents = agentsDesAnnonces(lignes, { ville: 'Cannes' });
  assert.equal(agents.length, 1);
  assert.deepEqual([agents[0].email, agents[0].annonces, agents[0].vides, agents[0].annonces_par_ville, agents[0].vides_par_ville], ['cce@century21.fr', 2, 1, { Cannes: 2 }, { Cannes: 1 }]);
  assert.match(agents[0].remarque, /2 annonces de commerce en vente à Cannes, dont 1 libre/);
});

test('un fichier Apollo ou une Google Sheet : les colonnes par leur nom', () => {
  const r = candidatsDuFichier(lireCsv('﻿First Name,Last Name,Title,Company,Email,Mobile Phone,City\nSophie,Martin,Directrice,Barnes,sophie@barnes.fr,"+33 6 12 34 56 78",Cannes\nPaul,Sans,,,,,Nice\n'), { source: 'Apollo' });
  assert.equal(r.sansContact, 1);
  assert.deepEqual([r.candidats[0].nom, r.candidats[0].telephone, r.candidats[0].agence], ['Sophie Martin', '06 12 34 56 78', 'Barnes']);
  const sheet = candidatsDuFichier(lireCsv('Nom;Agence;Téléphone;Ville\nRosario Aiello;Aiello Immo;06 51 96 69 14;Cannes\n'));
  assert.equal(sheet.candidats[0].agence, 'Aiello Immo');
});

test('les mails : critères, relance', () => {
  assert.equal(prenomDeLAgent('Sophie Martin'), 'Sophie');
  assert.equal(prenomDeLAgent('Century 21 Cce'), null);
  const m = mailDeCriteres({ nom: 'Century 21 Cce', ville: 'Cannes' }, { criteres: 'Bonjour {prenom},\n\nÀ {ville}, nous cherchons des murs.\n\n{signature}' });
  assert.match(m.corps, /^Bonjour,\n\nÀ Cannes, nous cherchons des murs\./);
  const r = mailRelance({ objet: 'Suite à notre échange', sous_genre: 'demande_fiche' }, { nom: 'Sophie Martin' }, vendrediMatin);
  assert.equal(r.objet, 'Re : Suite à notre échange');
  assert.match(r.corps, /mon mail du 25\/09\. Avez-vous pu retrouver la fiche du bien \?/);
});

test('les alertes des sites', () => {
  assert.equal(siteDeLAlerte({ de_email: 'noreply@alertes.seloger.com' }), 'SeLoger');
  const c = candidatsDesAnnonces([{ titre: 'Murs 80 m²', ville: 'Cannes', agence: 'Barnes', telephone: '0612345678' }, { titre: 'Local', ville: 'Cannes', agence: 'Barnes', telephone: '06 12 34 56 78' }, { titre: 'X', agence: 'Particulier' }], 'SeLoger');
  assert.deepEqual([c.length, c[0].annonces], [1, 2]);
});

test('le tableau de bord et le récapitulatif du vendredi', () => {
  const maintenant = new Date('2026-10-02T18:00:00+02:00');
  const t = tableauDeBord({
    appels: [
      { le: '2026-09-29T09:00:00Z', agent_id: 'a', issue: 'pas_de_murs', par: 'nora@k' },
      { le: '2026-09-29T09:30:00Z', agent_id: 'b', issue: 'pas_de_reponse', par: 'nora@k' },
      { le: '2026-09-30T09:30:00Z', agent_id: 'a', issue: 'a_des_murs', par: 'jules@k' },
      { le: '2026-09-20T09:30:00Z', agent_id: 'c', issue: 'a_des_murs', par: 'jules@k' },
    ],
    fiches: [
      { le: '2026-09-30T10:00:00Z', etape: 'oui', deal_id: 'd1', titre: 'Glacier' },
      { le: '2026-10-01T10:00:00Z', etape: 'non', deal_id: 'd2', titre: 'Devred' },
      { le: '2026-10-02T08:00:00Z', etape: 'recue', deal_id: 'd3', titre: 'Rambuteau', agent: 'Sophie' },
    ],
    agents: [{ id: 'a', nom: 'Sophie', score: 25, fiches: 1 }, { id: 'b', nom: 'Paul', score: 0 }, { id: 'c', nom: 'Rosario', score: 8, fiches: 1, prochaine: { le: '2026-09-28' } }],
    decisions: new Map([['d1', { le: '2026-10-01T10:00:00Z' }], ['d2', { le: '2026-10-01T12:00:00Z' }]]),
    maintenant,
  });
  assert.deepEqual([t.appels, t.agents_joints, t.dossiers_recus, t.oui, t.taux_oui, t.delai_reponse_h, t.relances_en_retard], [3, 1, 3, 1, 50, 13, 1]);
  assert.deepEqual(t.appels_par_personne, { 'nora@k': 2, 'jules@k': 1 });
  assert.equal(t.en_attente_de_decision[0].titre, 'Rambuteau');
  const r = recapitulatif(t);
  assert.match(r, /^Le point de la semaine : 3 appels, 1 agent joint, 3 dossiers reçus, 1 Oui \(50 % des dossiers tranchés\)\./);
  assert.match(r, /Les agents qui rapportent : Sophie \(1 fiche\), Rosario \(1 fiche\)\./);
  assert.match(r, /En attente de décision : Rambuteau\./);
});

test('Monday : colonnes par titre, valeurs d\'un agent, étape d\'un dossier', () => {
  assert.equal(colonneParTitre([{ id: 'x', title: 'Prochaine relance', type: 'date' }], ['Prochaine relance'], 'date'), 'x');
  const c = { agence: 'c1', statut: 'c2', prochaine: 'c3', prochaine_le: 'c4', score: 'c5', resume: 'c6', referent: 'c7' };
  const v = valeursAgent(c, { agence: 'Barnes', statut: 'pas_de_murs', prochaine: { quoi: 'point du mois', le: '2026-10-26' }, score: 25, resume_dernier_appel: 'rien' }, [{ id: 1, kind: 'person' }]);
  assert.deepEqual(v, { c1: 'Barnes', c2: { label: 'Pas de murs' }, c7: { personsAndTeams: [{ id: 1, kind: 'person' }] }, c3: 'point du mois', c4: { date: '2026-10-26' }, c5: '25', c6: { text: 'rien' } });
  assert.deepEqual(['recue', 'recue', 'oui', 'oui', 'non', 'presente'].map((e, i) => etapeMonday({ etape: e, verdict: i === 1 ? 'GO' : null, abandonne: i === 3 })), ['Reçu', 'Préanalysé', 'Oui', 'Abandonné', 'Non', 'Présenté au client']);
});

test('des réglages bornés', () => {
  const r = nettoyer({ villes: 'Cannes, Nice,\nCannes', villes_du_jour: ['Cannes'], par_nuit: -3 }, vendrediMatin);
  assert.deepEqual(r, { villes: ['Cannes', 'Nice'], villes_du_jour: { jour: '2026-09-25', villes: ['Cannes'] }, par_nuit: 0 });
});
