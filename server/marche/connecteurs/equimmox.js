// Equimmox — les baux comparables autour de l'adresse.
//
// La source de référence de l'équipe pour le loyer commercial : ce sont des
// baux réellement signés, à surface comparable, dans un rayon de cinq cents
// mètres. C'est pour cela qu'elle ouvre la chaîne.
//
// C'est aussi la plus fragile : un vrai navigateur, une application Bubble
// devant, et quinze étapes d'interface à franchir. Elle tombe plus souvent que
// les autres — d'où le repli derrière elle.

import { analyseLoyer } from '../../equimmox.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'equimmox',
  service: 'Equimmox',
  libelle: 'Equimmox · Analyse de loyer',
  titre: 'les loyers observés',
  // Le champ du lot où le résultat brut continue d'être rangé : les cartes de
  // l'onglet Marché le lisent là depuis toujours.
  champ_lot: 'analyse_loyer',
  fournit: ['loyer_commercial_m2_an'],
  ecran: {
    court: 'Equimmox — les loyers observés',
    ligne: 'Je passe sur Equimmox',
    legende: "Les baux comparables à cinq cents mètres, à surface équivalente. Cela prend une minute.",
  },

  async lire({ adresse, surface = null, forcer = false, user = null }) {
    const r = await analyseLoyer(adresse, { surface, forcer, user });
    // Le statut HTTP relevé par le scraper vaut mieux que son message : c'est
    // lui qui distingue un 502 d'un changement d'interface.
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Equimmox', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const source = {
      connecteur: 'equimmox',
      service: 'Equimmox',
      libelle: r.source || 'Equimmox · Analyse de loyer',
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: null,
    };
    const surfaces = r.surface_min && r.surface_max ? `${r.surface_min}–${r.surface_max} m²` : null;
    return [
      valeur({
        cle: 'loyer_commercial_m2_an',
        bas: r.bas,
        median: r.moyenne,
        haut: r.haut,
        echelle: 'rayon',
        precision: [r.rayon ? `rayon ${r.rayon}` : null, surfaces, r.classe].filter(Boolean).join(', ') || null,
        source,
      }),
    ];
  },
};
