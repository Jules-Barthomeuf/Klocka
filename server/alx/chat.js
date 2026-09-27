// Le démarchage ALX dans le chat : l'assistant montre le message d'une
// société en entier, et il part sur un « envoie », comme les autres mails.

import { Meta, Records } from '../db.js';

const CLE = 'alx.envoi_attente';
const FRAIS_MS = 24 * 3600000;
const lire = () => { try { return JSON.parse(Meta.get(CLE) || '{}'); } catch { return {}; } };

/** Retrouve une ville par son nom, et une société par son nom ou son SIREN. */
export async function trouverSociete(ville, recherche) {
  const { listerVillesLeger } = await import('./index.js');
  const { societesDeLaVille } = await import('./demarchage.js');
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  const v = listerVillesLeger().find((x) => norm(x.nom) === norm(ville));
  if (!v) return { erreur: `Pas de prospection ALX pour ${ville}.` };
  const toutes = societesDeLaVille(v.id);
  const q = norm(recherche);
  const s = toutes.find((x) => x.siren === String(recherche).replace(/\s/g, '')) || toutes.find((x) => norm(x.nom) === q) || toutes.find((x) => norm(x.nom).includes(q));
  return { ville: v, societe: s || null, toutes };
}

/** Pure : le message tel qu'il s'affiche dans le chat. */
export function afficher(s) {
  const a = s.message?.a || s.contacts.find((c) => c.email)?.email;
  return [
    `${s.nom} (${s.murs.length} mur${s.murs.length > 1 ? 's' : ''} : ${s.murs.slice(0, 3).map((m) => `${m.adresse}${m.enseigne ? `, ${m.enseigne}` : ''}`).join(' ; ')}${s.murs.length > 3 ? '…' : ''})`,
    `à : ${a || '(pas de mail trouvé : donne-moi une adresse, ou appelle)'}`,
    `objet : ${s.message.objet}`,
    '',
    s.message.corps,
    '',
    a ? 'dis « envoie » et il part' : '',
  ].filter((l, i, t) => l !== '' || t[i - 1] !== '').join('\n');
}

export function mettreEnAttente(espace, villeId, cle) {
  Meta.set(CLE, JSON.stringify({ ...lire(), [espace]: { ville_id: villeId, cle, le: new Date().toISOString() } }));
}

export function envoiEnAttente(espace, maintenant = Date.now()) {
  const e = lire()[espace];
  return e && maintenant - Date.parse(e.le) < FRAIS_MS ? e : null;
}

export async function envoyerDepuisLeChat(espace, user) {
  const e = envoiEnAttente(espace);
  if (!e) return null;
  const { envoyer } = await import('./demarchage.js');
  const r = await envoyer(e.ville_id, e.cle, user);
  const tout = lire();
  delete tout[espace];
  Meta.set(CLE, JSON.stringify(tout));
  if (!r.ok) return `dsl, rien n'est parti : ${r.error}`;
  const s = Records.filter('SocieteAlx', { ville_id: e.ville_id, cle: e.cle })[0];
  return r.simule ? 'rien n\'est parti : aucune boîte connectée pour toi.' : `c'est parti, mail envoyé à ${r.a}. je te prépare la relance pour le ${String(s?.relance?.le || '').split('-').reverse().slice(0, 2).join('/')}, elle attendra ton feu vert.`;
}
