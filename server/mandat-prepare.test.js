import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-mandat-prepare-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const C = await import('./mandataire-mandat-chat.js');

const moi = { email: 'lea@kpartners.fr', role: 'mandataire' };
// Un avis envoyé et une fiche d'accord, comme ceux de la rue Tête d'Or (27 oct. 2026).
const estimation = {
  mandataire_email: moi.email, bien: "Murs commerciaux · 57 rue Tête d'Or, Lyon", adresse: "57 rue Tête d'Or, 69006 Lyon", statut: 'envoye',
  questionnaire: { type_bien: 'murs_commerce', demandeur: 'Jean Paul', surface_utile: 50, occupe: true, locataire: 'JB SCI', activite_locataire: 'Brasserie' },
  avis: { type_libelle: 'Murs commerciaux', chiffres: { valeur: 385000, honoraires_pct: 5 } },
  envoi: { a: 'jp@exemple.fr' },
};

test('le mandat se prépare avec l’avis et la fiche : rien d’inventé, le reste à demander', () => {
  const q = C.questionnaireDuBien({ estimation, proprietaire: { telephone: '0600000000', biens: { prix_accord: 380000 } } });
  assert.equal(q.vendeur_nom, 'Jean Paul');
  assert.equal(q.vendeur_email, 'jp@exemple.fr');
  assert.equal(q.bien_adresse, "57 rue Tête d'Or, 69006 Lyon");
  assert.equal(q.bien_designation, "Murs commerciaux d'environ 50 m², loués à usage de brasserie");
  assert.equal(q.bien_locataire, 'JB SCI');
  assert.equal(q.prix, 380000, 'le prix d’accord passe avant la valeur de l’avis');
  assert.equal(q.honoraires, 5);
  assert.deepEqual(C.manquantsMandat(q).map((m) => m.split(' ').slice(0, 3).join(' ')), ['le type de', "l'adresse du mandant", 'la charge des', 'la durée du']);
  // Les murs d'une SCI : la société est le mandant, la personne rencontrée la représente.
  const sci = C.questionnaireDuBien({ estimation, proprietaire: { nom: 'M. Martin', preparation: { murs: { proprietaire: 'SCI du Pont', forme: 'SCI' } } } });
  assert.equal(sci.vendeur_societe, 'SCI du Pont');
  assert.equal(sci.vendeur_representant, 'M. Martin');
});

test('à l’étape Mandat : un seul mandat par avis, et le chat s’ouvre sur ce qui est repris puis ce qui manque', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: moi.email, statut: 'rdv_pris', biens: { prix_accord: 385000 }, historique: [] });
  const e = Records.create('EstimationMandataire', { ...estimation, proprietaire_id: p.id });
  assert.equal(C.preparerMandat({ estimation_id: e.id }, { email: 'autre@kpartners.fr', role: 'mandataire' }).ok, false);
  const r = C.preparerMandat({ estimation_id: e.id }, moi);
  assert.equal(r.cree, true);
  assert.equal(C.preparerMandat({ estimation_id: e.id }, moi).mandat_id, r.mandat_id, 'rouvrir l’étape ne double pas le mandat');
  const m = Records.get('MandatMandataire', r.mandat_id);
  assert.equal(m.estimation_id, e.id);
  assert.equal(m.statut, 'brouillon');
  assert.equal(m.questionnaire.prix, 385000);
  const c = await C.conversationDuMandat(m.id, moi);
  assert.equal(c.ok, true);
  const { lireConversation } = await import('./assistant-conversations.js');
  const premier = lireConversation(moi, c.conversation_id, { espace: 'mandataire-mandat' }).messages.at(-1).contenu;
  assert.match(premier, /J'ai préparé le mandat avec ce qu'on sait déjà : le vendeur \(Jean Paul\).*le prix \(385\s000 €\)/);
  assert.match(premier, /il me manque : le type de mandat/);
});
