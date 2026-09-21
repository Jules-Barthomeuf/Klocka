// La valeur locative à trois échelles — Equimmox à 200 m, 500 m et 1 km,
// et le loyer déduit des ventes DVF à côté.
//
// Ce n'est pas un doublon du connecteur equimmox : celui-là lit des locaux de
// surface comparable à 500 m, pour le bien ; celui-ci lit la rue, le quartier
// et la ville, tous locaux confondus, pour situer le bien dans son secteur.
// Les trois mailles sont rendues, la plus fine d'abord : c'est ce qui permet
// au recoupement de comparer la bonne.

import { valeurLocative } from '../../valeur-locative.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

// De la plus fine à la plus large.
const ECHELLES = ['rue', 'quartier', 'ville'];

export default {
  cle: 'valeur-locative',
  service: 'Equimmox',
  libelle: 'Equimmox · Valeur locative de la rue, du quartier, de la ville',
  titre: 'la valeur locative',
  champ_lot: 'valeur_locative',
  fournit: ['loyer_commercial_m2_an'],
  ecran: {
    court: 'Equimmox — la valeur locative du secteur',
    ligne: 'Je lis la valeur locative à trois échelles',
    legende: 'La rue, le quartier et la ville chez Equimmox, et le loyer déduit des ventes DVF à côté.',
  },

  async lire({ adresse, forcer = false, user = null }) {
    const r = await valeurLocative(adresse, { forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Equimmox', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const lignes = [];
    for (const echelle of ECHELLES) {
      const v = r[echelle];
      if (!v || (v.basse == null && v.haute == null)) continue;
      lignes.push(valeur({
        cle: 'loyer_commercial_m2_an',
        bas: v.basse,
        median: v.moyenne ?? null,
        haut: v.haute,
        echelle,
        precision: [v.nom, v.rayon, v.derive ? 'déduit des ventes' : null].filter(Boolean).join(', ') || null,
        // Un service à part de celui du connecteur equimmox : le recoupement
        // compare les services entre eux, et c'est bien le bien face à son
        // secteur qu'on veut comparer, pas Equimmox à lui-même.
        source: {
          connecteur: 'valeur-locative',
          service: v.derive ? 'DVF, déduit' : 'Equimmox, secteur',
          libelle: v.derive ? 'DVF · prix des murs × taux de rendement' : (r.source || 'Equimmox · Analyse de loyer'),
          collecte_le: r.le || null,
          du_cache: !!(r.du_cache || v.du_cache),
          lien: r.lien || null,
        },
      }));
    }
    return lignes;
  },
};
