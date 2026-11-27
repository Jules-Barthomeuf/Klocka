// La passation avant une absence (27 nov. 2026, Jules, sur le brief de Nora à Maxime du 30 oct. : « comment faire pour
// que Nora n'ait pas 30 minutes à faire ça ; comment on garde ce qu'elle ajoute ; comment on fait un retour à Maxime » ;
// puis « ajoute un mode dans le chat »).
//
// Le brief n'est pas un texte : c'est, fiche par fiche, où on en est et qui fait quoi. Trois gestes, que l'assistant
// fait par ses outils (server/ak/agent.js), lancés par le raccourci « Préparer ma passation » :
//   - preparer : les fiches de la personne (celles qu'elle a touchées ces trois semaines, celles où elle a une action
//     ouverte), chacune avec son état, sa dernière ligne d'historique et ses actions ouvertes. Sans IA ;
//   - passer : ses actions choisies passent au collègue (responsable), avec leur contexte ; ce qu'elle ajoute de vive voix
//     va sur les fiches (une ligne de notes) ou devient une action neuve du collègue ; la passation est gardée ;
//   - retour : à son retour, ce qui a bougé sur ces fiches depuis la passation (les lignes des autres, les actions
//     passées faites ou non). Remplace le point du retour.
// Rien n'est effacé ; une action passée garde qui l'a passée et quand.

import { Records } from '../db.js';
import { actionsDe, membreDe, objetDe, prenomDe } from './modele.js';

const ENTITE = 'Passation';
const JOUR = 86400000;
const bas = (t) => String(t || '').trim().toLowerCase();
const propre = (t, n = 600) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const premierePhrase = (t) => { const s = propre(t, 400); const i = s.search(/[.!?](\s|$)/); return i > 0 ? s.slice(0, i + 1) : s; };
const nomDe = (cle) => Records.findBy('FicheDossier', 'cle', cle)?.nom || objetDe(cle)?.nom || cle;
const jourIso = (d) => new Date(d).toISOString().slice(0, 10);

/** Les fiches à passer : touchées par la personne depuis `jours`, ou portant une de ses actions ouvertes. */
export function preparer(user, { jours = 21, maintenant = new Date() } = {}) {
  const moi = bas(user?.email);
  if (!moi) return { ok: false, error: 'Personne connectée inconnue.' };
  const depuis = new Date(maintenant.getTime() - jours * JOUR).toISOString();
  const cles = new Map();
  const toucher = (cle, le) => { if (cle && (!cles.has(cle) || String(le) > cles.get(cle))) cles.set(cle, String(le || '')); };
  for (const e of Records.filter('EntreeDossier', { par: moi })) if (String(e.le) >= depuis) toucher(e.fiche_cle, e.le);
  for (const n of Records.filter('NoteDossier', { par: moi })) if (String(n.le) >= depuis && n.etat !== 'annulee') for (const l of n.liens || []) toucher(l.cle, n.le);
  for (const a of Records.list('AppelAgent')) if (bas(a.par) === moi && !a.essai && a.agent_id && String(a.le) >= depuis) toucher(`agent:${a.agent_id}`, a.le);
  const ouvertes = Records.filter('ActionDossier', { statut: 'ouverte' }).filter((a) => bas(a.responsable) === moi);
  for (const a of ouvertes) for (const c of a.fiches || []) toucher(c, a.cree_le || a.echeance || '');
  const sansFiche = ouvertes.filter((a) => !(a.fiches || []).length);

  const fiches = [...cles.entries()].map(([cle, le]) => {
    const f = Records.findBy('FicheDossier', 'cle', cle);
    const entrees = Records.filter('EntreeDossier', { fiche_cle: cle }).sort((a, b) => String(b.le).localeCompare(String(a.le)));
    const siennes = actionsDe(cle).filter((a) => a.statut === 'ouverte' && bas(a.responsable) === moi);
    return {
      cle, nom: nomDe(cle), genre: f?.genre || objetDe(cle)?.genre || null,
      ou_on_en_est: [f?.etape, f?.etat].filter(Boolean).join(' · ') || null,
      resume: f?.resume ? premierePhrase(f.resume) : null,
      derniere: entrees[0] ? { le: jourIso(entrees[0].le), texte: propre(entrees[0].texte, 240), par: prenomDe(entrees[0].par) } : null,
      actions: siennes.map((a) => ({ id: a.id, titre: a.titre, echeance: a.echeance || null })),
      touchee_le: le ? jourIso(le) : null,
    };
  }).sort((a, b) => (b.actions.length > 0) - (a.actions.length > 0) || String(b.touchee_le).localeCompare(String(a.touchee_le))).slice(0, 40);

  return { ok: true, fiches, sans_fiche: sansFiche.map((a) => ({ id: a.id, titre: a.titre, echeance: a.echeance || null })), depuis: jourIso(depuis) };
}

/**
 * Passe à `vers` (un prénom de l'équipe ou une adresse) : les actions choisies (`actions` : identifiants ; `toutes` :
 * toutes les siennes), les ajouts dits de vive voix (`ajouts` : [{ fiche: nom ou clé, texte }], gardés sur la fiche), et
 * les actions neuves (`nouvelles` : [{ titre, fiche?, echeance? }]). Garde la passation.
 */
export function passer(user, { vers, du = null, au = null, actions = [], toutes = false, ajouts = [], nouvelles = [], mot = null } = {}, { maintenant = new Date() } = {}) {
  const moi = bas(user?.email);
  const qui = membreDe(vers);
  if (!qui?.email) return { ok: false, error: `Je ne trouve pas « ${vers} » dans l'équipe.` };
  if (bas(qui.email) === moi) return { ok: false, error: 'La passation va à un collègue, pas à soi.' };
  const le = maintenant.toISOString();
  const prenom = prenomDe(moi) || 'un collègue';
  const periode = du || au ? ` (absence${du ? ` du ${du}` : ''}${au ? ` au ${au}` : ''})` : '';
  const prep = preparer(user, { maintenant });
  const trouverFiche = (x) => {
    const t = bas(x);
    if (!t) return null;
    return prep.fiches.find((f) => bas(f.cle) === t || bas(f.nom) === t)?.cle
      || prep.fiches.find((f) => bas(f.nom).includes(t) || t.includes(bas(f.nom)))?.cle || null;
  };

  const ids = new Set(toutes ? [...prep.fiches.flatMap((f) => f.actions.map((a) => a.id)), ...prep.sans_fiche.map((a) => a.id)] : (actions || []).map(String));
  const passees = [];
  for (const id of ids) {
    const a = Records.get('ActionDossier', id);
    if (!a || a.statut !== 'ouverte' || (a.responsable && bas(a.responsable) !== moi)) continue;
    Records.update('ActionDossier', a.id, {
      responsable: qui.email, passee_par: moi, passee_le: le,
      contexte: [...(a.contexte || []), `Passée par ${prenom}${periode}`].slice(-12),
    });
    passees.push({ id: a.id, titre: a.titre });
  }

  const gardes = [];
  for (const x of Array.isArray(ajouts) ? ajouts : []) {
    const cle = trouverFiche(x?.fiche);
    const texte = propre(x?.texte, 1200);
    if (!texte) continue;
    if (!cle) { gardes.push({ fiche: null, texte, perdu: true }); continue; }
    Records.create('EntreeDossier', { fiche_cle: cle, genre: 'ressenti', texte, raison: null, note_id: null, par: moi, le, ordre: 0, source: 'passation' });
    gardes.push({ fiche: nomDe(cle), texte });
  }

  const creees = [];
  for (const n of Array.isArray(nouvelles) ? nouvelles : []) {
    const titre = propre(n?.titre, 300);
    if (!titre) continue;
    const cle = trouverFiche(n?.fiche);
    const a = Records.create('ActionDossier', {
      titre: titre.charAt(0).toUpperCase() + titre.slice(1), genre: /\b(relanc|rappel|appel)/i.test(titre) ? 'appel' : 'tache', pour: null,
      contexte: [`Passée par ${prenom}${periode}`], qui: 'personne', responsable: qui.email, echeance: /^\d{4}-\d{2}-\d{2}$/.test(String(n?.echeance || '')) ? n.echeance : null,
      statut: 'ouverte', fiches: cle ? [cle] : [], note_id: null, brouillon: null, cree_par: moi, cree_le: le, source: 'passation', passee_par: moi, passee_le: le,
    });
    creees.push({ id: a.id, titre: a.titre, fiche: cle ? nomDe(cle) : null });
  }

  const fiches = [...new Set([...prep.fiches.map((f) => f.cle)])];
  const p = Records.create(ENTITE, { par: moi, vers: qui.email, du, au, le, actions: [...passees, ...creees].map((a) => a.id), fiches, mot: mot ? propre(mot, 1500) : null });
  return { ok: true, passation_id: p.id, vers: prenomDe(qui.email), actions_passees: passees, actions_creees: creees, ajouts: gardes, a_ranger: gardes.filter((g) => g.perdu).map((g) => g.texte) };
}

/** Au retour : ce qui a bougé sur les fiches de sa dernière passation (ou depuis `depuis`), et ce que sont devenues ses actions. */
export function retour(user, { maintenant = new Date() } = {}) {
  const moi = bas(user?.email);
  const p = Records.filter(ENTITE, { par: moi }).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  if (!p) return { ok: false, error: "Aucune passation de ta part : je n'ai pas de date de départ." };
  const parFiche = p.fiches.map((cle) => {
    const lignes = Records.filter('EntreeDossier', { fiche_cle: cle }).filter((e) => String(e.le) > p.le && bas(e.par) !== moi)
      .sort((a, b) => String(a.le).localeCompare(String(b.le))).map((e) => ({ le: jourIso(e.le), par: prenomDe(e.par), texte: propre(e.texte, 300) }));
    return { cle, nom: nomDe(cle), lignes };
  }).filter((f) => f.lignes.length);
  const actions = p.actions.map((id) => Records.get('ActionDossier', id)).filter(Boolean)
    .map((a) => ({ titre: a.titre, statut: a.statut, faite_le: a.faite_le ? jourIso(a.faite_le) : null, par: prenomDe(a.responsable) }));
  return {
    ok: true, depuis: jourIso(p.le), vers: prenomDe(p.vers), fiches_qui_ont_bouge: parFiche,
    actions_faites: actions.filter((a) => a.statut !== 'ouverte'), actions_ouvertes: actions.filter((a) => a.statut === 'ouverte'),
    rien: !parFiche.length && !actions.some((a) => a.statut !== 'ouverte'), aujourdhui: jourIso(maintenant),
  };
}
