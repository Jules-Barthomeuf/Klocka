// Les chiffres publics de l'INSEE sur une commune, servis sans clé :
//   - le revenu disponible médian par unité de consommation (Filosofi, API
//     Melodi, jeu DS_FILOSOFI_CC, mesure MED_SL : le « niveau de vie médian ») ;
//   - le taux de chômage localisé de sa zone d'emploi 2020 (la zone vient de
//     l'API de métadonnées géographiques, le taux du fichier trimestriel que
//     l'INSEE publie sur la page 1893230, données CVS).
// Vérifié le 12 oct. 2026 sur Libourne (33243) : 23 480 € en 2023, zone 7516.

import JSZip from 'jszip';

const MELODI = 'https://api.insee.fr/melodi/data/DS_FILOSOFI_CC';
const GEO = 'https://api.insee.fr/metadonnees/geo/commune';
const PAGE_CHOMAGE = 'https://www.insee.fr/fr/statistiques/1893230';
const UN_JOUR = 86400000;

const json = async (url) => {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`L'INSEE a répondu ${r.status}.`);
  return r.json();
};

/** Le revenu disponible médian par UC d'une commune, dernière année publiée. */
export async function revenuMedianUC(codeInsee) {
  const d = await json(`${MELODI}?GEO=COM-${encodeURIComponent(codeInsee)}&FILOSOFI_MEASURE=MED_SL`);
  const obs = (d.observations || [])
    .map((o) => ({ annee: o.dimensions?.TIME_PERIOD, valeur: o.measures?.OBS_VALUE_NIVEAU?.value }))
    .filter((o) => Number.isFinite(o.valeur))
    .sort((a, b) => String(b.annee).localeCompare(String(a.annee)))[0];
  // Une commune trop petite n'a pas de médiane publiée (secret statistique).
  if (!obs) return null;
  return { valeur_euros_an: obs.valeur, annee: obs.annee, source: `INSEE, Filosofi ${obs.annee} (niveau de vie médian, revenu disponible par UC)` };
}

/** La zone d'emploi 2020 d'une commune : { code, nom }. */
export async function zoneDEmploi(codeInsee) {
  const a = await json(`${GEO}/${encodeURIComponent(codeInsee)}/ascendants?type=ZoneDEmploi2020`);
  return a?.[0] ? { code: a[0].code, nom: a[0].intitule } : null;
}

// --- Le fichier trimestriel des taux par zone d'emploi -----------------------

/** Les cellules d'une feuille xlsx, ligne par ligne, chaînes partagées résolues. */
export function lignesDeFeuille(xmlFeuille, xmlChaines) {
  const decode = (t) => t.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const chaines = [...xmlChaines.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => decode([...m[1].matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((t) => t[1]).join('')));
  return [...xmlFeuille.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map((r) => {
    const ligne = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const v = /<v>([^<]*)<\/v>/.exec(c[3] || '')?.[1];
      if (v == null) continue;
      ligne[c[1]] = /t="s"/.test(c[2]) ? chaines[Number(v)] : /t="(str|inlineStr)"/.test(c[2]) ? decode(v) : Number(v);
    }
    return ligne;
  });
}

/** Le taux d'une zone dans les lignes de la feuille txcho_ze : dernière colonne remplie. */
export function tauxDeLaZone(lignes, codeZone) {
  const entete = lignes.find((l) => Object.values(l).some((v) => /^Code de la zone/i.test(String(v))));
  const ligne = lignes.find((l) => String(l.A) === String(codeZone));
  if (!entete || !ligne) return null;
  const colonnes = Object.keys(ligne).filter((k) => typeof ligne[k] === 'number' && k !== 'A' && entete[k]);
  const derniere = colonnes.sort((a, b) => a.length - b.length || a.localeCompare(b)).pop();
  return derniere ? { taux_pct: ligne[derniere], periode: String(entete[derniere]) } : null;
}

let fichier = null; // { le, lignes, nom }

async function lignesChomage() {
  if (fichier && Date.now() - fichier.le < UN_JOUR) return fichier;
  const page = await (await fetch(PAGE_CHOMAGE, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) })).text();
  const lien = /href="([^"]*chomage-zone-t1-[^"]*\.xlsx)"/.exec(page)?.[1];
  if (!lien) throw new Error("Le fichier trimestriel du chômage par zone d'emploi n'est plus sur la page de l'INSEE.");
  const r = await fetch(new URL(lien, PAGE_CHOMAGE), { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`L'INSEE a répondu ${r.status} pour le fichier du chômage.`);
  const zip = await JSZip.loadAsync(Buffer.from(await r.arrayBuffer()));
  const classeur = await zip.file('xl/workbook.xml').async('string');
  const liens = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const rid = /<sheet [^>]*name="txcho_ze"[^>]*r:id="([^"]+)"/.exec(classeur)?.[1];
  const cible = rid && new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`).exec(liens)?.[1];
  if (!cible) throw new Error("La feuille txcho_ze manque au fichier de l'INSEE.");
  const feuille = await zip.file(`xl/${cible.replace(/^\/?xl\//, '')}`).async('string');
  const chaines = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  fichier = { le: Date.now(), lignes: lignesDeFeuille(feuille, chaines), nom: lien.split('/').pop() };
  return fichier;
}

/** Le taux de chômage localisé de la zone d'emploi d'une commune, dernier trimestre. */
export async function chomageZoneEmploi(codeInsee) {
  const zone = await zoneDEmploi(codeInsee);
  if (!zone) return null;
  const { lignes } = await lignesChomage();
  const t = tauxDeLaZone(lignes, zone.code);
  if (!t) return null;
  return { zone_emploi: zone.nom, code_zone: zone.code, ...t, source: `INSEE, taux de chômage localisés par zone d'emploi (${t.periode}, CVS)`, lien: PAGE_CHOMAGE };
}
