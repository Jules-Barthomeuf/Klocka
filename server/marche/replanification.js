// « Je repasserai plus tard » — et on repasse vraiment.
//
// Une panne d'Equimmox à onze heures est souvent réparée à midi. Sans
// replanification, la lecture reste incomplète jusqu'à ce que quelqu'un
// repense à cliquer ; avec, elle se complète toute seule et l'utilisateur
// trouve ses chiffres en revenant.
//
// Deux reprises, à une demi-heure puis à deux heures, et on s'arrête : au-delà
// ce n'est plus un hoquet, c'est une panne qui mérite un humain. Seules les
// erreurs temporaires donnent lieu à une reprise — un compte refusé ne se
// répare pas en attendant.
//
// La date de reprise est écrite dans le journal, pas seulement posée dans un
// minuteur : un serveur qui redémarre reprend ses promesses là où il les a
// laissées (voir `reprendreLesPromesses`, appelée au démarrage).

import { completer, reprisesEnAttente } from './journal.js';

/** Les délais des reprises successives, en minutes. */
export const DELAIS_MIN = [30, 120];

const minuteries = new Map();
const cleDe = (dealId, index) => `${dealId}|${index}`;

/**
 * Programme une reprise, s'il en reste une à programmer.
 * @param {object} p - { dealId, index, essai, journalId, user }
 * @returns {string|null} la date de la reprise, ou null s'il n'y en aura pas
 */
export function planifier({ dealId, index = 0, essai = 1, journalId = null, user = null }) {
  const minutes = DELAIS_MIN[essai - 1];
  if (minutes == null) return null;

  const cle = cleDe(dealId, index);
  clearTimeout(minuteries.get(cle));
  const quand = new Date(Date.now() + minutes * 60000).toISOString();

  const m = setTimeout(() => {
    minuteries.delete(cle);
    if (journalId) completer(journalId, { reprise_faite: true });
    // Import tardif : alex connaît la replanification, la replanification ne
    // doit pas connaître alex au chargement.
    import('../alex.js')
      .then(({ lancerRechercheMarche }) =>
        lancerRechercheMarche(dealId, index, { user, essai: essai + 1, forcer: true, automatique: true })
      )
      .catch((e) => console.warn('[marche] reprise impossible :', e?.message || e));
  }, minutes * 60000);
  // Une reprise ne doit pas retenir le processus à l'arrêt.
  m.unref?.();
  minuteries.set(cle, m);

  if (journalId) completer(journalId, { nouvelle_tentative_le: quand, reprise_faite: false });
  console.log(`[marche] lecture incomplète pour ${dealId} — reprise dans ${minutes} min`);
  return quand;
}

/** Annule la reprise d'un lot : la lecture a fini par aboutir. */
export function annuler(dealId, index = 0) {
  const cle = cleDe(dealId, index);
  clearTimeout(minuteries.get(cle));
  minuteries.delete(cle);
}

/**
 * Au démarrage : reprogramme ce qui avait été promis avant l'arrêt. Une
 * échéance déjà passée part tout de suite, décalée d'une minute pour laisser
 * le serveur finir de s'ouvrir.
 * @returns {number} le nombre de reprises reprogrammées
 */
export function reprendreLesPromesses() {
  let n = 0;
  for (const j of reprisesEnAttente()) {
    const retard = Date.parse(j.nouvelle_tentative_le) - Date.now();
    const dans = Number.isFinite(retard) ? Math.max(retard, 60000) : 60000;
    const cle = cleDe(j.deal_id, j.lot_index || 0);
    clearTimeout(minuteries.get(cle));
    const m = setTimeout(() => {
      minuteries.delete(cle);
      completer(j.id, { reprise_faite: true });
      import('../alex.js')
        .then(({ lancerRechercheMarche }) =>
          lancerRechercheMarche(j.deal_id, j.lot_index || 0, { essai: (j.essai || 1) + 1, forcer: true, automatique: true })
        )
        .catch(() => {});
    }, dans);
    m.unref?.();
    minuteries.set(cle, m);
    n++;
  }
  if (n) console.log(`[marche] ${n} lecture(s) de marché à reprendre`);
  return n;
}

/** Les reprises actuellement en attente, pour l'écran d'administration. */
export const reprisesArmees = () => [...minuteries.keys()];
