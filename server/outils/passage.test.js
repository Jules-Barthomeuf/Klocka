import test from 'node:test';
import assert from 'node:assert/strict';
import { partDessous, signauxPassage, noteDuPassage, valeursDe, predire, modeleParDefaut, ajuster, ecarts, proposerReglage, ruesDeLaGamme, avisAutour, SIGNAUX, MINIMUM_REGLAGE } from './passage.js';

// Une commune de vingt rues : de 1 à 20 commerces ouverts, une enseigne nationale dans les cinq plus fortes.
const RANGS = { ouvertes: Array.from({ length: 20 }, (_, i) => i + 1), nationales: Array.from({ length: 20 }, (_, i) => (i >= 15 ? i - 14 : 0)) };
const rue = (ouvertes, nationales = 0) => ({ cellules: ouvertes + 3, ouvertes, enseignes_nationales: nationales, noms_enseignes: nationales ? ['Zara'] : [] });

test('une part sous la valeur, égalités pour moitié', () => {
  assert.equal(partDessous(5, [1, 2, 5, 9]), 0.625);
  assert.equal(partDessous(null, [1]), null);
  assert.equal(partDessous(3, []), null);
});

test('les commerces se jugent face aux rues de la ville, pas en absolu', () => {
  const forte = signauxPassage({ rue: rue(20, 5), rangs: RANGS, ville: 'Antibes' });
  const moyenne = signauxPassage({ rue: rue(10), rangs: RANGS, ville: 'Antibes' });
  assert.ok(forte.commerces.valeur > 0.9);
  assert.ok(moyenne.commerces.valeur < 0.5);
  assert.match(moyenne.commerces.texte, /plus que \d+ % des rues de Antibes/);
  assert.equal(moyenne.enseignes.valeur, 0, 'sans enseigne nationale, rien');
  // En retrait du cœur commerçant de la rue, le local compte moins.
  const retrait = signauxPassage({ rue: rue(20, 5), rangs: RANGS, position: { place: { rang: 3, rang_sur: 3, mot: 'en retrait du cœur commerçant' } } });
  assert.ok(retrait.commerces.valeur < forte.commerces.valeur);
});

test('la demande et le loyer : avis Google face à la rue de tête, loyer de la rue face au kilomètre autour', () => {
  const s = signauxPassage({ avis: { somme: 2500 }, reference: { somme: 10000, rue: 'RUE DE LA REPUBLIQUE' }, loyer: { rue: 600, ville: 400 }, ville: 'Lyon' });
  assert.equal(s.avis.valeur, 0.5, 'racine du rapport : un quart des avis de la rue de tête vaut 0,5');
  assert.match(s.avis.texte.replace(/[\u00a0\u202f]/g, " "), /2 500 avis Google .* 25 % de ceux de la rue de la republique/);
  assert.equal(s.loyer.valeur, 1, 'une rue 50 % plus chère que son kilomètre est au plus haut');
  assert.match(s.loyer.texte, /\+50 %/);
  assert.equal(signauxPassage({ loyer: { rue: 280, ville: 400 } }).loyer.valeur, 0);
});

test('pas de note sous trois critères lus, ni sans les commerces', () => {
  const deux = noteDuPassage(signauxPassage({ transports: { genres: ['métro'], lourd: true }, voie: 'rue piétonne' }));
  assert.equal(deux.lus, 2);
  assert.equal(deux.note, null);
  assert.match(deux.raison, /Pas assez lu pour noter : 2 critères sur 7/);
  const sansCommerces = noteDuPassage(signauxPassage({ transports: { genres: ['métro'], lourd: true }, voie: 'rue piétonne', vues: { impression_passage: 8 } }));
  assert.equal(sansCommerces.note, null);
  assert.match(sansCommerces.raison, /sans les commerces de la rue/);
});

test('la note : la moyenne de ce qui est lu, la forte rue passe devant la faible', () => {
  const tout = { avis: { somme: 9000 }, reference: { somme: 10000 }, transports: { genres: ['métro', 'bus'], lourd: true }, voie: 'rue piétonne', vues: { impression_passage: 9 } };
  const forte = noteDuPassage(signauxPassage({ rue: rue(20, 5), rangs: RANGS, ...tout }));
  const faible = noteDuPassage(signauxPassage({ rue: rue(2), rangs: RANGS, avis: { somme: 300 }, reference: { somme: 10000 }, transports: { genres: [], lourd: false }, voie: 'rue résidentielle', vues: { impression_passage: 2 } }));
  assert.equal(forte.statut, 'ok');
  assert.ok(forte.note >= 8.5, `forte ${forte.note}`);
  assert.equal(faible.statut, 'alerte');
  assert.ok(faible.note <= 3, `faible ${faible.note}`);
  assert.deepEqual(forte.manque, ['loyer']);
  assert.equal(forte.signaux.length, SIGNAUX.length);
});

// 13 nov. 2026, Jules : « fais le max sans Google ; plus il y a de commerces et peu de vacance, plus il y a de passage ;
// les enseignes nationales garantissent un passage plus important ».
test('sans Google : commerces, locaux vides et enseignes suffisent, un critère absent ne tire plus vers 5', () => {
  const R = { ...RANGS, vacances: [0, 5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 33, 35, 40, 45, 50, 55, 60, 70] };
  const tete = noteDuPassage(signauxPassage({ rue: { cellules: 21, ouvertes: 20, vides: 1, vacance_registre_pct: 5, enseignes_nationales: 5, noms_enseignes: ['Zara'] }, rangs: R }));
  const morte = noteDuPassage(signauxPassage({ rue: { cellules: 9, ouvertes: 4, vides: 5, vacance_registre_pct: 56, enseignes_nationales: 0 }, rangs: R }));
  assert.equal(tete.lus, 3, 'le registre seul : commerces, locaux vides, enseignes');
  assert.ok(tete.note >= 8.5, `rue de tête sans Google : ${tete.note}`);
  assert.ok(morte.note <= 2, `rue vide sans Google : ${morte.note}`);
  assert.deepEqual(tete.manque, ['avis', 'loyer', 'transports', 'voie']);
  // Mêmes commerces, plus de locaux vides : moins de passage.
  const videe = noteDuPassage(signauxPassage({ rue: { cellules: 30, ouvertes: 20, vides: 10, vacance_registre_pct: 33, enseignes_nationales: 5 }, rangs: R }));
  assert.ok(videe.note < tete.note);
  // Mêmes commerces, sans enseigne nationale : moins de passage.
  const sansEnseigne = noteDuPassage(signauxPassage({ rue: { cellules: 21, ouvertes: 20, vides: 1, vacance_registre_pct: 5, enseignes_nationales: 0 }, rangs: R }));
  assert.ok(sansEnseigne.note < tete.note);
  assert.match(signauxPassage({ rue: { cellules: 9, ouvertes: 4, vides: 5, vacance_registre_pct: 56 }, rangs: R }).vacance.texte, /56 % de locaux vides dans la rue \(5 locaux sans commerce ouvert/);
});

test('les poids de départ font une moyenne pondérée sur 10', () => {
  const m = modeleParDefaut();
  const somme = Object.values(m.coefs).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(somme - 10) < 0.01);
  assert.ok(Math.abs(predire(m, Object.fromEntries(SIGNAUX.map(({ cle }) => [cle, 1]))) - 10) < 0.01);
  assert.ok(Math.abs(predire(m, {}) - 5) < 0.01, 'rien de lu : le milieu');
  assert.equal(m.moyennePonderee, true);
});

test('le réglage apprend des notes de l\'équipe, et se mesure sur des notes mises de côté', () => {
  const depart = modeleParDefaut();
  // Une équipe qui ne regarde que les avis : sa note est dix fois la valeur des avis.
  const jugements = Array.from({ length: 16 }, (_, i) => {
    const valeurs = { commerces: (i % 4) / 3, avis: i / 15, enseignes: ((i * 7) % 5) / 4, loyer: null, transports: (i % 3) / 2, voie: 0.3, vues: ((i * 3) % 7) / 6 };
    return { valeurs, note: Math.round(10 * valeurs.avis * 2) / 2 };
  });
  const avant = ecarts(depart, jugements);
  const r = proposerReglage(jugements, depart);
  assert.equal(r.pret, true);
  assert.ok(r.propose.coefs.avis > depart.coefs.avis, 'le poids des avis monte');
  assert.ok(r.propose.coefs.commerces < depart.coefs.commerces, 'celui des commerces baisse');
  assert.ok(Object.values(r.propose.coefs).every((c) => c >= 0), 'aucun poids négatif');
  assert.ok(r.ecart_propose < avant.ecart_moyen, `mesuré à part, l'écart baisse (${avant.ecart_moyen} → ${r.ecart_propose})`);
  assert.equal(proposerReglage(jugements.slice(0, MINIMUM_REGLAGE - 1), depart).pret, false);
  // Le rappel vers les poids en service : avec très peu de notes, on ne s'éloigne guère.
  const prudent = ajuster(jugements.slice(0, 3), depart, { lambda: 50 });
  assert.ok(Math.abs(prudent.coefs.commerces - depart.coefs.commerces) < 0.5);
});

test('les valeurs d\'un jugement sont les critères figés, null quand non lus', () => {
  const v = valeursDe(signauxPassage({ rue: rue(10), rangs: RANGS }));
  assert.equal(v.avis, null);
  assert.ok(v.commerces > 0);
});

test('des rues de toute la gamme, avec un commerce ouvert, sans doublon', () => {
  const rues = Array.from({ length: 12 }, (_, i) => ({ voie: `RUE ${i}`, ouvertes: i, exemple: `${i + 1} RUE ${i} 06600 ANTIBES` }));
  const g = ruesDeLaGamme({ rues });
  assert.equal(g.length, 4);
  assert.equal(g[0].ouvertes, 11, 'la plus commerçante en tête');
  assert.ok(g[3].ouvertes <= 3, 'et une rue du bas');
  assert.equal(new Set(g.map((r) => r.voie)).size, 4);
  assert.deepEqual(ruesDeLaGamme({ rues: rues.slice(0, 3) }), []);
});

test('les avis autour : la somme des vingt lieux les plus suivis, et une clé suspendue dite en clair', async () => {
  const lire = async () => ({ ok: true, json: async () => ({ places: [{ displayName: { text: 'A' }, userRatingCount: 1200 }, { displayName: { text: 'B' }, userRatingCount: 300, businessStatus: 'CLOSED_PERMANENTLY' }, { displayName: { text: 'C' }, userRatingCount: 50 }] }) });
  const a = await avisAutour({ lat: 45.76, lon: 4.83 }, { cle: 'x', lire });
  assert.equal(a.somme, 1250, 'un lieu fermé ne compte pas');
  assert.equal(a.top[0].nom, 'A');
  const suspendu = async () => ({ ok: false, status: 403, json: async () => ({ error: { details: [{ reason: 'CONSUMER_SUSPENDED' }] } }) });
  const b = await avisAutour({ lat: 45.76, lon: 4.83 }, { cle: 'x', lire: suspendu });
  assert.equal(b.ok, false);
  assert.match(b.error, /suspendu/);
  assert.equal((await avisAutour({ lat: 1, lon: 1 }, { cle: '' })).ok, false);
});

test('ville par ville : les poids appris sans la ville, essayés sur elle', () => {
  const depart = modeleParDefaut();
  const villes = ['Antibes', 'Nice', 'Cannes'];
  const jugements = Array.from({ length: 18 }, (_, i) => {
    const valeurs = { commerces: (i % 4) / 3, avis: i / 17, enseignes: 0.5, loyer: null, transports: (i % 3) / 2, voie: 0.3, vues: ((i * 3) % 7) / 6 };
    return { valeurs, note: Math.round(10 * valeurs.avis * 2) / 2, ville: villes[i % 3] };
  });
  const r = proposerReglage(jugements, depart);
  assert.equal(r.par_ville.length, 3);
  for (const v of r.par_ville) assert.ok(v.ecart_appris_ailleurs < v.ecart_actuel, `${v.ville} : ${v.ecart_actuel} → ${v.ecart_appris_ailleurs}`);
  assert.deepEqual(proposerReglage(jugements.map((j) => ({ ...j, ville: 'Antibes' })), depart).par_ville, [], 'une seule ville : pas de mesure ville par ville');
});

// 13 nov. 2026, Jules : « loyer de la rue non lu, type de voie non lu : je suis sûr que tu peux le lire ».
test('le loyer de la rue arrivé après elle refait la note ; le type de voie se lit dans le nom quand OpenStreetMap se tait', async () => {
  const { passageAvecLoyer } = await import('./passage.js');
  const { typeDuNom } = await import('./rue.js');
  const R = { ...RANGS };
  const avant = noteDuPassage(signauxPassage({ rue: { cellules: 12, ouvertes: 10, vides: 2, vacance_registre_pct: 17, enseignes_nationales: 1 }, rangs: R }));
  assert.ok(avant.manque.includes('loyer'));
  const apres = passageAvecLoyer(avant, { rue: 600, ville: 400 });
  assert.ok(!apres.manque.includes('loyer'));
  assert.ok(apres.note > avant.note, `${avant.note} → ${apres.note}`);
  assert.equal(apres.lus, avant.lus + 1);
  assert.equal(passageAvecLoyer(avant, null), avant);
  assert.equal(typeDuNom('Avenue Jean Médecin').type, "avenue (d'après son nom)");
  assert.equal(typeDuNom('Bd Haussmann').type, "boulevard (d'après son nom)");
  assert.equal(typeDuNom('Rue Esquermoise').type, "rue (d'après son nom)");
  assert.equal(typeDuNom('Les Halles'), null);
  assert.equal(signauxPassage({ voie: "place (d'après son nom)" }).voie.valeur, 0.6);
  assert.equal(signauxPassage({ voie: "impasse (d'après son nom)" }).voie.valeur, 0.3);
});

// 13 nov. 2026, Jules : « le KFC de la rue de la République à Lyon, je mets 10, ou entre 9,5 et le maximum » ; « enlève
// la ligne Photo de la rue ».
test('la rue de la République à Lyon, rue de tête : 9,5 au moins, sans photo de la rue', () => {
  const lyon = { ouvertes: Array.from({ length: 50 }, (_, i) => i + 1), densites: Array.from({ length: 50 }, (_, i) => i / 5 + 1), nationales: Array.from({ length: 50 }, (_, i) => (i >= 45 ? i - 40 : 0)) };
  lyon.ouvertes[49] = 68; lyon.nationales[49] = 32;
  const p = noteDuPassage(signauxPassage({
    rue: { cellules: 75, ouvertes: 68, vides: 7, vacance_registre_pct: 16, enseignes_nationales: 32, noms_enseignes: ['Nike'] },
    position: { troncon: { occupes: 3, longueur_m: 270 } }, rangs: lyon,
    loyer: { rue: 304, ville: 270 }, voie: 'rue piétonne', vues: { impression_passage: 6 },
  }));
  assert.ok(p.note >= 9.5, `République : ${p.note}`);
  assert.ok(!SIGNAUX.some((x) => x.cle === 'vues'), 'plus de critère photo');
  assert.ok(!p.signaux.some((x) => x.cle === 'vues'));
  assert.equal(signauxPassage({ loyer: { rue: 400, ville: 400 } }).loyer.valeur, 0.5, 'au prix des alentours : 5 sur 10');
});
