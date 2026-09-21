// BODACC, cessions de fonds — ce que vaut le commerce, pas le mur.
//
// Le prix d'un fonds n'est pas au cadastre : il est dans l'annonce de vente
// que le greffe publie au BODACC, en clair. C'est la source que les services payants
// revendait ; on la lit directement, sans crédit.

import { cessionsAutour, RAYON_DEFAUT } from '../../cessions-fonds.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'bodacc-cessions',
  service: 'BODACC',
  libelle: 'BODACC · Cessions de fonds de commerce',
  titre: 'les cessions de fonds',
  champ_lot: 'transactions_fonds',
  fournit: ['prix_fonds_commerce'],
  ecran: {
    court: 'BODACC — les cessions de fonds',
    ligne: 'Je relève les cessions de fonds',
    legende: "Ce qui s'est vendu autour du bien, à quel prix, pour quelles activités.",
  },

  // 250 m : la fourchette des fonds se lit sur ce que la rue et ses abords
  // ont vendu, pas sur le quartier entier.
  async lire({ adresse, rayon = RAYON_DEFAUT, forcer = false, user = null }) {
    const r = await cessionsAutour(adresse, { rayon, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'BODACC', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    // La rue quand elle a assez de ventes pour dire quelque chose, sinon le
    // rayon. L'échelle suit le chiffre, elle ne se devine pas à l'écran.
    const surLaRue = r.rue && r.rue.avec_prix > 0;
    const m = surLaRue ? r.rue : r.marche;
    if (!m || !m.avec_prix) return [];
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
          r.pertinentes?.length ? `${r.pertinentes.length} retenue(s) par proximité et date` : null,
        ].filter(Boolean).join(', ') || null,
        source: {
          connecteur: 'bodacc-cessions',
          service: 'BODACC',
          libelle: r.source || 'BODACC · Cessions de fonds de commerce',
          collecte_le: r.le || null,
          du_cache: !!r.du_cache,
          lien: r.lien || null,
        },
      }),
    ];
  },
};
