// Le mail des nouveautés (16 oct. 2026, Jules : « un mail récapitulatif chaque
// jour pour leur expliquer les nouveautés de la plateforme »). Chaque matin vers
// 8 h, si la plateforme a changé depuis le dernier mail, l'équipe reçoit les
// nouveautés (src/lib/nouveautes.js, les mêmes que la fenêtre « Quoi de neuf »),
// une par ligne, avec le lien pour les essayer. Du lundi au vendredi seulement
// (Jules, 16 oct. 2026) : le lundi reprend tout depuis le dernier mail, donc le
// vendredi et le week-end. Sur Render seulement (ou NOUVEAUTES_MAIL=true) ; un
// jour sans nouveauté, rien ne part.

import { Records, Meta } from './db.js';
import { NOUVEAUTES } from '../src/lib/nouveautes.js';

const CLE = 'nouveautes:mail:dernier_jour';
const jourParis = (d = new Date()) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
const heureParis = (d = new Date()) => Number(d.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }));
// 0 = dimanche, 6 = samedi, à Paris.
const jourSemaine = (d = new Date()) => new Date(`${jourParis(d)}T12:00:00Z`).getUTCDay();
export const ouvre = (d = new Date()) => ![0, 6].includes(jourSemaine(d));
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
    objet: `Klocka : ${items.length} nouveauté${items.length > 1 ? 's' : ''} ${journees.length === 1 ? `de ${jourLong(journees[0].jour)}` : `depuis ${jourLong(journees[0].jour)}`}`,
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

const MOTIFS = { point_mensuel: 'point mensuel', fiche_non_recue: 'fiche non reçue', retenu: 'bien retenu', refuse: 'bien refusé', engagement: 'engagement', retenter: 'à retenter' };
const premierMot = (e) => String(e || '').split('@')[0].split('.')[0].replace(/^\w/, (c) => c.toUpperCase());
const pluriel = (n, mot, pl = `${mot}s`) => `${n} ${n > 1 ? pl : mot}`;

/**
 * Pure : les relances du jour d'une personne. Une relance revient à l'analyste qui a appelé l'agent en premier ;
 * celles sans propriétaire sont comptées pour tous, sans nom.
 * @param {Array<{agent_id?: string, nom?: string, agence?: string, motif?: string}>} lignes
 */
export function relancesDe(email, lignes = [], proprietaireDe = () => null) {
  const moi = String(email || '').toLowerCase();
  const miennes = []; let sansProprietaire = 0;
  for (const l of lignes) {
    const p = proprietaireDe(l.agent_id);
    if (p === moi) miennes.push(l); else if (!p) sansProprietaire += 1;
  }
  return { miennes, sansProprietaire };
}

/** Pure : ce qu'il y a à faire dans les dossiers d'une personne (« À toi d'agir »), et ce qui attend un tiers. */
export function dossiersAFaire(email, dossiers = [], classer) {
  const r = classer(dossiers, email);
  return { toi: r.toi, tiers: r.tiers.length };
}

/** Pure : le texte des trois parties, seulement celles qui ont quelque chose à dire. */
export function contenuJournee({ journees = [], relances = { miennes: [], sansProprietaire: 0 }, dossiers = { toi: [], tiers: 0 }, prenom = '', lien = 'https://app.klocka.immo', aujourdhui = jourParis() }) {
  const parties = [];
  const nouveautes = journees.flatMap((j) => j.items);
  if (nouveautes.length) parties.push(`**NOUVEAU SUR KLOCKA**\n\n${nouveautes.map((x) => `**${x.titre}** · ${x.texte}`).join('\n\n')}`);
  const nb = relances.miennes.length;
  if (nb || relances.sansProprietaire) {
    const lignes = relances.miennes.slice(0, 10).map((l) => `**${l.nom || 'Agent'}**${l.agence ? ` (${l.agence})` : ''} · ${MOTIFS[l.motif] || l.motif || 'relance'}`);
    if (nb > 10) lignes.push(`et ${nb - 10} de plus, dans Appels`);
    if (relances.sansProprietaire) lignes.push(`${pluriel(relances.sansProprietaire, 'relance')} sans propriétaire : à qui le veut, dans Appels`);
    parties.push(`**RELANCES À FAIRE AUJOURD'HUI**${nb ? ` · ${nb}` : ''}\n\n${lignes.join('\n\n')}`);
  }
  if (dossiers.toi.length || dossiers.tiers) {
    const lignes = dossiers.toi.slice(0, 8).map((d) => `**${d.titre || d.deal_id}** · ${d.pourquoi}`);
    if (dossiers.toi.length > 8) lignes.push(`et ${dossiers.toi.length - 8} de plus, dans Dossiers`);
    if (dossiers.tiers) lignes.push(`${pluriel(dossiers.tiers, 'dossier attend', 'dossiers attendent')} une réponse d'un tiers (documents demandés à l'agent)`);
    parties.push(`**À FAIRE DANS DOSSIERS**${dossiers.toi.length ? ` · ${dossiers.toi.length}` : ''}\n\n${lignes.join('\n\n')}`);
  }
  if (!parties.length) return null;
  const faits = [nouveautes.length && pluriel(nouveautes.length, 'nouveauté'), nb && pluriel(nb, 'relance'), dossiers.toi.length && pluriel(dossiers.toi.length, 'dossier')].filter(Boolean);
  return {
    objet: `Klocka, ${jourLong(aujourdhui)} : ${faits.join(', ')}`,
    titre: `Bonjour${prenom ? ` ${prenom}` : ''}, votre journée`,
    intro: `Ce qui vous attend ce ${jourLong(aujourdhui)} : ${faits.join(', ')}.`,
    contenu: parties.join('\n\n'),
    lien,
  };
}

/**
 * Le mail « Ma journée » (18 oct. 2026, Jules) : chaque matin ouvré, à chaque personne de l'équipe, les nouveautés
 * pas encore annoncées (la fenêtre « Quoi de neuf » n'existe plus), ses relances du jour et ce qu'il y a à faire dans
 * Dossiers. Rien ne part pour quelqu'un dont les trois parties sont vides. Une fois par jour et par personne.
 * Rend ce qui a été fait.
 */
export async function envoyerSiNouveau({ maintenant = new Date(), envoyer = null, relances = null, dossiers = null } = {}) {
  // Ni le samedi ni le dimanche : le lundi rattrape les nouveautés.
  if (!ouvre(maintenant)) return { envoye: 0, raison: 'week-end' };
  const aujourdhui = jourParis(maintenant);
  // Le tour tourne toutes les 15 minutes : un passage complet fait aujourd'hui n'est pas refait.
  if (Meta.get(`${CLE}:passe`) === aujourdhui) return { envoye: 0, raison: 'déjà fait' };
  // Plus de tour des nouveautés dans le mail (22 oct. 2026, Jules : « enlève le truc de mails automatiques pour faire le
  // tour d'horizon des nouveautés ») : restent les relances du jour et les dossiers. NOUVEAUTES_DANS_LE_MAIL=true les remet.
  const journees = process.env.NOUVEAUTES_DANS_LE_MAIL === 'true' ? journeesAEnvoyer(Meta.get(CLE), aujourdhui) : [];
  const { envoyerPlateforme } = await import('./emailing/index.js');
  const { URL_CANONIQUE } = await import('./contexte.js');
  const { classer } = await import('../src/lib/dossiers-architecture.js');
  const { proprietaireDeLAgent } = await import('./haka/competences/relances-matin.js');
  const lignesRelances = relances ? await relances() : (await (await import('./prospection/relances.js')).relances({ maintenantD: maintenant })).lignes || [];
  const listeDossiers = dossiers ? await dossiers() : (await import('./deal/index.js')).listerDossiers(200);
  const dejaPartis = new Set((Meta.get(`${CLE}:partis`) || '').split(',').filter(Boolean));
  const jourPartis = Meta.get(`${CLE}:partis:jour`);
  if (jourPartis !== aujourdhui) dejaPartis.clear();
  const utilisateurs = Records.list('User');
  let envoye = 0; let rates = 0;
  for (const a of destinataires(utilisateurs)) {
    if (dejaPartis.has(a)) continue;
    const u = utilisateurs.find((x) => String(x.email).toLowerCase() === a);
    const vars = contenuJournee({
      journees, relances: relancesDe(a, lignesRelances, (id) => proprietaireDeLAgent(id, { users: utilisateurs })),
      dossiers: dossiersAFaire(a, listeDossiers, classer), prenom: premierMot(u?.full_name || a), lien: `${URL_CANONIQUE}/TableauDeBord`, aujourdhui,
    });
    if (!vars) continue;
    try { const r = await (envoyer || envoyerPlateforme)('ma_journee', { a, vars }); if (r?.ok) { envoye += 1; dejaPartis.add(a); } else rates += 1; } catch (e) { rates += 1; console.warn(`[ma journée] ${a} : ${e?.message || e}`); }
  }
  Meta.set(`${CLE}:partis`, [...dejaPartis].join(','));
  Meta.set(`${CLE}:partis:jour`, aujourdhui);
  // Les nouveautés sont annoncées, même si un envoi a raté : on ne les renvoie pas le lendemain à ceux qui les ont reçues.
  if (journees.length) Meta.set(CLE, journees.at(-1).jour);
  // Tous servis (ou rien à servir) : le passage du jour est fait ; un envoi raté sera retenté au tour suivant.
  if (!rates) Meta.set(`${CLE}:passe`, aujourdhui);
  if (!envoye && !journees.length) return { envoye: 0, raison: 'rien à dire' };
  return { envoye, journees: journees.map((j) => j.jour) };
}

export function planifier() {
  const auto = !!process.env.RENDER || process.env.NOUVEAUTES_MAIL === 'true';
  if (!auto) return null;
  const tour = async () => {
    if (heureParis() < 8) return;
    try { const r = await envoyerSiNouveau(); if (r.envoye) console.log(`[ma journée] mail envoyé à ${r.envoye} personne(s)`); } catch (e) { console.error('[nouveautés] mail impossible :', e?.message || e); }
  };
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(tour, 90 * 1000).unref?.();
  return t;
}
