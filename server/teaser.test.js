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
  assert.equal(t.filigrane, undefined);
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

test('local à louer : loyer demandé en tête, ni prix ni rendement, adresse cachée (6 nov. 2026)', () => {
  assert.equal(T.classeDe({ type_bien: 'murs_commerce', occupe: true, location: true }), 'a_louer');
  const f = T.faitsDuBien({
    fiche: { biens: { transaction: 'location', repris: { loyer_annuel: 24000 } } },
    mandat: { prix: 300000, questionnaire: { bien_adresse: '12 rue Carnot, 71000 Mâcon', bien_surface: 80 } },
    estimation: { questionnaire: { type_bien: 'murs_commerce' }, avis: { chiffres: { prix_affiche: 310000 }, emplacement: { synthese: 'Emplacement de centre-ville' }, bien: { ville: '71000 Mâcon' } } },
  });
  assert.equal(f.prix, null, 'une location n’a pas de prix');
  const t = T.composer(f, 'a_louer', { ville: "d'une ville moyenne", ref: 'KP-0009' });
  assert.deepEqual(t.tuiles.map((x) => x.valeur), ['24 000 €', '300 € / m²', '80 m²']);
  assert.equal(t.tuiles[0].etoile, true, 'le loyer demandé en pervenche');
  assert.doesNotMatch(JSON.stringify(t.tuiles), /Prix|Rendement/);
  assert.doesNotMatch(t.points.join(' '), /Rendement|Bail en cours|Prix au m²/);
  assert.equal(t.titre, 'Local commercial à louer, centre-ville');
  assert.doesNotMatch(`${t.titre} ${t.sous_titre}`, /Carnot|Mâcon/);
  assert.deepEqual(t.lignes.map((l) => l.intitule), ['Destination', 'Disponibilité', 'Conditions']);
  assert.match(t.lignes[2].detail, /15 % HT du loyer annuel HT HC \(3 600 € HT\), à la charge du preneur/);
  assert.match(t.lignes[2].detail, /Dépôt de garantie \[à compléter\]/);
  assert.match(t.confidentialite, /adresse du local/);
  assert.equal(T.CLASSES.a_louer.libelle, 'Local à louer');
});

test("un bien importé : le teaser lit sa fiche (prix honoraires inclus, loyer, surface) (6 nov. 2026)", async () => {
  const T = await import('./teaser.js');
  const f = T.faitsDuBien({ dossier: { prix: 560000 }, fiche: { ville: 'Montpellier', type_bien: 'murs_commerce', activite: 'Brasserie', mandat_importe: { prix: 560000, honoraires: '22 400 €' }, biens: { repris: { loyer_annuel: 39450, surface: 140 } } } });
  assert.equal(f.prix, 582400);
  assert.equal(f.loyer, 39450);
  assert.equal(f.surface, 140);
  assert.equal(f.occupe, true);
  assert.equal(f.ville, 'Montpellier');
  assert.equal(T.faiDuMandatImporte({ prix: 300000, honoraires: '5 % charge vendeur' }), 300000);
});
