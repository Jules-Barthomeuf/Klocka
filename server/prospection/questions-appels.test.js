// AK surveille le journal des appels et pose des questions (16 oct. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-questions-appels-'));
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('../db.js');
const Q = await import('./questions-appels.js');

const MAXIME = 'maxime.p@klocka.immo';
const NORA = 'nora.l@klocka.immo';
const T0 = new Date('2026-10-16T12:00:00Z');
const il_y_a = (min) => new Date(T0.getTime() - min * 60000).toISOString();
const appel = (o) => Records.create('AppelAgent', { par: MAXIME, etat: 'valide', issue: 'a_des_murs', duree_s: 180, enregistre: true, agent: 'Durand', le: il_y_a(300), ...o });

test('le temps : « 2 min 47 s »', () => {
  assert.equal(Q.duree(167000), '2 min 47 s');
  assert.equal(Q.duree(38000), '38 s');
});

test('les quatre motifs, et seulement eux', () => {
  const ok = { par: MAXIME, etat: 'valide', issue: 'a_des_murs', duree_s: 180, enregistre: true, le: il_y_a(300), temps: { valide_ms: 40000 } };
  assert.deepEqual(Q.motifsDe(ok, T0), []);
  assert.deepEqual(Q.motifsDe({ ...ok, modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }] }, T0), ['correction']);
  assert.deepEqual(Q.motifsDe({ ...ok, mesure_ak: { propose_par_ak: true, corrige: true, issue: true } }, T0), ['correction']);
  // Pas validé : après une heure seulement.
  assert.deepEqual(Q.motifsDe({ ...ok, etat: 'a_valider', le: il_y_a(30) }, T0), []);
  assert.deepEqual(Q.motifsDe({ ...ok, etat: 'a_valider', le: il_y_a(90) }, T0), ['non_valide']);
  // Validé sans appel : court, ni enregistrement ni notes ; un répondeur n'est pas concerné.
  const vide = { ...ok, duree_s: 4, enregistre: false };
  assert.deepEqual(Q.motifsDe(vide, T0), ['sans_appel']);
  assert.deepEqual(Q.motifsDe({ ...vide, notes: 'Il rappelle' }, T0), []);
  assert.deepEqual(Q.motifsDe({ ...vide, issue: 'repondeur' }, T0), []);
  // Validation longue : 2 min 47 s, oui ; 1 min 59 s, non.
  assert.deepEqual(Q.motifsDe({ ...ok, temps: { valide_ms: 167000 } }, T0), ['trop_long']);
  assert.deepEqual(Q.motifsDe({ ...ok, temps: { valide_ms: 119000 } }, T0), []);
  // Plusieurs à la fois ; un essai, une démonstration, un appel remplacé jamais.
  assert.deepEqual(Q.motifsDe({ ...ok, modifie: true, temps: { valide_ms: 167000 } }, T0), ['correction', 'trop_long']);
  for (const c of [{ essai: true }, { faux: 'démo' }, { etat: 'remplace' }]) assert.deepEqual(Q.motifsDe({ ...ok, modifie: true, ...c }, T0), []);
});

test('la chronologie dit ce que l\'analyste a fait', () => {
  const c = Q.chronologie({ id: 'x', le: '2026-10-15T12:07:00Z', agent: 'Durand', issue: 'a_des_murs', duree_s: 192, enregistre: true, resume: 'Deux murs à Antibes', temps: { pret_ms: 9000, valide_ms: 167000, prepare_ms: 175000 }, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }], annulations: 1, validation_ui: { depuis_fenetre: true, etapes: 4, vues: 2, retirees: ['relance'], ajoutees: [] }, etat: 'valide', mesure_ak: { propose_par_ak: true, corrige: true, issue: false } }, { agence: 'Agence Durand' });
  const t = c.map((x) => `${x.quoi} ${x.detail || ''}`).join('\n');
  assert.match(t, /Appel à Durand, Agence Durand/);
  assert.match(t, /3 min 12 s, enregistré/);
  assert.match(t, /Tu as corrigé : Mail/);
  assert.match(t, /Annulé 1 fois/);
  assert.match(t, /2 étapes vues sur 4|2 étapes vues sur 4/);
  assert.match(t, /retiré : relance/);
  assert.match(t, /2 min 47 s après le raccrochage \(au-delà de 2 minutes\)/);
});

test('surveiller crée une question par appel, avec toutes ses raisons, sans doublon', () => {
  const a = appel({ modifie: true, corrections: [{ champ: 'Date de relance', avant: 'lundi', apres: 'jeudi' }], temps: { valide_ms: 167000 } });
  appel({ temps: { valide_ms: 30000 } }); // rien à demander
  appel({ essai: true, modifie: true }); // un essai
  const r = Q.surveiller({ maintenant: T0 });
  assert.equal(r.crees.length, 1);
  const q = r.crees[0];
  assert.equal(q.appel_id, a.id);
  assert.deepEqual(q.motifs, ['correction', 'trop_long']);
  assert.equal(q.questions.length, 2);
  assert.match(q.questions[0].texte, /Date de relance : lundi → jeudi/);
  assert.match(q.questions[1].texte, /2 min 47 s/);
  assert.equal(Q.surveiller({ maintenant: T0 }).crees.length, 0);
  assert.equal(Records.list('QuestionAppel').length, 1);
});

test('mon Dashboard : mes questions, l\'écran de l\'appel, « plus tard », puis mes réponses', async () => {
  const q = Records.list('QuestionAppel')[0];
  const rec = Records.create('EnregistrementEcran', { par: MAXIME, appel_id: q.appel_id, le: il_y_a(300), duree_s: 190 });
  assert.equal(Q.mesQuestions({ email: NORA }, { maintenant: T0 }).length, 0);
  const mes = Q.mesQuestions({ email: MAXIME }, { maintenant: T0 });
  assert.equal(mes.length, 1);
  assert.equal(mes[0].ecran.id, rec.id);
  assert.ok(mes[0].ecran.jusqu_au.startsWith('2026-11-1')); // 30 jours après le 16 octobre
  assert.match(mes[0].chronologie.map((x) => x.quoi).join(' '), /Appel à Durand/);
  assert.equal(Q.plusTard(q.id, { email: NORA }).ok, false);
  Q.plusTard(q.id, { email: MAXIME }, { maintenant: T0 });
  assert.equal(Q.mesQuestions({ email: MAXIME }, { maintenant: T0 }).length, 0);
  assert.equal(Q.mesQuestions({ email: MAXIME }, { maintenant: new Date(T0.getTime() + 20 * 3600000) }).length, 1);
  // Répondre : pas pour un autre, une question à la fois, l'état suit.
  assert.equal(Q.repondre(q.id, { email: NORA }, [{ id: q.questions[0].id, texte: 'x' }]).ok, false);
  assert.equal(Q.repondre(q.id, { email: MAXIME }, []).ok, false);
  const r1 = Q.repondre(q.id, { email: MAXIME }, [{ id: q.questions[0].id, texte: 'Le client voulait jeudi.' }]);
  assert.equal(r1.question.etat, 'ouverte');
  const r2 = Q.repondre(q.id, { email: MAXIME }, [{ id: q.questions[1].id, texte: 'Monday ne répondait pas.' }]);
  assert.equal(r2.question.etat, 'repondue');
  assert.equal(Q.mesQuestions({ email: MAXIME }, { maintenant: new Date(T0.getTime() + 40 * 3600000) }).length, 0);
  // L'écran : à son analyste et à Jules, pas à un autre ; effacé, il se dit.
  assert.equal((await Q.fichierEcran(q.id, { email: NORA })).erreur, 403);
  assert.equal((await Q.fichierEcran(q.id, { email: NORA }, { estJules: true })).erreur, 404); // pas de fichier sur le disque du test
  assert.match((await Q.fichierEcran(q.id, { email: MAXIME })).message, /plus sur le serveur/);
  assert.equal(mes[0].ecran.present, false); // la fiche existe, pas le fichier : le Dashboard le dit au lieu d'un lecteur en échec
});

test('un appel non validé : la question s\'efface quand il est validé sans autre raison', () => {
  const a = appel({ etat: 'a_valider', le: il_y_a(200), duree_s: 100, temps: null });
  assert.equal(Q.surveiller({ maintenant: T0 }).crees.length, 1);
  const q = Records.list('QuestionAppel').find((x) => x.appel_id === a.id);
  assert.deepEqual(q.motifs, ['non_valide']);
  Records.update('AppelAgent', a.id, { etat: 'valide', temps: { valide_ms: 20000 } });
  Q.surveiller({ maintenant: T0 });
  assert.equal(Records.get('QuestionAppel', q.id).etat, 'obsolete');
  // Validé ensuite avec une correction : la question revient, pour la correction.
  Records.update('AppelAgent', a.id, { modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }] });
  const r = Q.surveiller({ maintenant: T0 });
  assert.equal(r.rouvertes.length, 1);
  assert.equal(Records.get('QuestionAppel', q.id).etat, 'ouverte');
  assert.deepEqual(Records.get('QuestionAppel', q.id).questions.map((x) => x.motif), ['correction']);
});

test('le modèle rédige le résumé et des questions précises, sans toucher aux réponses', async () => {
  const q = Records.list('QuestionAppel').find((x) => x.etat === 'ouverte');
  const prompts = [];
  const invoke = async (p) => { prompts.push(p); return { resume: 'Tu as appelé Durand et réécrit le mail.', questions: [{ motif: 'correction', texte: 'Pourquoi as-tu réécrit le mail ?' }] }; };
  const r = await Q.rediger(q.id, { invoke });
  assert.equal(r.ia, true);
  assert.equal(r.resume, 'Tu as appelé Durand et réécrit le mail.');
  assert.equal(r.questions.find((x) => x.motif === 'correction').texte, 'Pourquoi as-tu réécrit le mail ?');
  assert.match(prompts[0], /Mail : proposé → réécrit/);
  // Un modèle qui échoue ne casse rien : les questions modèles restent.
  const b = appel({ etat: 'a_valider', le: il_y_a(500) });
  Q.surveiller({ maintenant: T0 });
  const qb = Records.list('QuestionAppel').find((x) => x.appel_id === b.id);
  assert.equal(await Q.rediger(qb.id, { invoke: async () => { throw new Error('API'); } }), null);
  assert.equal(Records.get('QuestionAppel', qb.id).ia, false);
  assert.match(Records.get('QuestionAppel', qb.id).questions[0].texte, /n'est pas validé/);
});

test('Jules : toutes les réponses, par motif, et la synthèse', async () => {
  const r = Q.retours({ jours: 90, maintenant: T0 });
  assert.ok(r.total >= 3);
  assert.equal(r.par_motif.find((m) => m.motif === 'trop_long').repondues, 1);
  // Les chiffres comptent des appels : celui-ci a deux raisons, il compte dans les deux.
  assert.equal(r.par_motif.find((m) => m.motif === 'trop_long').appels, 1);
  assert.equal(r.par_motif.find((m) => m.motif === 'correction').appels, 2);
  assert.equal(r.par_motif.find((m) => m.motif === 'non_valide').appels, 1);
  assert.equal(r.seuil_validation_s, 120);
  assert.equal(r.synthese, null);
  const s = await Q.synthetiser({ invoke: async (p) => { assert.match(p, /Monday ne répondait pas/); return { themes: [{ theme: 'Monday ne répond pas', fois: 1, exemples: ['Monday ne répondait pas.'] }], ameliorations: [{ quoi: 'Dire quand Monday est lent', pourquoi: 'Une réponse' }] }; }, maintenant: T0 });
  assert.equal(s.synthese.themes[0].theme, 'Monday ne répond pas');
  assert.equal(Q.retours({ jours: 90, maintenant: T0 }).synthese.a_jour, true);
  Q.repondre(Records.list('QuestionAppel').find((x) => x.etat === 'ouverte').id, { email: MAXIME }, [{ id: Records.list('QuestionAppel').find((x) => x.etat === 'ouverte').questions[0].id, texte: 'Autre chose.' }], { estJules: true });
  assert.equal(Q.retours({ jours: 90, maintenant: T0 }).synthese.a_jour, false);
});

test('Jules voit les questions posées aux autres, en lecture seule, et en est prévenu', async () => {
  const JULES = { email: 'jules.b@klocka.immo' };
  const ouvertes = Q.questionsEquipe(JULES, { maintenant: T0 });
  assert.ok(ouvertes.length >= 1);
  assert.ok(ouvertes.every((q) => q.par !== JULES.email));
  assert.ok(ouvertes.every((q) => q.etat !== 'obsolete'));
  // Maxime ne voit pas celles de Nora ; il ne voit rien de l'équipe côté serveur (la route ne lui rend que les siennes).
  const a = appel({ par: NORA, modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }] });
  Q.surveiller({ maintenant: T0 });
  assert.ok(Q.questionsEquipe(JULES, { maintenant: T0 }).some((q) => q.appel_id === a.id && q.par === NORA));
  assert.ok(!Q.mesQuestions({ email: MAXIME }, { maintenant: T0 }).some((q) => q.appel_id === a.id));
  // Un tour prévient Jules d'une question nouvelle.
  const b = appel({ par: MAXIME, modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }], le: il_y_a(120) });
  await Q.tour({ invoke: async () => ({ resume: 'r', questions: [] }), maintenant: T0 });
  const q = Records.list('QuestionAppel').find((x) => x.appel_id === b.id);
  const notes = Records.list('Notification').filter((n) => String(n.cle).startsWith(`question-appel-jules:${q.id}`));
  assert.equal(notes.length, 1);
  assert.equal(notes[0].pour, 'jules.b@klocka.immo');
  assert.match(notes[0].titre, /question à Maxime/);
  // Les siennes ne lui sont pas annoncées deux fois.
  const c = appel({ par: 'jules.b@klocka.immo', modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }], le: il_y_a(130) });
  await Q.tour({ invoke: async () => ({ resume: 'r', questions: [] }), maintenant: T0 });
  const qc = Records.list('QuestionAppel').find((x) => x.appel_id === c.id);
  assert.equal(Records.list('Notification').filter((n) => String(n.cle).startsWith(`question-appel-jules:${qc.id}`)).length, 0);
  assert.equal(Records.list('Notification').filter((n) => String(n.cle).startsWith(`question-appel:${qc.id}`) && n.pour === 'jules.b@klocka.immo').length, 1);
});

test('la rédaction ne pose pas de nouvelle question sur un cas déjà répondu', async () => {
  const a = appel({ par: MAXIME, modifie: true, corrections: [{ champ: 'Mail', avant: 'proposé', apres: 'réécrit' }], temps: { valide_ms: 170000 }, le: il_y_a(140) });
  Q.surveiller({ maintenant: T0 });
  const q = Records.list('QuestionAppel').find((x) => x.appel_id === a.id);
  const corr = q.questions.find((x) => x.motif === 'correction');
  Q.repondre(q.id, { email: MAXIME }, [{ id: corr.id, texte: 'Le mail était trop long.' }]);
  const r = await Q.rediger(q.id, { invoke: async () => ({ resume: 'r', questions: [{ motif: 'correction', texte: 'Encore une ?' }, { motif: 'trop_long', texte: 'Qu\'est-ce qui a pris du temps ?' }] }) });
  assert.deepEqual(r.questions.filter((x) => x.motif === 'correction').map((x) => x.reponse), ['Le mail était trop long.']);
  assert.equal(r.questions.find((x) => x.motif === 'trop_long').texte, 'Qu\'est-ce qui a pris du temps ?');
  assert.equal(r.questions.length, 2);
});

test('relecture du 16 oct. : annonce quel que soit le chemin, réannonce d\'un motif nouveau, Jules lit sans répondre, une rédaction à la fois', async () => {
  // Née hors d'un tour (à l'ouverture du Dashboard) : elle est quand même annoncée, une fois.
  const a = appel({ par: NORA, etat: 'a_valider', le: il_y_a(100), temps: null });
  Q.surveiller({ maintenant: T0 });
  const q = Records.list('QuestionAppel').find((x) => x.appel_id === a.id);
  assert.ok((await Q.annoncer()) >= 1);
  const pour = (n) => Records.list('Notification').filter((x) => String(x.cle).startsWith(`question-appel:${q.id}:`) && x.pour === n).length;
  assert.equal(pour(NORA), 1);
  assert.equal(Records.list('Notification').filter((x) => String(x.cle).startsWith(`question-appel-jules:${q.id}:`)).length, 1);
  await Q.annoncer();
  assert.equal(pour(NORA), 1);
  // Validé une heure plus tard : « pas validé » s'efface, « validation longue » arrive ; même nombre de motifs, réannoncée.
  Records.update('AppelAgent', a.id, { etat: 'valide', temps: { valide_ms: 3600000 } });
  Q.surveiller({ maintenant: T0 });
  assert.deepEqual(Records.get('QuestionAppel', q.id).motifs, ['trop_long']);
  await Q.annoncer();
  assert.equal(pour(NORA), 2);
  // Jules ne répond pas à la place de Nora.
  assert.equal(Q.repondre(q.id, { email: 'jules.b@klocka.immo' }, [{ id: Records.get('QuestionAppel', q.id).questions[0].id, texte: 'x' }]).ok, false);
  // Deux rédactions lancées ensemble : un seul appel au modèle.
  let appels = 0;
  const lent = async () => { appels += 1; await new Promise((r) => setTimeout(r, 30)); return { resume: 'r', questions: [] }; };
  await Promise.all([Q.rediger(q.id, { invoke: lent }), Q.rediger(q.id, { invoke: lent })]);
  assert.equal(appels, 1);
});
