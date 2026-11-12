// Le témoin d'Equimmox (12 nov. 2026, Jules : « que la partie Loyer soit fiable à 100 % et que ça ne casse pas »).
//
// Le Loyer lit Equimmox avec un robot : si Equimmox change sa page, le robot casse sans que rien ne le dise. Une fois
// par jour, au premier Loyer lancé, le robot relit une adresse témoin dont on connaît les chiffres (KFC Lyon, la rue à
// 200 m), après la lecture en cours, jamais avant. S'il échoue, ou si la moyenne bouge de plus d'un quart, Jules le
// voit dans la cloche, avec la capture de la page. Pas de contrôle de nuit (coupés le 16 oct.), pas de mail.

import { Records } from './db.js';

export const ENTITE = 'EquimmoxTemoin';
export const TEMOIN = { adresse: '12 Rue de la République 69002 Lyon', rayon: 200 };
const ECART_MAX = 25;

const jourDe = (d = new Date()) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });

/**
 * Pure : le verdict du témoin. `lu` : la réponse d'Equimmox pour le rayon témoin ; `avant` : la moyenne du dernier
 * témoin réussi. Rend { statut: 'ok' | 'echec' | 'ecart', ecart?, phrase }.
 */
export function jugerTemoin(lu, avant = null) {
  if (!lu?.ok) return { statut: 'echec', phrase: `Le robot n'a pas lu l'adresse témoin : ${lu?.error || 'pas de réponse'}.` };
  const m = lu.resultat?.moyenne ?? null;
  if (!(m > 0)) return { statut: 'echec', phrase: "Equimmox n'a rendu aucune moyenne pour l'adresse témoin." };
  if (!(avant > 0)) return { statut: 'ok', ecart: null, phrase: `Moyenne lue : ${m} €/m²/an (premier témoin).` };
  const ecart = Math.round(((m / avant) - 1) * 100);
  if (Math.abs(ecart) > ECART_MAX) return { statut: 'ecart', ecart, phrase: `La moyenne de l'adresse témoin passe de ${avant} à ${m} €/m²/an (${ecart > 0 ? '+' : ''}${ecart} %) : Equimmox a peut-être changé sa page, ou ses données.` };
  return { statut: 'ok', ecart, phrase: `Moyenne lue : ${m} €/m²/an, comme la veille (${ecart > 0 ? '+' : ''}${ecart} %).` };
}

let enCours = null;

/** Le témoin du jour, une fois : lancé sans attendre, il passe dans la file d'Equimmox après la lecture en cours. */
export function verifierTemoinDuJour({ maintenant = new Date() } = {}) {
  if (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT || process.env.EQUIMMOX_TEMOIN === '0') return null;
  const jour = jourDe(maintenant);
  if (enCours || Records.filter(ENTITE, { jour }).length) return enCours;
  const trace = Records.create(ENTITE, { jour, statut: 'en_cours', le: maintenant.toISOString() });
  enCours = (async () => {
    const { analyseLoyerRayons, equimmoxConfigure } = await import('./equimmox.js');
    if (!equimmoxConfigure()) return Records.update(ENTITE, trace.id, { statut: 'non_configure' });
    const avant = Records.list(ENTITE).filter((x) => x.statut === 'ok' && x.moyenne > 0).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    const lu = (await analyseLoyerRayons(TEMOIN.adresse, [TEMOIN.rayon], { forcer: true }).catch((e) => ({ [TEMOIN.rayon]: { ok: false, error: e?.message || String(e) } })))[TEMOIN.rayon];
    const v = jugerTemoin(lu, avant?.moyenne ?? null);
    const capture = lu?.resultat?.capture || lu?.capture || null;
    Records.update(ENTITE, trace.id, { statut: v.statut, moyenne: lu?.resultat?.moyenne ?? null, ecart: v.ecart ?? null, phrase: v.phrase, capture, fini_le: new Date().toISOString() });
    if (v.statut !== 'ok') {
      const { notifier } = await import('./notifications.js');
      notifier({
        titre: v.statut === 'echec' ? "Equimmox : le témoin du jour n'a pas été lu" : 'Equimmox : le témoin du jour a changé',
        texte: `${v.phrase} Les Loyers lancés aujourd'hui peuvent être touchés.`,
        lien: capture, action: capture ? 'Voir la page' : null, genre: 'alerte', cle: `temoin-equimmox:${jour}`,
      });
    }
    console.log(`[equimmox] témoin du ${jour} : ${v.statut} — ${v.phrase}`);
    return v;
  })().catch((e) => { Records.update(ENTITE, trace.id, { statut: 'echec', phrase: e?.message || String(e) }); return null; })
    .finally(() => { enCours = null; });
  return enCours;
}
