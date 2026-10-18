// Les loyers des dossiers Klocka, comme références de valeur locative (18 oct. 2026, plan de la boîte à
// outils de Haka : sortir de Data-B, les données Klocka d'abord).
//
// Pur : aucune base, aucun réseau. Le script de comptage (scripts/comptage-loyers.mjs) le lit en
// lecture seule sur Render ; la valeur locative le lit sur les dossiers de la base.
//
// L'origine d'un loyer décide de son poids :
//   - « reel »    : lu dans un bail, un avenant ou une quittance (la matrice du dossier) ;
//   - « saisi »   : posé à la main dans la fiche du bien ;
//   - « annonce » : lu sur la fiche de l'agent (le loyer annoncé).
// Le champ `origine_loyer` du lot, quand il est posé, l'emporte sur la déduction.

const val = (c) => (c && typeof c === 'object' && 'valeur' in c ? (c.absent === false || c.absent === undefined ? c.valeur : null) : c);

/** Pure : le premier nombre d'un texte (« 24 000 € HT/an » → 24000), ou null. */
export function nombreDe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').replace(/[\u00a0\u202f]/g, ' ').match(/\d[\d ]*(?:[.,]\d+)?/);
  if (!m) return null;
  const n = Number(m[0].replace(/ /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const RE_PIECE_BAIL = /bail|avenant|quittance|avis d[''']?[ée]ch[ée]ance/i;

/** Pure : le loyer lu dans une pièce de bail de la matrice du dossier, avec la pièce, ou null. */
export function loyerDuBail(deal) {
  for (const l of deal?.matrice?.lignes || []) {
    if (l.perime) continue;
    if (!RE_PIECE_BAIL.test(`${l.categorie || ''} ${l.document_nom || ''}`)) continue;
    const c = l.cellules?.loyer;
    const n = nombreDe(c?.reponse ?? c?.valeur);
    // Un loyer mensuel recopié tel quel (moins de 1 000 €) ne se compare pas à un loyer annuel : écarté.
    if (n && n >= 1000) return { loyer: n, document: l.document_nom || null, page: c?.page || null };
  }
  return null;
}

/**
 * Pure : le loyer d'un lot et son origine.
 * @returns {{loyer, surface, loyer_m2, origine: 'reel'|'saisi'|'annonce', document}|null}
 */
export function loyerDuLot(deal, index = 0) {
  const entree = deal?.lots?.[index];
  const lot = entree?.lot || {};
  const surface = Number(val(lot.surface_m2)) || null;
  const annonce = Number(val(lot.loyer_annuel_ht_hc)) || null;
  // La matrice est celle du dossier : elle ne vaut que pour son premier lot.
  const bail = index === 0 ? loyerDuBail(deal) : null;
  let origine = lot.origine_loyer || null;
  let loyer = annonce;
  let document = null;
  if (!origine) {
    if (bail) origine = 'reel';
    else if (lot.loyer_annuel_ht_hc?.saisi_a_la_main) origine = 'saisi';
    else origine = 'annonce';
  }
  if (origine === 'reel' && bail) { loyer = bail.loyer; document = bail.document; }
  if (!(loyer > 0) || !(surface > 0)) return null;
  return { loyer, surface, loyer_m2: Math.round((loyer / surface) * 10) / 10, origine, document };
}

/** Pure : l'adresse d'un lot en morceaux (rue, code postal, ville), et sa ligne. */
export function adresseDuLot(entree) {
  const a = val(entree?.lot?.adresse) || {};
  const ville = a.ville || entree?.enrichissement?.commune?.nom || null;
  const code_postal = a.code_postal ? String(a.code_postal) : null;
  const ligne = a.rue ? [a.rue, [code_postal, ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : null;
  return { rue: a.rue || null, code_postal, ville, code_insee: entree?.enrichissement?.commune?.code_insee || entree?.enrichissement?.commune?.code || null, ligne };
}

/** Pure : le département d'un code postal (« 06 », « 2A »…), ou null. */
export function departementDe(codePostal) {
  const cp = String(codePostal || '').trim();
  if (!/^\d{5}$/.test(cp)) return null;
  if (cp.startsWith('20')) return Number(cp) < 20200 ? '2A' : '2B';
  if (cp.startsWith('97')) return cp.slice(0, 3);
  return cp.slice(0, 2);
}

/** Pure : une adresse qu'on peut géocoder au numéro ou à la rue (une rue et un code postal ou une ville). */
export const adresseGeocodable = (a) => !!(a?.rue && (a.code_postal || a.ville));

/**
 * Pure : toutes les références de loyer des dossiers, une par lot qui a loyer, surface et adresse.
 * Les dossiers de test ne comptent pas. `exclure` : un deal_id à laisser de côté (le dossier lui-même).
 */
export function referencesKlocka(deals, { exclure = null } = {}) {
  const refs = [];
  for (const d of deals || []) {
    if (d.test || (exclure && d.deal_id === exclure)) continue;
    (d.lots || []).forEach((entree, index) => {
      const l = loyerDuLot(d, index);
      if (!l) return;
      const adresse = adresseDuLot(entree);
      refs.push({
        deal_id: d.deal_id,
        lot: index,
        titre: d.nom || d.titre || null,
        ...l,
        adresse,
        // Sans code postal, le code commune de l'enrichissement donne le département.
        departement: departementDe(adresse.code_postal) || (adresse.code_insee ? (/^97/.test(adresse.code_insee) ? adresse.code_insee.slice(0, 3) : adresse.code_insee.slice(0, 2)) : null),
        commune: entree?.enrichissement?.commune?.nom || adresse.ville || null,
        le: d.created_date || d.cree_le || null,
        statut: d.statut || null,
        archive: !!d.archived,
      });
    });
  }
  return refs;
}
