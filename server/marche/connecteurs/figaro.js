// Le Figaro Immobilier — le résidentiel, comme point de comparaison.
//
// Pages publiques, sans compte : c'est la source la plus robuste des quatre.
// Elle ne remplace aucune autre — le résidentiel n'est pas du commerce — mais
// elle a sa place dans le format pivot, avec ses deux échelles.

import { prixResidentiel } from '../../figaro.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'figaro',
  service: 'Le Figaro',
  libelle: 'Le Figaro Immobilier',
  titre: 'le marché résidentiel',
  champ_lot: 'prix_residentiel',
  fournit: ['prix_residentiel_m2', 'loyer_residentiel_m2_mois'],
  ecran: {
    court: 'Le Figaro — le résidentiel',
    ligne: 'Je finis par Le Figaro Immobilier',
    legende: "Le prix et le loyer d'un appartement, au quartier puis à la commune.",
  },

  async lire({ adresse, forcer = false, user = null }) {
    const r = await prixResidentiel(adresse, { forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Le Figaro', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    // Le quartier d'abord : la moyenne d'une commune ne dit rien d'une rue.
    const niveau = [['quartier', r.quartier], ['commune', r.commune]].find(([, v]) => v);
    if (!niveau) return [];
    const [echelle, v] = niveau;
    const source = {
      connecteur: 'figaro',
      service: 'Le Figaro',
      libelle: r.source || 'Le Figaro Immobilier',
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: v.lien || r.lien || null,
    };
    return [
      valeur({
        cle: 'prix_residentiel_m2',
        bas: v.prix?.bas,
        median: v.prix?.median,
        haut: v.prix?.haut,
        echelle,
        precision: v.nom || null,
        source,
      }),
      valeur({
        cle: 'loyer_residentiel_m2_mois',
        bas: v.loyer?.bas,
        median: v.loyer?.median,
        haut: v.loyer?.haut,
        echelle,
        precision: v.nom || null,
        source,
      }),
    ];
  },
};
