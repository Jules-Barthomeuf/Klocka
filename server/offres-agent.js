// L'agent immobilier d'un bien, pour « À l'attention de » en haut de la LOI (30 oct. 2026, Jules : « je vais
// chercher l'agent immobilier lié à la propriété dans Twenty et ça remplit en haut : le nom de l'agence, dessous
// représentée par l'agent, dessous l'adresse de l'agence »).
//
// La propriété du bien dans Twenty CRM (Propriétés, puis Propriétés Klocka), retrouvée par l'id Monday du dossier
// ou du projet, sinon par son adresse, porte le nom de son agent ; la fiche de l'agent (Agent immobilier) dit son
// agence ; l'adresse de l'agence vient du carnet des agences de la Prospection. Sans Twenty, ou sans propriété
// trouvée, l'agent relevé sur le dossier. Rien n'est écrit dans Twenty.

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const OBJETS = ['proprietesListe', 'proprietesKlockaListe'];
const MOTS_VOIE = new Set(['rue', 'avenue', 'boulevard', 'place', 'quai', 'cours', 'allee', 'chemin', 'route', 'impasse', 'square', 'passage', 'faubourg', 'fbg', 'des', 'les', 'saint', 'sainte', 'bis', 'ter', 'france']);

/**
 * Pure : de quoi retrouver une adresse dans Twenty. « 27 rue Lafayette, 31000 Toulouse » → { numero: '27',
 * motif: '%lafayette%', ville: 'toulouse' }. Le motif garde le mot le plus long de la voie ; une lettre accentuée
 * y devient « _ » (n'importe quelle lettre), Twenty ne comparant pas sans accents.
 */
export function cleAdresse(adresse) {
  const [rue = '', ...reste] = String(adresse || '').split(',');
  const numero = rue.match(/^\s*(\d+)/)?.[1] || null;
  const mots = rue.split(/[\s'’-]+/).filter((m) => m.length > 2 && !/\d/.test(m) && !MOTS_VOIE.has(norm(m)));
  const mot = mots.sort((a, b) => b.length - a.length)[0] || null;
  const ville = norm(reste.join(' ').replace(/\b\d{5}\b/g, '')) || null;
  return { numero, motif: mot ? `%${mot.toLowerCase().replace(/[^a-z0-9]/g, '_')}%` : null, ville };
}

/** Pure : la propriété de Twenty qui est ce bien (même numéro, même ville quand on la connaît), ou null. */
export function choisirPropriete(liste, { numero = null, ville = null } = {}) {
  const texte = (p) => norm([p.name, p.adresse?.addressStreet1, p.adresse?.addressCity].filter(Boolean).join(' '));
  const candidats = (liste || []).filter((p) => String(p.agentImmobilier || '').trim())
    .filter((p) => !numero || new RegExp(`(^|\\D)${numero}(\\D|$)`).test(texte(p)));
  return candidats.find((p) => ville && texte(p).includes(ville)) || candidats[0] || null;
}

/** Pure : l'adresse d'une agence du carnet, sur une ligne. */
export function adresseAgence(a) {
  if (!a?.adresse) return null;
  const cp = [a.code_postal, a.ville].filter(Boolean).join(' ');
  return a.code_postal && String(a.adresse).includes(a.code_postal) ? a.adresse : [a.adresse, cp].filter(Boolean).join(', ');
}

/** Pure : les trois lignes du haut de la lettre. Sans agence, l'agent seul. */
export function lignesAttention({ agent = null, agence = null, adresse = null }) {
  if (!agent && !agence) return null;
  return {
    attention_nom: agence || agent,
    attention_representant: agence && agent ? `Représentée par ${agent}` : null,
    attention_adresse: adresse || null,
  };
}

async function depuisTwenty({ mondayIds, adresse }) {
  const T = await import('./twenty.js');
  if (!T.twentyConfigure()) return null;
  let propriete = null;
  for (const id of mondayIds) {
    for (const o of OBJETS) {
      const x = await T.trouver(o, { mondayId: String(id) });
      if (String(x?.agentImmobilier || '').trim()) { propriete = x; break; }
    }
    if (propriete) break;
  }
  if (!propriete && adresse) {
    const { numero, motif, ville } = cleAdresse(adresse);
    if (motif) {
      const f = `or(name[ilike]:${JSON.stringify(motif)},adresse.addressStreet1[ilike]:${JSON.stringify(motif)})`;
      for (const o of OBJETS) {
        propriete = choisirPropriete(await T.lister(o, { filtre: f, limite: 50 }), { numero, ville });
        if (propriete) break;
      }
    }
  }
  if (!propriete) return null;
  // Une propriété peut nommer plusieurs agents : le premier.
  const nom = String(propriete.agentImmobilier).split(/[,;]/)[0].trim();
  const [fiche] = await T.lister('agentImmobilierListe', { filtre: `name[ilike]:${JSON.stringify(`%${nom.replace(/[^\x20-\x7e]/g, '_')}%`)}`, limite: 1 });
  return {
    agent: fiche?.name || nom,
    agence: String(fiche?.entreprise || '').trim() || null,
    ville: fiche?.ville || null,
    email: fiche?.eMail?.primaryEmail || null,
    origine: 'crm',
    propriete: propriete.name || null,
  };
}

/** L'agent relevé sur le dossier (la fiche reçue, son expéditeur), faute de Twenty. */
async function depuisDossier(deal) {
  if (!deal) return null;
  const r = deal.agent_rattache || {};
  const email = deal.contact_agent_email || r.email || null;
  const { agentParAdresse } = await import('./layer-sources.js');
  const local = email ? agentParAdresse(email) : null;
  const agent = deal.apercu?.agent_nom || r.nom || (local ? [local.prenom, local.nom_famille].filter(Boolean).join(' ') || local.nom : null);
  const agence = deal.apercu?.agence || r.agence || local?.agence || null;
  if (!agent && !agence) return null;
  return { agent, agence, ville: local?.ville || null, email, origine: 'dossier' };
}

const cache = new Map();
const DUREE_CACHE = 10 * 60 * 1000;

/**
 * Les lignes « À l'attention de » d'un bien : { champs: { attention_nom, attention_representant, attention_adresse },
 * origine: 'crm' | 'dossier', propriete? } ou null. Ne lève jamais : sans réponse de Twenty en quinze secondes, le
 * dossier seul.
 */
export async function attentionDuBien({ projet = null, deal = null } = {}) {
  const adresse = [projet?.adresse_complete, projet?.ville_secteur_champ1].filter(Boolean).join(', ') || null;
  const mondayIds = [projet?.monday_item_id, deal?.monday_item_id].filter(Boolean);
  const cle = `${projet?.id || ''}|${deal?.deal_id || ''}`;
  const garde = cache.get(cle);
  if (garde && Date.now() - garde.le < DUREE_CACHE) return garde.valeur;
  let trouve = null;
  try {
    const { champsDepuisDeal } = await import('./ak/loi.js');
    const adresseBien = adresse || (deal ? champsDepuisDeal(deal).adresse_bien : null);
    trouve = await Promise.race([depuisTwenty({ mondayIds, adresse: adresseBien }), new Promise((ok) => setTimeout(() => ok(null), 15000))]);
  } catch (e) {
    console.warn(`[offres] agent du bien dans Twenty CRM : ${e?.message || e}`);
  }
  if (!trouve) trouve = await depuisDossier(deal).catch(() => null);
  let valeur = null;
  if (trouve) {
    const { agenceDe } = await import('./layer-sources.js');
    const fiche = trouve.agence ? agenceDe({ agence: trouve.agence, ville: trouve.ville }) : null;
    const champs = lignesAttention({ agent: trouve.agent, agence: fiche?.nom || trouve.agence, adresse: adresseAgence(fiche) });
    if (champs) valeur = { champs, origine: trouve.origine, ...(trouve.propriete ? { propriete: trouve.propriete } : {}) };
  }
  cache.set(cle, { le: Date.now(), valeur });
  return valeur;
}

/** Pure : les lignes du haut à poser, seulement quand la lettre n'en a encore aucune. */
export function attentionAPoser(champs, trouve) {
  if (!trouve?.champs) return {};
  const vide = ['attention_nom', 'attention_representant', 'attention_adresse'].every((k) => champs?.[k] == null || champs[k] === '');
  return vide ? Object.fromEntries(Object.entries(trouve.champs).filter(([, v]) => v)) : {};
}
