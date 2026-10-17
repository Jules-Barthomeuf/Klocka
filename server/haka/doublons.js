// Haka : le même bien reçu deux fois (17 oct. 2026, Jules). Pur.
//
// Même adresse et même prix : c'est le même bien, on rattache au dossier qui
// existe. Même adresse mais prix différent, ou adresse seulement proche : on
// propose, rien ne se fait avant le clic. Une adresse absente ne compare rien :
// pas de faux doublon sur « localisation inconnue ».

const ABREVIATIONS = [
  [/\bav(e|en)?\b\.?/g, 'avenue'], [/\bb(ou)?l(e)?v?(d)?\b\.?/g, 'boulevard'], [/\bbd\b\.?/g, 'boulevard'],
  [/\br\b\.?/g, 'rue'], [/\bpl\b\.?/g, 'place'], [/\bimp\b\.?/g, 'impasse'], [/\bfg\b\.?/g, 'faubourg'],
  [/\bste\b\.?/g, 'sainte'], [/\bst\b\.?/g, 'saint'], [/\ball(ee)?\b\.?/g, 'allee'], [/\bch\b\.?/g, 'chemin'],
  [/\bgal\b\.?/g, 'general'], [/\bpdt\b\.?/g, 'president'],
];

const nettoyer = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Pure : une adresse ramenée à une clé comparable. */
export function normaliserAdresse(adresse) {
  const a = adresse && typeof adresse === 'object' ? adresse : { rue: adresse };
  let voie = nettoyer(a.rue);
  // Le numéro (et son bis / ter) en tête.
  const m = voie.match(/^(\d+)\s*(bis|ter|quater|[a-d])?\b\s*(.*)$/);
  let numero = '';
  if (m) { numero = `${m[1]}${m[2] ? m[2] : ''}`; voie = m[3] || ''; }
  for (const [re, mot] of ABREVIATIONS) voie = voie.replace(re, mot);
  voie = voie.replace(/\s+/g, ' ').trim();
  const cp = String(a.code_postal || '').replace(/\D/g, '').slice(0, 5);
  const ville = nettoyer(a.ville);
  const lieu = cp || ville;
  return { numero, voie, cp, ville, cle: voie && lieu ? `${numero}|${voie}|${lieu}` : null, cleRue: voie && lieu ? `${voie}|${lieu}` : null };
}

const bigrammes = (t) => { const s = ` ${t} `; const r = new Set(); for (let i = 0; i < s.length - 1; i += 1) r.add(s.slice(i, i + 2)); return r; };
const dice = (x, y) => { const a = bigrammes(x); const b = bigrammes(y); let n = 0; for (const g of a) if (b.has(g)) n += 1; return a.size + b.size ? (2 * n) / (a.size + b.size) : 0; };

/**
 * Pure : compare deux biens `{ adresse: {rue, code_postal, ville}, prix }`.
 * @returns {'identique'|'meme_adresse'|'proche'|'different'}
 */
export function comparerBiens(a, b, { tolerancePrix = 0.005 } = {}) {
  const A = normaliserAdresse(a?.adresse);
  const B = normaliserAdresse(b?.adresse);
  if (!A.cle || !B.cle) return 'different';
  const prixA = Number(a?.prix); const prixB = Number(b?.prix);
  const memePrix = prixA > 0 && prixB > 0 && Math.abs(prixA - prixB) <= tolerancePrix * Math.max(prixA, prixB);
  if (A.cle === B.cle) return memePrix ? 'identique' : 'meme_adresse';
  const memeLieu = (A.cp && B.cp) ? A.cp === B.cp : (A.ville && A.ville === B.ville);
  if (!memeLieu) return 'different';
  if (A.voie === B.voie) return 'proche';
  if (dice(A.voie, B.voie) >= 0.85) return 'proche';
  return 'different';
}

const RANG = { identique: 0, meme_adresse: 1, proche: 2 };

/** Le bien d'un dossier, tel que `comparerBiens` le lit. */
export function bienDuDossier(deal) {
  const l = deal?.lots?.[0]?.lot || {};
  const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? (x.absent ? null : x.valeur) : x);
  const adresse = val(l.adresse);
  return { adresse: adresse && typeof adresse === 'object' ? adresse : null, prix: val(l.prix_fai) };
}

/**
 * Pure : parmi `deals`, ceux qui portent le même bien que `bien`, du plus sûr au moins sûr.
 * @returns {Array<{deal_id: string, niveau: 'identique'|'meme_adresse'|'proche', titre: string}>}
 */
export function chercherDoublons(bien, deals = []) {
  if (!bien?.adresse) return [];
  return deals
    .filter((d) => d && !d.archived && d.deal_id)
    .map((d) => ({ deal_id: d.deal_id, niveau: comparerBiens(bien, bienDuDossier(d)), titre: d.nom || d.lots?.[0]?.synthese?.titre || d.deal_id }))
    .filter((x) => x.niveau !== 'different')
    .sort((x, y) => RANG[x.niveau] - RANG[y.niveau]);
}
