// Les fiches de Klocka dans le CRM (6 nov. 2026, Jules : « dans le CRM, je veux pouvoir cliquer sur un agent et avoir
// la fiche comme dans Relations, et les clients pareil ; mets la carte de la France dans un tableau de bord, connectée
// aux clients dans Twenty, déconnectée de Monday »). Une ligne de Twenty retrouve sa fiche de Klocka : un agent du
// carnet (AgentImmo) par son id Monday, son mail, son téléphone ou son nom ; un client (DemandeClient) par son id
// Twenty ou Monday. La carte lit les clients de Twenty seuls, avec les coordonnées de leur Localisation.

import fs from 'node:fs';
import { Records } from '../db.js';

const AGENTS = 'agentImmobilierListe';
const CLIENTS = 'clientsListe';
const bas = (t) => String(t || '').trim().toLowerCase();
const norm = (t) => bas(t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// Les neuf derniers chiffres : « +33 6 12… », « 06 12… » et « 0612… » se rejoignent.
const chiffres = (t) => String(t || '').replace(/\D/g, '').slice(-9);

/** Pure : les mails et les téléphones d'une ligne de Twenty. */
export function contactsTwenty(t) {
  const mails = [t?.eMail?.primaryEmail, ...(t?.eMail?.additionalEmails || [])].map(bas).filter(Boolean);
  const tels = [t?.telephone?.primaryPhoneNumber, ...(t?.telephone?.additionalPhones || []).map((p) => p?.number || p)].map(chiffres).filter((x) => x.length === 9);
  return { mails, tels };
}

/** Pure : l'agent du carnet d'une ligne de Twenty, ou null. */
export function agentPour(t, agents = []) {
  if (!t) return null;
  const { mails, tels } = contactsTwenty(t);
  const parMonday = t.mondayId && agents.find((a) => String(a.monday_ligne_id || '') === String(t.mondayId));
  if (parMonday) return parMonday;
  const parMail = mails.length && agents.find((a) => (a.emails || []).some((m) => mails.includes(bas(m))));
  if (parMail) return parMail;
  const parTel = tels.length && agents.find((a) => (a.telephones || []).some((x) => tels.includes(chiffres(x))));
  if (parTel) return parTel;
  const nom = norm([t.prenom, t.name].filter(Boolean).join(' '));
  const seul = norm(t.name);
  return agents.find((a) => {
    const n = norm([a.prenom, a.nom_famille].filter(Boolean).join(' ') || a.nom);
    return n && (n === nom || n === seul);
  }) || null;
}

/** Pure : le client de Klocka d'une ligne de Twenty, ou null. */
export function clientPour(t, demandes = []) {
  if (!t) return null;
  return demandes.find((d) => d.twenty_id && d.twenty_id === t.id)
    || (t.mondayId && demandes.find((d) => String(d.monday_id || '') === String(t.mondayId)))
    || null;
}

/** La fiche de Klocka d'une ligne du CRM : `{ type: 'agent' | 'client', id }`, ou null s'il n'y en a pas. */
export async function ficheKlocka(singulier, id, { lire = null } = {}) {
  const pluriel = singulier === 'agentImmobilier' ? AGENTS : singulier === 'clients' ? CLIENTS : null;
  if (!pluriel) return null;
  const lecture = lire || (await import('../twenty.js')).lire;
  const t = await lecture(pluriel, id);
  if (singulier === 'agentImmobilier') {
    const a = agentPour(t, Records.list('AgentImmo').filter((x) => !x.essai));
    return a ? { type: 'agent', id: a.id } : null;
  }
  const d = clientPour(t, Records.list('DemandeClient'));
  return d ? { type: 'client', id: d.id } : null;
}

let libellesStatut = null;
const statutLu = (v) => {
  if (!libellesStatut) {
    try {
      const o = JSON.parse(fs.readFileSync(new URL('../../crm/schema.json', import.meta.url), 'utf8')).objets.find((x) => x.nameSingular === 'clients');
      libellesStatut = Object.fromEntries((o?.champs.find((c) => c.name === 'statutClient')?.options || []).map((x) => [x.value, x.label]));
    } catch { libellesStatut = {}; }
  }
  return v ? libellesStatut[v] || v : null;
};

/** Pure : le point d'un client de Twenty, ou null sans coordonnées. */
export function pointClient(t, pos, klocka = null) {
  if (!pos) return null;
  const l = t.localisation || {};
  return { id: t.id, lat: pos.lat, lon: pos.lon, titre: t.name || 'Client', sous: [l.addressCity || l.addressStreet1 || null, statutLu(t.statutClient)].filter(Boolean).join(' · '), klocka };
}

let garde = null;
/** Les clients de Twenty sur la carte, gardés cinq minutes. Une Localisation sans coordonnées se géolocalise par sa ville. */
export async function carteClients({ frais = false } = {}) {
  if (!frais && garde && Date.now() - garde.le < 5 * 60_000) return garde.valeur;
  const { lister } = await import('../twenty.js');
  const { geolocaliser } = await import('../carte.js');
  const demandes = Records.list('DemandeClient');
  const points = [];
  let sans = 0;
  for (const t of await lister(CLIENTS)) {
    const l = t.localisation || {};
    let pos = Number.isFinite(l.addressLat) && Number.isFinite(l.addressLng) ? { lat: l.addressLat, lon: l.addressLng } : null;
    const lieu = l.addressCity || l.addressStreet1 || null;
    if (!pos && lieu) pos = await geolocaliser(lieu, { monde: true }).catch(() => null);
    const p = pointClient(t, pos, clientPour(t, demandes)?.id || null);
    if (p) points.push(p); else sans += 1;
  }
  garde = { le: Date.now(), valeur: { clients: points, sans_lieu: sans } };
  return garde.valeur;
}
