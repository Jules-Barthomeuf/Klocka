// Les statistiques de l'emailing, lues dans les envois et les événements de
// Resend : la vue globale (30 jours), le détail par campagne et par étape de
// séquence, et les liens les plus cliqués.

import { Records } from '../db.js';
import { E } from './schema.js';

const ENVOYE = new Set(['envoye', 'redirige']);
const taux = (n, sur) => (sur ? Math.round((n / sur) * 1000) / 10 : 0);

/** Pure : les chiffres d'un ensemble d'envois. */
export function chiffres(envois, evenements = []) {
  const partis = envois.filter((e) => ENVOYE.has(e.statut));
  const n = partis.length;
  const ouverts = partis.filter((e) => e.ouvert_le).length;
  const cliques = partis.filter((e) => e.clique_le).length;
  const bounces = partis.filter((e) => e.bounce_le).length;
  const plaintes = partis.filter((e) => e.plainte_le).length;
  const delivres = partis.filter((e) => e.delivre_le).length;
  const liens = new Map();
  for (const ev of evenements.filter((x) => x.type === 'clique' && x.lien)) liens.set(ev.lien, (liens.get(ev.lien) || 0) + 1);
  return {
    envoyes: n, delivres, ouverts, cliques, bounces, plaintes,
    taux_ouverture: taux(ouverts, n), taux_clic: taux(cliques, n), taux_bounce: taux(bounces, n),
    liens: [...liens.entries()].map(([lien, clics]) => ({ lien, clics })).sort((a, b) => b.clics - a.clics).slice(0, 10),
  };
}

/** La vue globale sur `jours` jours : envois marketing (campagnes et séquences). */
export function globales({ jours = 30, quand = new Date() } = {}) {
  const depuis = quand.getTime() - jours * 86400000;
  const envois = Records.list(E.ENVOI).filter((e) => e.type !== 'plateforme' && Date.parse(e.le) >= depuis);
  const evts = Records.list(E.EVENEMENT).filter((e) => Date.parse(e.le) >= depuis && (e.campagne_id || e.sequence_id));
  const desinscrits = Records.list(E.CONTACT).filter((c) => c.statut === 'desinscrit' && Date.parse(c.statut_le || 0) >= depuis).length;
  // Une courbe par jour : envoyés, ouverts, cliqués.
  const parJour = new Map();
  for (const e of envois.filter((x) => ENVOYE.has(x.statut))) {
    const j = String(e.le).slice(0, 10);
    const v = parJour.get(j) || { jour: j, envoyes: 0, ouverts: 0, cliques: 0 };
    v.envoyes += 1;
    if (e.ouvert_le) v.ouverts += 1;
    if (e.clique_le) v.cliques += 1;
    parJour.set(j, v);
  }
  return { jours, ...chiffres(envois, evts), desinscrits, par_jour: [...parJour.values()].sort((a, b) => a.jour.localeCompare(b.jour)) };
}

export function deCampagne(id) {
  const envois = Records.list(E.ENVOI).filter((e) => e.campagne_id === id);
  const evts = Records.list(E.EVENEMENT).filter((e) => e.campagne_id === id);
  const desinscrits = Records.list(E.CONTACT).filter((c) => c.desinscription_source === `campagne:${id}`).length;
  return { ...chiffres(envois, evts), desinscrits };
}

/** Par étape d'une séquence : envoyés, ouverts, cliqués, et ses liens. */
export function deSequence(id) {
  const s = Records.get(E.SEQUENCE, id);
  if (!s) return null;
  const envois = Records.list(E.ENVOI).filter((e) => e.sequence_id === id);
  const evts = Records.list(E.EVENEMENT).filter((e) => e.sequence_id === id);
  return {
    ...chiffres(envois, evts),
    desinscrits: Records.list(E.CONTACT).filter((c) => c.desinscription_source === `sequence:${id}`).length,
    etapes: (s.etapes || []).map((et) => ({ id: et.id, objet: et.objet, ...chiffres(envois.filter((e) => e.etape_id === et.id), evts.filter((e) => e.etape_id === et.id)) })),
  };
}

/** Les campagnes envoyées et les séquences, avec leurs chiffres, pour le tableau des statistiques. */
export function tableau() {
  const campagnes = Records.list(E.CAMPAGNE).filter((c) => ['en_cours', 'envoyee'].includes(c.statut))
    .sort((a, b) => String(b.envoyee_le || b.demarree_le).localeCompare(String(a.envoyee_le || a.demarree_le)))
    .map((c) => ({ id: c.id, nom: c.nom, le: c.envoyee_le || c.demarree_le, ...deCampagne(c.id) }));
  const sequences = Records.list(E.SEQUENCE).map((s) => ({ id: s.id, nom: s.nom, statut: s.statut, ...deSequence(s.id) }));
  return { campagnes, sequences };
}
