// DVF — les ventes réellement conclues autour du bien.
//
// La seule source du module qui ne parle pas de demandes. Elle ne remplace
// personne : elle donne un second point de vue sur le prix, indépendant du
// vendeur. C'est pourquoi elle a son propre besoin plutôt qu'une place dans la
// chaîne du loyer.

import { ventesAutour, N_MINIMUM } from '../../dvf.js';
import { ErreurSource, SANS_DONNEE } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'dvf',
  service: 'DVF',
  libelle: 'DVF · Valeurs foncières',
  titre: 'les ventes réelles',
  champ_lot: 'ventes_dvf',
  fournit: ['prix_local_commercial_m2'],
  ecran: {
    court: 'DVF — les ventes réelles',
    ligne: 'Je télécharge les valeurs foncières',
    legende: "Les ventes de locaux commerciaux des cinq dernières années autour de l'adresse, d'après les actes notariés transmis à la DGFiP.",
  },

  async lire({ adresse, rayon = 500, forcer = false, user = null }) {
    const r = await ventesAutour(adresse, { rayon, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'DVF', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    // Sous le seuil d'échantillon, l'indicateur n'existe pas. Une médiane sur
    // deux ventes se lit comme une médiane sur quarante, et ne vaut rien.
    if (!r?.prix_m2) return [];
    return [
      valeur({
        cle: 'prix_local_commercial_m2',
        bas: r.prix_m2.bas,
        median: r.prix_m2.median,
        haut: r.prix_m2.haut,
        echelle: 'rayon',
        portee_m: r.rayon,
        precision: [
          `${r.n} vente${r.n > 1 ? 's' : ''}`,
          r.periode ? `${String(r.periode.du).slice(0, 4)}–${String(r.periode.au).slice(0, 4)}` : null,
          r.rayon ? `rayon ${r.rayon} m` : null,
        ].filter(Boolean).join(', '),
        source: {
          connecteur: 'dvf',
          service: 'DVF',
          libelle: r.source || 'DVF · Valeurs foncières',
          collecte_le: r.le || null,
          du_cache: !!r.du_cache,
          lien: r.lien || null,
        },
      }),
    ];
  },

  /** Ce qu'on dit quand la source répond mais n'a pas de quoi conclure. */
  insuffisant(r) {
    if (!r || r.prix_m2) return null;
    return new ErreurSource(
      `DVF n'a que ${r.n} vente${r.n > 1 ? 's' : ''} de local commercial dans ${r.rayon} m (il en faut ${N_MINIMUM}) : aucune médiane n'est publiée.`,
      { service: 'DVF', classe: SANS_DONNEE }
    );
  },
};
