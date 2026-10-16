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
export const SOURCES = { prospection: 'Prospection', relances: 'Relances', rappel: 'Rappel', relances_mail: 'Relances par mail', essai: 'Essai', carnet: 'Ancien carnet' };

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
const JOURS_SEMAINE = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
/** Pure : le jour de la semaine à Paris, lundi = 0. */
export const jourSemaineParis = (iso) => JOURS_SEMAINE[new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short' }).format(new Date(iso))] ?? 0;
export const TRANCHES_DUREE = [[0, 30, '< 30 s'], [30, 60, '30 s à 1 min'], [60, 120, '1 à 2 min'], [120, 300, '2 à 5 min'], [300, 600, '5 à 10 min'], [600, Infinity, '> 10 min']];
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
    // Le temps après l'appel, depuis le raccrochage (13 oct. 2026) : la médiane, et sur combien d'appels.
    apres_appel: Object.fromEntries(ETAPES_TEMPS.map((k) => { const t = appels.map((x) => x.temps?.[`${k}_ms`]).filter((n) => Number.isFinite(n)); return [k, { mediane_ms: mediane(t), moyenne_ms: moyenne(t), n: t.length }]; })),
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

/** Pure : minuit, heure de Paris, du jour de `d`, en ISO (UTC). « 1 jour » compte depuis là, pas sur vingt-quatre heures glissantes. */
export function minuitParis(d = new Date()) {
  const jour = R.jourDe(d);
  const decalage = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', timeZoneName: 'shortOffset' }).formatToParts(new Date(`${jour}T12:00:00Z`)).find((x) => x.type === 'timeZoneName')?.value || 'GMT+1';
  const m = decalage.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const minutes = m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0)) : 60;
  return new Date(Date.parse(`${jour}T00:00:00Z`) - minutes * 60000).toISOString();
}

// Les chiffres comptent à partir du 13 oct. 2026 (16 oct., Jules : « avant c'était en test, ça compte pas »).
export const DEBUT_DES_MESURES = minuitParis(new Date('2026-10-13T12:00:00Z'));

export function suiviAppels({ jours = 30, source = null, maintenantD = new Date(), journal = 300, debutMesures = DEBUT_DES_MESURES } = {}) {
  const zero = remiseAZero();
  // « 1 jour » (14 oct. 2026, Jules) : la journée en cours, depuis minuit à Paris.
  const fenetreBrute = jours === 1 ? minuitParis(maintenantD) : new Date(maintenantD.getTime() - jours * 86400000).toISOString();
  const fenetre = debutMesures && debutMesures > fenetreBrute ? debutMesures : fenetreBrute;
  const depuis = zero?.le && zero.le > fenetre ? zero.le : fenetre;
  const sessions = new Map(Records.list('SessionAppel').map((s) => [s.id, s]));
  const agences = new Map(Records.list('AgenceProspect').map((a) => [a.id, a]));
  const listes = new Map(Records.list('ListeAgences').map((l) => [l.id, l]));
  const fiches = new Map(Records.list('AgentImmo').map((f) => [f.id, f]));
  const bruts = Records.list(APPEL)
    .filter((x) => String(x.le) >= depuis && !x.essai_archive && !['remplace', 'abandonne'].includes(x.etat))
    .map((x) => ({ ...x, _source: sourceDe(x, sessions) }));
  // Les relances par mail (10 oct. 2026) sont des contacts, pas des appels : elles se comptent à part,
  // et seulement elles quand on filtre sur « Relances par mail ».
  const mailsRelance = bruts.filter((x) => x.canal === 'mail');
  const tous = bruts.filter((x) => x.canal !== 'mail');
  const appels = source === 'relances_mail' ? mailsRelance : tous.filter((x) => (source ? x._source === source : x._source !== 'essai'));
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
    relances_mail: mailsRelance.filter((x) => String(x.par || '').toLowerCase() === email).length,
  })).sort((a, b) => b.appels - a.appels);

  // La courbe par jour (chaque analyste), les heures, les sources.
  const joursListe = [];
  for (let i = Math.min(jours, 60) - 1; i >= 0; i -= 1) {
    const j = R.jourDe(new Date(maintenantD.getTime() - i * 86400000));
    // Pas de jour avant le début des mesures : la courbe commence le 13 octobre.
    if (!debutMesures || j >= R.jourDe(new Date(debutMesures))) joursListe.push(j);
  }
  const parJour = joursListe.map((j) => {
    const dans = appels.filter((x) => R.jourDe(new Date(x.le)) === j);
    const dj = dans.map((x) => Number(x.duree_s)).filter((n) => n > 0);
    return { jour: j, appels: dans.length, aboutis: dans.filter((x) => !SANS_REPONSE.includes(x.issue)).length, duree_moyenne_s: moyenne(dj), duree_totale_s: dj.reduce((t, n) => t + n, 0),
      // Le temps après l'appel, ce jour-là (16 oct. 2026, Jules) : la médiane de chaque étape depuis le raccrochage.
      apres_appel: Object.fromEntries(ETAPES_TEMPS.map((k) => { const t = dans.map((x) => x.temps?.[`${k}_ms`]).filter((n) => Number.isFinite(n)); return [k, { mediane_ms: mediane(t), n: t.length }]; })), biens: dans.filter((x) => x.issue === 'a_des_murs').length, par: Object.fromEntries(analystes.map((a) => [a.email, dans.filter((x) => String(x.par || '').toLowerCase() === a.email).length])) };
  });
  const heures = Array.from({ length: 24 }, (_, h) => ({ heure: h, appels: appels.filter((x) => heureParis(x.le) === h).length }));
  // La carte jour × heure (14 oct. 2026) : lundi à dimanche, heure de Paris.
  const semaine = Array.from({ length: 7 }, (_, j) => ({ jour: j, heures: Array(24).fill(0) }));
  for (const x of appels) semaine[jourSemaineParis(x.le)].heures[heureParis(x.le)] += 1;
  // La répartition des durées : combien d'appels de moins de 30 s, de 30 s à 1 min, etc.
  const durees = TRANCHES_DUREE.map(([de, a, mot]) => ({ mot, appels: appels.filter((x) => Number(x.duree_s) > 0 && x.duree_s >= de && x.duree_s < a).length }));
  const sources = Object.keys(SOURCES).map((k) => ({ cle: k, libelle: SOURCES[k], appels: k === 'relances_mail' ? mailsRelance.length : tous.filter((x) => x._source === k).length })).filter((x) => x.appels);

  // Le journal : chaque appel, avec ce qu'on en garde.
  const ecrans = new Map(Records.list('EnregistrementEcran').filter((e) => e.appel_id).map((e) => [e.appel_id, e.id]));
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
      // Validé ou non à la main dans le Suivi : la dernière fois, par qui.
      validation_main: (x.validation_main || []).at(-1) || null,
      transcription: x.transcription_gardee || null,
      // L'écran de l'analyste pendant l'appel (14 oct. 2026), gardé 30 jours.
      ecran_id: ecrans.get(x.id) || null,
      temps: x.temps || null,
    };
  });

  const rappels = Records.list('RappelEntrant').filter((r) => String(r.debut) >= depuis);
  const contexte = contexteAppels(appels, { sources: Records.list('CerveauSource'), faits: Records.list('CerveauFait'), liens: Records.list('CerveauLien') });
  // Les rappels entrants qui n'ont pas abouti à un appel du journal (13 oct. 2026, Jules : « dans les
  // journaux d'appels on doit voir aussi les rappels qui ont été faits ») : en cours, à identifier,
  // abandonnés. Un rappel validé y est déjà, par l'appel qu'il a créé ; on ne le met pas deux fois.
  const lignesRappels = source && source !== 'rappel' ? [] : lignesDeRappels(rappels, new Set(appels.map((x) => x.id)), agences, fiches);
  const journalComplet = [...lignes, ...lignesRappels].sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, journal);
  return {
    ok: true,
    jours,
    source,
    remise_a_zero: zero?.le && zero.le > fenetre ? zero : null,
    debut_mesures: debutMesures || null,
    depuis_mesures: '2026-10-09',
    equipe: chiffres(appels, { sessions: sessionsFen, maintenantD }),
    relances_mail: mailsRelance.length,
    analystes,
    par_jour: parJour,
    heures,
    semaine,
    durees,
    sources,
    rappels: { total: rappels.length, termines: rappels.filter((r) => r.etat === 'valide').length, abandonnes: rappels.filter((r) => r.etat === 'abandonne').length, en_cours: rappels.filter((r) => ['enregistrement', 'a_identifier', 'identifie'].includes(r.etat)).length },
    journal: journalComplet,
    contexte,
  };
}

const ETATS_RAPPEL = { enregistrement: 'Rappel en cours', a_identifier: 'Agent à identifier', identifie: 'Identifié, pas validé', abandonne: 'Rappel abandonné' };

/**
 * Pure : une ligne du journal par rappel entrant qui n'a pas d'appel au
 * journal. Même forme qu'un appel, avec `rappel: true` : l'écran n'y propose
 * ni validation à la main ni mesure d'AK, qui n'existent pas sans appel.
 */
export function lignesDeRappels(rappels, idsAuJournal, agences = new Map(), fiches = new Map()) {
  return rappels
    .filter((r) => r.etat !== 'valide' && !(r.appel_id && idsAuJournal.has(r.appel_id)))
    .map((r) => {
      const f = r.agent_id ? fiches.get(r.agent_id) : null;
      const ag = r.agence_id ? agences.get(r.agence_id) : null;
      return {
        id: `rappel:${r.id}`, rappel: true, le: r.debut, par: prenomDe(r.par) || r.par, source: 'rappel', etat: r.etat,
        agence: f ? [f.nom, ag?.nom || f.agence].filter(Boolean).join(' · ') : 'Agent non identifié', ville: ag?.ville || f?.ville || null,
        interlocuteur: f?.nom || null,
        issue: ETATS_RAPPEL[r.etat] || r.etat, issue_cle: null, issue_proposee: null, deduite: false,
        duree_s: r.duree_s || null, enregistre: r.transcription ? true : null, notes: r.notes || null, lecture_ms: null,
        resume: null, citations: [], champs: {}, biens: [], pourquoi_relance: null,
        validation: null, mesure_ak: null, annulations: 0, recu: null, valide_le: null, validation_main: null,
        // Un rappel abandonné perd sa transcription (rappels.js, abandonner) : il ne reste que les notes et la durée.
        transcription: r.transcription || null,
        temps: null,
      };
    });
}

/**
 * Le contexte que les appels apportent à l'Intelligence (14 oct. 2026, Jules : « dans
 * Suivi appels, le contexte, avec le gain de sources de contexte, mesuré depuis
 * l'Intelligence »). Un appel validé avec sa transcription entre dans l'Intelligence
 * comme une source (clé « appel-<id> », layer.js depuisAppel) ; l'extraction
 * en tire des faits, que Jules valide. Pure sur ses entrées : testée sans base.
 *
 * @param {Array} appels  les appels de la période (avec _source, par, le, transcription_gardee)
 * @param {{sources: Array, faits: Array, liens: Array}} layer
 */
export function contexteAppels(appels, { sources = [], faits = [], liens = [] } = {}) {
  const parCle = new Map(sources.filter((s) => String(s.cle || '').startsWith('appel-')).map((s) => [s.cle.slice(6), s]));
  const faitsDe = new Map();
  for (const f of faits) { if (!faitsDe.has(f.source_id)) faitsDe.set(f.source_id, []); faitsDe.get(f.source_id).push(f); }
  const lignes = appels.map((x) => {
    const s = parCle.get(x.id) || null;
    return { x, s, faits: s ? faitsDe.get(s.id) || [] : [] };
  });
  const transcrits = lignes.filter((l) => String(l.x.transcription_gardee || '').trim());
  const nourris = lignes.filter((l) => l.s);
  const tous = nourris.flatMap((l) => l.faits);
  const compter = (liste, cle) => liste.reduce((o, f) => ({ ...o, [f[cle]]: (o[f[cle]] || 0) + 1 }), {});
  const ids = new Set(tous.map((f) => f.id));
  const fiches = liens.filter((l) => ids.has(l.fait_id));
  const distinctes = (type) => new Set(fiches.filter((l) => l.type_entite === type).map((l) => l.entite_id)).size;
  const par = new Map();
  for (const l of nourris) {
    const e = String(l.x.par || '').toLowerCase();
    const a = par.get(e) || { email: e, prenom: prenomDe(e) || e, sources: 0, faits: 0, valides: 0 };
    a.sources += 1; a.faits += l.faits.length; a.valides += l.faits.filter((f) => f.statut === 'valide').length;
    par.set(e, a);
  }
  const jours = new Map();
  for (const l of nourris) {
    const j = R.jourDe(new Date(l.x.le));
    const d = jours.get(j) || { jour: j, sources: 0, faits: 0 };
    d.sources += 1; d.faits += l.faits.length; jours.set(j, d);
  }
  return {
    appels: appels.length,
    transcrits: transcrits.length,
    sources: nourris.length,
    en_attente_extraction: nourris.filter((l) => l.s.statut_extraction !== 'fait').length,
    faits: tous.length,
    doublons: nourris.reduce((t, l) => t + (l.s.doublons || 0), 0),
    faits_par_source: nourris.length ? Math.round((tous.length / nourris.length) * 10) / 10 : null,
    nourris_pct: pct(nourris.length, transcrits.length),
    par_type: compter(tous, 'type'),
    par_statut: compter(tous, 'statut'),
    fiches: { agents: distinctes('agent'), agences: distinctes('agence'), autres: new Set(fiches.filter((l) => !['agent', 'agence'].includes(l.type_entite)).map((l) => `${l.type_entite}:${l.entite_id}`)).size },
    analystes: [...par.values()].sort((a, b) => b.faits - a.faits),
    par_jour: [...jours.values()].sort((a, b) => a.jour.localeCompare(b.jour)),
    derniers: nourris.sort((a, b) => String(b.x.le).localeCompare(String(a.x.le))).slice(0, 8).map((l) => ({ le: l.x.le, par: prenomDe(l.x.par) || l.x.par, titre: l.s.titre, faits: l.faits.length, resumes: l.faits.slice(0, 3).map((f) => ({ type: f.type, resume: f.resume, statut: f.statut })) })),
  };
}

/**
 * Côté admin (13 oct. 2026, Jules) : un appel marqué validé ou non à la main,
 * dans le journal du Suivi. Seul l'état change : rien n'est envoyé ni écrit
 * ailleurs (ni mail, ni Monday) ; la main est notée sur l'appel.
 */
export function marquerValidation(id, valide, user) {
  const x = Records.get('AppelAgent', id);
  if (!x) return { ok: false, error: 'Appel introuvable.' };
  const le = new Date().toISOString();
  const main = { par: String(user?.email || '').toLowerCase() || null, le, de: x.etat, a: valide ? 'valide' : 'a_valider' };
  Records.update('AppelAgent', id, { etat: valide ? 'valide' : 'a_valider', valide_le: valide ? x.valide_le || le : null, validation_main: [...(x.validation_main || []), main] });
  return { ok: true, etat: valide ? 'valide' : 'a_valider' };
}

/**
 * Le temps après l'appel (13 oct. 2026, Jules : « de raccrocher jusqu'à tout
 * est préparé ») : mesuré par l'écran, à trois moments depuis le raccrochage :
 * les actions prêtes, la validation, « Tout est préparé ». Chaque moment se
 * note une fois ; une mesure hors de 0 à 2 h est ignorée.
 */
export const ETAPES_TEMPS = ['pret', 'valide', 'prepare'];
export function noterTemps(id, etape, ms) {
  const x = Records.get('AppelAgent', id);
  if (!x) return { ok: false, error: 'Appel introuvable.' };
  const n = Math.round(Number(ms));
  if (!ETAPES_TEMPS.includes(etape) || !Number.isFinite(n) || n < 0 || n > 2 * 3600000) return { ok: false, error: 'Mesure invalide.' };
  const temps = { ...(x.temps || {}) };
  if (temps[`${etape}_ms`] == null) temps[`${etape}_ms`] = n;
  Records.update('AppelAgent', id, { temps });
  return { ok: true, temps };
}

/** Pure : la médiane d'une liste de nombres, ou null. */
export function mediane(xs) {
  const t = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!t.length) return null;
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
}
