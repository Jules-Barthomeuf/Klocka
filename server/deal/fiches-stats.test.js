// L'onglet Fiches commerciales : la remise à zéro, les étapes, les semaines,
// le record, et le vrai agent de chaque fiche.

import test from 'node:test';
import assert from 'node:assert/strict';
import { etapeDuDossier, listerFiches, statsParSemaine, recordDeFiches, semaineDe, expediteurDOrigine, agentDeLaFiche } from './fiches-stats.js';

const lot = { lot: { adresse: { valeur: { ville: 'Paris' } } }, evaluation: { verdict: 'GO' } };
const equipe = (e) => /@klocka\.immo$/.test(e) || e === 'jules.btmf@gmail.com';

test('les étapes : reçue, Oui, présentée, aboutie ; un projet sans client reste un Oui', () => {
  const projets = new Map([['d3', { id: 'p3' }], ['d4', { id: 'p4', client_emails: ['c@x.fr'] }], ['d5', { id: 'p5', statut: 'signe', client_email: 'c@x.fr' }]]);
  assert.equal(etapeDuDossier({ deal_id: 'd0', statut: 'analyse' }, projets), 'recue');
  assert.equal(etapeDuDossier({ deal_id: 'd1', statut: 'documents_demandes' }, projets), 'oui');
  assert.equal(etapeDuDossier({ deal_id: 'd1b', statut: 'abandonne', suivi: [{ intention: 'demande_documents' }] }, projets), 'oui', 'abandonné après un Oui : le Oui compte');
  assert.equal(etapeDuDossier({ deal_id: 'd2', statut: 'abandonne' }, projets), 'non');
  assert.equal(etapeDuDossier({ deal_id: 'd3', statut: 'projet_cree' }, projets), 'oui');
  assert.equal(etapeDuDossier({ deal_id: 'd4' }, projets), 'presente');
  assert.equal(etapeDuDossier({ deal_id: 'd5' }, projets), 'abouti');
});

test('le vrai agent : jamais quelqu\'un de l\'équipe, l\'expéditeur d\'origine d\'un transfert, la correction d\'abord', () => {
  const transfert = { de: 'Jules Barthomeuf <jules.btmf@gmail.com>', de_email: 'jules.btmf@gmail.com', texte: "Voilà la fiche\n\n---------- Message transféré ---------\nDe : Laurent Sebban <laurent.sebban@pointdevente.fr>\nDate : 23 sept.\nObjet : Glacier" };
  assert.deepEqual(expediteurDOrigine(transfert.texte, equipe), { email: 'laurent.sebban@pointdevente.fr', nom: 'Laurent Sebban' });
  assert.deepEqual(agentDeLaFiche({ mail: transfert }, equipe), { email: 'laurent.sebban@pointdevente.fr', nom: 'Laurent Sebban' });
  assert.deepEqual(agentDeLaFiche({ mail: { de: 'Sophie <sophie@barnes.fr>', de_email: 'sophie@barnes.fr' } }, equipe), { email: 'sophie@barnes.fr', nom: 'Sophie' });
  assert.equal(agentDeLaFiche({ mail: { de_email: 'paul.dz@klocka.immo', texte: 'rien' }, contact: 'paul.dz@klocka.immo' }, equipe), null, 'Paul n\'est pas un agent');
  assert.deepEqual(agentDeLaFiche({ corrige: { nom: 'Rosario Aiello', email: 'a.r@wanadoo.fr' }, mail: transfert }, equipe), { email: 'a.r@wanadoo.fr', nom: 'Rosario Aiello', corrige: true });
});

test('la remise à zéro : seules les fiches arrivées depuis comptent, une fois chacune', () => {
  const deals = [
    { deal_id: 'd1', nom: 'Glacier - Paris', created_date: '2026-09-25T11:15:00Z', source: {}, lots: [lot], source_mail: { mail_recu_id: 'm1' }, statut: 'documents_demandes' },
    { deal_id: 'vieux', nom: 'Essai d\'avant', created_date: '2026-09-20T10:00:00Z', source: {}, lots: [lot] },
    { deal_id: 'coquille', nom: 'Nommé à la main', created_date: '2026-09-25T10:00:00Z', lots: [] },
  ];
  const mails = [
    { id: 'm1', date: '2026-09-25T11:07:00Z', de: 'Laurent Sebban <laurent@pdv.fr>', de_email: 'laurent@pdv.fr', compte: 'jules.b@klocka.immo', deal_id: 'd1', pieces_jointes: [{ nom: 'fiche.pdf' }] },
    { id: 'm2', date: '2026-09-25T13:00:00Z', de_email: 'sophie@barnes.fr', objet: 'Murs Lyon', compte: 'sourcing@klocka.immo', pieces_jointes: [{ nom: 'Fiche Lyon.pdf' }] },
    { id: 'm3', date: '2026-09-25T13:30:00Z', de_email: 'nora.l@klocka.immo', interne: true, texte: 'on regarde ?', pieces_jointes: [{ nom: 'fiche.pdf' }] },
  ];
  const f = listerFiches({ deals, mails, projets: [] }, { depuis: '2026-09-24T22:00:00.000Z', estInterne: equipe });
  assert.deepEqual(f.map((x) => x.id), ['mail:m2', 'd1'], 'ni l\'essai d\'avant la remise à zéro, ni la coquille, ni l\'échange interne');
  assert.equal(f[1].le, '2026-09-25T11:07:00Z', 'la date d\'arrivée du mail, pas celle du dossier');
  assert.equal(f[1].agent, 'Laurent Sebban');
  assert.equal(f[0].a_preanalyser, true);
  assert.equal(f[0].par_mail, true);
  assert.equal(f[1].par_mail, true);
});

test('les semaines et le record', () => {
  const maintenant = new Date('2026-10-02T12:00:00Z');
  assert.equal(semaineDe('2026-09-25T12:00:00Z'), '2026-09-21');
  const fiches = [
    { le: '2026-09-29T10:00:00Z', etape: 'presente' },
    { le: '2026-09-30T10:00:00Z', etape: 'non' },
    { le: '2026-09-25T10:00:00Z', etape: 'oui' },
    { le: '2026-09-25T11:00:00Z', etape: 'recue' },
    { le: '2026-09-26T10:00:00Z', etape: 'abouti' },
  ];
  const s = statsParSemaine(fiches, { semaines: 2, maintenant });
  assert.deepEqual(s.map((x) => x.semaine), ['2026-09-21', '2026-09-28']);
  assert.deepEqual(s[0], { semaine: '2026-09-21', fiches: 3, oui: 2, presente: 1, abouti: 1 });
  assert.deepEqual(s[1], { semaine: '2026-09-28', fiches: 2, oui: 1, presente: 1, abouti: 0 });
  assert.deepEqual(recordDeFiches(fiches), { semaine: '2026-09-21', fiches: 3 });
});

test('un transfert à sourcing@ compte ses biens rentrés, et compte aussi quand rien n\'est rentré (20 nov. 2026, Jules)', () => {
  const base = { compte: 'sourcing@klocka.immo', de_email: 'maxime.p@klocka.immo', interne: true, date: '2026-11-18T09:00:00.000Z', texte: 'Pour info', pieces_jointes: [{ nom: 'scan001.pdf' }] };
  const mails = [
    { ...base, id: 'm4', objet: 'TR: 4 biens', memoire_ids: ['b1', 'b2', 'b3', 'b4'] },
    { ...base, id: 'm0', objet: 'TR: rien lu' },
    { ...base, id: 'mdeja', objet: 'TR: renvoi', memoire_deja_ids: ['b1'] },
    { ...base, id: 'mdocs', objet: 'TR: le bail', haka_transfert: { intention: 'documents' } },
    { ...base, id: 'mperso', compte: 'maxime.p@klocka.immo', objet: 'TR: un mail sans fiche' },
  ];
  const f = listerFiches({ mails }, { estInterne: equipe });
  const par = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(par).sort(), ['mail:m0', 'mail:m4']);
  assert.equal(par['mail:m4'].biens, 4);
  assert.equal(par['mail:m4'].rentree, 'memoire');
  assert.equal(par['mail:m4'].transferee_par, 'maxime.p@klocka.immo');
  assert.equal(par['mail:m0'].biens, 1);
  assert.equal(par['mail:m0'].rentree, 'non');
});

test('un PDF ou un mail à plusieurs fiches compte chacune ; la même fiche transférée ne compte qu\'une fois (22 nov. 2026, Jules)', () => {
  const pdf = (nom, taille) => ({ nom, taille, piece_id: nom, mime: 'application/pdf' });
  const deals = [
    // Un PDF de quatre fiches lu en un dossier : quatre lots, quatre fiches.
    { deal_id: 'd4', created_date: '2026-11-18T09:00:00.000Z', lots: [lot, lot, lot, lot], source: { nom_fichier: 'portefeuille.pdf' }, source_mail: { mail_recu_id: 'mx' } },
  ];
  const mails = [
    // Le mail du dossier, sans `deal_id` posé : il ne compte pas une seconde fois.
    { id: 'mx', compte: 'jules.b@klocka.immo', de_email: 'agent@agence.fr', date: '2026-11-18T08:00:00.000Z', objet: 'Fiches commerciales', pieces_jointes: [pdf('portefeuille.pdf', 900)] },
    // Deux fiches jointes, pas encore lues : deux.
    { id: 'm2', compte: 'jules.b@klocka.immo', de_email: 'theo@quorner.com', date: '2026-11-19T08:00:00.000Z', objet: 'Fiches commerciales Nice', pieces_jointes: [pdf('fiche-commerciale-nice.pdf', 100), pdf('fiche-commerciale-antibes.pdf', 200)] },
    // Un ZIP de fiches, pas encore ouvert : une au moins.
    { id: 'mz', compte: 'jules.b@klocka.immo', de_email: 'lea@agence.fr', date: '2026-11-19T09:00:00.000Z', objet: 'Murs commerciaux à vendre', pieces_jointes: [{ nom: 'fiches.zip', taille: 5000, piece_id: 'z' }] },
    // Reçue par Nora puis transférée à sourcing@ : la même pièce, une seule fiche.
    { id: 'mn', compte: 'nora.l@klocka.immo', de_email: 'paul@cabinet.fr', date: '2026-11-20T08:00:00.000Z', objet: 'Fiche commerciale Cannes', pieces_jointes: [pdf('fiche-commerciale-cannes.pdf', 300)] },
    { id: 'ms', compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, date: '2026-11-20T08:05:00.000Z', objet: 'TR: Fiche commerciale Cannes', texte: 'De : Paul <paul@cabinet.fr>', pieces_jointes: [pdf('fiche-commerciale-cannes.pdf', 300)] },
    // La même fiche que le dossier, renvoyée par l'agent : déjà comptée.
    { id: 'mr', compte: 'jules.b@klocka.immo', de_email: 'agent@agence.fr', date: '2026-11-21T08:00:00.000Z', objet: 'Fiches commerciales (relance)', pieces_jointes: [pdf('portefeuille.pdf', 900)] },
  ];
  const f = listerFiches({ deals, mails }, { estInterne: equipe });
  const par = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(par).sort(), ['d4', 'mail:m2', 'mail:mn', 'mail:mz']);
  assert.equal(par.d4.biens, 4);
  assert.equal(par['mail:m2'].biens, 2);
  assert.equal(par['mail:mz'].biens, 1);
  assert.equal(par['mail:mn'].biens, 1);
  // Les semaines et le record comptent les fiches, pas les envois.
  const s = statsParSemaine(f, { semaines: 1, maintenant: new Date('2026-11-21T12:00:00.000Z') });
  assert.equal(s[0].fiches, 8);
  assert.equal(recordDeFiches(f).fiches, 8);
});

test('le compte contrôlé : même adresse une fois, écart avec ce que le document annonce, listes à part, « Pas une fiche » écarté (22 nov. 2026)', () => {
  const lotA = (rue, ville = 'Montpellier', cp = '34000') => ({ lot: { adresse: { valeur: { rue, code_postal: cp, ville } } } });
  const deals = [
    // Le teaser de Montpellier : quatre actifs annoncés, quatre lus.
    { deal_id: 'ao', created_date: '2026-11-10T09:00:00.000Z', source: { nom_fichier: 'AO Teaser.pdf', type: 'pdf' }, extraction: { biens_annonces: 4 },
      lots: [lotA('1218 avenue du Père Soulas'), lotA('40 avenue du Pont Juvénal'), lotA('65 route de Lavérune'), lotA('1 rue des Volontaires')] },
    // Un portefeuille qui annonce six murs, la lecture en trouve deux : à vérifier.
    { deal_id: 'p6', created_date: '2026-11-11T09:00:00.000Z', source: { nom_fichier: 'portefeuille.pdf', type: 'pdf' }, extraction: { biens_annonces: 6 }, lots: [lotA('3 rue Foch'), lotA('5 rue Foch')] },
    // Un classeur Excel de huit biens : une liste, hors du record.
    { deal_id: 'xl', created_date: '2026-11-12T09:00:00.000Z', source: { nom_fichier: 'stock.xlsx', type: 'tableur' }, lots: Array.from({ length: 8 }, (_, i) => lotA(`${i + 1} rue de la Loge`)) },
  ];
  const biensMemoire = [
    // Le Lavérune renvoyé par un autre agent, rentré en Mémoire : déjà compté.
    { id: 'b1', cle_adresse: '65|route de laverune|34000', ville: 'Montpellier' },
    { id: 'b2', cle_adresse: '9|rue de verdun|34000', ville: 'Montpellier' },
  ];
  const mails = [
    { id: 'mm', compte: 'sourcing@klocka.immo', de_email: 'nora.l@klocka.immo', interne: true, date: '2026-11-15T09:00:00.000Z', objet: 'TR: deux biens', pieces_jointes: [{ nom: 'fiche.pdf', taille: 1 }], memoire_ids: ['b1', 'b2'], fiches_lues: [{ nom: 'fiche.pdf', biens: 2, annonce: 2 }] },
    // « Pas une fiche », répondu à l'Assistant : ne compte pas.
    { id: 'mp', compte: 'jules.b@klocka.immo', de_email: 'agence@x.fr', date: '2026-11-16T09:00:00.000Z', objet: 'Fiche commerciale', pieces_jointes: [{ nom: 'fiche-commerciale.pdf', taille: 2 }], fiche_refusee: { categorie: 'pas_une_fiche' } },
    // « Hors critères » : une fiche reçue quand même.
    { id: 'mh', compte: 'jules.b@klocka.immo', de_email: 'agence@y.fr', date: '2026-11-16T10:00:00.000Z', objet: 'Fiche commerciale', pieces_jointes: [{ nom: 'fiche-commerciale-lyon.pdf', taille: 3 }], fiche_refusee: { categorie: 'hors_criteres' } },
  ];
  const f = listerFiches({ deals, mails, biensMemoire }, { estInterne: equipe });
  const par = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.deepEqual(Object.keys(par).sort(), ['ao', 'mail:mh', 'mail:mm', 'p6', 'xl']);
  assert.equal(par.ao.biens, 4);
  assert.equal(par.ao.a_verifier, undefined);
  assert.equal(par.p6.biens, 2);
  assert.match(par.p6.a_verifier, /annonce 6 biens, la lecture en a trouvé 2/);
  assert.equal(par.xl.biens, 0);
  assert.equal(par.xl.liste, 8);
  assert.equal(par['mail:mm'].biens, 1, 'Lavérune déjà compté avec le teaser');
  assert.equal(par['mail:mm'].doublons, 1);
  assert.match(par['mail:mh'].a_verifier, /Pas encore lue/);
  // Corrigé à la main, le chiffre fait foi : plus d'écart ni de liste.
  const corrige = listerFiches({ deals: [{ ...deals[2], fiche_compte: { biens: 8 } }] }, { estInterne: equipe });
  assert.equal(corrige[0].biens, 8);
  assert.equal(corrige[0].liste, undefined);
});

test('une fiche d\'avant la remise à zéro ne prend pas l\'adresse d\'une fiche reçue depuis', () => {
  const lot = { lot: { adresse: { valeur: { rue: '12 rue de la République', code_postal: '69002', ville: 'Lyon' } } } };
  const deals = [
    { deal_id: 'vieux', created_date: '2026-08-14T16:00:00.000Z', source: { nom_fichier: 'kfc.pdf' }, lots: [lot] },
    { deal_id: 'neuf', created_date: '2026-11-11T17:00:00.000Z', source: { nom_fichier: 'kfc.pdf' }, lots: [lot] },
  ];
  assert.deepEqual(listerFiches({ deals }).map((f) => [f.id, f.biens]), [['neuf', 1]]);
});

test('des fiches reçues ailleurs, ajoutées à la main : comptées à leur nombre, à la personne choisie (23 nov. 2026)', () => {
  const f = listerFiches({ manuelles: [{ id: 'x1', nombre: 6, le: '2026-11-20T12:00:00.000Z', analyste: 'maxime.p@klocka.immo', titre: 'Fiches données au salon' }, { id: 'x2', nombre: 2, le: '2026-11-21T12:00:00.000Z', fiche_compte: { pas_fiche: true } }] });
  const par = Object.fromEntries(f.map((x) => [x.id, x]));
  assert.equal(par['main:x1'].biens, 6);
  assert.equal(par['main:x1'].compte.analyste, 'maxime.p@klocka.immo');
  assert.equal(par['main:x2'].biens, 0);
});
