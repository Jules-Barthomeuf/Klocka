// Le mail des nouveautés (16 oct. 2026, Jules : « un mail récapitulatif chaque
// jour pour leur expliquer les nouveautés de la plateforme »). Chaque matin vers
// 8 h, si la plateforme a changé depuis le dernier mail, l'équipe reçoit les
// nouveautés (src/lib/nouveautes.js, les mêmes que la fenêtre « Quoi de neuf »),
// une par ligne, avec le lien pour les essayer. Sur Render seulement (ou
// NOUVEAUTES_MAIL=true) ; un jour sans nouveauté, rien ne part.

import { Records, Meta } from './db.js';
import { NOUVEAUTES } from '../src/lib/nouveautes.js';

const CLE = 'nouveautes:mail:dernier_jour';
const jourParis = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const heureParis = (d = new Date()) => Number(d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });

/** Pure : les journées à annoncer, celles d'avant aujourd'hui pas encore envoyées (sept jours au plus), dans l'ordre. */
export function journeesAEnvoyer(dernier, aujourdhui, nouveautes = NOUVEAUTES) {
  const limite = new Date(new Date(`${aujourdhui}T12:00:00Z`).getTime() - 7 * 86400000).toISOString().slice(0, 10);
  return nouveautes.filter((j) => j.jour < aujourdhui && j.jour >= limite && (!dernier || j.jour > dernier) && j.items?.length).sort((a, b) => a.jour.localeCompare(b.jour));
}

/** Pure : les variables du mail. */
export function contenuMail(journees, { lien = 'https://app.klocka.immo' } = {}) {
  const items = journees.flatMap((j) => j.items);
  const quand = journees.length === 1 ? jourLong(journees[0].jour) : `depuis ${jourLong(journees[0].jour)}`;
  return {
    objet: `Klocka : ${items.length} nouveauté${items.length > 1 ? 's' : ''} ${journees.length === 1 ? `de ${jourLong(journees[0].jour)}` : 'cette semaine'}`,
    titre: 'Quoi de neuf sur Klocka',
    intro: `Ce qui a changé ${quand}, en une ligne chacun. Tout est déjà en ligne.`,
    liste: items.map((x) => `**${x.titre}** · ${x.texte}`).join('\n\n'),
    lien,
  };
}

/** Pure : l'équipe qui reçoit le mail (les admins, sans les comptes de test). */
export function destinataires(users = Records.list('User')) {
  return users.filter((u) => u.role === 'admin' && u.email && !u.essai && !/(\.local$|test|stress|example|\.invalid$)/i.test(u.email)).map((u) => String(u.email).toLowerCase());
}

/** Envoie le mail du jour s'il y a des nouveautés pas encore annoncées. Rend ce qui a été fait. */
export async function envoyerSiNouveau({ maintenant = new Date(), envoyer = null } = {}) {
  const aujourdhui = jourParis(maintenant);
  const journees = journeesAEnvoyer(Meta.get(CLE), aujourdhui);
  if (!journees.length) return { envoye: 0, raison: 'rien de nouveau' };
  const { envoyerPlateforme } = await import('./emailing/index.js');
  const { URL_CANONIQUE } = await import('./contexte.js');
  const vars = contenuMail(journees, { lien: `${URL_CANONIQUE}/TableauDeBord` });
  let envoye = 0;
  for (const a of destinataires()) {
    try { const r = await (envoyer || envoyerPlateforme)('nouveautes_du_jour', { a, vars }); if (r?.ok) envoye += 1; } catch (e) { console.warn(`[nouveautés] ${a} : ${e?.message || e}`); }
  }
  // La journée est annoncée, même si un envoi a raté : on ne renvoie pas le lendemain à ceux qui l'ont reçu.
  Meta.set(CLE, journees.at(-1).jour);
  return { envoye, journees: journees.map((j) => j.jour) };
}

export function planifier() {
  const auto = !!process.env.RENDER || process.env.NOUVEAUTES_MAIL === 'true';
  if (!auto) return null;
  const tour = async () => {
    if (heureParis() < 8) return;
    try { const r = await envoyerSiNouveau(); if (r.envoye) console.log(`[nouveautés] mail envoyé à ${r.envoye} personne(s) : ${r.journees.join(', ')}`); } catch (e) { console.error('[nouveautés] mail impossible :', e?.message || e); }
  };
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(tour, 90 * 1000).unref?.();
  return t;
}
