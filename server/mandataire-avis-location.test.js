import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

// L'avis de valeur locative (6 nov. 2026, Jules) : un local à louer s'estime en loyer, jamais en prix.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-avis-location-'));
const { Records } = await import('./db.js');
const L = await import('../src/lib/avis-location.js');
const A = await import('./mandataire-avis.js');
const R = await import('./restitution-avis.js');
const { deckDeLAvis } = await import('../src/lib/deck-avis.js');

const marche = { source: 'Data-B · Valeurs locatives', rue: { nom: 'Rue Exemple', basse: 300, haute: 400 }, quartier: { nom: 'Centre', basse: 250, haute: 380 }, ville: { nom: 'Lyon', basse: 180, haute: 320 } };

test('le loyer : valeur locative de la rue, ajustée par le local, sur la surface', () => {
  const r = L.chiffrerLoyer({ surface_utile: 80, rang_rue: 'n1', extraction: 'oui' }, { marche });
  // 350 €/m² de marché, + 10 % (n°1) + 5 % (extraction) = 402,5 €/m², × 80 m² = 32 200 €, rond à 32 000 €.
  assert.equal(r.marche.m2, 350);
  assert.equal(r.marche.echelle, 'rue');
  assert.equal(r.ajustement_pct, 15);
  assert.equal(r.valeur, 32000);
  assert.equal(r.loyer_m2, 400);
  assert.equal(r.bas, 29000);
  assert.equal(r.haut, 35000);
  assert.ok(r.bas <= r.valeur && r.valeur <= r.haut);
  assert.equal(r.mensuel, Math.round(32000 / 12));
  // Ni prix, ni rendement.
  for (const k of ['prix_affiche', 'rendement', 'cout_total', 'capitalisation', 'frais_pct']) assert.equal(r[k], undefined);
});

test('le loyer se fait sur la surface pondérée quand elle est donnée', () => {
  const r = L.chiffrerLoyer({ surface_utile: 100 }, { marche: { rue: { basse: 200, haute: 200 } }, surfacePonderee: 90 });
  assert.equal(r.surface_ponderee, 90);
  assert.equal(r.valeur, 18000);
});

test('sans valeur locative de marché ni surface, pas de loyer inventé', () => {
  assert.equal(L.chiffrerLoyer({ surface_utile: 80 }, { marche: null }), null);
  assert.equal(L.chiffrerLoyer({ surface_utile: 80 }, { marche: { source: 'Data-B' } }), null);
  assert.equal(L.chiffrerLoyer({}, { marche }), null);
});

test('les ajustements sont bornés à 25 %, et un local à rafraîchir baisse le loyer', () => {
  const haut = L.chiffrerLoyer({ surface_utile: 50, rang_rue: 'n1', extraction: 'oui', angle: 'oui', etat_local: 'refait', facade: '9 m de vitrine' }, { marche });
  assert.equal(haut.ajustement_pct, 25);
  const bas = L.ajustementsLoyer({ rang_rue: 'n2', etat_local: 'à rafraîchir', vacance_rue_pct: 20 });
  assert.deepEqual(bas.map((a) => a.pct), [-10, -5, -5]);
  assert.equal(L.etatDuLocal('Refait à neuf'), 'refait');
  assert.equal(L.etatDuLocal('travaux'), 'a_rafraichir');
  assert.equal(L.etatDuLocal("bon état d'usage"), 'bon');
  assert.equal(L.etatDuLocal('nc'), null);
});

test('les conditions conseillées : 3 mois de dépôt, franchise selon les travaux, honoraires du preneur', () => {
  const c = L.conditionsLocation(36000, { etat_local: 'a_rafraichir' });
  assert.equal(c.depot_garantie_mois, 3);
  assert.equal(c.depot_garantie, 9000);
  assert.equal(c.franchise_mois, 2);
  assert.equal(c.honoraires, 5400);
  assert.equal(c.honoraires_charge, 'preneur');
  assert.equal(L.conditionsLocation(36000, { etat_local: 'bon' }).franchise_mois, 0);
  assert.equal(L.conditionsLocation(36000, { etat_local: 'a_rafraichir', franchise_mois: 0 }).franchise_mois, 0);
  assert.equal(L.conditionsLocation(null).depot_garantie, null);
});

test('les questions d’un local à louer : ni loué ou libre, ni loyer en place, ni échéance, ni taux', () => {
  const q = { transaction: 'location', type_bien: 'murs_commerce' };
  const m = A.manquants(q);
  for (const k of ['adresse', 'surface_utile', 'destination', 'extraction', 'etat_local', 'disponible_le']) assert.ok(m.includes(k), k);
  for (const k of ['occupe', 'loyer_annuel_hc', 'echeance', 'taux_base', 'etat']) assert.ok(!m.includes(k), k);
  assert.deepEqual(A.essentielsManquants(q), ['adresse', 'surface_utile', 'destination', 'extraction', 'etat_local', 'disponible_le']);
  assert.deepEqual(A.essentielsManquants({ ...q, adresse: '1 rue X, 69003 Lyon', surface_utile: 80, destination: 'Tous commerces', extraction: 'non', etat_local: 'bon', disponible_le: 'immédiatement' }), []);
});

test('la vente ne change pas : les questions des murs restent', () => {
  const m = A.manquants({ type_bien: 'murs_commerce' });
  for (const k of ['occupe', 'taux_base', 'rang_rue', 'etat']) assert.ok(m.includes(k), k);
  assert.ok(!m.includes('destination'));
  assert.deepEqual(A.essentielsManquants({ type_bien: 'murs_commerce', occupe: true }), ['adresse', 'surface_utile', 'loyer_annuel_hc', 'echeance', 'rang_rue', 'taux_base']);
});

test('le loyer retouché : le loyer au m², le mensuel et les conditions suivent, sans prix ni rendement', () => {
  const avis = { location: true, chiffres: { valeur: 30000, bas: 27000, haut: 33000, surface_ponderee: 75 }, conditions: { franchise_mois: 2, franchise_motif: 'travaux', depot_garantie_mois: 3 }, libre: { c_resume: 'x', titre: 'y' } };
  const r = A.recalculerChiffres(avis);
  assert.equal(r.chiffres.loyer_m2, 400);
  assert.equal(r.chiffres.mensuel, 2500);
  assert.equal(r.conditions.depot_garantie, 7500);
  assert.equal(r.conditions.honoraires, 4500);
  assert.equal(r.conditions.franchise_mois, 2);
  assert.equal(r.chiffres.prix_affiche, undefined);
  assert.equal(r.chiffres.rendement, undefined);
  assert.deepEqual(r.libre, { titre: 'y' });
});

test('l’aperçu d’un local à louer est un avis de valeur locative', () => {
  const a = A.avisProvisoire({ questionnaire: { transaction: 'location', type_bien: 'murs_commerce', adresse: '1 rue X, 69003 Lyon', surface_utile: 80, extraction: 'oui', etat_local: 'a_rafraichir' } });
  assert.equal(a.location, true);
  assert.equal(a.titre_document, 'Avis de valeur locative');
  assert.equal(a.cadre.objet, 'Estimer la valeur locative du local en vue de sa mise en location');
  assert.equal(a.locatif, null);
  assert.ok(a.description.lignes.some((l) => l.mot === 'État' && l.texte === 'À rafraîchir'));
  assert.equal(a.chiffres.prix_affiche, undefined);
  assert.equal(a.conditions.franchise_mois, 2);
  assert.doesNotMatch(JSON.stringify(a), /valeur vénale|rendement brut|notaire/i);
});

test('la reprise d’un local à louer demande la destination, pas le bail', () => {
  const t = A.messageDeReprise({ bien: 'Local · Lyon', questionnaire: { transaction: 'location', type_bien: 'murs_commerce', adresse: '1 rue X, 69003 Lyon' } });
  assert.match(t, /valeur locative/);
  assert.match(t, /destination/i);
  assert.doesNotMatch(t, /loué \?|taux|échéance/i);
});

test('le bien est à louer quand sa fiche le dit', () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: 'm@kp.fr', biens: { transaction: 'location' } });
  assert.equal(A.avisEnLocation({ proprietaire_id: p.id, questionnaire: {} }), true);
  assert.equal(A.avisEnLocation({ questionnaire: { transaction: 'location' } }), true);
  assert.equal(A.avisEnLocation({ questionnaire: { type_bien: 'murs_commerce' } }), false);
});

test('le deck de l’avis de valeur locative : loyers du secteur, loyer, conditions ; ni taux ni calcul', () => {
  const calcul = L.chiffrerLoyer({ surface_utile: 80, rang_rue: 'n1' }, { marche });
  const avis = {
    location: true, type_libelle: 'Murs commerciaux', bien: { rue: '1 rue X', ville: '69003 Lyon' },
    description: { lignes: [{ mot: 'Destination', texte: 'Tous commerces' }, { mot: 'Extraction', texte: 'Oui' }], surfaces: [{ zone: 'Boutique', utile: 80, coef: 1, ponderee: 80 }] },
    marche: { secteur: A.loyersDuSecteur(marche), loyers: { basse: 300, haute: 400, source: 'Data-B' }, lecture: 'Des loyers soutenus.' },
    methodes: { ajustements: calcul.ajustements, loyer_m2_marche: calcul.marche.m2 },
    chiffres: { valeur: calcul.valeur, bas: calcul.bas, haut: calcul.haut, loyer_m2: calcul.loyer_m2, mensuel: calcul.mensuel, surface_ponderee: 80 },
    conditions: L.conditionsLocation(calcul.valeur, {}),
  };
  const d = deckDeLAvis({ avis, estimation: { questionnaire: { transaction: 'location', disponible_le: 'immédiatement' } } });
  const cles = d.pages.map((p) => p.cle);
  assert.equal(d.etiquette, 'Avis de valeur locative');
  for (const k of ['secteur', 'valeur', 'conditions']) assert.ok(cles.includes(k), k);
  for (const k of ['taux', 'calcul', 'locatif']) assert.ok(!cles.includes(k), k);
  assert.deepEqual(d.masquees, []);
  assert.ok(cles.indexOf('secteur') < cles.indexOf('valeur') && cles.indexOf('valeur') < cles.indexOf('conditions'));
  const couverture = d.pages[0];
  assert.equal(couverture.section, 'Avis de valeur locative');
  assert.equal(couverture.loyer, calcul.valeur);
  assert.match(couverture.etat, /à louer/);
  const valeur = d.pages.find((p) => p.cle === 'valeur');
  assert.match(valeur.phrase[0], /se loue entre/);
  assert.equal(valeur.prix_acquereur, undefined);
  const conditions = d.pages.find((p) => p.cle === 'conditions');
  assert.match(conditions.lignes.find((l) => l.mot === 'Honoraires').texte, /preneur/);
  assert.ok(d.pages.find((p) => p.cle === 'sommaire').chapitres.some((c) => c.mot === 'Les loyers du secteur'));
  assert.equal(d.pages.find((p) => p.cle === 'usages').autorisees[0].texte, 'Tous commerces');
});

test('le mail et la restitution parlent de loyer', () => {
  const m = R.mailParDefaut({ avis: { location: true, bien: { rue: '1 rue X' }, chiffres: { valeur: 32000 } }, proprietaire: { nom: 'M. Martin' } });
  assert.match(m.objet, /^Avis de valeur locative/);
  assert.match(m.texte, /valeur locative/);
  assert.doesNotMatch(m.texte, /€|prix/);
  const sans = R.planDeRestitution('accord_fourchette', { location: true, chiffres: { valeur: 32000, bas: 29000, haut: 35500 } });
  assert.equal(sans.ok, false);
  assert.match(sans.error, /loyer/);
  const plan = R.planDeRestitution('accord_conseille', { location: true, chiffres: { valeur: 32000, bas: 29000, haut: 35500 } });
  assert.equal(plan.prix, 32000);
  assert.match(plan.mot, /loyer conseillé/);
  assert.match(R.carteRestitution({ id: 'x' }, plan).mot, /Loyer d'accord/);
  assert.match(R.nomDuPdf({ avis: { location: true, bien: { rue: '1 rue X' } } }), /^Avis de valeur locative/);
  // La vente ne change pas.
  assert.match(R.carteRestitution({ id: 'x' }, R.planDeRestitution('accord_conseille', { chiffres: { valeur: 400000 } })).mot, /Prix d'accord/);
});
