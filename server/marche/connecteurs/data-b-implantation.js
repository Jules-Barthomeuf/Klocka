// Data-B, étude d'implantation — l'emplacement, au-delà du loyer.
//
// Aucune autre source ne dit le flux piéton, les commerces du tronçon ou les
// CSP+ : sa chaîne n'a qu'un maillon. Le résultat brut, très riche, est posé
// tel quel sur le lot (champ_lot) ; seules les mesures comparables passent au
// format pivot.

import { etudeImplantation } from '../../data-b-implantation.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'data-b-implantation',
  service: 'Data-B',
  libelle: 'Data-B · Étude d\'implantation',
  titre: 'l\'emplacement',
  champ_lot: 'implantation',
  fournit: ['flux_pieton_note', 'flux_voiture_note', 'commercialite_troncon_note', 'revenu_moyen_annuel', 'csp_plus', 'proprietaires_zone'],
  ecran: {
    court: 'Data-B — l\'emplacement',
    ligne: 'Je lance une étude d\'implantation',
    legende: 'Le flux piéton et voiture, les commerces du tronçon, le revenu et les CSP+ du secteur. Une étude prend deux à trois minutes.',
  },

  async lire({ adresse, activite = null, forcer = false, user = null }) {
    const r = await etudeImplantation(adresse, { activite, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'Data-B', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r) return [];
    const source = {
      connecteur: 'data-b-implantation',
      service: 'Data-B',
      libelle: r.source || 'Data-B · Étude d\'implantation',
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: r.lien || null,
    };
    const note = (n) => (n && n.sur ? n.note : null);
    const pieton = r.flux_pieton;
    return [
      valeur({ cle: 'flux_pieton_note', median: note(pieton?.note), echelle: 'rue', precision: pieton?.par_heure?.haute ? `jusqu'à ${pieton.par_heure.haute.max} piétons / heure` : null, source }),
      valeur({ cle: 'flux_voiture_note', median: note(r.flux_voiture?.note), echelle: 'rue', source }),
      valeur({ cle: 'commercialite_troncon_note', median: note(r.troncon?.note), echelle: 'tronçon', precision: r.troncon?.libelle || null, source }),
      valeur({ cle: 'revenu_moyen_annuel', median: r.revenu?.revenu_moyen_annuel, echelle: 'zone', source }),
      valeur({ cle: 'csp_plus', median: r.revenu?.csp_plus, echelle: 'zone', source }),
      valeur({ cle: 'proprietaires_zone', median: r.zone_primaire?.proprietaires, echelle: 'zone', precision: '5 minutes à pied', source }),
    ].filter(Boolean);
  },
};
