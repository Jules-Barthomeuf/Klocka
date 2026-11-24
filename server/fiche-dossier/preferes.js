// Les agents préférés (20 nov. 2026, Jules : « dans la fiche de l'agent, à droite de son nom, une petite étoile : c'est un
// très bon agent ; on retrouve ces étoiles dans le CRM ; chaque personne de l'équipe peut avoir jusqu'à cinq agents
// préférés »). Une étoile par personne et par agent ; cinq au plus chacun ; tout le monde voit qui a mis une étoile.

import { Records } from '../db.js';
import { objetDe, prenomDe } from './modele.js';

export const MAX_PREFERES = 5;
const bas = (t) => String(t || '').trim().toLowerCase();

/** Les étoiles de la personne, la plus récente d'abord. */
export const preferesDe = (user) => Records.filter('AgentPrefere', { par: bas(user?.email) }).sort((a, b) => String(b.le).localeCompare(String(a.le)));

/** Met ou retire l'étoile de la personne sur un agent ; refusé au-delà de cinq. */
export function basculerPrefere(user, cle, { maintenant = new Date() } = {}) {
  const par = bas(user?.email);
  const c = String(cle || '');
  // Un agent du CRM sans fiche de Klocka (twenty:agentImmobilier:<id>) a aussi son étoile (23 nov. 2026).
  if (!par || !/^(agent:|twenty:agentImmobilier:)[\w-]+$/.test(c)) return { ok: false, error: 'Une étoile se met sur un agent.' };
  const deja = Records.filter('AgentPrefere', { par, cle: c });
  if (deja.length) {
    for (const x of deja) Records.delete('AgentPrefere', x.id);
    return { ok: true, etoile: false };
  }
  if (preferesDe(user).length >= MAX_PREFERES) {
    return { ok: false, error: `Tu as déjà ${MAX_PREFERES} agents préférés : retire une étoile avant d'en mettre une autre.` };
  }
  const nom = Records.findBy('FicheDossier', 'cle', c)?.nom || objetDe(c)?.nom || null;
  Records.create('AgentPrefere', { par, cle: c, nom, le: maintenant.toISOString() });
  return { ok: true, etoile: true };
}

/** Toutes les étoiles de l'équipe, par agent : son nom, qui l'a mis en préféré, et si c'est aussi le cas de la personne. */
export function etoiles(user) {
  const moi = bas(user?.email);
  const parAgent = new Map();
  for (const x of Records.list('AgentPrefere')) {
    const e = parAgent.get(x.cle) || { cle: x.cle, nom: x.nom || objetDe(x.cle)?.nom || null, par: [], moi: false };
    e.par.push(prenomDe(x.par) || x.par);
    if (x.par === moi) e.moi = true;
    parAgent.set(x.cle, e);
  }
  return { agents: [...parAgent.values()], miens: preferesDe(user).length, max: MAX_PREFERES };
}
