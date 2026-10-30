// « À l'attention de » de la LOI : l'agent lié au bien (Twenty CRM, sinon le dossier) et son agence. Sans réseau :
// Twenty n'est pas configuré ici, c'est le dossier qui parle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-offres-agent-'));
process.env.TWENTY_URL = '';
process.env.TWENTY_API_KEY = '';
process.env.ANTHROPIC_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const A = await import('./offres-agent.js');

test("l'adresse du bien, de quoi la chercher dans Twenty", () => {
  assert.deepEqual(A.cleAdresse('27 rue Lafayette, 31000 Toulouse'), { numero: '27', motif: '%lafayette%', ville: 'toulouse' });
  assert.deepEqual(A.cleAdresse('5 place de la Libération, 56100 Lorient'), { numero: '5', motif: '%lib_ration%', ville: 'lorient' });
  assert.equal(A.cleAdresse('').motif, null);
});

test('la propriété retenue : même numéro, la bonne ville, un agent nommé', () => {
  const liste = [
    { name: '49 Lafayette Toulon', agentImmobilier: 'A' },
    { name: '27 Rue Lafayette, Paris', agentImmobilier: 'B', adresse: { addressCity: 'Paris' } },
    { name: '27 Rue Lafayette', agentImmobilier: 'C', adresse: { addressCity: 'Toulouse' } },
    { name: '27 Rue Lafayette, Toulouse', agentImmobilier: '' },
  ];
  assert.equal(A.choisirPropriete(liste, { numero: '27', ville: 'toulouse' }).agentImmobilier, 'C');
  assert.equal(A.choisirPropriete(liste, { numero: '127' }), null);
});

test("les trois lignes du haut : l'agence, « Représentée par » l'agent, l'adresse de l'agence", () => {
  assert.deepEqual(A.lignesAttention({ agent: 'Franck Grassi', agence: 'Adresse Pro', adresse: '3 rue X, 31000 Toulouse' }),
    { attention_nom: 'Adresse Pro', attention_representant: 'Représentée par Franck Grassi', attention_adresse: '3 rue X, 31000 Toulouse' });
  assert.deepEqual(A.lignesAttention({ agent: 'Laurent B' }), { attention_nom: 'Laurent B', attention_representant: null, attention_adresse: null });
  assert.equal(A.lignesAttention({}), null);
  assert.equal(A.adresseAgence({ adresse: '3 rue X', code_postal: '31000', ville: 'Toulouse' }), '3 rue X, 31000 Toulouse');
  assert.equal(A.adresseAgence({ adresse: '3 rue X, 31000 Toulouse', code_postal: '31000' }), '3 rue X, 31000 Toulouse');
  // Une lettre qui dit déjà à qui elle s'adresse n'est pas réécrite.
  const t = { champs: { attention_nom: 'Agence', attention_representant: null } };
  assert.deepEqual(A.attentionAPoser({ attention_adresse: 'déjà dit' }, t), {});
  assert.deepEqual(A.attentionAPoser({}, t), { attention_nom: 'Agence' });
});

test("sans Twenty : l'agent du dossier et l'agence du carnet remplissent le haut de la lettre", async () => {
  Records.create('AgenceProspect', { nom: 'Azur Commerces', ville: 'Nice', adresse: '8 rue de France', code_postal: '06000' });
  Records.create('Deal', { deal_id: 'D-AGENT', lots: [], apercu: { agent_nom: 'Marc Durand', agence: 'Azur Commerces' } });
  const r = await A.attentionDuBien({ deal: Records.findBy('Deal', 'deal_id', 'D-AGENT') });
  assert.equal(r.origine, 'dossier');
  assert.deepEqual(r.champs, { attention_nom: 'Azur Commerces', attention_representant: 'Représentée par Marc Durand', attention_adresse: '8 rue de France, 06000 Nice' });
  // La lettre vierge du dossier l'a déjà, et en dit la source.
  const O = await import('./offres.js');
  const v = await O.lettreVierge({ deal_id: 'D-AGENT' });
  assert.deepEqual(v.parties.attention.map(([, x]) => x), ['Azur Commerces', 'Représentée par Marc Durand', '8 rue de France, 06000 Nice']);
  assert.equal(v.sources_champs.attention_nom.nature, 'dossier');
  // Le chat n'a que l'acheteur, le prix et l'apport à demander.
  const { executerOutil } = await import('./ak/agent.js');
  const JULES = { email: 'jules.b@klocka.immo', role: 'admin' };
  const manque = await executerOutil({ name: 'rediger_loi', input: { deal_id: 'D-AGENT' } }, JULES, { message: { espace: `app:${JULES.email}`, page: 'offres' } });
  assert.equal(manque.ok, false);
  assert.equal(manque.a_l_attention_de, 'Azur Commerces, Représentée par Marc Durand');
  assert.ok(!manque.manque.some((m) => /vendeur/.test(m)));
});
