// K-Data : les résumés d'une analyse, l'ordre de la file, le rangement.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kdata-'));
const {
  resumerExpertise, resumerEstimation, resumerProspection, resumerFoncier, resumerValeurLocative, resumerVacance, resumerTransactions,
  lienDe, ordonner, lancerAnalyses, ranger, listerAnalyses, listerDossiers, CLES_OUTILS,
} = await import('./kdata.js');

// Le français sépare les milliers par une espace fine insécable : on la
// ramène à une espace ordinaire pour comparer sans l'imiter dans les littéraux.
const plat = (s) => String(s).replace(/\s/g, ' ');

test('chaque outil se résume en une ligne, et ne dit rien quand il ne sait rien', () => {
  assert.equal(resumerExpertise({ resultat: { data_b: { flux_pieton: { par_heure: { basse: { min: 120 }, haute: { max: 480 } } }, rue: { commerces: 34 } }, generateurs: [1, 2, 3] } }), '120 à 480 piétons / h · 3 générateurs de flux · 34 commerces dans la rue');
  assert.equal(resumerExpertise({}), 'rapport prêt');
  assert.match(resumerEstimation({ marche: { dvf: { n: 16 }, vlm_datab: { rue: { basse: 276, haute: 414 } } } }), /16 ventes DVF .* 276 € à 414 € .* formulaire à remplir/);
  assert.equal(plat(resumerEstimation({ resultat: { valeurs: { moyenne: 299000 } } })), '299 000 € en valeur moyenne');
  assert.equal(resumerProspection({ nb_retenus: 7, nb_commerces: 42 }), '7 commerces retenus sur 42');
  assert.equal(resumerProspection({ nb_retenus: 1, nb_commerces: 42 }), '1 commerce retenu sur 42');
  assert.equal(resumerFoncier({ total: 153, avec_proprietaires: 96 }), '153 parcelles dans 150 m, 96 avec propriétaire connu');
  assert.equal(resumerValeurLocative({ resultat: { rue: { basse: 276, haute: 414 }, du_cache: true } }), '276 € à 414 € / m² / an, reprise de la base');
  assert.equal(resumerVacance({ vacance: { taux: 1.6 }, turnover: { duree_mediane: 10 } }), "1,6 % de vacance · 10 ans d'exploitation médiane");
  assert.equal(plat(resumerTransactions({ murs: { prix_m2: { median: 2500 }, n: 155 }, fonds: { n_avec_prix: 513 } })), 'murs 2 500 € / m² sur 155 ventes · 513 cessions de fonds chiffrées');
  assert.equal(resumerTransactions({}), 'marché lu');
});

test("une analyse prête s'ouvre dans son outil, par sa fiche ou par son adresse", () => {
  assert.equal(lienDe({ outil: 'kzoning', etat: 'terminee', ref: { id: 'z1' } }), '/kzoning?zone=z1');
  assert.equal(lienDe({ outil: 'kexpertise', etat: 'terminee', ref: { id: 'e1' } }), '/kexpertise?id=e1');
  assert.equal(lienDe({ outil: 'kvacance', etat: 'terminee', libelle: '49 Rue Dabray 06000 Nice' }), '/kvacance?adresse=49%20Rue%20Dabray%2006000%20Nice');
  // Valeur locative rouvre sa recherche par identifiant, sans crédit ; sans identifiant, par l'adresse.
  assert.equal(lienDe({ outil: 'valeur-locative', etat: 'terminee', ref: { id: 'r1' } }), '/valeurlocative?id=r1');
  assert.equal(lienDe({ outil: 'valeur-locative', etat: 'terminee', ref: { id: null }, libelle: 'Nice' }), '/valeurlocative?adresse=Nice');
  // Une analyse qui tourne encore, ou qui a échoué, n'a rien à ouvrir.
  assert.equal(lienDe({ outil: 'kzoning', etat: 'en_cours', ref: { id: 'z1' } }), null);
  assert.equal(lienDe({ outil: 'inconnu', etat: 'terminee' }), null);
  assert.equal(CLES_OUTILS.length, 8);
});

test('la file met ce qui tourne en tête, puis le plus récent, avec le nom du dossier', () => {
  const l = ordonner([
    { id: 'a', etat: 'terminee', cree_le: '2026-09-19T10:00:00Z', outil: 'kvacance', libelle: 'x', dossier_id: 'd1' },
    { id: 'b', etat: 'en_cours', cree_le: '2026-09-19T08:00:00Z', outil: 'kzoning' },
    { id: 'c', etat: 'terminee', cree_le: '2026-09-19T11:00:00Z', outil: 'kfoncier', libelle: 'y', dossier_id: 'inconnu' },
  ], [{ id: 'd1', nom: 'Nice centre' }]);
  assert.deepEqual(l.map((x) => x.id), ['b', 'c', 'a']);
  assert.equal(l[2].dossier_nom, 'Nice centre');
  assert.equal(l[1].dossier_nom, null, 'un dossier disparu ne laisse pas un nom fantôme');
  assert.equal(l[0].lien, null);
  assert.ok(l[1].lien.startsWith('/kfoncier?adresse='));
});

test('un lancement refuse une adresse vague, un outil inconnu, ou aucun outil', () => {
  assert.match(lancerAnalyses({ adresse: 'Nice', outils: ['kvacance'] }).error, /adresse précise/);
  assert.match(lancerAnalyses({ adresse: '49 rue Dabray 06000 Nice', outils: [] }).error, /au moins un outil/);
  assert.match(lancerAnalyses({ adresse: '49 rue Dabray 06000 Nice', outils: ['kvacance', 'magie'] }).error, /Outil inconnu : magie/);
});

test("des analyses se rangent dans une affaire de la page Dossiers, et l'affaire les liste", async () => {
  const { Records } = await import('./db.js');
  const a = Records.create('AnalyseKData', { outil: 'kvacance', etat: 'terminee', adresse: 'x', cree_le: '2026-09-19T10:00:00Z' });
  const b = Records.create('AnalyseKData', { outil: 'kfoncier', etat: 'terminee', adresse: 'x', cree_le: '2026-09-19T10:00:00Z' });
  // Une affaire, telle que la page Dossiers la crée : identifiée par son deal_id.
  Records.create('Deal', { deal_id: 'cafpi-courbevoie', nom: 'CAFPI Courbevoie', cree_le: '2026-09-01T00:00:00Z', lots: [] });
  Records.create('Deal', { deal_id: 'archivee', nom: 'Vieille affaire', archived: true, cree_le: '2026-01-01T00:00:00Z', lots: [] });

  const dossiers = listerDossiers();
  assert.ok(dossiers.some((d) => d.id === 'cafpi-courbevoie' && d.nom === 'CAFPI Courbevoie'));
  assert.ok(!dossiers.some((d) => d.id === 'archivee'), "une affaire archivée n'est pas proposée");

  assert.match(ranger([], 'cafpi-courbevoie').error, /Cochez/);
  assert.match(ranger([a.id], 'nulle-part').error, /n'existe plus/);
  const r = ranger([a.id, b.id, 'fantome'], 'cafpi-courbevoie');
  assert.equal(r.ok, true);
  assert.equal(r.rangees, 2, "l'identifiant fantôme est ignoré, pas fatal");
  assert.equal(Records.get('AnalyseKData', a.id).dossier_id, 'cafpi-courbevoie');
  // L'affaire retrouve ses analyses, avec son nom sur chaque ligne.
  const siennes = listerAnalyses(60, { deal_id: 'cafpi-courbevoie' });
  assert.deepEqual(siennes.map((x) => x.id).sort(), [a.id, b.id].sort());
  assert.equal(siennes[0].dossier_nom, 'CAFPI Courbevoie');
  assert.equal(listerAnalyses(60, { deal_id: 'autre' }).length, 0);
  // `null` sort de l'affaire.
  assert.equal(ranger([a.id], null).ok, true);
  assert.equal(Records.get('AnalyseKData', a.id).dossier_id, null);
  assert.match(ranger(['fantome'], 'cafpi-courbevoie').error, /Aucune/);
});
