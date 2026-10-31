import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-teaser-'));
const T = await import('./teaser.js');

test('la classe d’actif se lit dans le type, l’occupation et la désignation', () => {
  assert.equal(T.classeDe({ type_bien: 'murs_commerce', occupe: true }), 'murs_loues');
  assert.equal(T.classeDe({ type_bien: 'murs_commerce', occupe: false }), 'murs_libres');
  assert.equal(T.classeDe({ type_bien: 'bureaux' }), 'bureaux');
  assert.equal(T.classeDe({ designation: 'Cession de droit au bail rue piétonne' }), 'droit_au_bail');
  assert.equal(T.classeDe({ designation: 'Fonds de commerce de boulangerie' }), 'fonds');
  assert.equal(T.classeDe({ type_bien: 'local_activite', designation: 'Entrepôt logistique' }), 'entrepot');
  assert.equal(T.tailleDeVille(300000), "d'une métropole");
  assert.equal(T.tailleDeVille(33000), "d'une ville moyenne");
});

test('murs loués : prix, loyer, rendement en pervenche ; ni adresse ni nom dans le titre', () => {
  const f = T.faitsDuBien({
    mandat: { prix: 300000, questionnaire: { bien_adresse: '12 rue Carnot, 71000 Mâcon', bien_occupe: true } },
    estimation: { questionnaire: { type_bien: 'murs_commerce', loyer_annuel_hc: 21600, surface_utile: 80, activite_locataire: 'Boulangerie-pâtisserie', bail_type: '3/6/9', date_effet: '01/01/2020', echeance: '31/12/2030' }, avis: { emplacement: { synthese: 'Emplacement de centre-ville' }, bien: { ville: '71000 Mâcon' } } },
  });
  const t = T.composer(f, 'murs_loues', { ville: "d'une ville moyenne (Bourgogne-Franche-Comté)", ref: 'KP-0001' });
  assert.deepEqual(t.tuiles.map((x) => x.valeur), ['300 000 €', '21 600 €', '7,2 %']);
  assert.equal(t.tuiles[2].etoile, true);
  assert.equal(t.filigrane, '7,2 %');
  assert.equal(t.titre, 'Murs commerciaux loués, centre-ville');
  assert.doesNotMatch(`${t.titre} ${t.sous_titre}`, /Carnot|Mâcon|Boulangerie/);
  assert.equal(t.sous_titre, "Centre-ville d'une ville moyenne (Bourgogne-Franche-Comté)");
  assert.deepEqual(t.lignes.map((l) => l.intitule), ['Surface', 'Locataire', 'Bail']);
  assert.ok(t.points.includes('Emplacement de centre-ville'));
  assert.ok(t.points.includes("Bail en cours jusqu'en 2030"));
});

test('fonds et droit au bail : pas de rendement, leur intitulé, leur confidentialité', () => {
  const f = T.faitsDuBien({ mandat: { prix: 150000 }, estimation: { questionnaire: { loyer_annuel_hc: 12000 } } });
  const fonds = T.composer(f, 'fonds');
  assert.equal(fonds.tableau_titre, 'Le fonds');
  assert.equal(fonds.filigrane, '3×');
  assert.match(fonds.confidentialite, /salariés/);
  assert.ok(!fonds.points.some((p) => /Rendement/.test(p)));
  const db = T.composer(f, 'droit_au_bail');
  assert.equal(db.tableau_titre, 'Le droit au bail');
  assert.equal(db.tuiles.find((x) => x.etoile).cle, 'loyer');
  assert.equal(T.composer(f, 'murs_libres').tuiles[2].cle, 'rendement_potentiel');
  assert.equal(T.composer({}, 'bureaux').tuiles[0].valeur, '[à compléter]');
});

test('L\'Assistant KPartners retouche le teaser : un champ, une tuile, un point fort ; une classe recompose', async () => {
  const { Records } = await import('./db.js');
  const user = { email: 'lucie@kpartners.fr', role: 'mandataire' };
  const d = Records.create('DossierMandataire', { mandataire_email: user.email, bien: 'Boutique', statut: 'go', documents: {} });
  const m = Records.create('MiseEnMarche', { mandataire_email: user.email, dossier_id: d.id, bien: 'Boutique', statut: 'preparation', livrables: {} });
  const r = await T.teaserDe(m.id, user);
  assert.equal(r.ok, true);
  assert.match(r.teaser.ref, /^KP-\d{4}$/);
  assert.equal((await T.executerOutilTeaser({ name: 'modifier_teaser', input: { titre: 'Boutique louée, hyper-centre', tuiles: [{ index: 0, valeur: '420 000 €' }], points: ['Rue piétonne'] } }, user, { marche_id: m.id })).ok, true);
  const t = Records.get('MiseEnMarche', m.id).teaser;
  assert.equal(t.titre, 'Boutique louée, hyper-centre');
  assert.equal(t.tuiles[0].valeur, '420 000 €');
  assert.equal(t.points[0], 'Rue piétonne');
  assert.equal(t.points.length, 3);
  await T.executerOutilTeaser({ name: 'modifier_teaser', input: { classe: 'fonds' } }, user, { marche_id: m.id });
  assert.equal(Records.get('MiseEnMarche', m.id).teaser.tableau_titre, 'Le fonds');
  assert.equal((await T.executerOutilTeaser({ name: 'modifier_teaser', input: { titre: 'x' } }, { email: 'autre@kpartners.fr', role: 'mandataire' }, { marche_id: m.id })).ok, false, 'pas le teaser d’un autre');
  assert.match(T.cadreDuTeaser(t), /\[0\] Prix FAI = 420 000 €/);
});
