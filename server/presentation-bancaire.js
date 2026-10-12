// Les présentations bancaires (page Présentations, 12 oct. 2026) : le dossier
// « Projet de Financement » d'un projet, gardé en diapositives éditables.
// Créée depuis un projet (construireDiapos), elle se retouche à droite de la
// page, champ par champ, et par le chat d'AK (appliquerChangements) ; elle
// sort en PPTX, et en Google Slides quand un compte Drive est connecté.

import fs from 'fs';
import path from 'path';
import { Records, CHEMIN_UPLOADS } from './db.js';
import { ordreDuModele } from '../src/lib/presentation-modele.js';

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
    cree_le: p.cree_le,
    maj_le: p.maj_le,
    exporte_le: p.exporte_le || null,
    slides_url: p.slides_url || null,
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
  return { ...resume(p), diapos: p.diapos || [], pptx_url: p.pptx_url || null, photos_projet, ancienne };
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
 * l'ordre changé (`ordre`, les ids, ou « modele » pour revenir à celui du modèle), ou le titre de la présentation.
 */
export function modifierPresentation(id, { diapo = null, ordre = null, titre = null, conversation_id = null } = {}) {
  const p = Records.get(ENTITE, id);
  if (!p) return { ok: false, error: 'Présentation introuvable.' };
  const patch = { maj_le: maintenant() };
  let diapos = [...(p.diapos || [])];
  if (diapo) {
    const i = diapos.findIndex((d) => d.id === diapo.id);
    if (i < 0 || !diapoValide(diapos[i], diapo)) return { ok: false, error: 'Diapositive inconnue.' };
    diapos[i] = diapo;
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
  if (!(dernier in o) && !['masquee', 'photo', 'styles'].includes(dernier)) return { ok: false, error: `Champ inconnu : ${chemin}` };
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
    diapos[i] = r.diapo;
    faits.push(`${c.diapo}.${c.chemin}`);
  }
  Records.update(ENTITE, id, { diapos, maj_le: maintenant() });
  return { ok: true, faits };
}

/** La présentation telle qu'AK la lit : chaque diapositive et ses champs, le tableau abrégé. */
export function presentationPourAK(id) {
  const p = Records.get(ENTITE, id);
  if (!p) return null;
  const lignes = (p.diapos || []).map((d, i) => {
    const { id: cle, type, styles, ...champs } = d;
    // Les mises en forme de l'éditeur ne regardent pas AK ; ce qui est masqué, si.
    const masques = Object.entries(styles || {}).filter(([, st]) => st?.masque).map(([c]) => c);
    if (masques.length) champs.elements_masques = masques;
    // Le tableau des revenus et les barres : abrégés, ils se recalculent depuis le simulateur.
    if (type === 'revenus') champs.lignes = `${(champs.lignes || []).length} lignes (année, brut, travaux, net, cumul)`;
    if (type === 'projection') champs.barres = `${(champs.barres || []).length} barres`;
    return `${i + 1}. [${cle}] (${type}) ${JSON.stringify(champs)}`;
  });
  return `PRÉSENTATION BANCAIRE OUVERTE À DROITE (presentation_id ${p.id}, « ${p.titre} ») — l'équipe a pu la retoucher, c'est la version à jour :\n${lignes.join('\n')}`;
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
