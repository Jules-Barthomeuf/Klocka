// Les règles qui doivent toujours être vraies (9 oct. 2026), vérifiées
// chaque nuit : un rapport par mail chaque matin, « Tout est conforme » ou la
// liste des écarts avec les agents concernés. Si une règle casse, Jules le
// sait avant ses collègues. Le contrôle ne corrige rien : il dit.
//
// Et la qualité d'AK : la part des appels validés sans aucune correction
// (issue changée, champ corrigé, date ou mail retouché), semaine par semaine.

import { Records } from '../db.js';
import * as R from './regles.js';

const AGENCE = 'AgenceProspect';
const LISTE = 'ListeAgences';
const APPEL = 'AppelAgent';
const RAPPORT = 'ControleRegles';
const HEURE = 60 * 60 * 1000;
const MAX_DETAILS = 12;

const regle = (cle, titre, ecarts, { non_verifie = null } = {}) => ({ cle, titre, ok: !non_verifie && !ecarts.length, n: ecarts.length, details: ecarts.slice(0, MAX_DETAILS), non_verifie });

/**
 * Les neuf règles. Chacune rend { cle, titre, ok, n, details, non_verifie } ;
 * `non_verifie` dit pourquoi une règle n'a pas pu être lue (Monday absent).
 */
export async function controler({ maintenantD = new Date(), lireMonday = null } = {}) {
  const jour = R.jourDe(maintenantD);
  const listes = new Map(Records.list(LISTE).filter((l) => !l.essai).map((l) => [l.id, l]));
  const agences = Records.list(AGENCE).filter((a) => (a.liste_id ? listes.has(a.liste_id) : a.hors_liste) && !a.hors_cible);
  const fiches = Records.list('AgentImmo').filter((x) => !x.essai);
  const parId = new Map(fiches.map((x) => [x.id, x]));
  const appels = Records.list(APPEL).filter((x) => !x.essai && !x.essai_archive);
  const valides = appels.filter((x) => x.etat === 'valide');
  const appelesIds = new Set(valides.map((x) => x.agent_id));
  const MA = await import('./mode-appel.js');
  const RL = await import('./relances.js');
  const annotees = MA.annoter(agences, maintenantD);
  const nomDe = (a) => [a.nom, listes.get(a.liste_id)?.ville].filter(Boolean).join(', ');
  const regles = [];

  // 1. Une agence est à un seul endroit : jamais à la fois dans la file de la Prospection et dans Relances.
  const deuxEndroits = annotees.filter((a) => {
    const fiche = parId.get(a.carnet_id) || null;
    const enProspection = a.statut.etat === 'jamais' && !a.statut.appelee && !a.en_relance && !a.ne_plus_appeler && a.genre !== 'annonceur';
    return enProspection && RL.relanceDe({ agence: a, fiche, statut: a.statut, aJuger: [], jour });
  });
  regles.push(regle('un_seul_endroit', 'Une agence est à un seul endroit', deuxEndroits.map((a) => `${nomDe(a)} : dans la Prospection et dans Relances`)));

  // 2. Tout agent suivi a une prochaine relance (sauf « Ne plus appeler »). Suivi : appelé au moins une fois.
  const sansDate = fiches.filter((f) => appelesIds.has(f.id) && !f.ne_plus_appeler && f.statut !== 'archive' && !f.prochaine?.le);
  regles.push(regle('relance_pour_tous', 'Tout agent suivi a une prochaine relance', sansDate.map((f) => `${f.nom}${f.agence ? ` (${f.agence})` : ''} : aucune date de relance`)));

  // 3. « Ne plus appeler » est définitif : aucun dans Relances ni renvoyé en relance.
  const r = await RL.relances({ maintenantD });
  const npa = new Set(fiches.filter((f) => f.ne_plus_appeler || f.statut === 'archive').map((f) => f.id));
  const encore = [
    ...r.lignes.filter((x) => x.agent_id && npa.has(x.agent_id)).map((x) => `${x.nom || x.agence} : dans Relances malgré « Ne plus appeler »`),
    ...agences.filter((a) => a.ne_plus_appeler && a.en_relance).map((a) => `${nomDe(a)} : envoyée en relance malgré « Ne plus appeler »`),
  ];
  regles.push(regle('ne_plus_appeler', '« Ne plus appeler » est définitif', encore));

  // 4 et 5. Monday : la même prochaine relance que la plateforme ; aucun numéro sur deux lignes.
  let lignesMonday = null;
  let raisonMonday = null;
  try {
    const M = await import('./monday-agents.js');
    if (lireMonday) lignesMonday = await lireMonday();
    else if (await M.mondayAgentsBranche()) lignesMonday = await M.lignes({ frais: true });
    else raisonMonday = 'Monday n\'est pas branché ici';
  } catch (e) { raisonMonday = `Monday n'a pas répondu (${String(e?.message || e).slice(0, 80)})`; }
  if (lignesMonday) {
    const parLigne = new Map(lignesMonday.map((l) => [String(l.id), l]));
    const desaccords = [];
    for (const f of fiches) {
      if (!f.monday_ligne_id || f.ne_plus_appeler) continue;
      const l = parLigne.get(String(f.monday_ligne_id));
      if (!l) continue;
      const m = MA.jourIso(l.relance) || null;
      const p = f.prochaine?.le || null;
      if (m !== p) desaccords.push(`${f.nom} : relance ${p ? R.dateCourte(p) : 'aucune'} ici, ${m ? R.dateCourte(m) : 'aucune'} dans Monday`);
    }
    regles.push(regle('monday_accord', 'Monday et la plateforme sont d\'accord', desaccords));
    const parTel = new Map();
    for (const l of lignesMonday) {
      const t = R.normTel(l.telephone);
      if (!t) continue;
      if (!parTel.has(t)) parTel.set(t, []);
      parTel.get(t).push(l);
    }
    const doublons = [...parTel.entries()].filter(([, t]) => t.length > 1).map(([tel, t]) => `${R.telAffiche(tel)} : ${t.length} lignes (${t.map((l) => String(l.nom || l.entreprise || l.id).replace(/\u200b/g, '').trim() || 'sans nom').slice(0, 3).join(', ')})`);
    regles.push(regle('doublons_monday', 'Pas de doublon dans Monday', doublons));
  } else {
    regles.push(regle('monday_accord', 'Monday et la plateforme sont d\'accord', [], { non_verifie: raisonMonday }));
    regles.push(regle('doublons_monday', 'Pas de doublon dans Monday', [], { non_verifie: raisonMonday }));
  }

  // 6. Aucune action en échec oubliée : aucun reçu resté orange ou rouge depuis plus d'une heure.
  const ilYaUneHeure = new Date(maintenantD.getTime() - HEURE).toISOString();
  const enSouffrance = [
    ...Records.list('MondayAttente').filter((x) => !x.fait_le && String(x.created_date || x.dernier_essai_le || '') < ilYaUneHeure).map((x) => `Monday en attente depuis le ${R.dateCourte(R.jourDe(new Date(x.created_date || x.dernier_essai_le)))} : ${x.donnees?.agence || x.appel_id}`),
    ...valides.filter((x) => x.recu && String(x.valide_le || x.le) < ilYaUneHeure && (['echec'].includes(x.recu.monday?.etat) || ['echec', 'brouillon'].includes(x.recu.mail?.etat)))
      .map((x) => `${x.agent || 'Appel'} (${R.dateCourte(String(x.le).slice(0, 10))}) : ${x.recu.mail?.etat === 'brouillon' ? 'brouillon jamais ouvert' : x.recu.mail?.etat === 'echec' ? 'mail non parti' : 'Monday raté'}`),
  ];
  regles.push(regle('echecs_oublies', 'Aucune action en échec oubliée', enSouffrance));

  // 7. Aucune ligne bloquée : une ligne tenue depuis plus de quinze minutes sans activité.
  const prisesActives = RL.prises(maintenantD);
  const bloquees = Object.entries(prisesActives).filter(([, p]) => maintenantD.getTime() - Date.parse(p.vu || p.depuis || 0) > 15 * 60 * 1000).map(([cle, p]) => `${cle} : tenue par ${p.prenom} sans activité`);
  regles.push(regle('lignes_bloquees', 'Aucune ligne bloquée', bloquees));

  // 8. Rien ne part sans validation : chaque mail parti d'un appel correspond à une validation.
  const depuis30 = new Date(maintenantD.getTime() - 30 * 24 * HEURE).toISOString();
  const partis = Records.list('ProspectionMail').filter((m) => !m.essai && ['envoye'].includes(m.etat) && String(m.envoye_le || '') >= depuis30);
  const sansValidation = partis.filter((m) => (m.appel_id ? Records.get(APPEL, m.appel_id)?.etat !== 'valide' : !m.par)).map((m) => `« ${m.objet} » à ${m.a} (${R.dateCourte(String(m.envoye_le).slice(0, 10))}) : aucune validation`);
  regles.push(regle('sans_validation', 'Rien ne part sans validation', sansValidation));

  // 9. Les fiches reçues sont rattachées à un agent (30 derniers jours).
  let fichesRecues = [];
  try { fichesRecues = await (await import('./index.js')).fiches(); } catch { fichesRecues = []; }
  const emails = new Set(fiches.flatMap((f) => f.emails || []));
  const orphelines = fichesRecues.filter((f) => String(f.le || '') >= depuis30 && (!f.agent_email || !emails.has(String(f.agent_email).toLowerCase())))
    .map((f) => `« ${f.titre} »${f.agent_email ? ` de ${f.agent_email}` : ' (expéditeur inconnu)'} : aucun agent`);
  regles.push(regle('fiches_rattachees', 'Les fiches reçues sont rattachées', orphelines));

  const ecarts = regles.filter((x) => !x.ok && !x.non_verifie).length;
  return { ok: true, le: maintenantD.toISOString(), conforme: ecarts === 0, ecarts, regles };
}

/** Pure : le mail du rapport : l'objet, le résumé, le détail ligne à ligne. */
export function mailDuRapport(rap, lien = '') {
  const nonVerifiees = rap.regles.filter((x) => x.non_verifie);
  const objet = rap.conforme ? `Klocka · Tout est conforme${nonVerifiees.length ? ` (${nonVerifiees.length} non vérifiée${nonVerifiees.length > 1 ? 's' : ''})` : ''}` : `Klocka · ${rap.ecarts} règle${rap.ecarts > 1 ? 's' : ''} non conforme${rap.ecarts > 1 ? 's' : ''}`;
  const lignes = rap.regles.map((x) => {
    if (x.non_verifie) return `· ${x.titre} : non vérifiée (${x.non_verifie})`;
    if (x.ok) return `✓ ${x.titre}`;
    return [`✗ **${x.titre}** : ${x.n} écart${x.n > 1 ? 's' : ''}`, ...x.details.map((d) => `    ${d}`), x.n > x.details.length ? `    et ${x.n - x.details.length} autre${x.n - x.details.length > 1 ? 's' : ''}` : null].filter(Boolean).join('\n');
  });
  return {
    objet,
    titre: rap.conforme ? 'Tout est conforme' : `${rap.ecarts} règle${rap.ecarts > 1 ? 's' : ''} non conforme${rap.ecarts > 1 ? 's' : ''}`,
    resume: `Contrôle de la nuit du ${new Date(rap.le).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })}.`,
    details: lignes.join('\n'),
    lien,
  };
}

/** Contrôle, garde le rapport, et l'envoie par mail (Resend, sous son garde-fou local). */
export async function controlerEtEnvoyer({ a = process.env.CONTROLES_A || 'jules.b@klocka.immo', maintenantD = new Date(), envoyer = true, testeur = null } = {}) {
  const rap = await controler({ maintenantD });
  const garde = Records.create(RAPPORT, { ...rap, envoye_a: envoyer ? a : null });
  if (!envoyer) return { ...rap, id: garde.id };
  const lien = `${(process.env.APP_URL || 'https://klocka-unus.onrender.com').replace(/\/$/, '')}/Suivi`;
  const m = mailDuRapport(rap, lien);
  let envoi;
  try {
    const { envoyerPlateforme } = await import('../emailing/index.js');
    envoi = await envoyerPlateforme('rapport_regles', { a, vars: m, testeur: testeur || a });
  } catch (e) { envoi = { ok: false, error: String(e?.message || e) }; }
  Records.update(RAPPORT, garde.id, { envoi: { ok: !!envoi?.ok, simule: !!envoi?.simule, redirige: envoi?.redirige || null, erreur: envoi?.ok ? null : envoi?.error || null } });
  return { ...rap, id: garde.id, envoi };
}

/** Le dernier rapport gardé. */
export const dernierRapport = () => Records.list(RAPPORT).sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] || null;

/**
 * Chaque matin vers 7 h (heure de Paris) sur Render, ou si CONTROLES_AUTO=true :
 * un contrôle par jour, jamais deux. Un serveur local ne l'envoie pas tout seul.
 */
export function planifier() {
  const auto = !!process.env.RENDER || process.env.CONTROLES_AUTO === 'true';
  if (!auto) return null;
  const tour = async () => {
    const maintenant = new Date();
    const heure = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }).format(maintenant));
    const dernier = dernierRapport();
    const dejaAujourdhui = dernier && R.jourDe(new Date(dernier.le)) === R.jourDe(maintenant) && dernier.envoye_a;
    if (heure >= 7 && !dejaAujourdhui) {
      try { await controlerEtEnvoyer({ maintenantD: maintenant }); } catch (e) { console.error('[contrôles] rapport impossible :', e?.message || e); }
    }
  };
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(tour, 60 * 1000).unref?.();
  return t;
}

// ---------------------------------------------------------------------------
// La qualité d'AK
// ---------------------------------------------------------------------------

/** Pure : le lundi (AAAA-MM-JJ) de la semaine d'un instant, à Paris. */
const lundiDe = (iso) => { const j = R.jourDe(new Date(iso)); return R.plusJours(j, -((new Date(`${j}T12:00:00Z`).getUTCDay() + 6) % 7)); };

/**
 * La part des appels validés sans aucune correction, semaine par semaine,
 * parmi ceux où AK a proposé (issue déduite de la transcription). Une
 * correction : l'issue changée, un champ corrigé (interlocuteur, téléphone,
 * email), la date de relance ou le mail retouchés.
 */
export function qualiteAK({ semaines = 8, maintenantD = new Date(), appels = null } = {}) {
  const tous = (appels || Records.list(APPEL)).filter((x) => !x.essai && x.etat === 'valide' && x.mesure_ak?.propose_par_ak);
  const lundi = lundiDe(maintenantD.toISOString());
  const liste = [];
  for (let i = semaines - 1; i >= 0; i -= 1) {
    const l = R.plusJours(lundi, -7 * i);
    const dans = tous.filter((x) => lundiDe(x.valide_le || x.le) === l);
    const sans = dans.filter((x) => !x.mesure_ak.corrige).length;
    liste.push({ semaine: l, appels: dans.length, sans_correction: sans, taux: dans.length ? Math.round((sans / dans.length) * 100) : null });
  }
  const recents = tous.filter((x) => lundiDe(x.valide_le || x.le) >= R.plusJours(lundi, -7 * (semaines - 1)));
  const compte = (k) => recents.filter((x) => x.mesure_ak[k] && (Array.isArray(x.mesure_ak[k]) ? x.mesure_ak[k].length : true)).length;
  return {
    ok: true,
    semaines: liste,
    courante: liste[liste.length - 1],
    precedente: liste[liste.length - 2] || null,
    corrections: { issue: compte('issue'), champs: compte('champs'), date: compte('date'), mail: compte('mail') },
    appels: recents.length,
  };
}

/** Pure : ce que l'analyste a corrigé à la validation d'un appel proposé par AK. */
export function mesureDeValidation({ appel, remplace = null, corrections = [], relanceProposee = null, relanceChoisie = null, mailPropose = null, mailEnvoye = null }) {
  const proposeParAK = !!appel?.issue_deduite || !!remplace?.issue_deduite;
  const issue = !!remplace?.issue_deduite && remplace.issue !== appel.issue;
  const champs = (corrections || []).filter((c) => c?.cle).map((c) => c.cle);
  const date = !!(relanceChoisie && relanceProposee && relanceChoisie !== relanceProposee);
  const mail = !!(mailPropose && mailEnvoye && (mailEnvoye.objet !== mailPropose.objet || mailEnvoye.corps !== mailPropose.corps || (mailEnvoye.a || '') !== (mailPropose.a || '')));
  return { propose_par_ak: proposeParAK, issue, champs, date, mail, corrige: issue || champs.length > 0 || date || mail };
}

