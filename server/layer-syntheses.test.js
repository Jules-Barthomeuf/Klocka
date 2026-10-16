// Le Layer, phase 5 : les synthèses vivantes (structure fixe, faits cités, régénération au plus une fois par heure).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-syntheses-'));
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('./db.js');
const SY = await import('./layer-syntheses.js');
const db = (await import('./db.js')).default;

const agent = Records.create('AgentImmo', { nom: 'Durand', prenom: 'Paul', nom_famille: 'Durand' });
const src = Records.create('CerveauSource', { type: 'appel', titre: 'Appel Durand', date: '2026-10-14T09:00:00Z', contenu: '…' });
const fait = (o) => { const f = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', citation: '', ...o }); Records.create('CerveauLien', { fait_id: f.id, type_entite: 'agent', entite_id: agent.id }); return f; };
const info = fait({ type: 'information', resume: 'Durand a deux murs à Antibes' });
const eng = fait({ type: 'engagement', resume: 'Durand rappelle jeudi', echeance: '2026-10-16', statut_engagement: 'ouvert', responsable: 'Durand' });
fait({ type: 'engagement', resume: 'Durand a envoyé la fiche', statut_engagement: 'tenu' });
fait({ type: 'information', resume: 'Rejeté', statut: 'rejete' });

test('la consigne : les faits validés numérotés, la structure fixe ; ranger garde les rubriques connues dans l\'ordre et les faits existants', () => {
  const p = SY.consigneSynthese('agent', 'Paul Durand', SY.faitsDeLaFiche('agent', agent.id));
  assert.match(p, new RegExp(`#${info.id}`));
  assert.ok(!/Rejeté/.test(p), 'un fait rejeté n\'entre pas');
  assert.match(p, /engagement \(ouvert, pour le 2026-10-16\)/);
  const ids = new Set([info.id, eng.id]);
  const l = SY.ranger([{ rubrique: 'dernier_contact', texte: 'Appel du 14', faits: [info.id] }, { rubrique: 'qui_quoi', texte: 'Agent à Antibes', faits: [`#${info.id}`, 'inconnu'] }, { rubrique: 'autre', texte: 'x', faits: [] }], ids);
  assert.deepEqual(l.map((x) => x.rubrique), ['qui_quoi', 'dernier_contact']);
  assert.deepEqual(l[0].faits, [info.id], 'le # retiré, l\'identifiant inconnu écarté');
});

test('générer, puis la fiche pour les branchements : synthèse, engagements ouverts (pas les tenus), derniers faits', async () => {
  let vu = '';
  const llm = async (prompt) => { vu = prompt; return { lignes: [{ rubrique: 'qui_quoi', texte: 'Paul Durand, agent à Antibes, deux murs.', faits: [info.id] }, { rubrique: 'engagements', texte: 'Rappelle jeudi 16.', faits: [eng.id] }] }; };
  const r = await SY.generer('agent', agent.id, { llm });
  assert.equal(r.ok, true);
  assert.match(vu, /Paul Durand/);
  assert.equal(r.synthese.version, 1);
  assert.equal(r.synthese.lignes.length, 2);
  const f = SY.ficheLayer('agent', agent.id);
  assert.equal(f.synthese.lignes[0].faits[0], info.id);
  assert.deepEqual(f.engagements.map((e) => e.id), [eng.id], 'l\'engagement tenu n\'est pas ouvert');
  assert.equal(f.total, 3);
  await SY.generer('agent', agent.id, { llm });
  assert.equal(SY.synthese('agent', agent.id).version, 2);
});

test('un fait qui change : la synthèse est périmée, sa régénération attend l\'heure révolue', () => {
  const s = SY.synthese('agent', agent.id);
  const n = SY.ficheChangee(info.id, { maintenantMs: Date.parse(s.genere_le) + 10 * 60000 });
  assert.equal(n, 1);
  assert.equal(SY.synthese('agent', agent.id).perime, true);
  const t = db.prepare("SELECT * FROM layer_taches WHERE type = 'synthese' AND etat = 'en_attente'").get();
  assert.equal(t.apres, new Date(Date.parse(s.genere_le) + SY.UNE_HEURE_MS).toISOString(), 'pas avant une heure après la dernière');
  // Plusieurs faits dans l'heure : une seule tâche.
  SY.ficheChangee(eng.id);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM layer_taches WHERE type = 'synthese' AND etat = 'en_attente'").get().n, 1);
});

test('une fiche sans fait validé n\'a pas de synthèse', async () => {
  const r = await SY.generer('ville', 'Mâcon', { llm: async () => { throw new Error('ne doit pas être appelé'); } });
  assert.equal(r.vide, true);
  assert.equal(SY.synthese('ville', 'Mâcon'), null);
});
