// Haka : « Fait par Haka », ce qu'il a fait seul. Les passes de la veille et
// les tâches finies se racontent en une ligne ; ce qui attend un clic n'y est pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-fait-'));
const { decrireRapport, decrireTache } = await import('./fait.js');

test('un passage de la veille : la fiche pré-analysée et les documents classés, pas ce que l\'Assistant KPartners a mis en file', () => {
  const items = decrireRapport({ id: 'r1', le: '2026-10-17T08:00:00Z', lignes: [
    { dossier: 'Carnot', deal_id: 'd1', de: 'agent@x.fr', preanalyse: true },
    { dossier: 'Vitton', deal_id: 'd2', documents: ['bail.pdf', 'kbis.pdf'], drive: 'Klocka/Vitton', monday: 'fiche mise à jour' },
    { dossier: null, deal_id: null, documents: ['fiche.pdf'], haka: 't1', en_file: true },
  ] });
  assert.equal(items.length, 2);
  assert.equal(items[0].quoi, 'Fiche triée, dossier pré-analysé');
  assert.equal(items[0].lien, '/Dossiers?deal_id=d1');
  assert.equal(items[1].quoi, '2 documents classés');
  assert.match(items[1].detail, /Vitton · Drive · fiche mise à jour/);
});

test('une tâche : ses pas internes finis seulement ; une relance du matin vide ne dit rien', () => {
  const fiche = decrireTache({ id: 't1', type: 'fiche_recue', dossier: 'd1', etat: 'attend_validation', maj_le: '2026-10-17T09:00:00Z' }, [
    { nom: 'creer_dossier', etat: 'faite', externe: 0, resultat: JSON.stringify({ deal_id: 'd1', rejoint: false }) },
    { nom: 'preanalyse', etat: 'faite', externe: 0 },
    { nom: 'envoyer_demande_documents', etat: 'en_attente', externe: 1 },
  ], { titreDossier: () => 'Carnot' });
  assert.equal(fiche.quoi, 'Fiche triée, dossier créé et pré-analysé');
  assert.equal(fiche.detail, 'Carnot');
  assert.equal(decrireTache({ id: 't2', type: 'fiche_recue', etat: 'en_attente' }, [{ nom: 'creer_dossier', etat: 'en_attente', externe: 0 }]), null);
  const matin = decrireTache({ id: 't3', type: 'relances_matin', etat: 'faite' }, [{ nom: 'preparer', etat: 'faite', externe: 0, resultat: JSON.stringify({ en_file: 3 }) }]);
  assert.equal(matin.quoi, '3 relances préparées');
  assert.equal(decrireTache({ id: 't4', type: 'relances_matin', etat: 'faite' }, [{ nom: 'preparer', etat: 'faite', externe: 0, resultat: JSON.stringify({ en_file: 0 }) }]), null);
  assert.equal(decrireTache({ id: 't5', type: 'relance_mail', etat: 'faite' }, []), null);
});
