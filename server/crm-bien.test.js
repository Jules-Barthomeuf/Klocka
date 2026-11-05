// Le bien entré par l'assistant, recopié dans le CRM comme Jules le fait (4 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-crm-bien-'));
const { Records } = await import('./db.js');
const C = await import('./crm-bien.js');

const user = { email: 'm@kpartners.fr', role: 'mandataire' };
// Un faux CRM : il garde ce qu'on lui écrit.
const fauxCrm = () => {
  const lignes = new Map(); let n = 100;
  return {
    lignes,
    mondayConfigure: () => true,
    lienMonday: (b, id) => `crm://${b}/${id}`,
    creerElement: async (tableau, nom, colonnes, o) => { n += 1; lignes.set(String(n), { tableau, nom, colonnes, labels: o?.labels }); return { id: String(n) }; },
    majElement: async (tableau, id, colonnes) => { lignes.set(String(id), { ...(lignes.get(String(id)) || {}), tableau, colonnes }); },
  };
};

test('la ligne du bien : statut de son étape, type, prix, notes ; un contact vendeur ou acquéreur', () => {
  const p = { id: 'p', mandataire_email: user.email, adresse: '3 rue Neuve', ville: 'Lyon', nom: 'SCI Neuve', telephone: '0600000000', type_bien: 'murs_et_fonds', activite: 'Boulangerie', biens: { validee: 'mandat', prix_accord: 450000, repris: { loyer_annuel: 24000, surface: 80 } }, mandat_importe: { signe_le: '2026-09-12', echeance: '2026-12-12', exclusif: true } };
  const c = C.colonnesPropriete(p, { touches: [{ nom: 'M. A', statut_touche: 'offre' }], relance: '2026-11-10' });
  assert.deepEqual(c.status, { label: 'Mandat signé' });
  assert.deepEqual(c.type, { label: 'Murs et fonds' });
  assert.equal(c.numbers, 450000);
  assert.equal(c.numeric_mkvnjean, 24000);
  assert.deepEqual(c.date, { date: '2026-11-10' }, 'la prochaine étape de suivi');
  assert.match(c.long_text_mkv69k9d.text, /Mandat exclusif signé le 12\/09\/2026, échéance le 12\/12\/2026/);
  assert.match(c.long_text_mkv69k9d.text, /M\. A \(Offre\)/);
  const v = C.contactVendeur(p);
  assert.equal(v.mandat, 'Signé');
  const cols = C.colonnesContact('5091573479', v, { proprieteId: '42' });
  assert.deepEqual(cols.dropdown_mm0n2ygh, { labels: ['Vendeur'] });
  assert.deepEqual(cols.board_relation_mm0p8awx, { item_ids: [42] });
  assert.ok(C.vendeurCommite({ biens: { validee: 'avis_accepte' } }));
  assert.ok(!C.vendeurCommite({ biens: { validee: 'previsite' } }));
  assert.ok(C.acquereurCommite({ statut_touche: 'offre' }));
  assert.ok(C.acquereurCommite({ statut_touche: 'visite', budget_valide: true }));
  assert.ok(!C.acquereurCommite({ statut_touche: 'visite' }));
});

test('mettre au CRM : le bien, le vendeur et les touches ; les commités proposés ; Clients au oui ; rien pour un test', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: '3 rue Neuve', adresse: '3 rue Neuve', ville: 'Lyon', nom: 'SCI Neuve', statut: 'mandat_signe', type_bien: 'murs_commerce', biens: { validee: 'mandat', prix_accord: 450000 } });
  const a = Records.create('AcquereurMandataire', { mandataire_email: user.email, nom: 'M. Achat', proprietaire_id: p.id, statut_touche: 'offre', offre_montant: 420000 });
  const crm = fauxCrm();
  const r = await C.mettreAuCrm(p.id, user, { crm, geocoder: async () => null });
  assert.ok(r.ok);
  assert.equal(crm.lignes.size, 3, 'la propriété, le vendeur, la touche');
  assert.ok([...crm.lignes.values()].every((l) => l.labels), 'les étiquettes qui manquent sont ajoutées');
  assert.deepEqual(r.a_proposer_en_clients.map((x) => x.qui), ['proprietaire', a.id]);
  const f = Records.get('ProprietaireMandataire', p.id);
  assert.ok(f.crm.propriete && f.crm.prospect);
  await C.mettreAuCrm(p.id, user, { crm, geocoder: async () => null });
  assert.equal(crm.lignes.size, 3, 'une deuxième fois : mis à jour, pas doublé');
  const c = await C.passerEnClients(p.id, ['proprietaire', a.id], user, { crm });
  assert.ok(c.ok);
  assert.equal(crm.lignes.size, 5);
  assert.ok(Records.get('AcquereurMandataire', a.id).crm.client);
  assert.equal((await C.mettreAuCrm(p.id, user, { crm, geocoder: async () => null })).a_proposer_en_clients.length, 0, 'déjà en Clients : plus proposé');
  const t = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Bien test', statut: 'rdv_pris', test: true, biens: {} });
  assert.equal((await C.mettreAuCrm(t.id, user, { crm })).ok, false);
  assert.equal((await C.mettreAuCrm(p.id, { email: 'autre@kpartners.fr' }, { crm })).ok, false);
});
