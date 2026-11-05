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
import { relanceAvant } from './biens-import.js';

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
const TYPES = new Set(['murs_commerce', 'fonds_commerce', 'bureaux', 'murs_et_fonds']);
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
  // Un bien qu'on fait entrer porte « adresse, ville » (4 nov. 2026, Jules), même quand on dit son commerce ; renommable.
  if (biens.import && !p?.nom_bien && maj.adresse) maj.nom_bien = [maj.adresse, maj.ville || p?.ville].filter(Boolean).join(', ');
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
  // La date de visite (4 nov. 2026) : un jalon, comme le reste du récit.
  const visite = date(input.visite_le);
  if (visite && !jalons.some((j) => j.quoi === 'visite')) jalons.push({ le: visite, quoi: 'visite', texte: JALONS.visite[0], etape: JALONS.visite[1], detail: null });
  // Le mandat lu ou raconté (4 nov. 2026, Jules : « il m'a donné son mandat, c'est bon ») : ses dates, son enseigne ;
  // il fait au moins l'étape mandat signé. Signé ailleurs : la relance « Re-signer chez K Partners » avant l'échéance.
  const mi = input.mandat && typeof input.mandat === 'object' ? input.mandat : null;
  let mandat = p?.mandat_importe || null;
  if (mi && Object.values(mi).some((v) => v != null && v !== '')) {
    mandat = { ...(mandat || {}) };
    for (const k of ['numero', 'enseigne', 'honoraires']) if (String(mi[k] || '').trim()) mandat[k] = String(mi[k]).trim();
    for (const k of ['signe_le', 'echeance']) if (date(mi[k])) mandat[k] = date(mi[k]).slice(0, 10);
    if (typeof mi.exclusif === 'boolean') mandat.exclusif = mi.exclusif;
    if (nombre(input.prix)) mandat.prix = nombre(input.prix);
    mandat.k_partners = !mandat.enseigne || /k ?partners|klocka/i.test(mandat.enseigne);
    mandat.importe_le = mandat.importe_le || new Date().toISOString();
    if (mandat.signe_le && !jalons.some((j) => j.quoi === 'mandat_signe')) jalons.push({ le: `${mandat.signe_le}T09:00:00.000Z`, quoi: 'mandat_signe', texte: JALONS.mandat_signe[0], etape: JALONS.mandat_signe[1], detail: mandat.enseigne && !mandat.k_partners ? `chez ${mandat.enseigne}` : null });
    maj.mandat_importe = mandat;
  }
  const deja = biens.jalons || [];
  const nouveaux = jalons.filter((j) => !deja.some((x) => x.quoi === j.quoi && x.le === j.le && x.texte === j.texte));
  if (nouveaux.length) biens.jalons = [...deja, ...nouveaux].sort((a, b) => a.le.localeCompare(b.le));
  let etape = ETAPES.includes(input.etape_actuelle) ? input.etape_actuelle : null;
  // Un mandat K Partners fait au moins la Data room ; signé ailleurs, il reste à re-signer chez K Partners (l'étape Mandat).
  const plancher = maj.mandat_importe ? (maj.mandat_importe.k_partners === false ? 'mandat' : 'dataroom') : null;
  if (plancher && (!etape || ETAPES.indexOf(etape) < ETAPES.indexOf(plancher))) etape = plancher;
  if (etape) biens.validee = auPlusLoin(biens.validee, FRANCHIE_AVANT[etape]);
  if (etape && ETAPES.indexOf(etape) >= ETAPES.indexOf('dataroom')) maj.statut = 'mandat_signe';
  if (mandat && mandat.k_partners === false && !p?.prochaine_action_le) {
    maj.prochaine_action = 'Re-signer le mandat chez K Partners';
    maj.prochaine_action_le = relanceAvant(mandat.echeance);
  }
  if (nombre(input.prix) && ['mandat', 'dataroom', 'marche', 'offre', 'vente'].includes(etape) && !biens.prix_accord) biens.prix_accord = nombre(input.prix);
  if (etape && biens.import) biens.import = { ...biens.import, repris_le: new Date().toISOString() };
  return { maj: { ...maj, biens }, jalons: nouveaux, etape };
}


const NATURES_DOC = ['avis', 'mandat', 'bail', 'quittances', 'bilans', 'taxe_fonciere', 'diagnostics', 'copropriete', 'charges', 'titre', 'plans', 'kbis', 'photos', 'autres'];

export const OUTIL_REPRENDRE = {
  name: 'reprendre_bien',
  description:
    "Le bien qu'il fait entrer, ouvert à l'écran : écrit ce qu'il a raconté ou ce que ses documents disent. L'adresse et le type s'écrivent dès qu'il les dit ; le reste après ton résumé et son oui. L'adresse, le type (murs_commerce, fonds_commerce, bureaux, murs_et_fonds quand on vend les deux), le commerce ou l'activité, le propriétaire et ses coordonnées, les chiffres, la date de visite, le mandat (lu dans le PDF joint ou raconté : numéro, signé le, échéance, exclusif, enseigne, honoraires), chaque événement daté (jalons) et l'étape où le bien en est aujourd'hui. N'invente rien : une date approximative (« début septembre ») se met au 1er du mois ; sans date, pas de jalon. Si l'adresse est déjà dans ses biens ou sa Prospection, l'outil complète ce bien-là (pas de doublon) et l'écran l'ouvre : dis-le en une ligne.",
  input_schema: {
    type: 'object',
    properties: {
      adresse: { type: 'string' }, ville: { type: 'string' },
      type_bien: { type: 'string', enum: ['murs_commerce', 'fonds_commerce', 'bureaux', 'murs_et_fonds'] },
      commerce: { type: 'string', description: "L'enseigne ou l'activité du commerce en place" },
      activite: { type: 'string' },
      proprietaire: { type: 'string', description: 'Le propriétaire (des murs, ou le cédant du fonds)' },
      telephone: { type: 'string' }, email: { type: 'string' },
      prix: { type: 'number', description: "Le prix du mandat ou la valeur de l'avis, en euros" },
      loyer_annuel: { type: 'number' }, surface: { type: 'number' }, ca: { type: 'number' }, ebe: { type: 'number' },
      visite_le: { type: 'string', description: 'La date de la visite chez le propriétaire, AAAA-MM-JJ' },
      mandat: {
        type: 'object', description: 'Le mandat, lu dans son PDF ou raconté',
        properties: { numero: { type: 'string' }, signe_le: { type: 'string', description: 'AAAA-MM-JJ' }, echeance: { type: 'string', description: 'AAAA-MM-JJ ; une durée « 3 mois » se compte depuis la signature' }, exclusif: { type: 'boolean' }, enseigne: { type: 'string', description: "L'agence ou le réseau sous lequel il est signé" }, honoraires: { type: 'string' } },
      },
      etape_actuelle: { type: 'string', enum: ETAPES, description: "L'étape où il en est : previsite (visite à faire), estimation (avis à faire, à envoyer, ou en attente de la réponse), mandat (avis accepté, mandat à faire signer, ou signé dans une autre agence), dataroom (mandat signé, pièces à réunir), marche (en vente), offre (offres reçues), vente (compromis ou acte)" },
      jalons: {
        type: 'array',
        items: { type: 'object', properties: { quoi: { type: 'string', enum: [...Object.keys(JALONS), 'autre'] }, date: { type: 'string', description: 'AAAA-MM-JJ' }, texte: { type: 'string', description: "Ce qui s'est passé, en quelques mots (pour « autre », ou un détail)" } }, required: ['quoi', 'date'] },
      },
    },
  },
};

const sans = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// Le numéro et la rue, sans « bis », virgules ni ville : « 12, rue Ménétrier » et « 12 rue menetrier » sont la même adresse.
const cleAdresse = (a) => sans(a).replace(/\b(bis|ter)\b/g, '').replace(/\s+/g, ' ');

/** La fiche vivante : un bien fusionné dans un autre renvoie à celui-là. */
export function ficheVivante(p) {
  let f = p?.id ? Records.get('ProprietaireMandataire', p.id) : null;
  for (let i = 0; f?.fusionne_dans && i < 3; i += 1) f = Records.get('ProprietaireMandataire', f.fusionne_dans);
  return f;
}

/** Pure : le bien déjà là à la même adresse (dans ses biens ou sa Prospection), hors celui qu'on importe. */
export function jumeauDe(p, adresse, ville, fiches = []) {
  const a = cleAdresse(adresse);
  if (!a || !/\d/.test(a)) return null;
  const v = sans(ville);
  return fiches.find((x) => x.id !== p.id && !x.retire_le && !x.fusionne_dans && !x.test && !x.essai_bien
    && x.mandataire_email === p.mandataire_email && cleAdresse(x.adresse) === a && (!v || !x.ville || sans(x.ville) === v)) || null;
}

/** Le bien qu'on importait rejoint celui qui existait : sa conversation, ses pièces, ses touches et ses relances. */
function fusionner(p, cible, user) {
  const B = { ...(cible.biens || {}) };
  const pieces = [...(B.pieces || [])];
  for (const x of p.biens?.pieces || []) if (!pieces.some((y) => y.url === x.url)) pieces.push(x);
  const importees = [...(cible.pieces_importees || [])];
  for (const x of p.pieces_importees || []) if (!importees.some((y) => y.url === x.url)) importees.push(x);
  const entre = !['rdv_pris', 'mandat_signe'].includes(cible.statut);
  Records.update('ProprietaireMandataire', cible.id, {
    biens: { ...B, pieces, import: { ...(p.biens?.import || { le: new Date().toISOString() }) }, ...(B.cases_perso || p.biens?.cases_perso ? { cases_perso: [...(B.cases_perso || []), ...(p.biens?.cases_perso || []).filter((c) => !(B.cases_perso || []).some((d) => d.cle === c.cle))] } : {}) },
    pieces_importees: importees,
    ...(entre ? { statut: 'rdv_pris' } : {}),
    historique: [...(cible.historique || []), { le: new Date().toISOString(), type: 'import', texte: 'Bien complété par « Importer » (même adresse)' }],
  });
  for (const a of Records.list('AcquereurMandataire').filter((x) => x.proprietaire_id === p.id)) Records.update('AcquereurMandataire', a.id, { proprietaire_id: cible.id });
  for (const r of Records.list('Rappel').filter((x) => x.proprietaire_id === p.id)) Records.update('Rappel', r.id, { proprietaire_id: cible.id });
  Records.update('ProprietaireMandataire', p.id, { retire_le: new Date().toISOString(), retire_par: email(user), fusionne_dans: cible.id });
  return Records.get('ProprietaireMandataire', cible.id);
}

/** L'outil, sur la fiche ouverte. */
export async function executerReprise(input, user, { fiche = null } = {}) {
  let p = ficheVivante(fiche);
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Aucun bien ouvert.' };
  let fusion = null;
  if (p.biens?.import && !p.biens.import.fini && String(input.adresse || '').trim()) {
    const jumeau = jumeauDe(p, input.adresse, input.ville || p.ville, Records.list('ProprietaireMandataire'));
    if (jumeau) {
      const avant = p;
      p = fusionner(p, jumeau, user);
      fusion = { id: p.id, titre: [p.adresse, p.ville].filter(Boolean).join(', ') || p.commerce };
      // La conversation commencée suit le bien : elle se recopie dans son fil.
      const { filDuBien, versLeFil } = await import('./bien-etapes.js');
      const msgs = (filDuBien(avant, user)?.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string');
      if (msgs.length) versLeFil(p, user, msgs.map((m) => ({ role: m.role, contenu: m.contenu, le: m.le || new Date().toISOString(), canal: 'import' })));
      p = Records.get('ProprietaireMandataire', p.id);
    }
  }
  const { maj, jalons, etape } = repriseDe(p, input);
  const historique = [...(p.historique || []), ...jalons.map((j) => ({ le: j.le, type: 'jalon', texte: j.texte }))];
  Records.update('ProprietaireMandataire', p.id, { ...maj, historique });
  const frais = Records.get('ProprietaireMandataire', p.id);
  const manque = manqueSelonEtape(frais, documentsDeLaFiche(frais));
  // La prochaine action du bien, à dire à la fin (et à proposer de faire).
  const suite = {
    previsite: 'Ensuite : la visite à préparer.',
    estimation: "Ensuite : l'avis de valeur à rédiger ou, s'il est envoyé, la relance du propriétaire.",
    mandat: "Ensuite : le mandat n'est pas encore signé chez K Partners, demande s'il veut une relance du propriétaire.",
    dataroom: 'Ensuite : le mandat est signé, les pièces de la Data room à réunir (le mail au propriétaire).',
    marche: 'Ensuite : le bien est en vente, le teaser et les touches.',
    offre: 'Ensuite : les offres reçues (montant, conditions).',
    vente: "Ensuite : la date de l'acte.",
  }[etape || etapeImportDe(frais)];
  return {
    ok: true, fiche_id: p.id, jalons_ajoutes: jalons.length, etape: etape || null,
    ...(fusion ? { ouvrir_bien: fusion } : {}),
    fait: `${fusion ? `Ce bien était déjà là (${fusion.titre}) : il est complété, sans doublon, et l'écran l'ouvre. ` : ''}Fiche à jour${jalons.length ? `, ${jalons.length} événement${jalons.length > 1 ? 's' : ''} dans l'historique` : ''}${etape ? `, étape actuelle : ${etape}` : ''}.${manque.length ? ` Il manque encore : ${manque.join(', ')}.` : ' Le minimum de son étape est là.'} ${suite || ''}`.trim(),
  };
}

/** Pure : les documents d'une fiche (déposés ou joints à l'import), avec leur nature. */
export function documentsDeLaFiche(p) {
  return [
    ...(p?.biens?.pieces || []).map((x) => ({ id: x.id, nom: x.nom, url: x.url, nature: x.nature || 'autres', ou: 'pieces' })),
    ...(p?.pieces_importees || []).map((x) => ({ id: `importee:${x.url}`, nom: x.nom, url: x.url, nature: x.nature || null, ou: 'importees' })),
  ];
}

/**
 * Pure : ce qui manque au bien pour son étape (4 nov. 2026, Jules, « tout dépend du bien ») :
 *   - une piste : l'adresse, le type, le propriétaire et son téléphone, la date de visite (une fois faite) ;
 *   - un mandat signé : en plus le prix, la date de signature, l'échéance et le PDF du mandat ;
 *   - sous offre : en plus le montant de l'offre et l'acquéreur.
 */
export function manqueSelonEtape(p, documents = [], touches = null) {
  const b = p?.biens || {};
  const rang = ETAPES.indexOf(etapeImportDe(p));
  const m = p?.mandat_importe || {};
  const jalons = b.jalons || [];
  const offres = touches ?? Records.list('AcquereurMandataire').filter((a) => a.proprietaire_id === p?.id && a.statut_touche === 'offre');
  return [
    !p?.adresse && "l'adresse",
    !p?.type_bien && 'le type de bien',
    !p?.nom && 'le propriétaire',
    !p?.telephone && 'le téléphone du propriétaire',
    rang >= 1 && !jalons.some((j) => j.quoi === 'visite') && 'la date de la visite',
    rang >= 3 && !(b.prix_accord || m.prix || b.repris?.prix) && 'le prix',
    rang >= 3 && !m.signe_le && 'la date de signature du mandat',
    rang >= 3 && !m.echeance && "l'échéance du mandat",
    rang >= 3 && !documents.some((d) => d.nature === 'mandat' || /mandat/i.test(d.nom || '')) && 'le PDF du mandat',
    rang >= 5 && !offres.some((a) => a.offre_montant) && "le montant de l'offre",
    rang >= 5 && !offres.length && "l'acquéreur qui a fait l'offre",
  ].filter(Boolean);
}

/** Pure : l'étape où en est le bien (celle qui suit la dernière franchie). */
function etapeImportDe(p) {
  const r = { rdv: -1, visite: 0, estimation: 0, previsite: 0, prix_accord: 1, avis_accepte: 1, mandat: 2, analyse: 2, dataroom: 3, marche: 4, offre: 5, vente: 6 }[p?.biens?.validee] ?? -1;
  return ETAPES[Math.min(ETAPES.length - 1, r + 1)];
}

/**
 * Ce que l'assistant sait d'un bien en cours d'import : comment Jules le ferait (4 nov. 2026, QCM avec Jules), où on en
 * est, ce qui manque encore pour l'étape.
 */
export function cadreImport(p) {
  if (!p?.biens?.import || p.biens.import.fini) return '';
  const docs = documentsDeLaFiche(p);
  const manque = manqueSelonEtape(p, docs);
  const touches = Records.list('AcquereurMandataire').filter((a) => a.proprietaire_id === p.id);
  const relances = Records.list('Rappel').filter((r) => r.proprietaire_id === p.id && !r.fait_le);
  const etat = [
    `étape actuelle : ${etapeImportDe(p)}`,
    docs.length ? `documents : ${docs.map((d) => `« ${d.nom} »${d.nature ? ` (${d.nature})` : ''}`).join(', ')}` : 'aucun document encore',
    touches.length ? `touches : ${touches.map((a) => `${a.nom} (${a.statut_touche || 'contact'})`).join(', ')}` : 'aucune touche notée',
    relances.length ? `relances : ${relances.length}` : 'aucune relance posée',
    p.crm?.le ? `déjà au CRM le ${String(p.crm.le).slice(0, 10)}` : 'pas encore au CRM',
  ].join(' ; ');
  return `\n\nCE BIEN EST EN COURS D'IMPORT : le mandataire l'a déjà, tu le fais entrer dans Klocka comme Jules le ferait lui-même. Tu es libre : tu t'adaptes à ce qu'il te donne, sans formulaire. Vouvoie-le, phrases courtes.
- Tu commences par le laisser raconter (« Racontez-moi ce bien »), puis tu tries. Demande aussi le contexte : qui s'est placé sur le bien, qui l'a visité, où en est chacun.
- Ce qui n'est pas clair, demande-le tout de suite, en une question courte. N'invente rien.
- Un mandat joint, c'est bon : tu ne le vérifies pas. Tu en lis les données (prix, signature, échéance, exclusif, enseigne, propriétaire) et le bien est au moins au mandat signé.
- reprendre_bien écrit la fiche : l'adresse et le type dès qu'il les dit (le bien prend « adresse, ville » pour nom ; une adresse déjà connue complète le bien existant), le reste après un résumé de trois lignes et son oui. L'étape se déduit de ce qu'il dit ; si elle n'est pas claire, demande-la.
- Un bien sans rien de fait (propriétaire repéré, pas visité) : demande-lui s'il le met dans sa Prospection (envoyer_en_prospection, dans la liste qu'il nomme) ou dans ses biens.
- Demande-lui tous les documents qu'il a (mandat, avis de valeur, bail, quittances, taxe foncière, diagnostics, photos…) : il les joint ici ou les glisse à droite. Puis ranger_documents leur donne un nom clair (« Bail commercial », « Mandat exclusif ») et la bonne case.
- Chaque acquéreur potentiel qu'il cite : noter_touche (statut, visite, offre, budget, relance).
- Demande-lui quelles relances il veut (le propriétaire, les touches, l'échéance du mandat) : noter_relance, une par relance. Ne pose rien d'office.
- Il manque des pièces que seul le propriétaire a : propose le mail au propriétaire (preparer_mail), prêt à envoyer d'un clic.
- Quand le minimum est là : fais-lui relire la fiche à droite (tout s'y corrige d'un clic, ou il te dit ce qui est faux et tu corriges), puis demande « Je mets tout ça dans le CRM ? ». À son oui : mettre_au_crm. S'il rend des contacts à passer en Clients (vendeur à l'avis accepté ou au mandat signé, acquéreur à l'offre ou après une visite avec un budget validé), propose-le par leur nom ; à son oui : passer_en_clients.
- À la fin, dis en deux lignes ce qui est fait et la prochaine action du bien, puis qu'il touche « C'est fait ».
OÙ ON EN EST : ${etat}.${manque.length ? ` IL MANQUE ENCORE POUR SON ÉTAPE : ${manque.join(', ')} (demande-le, une ou deux choses à la fois ; il peut tout dire en un vocal).` : ' Le minimum de son étape est là.'}`;
}

export const OUTILS_IMPORT = [
  {
    name: 'ranger_documents',
    description: "Donne aux documents du bien en cours d'import un nom clair (« Bail commercial », « Mandat exclusif », « Taxe foncière 2025 ») et leur case (nature). Un appel pour plusieurs documents. `document` : son nom tel qu'il apparaît dans la liste des documents.",
    input_schema: {
      type: 'object',
      properties: { documents: { type: 'array', items: { type: 'object', properties: { document: { type: 'string' }, nom: { type: 'string', description: 'Le nom clair, sans note' }, nature: { type: 'string', enum: NATURES_DOC } }, required: ['document'] } } },
      required: ['documents'],
    },
  },
  {
    name: 'noter_touche',
    description: "Note un acquéreur potentiel (une touche) sur le bien en cours d'import : il rejoint « Mes acquéreurs », relié à ce bien. Un appel par personne ; rappelle-le pour la mettre à jour (même nom).",
    input_schema: {
      type: 'object',
      properties: {
        nom: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' },
        statut: { type: 'string', enum: ['contact', 'visite', 'offre', 'perdu'], description: 'Contact (intéressé), visite faite, offre faite, perdu' },
        visite_le: { type: 'string', description: 'AAAA-MM-JJ' },
        offre_montant: { type: 'number', description: "Le montant de l'offre, en euros" },
        budget: { type: 'number', description: 'Son budget, en euros' },
        budget_valide: { type: 'boolean', description: 'Son financement est validé' },
        prochaine_relance: { type: 'string', description: 'AAAA-MM-JJ, si le mandataire en veut une' },
        remarque: { type: 'string' },
      },
      required: ['nom'],
    },
  },
  {
    name: 'envoyer_en_prospection',
    description: "Un bien sans rien de fait (propriétaire repéré, pas visité) que le mandataire préfère mettre dans sa Prospection. Sans `liste`, l'outil rend ses listes pour qu'il choisisse ; avec, la fiche quitte Mes biens et entre dans cette liste (créée si elle n'existe pas), avec ce qu'il a dit du propriétaire et du commerce. À appeler après son choix.",
    input_schema: { type: 'object', properties: { liste: { type: 'string', description: 'Le nom de la liste qu’il a choisie ou dite' }, adresse: { type: 'string' }, ville: { type: 'string' }, proprietaire: { type: 'string' }, telephone: { type: 'string' }, email: { type: 'string' }, commerce: { type: 'string', description: 'Le commerce en place (« Tabac »)' }, remarque: { type: 'string', description: 'Ce qu’il en a dit, en une phrase' } } },
  },
  {
    name: 'mettre_au_crm',
    description: "Après son oui à « Je mets tout ça dans le CRM ? » : écrit le bien dans Propriétés KPartners (chaque case connue), le propriétaire et chaque touche dans Prospects, avec leur statut et leur prochaine relance. Rend les contacts à proposer pour Clients.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'passer_en_clients',
    description: "Après son oui : recopie dans Clients les contacts « commités » que mettre_au_crm a rendus (ils restent dans Prospects). `qui` : « proprietaire », ou l'id de la touche.",
    input_schema: { type: 'object', properties: { qui: { type: 'array', items: { type: 'string' } } }, required: ['qui'] },
  },
];
export const NOMS_IMPORT = new Set(OUTILS_IMPORT.map((o) => o.name));

const nombreOuNull = (v) => (Number(v) > 0 ? Math.round(Number(v)) : null);

/** Les outils de l'import, sur la fiche ouverte. */
export async function executerOutilImport(appel, user, { fiche = null } = {}) {
  const p = ficheVivante(fiche);
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Aucun bien ouvert.' };
  const input = appel.input || {};
  if (appel.name === 'ranger_documents') {
    const docs = documentsDeLaFiche(p);
    const { annoter } = await import('./annotations-documents.js');
    const { reclasser } = await import('./documents-du-bien.js');
    const { annotationsDe } = await import('./annotations-documents.js');
    const noms = annotationsDe(docs.map((d) => d.url));
    const faits = []; const perdus = [];
    for (const x of Array.isArray(input.documents) ? input.documents : []) {
      const cle = sans(x.document);
      const d = docs.find((y) => sans(y.nom) === cle || sans(noms[y.url]?.nom) === cle) || docs.find((y) => cle && (sans(y.nom).includes(cle) || cle.includes(sans(y.nom))));
      if (!d) { perdus.push(x.document); continue; }
      if (String(x.nom || '').trim()) annoter(d.url, { nom: String(x.nom).trim() }, user);
      if (x.nature && NATURES_DOC.includes(x.nature) && d.ou === 'pieces' && d.nature !== x.nature) reclasser(p.id, d.id, x.nature, user);
      if (x.nature && d.ou === 'importees') {
        const f = Records.get('ProprietaireMandataire', p.id);
        Records.update('ProprietaireMandataire', p.id, { pieces_importees: (f.pieces_importees || []).map((y) => (y.url === d.url ? { ...y, nature: x.nature } : y)) });
      }
      faits.push(String(x.nom || d.nom).trim());
    }
    return { ok: faits.length > 0, rangés: faits, introuvables: perdus, fait: faits.length ? `Rangés : ${faits.join(', ')}.` : 'Aucun document reconnu.', ...(perdus.length ? { note: `Introuvables : ${perdus.join(', ')}. Les noms exacts sont dans la liste des documents.` } : {}) };
  }
  if (appel.name === 'noter_touche') {
    const nom = String(input.nom || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!nom) return { ok: false, error: 'Le nom de la touche ?' };
    const deja = Records.list('AcquereurMandataire').find((a) => a.mandataire_email === p.mandataire_email && a.proprietaire_id === p.id && sans(a.nom) === sans(nom));
    const champs = {
      nom,
      ...(String(input.telephone || '').trim() ? { telephone: String(input.telephone).trim() } : {}),
      ...(String(input.email || '').trim() ? { email: String(input.email).trim().toLowerCase() } : {}),
      ...(input.statut ? { statut_touche: input.statut } : {}),
      ...(date(input.visite_le) ? { visite_le: date(input.visite_le).slice(0, 10) } : {}),
      ...(nombreOuNull(input.offre_montant) ? { offre_montant: nombreOuNull(input.offre_montant) } : {}),
      ...(nombreOuNull(input.budget) ? { budget_max: nombreOuNull(input.budget) } : {}),
      ...(typeof input.budget_valide === 'boolean' ? { budget_valide: input.budget_valide } : {}),
      ...(date(input.prochaine_relance) ? { prochaine_relance: date(input.prochaine_relance).slice(0, 10) } : {}),
      ...(String(input.remarque || '').trim() ? { remarque: String(input.remarque).trim().slice(0, 500) } : {}),
    };
    const a = deja ? Records.update('AcquereurMandataire', deja.id, champs)
      : Records.create('AcquereurMandataire', { statut_touche: 'contact', ...champs, mandataire_email: p.mandataire_email, proprietaire_id: p.id, recherche: [p.type_bien, p.activite].filter(Boolean).join(' ') || null, villes: p.ville ? [p.ville] : [], source: 'touche', cree_le: new Date().toISOString() });
    if (input.statut === 'offre' && champs.offre_montant) {
      const f = Records.get('ProprietaireMandataire', p.id);
      Records.update('ProprietaireMandataire', p.id, { historique: [...(f.historique || []), { le: new Date().toISOString(), type: 'note', texte: `Offre de ${nom} : ${champs.offre_montant.toLocaleString('fr-FR')} €` }] });
    }
    return { ok: true, touche_id: a.id, fait: `${nom} ${deja ? 'mis à jour' : 'noté'} dans Mes acquéreurs, relié à ce bien (${a.statut_touche}).` };
  }
  if (appel.name === 'envoyer_en_prospection') {
    const listes = Records.list('ListeMandataire').filter((l) => l.mandataire_email === p.mandataire_email && !l.agent && !l.suggeree);
    const nom = String(input.liste || '').trim();
    if (!nom) return { ok: true, listes: listes.map((l) => l.nom), fait: listes.length ? `Ses listes : ${listes.map((l) => l.nom).join(', ')}. Demande laquelle, ou le nom d'une nouvelle.` : "Il n'a pas encore de liste : demande-lui son nom." };
    const { changerDeListe } = await import('./off-market/simple.js');
    const l = changerDeListe(p.id, { nom, user });
    if (!l.ok) return l;
    const dit = (k) => String(input[k] || '').trim() || null;
    const f = Records.get('ProprietaireMandataire', p.id);
    const nomP = dit('proprietaire') || f.nom;
    Records.update('ProprietaireMandataire', p.id, {
      ...(dit('adresse') ? { adresse: dit('adresse') } : {}),
      ...(dit('ville') ? { ville: dit('ville') } : {}),
      ...(dit('proprietaire') ? { nom: dit('proprietaire') } : {}),
      ...(dit('telephone') ? { telephone: dit('telephone') } : {}),
      ...(dit('email') ? { email: dit('email').toLowerCase() } : {}),
      ...(dit('remarque') ? { remarque: f.remarque ? `${f.remarque} · ${dit('remarque')}` : dit('remarque') } : {}),
      // Un contact de la Prospection porte le nom de son commerce, pas « adresse, ville ».
      nom_bien: null,
      statut: 'a_appeler',
      commerce: dit('commerce') || (f.commerce === 'Nouveau bien' || f.commerce === f.adresse ? (f.activite || dit('adresse') || f.adresse || nomP || 'Contact') : f.commerce),
      biens: { ...(f.biens || {}), import: { ...(f.biens?.import || {}), fini: new Date().toISOString(), vers: 'prospection' } },
      historique: [...(f.historique || []), { le: new Date().toISOString(), type: 'note', texte: `Mis dans la Prospection, liste « ${l.liste.nom} »` }],
    });
    return { ok: true, vers_prospection: true, fait: `Il est dans sa Prospection, liste « ${l.liste.nom} ». Il quitte Mes biens.`, boutons: [{ libelle: 'Voir la Prospection', href: '/MandataireProspection', principal: true }] };
  }
  if (appel.name === 'mettre_au_crm') {
    const r = await (await import('./crm-bien.js')).mettreAuCrm(p.id, user);
    if (!r.ok) return r;
    return { ok: true, fait: r.faits.join(' ; '), lien: r.lien, a_proposer_en_clients: r.a_proposer_en_clients, ...(r.a_proposer_en_clients.length ? { note: `Propose de passer en Clients : ${r.a_proposer_en_clients.map((c) => `${c.nom} (${c.pourquoi}, qui = « ${c.qui} »)`).join(', ')}.` } : {}) };
  }
  if (appel.name === 'passer_en_clients') {
    const r = await (await import('./crm-bien.js')).passerEnClients(p.id, input.qui || [], user);
    return r.ok ? { ok: true, fait: r.faits.join(' ; ') } : r;
  }
  return { ok: false, error: 'Outil inconnu.' };
}

/**
 * L'import du bien est fini : le chat du milieu se retire de la vue d'ensemble. Un bien au mandat signé (K Partners)
 * ouvre sa Data room, avec ce qui a été déposé (4 nov. 2026, Jules : « je crée la Data room »).
 */
export async function finirImport(proprietaireId, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Bien introuvable.' };
  if (!p.biens?.import) return { ok: true };
  Records.update('ProprietaireMandataire', p.id, { biens: { ...p.biens, import: { ...p.biens.import, fini: new Date().toISOString() } } });
  const rang = ETAPES.indexOf(etapeImportDe(p));
  const deja = Records.list('DossierMandataire').some((d) => d.proprietaire_id === p.id && !d.retire_le);
  if (rang >= 3 && !deja && p.mandat_importe?.k_partners !== false && !p.test) {
    const P = await import('./mandataire-portes.js');
    const r = P.creerDossier({ bien: [p.adresse, p.ville].filter(Boolean).join(', ') || p.commerce, adresse: [p.adresse, p.ville].filter(Boolean).join(', ') || null, proprietaire: p.nom || null, proprietaire_email: p.email || null, prix: p.biens?.prix_accord || p.mandat_importe?.prix || null, loyer_annuel: p.biens?.repris?.loyer_annuel || null, surface_m2: p.biens?.repris?.surface || null }, user);
    if (r.ok) {
      const h = P.heritageDuDossier({ fiche: Records.get('ProprietaireMandataire', p.id) });
      Records.update('DossierMandataire', r.dossier.id, { proprietaire_id: p.id, documents: h.documents, photos: h.photos, ...(h.pieces_perso.length ? { pieces_perso: h.pieces_perso } : {}) });
      return { ok: true, dossier_id: r.dossier.id };
    }
  }
  return { ok: true };
}

/**
 * La relecture (4 nov. 2026, Jules : « il faut qu'il le relise, et s'il y a des choses fausses qu'il puisse tout modifier
 * facilement ») : une information de la fiche corrigée d'un clic. Une valeur vide efface.
 */
export function corrigerInfos(proprietaireId, champs = {}, user) {
  const p = Records.get('ProprietaireMandataire', proprietaireId);
  if (!p || p.mandataire_email !== email(user)) return { ok: false, error: 'Bien introuvable.' };
  const txt = (v) => (v == null ? null : String(v).replace(/\s+/g, ' ').trim() || null);
  const maj = {};
  const biens = { ...(p.biens || {}) };
  for (const [k, cle] of [['adresse', 'adresse'], ['ville', 'ville'], ['proprietaire', 'nom'], ['telephone', 'telephone'], ['email', 'email'], ['activite', 'activite']]) if (k in champs) maj[cle] = txt(champs[k]);
  if ('type_bien' in champs) { if (champs.type_bien && !TYPES.has(champs.type_bien)) return { ok: false, error: 'Type inconnu.' }; maj.type_bien = champs.type_bien || null; }
  const repris = { ...(biens.repris || {}) };
  for (const k of ['loyer_annuel', 'surface', 'ca', 'ebe']) if (k in champs) { if (nombre(champs[k])) repris[k] = nombre(champs[k]); else delete repris[k]; }
  if ('prix' in champs) {
    const n = nombre(champs.prix);
    if (n) repris.prix = n; else delete repris.prix;
    if (biens.prix_accord || n) biens.prix_accord = n;
    if (p.mandat_importe) maj.mandat_importe = { ...(maj.mandat_importe || p.mandat_importe), prix: n };
  }
  biens.repris = repris;
  if ('visite_le' in champs) {
    const le = date(champs.visite_le);
    const autres = (biens.jalons || []).filter((j) => j.quoi !== 'visite');
    biens.jalons = le ? [...autres, { le, quoi: 'visite', texte: JALONS.visite[0], etape: JALONS.visite[1], detail: null }].sort((a, b) => a.le.localeCompare(b.le)) : autres;
  }
  if (champs.mandat && typeof champs.mandat === 'object') {
    const m = { ...(maj.mandat_importe || p.mandat_importe || {}) };
    for (const k of ['numero', 'enseigne', 'honoraires']) if (k in champs.mandat) m[k] = txt(champs.mandat[k]);
    for (const k of ['signe_le', 'echeance']) if (k in champs.mandat) m[k] = date(champs.mandat[k])?.slice(0, 10) || null;
    if ('exclusif' in champs.mandat) m.exclusif = typeof champs.mandat.exclusif === 'boolean' ? champs.mandat.exclusif : null;
    m.k_partners = !m.enseigne || /k ?partners|klocka/i.test(m.enseigne);
    maj.mandat_importe = m;
  }
  if (p.commerce === 'Nouveau bien' && maj.adresse) maj.commerce = maj.adresse;
  Records.update('ProprietaireMandataire', p.id, { ...maj, biens });
  return { ok: true, proprietaire: Records.get('ProprietaireMandataire', p.id) };
}
