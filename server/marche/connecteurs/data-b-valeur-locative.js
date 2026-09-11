// Data-B, valeurs locatives — le repli sur le loyer commercial.
//
// Ce n'est pas la même mesure qu'Equimmox : Data-B estime, Equimmox constate.
// Mais c'est la même unité, la même adresse et la même question — « combien se
// loue le mètre carré ici » — et une estimation datée et sourcée vaut mieux
// qu'une case vide quand Equimmox est à terre.
//
// On prend la maille la plus fine que la page donne : la rue si elle y est,
// sinon le quartier, sinon la ville. Jamais la ville en la faisant passer pour
// la rue : l'échelle voyage avec le chiffre.

import { valeurLocative } from '../../data-b.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

// De la plus fine à la plus large.
const ECHELLES = ['rue', 'quartier', 'ville'];

export default {
  cle: 'data-b-valeur-locative',
  service: 'Data-B',
  libelle: 'Data-B · Valeurs locatives',
  titre: 'la valeur locative',
  champ_lot: 'valeur_locative',
  fournit: ['loyer_commercial_m2_an'],
  ecran: {
    court: 'Data-B — la valeur locative',
    ligne: 'Je me connecte sur Data-B',
    legende: "J'ouvre Valeurs locatives et je relève la fourchette de loyer de la rue, du quartier et de la ville.",
  },

  async lire({ adresse, forcer = false, user = null }) {
    const r = await valeurLocative(adresse, { forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Data-B', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const niveau = ECHELLES.map((e) => [e, r[e]]).find(([, v]) => v && (v.basse != null || v.haute != null));
    if (!niveau) return [];
    const [echelle, v] = niveau;
    return [
      valeur({
        cle: 'loyer_commercial_m2_an',
        bas: v.basse,
        // Data-B ne publie pas de médiane : elle reste vide plutôt que d'être
        // fabriquée en prenant le milieu de la fourchette.
        median: null,
        haut: v.haute,
        echelle,
        precision: v.nom || null,
        source: {
          connecteur: 'data-b-valeur-locative',
          service: 'Data-B',
          libelle: r.source || 'Data-B · Valeurs locatives',
          collecte_le: r.le || null,
          du_cache: !!r.du_cache,
          lien: r.lien || null,
        },
      }),
    ];
  },
};
