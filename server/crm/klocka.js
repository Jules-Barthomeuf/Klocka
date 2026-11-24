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

// Un mail ou un téléphone ne suffit pas : le standard de l'agence ou contact@agence est partagé par toute l'équipe
// (23 nov. 2026 : « Claire Vasseur » de Twenty ouvrait la fiche de Sophie Martin, sa collègue au même numéro). Le
// rattachement par contact n'est gardé que si c'est la même personne : même nom de famille, ou un agent du carnet sans
// vrai nom (né d'une adresse mail). L'id Monday, lui, suffit : la ligne de Twenty vient de cette ligne-là.
const CIVILITES = new Set(['m', 'mr', 'mme', 'mlle', 'madame', 'monsieur', 'mademoiselle', 'me', 'maitre']);
const mots = (t) => norm(t).split(' ').filter((m) => m.length >= 2 && !CIVILITES.has(m));
const nomsDuCarnet = (a) => [a.nom, [a.prenom, a.nom_famille].filter(Boolean).join(' ')].filter((n) => n && !String(n).includes('@'));

/** Pure : la ligne de Twenty et l'agent du carnet sont-ils la même personne ? */
export function memePersonne(t, a) {
  const noms = nomsDuCarnet(a);
  if (!noms.length) return true;
  const deTwenty = mots([t?.prenom, typeof t?.name === 'string' ? t.name : [t?.name?.firstName, t?.name?.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' '));
  if (!deTwenty.length) return true;
  return noms.some((n) => {
    const k = mots(n);
    return k.length && (deTwenty.includes(k[k.length - 1]) || k.includes(deTwenty[deTwenty.length - 1]));
  });
}

/** Pure : l'agent du carnet d'une ligne de Twenty, ou null. */
export function agentPour(t, agents = []) {
  if (!t) return null;
  const { mails, tels } = contactsTwenty(t);
  const parMonday = t.mondayId && agents.find((a) => String(a.monday_ligne_id || '') === String(t.mondayId));
  if (parMonday) return parMonday;
  const parMail = mails.length && agents.find((a) => (a.emails || []).some((m) => mails.includes(bas(m))) && memePersonne(t, a));
  if (parMail) return parMail;
  const parTel = tels.length && agents.find((a) => (a.telephones || []).some((x) => tels.includes(chiffres(x))) && memePersonne(t, a));
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
    if (a) retenirNomCrm('AgentImmo', a, t);
    return a ? { type: 'agent', id: a.id } : null;
  }
  const d = clientPour(t, Records.list('DemandeClient'));
  if (d) retenirNomCrm('DemandeClient', d, t);
  return d ? { type: 'client', id: d.id } : null;
}

/** Pure : le nom d'une ligne de Twenty (« Alexis Petit »), ou null. */
export function nomTwenty(t) {
  const n = typeof t?.name === 'string' ? t.name : [t?.name?.firstName, t?.name?.lastName].filter(Boolean).join(' ');
  return String(n || '').replace(/\s+/g, ' ').trim() || null;
}

// Le nom écrit dans Twenty fait foi sur la fiche (23 nov. 2026, Jules : « le CRM montre Alexis Petit, sa fiche
// Apetit Agducentre ; le nom de la fiche doit être celui de Twenty »). Un agent du carnet né d'une adresse mail porte
// un nom deviné ; celui du CRM est gardé à côté (`nom_crm`) et la fiche le lit d'abord. Le carnet n'est pas réécrit.
// L'id de la ligne de Twenty est gardé aussi (`twenty_id`) : les agents préférés se retrouvent dans le CRM par lui.
function retenirNomCrm(entite, r, t) {
  const n = nomTwenty(t);
  const patch = {};
  if (n && n !== r.nom_crm) patch.nom_crm = n;
  if (entite === 'AgentImmo' && t?.id && t.id !== r.twenty_id) patch.twenty_id = t.id;
  if (Object.keys(patch).length) Records.update(entite, r.id, patch);
}

/**
 * Les agents préférés de l'équipe, en ids de Twenty, les miens d'abord (23 nov. 2026, Jules : « dans Agent immobilier,
 * les agents favoris en haut de la liste »). Une étoile sur un agent du CRM porte son id ; sur un agent de Klocka, son
 * `twenty_id`, sinon sa ligne cherchée par ses adresses (une lecture, gardée ensuite).
 */
export async function favorisTwenty(email, { requete = null } = {}) {
  const moi = bas(email);
  const etoiles = Records.list('AgentPrefere').sort((a, b) => Number(b.par === moi) - Number(a.par === moi) || String(b.le).localeCompare(String(a.le)));
  const ids = [];
  const aChercher = [];
  for (const e of etoiles) {
    const c = String(e.cle || '');
    if (c.startsWith('twenty:agentImmobilier:')) ids.push(c.slice(23));
    else if (c.startsWith('agent:')) {
      const a = Records.get('AgentImmo', c.slice(6));
      if (a?.twenty_id) ids.push(a.twenty_id);
      else if (a && (a.emails || []).length) { aChercher.push(a); ids.push(`agent:${a.id}`); }
    }
  }
  if (aChercher.length) {
    const appel = requete || (await import('../twenty.js')).requeteTwenty;
    const mails = [...new Set(aChercher.flatMap((a) => (a.emails || []).map(bas)))].slice(0, 60);
    const r = await appel('GET', `/${AGENTS}?limit=100&depth=0&filter=${encodeURIComponent(`eMail.primaryEmail[in]:[${mails.map((m) => JSON.stringify(m)).join(',')}]`)}`).catch(() => null);
    for (const t of r?.data?.[AGENTS] || []) {
      const a = agentPour(t, aChercher);
      if (!a) continue;
      retenirNomCrm('AgentImmo', a, t);
      const i = ids.indexOf(`agent:${a.id}`);
      if (i >= 0) ids[i] = t.id;
    }
  }
  return [...new Set(ids.filter((x) => !x.startsWith('agent:')))];
}

/**
 * Le nom de Twenty posé sur tous les agents et clients rattachés, sans attendre un clic (23 nov. 2026, Jules : « vérifie
 * que c'est pareil pour tous les agents »). Twenty est lu, jamais écrit. Une pause toutes les 25 lignes : le serveur
 * reste libre. Rend { agents, clients } : combien de noms ont changé.
 */
export async function nommerDepuisTwenty({ lister = null } = {}) {
  const lecture = lister || (await import('../twenty.js')).lister;
  const pause = () => new Promise((r) => setImmediate(r));
  const compte = { agents: 0, clients: 0 };
  const passe = async (pluriel, entite, trouver, quoi) => {
    const lignes = await lecture(pluriel);
    for (const [i, t] of lignes.entries()) {
      if (i % 25 === 0) await pause();
      const r = trouver(t);
      if (r && nomTwenty(t) && nomTwenty(t) !== r.nom_crm) { retenirNomCrm(entite, r, t); compte[quoi]++; }
    }
  };
  const agents = Records.list('AgentImmo').filter((x) => !x.essai);
  await passe(AGENTS, 'AgentImmo', (t) => agentPour(t, agents), 'agents');
  const demandes = Records.list('DemandeClient');
  await passe(CLIENTS, 'DemandeClient', (t) => clientPour(t, demandes), 'clients');
  return compte;
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
