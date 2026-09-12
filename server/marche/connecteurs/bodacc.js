// BODACC — ce qui ouvre, se vend et ferme dans la rue.
//
// Le seul indicateur du module qui ne soit pas un prix. Il répond à une
// question que les loyers ne posent jamais : cette rue tient-elle ? Deux
// artères au même loyer ne se valent pas si l'une a vu trois liquidations en
// dix-huit mois.

import { vitaliteCommerciale } from '../../bodacc.js';
import { ErreurSource } from '../erreurs.js';
import { valeur } from '../normalise.js';

export default {
  cle: 'bodacc',
  service: 'BODACC',
  libelle: 'BODACC · Annonces commerciales',
  titre: 'la vitalité de la rue',
  champ_lot: 'vitalite_rue',
  fournit: ['fermetures_rue', 'creations_rue'],
  ecran: {
    court: 'BODACC — la vie de la rue',
    ligne: 'Je lis le BODACC',
    legende: 'Les créations, cessions, procédures collectives et radiations publiées sur cette rue depuis deux ans.',
  },

  async lire({ adresse, mois = 24, forcer = false, user = null }) {
    const r = await vitaliteCommerciale(adresse, { mois, forcer, user });
    if (!r.ok) throw new ErreurSource(r.error, { service: 'BODACC', statut: r.statut ?? null, classe: r.classe ?? null });
    return r.resultat;
  },

  normaliser(r) {
    if (!r?.sur_la_rue) return [];
    const source = {
      connecteur: 'bodacc',
      service: 'BODACC',
      libelle: r.source || 'BODACC · Annonces commerciales',
      collecte_le: r.le || null,
      du_cache: !!r.du_cache,
      lien: r.lien || null,
    };
    const precision = [r.rue, `${r.mois} mois`].filter(Boolean).join(', ');
    // Un décompte n'a ni fourchette ni médiane : c'est un nombre exact. Il
    // voyage dans `median` parce que c'est la seule borne qui se lise seule.
    return [
      valeur({ cle: 'fermetures_rue', median: r.sur_la_rue.fermetures, echelle: 'rue', precision, source }),
      valeur({ cle: 'creations_rue', median: r.sur_la_rue.creations, echelle: 'rue', precision, source }),
    ].filter(Boolean);
  },
};
