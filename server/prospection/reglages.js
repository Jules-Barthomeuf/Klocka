// Les réglages de la prospection : villes cibles, villes du jour, critères.

import { Meta } from '../db.js';
import { jourDe } from './regles.js';

const CLE = 'prospection.reglages';

export const DEFAUT = {
  villes: [],
  villes_du_jour: { jour: null, villes: [] },
  criteres: '',
  objet_criteres: 'Nos critères d\'investissement',
  par_nuit: 60,
  classes: ['Commercial'],
};

const lire = () => { try { return JSON.parse(Meta.get(CLE) || 'null') || {}; } catch { return {}; } };
export const reglages = () => ({ ...DEFAUT, ...lire() });

/** Les villes ciblées aujourd'hui : celles choisies ce jour, sinon aucune. */
export function villesDuJour(maintenant = new Date()) {
  const r = reglages();
  return r.villes_du_jour?.jour === jourDe(maintenant) ? r.villes_du_jour.villes || [] : [];
}

/** Pure : des réglages propres, bornés. */
export function nettoyer(r = {}, maintenant = new Date()) {
  const liste = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,\n]/)).map((x) => String(x).trim()).filter(Boolean);
  const out = {};
  if (r.villes !== undefined) out.villes = [...new Set(liste(r.villes).map((v) => v.slice(0, 60)))].slice(0, 30);
  if (r.villes_du_jour !== undefined) out.villes_du_jour = { jour: jourDe(maintenant), villes: [...new Set(liste(r.villes_du_jour).map((v) => v.slice(0, 60)))].slice(0, 10) };
  if (r.criteres !== undefined) out.criteres = String(r.criteres || '').slice(0, 4000);
  if (r.objet_criteres !== undefined) out.objet_criteres = String(r.objet_criteres || '').slice(0, 150) || DEFAUT.objet_criteres;
  if (r.par_nuit !== undefined) out.par_nuit = Math.min(300, Math.max(0, Math.round(Number(r.par_nuit) || 0)));
  return out;
}

export function enregistrer(r, par = null) {
  const suite = { ...reglages(), ...nettoyer(r), maj_le: new Date().toISOString(), maj_par: par };
  Meta.set(CLE, JSON.stringify(suite));
  return suite;
}
