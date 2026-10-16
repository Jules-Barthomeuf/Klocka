// Les chiffres entendus pendant un appel (16 oct. 2026, Jules) : l'agent dit
// un prix, un loyer, une surface ; la calculatrice du mode appel les lit dans
// la transcription en direct et fait les comptes (rendement, acte en main,
// prix qui passe), sans IA.
//
// La transcription écrit les montants en chiffres (« 450 000 euros ») ou en
// toutes lettres (« quatre cent cinquante mille euros ») : les deux se lisent.
// Le dernier chiffre dit l'emporte (« non pardon, 420 000 »). Un montant sans
// mot qui le nomme est un prix à partir de 100 000 €, un loyer en dessous.

const MOTS = {
  zero: 0, 'zéro': 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
  dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  vingt: 20, vingts: 20, trente: 30, quarante: 40, cinquante: 50, soixante: 60,
};
const MULTIPLES = { cent: 100, cents: 100, mille: 1000, million: 1e6, millions: 1e6, milliard: 1e9, milliards: 1e9 };
const estMotNombre = (m) => m in MOTS || m in MULTIPLES;

/** « quatre cent cinquante mille » → 450000 ; null si ce n'est pas un nombre. */
function valeurDesMots(mots) {
  let total = 0; let courant = 0;
  for (let k = 0; k < mots.length; k += 1) {
    const m = mots[k];
    if (m === 'et') continue;
    if (m === 'vingt' || m === 'vingts') {
      // quatre-vingt(s) : 4 × 20.
      if (mots[k - 1] === 'quatre') { courant += 80 - 4; continue; }
      courant += 20; continue;
    }
    if (m in MOTS) { courant += MOTS[m]; continue; }
    if (m === 'cent' || m === 'cents') { courant = (courant % 100 || 1) * 100 + (courant - (courant % 100)); continue; }
    if (m in MULTIPLES) { total += (courant || 1) * MULTIPLES[m]; courant = 0; }
  }
  return total + courant;
}

/** Les nombres écrits en lettres deviennent des chiffres ; « un » ou « une » seuls restent des articles. */
export function motsEnChiffres(texte) {
  const bouts = String(texte || '').match(/[a-zà-ÿœ]+|[^a-zà-ÿœ]+/gi) || [];
  const sortie = [];
  let k = 0;
  while (k < bouts.length) {
    const m = bouts[k].toLowerCase();
    if (!estMotNombre(m)) { sortie.push(bouts[k]); k += 1; continue; }
    // La suite de mots nombres, séparés par des espaces ou des traits d'union, « et » au milieu.
    const mots = [m];
    let fin = k;
    let j = k + 1;
    while (j + 1 < bouts.length && /^[\s-]+$/.test(bouts[j])) {
      const suivant = bouts[j + 1].toLowerCase();
      if (estMotNombre(suivant) || (suivant === 'et' && j + 3 < bouts.length && estMotNombre(bouts[j + 3].toLowerCase()) && /^[\s-]+$/.test(bouts[j + 2]))) {
        mots.push(suivant); fin = j + 1; j += 2;
      } else break;
    }
    if (mots.length === 1 && (m === 'un' || m === 'une')) { sortie.push(bouts[k]); k += 1; continue; }
    sortie.push(String(valeurDesMots(mots)));
    k = fin + 1;
  }
  return sortie.join('');
}

/** Le texte prêt à lire : espaces insécables, €, k€, « 450 mille », « 1,2 million », nombres en lettres. */
export function normaliser(texte) {
  let t = String(texte || '').replace(/[\u00a0\u202f]/g, ' ').toLowerCase();
  t = t.replace(/(\d)\s*k\s*€/g, '$1 mille euros').replace(/(\d)\s*k\b/g, '$1 mille').replace(/€/g, ' euros');
  t = motsEnChiffres(t);
  // « 450 mille », « 1,2 million » : le multiple s'applique au chiffre qui le précède.
  t = t.replace(/(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d+))?\s+(\d{4,})(?!\d)/g, (tout, a, b, c) => {
    // « 450 1000 » vient de « 450 mille » converti mot à mot.
    const mult = Number(c);
    if (![1000, 1e6, 1e9].includes(mult)) return tout;
    return String(Math.round(Number(`${a.replace(/[ .]/g, '')}.${b || 0}`) * mult));
  });
  return t;
}

// \b ne voit pas les lettres accentuées : les bords d'un mot se disent à la main.
const mot = (s) => new RegExp(`(?<![a-zà-ÿ])(?:${s})(?![a-zà-ÿ])`);
const AVANT_LOYER = mot('loyers?|lou[ée]e?s?|locatif|locative|bail');
const AVANT_PRIX = mot('prix|vend[a-zé]*|vente|demand[a-zé]*|net vendeur|fai|affiché|affichée|cession|proposé|proposée|cède');
const MOIS = /^\s*(?:euros?\s*)?(?:hors (?:charges|taxes)\s*|ht\s*|hc\s*)*(?:par mois|\/\s*mois|mensuel|le mois|chaque mois)/;
const AN = /^\s*(?:euros?\s*)?(?:hors (?:charges|taxes)\s*|ht\s*|hc\s*)*(?:par an|\/\s*an|annuel|l'an|par année)/;

/**
 * Les chiffres d'une transcription (morceaux en direct, notes tapées).
 * @param {string[]|string} textes
 * @returns {{ prix: number|null, loyer_an: number|null, loyer_mensuel: boolean, surface: number|null, trouves: {nature:string, valeur:number, extrait:string}[] }}
 */
export function chiffresEntendus(textes) {
  const liste = Array.isArray(textes) ? textes : [textes];
  const trouves = [];
  for (const brut of liste) {
    for (const phrase of normaliser(brut).split(/[.!?;\n]+/)) {
      const re = /(\d{1,3}(?:[ .]\d{3})+|\d+)(?:,(\d+))?/g;
      let depuis = 0;
      let x;
      while ((x = re.exec(phrase))) {
        const valeur = Number(`${x[1].replace(/[ .]/g, '')}.${x[2] || 0}`);
        const apres = phrase.slice(re.lastIndex, re.lastIndex + 40);
        const avant = phrase.slice(depuis, x.index);
        depuis = re.lastIndex;
        const extrait = phrase.slice(Math.max(0, x.index - 30), re.lastIndex + 20).trim();
        if (/^\s*(m²|m2|mètres? carrés?|metres? carres?|m carrés?)/.test(apres)) {
          if (valeur >= 5 && valeur <= 20000) trouves.push({ nature: 'surface', valeur, extrait });
          continue;
        }
        if (/^\s*(%|pour ?cent)/.test(apres)) continue;
        const euros = /^\s*(d['’]\s*)?(euros?|eur)\b/.test(apres);
        const loyerDit = AVANT_LOYER.test(avant);
        const prixDit = AVANT_PRIX.test(avant);
        // Un montant : dit en euros, ou nommé (prix, loyer) et d'au moins 300. Une année seule n'en est pas un.
        if (!euros && !((loyerDit || prixDit) && valeur >= 300)) continue;
        if (!euros && valeur >= 1900 && valeur <= 2100 && Number.isInteger(valeur)) continue;
        if (valeur < 100) continue;
        const mensuel = MOIS.test(apres);
        const annuel = AN.test(apres);
        let nature;
        if (mensuel || annuel) nature = 'loyer';
        else if (loyerDit && !prixDit) nature = 'loyer';
        else if (prixDit && !loyerDit) nature = 'prix';
        else nature = valeur >= 100000 ? 'prix' : 'loyer';
        if (nature === 'loyer') trouves.push({ nature, valeur: mensuel ? valeur * 12 : valeur, mensuel, extrait });
        else trouves.push({ nature, valeur, extrait });
      }
    }
  }
  const dernier = (n) => [...trouves].reverse().find((t) => t.nature === n) || null;
  const loyer = dernier('loyer');
  return {
    prix: dernier('prix')?.valeur ?? null,
    loyer_an: loyer?.valeur ?? null,
    loyer_mensuel: !!loyer?.mensuel,
    surface: dernier('surface')?.valeur ?? null,
    trouves,
  };
}

/**
 * Les comptes de la calculatrice, aux seuils d'AK (server/ak/seuils.json).
 * @param {{prix?:number|null, loyer_an?:number|null, surface?:number|null}} v
 * @param {{frais_acquisition_pct:number, rendement_aem:{tourne:number, dead:number}}} seuils
 */
export function calculer({ prix, loyer_an: loyer, surface }, seuils) {
  const p = Number(prix) > 0 ? Number(prix) : null;
  const l = Number(loyer) > 0 ? Number(loyer) : null;
  const s = Number(surface) > 0 ? Number(surface) : null;
  const frais = 1 + seuils.frais_acquisition_pct / 100;
  const arrondi = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  const rendementAem = p && l ? arrondi((l / (p * frais)) * 100) : null;
  const verdict = rendementAem == null ? null : rendementAem >= seuils.rendement_aem.tourne ? 'tourne' : rendementAem < seuils.rendement_aem.dead ? 'dead' : 'limite';
  return {
    rendement_brut: p && l ? arrondi((l / p) * 100) : null,
    rendement_aem: rendementAem,
    verdict,
    // Le prix FAI qui donne le rendement « ça tourne » acte en main.
    prix_qui_passe: l ? Math.round(l / (seuils.rendement_aem.tourne / 100) / frais / 1000) * 1000 : null,
    prix_m2: p && s ? Math.round(p / s) : null,
    loyer_m2_an: l && s ? Math.round(l / s) : null,
  };
}
