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

test('une liaison sans tableau relié dans Monday : la ligne part quand même, sans la liaison', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: '137 rue Gambetta', adresse: '137 rue Gambetta', ville: 'Lille', nom: 'Jean Bernard', type_bien: 'murs_commerce', biens: { validee: 'previsite' } });
  const crm = fauxCrm();
  const creer = crm.creerElement;
  crm.creerElement = async (tableau, nom, colonnes, o) => {
    if (Object.values(colonnes).some((v) => v && typeof v === 'object' && 'item_ids' in v)) throw new Error('The column has no connected boards');
    return creer(tableau, nom, colonnes, o);
  };
  const r = await C.mettreAuCrm(p.id, user, { crm, geocoder: async () => null });
  assert.ok(r.ok, r.error);
  assert.equal(crm.lignes.size, 2, 'la propriété et le vendeur');
});

// La location (6 nov. 2026, Jules : « adapter tout le système à la location »).
test('une location : Type Location, pas de prix, le loyer demandé, ses statuts ; Bailleur et Locataire', () => {
  const statut = (validee) => C.colonnesPropriete({ id: 'l', mandataire_email: user.email, type_bien: 'murs_commerce', biens: { transaction: 'location', validee, repris: { loyer_annuel: 13200 } } }).status.label;
  assert.deepEqual([null, 'previsite', 'avis_accepte', 'mandat', 'dataroom', 'marche', 'offre'].map(statut),
    ['Pré-visite', 'Estimation du loyer', 'Estimation du loyer', 'Mandat de location signé', 'En location', 'Candidat retenu', 'Loué']);
  const p = { id: 'l', mandataire_email: user.email, adresse: "9 rue de l'Oratoire", ville: 'Grasse', nom: 'M. Bailleur', type_bien: 'fonds_commerce',
    biens: { transaction: 'location', validee: 'vente', prix_accord: 999, repris: { loyer_annuel: 13200 }, loue: { le: '2026-11-05T09:00:00.000Z', locataire: 'Sofia Lemaire', loyer_annuel: 13200 } }, mandat_importe: { signe_le: '2026-10-22' } };
  const c = C.colonnesPropriete(p, { touches: [{ nom: 'Sofia Lemaire', statut_touche: 'bail_signe', role: 'locataire' }] });
  assert.deepEqual(c.bedrooms1, { labels: ['Location'] });
  assert.equal(c.numbers, undefined, 'pas de prix');
  assert.equal(c.numeric_mkvnjean, 13200, 'le loyer demandé');
  assert.match(c.long_text_mkv69k9d.text, /Candidats : Sofia Lemaire \(Bail signé\)/);
  assert.match(c.long_text_mkv69k9d.text, /Loué à Sofia Lemaire le 05\/11\/2026/);
  const v = C.contactVendeur(p);
  assert.equal(v.statut, 'Loué');
  assert.equal(v.bien, 'Local commercial', 'pas « Fond de commerce » en location');
  const cv = C.colonnesContact('5091573479', v);
  assert.deepEqual(cv.dropdown_mm0n2ygh, { labels: ['Bailleur'] });
  const a = C.contactAcquereur({ nom: 'Sofia Lemaire', statut_touche: 'dossier', budget_max: 12000, mandataire_email: user.email }, p);
  assert.equal(a.statut, 'Dossier reçu');
  const ca = C.colonnesContact('5091573479', a);
  assert.deepEqual(ca.dropdown_mm0n2ygh, { labels: ['Locataire'] });
  assert.deepEqual(ca.color_mm8sd6ah, { label: 'Dossier reçu' });
  assert.deepEqual(ca.color_mm0f65qr, { label: 'Local commercial' });
  assert.equal(ca.numeric_mm0fjvz0, 12000, 'le loyer accepté');
  assert.ok(C.acquereurCommite({ statut_touche: 'accord' }));
  assert.ok(!C.acquereurCommite({ statut_touche: 'dossier' }));
});

test('une vente reste une vente : Type Vente, le prix, Vendeur et Acquéreur', () => {
  const p = { id: 'v', mandataire_email: user.email, type_bien: 'fonds_commerce', biens: { validee: 'marche', prix_accord: 300000, repris: { loyer_annuel: 20000 } } };
  const c = C.colonnesPropriete(p);
  assert.deepEqual(c.bedrooms1, { labels: ['Vente'] });
  assert.deepEqual(c.status, { label: 'Sous offre' });
  assert.equal(c.numbers, 300000);
  assert.equal(C.contactVendeur(p).bien, 'Fond de commerce');
  assert.deepEqual(C.colonnesContact('5091573479', C.contactVendeur(p)).dropdown_mm0n2ygh, { labels: ['Vendeur'] });
  assert.deepEqual(C.colonnesContact('5091573479', C.contactAcquereur({ nom: 'X', statut_touche: 'offre' }, p)).dropdown_mm0n2ygh, { labels: ['Acquéreur'] });
});

test('mettre au CRM une location : le bailleur et la candidate, dits ainsi ; la candidate à l’accord proposée en Clients', async () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: '9 rue de l’Oratoire', adresse: "9 rue de l'Oratoire", ville: 'Grasse', nom: 'M. Bailleur', type_bien: 'murs_commerce', biens: { transaction: 'location', validee: 'marche', repris: { loyer_annuel: 13200 } } });
  const a = Records.create('AcquereurMandataire', { mandataire_email: user.email, nom: 'Sofia Lemaire', proprietaire_id: p.id, role: 'locataire', statut_touche: 'accord' });
  const crm = fauxCrm();
  const r = await C.mettreAuCrm(p.id, user, { crm, geocoder: async () => null });
  assert.ok(r.ok, r.error);
  assert.ok(r.faits.some((f) => /\(bailleur\)/.test(f)));
  assert.ok(r.faits.some((f) => /Sofia Lemaire .*\(candidat locataire\)/.test(f)));
  assert.ok(r.a_proposer_en_clients.some((x) => x.qui === a.id && x.pourquoi === 'accord du candidat'));
  const propriete = [...crm.lignes.values()].find((l) => l.tableau === '5100528599');
  assert.deepEqual(propriete.colonnes.status, { label: 'Candidat retenu' });
  assert.equal(propriete.colonnes.numbers, undefined);
});
