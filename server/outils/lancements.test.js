import test from 'node:test';
import assert from 'node:assert/strict';
import { Records } from '../db.js';
import { jugerEffort, jugerLoyer, statutVerdictPrix, statutDesPoints, conclusionDe, empreinte, entreesChangees, aRelancer, entreesDe, lancerOutil, reconnaitreLocataire, pointVacance, lireProcedures, consigneNote, deuxPhrases, sirenDuTexte, candidatsLocataire, codeCommuneDe, communeLisible, pointComptes, pointAvis, dernierLancement, rattacher, OUTILS, ENTITE, lireResumeAvis, avecResumeWeb } from './lancements.js';

test('le poids du loyer dans le chiffre d\'affaires : 10 % confortable, 15 % tendu', () => {
  assert.deepEqual(jugerEffort(30000, 400000), { taux: 7.5, statut: 'ok' });
  assert.equal(jugerEffort(50000, 400000).statut, 'a_voir');
  assert.equal(jugerEffort(80000, 400000).statut, 'alerte');
  assert.equal(jugerEffort(null, 400000), null);
});

test('un loyer au-dessus du marché alerte, en dessous il laisse de la marge', () => {
  assert.equal(jugerLoyer(300, 250).statut, 'alerte');
  assert.match(jugerLoyer(200, 250).mot, /marge à la hausse/);
  assert.equal(jugerLoyer(255, 250).mot, 'dans le marché');
  assert.equal(jugerLoyer(null, 250), null);
});

test('un prix surévalué alerte, légèrement surévalué est à voir', () => {
  assert.equal(statutVerdictPrix('haut', 'surévalué'), 'alerte');
  assert.equal(statutVerdictPrix('haut', 'légèrement surévalué'), 'a_voir');
  assert.equal(statutVerdictPrix('juste', 'dans le marché'), 'ok');
  assert.equal(statutVerdictPrix(null), 'vide');
});

test('le statut d\'un outil est le pire de ses points lus, et sa conclusion tient en une phrase', () => {
  const pts = [{ statut: 'ok', resultat: 'a' }, { statut: 'a_voir', resultat: 'Rendement 6 %' }, { statut: 'vide', resultat: 'rien' }];
  assert.equal(statutDesPoints(pts), 'a_voir');
  assert.deepEqual(conclusionDe('prix', pts), { statut: 'a_voir', conclusion: 'Rendement 6 %' });
  assert.deepEqual(conclusionDe('locataire', [{ statut: 'ok', resultat: 'x' }], 'DEVRED · 3 bilans'), { statut: 'ok', conclusion: 'Solide · DEVRED · 3 bilans' });
  assert.equal(conclusionDe('ville', [{ statut: 'vide', resultat: 'Commune introuvable.' }]).statut, 'vide');
});

test('cinq outils, chacun avec les entrées dont il dépend', () => {
  assert.deepEqual(OUTILS.map((o) => o.cle), ['locataire', 'loyer', 'prix', 'emplacement', 'ville']);
  const e = { adresse: '1 rue A, Lyon', loyer: 20000, surface: 80, prix: 300000, locataire: 'X', ville: 'Lyon' };
  assert.equal(empreinte('emplacement', e), empreinte('emplacement', { ...e, loyer: 99999 }));
  assert.notEqual(empreinte('loyer', e), empreinte('loyer', { ...e, loyer: 99999 }));
  assert.deepEqual(entreesChangees('prix', e, { ...e, loyer: 22000, prix: 310000 }), ['le prix', 'le loyer']);
});

test('à relancer : une entrée du dossier a changé, ou le bail ne donne pas le loyer de la fiche (Loyer et Prix seulement)', () => {
  const l = { outil: 'loyer', statut: 'fini', entrees: { adresse: '1 rue A', loyer: 20000, surface: 80 } };
  assert.equal(aRelancer(l, { adresse: '1 rue A', loyer: 20000, surface: 80 }), null);
  assert.match(aRelancer(l, { adresse: '1 rue A', loyer: 24000, surface: 80 }), /le loyer a changé/);
  assert.match(aRelancer(l, { adresse: '1 rue A', loyer: 20000, surface: 80 }, { ecartLoyer: 'les pièces ne donnent pas le même loyer' }), /pièces/);
  const ville = { outil: 'ville', statut: 'fini', entrees: { ville: 'Lyon' } };
  assert.equal(aRelancer(ville, { ville: 'Lyon', loyer: 1 }, { ecartLoyer: 'écart' }), null);
  assert.equal(aRelancer({ ...l, statut: 'en_cours' }, {}), null);
});

test('les entrées viennent du lot, sans rien deviner', () => {
  const deal = { lots: [{ lot: { adresse: { valeur: { rue: '12 rue de la République', code_postal: '69002', ville: 'Lyon' }, absent: false }, locataire_nom: { valeur: 'Café Pinson', absent: false }, occupe: { valeur: false, absent: false }, loyer_annuel_ht_hc: { valeur: 10000, absent: false } } }] };
  const e = entreesDe(deal, 0, { adresseDuLot: (x) => `${x.lot.adresse.valeur.rue}, ${x.lot.adresse.valeur.ville}`, prixFaiDuLot: () => null });
  assert.equal(e.ville, 'Lyon');
  assert.equal(e.locataire, 'Café Pinson');
  assert.equal(e.loyer, null);
});

test('chaque lancement est gardé : relancer en crée un nouveau, le dossier montre le dernier, un lancement libre se rattache', async (t) => {
  const dealId = `d-outils-${Date.now()}`;
  const dossier = Records.create('Deal', { deal_id: dealId, lots: [] });
  // Le test écrit dans la base : il efface ce qu'il a créé (13 nov. 2026, Jules : 61 dossiers « d-outils » restés).
  t.after(() => {
    for (const x of Records.list(ENTITE)) if (x.deal_id === dealId || [a?.id, b?.id, libre?.id].includes(x.id)) Records.delete(ENTITE, x.id);
    Records.delete('Deal', dossier.id);
  });
  let a = null, b = null, libre = null;
  const moteur = async () => ({ points: [{ cle: 'x', libelle: 'X', statut: 'ok', resultat: 'bien' }] });
  a = lancerOutil('loyer', { adresse: '1 rue A', loyer: 1, surface: 1 }, { dealId, moteur }).lancement;
  await new Promise((ok) => setTimeout(ok, 20));
  b = lancerOutil('loyer', { adresse: '1 rue A', loyer: 2, surface: 1 }, { dealId, moteur }).lancement;
  await new Promise((ok) => setTimeout(ok, 20));
  assert.notEqual(a.id, b.id);
  assert.equal(Records.get(ENTITE, a.id).statut, 'fini');
  assert.equal(dernierLancement(dealId, 0, 'loyer').id, b.id);
  assert.equal(Records.get(ENTITE, b.id).resultat.conclusion, 'Dans le marché');
  libre = lancerOutil('prix', { adresse: '2 rue B' }, { moteur }).lancement;
  await new Promise((ok) => setTimeout(ok, 20));
  const r = rattacher(libre.id, dealId);
  assert.equal(r.ok, true);
  assert.equal(dernierLancement(dealId, 0, 'prix').rattache_de, libre.id);
  assert.equal(rattacher(libre.id, 'pas-de-dossier').ok, false);
});

test('le locataire se reconnaît parmi les établissements ouverts du local, par enseigne ou dénomination', () => {
  const ex = [
    { siren: '1', nom: 'EXKI', denomination: 'EXKI FRANCE', actif: false },
    { siren: '2', nom: 'KFC', enseigne: 'KFC', denomination: 'SAS RESTO REPUBLIQUE', actif: true },
    { siren: '3', nom: 'CAFE PINSON', denomination: 'PINSON SARL', actif: true },
  ];
  assert.equal(reconnaitreLocataire('KFC', ex).siren, '2');
  assert.equal(reconnaitreLocataire('Café Pinson', ex).siren, '3');
  assert.equal(reconnaitreLocataire('Exki', ex), null);
  assert.equal(reconnaitreLocataire('Pi', ex), null);
});

test('la vacance vient de l\'outil Vacance : le taux de la rue, « à voir » sous son seuil, vide s\'il ne répond pas', () => {
  const r = (taux) => ({ ok: true, statut: 200, taux });
  assert.equal(pointVacance(r({ taux: 6.3, vacants: 2, tranches: 32, incertains: 1, locaux: 33, fiable: true })).statut, 'ok');
  assert.match(pointVacance(r({ taux: 6.3, vacants: 2, tranches: 32, incertains: 1, locaux: 33, fiable: true })).resultat, /6,3 % sur la rue \(2 vides sur 32 locaux, 1 incertain\)/);
  assert.equal(pointVacance(r({ taux: 25, vacants: 5, tranches: 20, incertains: 0, locaux: 20, fiable: true })).statut, 'alerte');
  assert.equal(pointVacance(r({ taux: 20, vacants: 1, tranches: 5, incertains: 0, locaux: 5, fiable: false })).statut, 'a_voir');
  assert.equal(pointVacance({ ok: true, statut: 202, etat: 'chargement' }).statut, 'vide');
  assert.equal(pointVacance({ ok: false, error: 'OpenStreetMap ne répond pas.' }).resultat, 'OpenStreetMap ne répond pas.');
});

test('les procédures collectives se lisent par leur dernier jugement', () => {
  const pc = (date, nature) => ({ type: 'procédure collective', date, jugement: { nature, date } });
  assert.deepEqual(lireProcedures([]), { statut: 'ok', texte: 'Aucune procédure collective en 5 ans' });
  const liq = lireProcedures([pc('2024-08-28', "Jugement d'ouverture d'une procédure de redressement judiciaire"), pc('2025-07-16', 'Jugement de conversion en liquidation judiciaire')]);
  assert.equal(liq.statut, 'alerte');
  assert.equal(liq.texte, 'Liquidation judiciaire prononcée le 16/07/2025 (2 avis en 5 ans)');
  assert.equal(lireProcedures([pc('2025-01-10', 'Jugement arrêtant le plan de redressement')]).statut, 'a_voir');
  assert.match(lireProcedures([pc('2025-01-10', "Jugement d'ouverture d'une procédure de sauvegarde")]).texte, /^Procédure de sauvegarde ouverte le 10\/01\/2025$/);
  assert.equal(lireProcedures([{ type: 'cession', date: '2025-01-01' }]).statut, 'ok');
  assert.equal(lireProcedures([{ type: 'procédure collective', famille: 'modification', date: '2025-07-25' }]).statut, 'ok');
  assert.equal(lireProcedures([pc('2021-12-22', "Dépôt de l'état des créances")]).statut, 'a_voir');
  assert.match(lireProcedures([pc('2021-12-22', "Dépôt de l'état des créances"), pc('2021-03-01', 'Jugement arrêtant le plan de redressement')]).texte, /^Sous plan de redressement arrêté le 01\/03\/2021/);
});

test('le locataire reconnu au local est le plus récent des exploitants à ce nom', () => {
  const ex = [{ siren: 'vieux', enseigne: 'BARBERSHOP', actif: true, ouvert: '2014-03-01' }, { siren: 'neuf', enseigne: 'BARBERSHOP', actif: true, ouvert: '2016-05-01' }];
  assert.equal(reconnaitreLocataire('Barbershop', ex).siren, 'neuf');
});

test("la note de l'IA ne part que des points lus, avec les avis BODACC et la question de l'outil", () => {
  const c = consigneNote('locataire', { locataire: 'KFC', loyer: 95000 }, { points: [
    { cle: 'societe', libelle: 'Société', statut: 'ok', resultat: 'PKF LYON REPUBLIQUE · SAS' },
    { cle: 'procedures', libelle: 'Procédures collectives', statut: 'alerte', resultat: 'Liquidation judiciaire prononcée le 16/07/2025', detail: { evenements: [{ date: '2025-07-27', jugement: { nature: 'Jugement de conversion en liquidation judiciaire' } }] } },
  ] });
  assert.match(c, /Que vaut sa signature/);
  assert.match(c, /locataire : KFC · loyer : 95000/);
  assert.match(c, /2025-07-27 Jugement de conversion en liquidation judiciaire/);
  assert.match(c, /n'invente aucun fait/);
  assert.match(c, /^Nous sommes le /);
});

test("la note de l'IA tient en deux phrases au plus", () => {
  assert.equal(deuxPhrases('Une. Deux ! Trois ? Quatre.'), 'Une. Deux !');
  assert.equal(deuxPhrases('Sans point final'), 'Sans point final');
  assert.equal(deuxPhrases('Loyer de 95 000 €. Rendement de 5,76 % brut. Reste.'), 'Loyer de 95 000 €. Rendement de 5,76 % brut.');
});

test('le poids du loyer : le dernier exercice de moins de trois ans, un chiffre d\'affaires confidentiel, une perte à voir', () => {
  // Les montants s'écrivent avec l'espace fine insécable du français : on la lit comme une espace.
  const sp = (t) => String(t).replace(/[\u00a0\u202f]/g, ' ');
  const ok = pointComptes([{ exercice: '2025', chiffre_affaires: 1420000, resultat_net: 61000 }, { exercice: '2024', chiffre_affaires: 1300000 }], 95000, { annee: 2026 });
  assert.equal(ok.statut, 'ok');
  assert.equal(ok.detail.taux, 6.7);
  assert.equal(sp(ok.resultat), "6,7 % du chiffre d'affaires · CA 1 420 000 € en 2025, résultat 61 000 €");
  assert.equal(pointComptes([{ exercice: '2025', chiffre_affaires: 400000 }], 80000, { annee: 2026 }).statut, 'alerte');
  const confidentiel = pointComptes([{ exercice: '2025', chiffre_affaires: 0, resultat_net: -214000 }], 95000, { annee: 2026 });
  assert.equal(confidentiel.statut, 'a_voir');
  assert.equal(sp(confidentiel.resultat), "Chiffre d'affaires confidentiel en 2025, perte de 214 000 €");
  assert.equal(pointComptes([{ exercice: '2019', chiffre_affaires: 500000 }], 20000, { annee: 2026 }).resultat, 'Derniers comptes publiés en 2019, trop anciens pour juger.');
  assert.equal(pointComptes([], 20000).resultat, 'Comptes non publiés.');
  assert.equal(pointComptes([{ exercice: '2025', chiffre_affaires: 900000 }], 20000, { ei: true }).statut, 'vide');
  assert.match(pointComptes([{ exercice: '2025', chiffre_affaires: 3e9 }], 50000, { annee: 2026 }).resultat, /^moins de 0,1 %/);
  assert.match(pointComptes([{ exercice: '2025', chiffre_affaires: 600000 }], null, { annee: 2026 }).resultat, /loyer manquant/);
});

test('les avis clients : la fiche Google, ou une fiche simulée qui se dit simulée', () => {
  const g = pointAvis({ displayName: { text: 'KFC' }, rating: 4.3, userRatingCount: 1284, businessStatus: 'OPERATIONAL', googleMapsUri: 'https://maps.google.com/?cid=1' });
  assert.equal(g.statut, 'ok');
  assert.equal(g.source, 'Google Maps');
  assert.equal(g.lien, 'https://maps.google.com/?cid=1');
  assert.deepEqual(g.detail, { note: 4.3, nombre: 1284, nom: 'KFC', ferme: false, simule: false });
  const s = pointAvis({ note: 4.3, nombre: 1284, nom: 'KFC Lyon République' }, { simule: true });
  assert.equal(s.detail.simule, true);
  assert.match(s.resultat, / · simulé$/);
  assert.match(s.source, /^Simulation/);
  assert.equal(s.lien, null);
  assert.equal(pointAvis({ rating: 3.1, userRatingCount: 40 }).statut, 'alerte');
  assert.equal(pointAvis({ rating: 4.6, userRatingCount: 8 }).statut, 'a_voir');
  assert.equal(pointAvis({ displayName: { text: 'X' }, rating: 4.6, userRatingCount: 80, businessStatus: 'CLOSED_PERMANENTLY' }).statut, 'alerte');
});

test('la commune en chiffres : surface en km² et densité', () => {
  assert.deepEqual(communeLisible({ code: '69382', nom: 'Lyon 2e', population: 30000, surface: 341, departement: { nom: 'Rhône' }, region: { nom: 'Auvergne-Rhône-Alpes' } }), { code: '69382', nom: 'Lyon 2e', population: 30000, surface_km2: 3, densite_km2: 10000, departement: 'Rhône', region: 'Auvergne-Rhône-Alpes' });
  assert.equal(communeLisible(null), null);
});

test('un arrondissement municipal se ramène à sa commune pour l\'API Géo', () => {
  assert.equal(codeCommuneDe('69382'), '69123');
  assert.equal(codeCommuneDe('75108'), '75056');
  assert.equal(codeCommuneDe('13208'), '13055');
  assert.equal(codeCommuneDe('71270'), '71270');
  assert.equal(codeCommuneDe(null), null);
});

test('le SIREN se lit dans un Kbis, et les exploitants possibles se rangent du plus récent au plus ancien', () => {
  assert.equal(sirenDuTexte('RCS Lyon 981 167 141, immatriculée le 03/02/2023'), '981167141');
  assert.equal(sirenDuTexte('981167141'), '981167141');
  assert.equal(sirenDuTexte('Pas de numéro'), null);
  assert.equal(sirenDuTexte('12345678901234'), null);
  const ex = [{ siren: 'a', enseigne: 'KFC', actif: true, ouvert: '2019-01-01' }, { siren: 'b', enseigne: 'KFC', actif: true, ouvert: '2024-01-01' }, { siren: 'c', enseigne: 'KFC', actif: false, ouvert: '2010-01-01' }];
  assert.deepEqual(candidatsLocataire('KFC', ex).map((x) => x.siren), ['b', 'a']);
});

test('un moteur montre ce qu\'il a déjà lu : le lancement reste en cours avec ses premières parties, puis finit', async (t) => {
  let finir;
  const moteur = async (_e, { partiel }) => {
    partiel({ points: [{ cle: 'passage', libelle: 'Passage', statut: 'ok', resultat: '8 / 10' }, { cle: 'vacance', libelle: 'Vacance', statut: 'vide', resultat: 'Lecture en cours…' }] });
    await new Promise((ok) => { finir = ok; });
    return { points: [{ cle: 'passage', libelle: 'Passage', statut: 'ok', resultat: '8 / 10' }, { cle: 'vacance', libelle: 'Vacance', statut: 'ok', resultat: '5 %' }] };
  };
  const l = lancerOutil('emplacement', { adresse: '3 rue C' }, { moteur }).lancement;
  t.after(() => Records.delete(ENTITE, l.id));
  await new Promise((ok) => setTimeout(ok, 10));
  const pendant = Records.get(ENTITE, l.id);
  assert.equal(pendant.statut, 'en_cours');
  assert.equal(pendant.resultat.points.find((p) => p.cle === 'vacance').resultat, 'Lecture en cours…');
  finir();
  await new Promise((ok) => setTimeout(ok, 10));
  const apres = Records.get(ENTITE, l.id);
  assert.equal(apres.statut, 'fini');
  assert.equal(apres.resultat.points.find((p) => p.cle === 'vacance').resultat, '5 %');
});

test('le résumé des avis du web se lit ligne à ligne, et ne remplace jamais une note Google', () => {
  const r = lireResumeAvis('CERTITUDE: sûr\nSYNTHESE: Service rapide, salle souvent sale.\n- POSITIF: rapidité\nPOSITIF: emplacement\nNEGATIF: propreté\nPOSITIF: a\nPOSITIF: b');
  assert.deepEqual(r, { certitude: 'sur', synthese: 'Service rapide, salle souvent sale.', positifs: ['rapidité', 'emplacement', 'a'], negatifs: ['propreté'] });
  assert.equal(lireResumeAvis('Je ne sais pas.'), null);
  assert.equal(lireResumeAvis('CERTITUDE: introuvable').certitude, 'introuvable');
  const google = { cle: 'avis', libelle: 'Avis clients', statut: 'ok', resultat: '4,1 sur 5', detail: { note: 4.1 } };
  assert.equal(avecResumeWeb(google, r).detail.note, 4.1);
  assert.equal(avecResumeWeb(google, r).detail.web.synthese, r.synthese);
  const sans = { cle: 'avis', libelle: 'Avis clients', statut: 'vide', resultat: 'Pas de fiche', detail: null };
  assert.equal(avecResumeWeb(sans, r).statut, 'a_voir');
  assert.equal(avecResumeWeb(sans, r).detail.note, undefined);
  assert.equal(avecResumeWeb(sans, { ...r, certitude: 'introuvable' }), sans);
  assert.equal(avecResumeWeb(google, null, { enCours: true }).detail.web_en_cours, true);
});
