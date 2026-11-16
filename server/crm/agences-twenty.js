// Le tableau « Agences » de Twenty CRM (16 nov. 2026, Jules : « je veux que ce tableau soit sur Twenty, dans un autre
// tableau que tu vas nommer Agences »). Les agences et mandataires des listes de la Prospection, une ligne chacun, une
// vue par ville. Klocka écrit, Twenty montre : c'est là que Jules trie les agences une par une.
//
// Sens unique, Klocka vers Twenty. Une ligne déjà posée garde son id Twenty sur l'agence (`twenty_agence_id`) : rejouer
// met à jour ce que Klocka sait (statut, appels, relance, interlocuteurs) et ne recrée jamais une ligne que l'équipe a
// mise à la corbeille dans Twenty. Ce que Jules change dans Twenty (statut, suppression) ne revient pas encore à Klocka.
//
//   node --env-file=.env scripts/crm/agences-twenty.mjs        (montre ce qui serait fait)
//   node --env-file=.env scripts/crm/agences-twenty.mjs --go   (le fait)

import { Records } from '../db.js';
import { valeurOption, telephone } from './correspondance.js';

export const SINGULIER = 'agence';
export const PLURIEL = 'agences';
const AGENCE = 'AgenceProspect';

/** Les champs de l'objet, dans l'ordre des colonnes. */
export const CHAMPS = [
  { name: 'ville', label: 'Ville', type: 'SELECT', icon: 'IconMapPin' },
  { name: 'genre', label: 'Type', type: 'SELECT', icon: 'IconTag', options: [{ value: 'AGENCE', label: 'Agence', color: 'blue', position: 0 }, { value: 'MANDATAIRE', label: 'Mandataire', color: 'purple', position: 1 }] },
  { name: 'telephone', label: 'Téléphone', type: 'PHONES', icon: 'IconPhone' },
  { name: 'interlocuteurs', label: 'Interlocuteurs', type: 'TEXT', icon: 'IconUsers', description: 'Les personnes de l’agence : nom, fonction, téléphone (pages équipe, appels)' },
  { name: 'statut', label: 'Statut', type: 'TEXT', icon: 'IconProgress', description: 'Où en est l’équipe avec l’agence (Prospection de Klocka)' },
  { name: 'dernierAppel', label: 'Dernier appel', type: 'DATE_TIME', icon: 'IconPhoneCall' },
  { name: 'appelePar', label: 'Appelé par', type: 'TEXT', icon: 'IconUser' },
  { name: 'issue', label: 'Issue', type: 'TEXT', icon: 'IconFlag' },
  { name: 'relance', label: 'Relance', type: 'DATE', icon: 'IconCalendar' },
  { name: 'email', label: 'E-mail', type: 'EMAILS', icon: 'IconMail' },
  { name: 'siteWeb', label: 'Site', type: 'LINKS', icon: 'IconWorld' },
  { name: 'adresse', label: 'Adresse', type: 'TEXT', icon: 'IconMap' },
  { name: 'reseau', label: 'Réseau', type: 'TEXT', icon: 'IconNetwork' },
  { name: 'annonces', label: 'Annonces', type: 'NUMBER', icon: 'IconList' },
  { name: 'annoncesCommerce', label: 'Annonces commerce', type: 'NUMBER', icon: 'IconBuildingStore' },
  { name: 'sources', label: 'Sources', type: 'TEXT', icon: 'IconDatabase' },
  { name: 'klockaId', label: 'Id Klocka', type: 'TEXT', icon: 'IconKey', description: 'L’agence dans Klocka (AgenceProspect), posé par la synchronisation', cache: true },
];

/** Pure : l'option d'une ville. */
export const optionVille = (ville, position = 0) => ({ value: valeurOption(ville), label: ville, color: 'gray', position });

const url = (s) => {
  const t = String(s || '').trim();
  if (!t) return null;
  // Twenty retire la barre finale : on l'écrit comme il la garde, sinon chaque rejeu croit le lien changé.
  return (/^https?:\/\//i.test(t) ? t : `https://${t}`).replace(/\/+$/, '');
};

/** Pure : les interlocuteurs d'une agence en une ligne par personne. */
export function interlocuteurs(a) {
  const vus = new Set();
  const out = [];
  for (const p of [...(a.gerants || []), ...(a.agents || [])]) {
    const nom = String(p?.nom || '').trim();
    if (!nom || vus.has(nom.toLowerCase())) continue;
    vus.add(nom.toLowerCase());
    out.push([nom, p.fonction, p.telephone].filter(Boolean).join(' · '));
  }
  return out.join('\n');
}

/** Pure : la ligne Twenty d'une agence (`l` : sa ligne du tableau Prospection, server/crm/prospection.js). */
export function versTwenty(a, l) {
  const tel = telephone(a.telephone || (a.agents || []).find((x) => x.telephone)?.telephone || '');
  const site = url(a.site);
  return {
    name: l.name || a.nom || 'Sans nom',
    ville: l.ville ? valeurOption(l.ville) : null,
    genre: a.genre === 'mandataire' ? 'MANDATAIRE' : 'AGENCE',
    telephone: tel || { primaryPhoneNumber: '', primaryPhoneCountryCode: '', primaryPhoneCallingCode: '' },
    interlocuteurs: interlocuteurs(a),
    statut: l.statut || '',
    dernierAppel: l.dernierAppel ? new Date(l.dernierAppel).toISOString() : null,
    appelePar: l.appelePar || '',
    issue: l.issue || '',
    relance: l.relance ? String(l.relance).slice(0, 10) : null,
    email: { primaryEmail: String(a.email || '').trim().toLowerCase(), additionalEmails: [] },
    siteWeb: { primaryLinkUrl: site || '', primaryLinkLabel: '', secondaryLinks: [] },
    adresse: [a.adresse, a.code_postal].filter(Boolean).join(' ').trim(),
    reseau: a.reseau_nom || '',
    annonces: Number(a.annonces) || null,
    annoncesCommerce: Number(a.annonces_commerce) || null,
    sources: (a.sources || []).join(', '),
    klockaId: a.id,
  };
}

/** Pure : ce qui change d'une ligne posée (les champs que Klocka tient à jour, l'id et le nom exceptés). */
export function difference(avant, apres) {
  const vide = (x) => x == null || x === '' || (Array.isArray(x) && !x.length);
  const pareil = (x, y) => (vide(x) && vide(y)) || JSON.stringify(x) === JSON.stringify(y);
  const out = {};
  for (const [k, v] of Object.entries(apres)) {
    if (k === 'klockaId' || k === 'name') continue;
    const a = avant?.[k];
    // Un champ composé (téléphone, e-mail, lien) : seules les clés que Klocka écrit comptent.
    const change = v && typeof v === 'object' && !Array.isArray(v)
      ? Object.entries(v).some(([sk, sv]) => !pareil(a?.[sk], sv))
      : !pareil(a, v);
    if (change) out[k] = v;
  }
  return out;
}

/** Les agences de toutes les listes, avec leur ligne du tableau Prospection (statut compris). */
export async function agencesDesListes() {
  const IA = await import('../prospection/agent-ia.js');
  const P = await import('./prospection.js');
  const vues = new Set();
  const out = [];
  for (const liste of IA.listes()) {
    for (const a of IA.liste(liste.id)?.lignes || []) {
      if (a.fermee || vues.has(a.id)) continue;
      vues.add(a.id);
      out.push({ a, l: P.ligne(a, liste.ville), ville: liste.ville });
    }
  }
  return out;
}

/**
 * Pose les agences dans Twenty. `go` faux : compte seulement. Rend { nouvelles, majs, inchangees, corbeille }.
 * `T` : les verbes de server/twenty.js (remplacés dans les tests).
 */
export async function synchroniser({ go = false, T = null, journal = () => {} } = {}) {
  T = T || (await import('../twenty.js'));
  const toutes = await agencesDesListes();
  const posees = new Map((await T.lister(PLURIEL)).map((x) => [x.id, x]));
  const nouvelles = toutes.filter((x) => !x.a.twenty_agence_id);
  const res = { nouvelles: nouvelles.length, majs: 0, inchangees: 0, corbeille: 0 };
  for (const x of toutes.filter((y) => y.a.twenty_agence_id)) {
    const avant = posees.get(x.a.twenty_agence_id);
    if (!avant) { res.corbeille++; continue; }
    const diff = difference(avant, versTwenty(x.a, x.l));
    if (!Object.keys(diff).length) { res.inchangees++; continue; }
    res.majs++;
    if (go) await T.modifier(PLURIEL, avant.id, diff);
  }
  if (go && nouvelles.length) {
    for (let i = 0; i < nouvelles.length; i += T.LOT_MAX) {
      const lot = nouvelles.slice(i, i + T.LOT_MAX);
      const crees = await T.creerEnLot(PLURIEL, lot.map((x) => versTwenty(x.a, x.l)));
      const parKlocka = new Map(crees.map((c) => [c.klockaId, c.id]));
      for (const x of lot) {
        const id = parKlocka.get(x.a.id);
        if (id) Records.update(AGENCE, x.a.id, { twenty_agence_id: id });
      }
      journal(`  ${Math.min(i + T.LOT_MAX, nouvelles.length)} / ${nouvelles.length} posées`);
    }
  }
  return res;
}
