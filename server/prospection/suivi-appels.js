// Le Suivi des appels (9 oct. 2026) : l'usage de chacun en Prospection, en
// Relances et au Rappel, pour voir qui appelle, combien, comment, et faire en
// sorte que l'outil serve de plus en plus. Tout est lu dans ce que la
// plateforme garde déjà : les appels (AppelAgent), les sessions du mode appel,
// les rappels entrants. Les mesures fines (durée, enregistré, notes,
// validation depuis la fenêtre, étapes ouvertes, corrections d'AK) existent
// depuis le 9 octobre ; avant, elles manquent et le tableau le dit.
//
// La transcription n'est pas gardée (choix RGPD du 6 oct. 2026) : chaque
// appel garde son résumé, les phrases exactes, ce qui a été compris et les
// notes tapées.

import { Records, Meta } from '../db.js';
import * as R from './regles.js';
import { prenomDe, EQUIPE } from './equipe.js';

const APPEL = 'AppelAgent';
const SANS_REPONSE = ['pas_de_reponse', 'repondeur'];
export const SOURCES = { prospection: 'Prospection', relances: 'Relances', rappel: 'Rappel', essai: 'Essai', carnet: 'Ancien carnet' };

/** Pure : d'où vient un appel. Les appels d'avant le 9 oct. se déduisent de leur session ou de leur forme. */
export function sourceDe(x, sessions = new Map()) {
  if (x.source) return x.source;
  if (x.essai) return 'essai';
  if (x.rappel_entrant || x.rappel_id) return 'rappel';
  const s = x.session_id ? sessions.get(x.session_id) : null;
  if (s?.relances) return 'relances';
  if (s?.essai) return 'essai';
  return x.agence_id ? 'prospection' : 'carnet';
}

const pct = (n, sur) => (sur ? Math.round((n / sur) * 100) : null);
const moyenne = (t) => (t.length ? Math.round(t.reduce((a, b) => a + b, 0) / t.length) : null);
const heureParis = (iso) => Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(new Date(iso))) % 24;

/** Pure : les chiffres d'une liste d'appels (une personne, ou l'équipe). */
export function chiffres(appels, { sessions = [], maintenantD = new Date() } = {}) {
  const valides = appels.filter((x) => x.etat === 'valide');
  const enAttente = appels.filter((x) => x.etat === 'a_valider');
  const oublies = enAttente.filter((x) => maintenantD.getTime() - Date.parse(x.le) > 3600 * 1000);
  const aboutis = appels.filter((x) => !SANS_REPONSE.includes(x.issue));
  const mesures = appels.filter((x) => x.enregistre != null);
  const durees = appels.map((x) => Number(x.duree_s)).filter((n) => n > 0);
  const ui = valides.filter((x) => x.validation_ui);
  const ak = valides.filter((x) => x.mesure_ak?.propose_par_ak);
  const jours = new Set(appels.map((x) => R.jourDe(new Date(x.le))));
  const tempsSessions = sessions.reduce((t, s) => t + Math.max(0, Date.parse(s.fin || s.debut) - Date.parse(s.debut)), 0);
  const issues = {};
  for (const x of appels) issues[x.issue] = (issues[x.issue] || 0) + 1;
  return {
    appels: appels.length,
    aboutis: aboutis.length,
    joints_pct: pct(aboutis.length, appels.length),
    valides: valides.length,
    en_attente: enAttente.length,
    oublies: oublies.length,
    enregistres_pct: pct(mesures.filter((x) => x.enregistre).length, mesures.length),
    notes_pct: pct(mesures.filter((x) => x.notes).length, mesures.length),
    duree_moyenne_s: moyenne(durees),
    duree_totale_s: durees.reduce((a, b) => a + b, 0),
    temps_mode_appel_s: Math.round(tempsSessions / 1000),
    jours_actifs: jours.size,
    par_jour_actif: jours.size ? Math.round((appels.length / jours.size) * 10) / 10 : null,
    fenetre_pct: pct(ui.filter((x) => x.validation_ui.depuis_fenetre).length, ui.length),
    etapes_vues_pct: pct(ui.reduce((t, x) => t + (x.validation_ui.vues || 0), 0), ui.reduce((t, x) => t + (x.validation_ui.etapes || 0), 0)),
    retirees: ui.reduce((t, x) => t + (x.validation_ui.retirees || []).length, 0),
    sans_correction_pct: pct(ak.filter((x) => !x.mesure_ak.corrige).length, ak.length),
    issue_changee: ak.filter((x) => x.mesure_ak.issue).length,
    annulations: appels.reduce((t, x) => t + (x.annulations || 0), 0),
    mails_partis: valides.filter((x) => x.recu?.mail?.etat === 'ok').length,
    monday_ok: valides.filter((x) => x.recu?.monday?.etat === 'ok').length,
    lecture_moyenne_ms: moyenne(appels.map((x) => Number(x.lecture_ms)).filter((n) => n > 0)),
    biens: appels.filter((x) => x.issue === 'a_des_murs').length,
    pas_interesses: appels.filter((x) => x.issue === 'pas_interesse').length,
    issues,
  };
}

/**
 * Le Suivi des appels sur `jours` jours : l'équipe, chaque analyste, la
 * courbe par jour, les heures, les sources, et le journal des appels (le
 * plus récent d'abord). `source` filtre (prospection, relances, rappel) ;
 * l'essai n'entre que si on le demande.
 */
// La remise à zéro (9 oct. 2026) : rien ne s'efface ; le suivi compte à partir de ce moment, jusqu'à « Tout afficher ».
const CLE_ZERO = 'suivi_appels.remise_a_zero';
export const remiseAZero = () => { try { return JSON.parse(Meta.get(CLE_ZERO) || 'null'); } catch { return null; } };
export function remettreAZero(par, maintenantD = new Date()) {
  const r = { le: maintenantD.toISOString(), par: String(par || '').toLowerCase() || null };
  Meta.set(CLE_ZERO, JSON.stringify(r));
  return r;
}
export function toutAfficher() { Meta.set(CLE_ZERO, 'null'); return null; }

export function suiviAppels({ jours = 30, source = null, maintenantD = new Date(), journal = 300 } = {}) {
  const zero = remiseAZero();
  const fenetre = new Date(maintenantD.getTime() - jours * 86400000).toISOString();
  const depuis = zero?.le && zero.le > fenetre ? zero.le : fenetre;
  const sessions = new Map(Records.list('SessionAppel').map((s) => [s.id, s]));
  const agences = new Map(Records.list('AgenceProspect').map((a) => [a.id, a]));
  const listes = new Map(Records.list('ListeAgences').map((l) => [l.id, l]));
  const fiches = new Map(Records.list('AgentImmo').map((f) => [f.id, f]));
  const tous = Records.list(APPEL)
    .filter((x) => String(x.le) >= depuis && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat))
    .map((x) => ({ ...x, _source: sourceDe(x, sessions) }));
  const appels = tous.filter((x) => (source ? x._source === source : x._source !== 'essai'));
  const sessionsFen = [...sessions.values()].filter((s) => String(s.debut) >= depuis && !s.essai);

  // Par analyste : toute l'équipe nommée, même ceux qui n'ont pas appelé (c'est aussi une information).
  const equipe = new Map();
  for (const x of appels) {
    const e = String(x.par || '').toLowerCase();
    if (!equipe.has(e)) equipe.set(e, []);
    equipe.get(e).push(x);
  }
  for (const m of EQUIPE) if (!equipe.has(m.email)) equipe.set(m.email, []);
  const analystes = [...equipe.entries()].map(([email, t]) => ({
    email, prenom: prenomDe(email) || email,
    ...chiffres(t, { sessions: sessionsFen.filter((s) => String(s.par || '').toLowerCase() === email), maintenantD }),
    premier: t.map((x) => x.le).sort()[0] || null,
    dernier: t.map((x) => x.le).sort().at(-1) || null,
    nouvelles_agences: new Set(t.filter((x) => x._source === 'prospection').map((x) => x.agent_id)).size,
    envoyees_en_relance: [...agences.values()].filter((a) => a.en_relance?.par === email && String(a.en_relance.le) >= depuis.slice(0, 10)).length,
  })).sort((a, b) => b.appels - a.appels);

  // La courbe par jour (chaque analyste), les heures, les sources.
  const joursListe = [];
  for (let i = Math.min(jours, 60) - 1; i >= 0; i -= 1) joursListe.push(R.jourDe(new Date(maintenantD.getTime() - i * 86400000)));
  const parJour = joursListe.map((j) => {
    const dans = appels.filter((x) => R.jourDe(new Date(x.le)) === j);
    return { jour: j, appels: dans.length, aboutis: dans.filter((x) => !SANS_REPONSE.includes(x.issue)).length, par: Object.fromEntries(analystes.map((a) => [a.email, dans.filter((x) => String(x.par || '').toLowerCase() === a.email).length])) };
  });
  const heures = Array.from({ length: 24 }, (_, h) => ({ heure: h, appels: appels.filter((x) => heureParis(x.le) === h).length }));
  const sources = Object.keys(SOURCES).map((k) => ({ cle: k, libelle: SOURCES[k], appels: tous.filter((x) => x._source === k).length })).filter((x) => x.appels);

  // Le journal : chaque appel, avec ce qu'on en garde.
  const lignes = [...appels].sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, journal).map((x) => {
    const ag = x.agence_id ? agences.get(x.agence_id) : null;
    const f = fiches.get(x.agent_id);
    const remplace = tous.find((y) => y.remplace_par === x.id) || Records.list(APPEL).find((y) => y.remplace_par === x.id) || null;
    const champs = Object.fromEntries(Object.entries(x.compris?.champs || {}).map(([k, v]) => [k, Array.isArray(v?.valeur) ? v.valeur.join(' ; ') : v?.valeur ?? null]));
    const citations = Object.entries(x.citations || {}).filter(([, v]) => v).map(([k, v]) => ({ cle: k, phrase: v }));
    return {
      id: x.id, le: x.le, par: prenomDe(x.par) || x.par, source: x._source, etat: x.etat,
      agence: ag?.nom || f?.agence || x.agent || null, ville: ag ? listes.get(ag.liste_id)?.ville || ag.ville || null : f?.ville || null,
      interlocuteur: champs.interlocuteur || null,
      issue: R.ISSUES[x.issue] || x.issue, issue_cle: x.issue,
      issue_proposee: remplace?.issue_deduite ? R.ISSUES[remplace.issue] || remplace.issue : x.issue_deduite ? R.ISSUES[x.issue] || x.issue : null,
      deduite: !!(x.issue_deduite || remplace?.issue_deduite),
      duree_s: x.duree_s || null, enregistre: x.enregistre ?? null, notes: x.notes || null, lecture_ms: x.lecture_ms || null,
      resume: x.resume || null, citations, champs,
      biens: x.biens || [], pourquoi_relance: x.pourquoi_relance || null,
      validation: x.validation_ui || null, mesure_ak: x.mesure_ak || null, annulations: x.annulations || 0,
      recu: x.recu ? { monday: x.recu.monday ? { etat: x.recu.monday.etat, texte: x.recu.monday.texte } : null, mail: x.recu.mail ? { etat: x.recu.mail.etat, texte: x.recu.mail.texte } : null, relance: x.recu.relance?.texte || null } : null,
      valide_le: x.valide_le || null,
    };
  });

  const rappels = Records.list('RappelEntrant').filter((r) => String(r.debut) >= depuis);
  return {
    ok: true,
    jours,
    source,
    remise_a_zero: zero?.le && zero.le > fenetre ? zero : null,
    depuis_mesures: '2026-10-09',
    equipe: chiffres(appels, { sessions: sessionsFen, maintenantD }),
    analystes,
    par_jour: parJour,
    heures,
    sources,
    rappels: { total: rappels.length, termines: rappels.filter((r) => r.etat === 'valide').length, abandonnes: rappels.filter((r) => r.etat === 'abandonne').length, en_cours: rappels.filter((r) => ['enregistrement', 'a_identifier', 'identifie'].includes(r.etat)).length },
    journal: lignes,
  };
}
