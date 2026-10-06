// Les templates : le template Klocka de base dans ses trois designs, ceux
// qu'on enregistre depuis n'importe quel email, et (à part) les mails de la
// plateforme, retouchés dans le même éditeur.

import { Records } from '../db.js';
import { E } from './schema.js';
import { TEMPLATES_BASE } from './modeles.js';
import { modelesPlateforme } from './index.js';

const maintenant = () => new Date().toISOString();

export function templates() {
  const enregistres = Records.list(E.TEMPLATE).filter((t) => t.categorie !== 'plateforme')
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)));
  return { base: TEMPLATES_BASE, enregistres, plateforme: modelesPlateforme() };
}

export function template(id) {
  return TEMPLATES_BASE.find((t) => t.id === id) || Records.get(E.TEMPLATE, id) || null;
}

/** « Enregistrer comme template » : l'objet, l'aperçu et le design d'un email. */
export function enregistrer({ nom, objet = '', apercu = '', design }, user = null) {
  const n = String(nom || '').trim();
  if (!n) return { ok: false, error: 'Nommez le template.' };
  if (!design?.blocs) return { ok: false, error: 'Rien à enregistrer.' };
  return { ok: true, template: Records.create(E.TEMPLATE, { categorie: 'marketing', nom: n, objet, apercu, design, cree_le: maintenant(), cree_par: user?.email || null }) };
}

export function modifier(id, patch) {
  const t = Records.get(E.TEMPLATE, id);
  if (!t || t.categorie === 'plateforme') return { ok: false, error: 'Template introuvable.' };
  const champs = {};
  for (const k of ['nom', 'objet', 'apercu']) if (patch[k] != null) champs[k] = String(patch[k]);
  if (patch.design?.blocs) champs.design = patch.design;
  champs.modifie_le = maintenant();
  return { ok: true, template: Records.update(E.TEMPLATE, id, champs) };
}

export function supprimer(id) {
  const t = Records.get(E.TEMPLATE, id);
  if (!t || t.categorie === 'plateforme') return { ok: false, error: 'Template introuvable.' };
  Records.delete(E.TEMPLATE, id);
  return { ok: true };
}
