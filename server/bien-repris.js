// Importer un bien qu'on a déjà (4 nov. 2026, Jules : « on arrive, on crée un bien ; un chat te pose des questions :
// l'adresse, le type de bien ; on fait un vocal, on explique toute la situation, j'ai fait la visite début septembre,
// ensuite j'ai signé le mandat… ; ça crée l'historique, ça met à jour l'étape actuelle ; ensuite il dit d'importer tout
// ce qu'on a, avis de valeur, mandat ; on n'a pas encore signé le mandat : voulez-vous que je crée une relance »).
//
// « Importer » crée la fiche tout de suite et ouvre sa vue d'ensemble : le chat à gauche la remplit. L'outil
// `reprendre_bien` écrit ce que le mandataire a raconté et confirmé : la fiche (adresse, type, propriétaire, chiffres),
// les jalons datés (l'historique du bien) et l'étape actuelle. Les documents se déposent dans la vue d'ensemble (« + »)
// ou se joignent au chat ; ils se rangent dans les documents du bien (server/documents-du-bien.js).

import { Records } from './db.js';
import { creerProprietaire } from './mandataire-espace.js';

/** Les jalons qu'un récit peut dater, avec leur mot dans l'historique et leur étape. */
export const JALONS = {
  visite: ['Visite faite', 'previsite'],
  avis_envoye: ['Avis de valeur envoyé au propriétaire', 'estimation'],
  avis_accepte: ['Avis de valeur accepté par le propriétaire', 'estimation'],
  mandat_envoye: ['Mandat envoyé au propriétaire', 'mandat'],
  mandat_signe: ['Mandat signé', 'mandat'],
  mise_en_vente: ['Bien mis en vente', 'marche'],
  offre: ['Offre reçue', 'offre'],
  compromis: ['Compromis signé', 'vente'],
  vente: ['Vente signée', 'vente'],
};
const ETAPES = ['previsite', 'estimation', 'mandat', 'dataroom', 'marche', 'offre', 'vente'];
// La dernière étape franchie (`biens.validee`) quand on est à celle-ci : celle d'avant, avec son ancien mot pour l'avis.
const FRANCHIE_AVANT = { previsite: null, estimation: 'previsite', mandat: 'avis_accepte', dataroom: 'mandat', marche: 'dataroom', offre: 'marche', vente: 'offre' };
const TYPES = new Set(['murs_commerce', 'fonds_commerce', 'bureaux']);
// Le rang d'une étape franchie (`biens.validee`), comme src/lib/biens-mandataire.js : une reprise ne fait jamais reculer
// le bien (4 nov. 2026, Jules : le mandat importé, puis « 4 contacts », ne le ramènent pas en arrière).
const RANGS = { rdv: -1, visite: 0, estimation: 0, previsite: 0, prix_accord: 1, avis_accepte: 1, mandat: 2, analyse: 2, dataroom: 3, marche: 4, offre: 5, vente: 6 };
const rang = (v) => (v == null ? -1 : RANGS[v] ?? -1);
/** Pure : la plus avancée des deux étapes franchies. */
export const auPlusLoin = (actuelle, nouvelle) => (rang(nouvelle) > rang(actuelle) ? nouvelle : actuelle);
/** Pure : ce qu'un document importé prouve sur un bien en import : un mandat, qu'il est signé ; un avis, la visite faite. */
export const franchiParDocument = (nature) => (nature === 'mandat' ? 'mandat' : nature === 'avis' ? 'previsite' : null);

const email = (user) => String(user?.email || '').toLowerCase();
const date = (v) => {
  const t = String(v || '').trim();
  const m = t.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3] || '01'}T09:00:00.000Z` : null;
};
const nombre = (v) => (Number(v) > 0 ? Math.round(Number(v)) : null);

/** Un bien à importer : sa fiche, vide, ouverte dans Biens (statut rdv_pris), marquée pour l'assistant. */
export function creerBienAImporter(user) {
  const r = creerProprietaire({ commerce: 'Nouveau bien', statut: 'rdv_pris' }, user);
  if (!r.ok) return r;
  const p = Records.update('ProprietaireMandataire', r.proprietaire.id, {
    prochaine_action: null, prochaine_action_le: null,
    biens: { ...(r.proprietaire.biens || {}), import: { le: new Date().toISOString() } },
  });
  return { ok: true, proprietaire: p };
}

/** Pure : ce que le récit change sur la fiche, depuis l'entrée de l'outil. Rend { maj, jalons, etape }. */
export function repriseDe(p, input = {}) {
  const biens = { ...(p?.biens || {}) };
  const maj = {};
  for (const k of ['adresse', 'ville', 'telephone', 'email', 'activite']) if (String(input[k] || '').trim()) maj[k] = String(input[k]).trim();
  if (String(input.proprietaire || '').trim()) maj.nom = String(input.proprietaire).trim();
  const commerce = String(input.commerce || '').trim();
  if (commerce) maj.commerce = commerce;
  // Le bien prend le nom de son adresse (4 nov. 2026, Jules : « au lieu de Nouveau bien, l'adresse du bien »).
  else if (p?.commerce === 'Nouveau bien' && (maj.adresse || maj.activite)) maj.commerce = maj.adresse || maj.activite;
  if (TYPES.has(input.type_bien)) maj.type_bien = input.type_bien;
  // Les chiffres dits : ils s'affichent en tête de la vue d'ensemble tant qu'aucun avis ne les porte.
  const repris = { ...(biens.repris || {}) };
  for (const [k, v] of [['prix', input.prix], ['loyer_annuel', input.loyer_annuel], ['surface', input.surface], ['ca', input.ca], ['ebe', input.ebe]]) if (nombre(v)) repris[k] = nombre(v);
  if (Object.keys(repris).length) biens.repris = repris;
  const jalons = [];
  for (const j of Array.isArray(input.jalons) ? input.jalons : []) {
    const quoi = JALONS[j?.quoi] ? j.quoi : 'autre';
    const le = date(j?.date);
    const texte = String(j?.texte || '').trim() || (JALONS[quoi]?.[0] ?? '');
    if (!le || !texte) continue;
    jalons.push({ le, quoi, texte: quoi === 'autre' ? texte : JALONS[quoi][0], etape: JALONS[quoi]?.[1] || null, detail: quoi === 'autre' ? null : String(j?.texte || '').trim() || null });
  }
  const deja = biens.jalons || [];
  const nouveaux = jalons.filter((j) => !deja.some((x) => x.quoi === j.quoi && x.le === j.le && x.texte === j.texte));
  if (nouveaux.length) biens.jalons = [...deja, ...nouveaux].sort((a, b) => a.le.localeCompare(b.le));
  const etape = ETAPES.includes(input.etape_actuelle) ? input.etape_actuelle : null;
  if (etape) biens.validee = auPlusLoin(biens.validee, FRANCHIE_AVANT[etape]);
  if (nombre(input.prix) && ['mandat', 'dataroom', 'marche', 'offre', 'vente'].includes(etape) && !biens.prix_accord) biens.prix_accord = nombre(input.prix);
  if (etape && biens.import) biens.import = { ...biens.import, repris_le: new Date().toISOString() };
  return { maj: { ...maj, biens }, jalons: nouveaux, etape };
}

export const OUTIL_REPRENDRE = {
  name: 'reprendre_bien',
  description:
    "Le bien qu'il importe, ouvert à l'écran (« Importer un bien ») : écrit ce qu'il a raconté et CONFIRMÉ (son oui à ton résumé) ; l'adresse et le type, eux, s'écrivent dès qu'il les dit. L'adresse, le type (murs_commerce, fonds_commerce, bureaux), le commerce ou l'activité, le propriétaire et ses coordonnées, les chiffres dits, chaque événement daté qu'il a raconté (jalons : la visite, l'avis envoyé, accepté, le mandat envoyé, signé, la mise en vente, une offre, le compromis) et l'étape où le bien en est aujourd'hui. N'invente rien : une date approximative (« début septembre ») se met au 1er du mois ; sans date, pas de jalon. Un appel peut ne porter qu'une partie : on complète au fil de l'échange.",
  input_schema: {
    type: 'object',
    properties: {
      adresse: { type: 'string' }, ville: { type: 'string' },
      type_bien: { type: 'string', enum: ['murs_commerce', 'fonds_commerce', 'bureaux'] },
      commerce: { type: 'string', description: "L'enseigne ou l'activité du commerce en place" },
      activite: { type: 'string' },
      proprietaire: { type: 'string', description: 'Le propriétaire (des murs, ou le cédant du fonds)' },
      telephone: { type: 'string' }, email: { type: 'string' },
      prix: { type: 'number', description: "Le prix du mandat ou la valeur de l'avis, en euros" },
      loyer_annuel: { type: 'number' }, surface: { type: 'number' }, ca: { type: 'number' }, ebe: { type: 'number' },
      etape_actuelle: { type: 'string', enum: ETAPES, description: "L'étape où il en est : previsite (visite à faire), estimation (avis à faire, à envoyer, ou en attente de la réponse), mandat (avis accepté, mandat à faire signer), dataroom (mandat signé, pièces à réunir), marche (en vente), offre (offres reçues), vente (compromis ou acte)" },
      jalons: {
        type: 'array',
        items: { type: 'object', properties: { quoi: { type: 'string', enum: [...Object.keys(JALONS), 'autre'] }, date: { type: 'string', description: 'AAAA-MM-JJ' }, texte: { type: 'string', description: "Ce qui s'est passé, en quelques mots (pour « autre », ou un détail)" } }, required: ['quoi', 'date'] },
      },
    },
  },
};

/** L'outil, sur la fiche ouverte. */
export function executerReprise(input, user, { fiche = null } = {}) {
  const p = fiche?.id ? Records.get('ProprietaireMandataire', fiche.id) : null;
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Aucun bien ouvert.' };
  const { maj, jalons, etape } = repriseDe(p, input);
  const historique = [...(p.historique || []), ...jalons.map((j) => ({ le: j.le, type: 'jalon', texte: j.texte }))];
  Records.update('ProprietaireMandataire', p.id, { ...maj, historique });
  const suite = {
    previsite: 'Propose de préparer la visite.',
    estimation: "Demande s'il veut que tu rédiges l'avis de valeur, ou, s'il est envoyé, de noter la relance du propriétaire.",
    mandat: "Le mandat n'est pas encore signé : propose une relance du propriétaire (noter_relance) à une date qu'il choisit.",
    dataroom: 'Le mandat est signé : propose de préparer le mail au propriétaire pour réunir les pièces de la Data room.',
    marche: 'Le bien est en vente : propose de composer le teaser.',
    offre: 'Demande les offres reçues (montant, conditions).',
    vente: "Demande la date de l'acte.",
  }[etape];
  return {
    ok: true, fiche_id: p.id, jalons_ajoutes: jalons.length, etape: etape || null,
    fait: `Fiche à jour${jalons.length ? `, ${jalons.length} événement${jalons.length > 1 ? 's' : ''} dans l'historique` : ''}${etape ? `, étape actuelle : ${etape}` : ''}. Dis-le en une ligne, puis demande d'importer ce qu'il a avec « + » dans Documents (l'avis de valeur, le mandat, le bail…) ou en les joignant ici.${suite ? ` Ensuite : ${suite}` : ''}`,
  };
}

/** Ce que l'assistant sait d'un bien en cours d'import : sa tâche, ce qui manque encore. */
export function cadreImport(p) {
  if (!p?.biens?.import || p.biens.import.fini) return '';
  const manque = [
    !p.adresse && "l'adresse",
    !p.type_bien && 'le type de bien (murs commerciaux, fonds de commerce ou bureaux)',
    !p.biens.import.repris_le && 'où il en est (son récit : la visite, l’avis, le mandat, avec les dates)',
  ].filter(Boolean);
  return `\n\nCE BIEN EST EN COURS D'IMPORT (le mandataire l'a déjà, il le fait entrer dans Klocka) : tu remplis sa fiche avec lui. ${manque.length ? `Il manque encore : ${manque.join(', ')}. Demande-le en une ou deux lignes (il peut tout dire en un vocal).` : 'La fiche est remplie.'} L'adresse et le type, dès qu'il les dit : reprendre_bien tout de suite avec eux seuls, sans attendre de oui (le bien prend son adresse pour nom, à l'écran ; 4 nov. 2026, Jules). Quand il a raconté, résume en trois lignes (le bien, les événements datés, l'étape d'aujourd'hui) et attends son oui, puis reprendre_bien. L'étape d'aujourd'hui se DÉDUIT de ce qu'il dit, sans la redemander : des contacts ou des visites d'acquéreurs, des investisseurs relancés, le bien diffusé = mandat signé et Commercialisation (marche) ; une offre = offre ; un compromis = vente ; un mandat importé = mandat signé au moins. Ne la demande que si rien ne la dit. Puis demande d'importer ce qu'il a : avis de valeur, mandat, bail, et les pièces de la Data room (en bas de la vue d'ensemble).`;
}

/** L'import du bien est fini : le chat du milieu se retire de la vue d'ensemble. */
export function finirImport(proprietaireId, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Bien introuvable.' };
  if (!p.biens?.import) return { ok: true };
  Records.update('ProprietaireMandataire', p.id, { biens: { ...p.biens, import: { ...p.biens.import, fini: new Date().toISOString() } } });
  return { ok: true };
}
