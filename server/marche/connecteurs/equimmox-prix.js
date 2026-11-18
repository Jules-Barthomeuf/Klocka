// Equimmox — le prix des murs commerciaux autour de l'adresse, d'après les offres.
//
// 18 nov. 2026 (Jules : « pour le prix FAI utilise Equimmox ») : le prix demandé de la pré-analyse se compare aux
// annonces de murs de commerce d'Equimmox (Analyse de prix, mode Offre, classe Commerces, surface ±20 %), des prix FAI
// comme le sien. Pas le mode Transaction d'Equimmox : il est calculé sur DVF, déjà lu à part.

import { analysePrix } from '../../equimmox.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';
import { rayonEnMetres } from '../../../src/lib/echelles.js';

export default {
  cle: 'equimmox-prix',
  service: 'Equimmox',
  libelle: 'Equimmox · Analyse de prix',
  titre: 'le prix des murs',
  champ_lot: 'analyse_prix',
  fournit: ['prix_murs_commerce_m2'],
  ecran: {
    court: 'Equimmox — le prix des murs',
    ligne: 'Je lis le prix des murs sur Equimmox',
    legende: 'Les offres de murs de commerce autour, à surface comparable. Cela prend une minute.',
  },

  async lire({ adresse, surface = null, forcer = false, user = null }) {
    const r = await analysePrix(adresse, { surface, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Equimmox', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const surfaces = r.surface_min && r.surface_max ? `${r.surface_min}–${r.surface_max} m²` : null;
    return [
      valeur({
        cle: 'prix_murs_commerce_m2',
        bas: r.bas,
        median: r.moyenne,
        haut: r.haut,
        echelle: 'rayon',
        portee_m: rayonEnMetres(r.rayon),
        precision: [r.offres != null ? `${r.offres} offres` : null, r.rayon ? `rayon ${r.rayon}` : null, surfaces].filter(Boolean).join(', ') || null,
        source: { connecteur: 'equimmox-prix', service: 'Equimmox', libelle: r.source || 'Equimmox · Analyse de prix', collecte_le: r.le || null, du_cache: !!r.du_cache, lien: null },
      }),
    ];
  },
};
