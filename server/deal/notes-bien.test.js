// Les notes de la fiche du bien : ce qu'il faut savoir sur une ligne avant de s'y fier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { notesDuLot, netVendeurSansHonoraires } from './notes-bien.js';

const glacier = {
  lot: {
    prix_fai: { valeur: 520000, citation: 'Prix : 520 000 € Net vendeur', confiance: 'moyenne' },
    honoraires_inclus: { valeur: false, citation: 'Honoraires : à la charge du preneur', confiance: 'haute' },
    montant_honoraires: { valeur: null, absent: true },
    loyer_annuel_ht_hc: { valeur: 34416, citation: 'Loyer annuel : 34 416 € HC/HT', confiance: 'haute' },
  },
  evaluation: {
    grille: [
      { champ: 'locataire_nom', critere: 'Locataire', attendu: 'renseigné', valeur: null, ok: false },
      { champ: 'emplacement', critere: 'Emplacement', attendu: '≠ à qualifier', valeur: 'à qualifier', ok: false, motif: 'Emplacement non qualifié : à valider visuellement avant décision.' },
      { champ: 'rendement_aem', critere: 'Rendement AEM', attendu: '≥ 6.5 %', valeur: '6.03 %', ok: false },
      { champ: 'occupe', critere: 'Bien occupé', attendu: '≠ non', valeur: 'oui', ok: true },
    ],
  },
};

test('un prix net vendeur sans honoraires chiffrés : le prix et le rendement passent à vérifier', () => {
  const n = notesDuLot(glacier);
  assert.equal(n.prix.a_verifier, true);
  assert.match(n.prix.textes[0], /^Prix net vendeur \(« Prix : 520 000 € Net vendeur »\), pas un prix FAI\. Les honoraires, à la charge du preneur, ne sont pas chiffrés : le FAI réel est plus haut\. Demander leur montant à l'agent\.$/);
  assert.equal(n.rendement.a_verifier, true);
  assert.match(n.rendement.textes.join(' '), /rendement réel sera plus bas/);
  assert.match(n.rendement.textes.join(' '), /Rendement AEM : 6\.03 %, attendu ≥ 6\.5 %\./);
});

test('les honoraires chiffrés donnent le FAI, sans réserve', () => {
  const lot = { lot: { ...glacier.lot, montant_honoraires: { valeur: 26000 } }, evaluation: { grille: [] } };
  const n = notesDuLot(lot);
  assert.equal(n.prix.a_verifier, false);
  assert.match(n.prix.textes[0], /520\s000 € plus 26\s000 € d'honoraires : 546\s000 € FAI/);
});

test('un prix FAI ordinaire ne fait aucune note', () => {
  const lot = { lot: { prix_fai: { valeur: 400000, citation: 'Prix FAI : 400 000 €' }, honoraires_inclus: { valeur: true } }, evaluation: { grille: [] } };
  assert.equal(netVendeurSansHonoraires(lot), null);
  assert.equal(notesDuLot(lot).prix, undefined);
});

test('le motif de la grille, le champ absent et la lecture peu sûre deviennent des notes', () => {
  const n = notesDuLot({ ...glacier, lot: { ...glacier.lot, occupe: { valeur: true, citation: 'semble loué', confiance: 'basse' } } });
  assert.deepEqual(n.emplacement.textes, ['Emplacement non qualifié : à valider visuellement avant décision.']);
  assert.deepEqual(n.enseigne.textes, ['Locataire absent de la fiche : à demander à l\'agent.']);
  assert.match(n.occupe.textes[0], /confiance basse \(« semble loué »\)/);
  assert.equal(n.occupe.a_verifier, true);
});
