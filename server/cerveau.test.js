// Le Cerveau (spec MVP du 14 oct. 2026) : journal brut, faits, rattachement, validation, recherche, questions.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cerveau-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@klocka.test';
const C = await import('./cerveau.js');
const { Records } = await import('./db.js');

const JULES = { email: 'jules@klocka.test', role: 'admin' };
const MAXIME = { email: 'maxime@klocka.test', role: 'admin' };

Records.create('Deal', { deal_id: 'd-libourne', nom: 'Chocolaterie, Libourne', lots: [{ lot: { locataire_nom: { valeur: 'Chocolaterie Tarnaise' }, adresse: { valeur: { rue: '10 place Abel Surchamp', ville: 'Libourne' } } } }] });
const durand = Records.create('AgenceProspect', { nom: 'Agence Durand', ville: 'Antibes' });
Records.create('AgenceProspect', { nom: 'Cabinet Martin', ville: 'Nice' });

test('une source entre telle quelle ; les faits gardent leur citation vérifiée, se rattachent, et un doublon n\'est pas recréé', () => {
  const contenu = 'Comité du lundi. On refuse Libourne : le loyer est trop haut pour un emplacement n°2. L\'agence Durand a deux murs off-market à Antibes, elle rappelle jeudi.';
  const s = C.ajouterSource({ type: 'compte_rendu', auteur: 'Jules@klocka.test', titre: 'Comité', contenu }).source;
  assert.equal(s.contenu, contenu, 'le journal garde le texte tel quel');
  const r = C.rangerFaits(s, [
    { type: 'decision', resume: 'Libourne refusé : loyer trop haut pour un emplacement n°2.', citation: 'On refuse Libourne : le loyer est trop haut pour un emplacement n°2.', personne: 'Comité', entites: [{ type_entite: 'dossier', nom: 'Libourne' }] },
    { type: 'information', resume: 'L\'agence Durand a deux murs off-market à Antibes.', citation: 'L\'agence Durand a deux murs off-market à Antibes', entites: [{ type_entite: 'agence', nom: 'agence Durand' }, { type_entite: 'ville', nom: 'Antibes' }] },
    { type: 'engagement', resume: 'Durand rappelle jeudi.', citation: 'elle rappelle jeudi (inventé)', echeance: '2026-10-16', entites: [{ type_entite: 'agent', nom: 'Personne Inconnue' }] },
    { type: 'decision', resume: 'Libourne refusé : loyer trop haut pour un emplacement n°2.', citation: 'autre' },
  ]);
  assert.equal(r.faits.length, 3);
  assert.equal(r.doublons, 1);
  const [decision, info, engagement] = r.faits;
  assert.equal(decision.citation_verifiee, true);
  assert.equal(engagement.citation_verifiee, false, 'une citation absente de la source est signalée');
  assert.deepEqual(C.liensDu(decision.id).map((l) => [l.type_entite, l.entite_id]), [['dossier', 'd-libourne']]);
  assert.deepEqual(C.liensDu(info.id).map((l) => [l.type_entite, l.entite_id]).sort(), [['agence', durand.id], ['ville', 'Antibes']].sort());
  assert.equal(engagement.statut, 'a_rattacher', 'une entité introuvable : à rattacher');
  assert.equal(Records.get(C.SOURCE, s.id).faits, 3);
});

test('valider, corriger, rejeter ; seuls les faits validés répondent, avec leur source', () => {
  const lots = C.aValider();
  const faits = lots.flatMap((l) => l.faits);
  const decision = faits.find((f) => f.type === 'decision');
  const info = faits.find((f) => f.type === 'information');
  const engagement = faits.find((f) => f.type === 'engagement');
  assert.equal(C.chercher({ question: 'pourquoi refusé Libourne' }).length, 0, 'rien n\'est acquis avant validation');
  C.trancher(decision.id, { action: 'valider', par: JULES.email });
  C.trancher(info.id, { action: 'corriger', par: JULES.email, resume: 'L\'agence Durand a deux murs off-market à Antibes (centre).', type: 'information' });
  C.trancher(engagement.id, { action: 'rejeter', par: JULES.email });
  const trouves = C.chercher({ question: 'pourquoi on a refusé Libourne ?' }, { par: MAXIME.email });
  assert.equal(trouves.length, 1);
  assert.match(trouves[0].resume, /loyer trop haut/);
  assert.equal(trouves[0].source.titre, 'Comité');
  assert.equal(trouves[0].fiches[0].libelle, 'Chocolaterie, Libourne');
  assert.equal(C.historique('agence', durand.id)[0].resume, 'L\'agence Durand a deux murs off-market à Antibes (centre).');
  assert.equal(Records.get(C.FAIT, engagement.id).statut, 'rejete', 'un fait rejeté reste en base');
  const m = C.mesures();
  assert.deepEqual([m.extraction.tranches, m.extraction.sans_correction, m.extraction.rejetes], [3, 1, 1]);
  assert.deepEqual([m.questions.total, m.questions.personnes], [1, 1]);
  assert.equal(C.peutValider(JULES), true);
  assert.equal(C.peutValider(MAXIME), false, 'au MVP, seul Jules valide');
});

test('un dossier refusé sans motif : une question à qui a tranché, trois par jour, une à la fois ; la réponse est une décision validée', async () => {
  const d2 = Records.create('Deal', { deal_id: 'd-2', nom: 'Boulangerie, Mâcon' });
  const d3 = Records.create('Deal', { deal_id: 'd-3', nom: 'Pharmacie, Dax' });
  assert.equal(C.surDecision(d2, 'abandonne', { user: MAXIME, note: 'Loyer trop haut' }), null, 'un motif donné : pas de question');
  assert.equal(C.surDecision(d2, 'documents_demandes', { user: MAXIME }), null, 'ni accepté ni refusé');
  const q1 = C.surDecision(d2, 'abandonne', { user: MAXIME, note: 'En analyse → Abandonné' });
  assert.equal(q1.etat, 'posee');
  assert.equal(q1.texte, 'Boulangerie, Mâcon refusé : pourquoi, en une phrase ?');
  const q2 = C.surDecision(d3, 'projet_cree', { user: MAXIME });
  assert.equal(q2.etat, 'en_attente', 'une seule question ouverte à la fois');
  assert.equal(C.questionOuverte(MAXIME.email).id, q1.id);
  const r = await C.repondre(q1.id, 'emplacement trop faible, la rue se vide', { user: MAXIME });
  assert.equal(r.ok, true);
  assert.equal(r.fait.statut, 'valide');
  assert.equal(r.fait.fiches[0].entite_id, 'd-2');
  assert.equal(C.questionOuverte(MAXIME.email).id, q2.id, 'la suivante est posée');
  assert.match(C.chercher({ question: 'Mâcon refusé' })[0].resume, /emplacement trop faible/);
  assert.ok(Records.list('Notification').some((n) => n.pour === MAXIME.email && /Boulangerie, Mâcon refusé/.test(n.titre)));
  // Trois par jour au plus.
  const demain = new Date('2030-01-01T09:00:00Z');
  for (const id of ['a', 'b', 'c', 'd']) Records.create(C.QUESTION, { pour: 'nora@klocka.test', deal_id: id, texte: id, etat: 'en_attente', cree_le: id });
  let posees = 0;
  for (let i = 0; i < 4; i++) {
    const q = C.poserLaSuivante('nora@klocka.test', { maintenantD: demain });
    if (q) { posees += 1; Records.update(C.QUESTION, q.id, { etat: 'repondue' }); }
  }
  assert.equal(posees, 3);
});

test('le débrief du chat : « retiens que… », « note que… »', () => {
  assert.equal(C.debriefDe('retiens que l\'agence Durand rappelle jeudi'), 'l\'agence Durand rappelle jeudi');
  assert.equal(C.debriefDe('Note qu’on passe Libourne en priorité'), 'on passe Libourne en priorité');
  assert.equal(C.debriefDe('AK, retiens bien que Maxime gère Antibes'), 'Maxime gère Antibes');
  assert.equal(C.debriefDe('Qu\'est-ce que Durand nous a dit ?'), null);
});

test('un appel validé entre dans le journal, rattaché à l\'agent et à l\'agence ; un essai n\'entre pas', () => {
  const agent = Records.create('AgentImmo', { prenom: 'Paul', nom_famille: 'Durand', nom: 'Paul Durand' });
  const appel = Records.create('AppelAgent', { agent_id: agent.id, agence_id: durand.id, agent: 'Paul Durand', par: 'maxime@klocka.test', le: '2026-10-14T10:00:00Z', transcription_gardee: 'Bonjour, oui j\'ai deux murs à Antibes.' });
  const s = C.depuisAppel(appel, { agence: durand });
  assert.equal(s.type, 'appel');
  assert.deepEqual(s.liens.map((l) => l.type_entite), ['agent', 'agence']);
  assert.equal(C.depuisAppel({ ...appel, id: 'x', essai: true }), null);
  assert.equal(C.ajouterSource({ type: 'appel', contenu: 'x', cle: `appel-${appel.id}` }).deja, true, 'le même appel n\'entre qu\'une fois');
});

test('le rattachement : la ville du fait départage les homonymes ; un dossier se cherche aussi parmi les projets', () => {
  const nice = Records.create('AgenceProspect', { nom: 'Agence Lefort', ville: 'Nice' });
  Records.create('AgenceProspect', { nom: 'Lefort Immobilier', ville: 'Lyon' });
  Records.create('AgenceProspect', { nom: 'Madame Lefort' });
  const projet = Records.create('Project', { titre: 'Chocolaterie - 10 Place Abel Surchamp, 33500 Libourne' });
  const s = C.ajouterSource({ type: 'compte_rendu', contenu: 'Lefort à Nice a un local vide. On refuse Chocolaterie Libourne.' }).source;
  const r = C.rangerFaits(s, [
    { type: 'information', resume: 'L\'agence Lefort à Nice a un local vide.', citation: 'Lefort à Nice a un local vide.', entites: [{ type_entite: 'agence', nom: 'agence Lefort' }, { type_entite: 'ville', nom: 'Nice' }] },
    { type: 'decision', resume: 'Chocolaterie Libourne refusé.', citation: 'On refuse Chocolaterie Libourne.', entites: [{ type_entite: 'dossier', nom: 'Chocolaterie Libourne' }] },
  ]);
  assert.ok(C.liensDu(r.faits[0].id).some((l) => l.type_entite === 'agence' && l.entite_id === nice.id), 'l\'agence de Nice, pas celle de Lyon ni celle sans ville');
  const props = r.faits[1].candidats[0]?.propositions || C.liensDu(r.faits[1].id);
  assert.ok(JSON.stringify(props).includes(projet.id), 'le projet de Libourne est proposé (ou rattaché) pour « dossier »');
});
