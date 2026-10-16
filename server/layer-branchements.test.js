// Le Layer, phase 6 : les branchements (pré-analyse, matching investisseur, Ma journée).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-branchements-'));
process.env.SUPER_ADMIN_EMAILS = 'jules@klocka.test';
process.env.MISTRAL_API_KEY = '';
const { Records } = await import('./db.js');
const SY = await import('./layer-syntheses.js');

const NORA = { email: 'nora@klocka.test', full_name: 'Nora Lorinquer', role: 'admin' };
const agent = Records.create('AgentImmo', { nom: 'Durand', email: 'durand@agence.fr', statut: 'nouveau' });
const client = Records.create('User', { email: 'sourigon@exemple.fr', full_name: 'Simon Sourigon', role: 'user' });
Records.create('Deal', { deal_id: 'd-1', nom: 'Boulangerie, Nice', contact_agent_email: 'durand@agence.fr', lots: [{ lot: { locataire_nom: { valeur: 'Maison Dorée' }, adresse: { valeur: { rue: '1 rue A', ville: 'Nice' } } } }] });
const src = Records.create('CerveauSource', { type: 'appel', auteur: NORA.email, titre: 'Appel Durand', date: '2026-10-14T09:00:00Z', contenu: '…' });
const fait = (o, liens = []) => { const f = Records.create('CerveauFait', { source_id: src.id, statut: 'valide', citation: '', ...o }); for (const l of liens) Records.create('CerveauLien', { fait_id: f.id, ...l }); return f; };
const surAgent = fait({ type: 'information', resume: 'Durand vend surtout des fonds de commerce' }, [{ type_entite: 'agent', entite_id: agent.id }]);
const duDossier = fait({ type: 'decision', resume: 'On regarde la boulangerie de Nice' }, [{ type_entite: 'dossier', entite_id: 'd-1' }]);
const surClient = fait({ type: 'information', resume: 'Simon Sourigon exclut les restaurants' }, [{ type_entite: 'investisseur', entite_id: client.id }]);
fait({ type: 'engagement', resume: 'Simon Sourigon rappelle lundi', statut_engagement: 'ouvert' }, [{ type_entite: 'investisseur', entite_id: client.id }]);
const engDuJour = fait({ type: 'engagement', resume: 'Durand rappelle aujourd\'hui', echeance: '2026-10-15', statut_engagement: 'ouvert', responsable: 'Durand' }, [{ type_entite: 'agent', entite_id: agent.id }]);
fait({ type: 'engagement', resume: 'Durand envoie la fiche plus tard', echeance: '2026-10-30', statut_engagement: 'ouvert' }, [{ type_entite: 'agent', entite_id: agent.id }]);

test('pré-analyse : l\'enseigne, la ville et l\'agent du lot, sans les faits du dossier lui-même', async () => {
  const appels = [];
  const rechercher = async (q) => { appels.push(q); return { faits: q.ville ? [duDossier] : [] }; };
  const r = await SY.dejaSu('d-1', 0, { rechercher });
  assert.equal(r.enseigne, 'Maison Dorée');
  assert.equal(r.ville, 'Nice');
  assert.equal(r.agent.id, agent.id);
  assert.deepEqual(appels.map((q) => [q.texte, q.ville || null]), [['Maison Dorée', null], ['Maison Dorée', 'Nice']]);
  assert.ok(!r.faits.some((f) => f.id === duDossier.id), 'le fait du dossier lui-même est écarté');
  const parAgent = r.faits.find((f) => f.id === surAgent.id);
  assert.match(parAgent.pourquoi, /agent Durand/);
  assert.equal((await SY.dejaSu('inconnu')).ok, false);
});

test('matching : les faits d\'information et de décision de l\'investisseur, retrouvé par son adresse', () => {
  const r = SY.ficheInvestisseur('Sourigon@Exemple.fr');
  assert.equal(r.investisseur.nom, 'Simon Sourigon');
  assert.deepEqual(r.faits.map((f) => f.id), [surClient.id], 'pas l\'engagement');
  assert.equal(SY.ficheInvestisseur('personne@nulle.part').investisseur, null);
});

test('Ma journée : les engagements du jour ou en retard de la personne, pas ceux à venir', async () => {
  const j = await SY.journee(NORA, { maintenantD: new Date('2026-10-15T10:00:00Z') });
  assert.equal(j.jour, '2026-10-15');
  assert.deepEqual(j.engagements.map((e) => e.id), [engDuJour.id], 'de son appel, échéance aujourd\'hui ; pas celui du 30');
  assert.equal(j.engagements[0].fiche.type_entite, 'agent');
  const plusTard = await SY.journee(NORA, { maintenantD: new Date('2026-10-17T10:00:00Z') });
  assert.equal(plusTard.engagements[0].en_retard, true);
  const autre = await SY.journee({ email: 'maxime@klocka.test', full_name: 'Maxime P', role: 'admin' }, { maintenantD: new Date('2026-10-15T10:00:00Z') });
  assert.equal(autre.engagements.length, 0, 'rien pour qui n\'est ni l\'auteur ni le responsable');
});
