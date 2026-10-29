// Ce qui suit le dépôt dans la Data Room (29 oct. 2026, Jules) : deux gestes, dans l'ordre du travail.
//
//   1. « Ranger dans le Drive » : le système propose un nom pour chaque pièce (« Bail commercial - SARL RIMEL -
//      16.03.2026.pdf ») en lisant ses deux premières pages, seulement à ce clic ; l'analyste relit, corrige,
//      valide ; alors les pièces prennent ce nom dans Klocka et partent dans le Drive du dossier, un sous-dossier
//      par famille, avec le Google Doc « Contexte du dossier » (le contexte écrit sous chaque pièce).
//   2. « Lancer l'analyse » : chaque pièce pas encore lue est lue, seule, sur la grille de sa zone.
//
// Rien de cela ne part tout seul : le dépôt, lui, ne fait toujours rien.

import fs from 'fs';
import path from 'path';
import { Records } from '../db.js';
import { lireDepots, rangerPiece, enfiler, grilleDe, TYPES, pagesDuTexte, CRITERES_BIEN } from './analyse-pieces.js';
import { nomDossierDrive } from './nom-drive.js';

const dealDe = (dealId) => Records.findBy('Deal', 'deal_id', dealId) || null;

// Le début du nom, par zone, quand la pièce ne dit pas mieux.
const INTITULE = {
  bail: 'Bail commercial', avenants: 'Avenant au bail', quittances: 'Quittance de loyer', pv_ag: "PV d'AG",
  rcp: 'Règlement de copropriété', diagnostics: 'Diagnostic', taxe_fonciere: 'Avis de taxe foncière', kbis: 'Kbis', fiche: 'Fiche du bien',
};
// Les sous-dossiers du Drive : une famille par dossier, dans l'ordre où on les ouvre.
const SOUS_DOSSIER = {
  fiche: '00 Fiche du bien', bail: '01 Bail', avenants: '01 Bail', quittances: '02 Quittances', pv_ag: '03 Copropriété', rcp: '03 Copropriété',
  diagnostics: '04 Diagnostics', taxe_fonciere: '05 Fiscalité et société', kbis: '05 Fiscalité et société',
};
const AUTRES = '06 Autres pièces';

const propre = (s) => String(s || '').replace(/[\\/:*?"<>|\n\r\t]+/g, ' ').replace(/\s+/g, ' ').trim();
const extension = (nom) => (String(nom || '').match(/\.[a-z0-9]{2,5}$/i)?.[0] || '').toLowerCase();

/** Le nom assemblé : intitulé, précision, date, puis l'extension d'origine. Jamais plus de 120 caractères. */
export function assemblerNom({ intitule, precision, date }, nomOrigine) {
  const corps = [intitule, precision, date].map(propre).filter(Boolean).join(' - ').slice(0, 120).trim();
  return `${corps || propre(String(nomOrigine || 'Pièce').replace(/\.[a-z0-9]{2,5}$/i, ''))}${extension(nomOrigine)}`;
}

/** Toutes les pièces de la Data Room, chacune avec sa zone. Une pièce d'avant, placée par sa catégorie, y est rangée pour de bon. */
function piecesRangees(dealId, user) {
  const d = lireDepots(dealId);
  if (!d) return null;
  const brut = dealDe(dealId);
  const etat = brut.analyse_pieces?.docs || {};
  const pieces = [];
  for (const e of d.emplacements) {
    for (const p of e.documents) {
      if (e.id !== 'autre' && etat[p.id]?.type !== e.id) rangerPiece(dealId, p.id, e.id, user, { lire: false });
      pieces.push({ ...p, zone: e.id, zone_titre: e.titre, perso: e.perso });
    }
  }
  return { pieces, depots: d };
}

const consigneNom = (zone, contexte) => [
  `Ce document a été rangé par l'analyste dans « ${zone} » d'un dossier d'investissement en murs commerciaux. On veut le nommer proprement pour le Google Drive du dossier.`,
  contexte ? `Ce que l'analyste en dit : « ${contexte} »` : null,
  `Rends en JSON :`,
  `- "intitule" : ce qu'est le document, court, avec les mots du métier (« Bail commercial », « Avenant n°2 au bail », « Quittance de loyer », « PV d'AG », « État descriptif de division », « Diagnostic amiante », « DPE », « Avis de taxe foncière », « Kbis »…) ;`,
  `- "precision" : ce qui le distingue des autres pièces du même dossier, cinq mots au plus : le locataire d'un bail ou d'une quittance (« SARL RIMEL »), le type d'un diagnostic, la rue d'une copropriété quand le dossier en a plusieurs (« rue Foch ») ; jamais le syndic, la ville ni l'adresse complète ; chaîne vide si rien d'utile ;`,
  `- "date" : la date qui le situe, au format JJ.MM.AAAA (date de signature d'un bail, de l'assemblée d'un PV, du rapport d'un diagnostic) ou « mois AAAA » pour une quittance (« mars 2026 »), « AAAA » pour un avis d'impôt ; chaîne vide si le document n'en dit pas.`,
  `N'invente rien : ce que le document ne dit pas reste vide.`,
].filter(Boolean).join('\n');

async function lireDebut(piece) {
  if (piece.mimetype === 'application/pdf') {
    const { coucheTexteDuPdf } = await import('./ingest.js');
    const couche = await coucheTexteDuPdf(piece.buffer).catch(() => null);
    if (couche) return pagesDuTexte(couche.texte).slice(0, 2).join('\n').slice(0, 8000);
  }
  return null;
}

async function proposerParDefaut({ piece, zone, contexte }) {
  const prompt = consigneNom(zone, contexte);
  const debut = await lireDebut(piece);
  if (debut != null) {
    const { invokeLLM } = await import('../llm.js');
    return invokeLLM({
      prompt: `Début du document « ${piece.nom} » :\n${debut}\n\n${prompt}`,
      response_json_schema: { type: 'object', properties: { intitule: { type: 'string' }, precision: { type: 'string' }, date: { type: 'string' } }, required: ['intitule', 'precision', 'date'] },
      effort: 'low',
    });
  }
  // Un scan n'a pas de texte : le modèle lit le fichier lui-même.
  const { generateFromDocument } = await import('../llm.js');
  const brut = await generateFromDocument({ buffer: piece.buffer, mimetype: piece.mimetype, nom: piece.nom, prompt: `${prompt}\nRéponds UNIQUEMENT en JSON : {"intitule": "...", "precision": "...", "date": "..."}` });
  const t = String(brut || '');
  return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
}

/**
 * Propose un nom pour chaque pièce qui n'en a pas encore (toutes avec `force`). Quatre lectures à la fois.
 * Une pièce illisible garde une proposition faite de sa zone et de son nom d'origine.
 */
export async function proposerNoms(dealId, { uploadDir, user, force = false, seulement = null, proposer = proposerParDefaut } = {}) {
  const r = piecesRangees(dealId, user);
  if (!r) return { ok: false, error: 'Dossier introuvable' };
  const { chargerPiece } = await import('./espace.js');
  const { mesurer } = await import('../llm-couts.js');
  const aFaire = r.pieces.filter((p) => (!seulement || seulement.includes(p.id)) && (force || !p.nom_propose));
  const resultats = {};
  let i = 0;
  const travailleur = async () => {
    while (i < aFaire.length) {
      const p = aFaire[i++];
      const base = { intitule: INTITULE[p.zone] || (p.perso ? p.zone_titre : ''), precision: '', date: '' };
      let lu = null;
      try {
        const piece = chargerPiece(dealId, p.id, uploadDir);
        if (piece?.buffer) {
          const { resultat } = await mesurer({ operation: "nommer une pièce", par: user?.email || null, sur: dealId, libelle: p.nom }, () => proposer({ piece, zone: p.zone_titre, contexte: p.contexte }));
          lu = resultat;
        }
      } catch (e) {
        console.warn(`[data-room] nom de « ${p.nom} » : ${e?.message || e}`);
      }
      resultats[p.id] = assemblerNom({ ...base, ...(lu && typeof lu === 'object' ? Object.fromEntries(Object.entries(lu).filter(([, v]) => propre(v))) : {}) }, p.nom);
    }
  };
  await Promise.all([1, 2, 3, 4].map(travailleur));
  const brut = dealDe(dealId);
  const etat = structuredClone(brut.analyse_pieces || {});
  etat.docs = etat.docs || {};
  for (const [id, nom] of Object.entries(resultats)) etat.docs[id] = { ...(etat.docs[id] || { type: null, valeurs: {}, questions: [] }), nom_propose: nom };
  Records.update('Deal', brut.id, { analyse_pieces: etat });
  return { ok: true, ...lireDepots(dealId), proposes: Object.keys(resultats).length };
}

/** Le texte du Google Doc « Contexte du dossier » : chaque pièce et ce que l'analyste en a dit. */
export function texteContexte(deal, pieces) {
  const avec = pieces.filter((p) => p.contexte);
  if (!avec.length) return null;
  return [
    `Contexte du dossier : ${nomDossierDrive(deal)}`,
    `Écrit par l'équipe dans la Data Room de Klocka. Mis à jour le ${new Date().toLocaleDateString('fr-FR')}.`,
    '',
    ...avec.flatMap((p) => [`${p.nom} (${p.zone_titre})`, p.contexte, '']),
  ].join('\n');
}

/**
 * Range la Data Room dans le Drive sous les noms validés (`noms` : { docId: nom }) : la pièce est renommée dans
 * Klocka, déposée dans le sous-dossier de sa famille, et le Doc du contexte refait. Un dossier de test ne touche
 * jamais Google.
 */
export async function rangerDansDrive(dealId, noms = {}, { uploadDir, user, drive = null, seulement = null } = {}) {
  const r = piecesRangees(dealId, user);
  if (!r) return { ok: false, error: 'Dossier introuvable' };
  // Ajouter au Drive les seules pièces cochées (29 oct. 2026, Jules : les pièces reçues après coup, une fois les
  // premières rangées) : les autres ne sont ni renommées ni renvoyées ; le Doc du contexte reprend tout le dossier.
  const toutes = r.pieces;
  if (Array.isArray(seulement)) {
    r.pieces = r.pieces.filter((p) => seulement.includes(p.id));
    if (!r.pieces.length) return { ok: false, error: 'Aucune pièce cochée.' };
  }
  // Les noms validés deviennent les noms de Klocka d'abord, quoi qu'il arrive au Drive ensuite (29 oct. 2026, Jules :
  // « les documents renommés avec le nom choisi pour le Drive ») : un seul nom par pièce, partout.
  const { renommerDocument } = await import('./espace.js');
  let renommees = 0;
  for (const p of r.pieces) {
    const voulu = propre(noms[p.id] || p.nom_propose || '');
    if (voulu && voulu !== p.nom && renommerDocument(dealId, p.id, voulu)?.ok !== false) { p.nom = voulu; renommees += 1; }
  }
  // Le nom validé devient aussi le nom proposé gardé : la Data Room, la colonne Source et le Drive disent le même.
  if (r.pieces.length) {
    const brutNoms = dealDe(dealId);
    const etatNoms = structuredClone(brutNoms.analyse_pieces || {});
    etatNoms.docs = etatNoms.docs || {};
    for (const p of r.pieces) if (etatNoms.docs[p.id]) etatNoms.docs[p.id] = { ...etatNoms.docs[p.id], nom_propose: p.nom };
    Records.update('Deal', brutNoms.id, { analyse_pieces: etatNoms });
  }
  const deal = dealDe(dealId);
  if (deal.test) return { ok: true, renommees, ranges: 0, test: true, erreurs: [], ...lireDepots(dealId) };
  const { comptesEquipe } = await import('../google-oauth.js');
  const comptes = comptesEquipe().filter((a) => a.peut_drive);
  const compte = comptes.find((a) => String(a.email).toLowerCase() === String(user?.email || '').toLowerCase())?.email || comptes[0]?.email || null;
  if (!compte && !drive) return { ok: false, renommees, error: `${renommees} pièce${renommees > 1 ? 's' : ''} renommée${renommees > 1 ? 's' : ''}, mais aucun compte Google de l'équipe n'autorise le Drive.` };
  const groupes = new Map();
  for (const p of r.pieces) {
    const doc = (deal.documents_espace || []).find((d) => d.id === p.id);
    let buffer = null;
    try { buffer = fs.readFileSync(path.join(uploadDir, path.basename(doc?.url || ''))); } catch { /* signalé plus bas */ }
    const sous = SOUS_DOSSIER[p.zone] || AUTRES;
    if (!groupes.has(sous)) groupes.set(sous, []);
    if (buffer) groupes.get(sous).push({ id: p.id, nom: p.nom, buffer, mime: doc?.mime || 'application/octet-stream' });
    else groupes.get(sous).push({ id: p.id, nom: p.nom, manquant: true });
  }
  const erreurs = [];
  for (const [, fichiers] of groupes) for (const f of fichiers.filter((x) => x.manquant)) erreurs.push(`${f.nom} : le fichier n'est plus sur le serveur`);
  const G = drive || (await import('../google-drive.js'));
  const fait = await G.rangerDataRoom(compte, {
    titre: nomDossierDrive(deal),
    dossierId: deal.drive_folder_id || null,
    groupes: [...groupes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sousDossier, fichiers]) => ({ sousDossier, fichiers: fichiers.filter((f) => !f.manquant) })),
    contexte: texteContexte(deal, toutes),
  });
  const frais = dealDe(dealId);
  const le = new Date().toISOString();
  Records.update('Deal', frais.id, {
    drive_folder_id: fait.folder_id,
    drive_folder_url: fait.folder_url,
    drive_range_le: le,
    documents_espace: (frais.documents_espace || []).map((d) => (fait.liens[d.id] ? { ...d, drive_file_id: fait.liens[d.id].drive_file_id, drive_url: fait.liens[d.id].drive_url, drive_copie_le: d.drive_copie_le || le, drive_range_le: le } : d)),
  });
  const tous = [...erreurs, ...(fait.erreurs || [])];
  if (tous.length) console.warn(`[data-room] Drive ${dealId} : ${tous.join(' ; ')}`);
  return { ok: true, renommees, folder_url: fait.folder_url, ranges: Object.keys(fait.liens).length, erreurs: tous, ...lireDepots(dealId) };
}

/**
 * Lance la lecture des seules pièces jamais lues (ou en échec), sur la grille de leur zone : une pièce reçue après
 * coup (les PV d'AG arrivés une semaine plus tard) ne relance pas l'analyse des autres (29 oct. 2026, Jules). Une
 * pièce déjà lue à qui manquent les informations du Bien ne relit que celles-là.
 */
export function aLire(dealId) {
  const brut = dealDe(dealId);
  const d = lireDepots(dealId);
  if (!brut || !d) return null;
  const lisibles = new Set(TYPES.filter((t) => grilleDe(t.grille)).map((t) => t.id));
  const etat = brut.analyse_pieces?.docs || {};
  const pieces = d.emplacements.filter((e) => lisibles.has(e.id)).flatMap((e) => e.documents.map((p) => ({ ...p, zone: e.id })));
  const nouvelles = pieces.filter((p) => !etat[p.id]?.extraction || etat[p.id].extraction.statut === 'erreur');
  const completer = pieces
    .filter((p) => etat[p.id]?.extraction?.statut === 'fait')
    .map((p) => ({ ...p, manque: (CRITERES_BIEN[p.zone] || []).map((c) => c.id).filter((id) => !(id in (etat[p.id].valeurs || {}))) }))
    .filter((p) => p.manque.length);
  return { pieces, nouvelles, completer, lues: pieces.length - nouvelles.length };
}

export function lancerAnalyse(dealId, { uploadDir, user } = {}) {
  if (!piecesRangees(dealId, user)) return { ok: false, error: 'Dossier introuvable' };
  const a = aLire(dealId);
  for (const p of a.nouvelles) enfiler(dealId, p.id, { uploadDir, user });
  for (const p of a.completer) enfiler(dealId, p.id, { uploadDir, user, seulement: p.manque });
  return { ok: true, lancees: a.nouvelles.length, completees: a.completer.length, deja: a.lues };
}
