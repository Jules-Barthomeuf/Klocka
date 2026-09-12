// Le moteur de verdict, éprouvé sur les règles réelles de l'équipe.
//
// C'est ici que se décide GO, GO SOUS RÉSERVE, INSUFFISANT ou NO-GO, et
// nulle part ailleurs. Sept cents lignes de logique métier qui n'avaient
// aucun test : une règle mal touchée changeait silencieusement le verdict de
// tous les dossiers suivants, et rien ne l'aurait dit.
//
// Les tests tournent contre server/deal/data/rules.json, le vrai fichier :
// si l'équipe change un seuil, le test le voit. C'est voulu. Un test contre
// des règles inventées ne protégerait que du code, pas de la décision.

import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluer } from './rules.js';
import { calculerAEM } from './aem.js';
import { etapeMax, ETAPES, etapeParId } from './etapes.js';

// Un champ extrait, tel que le lecteur de documents le pose.
const champ = (valeur, confiance = 'haute') => ({ absent: false, valeur, confiance });

// Un dossier qui passe tout : 500 k€, 40 k€ de loyer, ville moyenne, enseigne
// nationale premium, emplacement n°1. C'est le profil 03.
const LOT_SAIN = {
  adresse: champ({ rue: '12 rue de la Paix', ville: 'Poitiers', code_postal: '86000' }),
  prix_fai: champ(500000),
  loyer_annuel_ht_hc: champ(40000),
  locataire_nom: champ('Optic 2000'),
  bail_echeance: champ('31/12/2034'),
  occupe: champ(true),
};

const ENRICHISSEMENT_SAIN = {
  typologie_ville: 'ville_moyenne',
  paris: false,
  signature: { niveau: 'nationale_premium', confiance: 'haute' },
  activite: { code: 'commerce', exclue: false },
  emplacement: 'n1',
};

const ids = (reserves) => reserves.map((r) => r.id).sort();

// ---------------------------------------------------------------------------
// Le prix de revient
// ---------------------------------------------------------------------------

test('AEM : le prix de revient n’est pas le prix affiché', () => {
  // Une fiche annonce 500 000 € et 8 % de rendement. Le prix de revient réel
  // ajoute les droits, les honoraires et les frais : 580 000 €, soit 6,9 %.
  // Cet écart d'un point est exactement ce que la préanalyse existe pour dire.
  const aem = calculerAEM({ prixFai: 500000, loyerAnnuel: 40000 });

  assert.equal(aem.honoraires_agence, 25000, 'commission agent : 5 % de 500 000');
  assert.equal(aem.prix_hors_droits, 475000, 'les honoraires sont inclus au FAI, donc déduits');
  assert.equal(aem.droits_enregistrement, 38000, "8 % de l'assiette hors honoraires");
  assert.equal(aem.fees_klocka, 40000, '8 % du prix négocié');
  assert.equal(aem.frais_divers, 2000, 'dossier bancaire + création de société');
  assert.equal(aem.prix_aem, 580000);
  assert.equal(aem.surcout_vs_fai, 80000);

  assert.equal(aem.rendement_fai, 8, 'ce que la fiche annonce');
  assert.equal(aem.rendement_aem, 6.9, 'ce que le bien rapporte vraiment');
});

test('AEM : négocier déclenche l’incentive Klocka', () => {
  // 50 000 € arrachés sur le prix : 20 % de l'écart revient à Klocka. Sans ce
  // terme, le prix de revient d'un bien négocié serait sous-estimé.
  const aem = calculerAEM({ prixFai: 500000, prixNegocie: 450000, loyerAnnuel: 40000 });

  assert.equal(aem.incentive_klocka, 10000, "20 % des 50 000 € d'écart");
  assert.equal(aem.prix_aem, 532200);
  assert.equal(aem.rendement_aem, 7.52, 'la négociation fait gagner 0,6 point');
});

test('AEM : les travaux du bailleur entrent dans le prix de revient', () => {
  const sans = calculerAEM({ prixFai: 500000, loyerAnnuel: 40000 });
  const avec = calculerAEM({ prixFai: 500000, loyerAnnuel: 40000, travaux: 30000 });

  assert.equal(avec.prix_aem - sans.prix_aem, 30000);
  assert.ok(avec.rendement_aem < sans.rendement_aem, 'des travaux ne peuvent pas améliorer le rendement');
});

test('AEM : sans prix, pas de calcul — et surtout pas un zéro', () => {
  // Rendre 0 laisserait croire à un bien gratuit et ferait passer tous les
  // seuils de rendement. On ne rend rien.
  assert.equal(calculerAEM({ prixFai: 0, loyerAnnuel: 40000 }), null);
  assert.equal(calculerAEM({ prixFai: null, loyerAnnuel: 40000 }), null);
  assert.equal(calculerAEM({}), null);
});

// ---------------------------------------------------------------------------
// Les quatre étapes du moteur, dans l'ordre
// ---------------------------------------------------------------------------

test('un bien vacant est refusé, quels que soient ses chiffres', () => {
  // Le knock-out passe avant tout le reste : même un dossier parfait par
  // ailleurs doit tomber ici.
  const r = evaluer({ ...LOT_SAIN, occupe: champ(false) }, ENRICHISSEMENT_SAIN);

  assert.equal(r.verdict, 'NO-GO');
  assert.deepEqual(r.motifs, ["Nous n'achetons que de l'occupé."]);
  assert.equal(r.profil, null, "un refus n'attribue pas de profil");
  assert.equal(r.trace.knock_out.id, 'KO-VACANT');
});

test('au-delà du plafond, le dossier ne s’ouvre pas', () => {
  const r = evaluer({ ...LOT_SAIN, prix_fai: champ(2500000) }, ENRICHISSEMENT_SAIN);

  assert.equal(r.verdict, 'NO-GO');
  assert.equal(r.trace.knock_out.id, 'KO-PLAFOND');
});

test('un knock-out l’emporte sur des données manquantes', () => {
  // L'ordre compte : un bien vacant ET incomplet doit ressortir NO-GO, pas
  // INSUFFISANT. Sinon on relance l'agent pour un bien qu'on ne veut pas.
  const incomplet = { ...LOT_SAIN, occupe: champ(false) };
  delete incomplet.bail_echeance;

  const r = evaluer(incomplet, ENRICHISSEMENT_SAIN);
  assert.equal(r.verdict, 'NO-GO');
  assert.equal(r.manquants.length, 0);
});

test('un champ clé absent rend le dossier insuffisant, et dit lequel', () => {
  // C'est ce qui déclenche le mail de relance : il doit nommer ce qui manque.
  const sansEcheance = { ...LOT_SAIN };
  delete sansEcheance.bail_echeance;

  const r = evaluer(sansEcheance, ENRICHISSEMENT_SAIN);
  assert.equal(r.verdict, 'INSUFFISANT');
  assert.deepEqual(r.manquants, ['bail_echeance']);
  assert.ok(r.libelles_manquants, 'le mail a besoin du libellé lisible, pas du nom technique');
});

test('une adresse sans rue ni ville ne compte pas comme une adresse', () => {
  // Le lecteur rend parfois un objet vide plutôt qu'une absence. Sans ce
  // contrôle, un dossier sans adresse passait pour complet.
  const r = evaluer({ ...LOT_SAIN, adresse: champ({ code_postal: '86000' }) }, ENRICHISSEMENT_SAIN);

  assert.equal(r.verdict, 'INSUFFISANT');
  assert.ok(r.manquants.includes('adresse'));
});

test('un dossier complet qui ne correspond à aucun profil est refusé', () => {
  // 25 000 € de loyer sur 500 000 € : 4,3 % en AEM, sous tous les seuils.
  const r = evaluer({ ...LOT_SAIN, loyer_annuel_ht_hc: champ(25000) }, ENRICHISSEMENT_SAIN);

  assert.equal(r.verdict, 'NO-GO');
  assert.deepEqual(r.motifs, ["Le bien ne correspond à aucun profil d'acquéreur."]);
  assert.ok(r.aem.rendement_aem < 6);
});

test('le dossier sain ressort GO, sur le bon profil', () => {
  const r = evaluer(LOT_SAIN, ENRICHISSEMENT_SAIN);

  assert.equal(r.verdict, 'GO');
  assert.equal(r.profil.code, '03', 'ville moyenne, 400-800 k€, signature premium');
  assert.deepEqual(r.reserves, []);
  assert.equal(r.aem.rendement_aem, 6.9);
});

// ---------------------------------------------------------------------------
// Les réserves : ce qui fait passer un GO en GO SOUS RÉSERVE
// ---------------------------------------------------------------------------

test('chaque réserve, prise seule, dégrade le GO sans le refuser', () => {
  const cas = [
    ['emplacement non qualifié', LOT_SAIN, { ...ENRICHISSEMENT_SAIN, emplacement: 'a_qualifier' }, 'RES-EMPLACEMENT'],
    ['bail court', { ...LOT_SAIN, bail_echeance: champ('30/06/2027') }, ENRICHISSEMENT_SAIN, 'RES-BAIL-COURT'],
    [
      'extraction incertaine',
      { ...LOT_SAIN, locataire_nom: champ('Optic 2000', 'basse') },
      ENRICHISSEMENT_SAIN,
      'RES-CONFIANCE-EXTRACTION',
    ],
    [
      'signature mal identifiée',
      LOT_SAIN,
      { ...ENRICHISSEMENT_SAIN, signature: { niveau: 'nationale_premium', confiance: 'basse' } },
      'RES-SIGNATURE-INCONNUE',
    ],
  ];

  for (const [quoi, lot, enr, attendue] of cas) {
    const r = evaluer(lot, enr);
    assert.equal(r.verdict, 'GO SOUS RÉSERVE', quoi);
    assert.deepEqual(ids(r.reserves), [attendue], quoi);
  }
});

test('les réserves s’additionnent', () => {
  const r = evaluer(
    { ...LOT_SAIN, bail_echeance: champ('30/06/2027'), locataire_nom: champ('Optic 2000', 'basse') },
    { ...ENRICHISSEMENT_SAIN, emplacement: 'a_qualifier' }
  );

  assert.equal(r.verdict, 'GO SOUS RÉSERVE');
  assert.deepEqual(ids(r.reserves), ['RES-BAIL-COURT', 'RES-CONFIANCE-EXTRACTION', 'RES-EMPLACEMENT']);
  assert.equal(r.motifs.length, 3, 'chaque réserve porte son motif');
});

test('un emplacement non qualifié laisse le dossier vivant, un mauvais le tue', () => {
  // Tant que personne n'a regardé l'adresse, on ne préjuge pas : le dossier
  // matche et la réserve le signale. Une fois qualifié en dessous du rang
  // exigé, il sort du profil.
  assert.equal(evaluer(LOT_SAIN, { ...ENRICHISSEMENT_SAIN, emplacement: 'a_qualifier' }).verdict, 'GO SOUS RÉSERVE');
  assert.equal(evaluer(LOT_SAIN, { ...ENRICHISSEMENT_SAIN, emplacement: 'n3' }).verdict, 'NO-GO');
});

// ---------------------------------------------------------------------------
// Les étapes d'un dossier
// ---------------------------------------------------------------------------

test('l’étape explicite fait foi, y compris pour revenir en arrière', () => {
  assert.equal(etapeMax({ etape_max: 4, statut: 'analyse', lots: [{}] }), 4);
  assert.equal(etapeMax({ etape_max: 2, statut: 'projet_cree', lots: [{}] }), 2, 'on peut reculer');
  assert.equal(etapeMax({ etape_max: 99, lots: [{}] }), ETAPES.length, 'jamais au-delà de la dernière');
});

test('un dossier antérieur déduit son étape de son statut', () => {
  // Migration paresseuse : les dossiers créés avant `etape_max` n'en ont pas.
  assert.equal(etapeMax({ statut: 'analyse', lots: [{}] }), 2);
  assert.equal(etapeMax({ statut: 'documents_recus', lots: [{}] }), 3);
  assert.equal(etapeMax({ statut: 'projet_cree', lots: [{}] }), 5);
});

test('une coquille sans lot reste à la première étape', () => {
  // Un dossier nommé mais vide ne doit pas sauter à l'étape 5 parce que son
  // statut par défaut le dirait.
  assert.equal(etapeMax({ statut: 'projet_cree', lots: [] }), 1);
  assert.equal(etapeMax({}), 1);
  assert.equal(etapeMax(null), 1);
});

test('les cinq étapes sont numérotées sans trou et retrouvables', () => {
  assert.deepEqual(ETAPES.map((e) => e.n), [1, 2, 3, 4, 5]);
  assert.equal(etapeParId('analyse').n, 3);
  assert.equal(etapeParId('inconnue'), null);
});
