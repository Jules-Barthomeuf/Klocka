// K-Data, la voirie de chaque rue (9 nov. 2026, Jules : « fais tout » pour approcher Data-B, point 3).
//
// Ce que SIRENE ne dit pas d'une rue : est-ce un grand axe, une rue piétonne, une ruelle ? La BD TOPO de l'IGN
// (service WFS public de la Géoplateforme, celui des IRIS) le dit pour chaque tronçon : son importance (1 = axe
// national, 5 = desserte, 6 = sentier), sa nature, l'accès des voitures, la largeur, le sens de circulation, et
// le nom de voie de la Base Adresse Nationale. On télécharge une commune une fois, on agrège par nom de voie, on
// garde le résultat sur disque : les lectures suivantes ne touchent pas au réseau.

import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from '../db.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const PAGE = 5000;
const DOSSIER = path.join(DATA_DIR, 'bdtopo-voirie');
const PROPRIETES = 'nature,importance,nom_voie_ban_gauche,nom_voie_ban_droite,largeur_de_chaussee,acces_vehicule_leger,sens_de_circulation,geometrie';

const fichierDe = (commune) => path.join(DOSSIER, `${commune}.json`);

/** Pure : la longueur d'une ligne en mètres (coordonnées longitude, latitude). */
export function longueurLigne(coords) {
  let total = 0;
  for (let i = 1; i < (coords || []).length; i += 1) {
    const [x1, y1] = coords[i - 1]; const [x2, y2] = coords[i];
    const k = Math.cos(((y1 + y2) / 2) * Math.PI / 180);
    total += Math.hypot((x2 - x1) * k, y2 - y1) * 111320;
  }
  return total;
}

/**
 * Pure : les tronçons d'une commune agrégés par nom de voie. Chaque voie : longueur, importance la plus forte et
 * moyenne (pondérée par la longueur), parts piétonne, à deux chaussées et à sens unique, largeur moyenne, centre.
 */
export function agregerTroncons(features) {
  const voies = new Map();
  for (const f of features || []) {
    const p = f.properties || {};
    const nom = p.nom_voie_ban_gauche || p.nom_voie_ban_droite;
    if (!nom) continue;
    const coords = f.geometry?.type === 'LineString' ? f.geometry.coordinates : (f.geometry?.coordinates || []).flat();
    const l = longueurLigne(coords);
    if (!l) continue;
    if (!voies.has(nom)) voies.set(nom, { nom, longueur: 0, troncons: 0, imp_min: 9, imp_l: 0, pieton_l: 0, ch2_l: 0, unique_l: 0, larg_l: 0, larg_n: 0, sx: 0, sy: 0 });
    const v = voies.get(nom);
    const imp = Number(p.importance) || 6;
    const mid = coords[Math.floor(coords.length / 2)] || [0, 0];
    v.longueur += l; v.troncons += 1;
    v.imp_min = Math.min(v.imp_min, imp); v.imp_l += imp * l;
    if (p.acces_vehicule_leger && p.acces_vehicule_leger !== 'Libre') v.pieton_l += l;
    if (/2 chauss/i.test(p.nature || '')) v.ch2_l += l;
    if (/^Sens/i.test(p.sens_de_circulation || '')) v.unique_l += l;
    if (Number(p.largeur_de_chaussee) > 0) { v.larg_l += Number(p.largeur_de_chaussee) * l; v.larg_n += l; }
    v.sx += mid[0] * l; v.sy += mid[1] * l;
  }
  return [...voies.values()].map((v) => ({
    nom: v.nom, longueur: Math.round(v.longueur), troncons: v.troncons, imp_min: v.imp_min,
    imp_moy: Math.round((v.imp_l / v.longueur) * 100) / 100,
    part_pieton: Math.round((v.pieton_l / v.longueur) * 100) / 100,
    part_2ch: Math.round((v.ch2_l / v.longueur) * 100) / 100,
    part_sens_unique: Math.round((v.unique_l / v.longueur) * 100) / 100,
    largeur: v.larg_n ? Math.round((v.larg_l / v.larg_n) * 10) / 10 : null,
    lon: Math.round((v.sx / v.longueur) * 1e6) / 1e6, lat: Math.round((v.sy / v.longueur) * 1e6) / 1e6,
  }));
}

/** Les tronçons nommés d'une commune (code INSEE), page par page. */
async function telecharger(commune) {
  const features = [];
  for (let debut = 0; debut < 200000; debut += PAGE) {
    const u = new URL(WFS);
    const filtre = `insee_commune_gauche='${commune}' AND (nom_voie_ban_gauche IS NOT NULL OR nom_voie_ban_droite IS NOT NULL)`;
    Object.entries({ service: 'WFS', version: '2.0.0', request: 'GetFeature', typeNames: 'BDTOPO_V3:troncon_de_route', outputFormat: 'application/json', count: PAGE, startIndex: debut, sortBy: 'cleabs', propertyName: PROPRIETES, CQL_FILTER: filtre })
      .forEach(([k, v]) => u.searchParams.set(k, String(v)));
    let j = null;
    for (let essai = 0; essai < 3 && !j; essai += 1) {
      try {
        const r = await fetch(u, { signal: AbortSignal.timeout(120000) });
        if (r.ok) j = await r.json();
      } catch { /* on réessaie */ }
      if (!j) await new Promise((ok) => { setTimeout(ok, 2000 * (essai + 1)); });
    }
    if (!j) throw new Error(`BD TOPO injoignable pour ${commune}`);
    features.push(...(j.features || []));
    if ((j.features || []).length < PAGE) break;
  }
  return features;
}

const memoire = new Map();

/** La voirie d'une commune, lue sur disque si on l'a déjà, sinon téléchargée puis gardée. */
export async function chargerVoirie(commune) {
  if (memoire.has(commune)) return memoire.get(commune);
  const f = fichierDe(commune);
  let voies = null;
  if (fs.existsSync(f)) voies = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    voies = agregerTroncons(await telecharger(commune));
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(voies));
  }
  memoire.set(commune, voies);
  return voies;
}

/** La voirie d'une commune si elle est déjà sur disque (sans réseau), sinon null. */
export function voirieGardee(commune) {
  if (memoire.has(commune)) return memoire.get(commune);
  const f = fichierDe(commune);
  if (!fs.existsSync(f)) return null;
  const voies = JSON.parse(fs.readFileSync(f, 'utf8'));
  memoire.set(commune, voies);
  return voies;
}
