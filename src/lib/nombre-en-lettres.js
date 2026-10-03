// Les montants en toutes lettres, comme les écrit MyNotary dans ses contrats :
// « QUATRE CENT CINQUANTE MILLE EUROS (450 000,00 €) ». Règles françaises :
// « et un » (vingt et un… soixante et onze), « quatre-vingts » et « deux
// cents » prennent un s seulement en fin de nombre, « mille » ne s'accorde
// jamais, « million » et « milliard » sont des noms et s'accordent.

const UNITES = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

/** 0 à 99. `fin` : le nombre s'arrête ici (quatre-vingts prend alors son s). */
function moinsDeCent(n, fin = true) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  if (d === 7 || d === 9) {
    const reste = 10 + u;
    return d === 7 && u === 1 ? 'soixante et onze' : `${DIZAINES[d]}-${UNITES[reste]}`;
  }
  if (u === 0) return d === 8 ? (fin ? 'quatre-vingts' : 'quatre-vingt') : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999. `fin` : rien ne suit (cents prend alors son s). */
function moinsDeMille(n, fin = true) {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centaine = c === 0 ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && fin ? 's' : ''}`;
  if (!r) return centaine || 'zéro';
  return centaine ? `${centaine} ${moinsDeCent(r, fin)}` : moinsDeCent(r, fin);
}

/** Pure : un entier positif en toutes lettres (minuscules). */
export function entierEnLettres(nombre) {
  let n = Math.floor(Math.abs(Number(nombre) || 0));
  if (n === 0) return 'zéro';
  const morceaux = [];
  const milliards = Math.floor(n / 1e9); n %= 1e9;
  const millions = Math.floor(n / 1e6); n %= 1e6;
  const milliers = Math.floor(n / 1e3); n %= 1e3;
  // Million et milliard sont des noms : ce qui les précède garde son s.
  if (milliards) morceaux.push(`${moinsDeMille(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) morceaux.push(`${moinsDeMille(millions, true)} million${millions > 1 ? 's' : ''}`);
  // Mille est un adjectif numéral : invariable, et « deux cent mille » sans s.
  if (milliers) morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (n) morceaux.push(moinsDeMille(n, true));
  return morceaux.join(' ');
}

/** Pure : « 450 000,00 € ». */
export const eurosChiffres = (montant) => `${Number(montant || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Pure : « QUATRE CENT CINQUANTE MILLE EUROS (450 000,00 €) ». */
export function eurosEnLettres(montant) {
  const m = Math.round(Math.abs(Number(montant) || 0) * 100) / 100;
  const entier = Math.floor(m);
  const centimes = Math.round((m - entier) * 100);
  let texte = `${entierEnLettres(entier)} euro${entier > 1 ? 's' : ''}`;
  if (centimes) texte += ` et ${entierEnLettres(centimes)} centime${centimes > 1 ? 's' : ''}`;
  return `${texte.toUpperCase()} (${eurosChiffres(m)})`;
}
