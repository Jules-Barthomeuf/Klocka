// L'étude d'implantation, en interne — l'emplacement, au-delà du loyer.
//
// Flux piéton et voiture estimés, la rue et le tronçon d'après Sirene et
// OpenStreetMap, la démographie et le revenu des zones à pied d'après l'INSEE.
// Gratuit, quelques minutes la première fois (le registre d'une grande ville
// se lit page par page), puis trente jours de cache. Le résultat brut, très
// riche, est posé tel quel sur le lot (champ_lot) ; seules les mesures
// comparables passent au format pivot.

import { etudeImplantation, SOURCE } from '../../implantation/etude.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'implantation',
  service: 'Klocka',
  libelle: 'Klocka · Étude d\'implantation',
  titre: 'l\'emplacement',
  champ_lot: 'implantation',
  fournit: ['flux_pieton_note', 'flux_voiture_note', 'commercialite_troncon_note', 'revenu_moyen_annuel', 'csp_plus', 'proprietaires_zone'],
  ecran: {
    court: 'Klocka — l\'emplacement',
    ligne: 'Je lance l\'étude d\'implantation',
    legende: 'Le flux piéton et voiture estimés, les commerces du tronçon, le revenu et les CSP+ des zones à pied. Sources ouvertes : Sirene, OpenStreetMap, IGN, INSEE.',
  },

  async lire({ adresse, activite = null, forcer = false }) {
    const r = await etudeImplantation(adresse, { activite, forcer });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Klocka', classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const source = {
      connecteur: 'implantation',
      service: 'Klocka',
      libelle: r.source || SOURCE,
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: null,
    };
    const note = (n) => (n && n.sur ? n.note : null);
    const pieton = r.flux_pieton;
    return [
      valeur({ cle: 'flux_pieton_note', median: note(pieton?.note), echelle: 'rue', precision: pieton?.par_heure?.haute ? `estimé, jusqu'à ${pieton.par_heure.haute.max} piétons / heure` : 'estimé', source }),
      valeur({ cle: 'flux_voiture_note', median: note(r.flux_voiture?.note), echelle: 'rue', precision: 'estimé', source }),
      valeur({ cle: 'commercialite_troncon_note', median: note(r.troncon?.note), echelle: 'tronçon', precision: r.troncon?.libelle || null, source }),
      valeur({ cle: 'revenu_moyen_annuel', median: r.revenu?.revenu_moyen_annuel, echelle: 'zone', precision: '15 minutes à pied', source }),
      valeur({ cle: 'csp_plus', median: r.revenu?.csp_plus, echelle: 'zone', precision: '15 minutes à pied', source }),
      valeur({ cle: 'proprietaires_zone', median: r.zone_primaire?.proprietaires, echelle: 'zone', precision: '5 minutes à pied, ménages propriétaires', source }),
    ].filter(Boolean);
  },
};
