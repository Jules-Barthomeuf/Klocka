// K-Estimation : la grille de taux, les comparables, les trois méthodes et
// la matrice d'ajustements.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kestimation-'));
const {
  bandeDeTaux, positionDansLaBande, comparablesDvf, surfacePonderee, calculerEstimation, lancerEstimation,
  CHOIX, ETAPES, ETAPES_AFFINAGE, GRILLE_TAUX, COEFFICIENTS, MINIMUM_VENTES, POIDS_RESERVE, TAUX_MIN, TAUX_MAX,
} = await import('./kestimation.js');

const AUJOURDHUI = new Date('2026-09-19T00:00:00Z');
const INSEE_AISE = { revenus: { niveau_de_vie_moyen: 30000, taux_pauvrete: 8 }, population: { densite_km2: 12000 } };
const INSEE_PAUVRE = { revenus: { niveau_de_vie_moyen: 15000, taux_pauvrete: 28 }, population: { densite_km2: 900 } };
const VLM_DATAB = { source: 'Data-B · Valeurs locatives', rue: { nom: 'Rue Dabray', basse: 300, haute: 400 }, quartier: { nom: 'Libération', basse: 250, haute: 350 } };
const vente = (date, prix, surface, distance_m = 100) => ({ date, prix, surface, prix_m2: Math.round(prix / surface), adresse: 'x', distance_m });

test("la grille de taux suit l'emplacement, le locataire et la ville", () => {
  assert.deepEqual(bandeDeTaux({ ville: 'grande', emplacement: 'n1', locataire: 'enseigne' }).bande, [4.5, 5.5]);
  assert.deepEqual(bandeDeTaux({ ville: 'grande', emplacement: 'n1bis', locataire: 'independant_solide' }).bande, [6.5, 8]);
  assert.deepEqual(bandeDeTaux({ ville: 'grande', emplacement: 'n2' }).bande, [6.5, 8]);
  // Une ville moyenne prime sur tout : le meilleur emplacement y rend plus.
  assert.deepEqual(bandeDeTaux({ ville: 'moyenne', emplacement: 'n1', locataire: 'enseigne' }).bande, [8.5, 11]);
  // Le cas que la pratique ne nomme pas est interpolé, et dit comme tel.
  const interp = bandeDeTaux({ ville: 'grande', emplacement: 'n1', locataire: 'independant_solide' });
  assert.equal(interp.interpolee, true);
  assert.ok(interp.bande[0] >= 5.5 && interp.bande[1] <= 6.5);
  assert.equal(GRILLE_TAUX.length, 4);
});

test('le quartier place le taux dans sa bande : bas quand il est commerçant et aisé', () => {
  const bon = positionDansLaBande({ commerces: 80, insee: INSEE_AISE });
  const mauvais = positionDansLaBande({ commerces: 2, insee: INSEE_PAUVRE });
  assert.ok(bon.position < 0.5 && mauvais.position > 0.5);
  assert.ok(bon.raisons.some((r) => /très commerçant/.test(r.libelle)));
  // Sans aucune donnée, on reste au milieu de la bande : rien d'inventé.
  assert.equal(positionDansLaBande({ commerces: 10, insee: null }).position, 0.5);
  // Un relevé qui a échoué n'est pas un désert : la densité ne pèse pas.
  const panne = positionDansLaBande({ commerces: null, insee: INSEE_AISE });
  assert.ok(!panne.raisons.some((r) => /commerces/.test(r.libelle)));
  assert.ok(positionDansLaBande({ commerces: 0, insee: INSEE_AISE }).position > panne.position, 'zéro commerce compté pèse, un relevé absent non');
  assert.ok(positionDansLaBande({ commerces: 0, insee: INSEE_PAUVRE }).position <= 1);
});

test('les comparables DVF gardent 36 mois, pondèrent par la surface, et rendent leurs quartiles', () => {
  const c = comparablesDvf([
    vente('2025-03-01', 300000, 100), // 3 000 / m²
    vente('2024-06-15', 100000, 50), // 2 000 / m²
    vente('2026-01-10', 500000, 100), // 5 000 / m²
    vente('2021-01-01', 900000, 100), // trop vieux : écarté
    { date: '2025-01-01', prix: 0, surface: 50 }, // sans prix : écarté
  ], { aujourdhui: AUJOURDHUI });
  assert.equal(c.n, 3);
  // Somme des prix sur somme des surfaces : 900 000 / 250, et non la moyenne des prix au m².
  assert.equal(c.prix_m2_pondere, 3600);
  assert.equal(c.bas, 2000);
  assert.equal(c.haut, 5000);
  assert.equal(c.depuis, '2023-09-19');
  assert.equal(comparablesDvf([], { aujourdhui: AUJOURDHUI }).n, 0);
});

test('la surface pondérée compte la vente à plein et la réserve à part', () => {
  const s = surfacePonderee({ surface_m2: 100, surface_vente_m2: 70, surface_reserve_m2: 30 });
  assert.equal(s.totale, 100);
  assert.equal(s.ponderee, 70 + 30 * POIDS_RESERVE);
  // Sans le détail, la surface totale sert telle quelle, et on le dit.
  assert.equal(surfacePonderee({ surface_m2: 80 }).ponderee, 80);
  assert.match(surfacePonderee({ surface_m2: 80 }).detail, /sans distinction/);
  assert.equal(surfacePonderee({}).ponderee, null);
});

test('un local loué croise ses trois méthodes, et le loyer réel pèse le plus', () => {
  const marche = { commerces: 40, insee: INSEE_AISE, vlm_datab: VLM_DATAB, dvf: comparablesDvf([vente('2025-01-01', 300000, 100), vente('2025-06-01', 280000, 80), vente('2026-02-01', 350000, 100)], { aujourdhui: AUJOURDHUI }) };
  const r = calculerEstimation({
    marche, aujourdhui: AUJOURDHUI,
    reponses: { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, surface_vente_m2: 80, surface_reserve_m2: 20, ville: 'grande', emplacement: 'n1bis', locataire: 'independant_solide' },
  });
  assert.equal(r.ok, true);
  assert.ok(r.methodes.capitalisation && r.methodes.vlm && r.methodes.dvf, 'les trois méthodes sont là');
  assert.deepEqual(r.poids, { capitalisation: 0.5, vlm: 0.25, dvf: 0.25 });
  // La capitalisation suit bien la division, aux mille euros près.
  const m = r.methodes.capitalisation;
  assert.equal(m.moyenne, Math.round(30000 / (m.taux / 100) / 1000) * 1000);
  assert.ok(m.basse < m.moyenne && m.moyenne < m.haute);
  // Le taux est dans sa bande, et la bande est celle de la grille.
  assert.equal(r.taux.bande.cle, 'n1bis_n2');
  assert.ok(r.taux.retenu >= TAUX_MIN && r.taux.retenu <= TAUX_MAX);
  // La VLM vient de la rue Data-B, et le loyer facial lui est comparé.
  assert.match(r.vlm.detail, /la rue/);
  assert.equal(r.vlm.loyer.moyen, Math.round(350 * 88));
  assert.equal(typeof r.vlm.ecart_facial_pct, 'number');
  // Les comparables valent prix pondéré fois surface totale.
  assert.equal(r.methodes.dvf.moyenne, Math.round((r.methodes.dvf.prix_m2_pondere * 100) / 1000) * 1000);

  // Le pondéré peut passer sous le premier quartile quand de grandes cellules
  // bon marché pèsent lourd : la fourchette s'élargit, elle ne se renverse pas.
  const lourdes = { ...marche, dvf: comparablesDvf([vente('2025-01-01', 400000, 400), vente('2025-03-01', 150000, 50), vente('2025-05-01', 160000, 50), vente('2025-07-01', 170000, 50)], { aujourdhui: AUJOURDHUI }) };
  const d = calculerEstimation({ marche: lourdes, aujourdhui: AUJOURDHUI, reponses: { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, ville: 'grande', emplacement: 'n2' } }).methodes.dvf;
  assert.ok(d.prix_m2_pondere < lourdes.dvf.bas, 'le cas se présente bien : pondéré sous le quartile');
  assert.ok(d.basse <= d.moyenne && d.moyenne <= d.haute, `${d.basse} / ${d.moyenne} / ${d.haute}`);
  // La fourchette retenue est ordonnée et se situe entre les méthodes.
  assert.ok(r.valeurs.basse < r.valeurs.moyenne && r.valeurs.moyenne < r.valeurs.haute);
  const moyennes = Object.values(r.methodes).map((x) => x.moyenne);
  assert.ok(r.valeurs.moyenne >= Math.min(...moyennes) && r.valeurs.moyenne <= Math.max(...moyennes));
  assert.equal(r.prix_m2, Math.round(r.valeurs.moyenne / 100));
});

test('Equimmox prime sur Data-B pour la valeur locative, et Data-B reste visible à côté', () => {
  const marche = { commerces: 40, insee: INSEE_AISE, vlm_datab: VLM_DATAB, vlm_equimmox: { source: 'Equimmox · Analyse de loyer', bas: 137, moyenne: 164, haut: 186, rayon: '500m', surface_min: 70, surface_max: 130 } };
  const r = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, ville: 'grande', emplacement: 'n2' } });
  assert.match(r.vlm.source, /Equimmox/);
  assert.equal(r.vlm.moyen, 164);
  // La lecture de la rue ne disparaît pas : elle est là, nommée, avec sa fourchette.
  assert.equal(r.vlm.alternatives.length, 1);
  assert.match(r.vlm.alternatives[0].source, /Data-B/);
  assert.equal(r.vlm.alternatives[0].bas, 300);
  assert.deepEqual(r.methodes.vlm.alternatives, r.vlm.alternatives);
  // Sans Equimmox, Data-B seul, sans alternative.
  const seul = calculerEstimation({ marche: { ...marche, vlm_equimmox: null }, aujourdhui: AUJOURDHUI, reponses: { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, ville: 'grande', emplacement: 'n2' } });
  assert.match(seul.vlm.source, /Data-B/);
  assert.equal(seul.vlm.alternatives.length, 0);
});

test('un local vacant se calcule sur la valeur locative de marché, avec le risque de vacance', () => {
  const marche = { commerces: 40, insee: INSEE_AISE, vlm_datab: VLM_DATAB };
  const vacant = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { statut: 'vacant', surface_m2: 100, ville: 'grande', emplacement: 'n2' } });
  assert.equal(vacant.ok, true);
  assert.equal(vacant.methodes.capitalisation, undefined, 'pas de loyer réel, pas de capitalisation du loyer réel');
  assert.ok(vacant.methodes.vlm);
  assert.equal(vacant.methodes.vlm.taux, vacant.taux.vacant);
  assert.ok(vacant.taux.vacant > vacant.taux.retenu, 'le vide est un risque : un point de plus');
  assert.deepEqual(vacant.poids, { vlm: 1 }, 'sans ventes comparables, la VLM porte tout');
  // Sans surface, un vacant ne se calcule pas ; sans loyer, un loué non plus.
  assert.match(calculerEstimation({ marche, reponses: { statut: 'vacant' } }).error, /surface/);
  assert.match(calculerEstimation({ marche, reponses: { statut: 'loue' } }).error, /loyer annuel/);
  // Sans aucune source, on refuse plutôt que d'inventer.
  assert.match(calculerEstimation({ marche: {}, reponses: { statut: 'vacant', surface_m2: 100 } }).error, /Aucune méthode/);
});

test("la matrice d'ajustements : triple net, enseigne, extraction, fin de bail, surloyer", () => {
  const marche = { commerces: 40, insee: INSEE_AISE, vlm_datab: VLM_DATAB };
  const base = { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, ville: 'grande', emplacement: 'n1bis', locataire: 'independant_solide' };
  const nu = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: base });

  // Bail triple net : +7,5 % sur la valeur, et la ligne le dit.
  const triple = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, taxe_fonciere: 'locataire', travaux_606: 'locataire' } });
  assert.ok(triple.coefficients.some((c) => /triple net/.test(c.libelle) && c.pct === COEFFICIENTS.triple_net));
  assert.ok(triple.methodes.capitalisation.moyenne > nu.methodes.capitalisation.moyenne);
  const partiel = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, taxe_fonciere: 'locataire' } });
  assert.ok(partiel.coefficients.some((c) => c.pct === COEFFICIENTS.net_partiel));

  // Enseigne nationale hors bande n°1 : un point de moins sur le taux.
  const enseigne = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, locataire: 'enseigne' } });
  assert.ok(enseigne.taux.facteurs.some((f) => /Enseigne nationale/.test(f.libelle) && f.points === -1));
  assert.ok(enseigne.taux.retenu < nu.taux.retenu);
  // Sur un emplacement n°1, la bande la porte déjà : pas de double remise.
  const n1 = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, emplacement: 'n1', locataire: 'enseigne' } });
  assert.equal(n1.taux.bande.cle, 'n1_enseigne');
  assert.ok(!n1.taux.facteurs.some((f) => /Enseigne nationale/.test(f.libelle)));

  // Restaurant sans extraction : la VLM baisse, pas le loyer réel.
  const resto = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, activite: 'Restaurant', reponses: { ...base, extraction: 'non' } });
  assert.ok(resto.methodes.vlm.facteurs.some((f) => f.pct === COEFFICIENTS.sans_extraction_restauration));
  assert.ok(resto.methodes.vlm.moyenne < nu.methodes.vlm.moyenne);
  const coiffeur = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, activite: 'Coiffure', reponses: { ...base, extraction: 'non' } });
  assert.equal(coiffeur.methodes.vlm.facteurs.length, 0, "l'extraction ne compte que pour la restauration");

  // Fin de bail dans un an sans accord : décote de risque de vacance.
  const fin = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, fin_bail: '2027-06-30', renouvellement: 'sans_accord' } });
  assert.ok(fin.coefficients.some((c) => /Fin de bail/.test(c.libelle) && c.pct === COEFFICIENTS.fin_de_bail));
  const accord = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, fin_bail: '2027-06-30', renouvellement: 'accord' } });
  assert.ok(!accord.coefficients.some((c) => /Fin de bail/.test(c.libelle)), 'un accord trouvé lève le risque');
  const loin = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, fin_bail: '2032-06-30', renouvellement: 'sans_accord' } });
  assert.ok(!loin.coefficients.some((c) => /Fin de bail/.test(c.libelle)), 'un bail qui court encore six ans ne fait pas peur');

  // Un loyer facial très au-dessus du marché : le renouvellement le rattrapera.
  const surloyer = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { ...base, loyer_annuel: 60000 } });
  assert.ok(surloyer.vlm.ecart_facial_pct > 20);
  assert.ok(surloyer.coefficients.some((c) => /au-dessus du marché/.test(c.libelle)));
  assert.ok(!nu.coefficients.some((c) => /au-dessus du marché/.test(c.libelle)));
});

test('la méthode DVF s\'abstient sous trois ventes, et les bornes du taux tiennent', () => {
  const marche = { commerces: 40, insee: INSEE_AISE, vlm_datab: VLM_DATAB, dvf: comparablesDvf([vente('2025-01-01', 300000, 100), vente('2025-06-01', 280000, 80)], { aujourdhui: AUJOURDHUI }) };
  const r = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { statut: 'loue', loyer_annuel: 30000, surface_m2: 100, ville: 'grande', emplacement: 'n2' } });
  assert.equal(r.methodes.dvf, undefined, `deux ventes, c'est moins que ${MINIMUM_VENTES}`);
  assert.deepEqual(Object.keys(r.poids).sort(), ['capitalisation', 'vlm']);

  const pire = calculerEstimation({ marche, aujourdhui: AUJOURDHUI, reponses: { statut: 'loue', loyer_annuel: 10000, ville: 'moyenne', emplacement: 'n2', locataire: 'independant', retards: 'oui', etat_batiment: 'gros_oeuvre', etat_local: 'brut' } });
  assert.equal(pire.taux.retenu, TAUX_MAX, 'les ajustements ne débordent pas des bornes');
});

test('les étapes, les choix du formulaire, et une adresse vague refusée', () => {
  assert.equal(ETAPES.length, 5);
  assert.equal(ETAPES[1].cle, 'dvf');
  assert.equal(ETAPES_AFFINAGE[0].cle, 'equimmox');
  assert.deepEqual(CHOIX.statut.options.map((o) => o.valeur), ['loue', 'vacant']);
  assert.deepEqual(CHOIX.emplacement.options.map((o) => o.valeur), ['n1', 'n1bis', 'n2']);
  assert.deepEqual(CHOIX.ville.options.map((o) => o.valeur), ['grande', 'moyenne']);
  assert.ok(CHOIX.locataire.options.length === 3);
  assert.match(lancerEstimation({ adresse: 'Nice' }).error, /adresse précise/);
});
