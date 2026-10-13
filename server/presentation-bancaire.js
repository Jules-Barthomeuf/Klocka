// Les présentations bancaires (page Présentations, 12 oct. 2026) : le dossier
// « Projet de Financement » d'un projet, gardé en diapositives éditables.
// Créée depuis un projet (construireDiapos), elle se retouche à droite de la
// page, champ par champ, et par le chat d'AK (appliquerChangements) ; elle
// sort en PPTX, et en Google Slides quand un compte Drive est connecté.

import fs from 'fs';
import path from 'path';
import { Records, CHEMIN_UPLOADS } from './db.js';
import { ordreDuModele } from '../src/lib/presentation-modele.js';
import { sourcesDesChamps, sourcesEnTexte } from './presentation-sources.js';
import { secteurGarde } from './projet-secteur.js';
import { analysePrixEnCache } from './equimmox.js';

/** Le prix des murs qu'Equimmox a déjà lu pour ce projet (Analyse de prix), ou null. */
function prixDesMurs(projet) {
  if (!projet?.adresse_complete) return null;
  const surface = Number(projet.surface_m2) > 0 ? Number(projet.surface_m2) : Number(projet.sim_surface) > 0 ? Number(projet.sim_surface) : null;
  return analysePrixEnCache(projet.adresse_complete, surface);
}

/** Le loyer du secteur que l'onglet Marché du projet a gardé (Equimmox, Data-B en repli). */
function loyerDuSecteur(projet) {
  const lu = projet?.id ? secteurGarde(projet.id)?.rue : null;
  const v = Number(lu?.loyer_m2_an);
  if (!(Number.isFinite(v) && v > 0)) return null;
  const source = lu.loyer_source === 'Data-B' ? `Data-B, estimation à la maille ${lu.maille || 'du quartier'}` : `Equimmox, baux constatés${lu.rayon ? ` à ${lu.rayon} m` : ''}${lu.surface_min && lu.surface_max ? ` sur des locaux de ${lu.surface_min} à ${lu.surface_max} m²` : ''}`;
  return { valeur: v, source };
}

const ENTITE = 'PresentationBancaire';
const maintenant = () => new Date().toISOString();

/** Les photos par défaut d'un projet : couverture, ville, quartier, puis trois du local. */
export function photosParDefaut(projet) {
  const s = (projet?.photos || []).filter((u) => typeof u === 'string' && u);
  return {
    couverture: s[0] || null,
    ville: s[1] || null,
    quartier: s[2] || null,
    local1: s[3] || s[0] || null,
    local2: s[4] || s[1] || null,
    local3: s[5] || s[2] || null,
  };
}

/** Une présentation en ligne de liste : de quoi la reconnaître. */
function resume(p) {
  const projet = p.projet_id ? Records.get('Project', p.projet_id) : null;
  return {
    id: p.id,
    projet_id: p.projet_id,
    titre: p.titre || projet?.titre || 'Sans titre',
    adresse: projet?.adresse_complete || p.adresse || '',
    diapos: (p.diapos || []).filter((d) => !d.masquee).length,
    conversation_id: p.conversation_id || null,
    cree_par: p.cree_par || null,
    envoye_a: Array.isArray(p.envoye_a) ? p.envoye_a : [],
    envoye_le: p.envoye_le || null,
    // L'aperçu de la liste : la photo de couverture.
    photo: (p.diapos || []).find((d) => d.id === 'couverture')?.photo || null,
    cree_le: p.cree_le,
    maj_le: p.maj_le,
    exporte_le: p.exporte_le || null,
    slides_url: p.slides_url || null,
    pdf_url: p.pdf_url || null,
    pdf_le: p.pdf_le || null,
  };
}

export function listerPresentations() {
  return Records.list(ENTITE)
    .sort((a, b) => String(b.maj_le || b.cree_le || '').localeCompare(String(a.maj_le || a.cree_le || '')))
    .map(resume);
}

export function lirePresentation(id) {
  const p = Records.get(ENTITE, id);
  if (!p) return null;
  // Les photos du projet : l'éditeur les propose pour remplacer une photo.
  const projet = p.projet_id ? Records.get('Project', p.projet_id) : null;
  const photos_projet = (projet?.photos || []).filter((u) => typeof u === 'string' && u);
  // Une présentation faite avant le modèle du 12 oct. 2026 (sans panneau de gauche) : à reconstruire.
  const ancienne = (p.diapos || []).some((d) => !d.heros);
  // La source de chaque champ, relue à chaque ouverture (mode Sources de l'éditeur, et AK).
  const sources_champs = sourcesDesChamps(projet, p.diapos || [], { loyerSecteur: loyerDuSecteur(projet), prixMurs: prixDesMurs(projet) });
  return { ...resume(p), diapos: p.diapos || [], pptx_url: p.pptx_url || null, photos_projet, ancienne, sources_champs };
}

/** Crée la présentation d'un projet : les seize diapositives, remplies. */
export async function creerPresentation(projetId, user, { photos = null } = {}) {
  const projet = Records.get('Project', projetId);
  if (!projet) return { ok: false, error: 'Projet introuvable.' };
  const { construireDiapos } = await import('./presentation-projet.js');
  const diapos = await construireDiapos(projet, photos || photosParDefaut(projet));
  const p = Records.create(ENTITE, {
    projet_id: projet.id,
    titre: projet.titre || projet.adresse_complete || 'Projet de financement',
    adresse: projet.adresse_complete || '',
    diapos,
    cree_le: maintenant(),
    maj_le: maintenant(),
    cree_par: user?.email || null,
  }, user?.email);
  return { ok: true, presentation_id: p.id };
}

/** Refait les diapositives depuis le projet, sur le modèle en cours ; la présentation garde son lien et sa conversation. */
export async function reconstruirePresentation(id) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const projet = p.projet_id ? Records.get('Project', p.projet_id) : null;
  if (!projet) return { ok: false, error: 'Le projet de cette présentation n\'existe plus.' };
  const { construireDiapos } = await import('./presentation-projet.js');
  Records.update(ENTITE, id, { diapos: await construireDiapos(projet, photosParDefaut(projet)), maj_le: maintenant() });
  return { ok: true, presentation_id: id };
}

/** Pure : une diapositive du modèle reste un objet à l'id connu, sans champ d'une autre. */
export function diapoValide(avant, apres) {
  if (!apres || typeof apres !== 'object' || Array.isArray(apres)) return false;
  return apres.id === avant.id && apres.type === avant.type;
}

/**
 * Les retouches de l'éditeur : une diapositive remplacée entière (`diapo`),
 * l'ordre changé (`ordre`, les ids, ou « modele » pour revenir à celui du modèle), le titre de la présentation,
 * ou toutes les diapositives d'avant une retouche d'AK (`tout`, pour l'annuler).
 */
export function modifierPresentation(id, { diapo = null, ordre = null, titre = null, conversation_id = null, tout = null } = {}) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const patch = { maj_le: maintenant() };
  // Revenir sur ce qu'AK a fait (13 oct. 2026, Jules : « je veux pouvoir revenir en
  // arrière ») : toutes les diapositives d'avant, sources comprises, remises d'un coup.
  if (tout) {
    if (!Array.isArray(tout) || !tout.length || tout.some((d) => !d || typeof d !== 'object' || !d.id || !d.type) || new Set(tout.map((d) => d.id)).size !== tout.length) return { ok: false, error: 'Diapositives invalides.' };
    patch.diapos = tout;
    Records.update(ENTITE, id, patch);
    return { ok: true };
  }
  let diapos = [...(p.diapos || [])];
  if (diapo) {
    const i = diapos.findIndex((d) => d.id === diapo.id);
    if (i < 0 || !diapoValide(diapos[i], diapo)) return { ok: false, error: 'Diapositive inconnue.' };
    // Un champ retouché à la main ne garde pas la source qu'AK lui avait donnée.
    const avant = diapos[i];
    const valeurDe = (d, chemin) => String(chemin).split('.').reduce((o, k) => (o == null ? undefined : o[k]), d);
    const provenance = Object.fromEntries(Object.entries(avant.provenance || {}).filter(([chemin]) => String(valeurDe(avant, chemin) ?? '') === String(valeurDe(diapo, chemin) ?? '')));
    diapos[i] = { ...diapo, provenance };
  }
  // « Remettre dans l'ordre du modèle » (12 oct. 2026, Jules : la couverture d'abord, jamais le sommaire).
  if (ordre === 'modele') diapos = ordreDuModele(diapos);
  else if (Array.isArray(ordre)) {
    const par = new Map(diapos.map((d) => [d.id, d]));
    if (ordre.length !== diapos.length || ordre.some((x) => !par.has(x))) return { ok: false, error: 'Ordre incomplet.' };
    diapos = ordre.map((x) => par.get(x));
  }
  if (diapo || ordre) patch.diapos = diapos;
  if (typeof titre === 'string' && titre.trim()) patch.titre = titre.trim().slice(0, 160);
  if (conversation_id && !p.conversation_id) patch.conversation_id = String(conversation_id);
  Records.update(ENTITE, id, patch);
  return { ok: true };
}

/**
 * Pure : pose une valeur à un chemin pointé (« titre », « points.2.valeur »,
 * « chiffres.+ » pour ajouter). Une valeur nulle sur un élément de liste le
 * retire. Rend la diapositive modifiée, ou une erreur si le chemin n'existe pas.
 */
export function poserChemin(diapo, chemin, valeur) {
  const copie = JSON.parse(JSON.stringify(diapo));
  const morceaux = String(chemin || '').split('.').filter(Boolean);
  if (!morceaux.length || ['id', 'type'].includes(morceaux[0])) return { ok: false, error: `Chemin interdit : ${chemin}` };
  let o = copie;
  for (let k = 0; k < morceaux.length - 1; k++) {
    const m = Array.isArray(o) ? Number(morceaux[k]) : morceaux[k];
    if (o?.[m] === undefined || o[m] === null || typeof o[m] !== 'object') return { ok: false, error: `Chemin inconnu : ${chemin}` };
    o = o[m];
  }
  const dernier = morceaux.at(-1);
  if (Array.isArray(o)) {
    if (dernier === '+') { if (valeur != null) o.push(valeur); return { ok: true, diapo: copie }; }
    const i = Number(dernier);
    if (!Number.isInteger(i) || i < 0 || i >= o.length) return { ok: false, error: `Rang inconnu : ${chemin}` };
    if (valeur === null) o.splice(i, 1);
    else o[i] = valeur;
    return { ok: true, diapo: copie };
  }
  if (!(dernier in o) && !['masquee', 'photo', 'styles', 'sources'].includes(dernier)) return { ok: false, error: `Champ inconnu : ${chemin}` };
  o[dernier] = valeur;
  return { ok: true, diapo: copie };
}

/** Les changements du chat : [{ diapo, chemin, valeur }], appliqués d'un bloc ou pas du tout. */
export function appliquerChangements(id, changements = []) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const diapos = [...(p.diapos || [])];
  const faits = [];
  for (const c of changements || []) {
    const i = diapos.findIndex((d) => d.id === c?.diapo);
    if (i < 0) return { ok: false, error: `Diapositive inconnue : ${c?.diapo}. Celles qui existent : ${diapos.map((d) => d.id).join(', ')}.` };
    const r = poserChemin(diapos[i], c.chemin, c.valeur === undefined ? null : c.valeur);
    if (!r.ok) return r;
    // La source qu'AK a lue pour ce champ, pour le mode Sources (13 oct. 2026) ; sans source, l'ancienne ne vaut plus.
    const provenance = { ...(r.diapo.provenance || {}) };
    if (String(c.source || '').trim()) provenance[c.chemin] = { source: String(c.source).trim().slice(0, 200), lien: /^https?:\/\//i.test(String(c.lien || '')) ? String(c.lien).slice(0, 500) : null, par: 'AK', le: maintenant() };
    else delete provenance[c.chemin];
    diapos[i] = { ...r.diapo, provenance };
    faits.push(`${c.diapo}.${c.chemin}`);
  }
  Records.update(ENTITE, id, { diapos, maj_le: maintenant() });
  return { ok: true, faits };
}

/** La présentation telle qu'AK la lit : chaque diapositive et ses champs, le tableau abrégé. */
export function presentationPourAK(id, { ouverte = true } = {}) {
  const p = Records.get(ENTITE, id);
  if (!p) return null;
  const lignes = (p.diapos || []).map((d, i) => {
    const { id: cle, type, styles, sources, sources_liens: _liens, ...champs } = d;
    // D'où viennent les chiffres : posés à la création ; une présentation plus ancienne reçoit les sources du modèle.
    champs.sources = sources || null;
    // Les mises en forme de l'éditeur ne regardent pas AK ; ce qui est masqué, si.
    const masques = Object.entries(styles || {}).filter(([, st]) => st?.masque).map(([c]) => c);
    if (masques.length) champs.elements_masques = masques;
    // Le tableau des revenus et les barres : abrégés, ils se recalculent depuis le simulateur.
    if (type === 'revenus') champs.lignes = `${(champs.lignes || []).length} lignes (année, brut, travaux, net, cumul)`;
    if (type === 'projection') champs.barres = `${(champs.barres || []).length} barres`;
    return `${i + 1}. [${cle}] (${type}) ${JSON.stringify(champs)}`;
  });
  // La source champ par champ (le mode Sources de l'éditeur dit la même chose) ; le tableau des revenus, sa première ligne seule.
  const projet = p.projet_id ? Records.get('Project', p.projet_id) : null;
  const parChamp = sourcesDesChamps(projet, p.diapos || [], { loyerSecteur: loyerDuSecteur(projet), prixMurs: prixDesMurs(projet) });
  if (parChamp.revenus) parChamp.revenus = Object.fromEntries(Object.entries(parChamp.revenus).filter(([c]) => !/^lignes\.([1-9]\d*)\./.test(c)));
  return `${ouverte ? 'PRÉSENTATION BANCAIRE OUVERTE À DROITE' : 'PRÉSENTATION BANCAIRE'} (presentation_id ${p.id}, « ${p.titre} ») — l'équipe a pu la retoucher, c'est la version à jour :\n${lignes.join('\n')}\nSOURCES CHAMP PAR CHAMP (chemin = valeur affichée : origine, détail, calcul, lien) :\n${sourcesEnTexte(parChamp, p.diapos || [])}\nD'OÙ VIENNENT LES CHIFFRES : la liste ci-dessus d'abord, puis le champ « sources » de chaque diapositive. Une question sur l'origine d'un chiffre (« d'où vient le loyer du quartier ? ») : réponds avec cette source, sans rien inventer ; si c'est une estimation de l'IA, dis-le clairement et propose de la vérifier (data_b pour un loyer ou une valeur locative). Un chiffre retouché à la main par l'équipe (différent du projet) : dis qu'il a été saisi à la main ; une ligne marquée ATTENTION le dit. Donne le lien de la source quand il y en a un.`;
}

/** Le PPTX de la présentation telle qu'elle est, et sa version Google Slides si un compte est donné. */
export async function exporterPresentation(id, { compte = null } = {}) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const { rendrePptx } = await import('./presentation-projet.js');
  const buffer = await rendrePptx(p.diapos || [], { titre: p.titre });
  const nom = `presentation-bancaire-${String(p.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.pptx`;
  const dossier = path.join(CHEMIN_UPLOADS, 'presentations');
  fs.mkdirSync(dossier, { recursive: true });
  fs.writeFileSync(path.join(dossier, nom), buffer);
  const pptx_url = `/uploads/presentations/${nom}`;
  let slides_url = null;
  let erreur_slides = null;
  if (compte) {
    try {
      const { uploaderEnSlides } = await import('./google-drive.js');
      slides_url = (await uploaderEnSlides(compte, { nom: `Projet de financement — ${p.titre}`, buffer })).slides_url;
    } catch (e) {
      erreur_slides = e?.message || String(e);
    }
  }
  Records.update(ENTITE, id, { pptx_url, exporte_le: maintenant(), ...(slides_url ? { slides_url } : {}) });
  if (p.projet_id && Records.get('Project', p.projet_id)) {
    Records.update('Project', p.projet_id, {
      presentation_pptx_url: pptx_url,
      presentation_generee_le: maintenant(),
      ...(slides_url ? { presentation_google_slides: slides_url } : {}),
    });
  }
  return { ok: true, pptx_url, slides_url, erreur_slides };
}

export function supprimerPresentation(id) {
  if (!Records.get(ENTITE, id)) return { ok: false, error: 'Présentation introuvable.' };
  Records.delete(ENTITE, id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Côté client (13 oct. 2026, Jules) : l'équipe envoie une présentation à un ou
// plusieurs clients ; elle apparaît dans leur page Présentations, éditable,
// sans le chat. L'équipe la voit toujours (vue client comprise). Une question
// du client part dans le Feedback, rien de plus (CLAUDE.md).
// ---------------------------------------------------------------------------

const norm = (e) => String(e || '').trim().toLowerCase();
/** Les adresses qui désignent ce compte (un compte famille lit celles du compte maître). */
const adressesDe = (user) => [norm(user?.email), user?.est_compte_shadow ? norm(user?.compte_maitre_email) : null].filter(Boolean);
const envoyeeA = (p) => (Array.isArray(p.envoye_a) ? p.envoye_a.map(norm) : []);

/** Pure : ce compte peut-il ouvrir cette présentation ? L'équipe, toujours ; un client, si elle lui a été envoyée. */
export function accesClient(p, user) {
  if (!p || !user) return false;
  if (user.role === 'admin') return true;
  const a = adressesDe(user);
  return envoyeeA(p).some((e) => a.includes(e));
}

/** Les clients à qui l'envoyer : le client du projet d'abord, puis les autres comptes clients. */
export function clientsPossibles(id) {
  const p = Records.get(ENTITE, id);
  if (!p) return null;
  const projet = p.projet_id ? Records.get('Project', p.projet_id) : null;
  const duProjet = new Set([projet?.client_email, ...(projet?.client_emails || [])].map(norm).filter(Boolean));
  const deja = new Set(envoyeeA(p));
  return Records.list('User')
    .filter((u) => u.email && (u.role || 'user') === 'user' && !u.est_compte_shadow)
    .map((u) => ({ email: norm(u.email), nom: u.full_name || null, du_projet: duProjet.has(norm(u.email)), envoyee: deja.has(norm(u.email)) }))
    .sort((a, b) => Number(b.du_projet) - Number(a.du_projet) || Number(b.envoyee) - Number(a.envoyee) || String(a.nom || a.email).localeCompare(String(b.nom || b.email), 'fr'));
}

/** Envoie (ou retire) la présentation aux clients donnés : la liste remplace la précédente. */
export function envoyerAuxClients(id, emails, user) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const clients = new Set(Records.list('User').filter((u) => (u.role || 'user') === 'user').map((u) => norm(u.email)));
  const liste = [...new Set((emails || []).map(norm).filter(Boolean))];
  const inconnus = liste.filter((e) => !clients.has(e));
  if (inconnus.length) return { ok: false, error: `Pas un compte client : ${inconnus.join(', ')}.` };
  const nouveaux = liste.filter((e) => !envoyeeA(p).includes(e));
  Records.update(ENTITE, id, {
    envoye_a: liste,
    // Le premier client porte aussi la présentation pour l'accès aux entités (acces-entites.js, client_email).
    client_email: liste[0] || null,
    ...(nouveaux.length ? { envoye_le: maintenant(), envoye_par: user?.email || null } : {}),
  });
  return { ok: true, envoye_a: liste, nouveaux };
}

/**
 * Les présentations d'un client. L'équipe, en vue client, les voit toutes,
 * dès leur création, envoyées ou non (13 oct. 2026, Jules).
 */
export function presentationsDuClient(user) {
  return Records.list(ENTITE)
    .filter((p) => (user?.role === 'admin' ? true : envoyeeA(p).length > 0) && accesClient(p, user))
    .sort((a, b) => String(b.maj_le || b.cree_le || '').localeCompare(String(a.maj_le || a.cree_le || '')))
    .map((p) => ({ ...resume(p), envoye_a: envoyeeA(p), envoye_le: p.envoye_le || null }));
}

/**
 * La présentation telle qu'un client l'ouvre : les sources restent (mode
 * Sources), sans les liens vers les pages de l'équipe ni les écarts de
 * retouche, qu'il ne peut pas ouvrir.
 */
export function lirePourClient(id, user) {
  const p = Records.get(ENTITE, id);
  if (!accesClient(p, user)) return null;
  const d = lirePresentation(id);
  const sources_champs = Object.fromEntries(Object.entries(d.sources_champs || {}).map(([diapo, champs]) => [diapo, Object.fromEntries(Object.entries(champs || {}).map(([chemin, s]) => {
    const { ecart, ...reste } = s || {};
    return [chemin, { ...reste, liens: (reste.liens || []).filter((l) => /^https?:\/\//i.test(String(l?.href || ''))) }];
  }))]));
  return { ...d, sources_champs, envoye_a: envoyeeA(p), client: true };
}

/** La question d'un client sur sa présentation : une remarque dans le Feedback, que Jules lit et traite à la main. */
export function poserQuestion(id, user, texte) {
  const p = Records.get(ENTITE, id);
  if (!accesClient(p, user)) return { ok: false, error: 'Présentation introuvable.' };
  const t = String(texte || '').trim().slice(0, 4000);
  if (!t) return { ok: false, error: 'Écrivez votre question.' };
  const s = Records.create('Suggestion', {
    contenu: `Question sur la présentation « ${p.titre} » : ${t}`,
    urgence: 3,
    statut: 'nouveau',
    page: `/MesPresentations?presentation=${p.id}`,
    client_email: user.email,
    client_name: user.full_name || user.email,
    presentation_id: p.id,
  }, user.email);
  return { ok: true, id: s.id };
}
