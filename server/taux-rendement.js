// La valeur des murs de commerce par le taux de rendement (31 oct. 2026, Jules) :
//   Valeur = loyer annuel HT hors charges ÷ taux de rendement.
// L'assistant propose un taux de base pour la ville, le mandataire dit « plus ou moins », puis les critères du bien
// l'ajustent, chacun avec son motif. Les écarts sont des ordres de grandeur à caler sur les ventes réelles de Klocka.

import { dateDe } from './data-b-murs.js';

/** Les réponses possibles de chaque critère ; « nc » (on ne sait pas) ne bouge rien. */
export const CRITERES_TAUX = {
  rang_rue: ['n1', 'n1bis', 'n2', 'nc'],
  profil_locataire: ['enseigne', 'solide', 'fragile', 'nc'],
  charges_refacturees: ['oui', 'non', 'nc'],
  taxe_fonciere_refacturee: ['oui', 'non', 'nc'],
};

// En murs de commerce, un rendement brut se situe en général entre 4 % et 10 %.
export const TAUX_MIN = 4;
export const TAUX_MAX = 10;
// La fourchette : la valeur à ± 0,25 point de taux.
export const ECART_FOURCHETTE = 0.25;

const ANNEE = 365.25 * 86400000;
const arrondi = (n) => Math.round(n / 1000) * 1000;
const deuxDecimales = (n) => Math.round(n * 100) / 100;

/**
 * Pure : le taux ajusté et la liste de ses ajustements. q : le questionnaire de l'avis ; loyerMarche : le loyer annuel
 * de marché du local (€/an), quand on le connaît.
 */
export function ajusterTaux(base, q = {}, { loyerMarche = null, aujourdhui = new Date() } = {}) {
  const ajustements = [];
  const ajoute = (delta, motif) => { if (delta) ajustements.push({ delta, motif }); };

  if (q.rang_rue === 'n1') ajoute(-0.5, 'emplacement n°1');
  if (q.rang_rue === 'n2') ajoute(0.5, 'emplacement n°2');

  if (q.occupe) {
    const profil = q.profil_locataire && q.profil_locataire !== 'nc' ? q.profil_locataire : q.franchise === 'oui' ? 'enseigne' : null;
    if (profil === 'enseigne') ajoute(-0.5, 'locataire sous enseigne nationale');
    if (profil === 'fragile') ajoute(0.75, 'locataire fragile');

    const effet = dateDe(q.date_effet);
    const fin = dateDe(q.echeance);
    if (fin && (fin - aujourdhui) / ANNEE < 2) ajoute(0.5, 'fin de bail dans moins de 2 ans');
    else if (effet && (aujourdhui - effet) / ANNEE < 3) ajoute(-0.25, 'bail récent');

    const loyer = Number(q.loyer_annuel_hc) || null;
    if (loyer && loyerMarche > 0) {
      const r = loyer / loyerMarche;
      if (r < 0.85) ajoute(-0.25, 'loyer sous le marché : potentiel de hausse');
      else if (r > 1.3) ajoute(1, 'loyer nettement au-dessus du marché : risque de baisse au renouvellement');
      else if (r > 1.15) ajoute(0.5, 'loyer au-dessus du marché : risque de baisse au renouvellement');
    }

    const aLaCharge = [q.charges_refacturees === 'non', q.taxe_fonciere_refacturee === 'non'].filter(Boolean).length;
    if (aLaCharge === 2) ajoute(0.5, 'charges et taxe foncière payées par le propriétaire');
    else if (aLaCharge === 1) ajoute(0.25, q.charges_refacturees === 'non' ? 'charges payées par le propriétaire' : 'taxe foncière payée par le propriétaire');
  }

  if (Number(q.vacance_rue_pct) > 15) ajoute(0.5, 'vacance de la rue au-dessus de 15 %');

  const brut = Number(base) + ajustements.reduce((t, a) => t + a.delta, 0);
  const taux = deuxDecimales(Math.min(TAUX_MAX, Math.max(TAUX_MIN, brut)));
  return { taux_base: Number(base), taux, ajustements, borne: taux !== deuxDecimales(brut) };
}

/** Pure : la valeur et la fourchette à ± 0,25 point. null sans loyer ou sans taux. */
export function valeurParRendement({ loyer, taux }) {
  const l = Number(loyer);
  const t = Number(taux);
  if (!(l > 0) || !(t > 0)) return null;
  const tBas = deuxDecimales(t - ECART_FOURCHETTE);
  const tHaut = deuxDecimales(t + ECART_FOURCHETTE);
  return {
    moyenne: arrondi(l / (t / 100)),
    basse: arrondi(l / (tHaut / 100)),
    haute: arrondi(l / (tBas / 100)),
    taux_bas: tBas,
    taux_haut: tHaut,
  };
}

/** Pure : l'estimation entière, ou null s'il manque le taux de base ou le loyer. */
export function estimerParRendement(q = {}, { loyer, loyerMarche = null, aujourdhui = new Date() } = {}) {
  const base = Number(q.taux_base);
  if (!(base > 0)) return null;
  const a = ajusterTaux(base, q, { loyerMarche, aujourdhui });
  const v = valeurParRendement({ loyer, taux: a.taux });
  return v ? { ...a, ...v, loyer: Number(loyer) } : null;
}

/** Pure : « 6,5 % ; emplacement n°1 −0,5 ; bail récent −0,25 ; retenu 5,75 % ». */
export function lectureDuTaux(e) {
  const n = (x) => String(x).replace('.', ',');
  const signe = (d) => (d > 0 ? `+${n(d)}` : `−${n(Math.abs(d))}`);
  return [`taux de base ${n(e.taux_base)} %`, ...e.ajustements.map((a) => `${a.motif} ${signe(a.delta)}`), `retenu ${n(e.taux)} %${e.borne ? ` (borné entre ${TAUX_MIN} et ${TAUX_MAX} %)` : ''}`].join(' ; ');
}

// --- Ce que les corrections apprennent (31 oct. 2026, Jules) ------------------
//
// Chaque taux de base validé est gardé (TauxBaseValide), avec celui que l'assistant avait proposé : « non, plutôt
// 6,3 % » apprend quelque chose. À la proposition suivante, l'assistant relit les taux validés de la ville (de tous les
// mandataires et de l'équipe) et l'écart moyen de ses propositions : il propose de mieux en mieux. Les essais ne
// comptent pas.

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const mediane = (xs) => {
  const v = [...xs].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return deuxDecimales(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
};
const moyenne = (xs) => (xs.length ? deuxDecimales(xs.reduce((t, x) => t + x, 0) / xs.length) : null);

/** Pure : la ville d'une adresse en texte, faute de mieux (« 12 rue X, 06600 Antibes » → « Antibes »). */
export function villeDuTexte(adresse) {
  const fin = String(adresse || '').split(',').pop().replace(/\b\d{5}\b/, '').trim();
  return fin || null;
}

/**
 * Pure : les repères appris pour une ville. lignes : les TauxBaseValide. Rend les taux validés de la ville (médiane,
 * nombre, les derniers), et l'écart moyen entre ce que l'assistant proposait et ce qui a été validé, dans la ville et
 * partout (positif : il propose trop bas).
 */
export function reperesAppris(lignes = [], ville) {
  const cle = sansAccents(ville);
  const valides = lignes.filter((l) => Number(l.valide) > 0 && !l.test);
  const ici = cle ? valides.filter((l) => sansAccents(l.ville) === cle) : [];
  const ecarts = (ls) => ls.filter((l) => Number(l.propose) > 0).map((l) => Number(l.valide) - Number(l.propose));
  const recents = [...ici].sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 8);
  return {
    ville: ville || null,
    taux_valides_ville: ici.length ? { nombre: ici.length, mediane: mediane(ici.map((l) => Number(l.valide))), derniers: recents.map((l) => ({ valide: Number(l.valide), propose: Number(l.propose) || null, rang_rue: l.rang_rue || null, activite: l.activite || null, le: String(l.le || '').slice(0, 10) })) } : null,
    ecart_moyen_ville: moyenne(ecarts(ici)),
    ecart_moyen_partout: moyenne(ecarts(valides)),
    corrections_partout: ecarts(valides).length,
  };
}

/**
 * Pure : l'échéance d'un bail qu'on peut calculer (1er nov. 2026, Jules : « si on dit que c'est un 3-6-9, il faut que
 * ça calcule, j'ai pas besoin de lui dire ») : neuf ans après la date d'effet pour un bail commercial 3-6-9, six pour un
 * bail professionnel. Des murs de commerce sans type dit : un 3-6-9, le cas courant, et l'avis le dit. Un dérogatoire ne
 * se calcule pas. Rend { echeance (jj/mm/aaaa), duree, suppose, tacite } ou null.
 */
export function echeanceDuBail(q = {}, aujourdhui = new Date()) {
  const effet = dateDe(q.date_effet);
  if (!effet) return null;
  const type = String(q.bail_type || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/derogatoire|precaire|courte duree/.test(type)) return null;
  let duree = null;
  if (/3\D{0,3}6\D{0,3}9|commercial|statutaire/.test(type)) duree = 9;
  else if (/profession/.test(type)) duree = 6;
  else if (!type && q.type_bien === 'murs_commerce') duree = 9;
  if (!duree) return null;
  const fin = new Date(effet.getFullYear() + duree, effet.getMonth(), effet.getDate());
  const deux = (n) => String(n).padStart(2, '0');
  return { echeance: `${deux(fin.getDate())}/${deux(fin.getMonth() + 1)}/${fin.getFullYear()}`, duree, suppose: !type, tacite: fin < aujourdhui };
}

/**
 * Pure : le rang de la rue proposé d'après Data-B (1er nov. 2026, Jules : « l'emplacement de la rue, il faut que ça me
 * fasse une proposition », par le loyer de la rue comparé à celui de la ville). marche : { rue, ville } avec leurs
 * fourchettes basse / haute en €/m²/an. Une rue à 1,4 fois la ville ou plus : n°1 ; à 1,1 fois : n°1 bis ; en dessous :
 * n°2. Le mandataire confirme ou corrige. Rend { rang, rapport, raison } ou null.
 */
export function rangDeLaRue(marche) {
  const milieu = (n) => { const b = Number(n?.basse), h = Number(n?.haute); return b > 0 && h > 0 ? (b + h) / 2 : b > 0 ? b : h > 0 ? h : null; };
  const rue = milieu(marche?.rue), ville = milieu(marche?.ville);
  if (!rue || !ville) return null;
  const rapport = Math.round((rue / ville) * 100) / 100;
  const rang = rapport >= 1.4 ? 'n1' : rapport >= 1.1 ? 'n1bis' : 'n2';
  const mot = { n1: 'n°1', n1bis: 'n°1 bis', n2: 'n°2' }[rang];
  const f = (n) => `${Math.round(Number(n?.basse))}–${Math.round(Number(n?.haute))} €/m²/an`;
  const fois = rapport.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return { rang, rapport, raison: `${marche.rue.nom || 'la rue'} se loue ${f(marche.rue)}, ${fois} fois ${marche.ville.nom || 'la ville'} (${f(marche.ville)}, Data-B) : emplacement ${mot}.` };
}
