// La feuille de route : le crédit, la capacité d'endettement, le plan qui en
// découle, sa projection, et la mesure d'une page ouverte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lm-'));
const {
  calculerRoadmap, lienSimulateur, tropDeDemandes, avecDelai,
  mensualiteCredit, capitalEmpruntable, capitalRestantDu, typologiePour,
  lireAppareil, lireOrigine, activiteParJour,
  SURFACES, TYPOLOGIES, TAUX_ENDETTEMENT, PART_LOYERS_RETENUS, PART_APPORT,
  TAUX_CREDIT, DUREE_CREDIT,
} = await import('./leadmagnet.js');

const plan = (p = {}) => calculerRoadmap({ objectif_mensuel: 3000, fonds_propres: 80000, revenus_annuels: 60000, horizon_ans: 25, prix_m2: 2500, ...p });
const proche = (a, b, ecart = 1) => assert.ok(Math.abs(a - b) <= ecart, `${a} attendu proche de ${b}`);

test('le crédit est calculé en annuités constantes, et les trois formules se répondent', () => {
  const m = mensualiteCredit(200000, 4.5, 20);
  proche(Math.round(m), 1265, 2);
  // La mensualité et le capital sont deux lectures de la même chose.
  proche(capitalEmpruntable(m, 4.5, 20), 200000, 1);

  assert.equal(capitalRestantDu(200000, 4.5, 20, 0), 200000);
  assert.equal(capitalRestantDu(200000, 4.5, 20, 20), 0, 'au terme, on ne doit plus rien');
  assert.equal(capitalRestantDu(200000, 4.5, 20, 25), 0, 'et pas moins que rien après');
  const miParcours = capitalRestantDu(200000, 4.5, 20, 10);
  assert.ok(miParcours > 100000 && miParcours < 200000, "à mi-parcours on doit plus que la moitié : les intérêts se paient d'abord");

  assert.equal(mensualiteCredit(0), 0);
  assert.equal(capitalEmpruntable(0), 0);
  assert.equal(capitalRestantDu(0), 0);
});

test("le budget ouvre une classe d'actif, et le rendement suit le risque", () => {
  assert.equal(typologiePour(120000).cle, 'service');
  assert.equal(typologiePour(150000).cle, 'service');
  assert.equal(typologiePour(150001).cle, 'proximite');
  assert.equal(typologiePour(350000).cle, 'proximite');
  assert.equal(typologiePour(700000).cle, 'enseigne');
  assert.equal(typologiePour(2000000).cle, 'mixte');

  // Plus le ticket est gros, moins ça rapporte : c'est le prix de la sécurité,
  // et c'est l'arbitrage que le plan raconte en montant en gamme.
  for (let i = 1; i < TYPOLOGIES.length; i++) {
    assert.ok(TYPOLOGIES[i].rendement[1] <= TYPOLOGIES[i - 1].rendement[1]);
    assert.ok(TYPOLOGIES[i].plafond > TYPOLOGIES[i - 1].plafond);
  }
  for (const t of TYPOLOGIES) {
    assert.ok(t.locataire && t.risque && t.bail, 'une typologie dit son locataire et son risque');
    assert.ok(t.metiers.every((m) => SURFACES.some(([nom]) => nom === m)), `chaque métier de ${t.cle} a une surface type`);
  }
});

test("la première acquisition sort du taux d'endettement, pas d'un patrimoine visé", () => {
  const p = plan();
  assert.equal(p.ok, true);

  const c = p.capacite_initiale;
  // 35 % des revenus mensuels, et rien d'autre ne la borne quand il n'y a
  // aucun crédit en cours.
  assert.equal(c.plafond_mensuel, Math.round((60000 / 12) * TAUX_ENDETTEMENT));
  assert.equal(c.charges_actuelles, 0);
  assert.equal(c.mensualite_max, c.plafond_mensuel);
  proche(c.capital, capitalEmpruntable(c.mensualite_max), 1000);

  const a = p.acquisitions[0];
  assert.equal(a.annee, 0, 'avec des fonds propres et aucun crédit, on achète tout de suite');
  assert.equal(a.apport + a.emprunt, a.prix, "l'apport et l'emprunt font le prix, à l'euro près");
  assert.ok(a.apport >= Math.round(a.prix * PART_APPORT) - 1, "l'apport couvre au moins les frais d'acquisition");
  assert.ok(a.apport <= 80000, "on ne peut pas apporter plus qu'on n'a");
  proche(a.mensualite_credit, Math.round(mensualiteCredit(a.emprunt)), 1);
  assert.equal(a.fin_credit, a.annee + DUREE_CREDIT);
  assert.equal(a.taux_credit, TAUX_CREDIT);
  assert.equal(a.cash_flow_mensuel, a.loyer_mensuel - a.mensualite_credit);
});

test('les loyers perçus rouvrent la capacité pour le suivant', () => {
  const p = plan({ objectif_mensuel: 4000, horizon_ans: 30 });
  assert.ok(p.acquisitions.length >= 2, 'un objectif de 4 000 € demande plusieurs lots');

  // L'effet de levier, vérifié sur la formule et pas sur une impression : la
  // banque réintègre 70 % des loyers déjà encaissés, et retranche les
  // mensualités déjà en cours.
  const [a0, a1] = p.acquisitions;
  const attendu = Math.round((60000 / 12 + a0.loyer_mensuel * PART_LOYERS_RETENUS) * TAUX_ENDETTEMENT - a0.mensualite_credit);
  proche(a1.mensualite_max, Math.max(0, attendu), 1);

  for (const a of p.acquisitions) {
    const typo = TYPOLOGIES.find((t) => t.nom === a.typologie);
    assert.ok(typo, 'chaque acquisition porte sa typologie');
    assert.ok(a.rendement_cible >= typo.rendement[0] && a.rendement_cible <= typo.rendement[1]);
    assert.ok(SURFACES.some(([nom]) => nom === a.metier), 'un métier de la table');
    // La surface découle du prix réellement payé : les deux ne peuvent pas se
    // contredire à l'écran.
    proche(a.surface * 2500, a.prix, 2500);
    assert.ok(a.locataire && a.risque && a.bail, 'un profil de locataire, pas seulement un prix');
    assert.equal(a.loyer_annuel, Math.round((a.prix * a.rendement_cible) / 100 / 1000) * 1000);
  }
  assert.ok(p.acquisitions.every((a, i) => i === 0 || a.annee >= p.acquisitions[i - 1].annee));
});

test('les crédits en cours amputent la capacité, et leur fin la rend', () => {
  const sans = plan({ charges_credit_mensuelles: 0 });
  const avec = plan({ charges_credit_mensuelles: 1200 });

  assert.equal(avec.capacite_initiale.charges_actuelles, 1200);
  assert.equal(avec.capacite_initiale.mensualite_max, sans.capacite_initiale.mensualite_max - 1200);
  assert.ok(avec.capacite_initiale.capital < sans.capacite_initiale.capital);
  // Moins de banque, donc plus de fonds propres sur la même opération.
  assert.ok(avec.acquisitions[0].emprunt < sans.acquisitions[0].emprunt);

  // Une capacité entièrement mangée : on le dit, et on n'emprunte rien.
  const bloque = plan({ charges_credit_mensuelles: 5000, revenus_annuels: 36000 });
  assert.equal(bloque.capacite_initiale.bloquee, true);
  assert.equal(bloque.capacite_initiale.capital, 0);
  for (const a of bloque.acquisitions) assert.equal(a.emprunt, 0, 'sans banque, ce serait comptant ou rien');

  // Un crédit qui se termine rend son air : c'est un événement du parcours.
  const fin = plan({ charges_credit_mensuelles: 1200, fin_credits_ans: 4 });
  assert.equal(fin.capacite_initiale.fin_credits_ans, 4);
  assert.ok(fin.evenements.some((e) => e.type === 'fin_credits_actuels' && e.annee === 4 && e.mensualite_liberee === 1200));
  // Sans date de fin, on ne l'invente pas.
  assert.equal(avec.capacite_initiale.fin_credits_ans, null);
  assert.ok(!avec.evenements.some((e) => e.type === 'fin_credits_actuels'));
});

test("la projection porte les achats, l'année creuse et la fin des prêts", () => {
  const p = plan({ horizon_ans: 30 });
  assert.equal(p.projection.length, 31, "de l'année 0 à l'année 30");
  assert.equal(p.projection[0].annee, 0);

  // Le revenu de chaque année se recalcule entièrement depuis les acquisitions :
  // un bien détenu rapporte, un crédit soldé ne se paie plus.
  for (const x of p.projection) {
    const detenus = p.acquisitions.filter((a) => a.annee <= x.annee);
    const loyer = detenus.reduce((t, a) => t + a.loyer_mensuel, 0);
    const du = detenus.filter((a) => x.annee < a.fin_credit).reduce((t, a) => t + a.mensualite_credit, 0);
    assert.equal(x.mensuel, Math.round(loyer - du), `année ${x.annee}`);
    assert.equal(x.patrimoine, detenus.reduce((t, a) => t + a.prix, 0));
    assert.equal(x.patrimoine_net, x.patrimoine - x.capital_restant);
  }
  // La dette s'efface, donc la part qui vous appartient monte, toujours.
  for (let i = 1; i < p.projection.length; i++) {
    assert.ok(p.projection[i].patrimoine_net >= p.projection[i - 1].patrimoine_net);
  }

  // L'année d'un achat rapporte moins qu'une année pleine : le bien n'est
  // détenu que la moitié du temps. L'apport, lui, n'est pas une charge.
  const achat = p.projection.find((x) => x.achats.length && x.annee > 0);
  if (achat) {
    assert.ok(achat.apport_verse > 0, "l'apport versé est dit, pour l'infobulle");
    proche(achat.cash_flow_hors_achat - achat.cash_flow, Math.round(p.acquisitions.filter((a) => a.annee === achat.annee).reduce((t, a) => t + a.cash_flow_mensuel / 2, 0) * 12), 12);
  }

  // Les temps forts sont dans l'ordre, et la fin d'un prêt en est un.
  assert.ok(p.evenements.every((e, i) => i === 0 || e.annee >= p.evenements[i - 1].annee));
  const a0 = p.acquisitions[0];
  assert.ok(p.evenements.some((e) => e.type === 'fin_credit' && e.annee === a0.fin_credit && e.mensualite_liberee === a0.mensualite_credit));

  // Ce que les locataires ont remboursé à votre place.
  assert.equal(p.capital_rembourse, Math.round(p.acquisitions.reduce((t, a) => t + a.emprunt, 0) - p.projection[30].capital_restant));
});

test("l'horizon borne le plan, et le quartier choisit les métiers", () => {
  // Un horizon court n'invente pas des acquisitions qu'on ne peut pas financer.
  const court = plan({ horizon_ans: 10, fonds_propres: 0, revenus_annuels: 30000 });
  assert.ok(court.acquisitions.every((a) => a.annee <= 10));
  assert.equal(typeof court.dans_horizon, 'boolean');

  // Les métiers relevés dans le quartier priment, quand le budget les porte.
  const local = plan({ metiers: ['Boulangerie', 'Caviste'], objectif_mensuel: 1200, fonds_propres: 40000 });
  assert.ok(local.acquisitions.some((a) => ['Boulangerie', 'Caviste'].includes(a.metier)));

  // Sans prix de quartier, un repère est pris et signalé comme tel.
  const sansMarche = plan({ prix_m2: null });
  assert.equal(sansMarche.prix_m2_estime, true);
  assert.ok(sansMarche.prix_m2_retenu > 0);
  assert.equal(plan().prix_m2_estime, false);
  assert.match(calculerRoadmap({ objectif_mensuel: 0 }).error, /objectif/);
});

test("la mesure d'une page ouverte lit l'appareil, l'origine et l'activité du jour", () => {
  assert.equal(lireAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'Mobile');
  assert.equal(lireAppareil('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'), 'Tablette');
  assert.equal(lireAppareil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'Ordinateur');
  assert.equal(lireAppareil(''), 'Inconnu');

  assert.equal(lireOrigine('https://www.linkedin.com/feed/'), 'linkedin.com');
  assert.equal(lireOrigine(''), 'Direct');
  assert.equal(lireOrigine('ceci n est pas une adresse'), 'Direct');
  assert.equal(lireOrigine('https://www.linkedin.com/', 'newsletter-mars'), 'newsletter-mars', 'la source déclarée prime sur le référent');
  // Une navigation interne nous renvoie notre propre adresse : ce n'est pas
  // une provenance, c'est une visite directe.
  assert.equal(lireOrigine('http://localhost:5173/FeuilleDeRoute', null, 'localhost:5173'), 'Direct');
  assert.equal(lireOrigine('https://www.klocka.immo/x', null, 'klocka.immo'), 'Direct');
  assert.equal(lireOrigine('https://www.linkedin.com/feed/', null, 'klocka.immo'), 'linkedin.com');

  const j = activiteParJour(
    [
      { le: '2026-09-18T10:00:00Z', secondes_resultat: 60, appel_clique: true },
      { le: '2026-09-18T11:00:00Z', secondes_resultat: 20, appel_clique: false },
      { le: '2026-09-17T09:00:00Z', secondes_resultat: 0, appel_clique: false },
    ],
    [{ le: '2026-09-18T10:05:00Z' }],
  );
  assert.equal(j.length, 2);
  assert.equal(j[0].jour, '2026-09-18', 'le jour le plus récent en tête');
  assert.equal(j[0].vues, 2);
  assert.equal(j[0].leads, 1);
  assert.equal(j[0].appels, 1);
  assert.equal(j[0].secondes_moyennes, 40, 'seules les visites qui ont vu le résultat comptent dans la moyenne');
  assert.equal(j[1].vues, 1);
  assert.equal(j[1].leads, 0);
  assert.equal(j[1].secondes_moyennes, 0);
});

test("le lien du simulateur porte l'acquisition, et une page ouverte compte les passages", () => {
  const p = plan();
  const lien = lienSimulateur(p.acquisitions[0], 'https://klocka.immo');
  const params = JSON.parse(decodeURIComponent(lien.split('data=')[1]));
  assert.equal(params.prixBienFAI, p.acquisitions[0].prix);
  assert.equal(params.loyerInitialHTHC, p.acquisitions[0].loyer_annuel);
  assert.equal(params.apport, p.acquisitions[0].apport);
  assert.equal(params.surface, p.acquisitions[0].surface);
  assert.equal(params.tauxInteret, TAUX_CREDIT);
  assert.equal(params.dureeCredit, DUREE_CREDIT);

  const ip = '203.0.113.7';
  for (let i = 0; i < 8; i++) assert.equal(tropDeDemandes(ip), false);
  assert.equal(tropDeDemandes(ip), true, 'le neuvième calcul en une heure est refusé');
  // Les visites ont leur propre seau : compter un passage ne coûte pas un calcul.
  assert.equal(tropDeDemandes(ip, { seau: 'vue', max: 60 }), false);
});

test('une source qui tarde ou qui tombe ne fait pas attendre le visiteur', async () => {
  const lente = new Promise((r) => setTimeout(() => r('trop tard'), 400));
  assert.equal(await avecDelai(lente, 40, null), null);
  assert.equal(await avecDelai(Promise.resolve('à temps'), 200), 'à temps');
  assert.deepEqual(await avecDelai(Promise.reject(new Error('DVF est tombé')), 200, []), []);
});
