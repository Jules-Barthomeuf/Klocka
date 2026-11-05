import test from 'node:test';
import assert from 'node:assert/strict';
import { couleurStatut } from '../src/lib/couleur-statut.js';

test('une couleur, un sens : le libellé décide, le gris par défaut', () => {
  const cas = {
    'Non proposé': 'gris', Prospects: 'gris', 'Fonds de commerce': 'gris', '': 'gris', 'Quelque chose': 'gris',
    Perdu: 'corail', Refusé: 'corail', 'Ne plus appeler': 'corail',
    'À relancer': 'ambre', 'Expire bientôt': 'ambre', Acquéreur: 'ambre', 'Stand-by': 'ambre',
    Contacté: 'bleu', 'En cours': 'bleu', 'Clients en cours': 'bleu', Négociation: 'bleu', Recherche: 'bleu',
    'Clients signés': 'menthe', Signé: 'menthe', Client: 'menthe', Oui: 'menthe',
    Proposé: 'lavande', Vendeur: 'lavande',
    Bureaux: 'turquoise', 'Local commercial': 'orchidee',
  };
  for (const [libelle, couleur] of Object.entries(cas)) assert.equal(couleurStatut(libelle), couleur, libelle);
});
