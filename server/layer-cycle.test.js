// Le Layer, phase 4 : validation sans goulot, contradictions, remplacement, engagements échus, archivage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-cycle-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@klocka.test';
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('./db.js');
const L = await import('./layer.js');
const Y = await import('./layer-cycle.js');
const S = await import('./layer-schema.js');

const JULES = { email: 'jules@klocka.test', role: 'admin' };
const NORA = { email: 'nora@klocka.test', role: 'admin' };
const MAXIME = { email: 'maxime@klocka.test', role: 'admin' };
const agent = Records.create('AgentImmo', { nom: 'Durand', statut: 'nouveau' });
const pasDeContradiction = async () => ({ contredit: false, raison: 'se complètent' });

const appel = L.ajouterSource({ type: 'appel', auteur: NORA.email, titre: 'Appel Durand', contenu: "Durand a deux murs à Antibes. Il rappelle jeudi. Il pense que la rue va se vider.", liens: [{ type_entite: 'agent', entite_id: agent.id }] }).source;

test('validation sans goulot : auto si tout est sûr, sinon au validateur de la source (Nora pour son appel, Jules pour le reste)', async () => {
  L.rangerFaits(appel, [
    { type: 'information', resume: 'Durand a deux murs à Antibes', citation: 'Durand a deux murs à Antibes.', confiance: 0.95, entites: [] },
    { type: 'engagement', resume: 'Durand rappelle jeudi', citation: 'Il rappelle jeudi.', personne: 'Durand', echeance: '2026-10-16', confiance: 0.97, entites: [] },
    { type: 'information', resume: 'Durand pense que la rue va se vider', citation: 'Il dit que la rue se videra.', confiance: 0.95, entites: [] },
    { type: 'savoir', resume: 'À Antibes, la rue peut se vider', citation: 'Il pense que la rue va se vider.', confiance: 0.6, entites: [] },
  ]);
  const r = await Y.controler(appel.id, { juge: pasDeContradiction });
  assert.deepEqual([r.auto, r.manuels], [2, 2]);
  const faits = Records.list('CerveauFait').filter((f) => f.source_id === appel.id);
  const auto = faits.filter((f) => f.mode_validation === 'auto');
  assert.deepEqual(auto.map((f) => f.resume).sort(), ['Durand a deux murs à Antibes', 'Durand rappelle jeudi']);
  assert.ok(auto.every((f) => f.statut === 'valide' && f.valide_par === 'auto'));
  const citationFausse = faits.find((f) => /rue va se vider/.test(f.resume));
  assert.equal(citationFausse.statut, 'a_valider');
  assert.equal(citationFausse.validateur, NORA.email, "un appel : c'est l'analyste qui valide");
  assert.match(citationFausse.obstacles.join(' '), /citation introuvable/);
  assert.match(faits.find((f) => f.type === 'savoir').obstacles.join(' '), /confiance 0.6/);
  // Qui voit quoi : Nora ses faits, Maxime rien, Jules tout.
  assert.equal((await L.aValider(NORA)).flatMap((l) => l.faits).length, 2);
  assert.equal((await L.aValider(MAXIME)).length, 0);
  assert.equal((await L.aValider(JULES)).flatMap((l) => l.faits).length, 2);
  assert.equal(Y.peutValiderFait(MAXIME, citationFausse), false);
  assert.equal(Y.peutValiderFait(JULES, citationFausse), true);
  assert.equal(S.auditDe(auto[0].id)[0].action, 'valider_auto');
  // Un compte rendu va à Jules.
  assert.equal(Y.validateurDe({ type: 'compte_rendu', auteur: NORA.email }), null);
});

test('contradiction : le nouveau fait propose de remplacer l\'ancien ; remplacer garde le lien, garder les deux lève la proposition', async () => {
  const s2 = L.ajouterSource({ type: 'appel', auteur: NORA.email, titre: 'Rappel Durand', contenu: "Durand a vendu un des deux murs d'Antibes, il en reste un.", liens: [{ type_entite: 'agent', entite_id: agent.id }] }).source;
  L.rangerFaits(s2, [{ type: 'information', resume: "Durand a un seul mur à Antibes, l'autre est vendu", citation: "Durand a vendu un des deux murs d'Antibes, il en reste un.", confiance: 0.96, entites: [] }]);
  const ancien = Records.list('CerveauFait').find((f) => f.resume === 'Durand a deux murs à Antibes');
  const juge = async (n, a) => ({ contredit: a.id === ancien.id, raison: 'Le nombre de murs a changé.' });
  const r = await Y.controler(s2.id, { juge });
  assert.equal(r.contradictions, 1);
  const nouveau = Records.list('CerveauFait').find((f) => f.source_id === s2.id);
  assert.equal(nouveau.statut, 'a_valider', 'pas de validation auto en cas de contradiction');
  assert.equal(nouveau.contradiction.fait_id, ancien.id);
  assert.equal((await L.validerLot(s2.id, { par: NORA.email, user: NORA })).valides, 0, 'un lot ne tranche pas une contradiction');
  assert.equal(Y.remplacer(nouveau.id, ancien.id, { par: NORA.email }).ok, true);
  assert.equal(Records.get('CerveauFait', ancien.id).statut, 'remplace');
  assert.equal(Records.get('CerveauFait', ancien.id).remplace_par, nouveau.id);
  assert.equal(Records.get('CerveauFait', nouveau.id).statut, 'valide');
  assert.deepEqual(S.auditDe(ancien.id).map((a) => a.action).at(-1), 'remplacer');
  // Garder les deux.
  const s3 = L.ajouterSource({ type: 'appel', auteur: NORA.email, titre: 'Autre', contenu: 'Durand rappelle vendredi aussi.', liens: [{ type_entite: 'agent', entite_id: agent.id }] }).source;
  L.rangerFaits(s3, [{ type: 'engagement', resume: 'Durand rappelle vendredi', citation: 'Durand rappelle vendredi aussi.', confiance: 0.95, entites: [] }]);
  await Y.controler(s3.id, { juge: async () => ({ contredit: true, raison: 'jour différent' }) });
  const f3 = Records.list('CerveauFait').find((f) => f.source_id === s3.id);
  assert.ok(f3.contradiction);
  Y.garderLesDeux(f3.id, { par: NORA.email });
  assert.equal(Records.get('CerveauFait', f3.id).contradiction, null);
  assert.equal(Records.get('CerveauFait', f3.id).statut, 'valide');
});

test("engagements : échus à J+1 de l'échéance, tenus à la main ; archivage quand toutes les fiches sont fermées", () => {
  const eng = Records.list('CerveauFait').find((f) => f.resume === 'Durand rappelle jeudi');
  assert.equal(Y.echu('2026-10-16', '2026-10-16'), false, 'le jour même, pas encore');
  assert.equal(Y.echu('2026-10-16', '2026-10-17'), true);
  assert.equal(Y.echeances({ maintenantD: new Date('2026-10-16T20:00:00Z') }), 0);
  assert.equal(Y.echeances({ maintenantD: new Date('2026-10-17T08:00:00Z') }), 1);
  assert.equal(Records.get('CerveauFait', eng.id).statut_engagement, 'echu');
  assert.equal(Y.marquerEngagement(eng.id, 'tenu', { par: NORA.email }).ok, true);
  assert.equal(Records.get('CerveauFait', eng.id).statut_engagement, 'tenu');
  // L'agent marqué « ne plus appeler » : ses faits validés (hors savoir) sont archivés.
  Records.update('AgentImmo', agent.id, { ne_plus_appeler: true });
  const n = Y.archiver();
  assert.ok(n >= 2);
  assert.ok(Records.list('CerveauFait').filter((f) => f.statut === 'archive').every((f) => f.type !== 'savoir'));
  const m = Y.partManuelle();
  assert.equal(m.objectif, 20);
  assert.ok(m.auto >= 2 && m.manuels >= 1);
});
