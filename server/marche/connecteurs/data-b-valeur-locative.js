// Data-B, valeurs locatives — le repli sur le loyer commercial.
//
// Ce n'est pas la même mesure qu'Equimmox : Data-B estime, Equimmox constate.
// Mais c'est la même unité, la même adresse et la même question — « combien se
// loue le mètre carré ici » — et une estimation datée et sourcée vaut mieux
// qu'une case vide quand Equimmox est à terre.
//
// La page donne jusqu'à TROIS mailles : la rue, le quartier, la ville. On les
// rend toutes les trois, dans cet ordre — la plus fine d'abord, parce que
// c'est elle qui remplit l'indicateur (voir poser() dans normalise.js).
//
// Les rendre toutes n'est pas du zèle : c'est ce qui permet au recoupement de
// comparer la bonne. Sur le 93 avenue Marceau, la rue vaut 640–960 et le
// quartier 272–408 ; face au rayon de 500 m d'Equimmox (277), comparer la rue
// donnait +189 % et comparer le quartier donne +23 %. Le premier écart n'a
// jamais existé ailleurs que dans le choix de la maille.
//
// Ces trois lectures servent aussi à voir quand la source se contredit
// elle-même : une rue à 2,4 fois son propre quartier n'est plus une question
// d'échelle.

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
    const source = {
      connecteur: 'data-b-valeur-locative',
      service: 'Data-B',
      libelle: r.source || 'Data-B · Valeurs locatives',
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: r.lien || null,
    };
    return ECHELLES.map((echelle) => {
      const v = r[echelle];
      if (!v || (v.basse == null && v.haute == null)) return null;
      return valeur({
        cle: 'loyer_commercial_m2_an',
        bas: v.basse,
        // Data-B ne publie pas de médiane : elle reste vide plutôt que d'être
        // fabriquée en prenant le milieu de la fourchette.
        median: null,
        haut: v.haute,
        echelle,
        precision: v.nom || null,
        source,
      });
    }).filter(Boolean);
  },
};
