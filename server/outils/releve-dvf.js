// Le relevé des ventes que l'outil Prix a comparées (12 nov. 2026, Jules : « je veux un screenshot de ce que l'IA a
// vu, ce qu'elle a regardé ; juste une image, ça suffit »). DVF n'est pas une page qu'on photographie : ce sont les
// actes des notaires, publiés en fichiers par Etalab. L'image montre donc les ventes exactes que le calcul a retenues,
// une par ligne, puis leur médiane et le bien : c'est ce que « Voir source » ouvre sur le Prix, comme la page Equimmox
// photographiée l'est pour le Loyer. Les couleurs sont celles du thème clair de src/design/jetons.json, lues ici : un
// SVG ouvert seul ne lit pas les variables CSS de l'écran.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { CHEMIN_UPLOADS } from '../db.js';
import { montant } from '../montants.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(fs.readFileSync(path.join(ICI, '..', '..', 'src', 'design', 'jetons.json'), 'utf8')).couleurs_clair;
const POLICE = "'Instrument Sans', Inter, system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

const echapper = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const entier = (n) => Math.round(Number(n)).toLocaleString('fr-FR');
const couper = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1).trimEnd()}…` : String(t));
function jour(d, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '—' : x.toLocaleDateString('fr-FR', { ...options, timeZone: 'Europe/Paris' });
}

const L = 1200;
const MARGE = 48;
const HAUT_LIGNE = 40;
// Les colonnes : la date et l'adresse partent de la gauche, les nombres finissent à droite.
const COLONNES = [
  { titre: 'Date', x: MARGE, ancre: 'start' },
  { titre: 'Adresse', x: 168, ancre: 'start' },
  { titre: 'Surface', x: 780, ancre: 'end' },
  { titre: 'Prix', x: 900, ancre: 'end' },
  { titre: 'Prix au m²', x: 1040, ancre: 'end' },
  { titre: 'Distance', x: L - MARGE, ancre: 'end' },
];

/**
 * Pure : le SVG du relevé. `comparaison` : celle de calculerVerdict (deal/verdict-prix.js : n, cercle, annees,
 * prix_m2, bien_m2, ecart, ventes) ; `adresse` : l'adresse lue ; `surface` : celle du bien ; `statut` : le point du
 * Prix (ok, a_voir, alerte), qui teinte l'écart ; `le` : la date de lecture.
 */
export function svgReleveDvf({ adresse = '', comparaison: c, surface = null, statut = 'ok', le = new Date().toISOString() }) {
  const ventes = c?.ventes || [];
  const cercle = c?.cercle === 'même rue' ? 'dans la même rue' : c?.cercle ? `à ${c.cercle}` : null;
  const surfaces = Number(surface) > 0 ? `surfaces de ${entier(surface / 2)} à ${entier(surface * 2)} m²` : null;
  const contexte = [adresse, cercle, c?.annees ? `${c.annees} dernières années` : null, surfaces].filter(Boolean).join(' · ');
  const debut = 192;
  const fin = debut + ventes.length * HAUT_LIGNE;
  const ecart = Number.isFinite(c?.ecart) ? (c.ecart === 0 ? 'au niveau de la médiane' : `${c.ecart > 0 ? '+' : '−'}${Math.abs(c.ecart)} % face à la médiane`) : null;
  const teinte = statut === 'alerte' ? C.alerte : statut === 'a_voir' ? C.ambre : C.encre;
  const reste = c?.n > ventes.length ? `Les ${ventes.length} ventes les plus proches sur les ${c.n} retenues.` : null;
  const hauteur = fin + (reste ? 168 : 140);

  const lignes = ventes.map((v, i) => {
    const y = debut + i * HAUT_LIGNE + 26;
    const valeurs = [jour(v.date), couper(v.adresse || '—', 52), v.surface ? `${entier(v.surface)} m²` : '—', montant(v.prix) || '—', v.prix_m2 ? `${entier(v.prix_m2)} €` : '—', Number.isFinite(v.distance_m) ? `${entier(v.distance_m)} m` : '—'];
    const textes = valeurs.map((t, k) => `<text x="${COLONNES[k].x}" y="${y}" text-anchor="${COLONNES[k].ancre}" class="${k === 1 ? 'c' : 'n'}">${echapper(t)}</text>`).join('');
    return `${textes}<line x1="${MARGE}" x2="${L - MARGE}" y1="${debut + (i + 1) * HAUT_LIGNE}" y2="${debut + (i + 1) * HAUT_LIGNE}" stroke="${C.trait}"/>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${L}" height="${hauteur}" viewBox="0 0 ${L} ${hauteur}">
<style>text{font-family:${POLICE};fill:${C.encre}}.n{font-size:13.5px;font-variant-numeric:tabular-nums}.c{font-size:13.5px;fill:${C.craie}}.e{font-size:11px;fill:${C.brume};letter-spacing:.06em}</style>
<rect width="${L}" height="${hauteur}" fill="${C['surface-pleine']}"/>
<text x="${MARGE}" y="72" style="font-size:24px">Ventes de locaux commerciaux retenues</text>
<text x="${MARGE}" y="104" style="font-size:13.5px;fill:${C.ardoise}">DVF, actes des notaires (fichiers publiés par Etalab, DGFiP) · lu le ${echapper(jour(le, { day: 'numeric', month: 'long', year: 'numeric' }))}</text>
<text x="${MARGE}" y="128" style="font-size:13.5px;fill:${C.craie}">${echapper(contexte)}</text>
${COLONNES.map((k) => `<text x="${k.x}" y="${debut - 16}" text-anchor="${k.ancre}" class="e">${k.titre.toUpperCase()}</text>`).join('')}
<line x1="${MARGE}" x2="${L - MARGE}" y1="${debut}" y2="${debut}" stroke="${C.bord}"/>
${lignes}
<text x="${MARGE}" y="${fin + 48}" class="n" style="font-size:18px">Médiane des ${c?.n ?? ventes.length} vente${(c?.n ?? ventes.length) > 1 ? 's' : ''} : ${c?.prix_m2?.median ? `${entier(c.prix_m2.median)} €/m²` : '—'}</text>
${c?.bien_m2 ? `<text x="${MARGE}" y="${fin + 80}" class="n" style="font-size:18px;fill:${teinte}">Le bien : ${entier(c.bien_m2)} €/m²${ecart ? `, ${ecart}` : ''}</text>` : ''}
${reste ? `<text x="${MARGE}" y="${fin + 112}" style="font-size:12.5px;fill:${C.brume}">${echapper(reste)}</text>` : ''}
<text x="${MARGE}" y="${hauteur - 28}" style="font-size:12.5px;fill:${C.brume}">Seules comptent les ventes dont tous les locaux sont commerciaux ; les cessions à l'euro symbolique sont écartées.</text>
</svg>
`;
}

/** Écrit le relevé dans les fichiers déposés et rend son adresse (/uploads/sources/…), ou null s'il n'a pas pu s'écrire. */
export function ecrireReleveDvf(donnees) {
  if (!donnees?.comparaison?.ventes?.length) return null;
  try {
    const dossier = path.join(CHEMIN_UPLOADS, 'sources');
    fs.mkdirSync(dossier, { recursive: true });
    const nom = `dvf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.svg`;
    fs.writeFileSync(path.join(dossier, nom), svgReleveDvf(donnees));
    return `/uploads/sources/${nom}`;
  } catch {
    return null;
  }
}
