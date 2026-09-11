// Data-B, transactions de fonds — ce que vaut le commerce, pas le mur.
//
// Aucune autre source ne donne cela aujourd'hui : sa chaîne n'a qu'un maillon.
// Elle est écrite comme les autres pour que le jour où une deuxième arrive, il
// n'y ait qu'une ligne à ajouter dans chaine.js.

import { transactionsFonds } from '../../data-b-transactions.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'data-b-transactions',
  service: 'Data-B',
  libelle: 'Data-B · Transactions de fonds de commerce',
  titre: 'les cessions de fonds',
  champ_lot: 'transactions_fonds',
  fournit: ['prix_fonds_commerce'],
  ecran: {
    court: 'Data-B — les cessions de fonds',
    ligne: 'Je relève les cessions de fonds',
    legende: "Ce qui s'est vendu autour du bien, à quel prix, pour quelles activités.",
  },

  async lire({ adresse, rayon = 500, forcer = false, user = null }) {
    const r = await transactionsFonds(adresse, { rayon, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Data-B', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    // La rue quand elle a assez de ventes pour dire quelque chose, sinon le
    // rayon. L'échelle suit le chiffre, elle ne se devine pas à l'écran.
    const surLaRue = r.rue && r.rue.avec_prix > 0;
    const m = surLaRue ? r.rue : r.marche;
    if (!m) return [];
    return [
      valeur({
        cle: 'prix_fonds_commerce',
        bas: m.prix_bas,
        median: m.prix_median,
        haut: m.prix_haut,
        echelle: surLaRue ? 'rue' : 'rayon',
        precision: [
          surLaRue ? r.rue.nom : r.rayon ? `rayon ${r.rayon}` : null,
          m.avec_prix ? `${m.avec_prix} cession(s) chiffrée(s)` : null,
        ].filter(Boolean).join(', ') || null,
        source: {
          connecteur: 'data-b-transactions',
          service: 'Data-B',
          libelle: r.source || 'Data-B · Transactions de fonds de commerce',
          collecte_le: r.le || null,
          du_cache: !!r.du_cache,
          lien: r.lien || null,
        },
      }),
    ];
  },
};
