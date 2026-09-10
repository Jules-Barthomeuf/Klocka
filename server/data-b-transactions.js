// Data-B, module « Transaction de fonds de commerce » : les ventes de fonds
// autour d'une adresse, avec leur prix, leur activité et leur date.
//
// Ce que ça apprend sur un dossier : à quel rythme les commerces changent de
// mains dans la rue, à quels prix, et pour quelles activités. Un fonds qui se
// vend cher et souvent dit un emplacement recherché ; une rue sans transaction
// depuis des années dit l'inverse. C'est le complément des loyers : le loyer
// dit ce que vaut le mur, le fonds dit ce que vaut le commerce.
//
// Même mécanique que les valeurs locatives : pas de navigateur. La page de
// recherche porte un jeton et un identifiant, et un second appel rapporte les
// résultats.

import { Records } from './db.js';
import { pageDataB, postDataB, parametresAdresse, resoudreAdresse, lignesDe } from './data-b.js';

const CACHE_JOURS = 30;
const RAYON_DEFAUT = 500;
// Les rayons que Data-B accepte ; on prend le plus proche de ce qui est demandé.
const RAYONS = [50, 100, 250, 400, 500, 1000, 2000, 5000];

const nombre = (s) => {
  const n = Number(String(s || '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const mediane = (xs) => quantile(xs, 0.5);

// Les cessions de fonds vont de mille euros à des centaines de millions : une
// holding qui change de mains fait un maximum sans rapport avec la rue. On
// borne la fourchette aux déciles, où vivent les commerces.
function quantile(xs, q) {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const i = (t.length - 1) * q;
  const bas = Math.floor(i);
  const haut = Math.ceil(i);
  return Math.round(bas === haut ? t[bas] : t[bas] + (t[haut] - t[bas]) * (i - bas));
}

/** Une date française « 05/08/2026 » en date ISO, pour trier et comparer. */
function isoDe(jjmmaaaa) {
  const m = String(jjmmaaaa || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/**
 * Lit les transactions dans le bloc de résultats.
 *
 * Chaque fiche suit toujours le même ordre : enseigne, « Fonds de commerce »,
 * activité, date, adresse, « Prix du fonds », montant. C'est ce motif qu'on
 * suit, plutôt que la structure HTML, qui bouge à chaque refonte.
 *
 * @returns {{total: number, transactions: Array}}
 */
export function lireTransactions(html) {
  const l = lignesDe(html);
  const total = nombre(l.find((x) => /nombre de r[ée]sultats/i.test(x))?.split(':')[1]) ?? null;
  const transactions = [];
  for (let i = 1; i < l.length; i++) {
    if (!/^fonds de commerce$/i.test(l[i])) continue;
    const enseigne = l[i - 1];
    // Après « Fonds de commerce » : l'activité, puis la date, puis l'adresse.
    const activite = l[i + 1] && !isoDe(l[i + 1]) ? l[i + 1] : null;
    const iDate = activite ? i + 2 : i + 1;
    const date = isoDe(l[iDate]);
    if (!date) continue;
    const adresse = l[iDate + 1] || null;
    // Le prix suit « Prix du fonds », et le symbole vit sur sa propre ligne.
    let prix = null;
    for (let k = iDate + 2; k < Math.min(iDate + 8, l.length); k++) {
      if (/^prix du fonds$/i.test(l[k])) { prix = nombre(l[k + 1]); break; }
    }
    const detail = l.slice(iDate + 2, iDate + 12).find((x) => /acquis|c[ée]d[ée]|apport|achat/i.test(x)) || null;
    transactions.push({ enseigne, activite, date, adresse, prix, detail });
  }
  return { total: total ?? transactions.length, transactions };
}

/**
 * Ce que les transactions disent du marché : combien, à quel prix, depuis
 * quand, et pour quelles activités. C'est cela qu'on compare au dossier.
 */
export function marcheDe(transactions) {
  const prix = transactions.map((t) => t.prix).filter((p) => p > 0);
  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const parActivite = new Map();
  for (const t of transactions) {
    const a = (t.activite || 'Non précisée').trim();
    parActivite.set(a, (parActivite.get(a) || 0) + 1);
  }
  // Le rythme : combien de ventes par an sur la période observée.
  let parAn = null;
  if (dates.length >= 2) {
    const annees = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 86400000);
    if (annees > 0.25) parAn = Math.round((dates.length / annees) * 10) / 10;
  }
  return {
    nombre: transactions.length,
    avec_prix: prix.length,
    // Fourchette des huit dixièmes du milieu : le prix d'un commerce de la rue,
    // pas celui de la vente exceptionnelle qui traîne dans les données.
    prix_bas: quantile(prix, 0.1),
    prix_median: mediane(prix),
    prix_haut: quantile(prix, 0.9),
    prix_min: prix.length ? Math.min(...prix) : null,
    prix_max: prix.length ? Math.max(...prix) : null,
    depuis: dates[0] || null,
    jusqu_a: dates[dates.length - 1] || null,
    par_an: parAn,
    activites: [...parActivite.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nom, n]) => ({ nom, n })),
  };
}

// Comparer au dossier commence par repérer ce qui le concerne : une cession
// dans la même rue parle de l'emplacement, une cession au même numéro parle du
// commerce lui-même.
const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const motsRue = (s) => sansAccent(s).replace(/[^a-z0-9]+/g, ' ').replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|quai|impasse|allee|chemin|route|du|de|des|la|le|les|l|d)\b/g, ' ').trim();

function situer(transactions, adresse) {
  const rue = motsRue(adresse.rue);
  const numero = String(adresse.numero || '').trim();
  return transactions.map((t) => {
    const dansLaRue = !!rue && motsRue(t.adresse).includes(rue);
    const surPlace = dansLaRue && !!numero && new RegExp(`^${numero}\\b`).test(String(t.adresse || '').trim());
    return { ...t, dans_la_rue: dansLaRue, sur_place: surPlace };
  });
}

const cleCache = (a, rayon) => `${a.numero} ${a.rue} ${a.code_postal} ${a.ville}|${rayon}`.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Les transactions de fonds autour d'une adresse.
 * @param {string} texteAdresse
 * @param {{rayon?: number, forcer?: boolean, user?: object, garder?: number}} opts
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string}>}
 */
export async function transactionsFonds(texteAdresse, { rayon = RAYON_DEFAUT, forcer = false, user = null, garder = 40 } = {}) {
  const adresse = await resoudreAdresse(texteAdresse);
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };

  const r = RAYONS.reduce((a, b) => (Math.abs(b - rayon) < Math.abs(a - rayon) ? b : a), RAYONS[0]);
  const cle = cleCache(adresse, r);
  if (!forcer) {
    const recent = Records.filter('DataBTransactions', { cle })
      .filter((x) => Date.now() - Date.parse(x.le) < CACHE_JOURS * 86400000)
      .sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
    if (recent) return { ok: true, resultat: { ...recent.resultat, du_cache: true } };
  }

  const url = `https://transaction.data-b.com/search?${new URLSearchParams({
    ...parametresAdresse(adresse),
    distance: String(r),
    START_MM: '', START_AAAA: '', END_MM: '', END_AAAA: '',
  })}`;

  let page;
  try {
    page = await pageDataB(url);
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!page) return { ok: false, error: 'Data-B refuse la session : vérifiez le compte dans .env.' };
  if (/utilis[ée] par quelqu/i.test(page)) {
    return { ok: false, error: 'Data-B n\'accepte qu\'une session à la fois : quelqu\'un est connecté au même compte. Déconnectez-vous de Data-B, puis relancez.' };
  }

  // La page de résultats ne contient que le squelette : le jeton et
  // l'identifiant de la recherche mènent au contenu.
  const jeton = page.match(/token:\s*'([a-f0-9]{16,})'/i)?.[1];
  const id = page.match(/id:\s*'(\d+)'/i)?.[1];
  if (!jeton || !id) return { ok: false, error: 'Data-B n\'a pas rendu de recherche pour cette adresse.' };

  let contenu;
  try {
    contenu = await postDataB('https://transaction.data-b.com/frontend/load/search_content.php', { token: jeton, id });
  } catch (e) {
    return { ok: false, error: e.message };
  }
  if (!contenu) return { ok: false, error: 'Data-B n\'a pas rendu les transactions.' };

  const brutes = lireTransactions(contenu);
  const total = brutes.total;
  const transactions = situer(brutes.transactions, adresse);
  if (!transactions.length) return { ok: false, error: 'Aucune transaction de fonds trouvée autour de cette adresse.' };
  const dansLaRue = transactions.filter((t) => t.dans_la_rue);
  const surPlace = transactions.filter((t) => t.sur_place);

  // On garde ce qui touche le bien, puis les plus récentes autour : la liste
  // entière pèse des mégaoctets, et c'est le marché résumé qui sert à comparer.
  const parDate = (a, b) => String(b.date).localeCompare(String(a.date));
  const retenues = [
    ...surPlace.sort(parDate),
    ...dansLaRue.filter((t) => !t.sur_place).sort(parDate),
    ...transactions.filter((t) => !t.dans_la_rue).sort(parDate),
  ].slice(0, garder);

  const resultat = {
    source: 'Data-B · Transactions de fonds de commerce',
    adresse: adresse.label,
    rayon: r >= 1000 ? `${r / 1000} km` : `${r} m`,
    total,
    marche: marcheDe(transactions),
    // La rue à part : c'est elle qu'on compare au dossier, pas le quartier.
    rue: dansLaRue.length ? { nom: adresse.rue, ...marcheDe(dansLaRue) } : null,
    sur_place: surPlace.length,
    transactions: retenues,
    lien: url,
    le: new Date().toISOString(),
    par: user?.email || null,
  };
  Records.create('DataBTransactions', { cle, adresse: adresse.label, rayon: r, resultat, le: resultat.le, par: resultat.par });
  console.log(`[data-b] ${transactions.length} transactions de fonds lues autour de « ${adresse.label} » (${resultat.rayon})${user?.email ? ` — ${user.email}` : ''}`);
  return { ok: true, resultat };
}
