// Les ratés réels d'AK, rejoués : chaque échec relevé dans le journal des
// actions devient un cas ici, pour qu'il ne revienne pas. Un cas par ligne du
// journal, avec sa date. Sans réseau ni modèle : on appelle l'outil comme AK
// l'a appelé ce jour-là, et on vérifie ce qu'il rend maintenant.
//
// Pour en ajouter : relire « Les ratées, à corriger » dans
// docs/etat-plateforme.md, rejouer l'appel ici, corriger l'outil.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ratees-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const { executerOutil, completerIdentifiants } = await import('./agent.js');
const { issueDe } = await import('../assistant-journal.js');

const JULES = { email: 'jules.b@klocka.immo', role: 'admin', full_name: 'Jules B' };
const APP = { message: { espace: `app:${JULES.email}`, auteur: { nom: JULES.email }, texte: '' } };

test('21/09 · simuler_dossier sans loyer : une question, pas trois essais', async () => {
  const deal = Records.create('Deal', { deal_id: '7fb55182-b4ee-4a53-9fbd-ad979a986b6f', lots: [{ lot: {}, simulateur: { prixBienNegocie: 1134000 } }] });
  const r = await executerOutil({ name: 'simuler_dossier', input: { deal_id: deal.deal_id, prix_negocie: 1050000 } }, JULES, APP);
  assert.equal(issueDe(r), 'question', 'il manque le loyer : AK le demande');
  assert.match(r.error, /Ne relance pas sans lui/);
  // Le loyer donné, la simulation sort.
  const ok = await executerOutil({ name: 'simuler_dossier', input: { deal_id: deal.deal_id, prix_negocie: 1050000, loyer_annuel: 72000 } }, JULES, APP);
  assert.equal(issueDe(ok), 'reussite', JSON.stringify(ok).slice(0, 200));
  assert.equal(ok.loyer_suppose, 72000);
});

test('21/09 · analyser_fiche sans fiche : on la demande', async () => {
  const r = await executerOutil({ name: 'analyser_fiche', input: { texte_du_message: true } }, JULES, { message: { ...APP.message, texte: 'fais la préanalyse' } });
  assert.equal(issueDe(r), 'question');
  assert.match(r.manque[0], /fiche du bien/);
});

test('01/10 · modifier_dossier avec un identifiant raccourci : le dossier est retrouvé', () => {
  Records.create('Deal', { deal_id: '444c9d83-1111-4222-8333-944445555666', lots: [] });
  const a = completerIdentifiants({ name: 'modifier_dossier', input: { deal_id: '444c9d83', loyer_annuel_ht_hc: 18000 } });
  assert.equal(a.input.deal_id, '444c9d83-1111-4222-8333-944445555666');
  // Ambigu : deux dossiers commencent pareil, on ne devine pas.
  Records.create('Deal', { deal_id: 'abcdef12-0000-0000-0000-000000000001', lots: [] });
  Records.create('Deal', { deal_id: 'abcdef12-0000-0000-0000-000000000002', lots: [] });
  assert.equal(completerIdentifiants({ name: 'x', input: { deal_id: 'abcdef12' } }).input.deal_id, 'abcdef12');
  // Trop court : on ne touche à rien.
  assert.equal(completerIdentifiants({ name: 'x', input: { deal_id: '444c' } }).input.deal_id, '444c');
});

test('21/09 · creer_projet_depuis_dossier quand le projet existe : on le donne', async () => {
  const projet = Records.create('Project', { titre: 'Existant' });
  Records.create('Deal', { deal_id: '3afc4554-afe6-4f6a-9d32-898f88f233cf', projet_id: projet.id, lots: [{ lot: {} }] });
  const r = await executerOutil({ name: 'creer_projet_depuis_dossier', input: { deal_id: '3afc4554-afe6-4f6a-9d32-898f88f233cf', lot_index: 0 } }, JULES, APP);
  assert.equal(issueDe(r), 'reussite');
  assert.equal(r.deja, true);
  assert.equal(r.projet_id, projet.id);
  assert.match(r.lien, new RegExp(projet.id));
});

test('21/09 · annuler sans rien à annuler : une réponse, pas un échec', async () => {
  const r = await executerOutil({ name: 'annuler_derniere_action', input: {} }, { ...JULES, email: 'personne@klocka.immo' }, APP);
  assert.equal(issueDe(r), 'reussite');
  assert.equal(r.rien_a_annuler, true);
});

test("05/10 · « le projet de Dieppe » ne trouvait rien : trouver_bien cherche partout et numérote", async () => {
  const { trouverBien } = await import('../assistant-commande.js');
  const abf = Records.create('Project', { titre: 'Agence ABF Immobilier - 4 Rue Victor Hugo 76200 Dieppe', adresse_complete: '4 Rue Victor Hugo 76200 Dieppe', ville_secteur_champ1: 'Dieppe', nom_locataire: 'ABF Immobilier', prix_acquisition: 129600, deal_id: 'dieppe-abf-0001' });
  Records.create('Deal', { deal_id: 'dieppe-abf-0001', nom: 'ABF Dieppe', projet_id: abf.id, lots: [{ lot: { adresse: { valeur: { rue: '4 Rue Victor Hugo', ville: 'Dieppe' } } } }] });
  Records.create('Project', { titre: 'Diamond Shop - 42 rue Saint-Jacques, 76200 Dieppe', ville_secteur_champ1: 'Dieppe', nom_locataire: "Société DIAMOND'SHOP", prix_acquisition: 152000 });
  Records.create('Deal', { deal_id: 'dieppe-seul-0002', nom: 'Pharmacie du Port - Dieppe', lots: [{ lot: { prix_fai: { valeur: 300000 } } }] });
  const r = trouverBien('le projet de Dieppe');
  assert.equal(r.nombre, 3, 'deux projets et un dossier sans projet ; le dossier du projet ABF ne compte pas deux fois');
  assert.deepEqual(r.candidats.map((c) => c.n), [1, 2, 3]);
  assert.deepEqual(r.candidats.map((c) => c.genre), ['projet', 'projet', 'dossier'], 'les projets d\'abord');
  assert.equal(r.candidats.find((c) => c.projet_id === abf.id).deal_id, 'dieppe-abf-0001', 'le projet emporte son dossier');
  assert.match(r.conseil, /demande lequel/);
  assert.equal(trouverBien('Diamond Shop').unique, true);
  assert.equal(trouverBien('Lille').nombre, 0);
});
