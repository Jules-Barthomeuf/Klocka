// Dossier « Projet de Financement » d'un projet, généré en PPTX (pptxgenjs).
//
// Quinze diapositives, sur la maquette du dossier type (Dieppe) :
//  1  Couverture              2  Sommaire (+ photo)      3  La ville (+ photo)
//  4  Emplacement (carte IGN) 5  Zoom quartier (+ photo) 6  Présentation du local
//  7  Photos du local (×2)    8  Zoom bail (10 points)   9  Enseignes du secteur
// 10  Prix vs marché         11  Projection (titre seul) 12 Conditions (+ photo fixe)
// 13  CV porteur             14  Structuration           15 Merci
//
// Les panneaux « ville » et « secteur » reproduisent ceux de la page projet :
// mêmes données (dataset des grandes villes, sinon LLM serveur), même dessin.
// Les six photos sont choisies dans la page Présentations et passées en URLs.

import { CHEMIN_UPLOADS } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PptxGenJS from 'pptxgenjs';
import { invokeLLM, llmEnabled } from './llm.js';
import { trouverVille, trouverSecteur } from '../src/data/villes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = CHEMIN_UPLOADS;

const C = {
  fond: '000000',
  panneau: '0E100F',
  bordure: '2E3230',
  ivoire: 'FFFFFF',
  grisClair: 'D3D8D6',
  gris: '9AA19E',
  teal: '2A9D8F',
  tealClair: '7FD3C9',
};
const SERIF = 'Georgia';
const SANS = 'Helvetica';
const LARGEUR = 13.33;
const HAUTEUR = 7.5;

const nf = new Intl.NumberFormat('fr-FR');
const euros = (n) => (n == null ? '—' : `${nf.format(Math.round(n))} €`);
const nombre = (n) => (n == null ? '—' : nf.format(n));
const rempli = (s) => typeof s === 'string' && s.trim() && !/^non disponible/i.test(s.trim());
const positif = (n) => (typeof n === 'number' && isFinite(n) && n > 0 ? n : null);
const dateFr = (s) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d.toLocaleDateString('fr-FR') : null;
};

// ---------------------------------------------------------------------------
// Données dérivées
// ---------------------------------------------------------------------------

async function geocoder(project) {
  const lat = Number(project.latitude);
  const lon = Number(project.longitude);
  if (isFinite(lat) && isFinite(lon) && lat !== 0 && lon !== 0) return { lat, lon };
  if (!project.adresse_complete) return null;
  try {
    const r = await fetch(
      'https://api-adresse.data.gouv.fr/search/?limit=1&q=' + encodeURIComponent(project.adresse_complete),
      { signal: AbortSignal.timeout(6000) }
    );
    const f = (await r.json()).features?.[0];
    if (!f || (f.properties?.score ?? 0) < 0.3) return null;
    return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
  } catch {
    return null;
  }
}

function loyerInitial(p) {
  return positif(p.sim_loyer_initial_ht) || positif(p.loyer_annuel_ht) || positif(p.bail_loyer_actuel) || null;
}

function prixAcquisition(p) {
  return positif(p.sim_prix_bien_negocie) || positif(p.prix_acquisition) || positif(p.sim_prix_bien_fai) || null;
}

// Ville & secteur : dataset des grandes villes d'abord (celui de la page
// projet), sinon le LLM serveur avec le même schéma, sinon les descriptions.
async function analyseVilleSecteur(p) {
  const enPoints = (texte) =>
    String(texte).split(/\n+/).map((l) => l.replace(/^[-•●\s]+/, '').trim()).filter(Boolean);

  let ville = trouverVille(p.adresse_complete) || null;
  let secteur = trouverSecteur(ville, p.adresse_complete) || null;

  if ((!ville || !secteur) && llmEnabled) {
    try {
      const r = await invokeLLM({
        prompt:
          `Tu es analyste en immobilier commercial (murs de boutique). Adresse du bien : « ${p.adresse_complete || p.titre} ». ` +
          `Locataire : ${p.nom_locataire || 'n/c'} (${p.activite_locataire || 'n/c'}). ` +
          `Produis, en français, factuel, chiffres réels uniquement (si une donnée est incertaine, omets-la) : ` +
          `"ville" : nom de la commune, 4 chiffres clés (habitants INSEE, revenu médian, taux de chômage, prix médian logement au m²) et 2 à 3 points pour un investisseur. ` +
          `"secteur" : nom de la rue ou du quartier, 3 à 4 chiffres clés du micro-secteur (zone piétonne, loyer commercial €/m²/an, prix des murs €/m², taux de vacance) et 2 à 3 points courts.`,
        response_json_schema: {
          type: 'object',
          properties: {
            ville: {
              type: 'object',
              properties: {
                nom: { type: 'string' },
                chiffres: { type: 'array', items: { type: 'object', properties: { valeur: { type: 'string' }, label: { type: 'string' } } } },
                points: { type: 'array', items: { type: 'string' } },
              },
            },
            secteur: {
              type: 'object',
              properties: {
                nom: { type: 'string' },
                chiffres: { type: 'array', items: { type: 'object', properties: { valeur: { type: 'string' }, label: { type: 'string' } } } },
                points: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      });
      if (!ville && r?.ville?.nom) ville = r.ville;
      if (!secteur && (r?.secteur?.chiffres?.length || r?.secteur?.points?.length)) secteur = r.secteur;
    } catch (e) {
      console.warn('[presentation projet] analyse LLM indisponible :', e?.message || e);
    }
  }

  if (!ville && rempli(p.description_ville)) ville = { nom: null, chiffres: [], points: enPoints(p.description_ville) };
  if (!secteur && rempli(p.description_secteur)) secteur = { nom: p.marche_quartier_nom, chiffres: [], points: enPoints(p.description_secteur) };
  return { ville, secteur };
}

// Carte de l'emplacement : grille de tuiles Plan IGN assemblée dans la diapo.
const TUILE_IGN =
  'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0' +
  '&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png';

async function tuilesCarte(lat, lon, zoom, cols, lignes) {
  const n = 2 ** zoom;
  const rad = (lat * Math.PI) / 180;
  const cx = ((lon + 180) / 360) * n;
  const cy = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  const x0 = Math.round(cx - cols / 2);
  const y0 = Math.round(cy - lignes / 2);
  const chargements = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < lignes; j++) {
      chargements.push(
        fetch(`${TUILE_IGN}&TILEMATRIX=${zoom}&TILEROW=${y0 + j}&TILECOL=${x0 + i}`, { signal: AbortSignal.timeout(8000) })
          .then(async (r) => (r.ok ? { i, j, b64: Buffer.from(await r.arrayBuffer()).toString('base64') } : null))
          .catch(() => null)
      );
    }
  }
  const tuiles = (await Promise.all(chargements)).filter(Boolean);
  if (!tuiles.length) return null;
  return { tuiles, cols, lignes, fx: (cx - x0) / cols, fy: (cy - y0) / lignes };
}

// Une image (URL http ou chemin /uploads) en base64. Nulle si introuvable.
async function chargerImage(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    if (url.startsWith('/uploads/')) {
      const fichier = path.join(UPLOAD_DIR, url.replace('/uploads/', ''));
      return fs.existsSync(fichier) ? fs.readFileSync(fichier).toString('base64') : null;
    }
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return r.ok ? Buffer.from(await r.arrayBuffer()).toString('base64') : null;
  } catch {
    return null;
  }
}

// Enseignes autour du local : marques relevées dans OpenStreetMap (Overpass),
// logos officiels tirés de Wikidata (propriété P154 → Wikimedia Commons).
async function enseignesDuSecteur(coords) {
  if (!coords) return { logos: [], noms: [] };
  try {
    const requete = `[out:json][timeout:8];(nwr(around:400,${coords.lat},${coords.lon})[brand];);out tags 60;`;
    const appeler = () =>
      fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Klocka/1.0' },
        body: 'data=' + encodeURIComponent(requete),
        signal: AbortSignal.timeout(12000),
      });
    let r = await appeler().catch(() => null);
    if (!r?.ok) {
      // Overpass limite volontiers les rafales : une pause puis un second essai.
      await new Promise((f) => setTimeout(f, 1500));
      r = await appeler().catch(() => null);
    }
    if (!r?.ok) return { logos: [], noms: [] };
    const marques = new Map(); // marque -> QID wikidata (ou null)
    for (const el of (await r.json()).elements || []) {
      const t = el.tags || {};
      if (t.brand && !marques.has(t.brand)) marques.set(t.brand, t['brand:wikidata'] || null);
    }
    const noms = [...marques.keys()].slice(0, 10);
    const logos = [];
    for (const [marque, qid] of marques) {
      if (logos.length >= 6) break;
      if (!qid) continue;
      try {
        const entetes = { 'User-Agent': 'Klocka/1.0 (presentation)' };
        const wd = await (await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`, {
          signal: AbortSignal.timeout(8000), headers: entetes,
        })).json();
        const fichier = wd.entities?.[qid]?.claims?.P154?.[0]?.mainsnak?.datavalue?.value;
        if (!fichier) continue;
        const img = await fetch(
          `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fichier)}?width=400`,
          { signal: AbortSignal.timeout(10000), headers: entetes }
        );
        if (img.ok && (img.headers.get('content-type') || '').startsWith('image/')) {
          logos.push({ marque, b64: Buffer.from(await img.arrayBuffer()).toString('base64') });
        }
      } catch { /* marque suivante */ }
    }
    return { logos, noms };
  } catch {
    return { logos: [], noms: [] };
  }
}

// ---------------------------------------------------------------------------
// Briques de mise en page
// ---------------------------------------------------------------------------

function cercles(s, x, y, taille = 1.05) {
  s.addShape('ellipse', { x, y, w: taille, h: taille, fill: { color: C.tealClair } });
  s.addShape('ellipse', { x: x + taille * 0.55, y: y + taille * 0.42, w: taille, h: taille, fill: { color: C.teal } });
}

function titreSlide(s, texte, opts = {}) {
  s.addText(texte, {
    x: 0.6, y: 0.35, w: LARGEUR - 1.2, h: 0.85,
    fontFace: SERIF, fontSize: 34, color: C.ivoire, ...opts,
  });
}

function photoDroite(s, b64, largeur = 4.43) {
  if (!b64) return;
  s.addImage({
    data: `data:image/jpeg;base64,${b64}`,
    x: LARGEUR - largeur, y: 0, w: largeur, h: HAUTEUR,
    sizing: { type: 'cover', w: largeur, h: HAUTEUR },
  });
}

function blocTeal(s, { x, y, w, h, titre, valeur, corps = 17 }) {
  s.addShape('rect', { x, y, w, h, fill: { color: C.teal } });
  s.addText(titre.toUpperCase(), {
    x: x + 0.05, y: y + 0.1, w: w - 0.1, h: 0.34,
    align: 'center', fontFace: SANS, fontSize: 11.5, bold: true, color: '083530',
  });
  s.addText(String(valeur), {
    x: x + 0.05, y: y + 0.4, w: w - 0.1, h: h - 0.5,
    align: 'center', valign: 'top', fontFace: SANS, fontSize: corps, bold: true, color: C.ivoire,
  });
}

// Panneau « à la page projet » : étiquette, filet, chiffres 2 colonnes, puces.
function panneauVilleSecteur(s, { x, y, w, label, chiffres, points, maxChiffres = 4, maxPoints = 4 }) {
  const stats = (chiffres || []).filter((c) => c && c.valeur).slice(0, maxChiffres);
  const lignesStats = Math.ceil(stats.length / 2);
  const hStats = lignesStats * 0.92;
  const puces = (points || []).filter(Boolean).slice(0, maxPoints);
  const hPuces = puces.length * 0.62 + (puces.length ? 0.15 : 0);
  const h = 0.62 + hStats + hPuces + 0.25;

  s.addShape('rect', { x, y, w, h, fill: { color: C.panneau } });
  s.addText(label.toUpperCase(), {
    x: x + 0.25, y: y + 0.14, w: w - 0.5, h: 0.3,
    fontFace: SANS, fontSize: 10, color: C.gris, charSpacing: 3,
  });
  s.addShape('line', { x: x + 0.25, y: y + 0.52, w: w - 0.5, h: 0, line: { color: '3A3E3C', width: 0.75 } });

  stats.forEach((c, i) => {
    const col = i % 2;
    const ligne = Math.floor(i / 2);
    const cx = x + 0.25 + col * ((w - 0.5) / 2);
    const cy = y + 0.62 + ligne * 0.92;
    if (col === 1) {
      s.addShape('line', { x: cx - 0.12, y: cy + 0.08, w: 0, h: 0.7, line: { color: '3A3E3C', width: 0.75 } });
    }
    s.addText(String(c.valeur), { x: cx, y: cy, w: (w - 0.5) / 2 - 0.2, h: 0.42, fontFace: SANS, fontSize: 19, color: C.ivoire });
    s.addText(String(c.label), { x: cx, y: cy + 0.42, w: (w - 0.5) / 2 - 0.2, h: 0.3, fontFace: SANS, fontSize: 10, color: C.gris });
  });

  puces.forEach((t, i) => {
    const py = y + 0.62 + hStats + 0.1 + i * 0.62;
    s.addShape('ellipse', { x: x + 0.28, y: py + 0.09, w: 0.05, h: 0.05, fill: { color: C.teal } });
    s.addText(t, {
      x: x + 0.45, y: py, w: w - 0.75, h: 0.6,
      fontFace: SANS, fontSize: 10.5, color: C.grisClair, valign: 'top',
    });
  });
  return h;
}

// ---------------------------------------------------------------------------

/**
 * @param {object} project
 * @param {object} photos URLs choisies : { sommaire, ville, quartier, local1, local2, conditions }
 * @returns {Promise<Buffer>} le PPTX
 */
export async function genererPresentationProjet(project, photos = {}) {
  const p = project;
  const [coords, analyse, imgSommaire, imgVille, imgQuartier, imgLocal1, imgLocal2, imgConditions] =
    await Promise.all([
      geocoder(p),
      analyseVilleSecteur(p),
      chargerImage(photos.sommaire),
      chargerImage(photos.ville),
      chargerImage(photos.quartier),
      chargerImage(photos.local1),
      chargerImage(photos.local2),
      chargerImage(photos.conditions),
    ]);
  const [carte, enseignes] = await Promise.all([
    coords ? tuilesCarte(coords.lat, coords.lon, 15, 6, 4) : null,
    enseignesDuSecteur(coords),
  ]);

  const nomVille = analyse.ville?.nom ||
    (p.adresse_complete || '').split(',').pop()?.replace(/\b\d{5}\b/, '').trim() || '…';
  const nomSecteur = analyse.secteur?.nom || p.marche_quartier_nom ||
    (p.adresse_complete || '').split(',')[0] || '';
  const surface = positif(p.surface_m2) || positif(p.sim_surface);
  const loyer = loyerInitial(p);
  const loyerM2 = positif(p.loyer_m2_an) || (surface && loyer ? Math.round(loyer / surface) : null);
  const prix = prixAcquisition(p);
  const prixM2 = surface && prix ? Math.round(prix / surface) : null;
  const indexation = positif(p.sim_indexation_loyers) ?? 2;
  const dureeCredit = positif(p.sim_duree_credit) || 20;
  const apport = positif(p.sim_apport);
  const echeance = p.bail_date_echeance || p.echeance_bail;
  const anneesRestantes = echeance && !isNaN(new Date(echeance))
    ? Math.max(0, (new Date(echeance) - Date.now()) / (365.25 * 24 * 3600 * 1000))
    : null;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Klocka';
  pptx.title = `Projet de financement — ${p.titre || p.adresse_complete || ''}`;

  const slide = () => {
    const s = pptx.addSlide();
    s.background = { color: C.fond };
    return s;
  };

  // --- 1. Couverture ---------------------------------------------------------
  {
    const s = slide();
    cercles(s, 0.5, 0.35);
    s.addText('Prenom NOM', { x: 0.7, y: 3.1, w: 3.4, h: 0.6, fontFace: SERIF, fontSize: 26, color: C.teal });
    s.addShape('line', { x: 4.35, y: 2.8, w: 0, h: 1.7, line: { color: C.ivoire, width: 1 } });
    s.addText('Projet de Financement', { x: 4.7, y: 2.75, w: 8.2, h: 0.85, fontFace: SERIF, fontSize: 40, color: C.ivoire });
    s.addText(`Murs de commerce :\n${p.adresse_complete || p.titre || ''}`, {
      x: 4.7, y: 3.65, w: 8.2, h: 0.95, fontFace: SERIF, fontSize: 19, color: C.ivoire,
    });
    s.addText([
      { text: 'A l’attention de ', options: { color: C.ivoire } },
      { text: 'XXX', options: { color: 'E2564D' } },
    ], { x: 0, y: 6.1, w: LARGEUR, h: 0.4, align: 'center', fontFace: SANS, fontSize: 16 });
  }

  // --- 2. Sommaire ------------------------------------------------------------
  {
    const s = slide();
    s.addText('Sommaire', { x: 0.6, y: 0.5, w: 7, h: 1, fontFace: SERIF, fontSize: 44, color: C.ivoire });
    const items = [
      `La ville de ${nomVille}`,
      'Un emplacement stratégique',
      'Zoom sur le quartier',
      'Présentation du local',
      'Analyse du bail en cours',
      'Projection financière',
      'Conditions souhaitées',
      'CV des porteurs du projet & structuration',
    ];
    s.addText(
      items.map((t, i) => ({ text: `${i + 1}. ${t}`, options: { paraSpaceAfter: 13, breakLine: true } })),
      { x: 0.65, y: 1.75, w: 7.6, h: 5.3, fontFace: SERIF, fontSize: 15.5, color: C.ivoire, valign: 'top' }
    );
    photoDroite(s, imgSommaire, 5.2);
  }

  // --- 3. La ville -------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, `La ville de ${nomVille}`);
    if (analyse.ville) {
      panneauVilleSecteur(s, {
        x: 0.6, y: 1.4, w: 7.3,
        label: `La ville — ${nomVille}`,
        chiffres: (analyse.ville.chiffres || []).filter((c) => !/population \/ an/i.test(c?.label || '')),
        points: analyse.ville.points,
        maxChiffres: 4, maxPoints: 5,
      });
    } else {
      s.addText('Données de ville à compléter.', { x: 0.65, y: 1.5, w: 7, h: 0.5, fontFace: SANS, fontSize: 12, color: C.gris });
    }
    photoDroite(s, imgVille, 5.2);
  }

  // --- 4. Un emplacement stratégique --------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Un emplacement stratégique');
    if (carte) {
      const zone = { x: 1.35, y: 1.35, w: 10.6, h: 5.6 };
      const tw = zone.w / carte.cols;
      const th = zone.h / carte.lignes;
      for (const t of carte.tuiles) {
        s.addImage({
          data: `data:image/png;base64,${t.b64}`,
          x: zone.x + t.i * tw, y: zone.y + t.j * th, w: tw + 0.005, h: th + 0.005,
        });
      }
      const px = zone.x + carte.fx * zone.w;
      const py = zone.y + carte.fy * zone.h;
      s.addShape('ellipse', { x: px - 0.09, y: py - 0.09, w: 0.18, h: 0.18, fill: { color: C.teal }, line: { color: 'FFFFFF', width: 1.5 } });
      s.addShape('rect', { x: px - 0.85, y: py - 0.62, w: 1.7, h: 0.38, fill: { color: '1D7A70' } });
      s.addText('Local commercial', { x: px - 0.85, y: py - 0.62, w: 1.7, h: 0.38, align: 'center', valign: 'middle', fontFace: SANS, fontSize: 10, bold: true, color: 'FFFFFF' });
      s.addText('© IGN', { x: zone.x + zone.w - 0.8, y: zone.y + zone.h - 0.3, w: 0.75, h: 0.25, align: 'right', fontFace: SANS, fontSize: 8, color: '5A605E' });
    } else {
      s.addText('Adresse non géolocalisable — carte à insérer.', { x: 0.65, y: 1.5, w: 10, h: 0.5, fontFace: SANS, fontSize: 12, color: C.gris });
    }
  }

  // --- 5. Zoom sur le quartier ----------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Zoom sur le quartier');
    if (analyse.secteur) {
      panneauVilleSecteur(s, {
        x: 0.6, y: 1.4, w: 7.3,
        label: `Le secteur${nomSecteur ? ` — ${nomSecteur}` : ''}`,
        chiffres: analyse.secteur.chiffres,
        points: analyse.secteur.points,
        maxChiffres: 4, maxPoints: 4,
      });
    } else {
      s.addText('Données de secteur à compléter.', { x: 0.65, y: 1.5, w: 7, h: 0.5, fontFace: SANS, fontSize: 12, color: C.gris });
    }
    photoDroite(s, imgQuartier, 5.2);
  }

  // --- 6. Présentation du local ----------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Présentation du local');
    const panneau = { x: 0.6, y: 1.45, w: 12.13 };

    // Phrase d'en-tête, comme la fiche locataire de la page projet.
    const entete = [
      rempli(p.nom_locataire) ? `Société ${p.nom_locataire}` : null,
      rempli(p.activite_locataire) ? p.activite_locataire : null,
      loyer ? `${nf.format(loyer)} € HT HC de loyer annuel` : null,
      anneesRestantes != null ? `bail courant sur ${anneesRestantes.toFixed(1).replace('.', ',')} an(s)` : null,
    ].filter(Boolean).join(' — ');

    s.addShape('rect', { x: panneau.x, y: panneau.y, w: panneau.w, h: 2.35, fill: { color: C.panneau } });
    s.addText(entete || 'Locataire à renseigner.', {
      x: panneau.x + 0.3, y: panneau.y + 0.15, w: panneau.w - 0.6, h: 0.4,
      fontFace: SANS, fontSize: 12.5, color: C.ivoire,
    });
    s.addShape('line', { x: panneau.x + 0.3, y: panneau.y + 0.68, w: panneau.w - 0.6, h: 0, line: { color: '3A3E3C', width: 0.75 } });

    const stats = [
      [loyer ? `${nf.format(loyer)} €` : '—', 'Loyer annuel HT/HC', C.ivoire],
      [loyerM2 ? `${nombre(loyerM2)} €` : '—', 'Loyer /m²/an', C.tealClair],
      [anneesRestantes != null ? `${anneesRestantes.toFixed(1).replace('.', ',')} ans` : '—', 'Bail restant à courir', C.ivoire],
      [echeance && !isNaN(new Date(echeance))
        ? `${String(new Date(echeance).getMonth() + 1).padStart(2, '0')}/${new Date(echeance).getFullYear()}`
        : '—', 'Échéance du bail', C.ivoire],
    ];
    const wStat = (panneau.w - 0.6) / 4;
    stats.forEach(([valeur, label, couleur], i) => {
      const sx = panneau.x + 0.3 + i * wStat;
      if (i > 0) s.addShape('line', { x: sx - 0.15, y: panneau.y + 0.95, w: 0, h: 1.05, line: { color: '3A3E3C', width: 0.75 } });
      s.addText(String(valeur), { x: sx, y: panneau.y + 0.95, w: wStat - 0.3, h: 0.55, fontFace: SANS, fontSize: 22, color: couleur });
      s.addText(label, { x: sx, y: panneau.y + 1.55, w: wStat - 0.3, h: 0.3, fontFace: SANS, fontSize: 10.5, color: C.gris });
    });

    // Deux tableaux : identité et économie de la signature.
    const tableau = (x, titreTable, lignes) => {
      const yT = 4.2;
      s.addShape('rect', { x, y: yT, w: 5.9, h: 2.5, fill: { color: C.panneau } });
      s.addText(titreTable.toUpperCase(), {
        x: x + 0.3, y: yT + 0.18, w: 5.3, h: 0.3, fontFace: SANS, fontSize: 10, color: C.tealClair, charSpacing: 2,
      });
      lignes.forEach(([label, valeur, teal], i) => {
        const ly = yT + 0.62 + i * 0.58;
        s.addShape('line', { x: x + 0.3, y: ly, w: 5.3, h: 0, line: { color: '2A2E2C', width: 0.75 } });
        s.addText(label, { x: x + 0.3, y: ly + 0.06, w: 2.5, h: 0.45, fontFace: SANS, fontSize: 11.5, color: C.gris, valign: 'middle' });
        s.addText(String(valeur ?? '—'), {
          x: x + 2.6, y: ly + 0.06, w: 3, h: 0.45, align: 'right', valign: 'middle',
          fontFace: SANS, fontSize: 11.5, color: teal ? C.tealClair : C.ivoire,
        });
      });
    };
    tableau(0.6, 'Identité', [
      ['Raison sociale', rempli(p.nom_locataire) ? `Société ${p.nom_locataire}` : '—'],
      ['Activité', rempli(p.activite_locataire) ? p.activite_locataire : '—'],
      ['Adresse d’exploitation', p.adresse_complete || '—'],
    ]);
    tableau(6.83, 'Économie de la signature', [
      ['Loyer annuel HT/HC', loyer ? `${nf.format(loyer)} €` : '—'],
      ['Loyer au m²', loyerM2 ? `${nombre(loyerM2)} €/m²/an` : '—', true],
      ['Échéance du bail', dateFr(echeance) || '—'],
    ]);
  }

  // --- 7. Photos du local -----------------------------------------------------------
  {
    const s = slide();
    const deux = imgLocal1 && imgLocal2;
    const w = deux ? 5.9 : 8;
    const h = 5.9;
    const y = (HAUTEUR - h) / 2;
    if (imgLocal1) {
      s.addImage({ data: `data:image/jpeg;base64,${imgLocal1}`, x: deux ? 0.45 : (LARGEUR - w) / 2, y, w, h, sizing: { type: 'cover', w, h } });
    }
    if (imgLocal2) {
      s.addImage({ data: `data:image/jpeg;base64,${imgLocal2}`, x: deux ? 6.98 : (LARGEUR - w) / 2, y, w, h, sizing: { type: 'cover', w, h } });
    }
    if (!imgLocal1 && !imgLocal2) {
      s.addText('Photos du local à insérer.', { x: 0, y: 3.4, w: LARGEUR, h: 0.6, align: 'center', fontFace: SANS, fontSize: 14, color: C.gris });
    }
  }

  // --- 8. Zoom sur le bail commercial (dix points) -------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Zoom sur le bail commercial', { align: 'center' });
    const points = [
      ['Activité', rempli(p.activite_locataire) ? `${p.activite_locataire}.` : '—'],
      ['Statut du bail', rempli(p.statut_bail) ? `${p.statut_bail}.` : 'En cours.'],
      ['Date d’échéance', dateFr(echeance) ? `${new Date(echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.` : '—'],
      ['Loyer annuel HT', loyer ? `${euros(loyer)}.` : '—'],
      ['Loyer mensuel HT', loyer ? `${euros(loyer / 12)}.` : '—'],
      ['Indice de référence', 'Indice des loyers commerciaux (ILC).'],
      ['Fréquence d’indexation', 'Révision annuelle.'],
      ['Hypothèse de revalorisation', `+${String(indexation).replace('.', ',')} % par an.`],
      ['Impact de l’indexation', 'Augmentation progressive du loyer à chaque échéance.'],
      ['Cadre contractuel', 'Les autres conditions du bail commercial initial restent applicables jusqu’au terme.'],
    ];
    s.addShape('rect', { x: 1.6, y: 1.45, w: 10.1, h: 5.35, fill: { color: '0B0D0C' } });
    s.addText(
      points.flatMap(([titre, valeur], i) => ([
        { text: `${i + 1}.  ${titre} : `, options: { bold: true, color: C.ivoire } },
        { text: String(valeur), options: { color: C.grisClair, breakLine: true } },
      ])),
      {
        x: 1.95, y: 1.7, w: 9.4, h: 4.9,
        fontFace: SANS, fontSize: 13.5, valign: 'top', lineSpacing: 28,
      }
    );
  }

  // --- 9. Des enseignes présentes sur le secteur -----------------------------------------
  {
    const s = slide();
    s.addText('Des enseignes présentes sur le secteur', {
      x: 0.4, y: 0.35, w: LARGEUR - 0.8, h: 0.85, align: 'center',
      fontFace: SANS, fontSize: 32, bold: true, color: C.ivoire,
    });
    s.addShape('ellipse', { x: 2.55, y: 1.5, w: 8.2, h: 5.3, fill: { color: 'FFFFFF' }, line: { color: C.teal, width: 1.5 } });
    const logos = enseignes.logos;
    if (logos.length) {
      const parLigne = Math.ceil(logos.length / 2);
      logos.forEach((l, i) => {
        const ligne = Math.floor(i / parLigne);
        const col = i % parLigne;
        const wCell = 6.6 / parLigne;
        s.addImage({
          data: `data:image/png;base64,${l.b64}`,
          x: 3.35 + col * wCell + (wCell - 0.9) / 2,
          y: 2.35 + ligne * 1.8,
          w: 0.9, h: 0.9,
          sizing: { type: 'contain', w: 0.9, h: 0.9 },
        });
      });
    } else if (enseignes.noms.length) {
      s.addText(enseignes.noms.slice(0, 8).join('   ·   '), {
        x: 3.1, y: 3.3, w: 7.1, h: 1.6, align: 'center', valign: 'middle',
        fontFace: SANS, fontSize: 16, bold: true, color: '15201E',
      });
    } else {
      s.addText('Logos des enseignes voisines à insérer.', {
        x: 3.1, y: 3.6, w: 7.1, h: 0.9, align: 'center', fontFace: SANS, fontSize: 13, color: '8A918F',
      });
    }
  }

  // --- 10. Prix d'acquisition et loyers vs marché ------------------------------------------
  {
    const s = slide();
    s.addText('Prix d’acquisition et loyers vs marché', {
      x: 0.4, y: 0.3, w: LARGEUR - 0.8, h: 0.85, align: 'center',
      fontFace: SANS, fontSize: 32, bold: true, color: C.ivoire,
    });

    const mursSecteur = positif(p.marche_prix_m2_median) ||
      (positif(p.marche_prix_m2_bas) && positif(p.marche_prix_m2_haut)
        ? Math.round((p.marche_prix_m2_bas + p.marche_prix_m2_haut) / 2) : null);
    const locatifSecteur = positif(p.marche_baux_moyenne) || positif(p.marche_offre_moyenne);

    // Marché (encadré blanc), puis le local (encadré teal), reliés visuellement.
    s.addShape('roundRect', { x: 1.7, y: 1.35, w: 9.9, h: 1.85, rectRadius: 0.12, fill: { color: 'FFFFFF' }, line: { color: C.teal, width: 1.5 } });
    s.addText('Prix de marché secteur', { x: 1.7, y: 1.44, w: 9.9, h: 0.35, align: 'center', fontFace: SANS, fontSize: 13, color: '4A514F' });
    blocTeal(s, { x: 2.45, y: 1.95, w: 3.6, h: 1, titre: 'Valeur moyenne des murs', valeur: mursSecteur ? `${nombre(mursSecteur)} €/m²` : '—', corps: 16 });
    blocTeal(s, { x: 7.25, y: 1.95, w: 3.6, h: 1, titre: 'Valeur moyenne locative', valeur: locatifSecteur ? `${nombre(Math.round(locatifSecteur))} €/m²/an` : '—', corps: 16 });

    s.addText('↓', { x: 4, y: 3.22, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 24, color: C.teal });
    s.addText('↓', { x: 8.8, y: 3.22, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 24, color: C.teal });

    s.addShape('roundRect', { x: 1.7, y: 3.75, w: 9.9, h: 2.15, rectRadius: 0.12, fill: { color: C.teal } });
    s.addText(`Local ${nomSecteur || p.adresse_complete || ''}`.trim(), { x: 1.7, y: 3.85, w: 9.9, h: 0.35, align: 'center', fontFace: SANS, fontSize: 13, color: 'E9FBF8' });
    const blocNoir = (x, titre, valeur, sousTexte) => {
      s.addShape('rect', { x, y: 4.35, w: 3.6, h: 1, fill: { color: '0A0C0C' } });
      s.addText(titre.toUpperCase(), { x: x + 0.05, y: 4.45, w: 3.5, h: 0.3, align: 'center', fontFace: SANS, fontSize: 11, bold: true, color: C.tealClair });
      s.addText(valeur, { x: x + 0.05, y: 4.75, w: 3.5, h: 0.5, align: 'center', fontFace: SANS, fontSize: 17, bold: true, color: 'FFFFFF' });
      if (sousTexte) s.addText(sousTexte, { x: x - 0.2, y: 5.45, w: 4, h: 0.3, align: 'center', fontFace: SANS, fontSize: 10.5, color: 'E9FBF8' });
    };
    blocNoir(2.45, 'Valeur d’acquisition des murs', prixM2 ? `${nombre(prixM2)} € / m²` : '—', prix ? `Prix d’acquisition : ${euros(prix)}` : null);
    blocNoir(7.25, 'Valeur du loyer actuel', loyerM2 ? `${nombre(loyerM2)} €/m²/an` : '—', loyer ? `Loyer annuel HC HT : ${euros(loyer)}` : null);

    const phrases = [];
    if (prixM2 && mursSecteur) {
      phrases.push(
        `La valeur d'acquisition, fixée à ${nombre(prixM2)} €/m², ${prixM2 <= mursSecteur ? 'reste inférieure' : 'est supérieure'} à la moyenne observée sur le secteur (≈ ${nombre(mursSecteur)} €/m²)` +
        (prixM2 <= mursSecteur ? ", ce qui offre un point d'entrée attractif pour un investisseur." : '.')
      );
    }
    if (loyerM2 && locatifSecteur) {
      phrases.push(`Le niveau de loyer actuel de ${nombre(loyerM2)} €/m²/an est ${loyerM2 <= locatifSecteur ? 'inférieur' : 'supérieur'} à la moyenne locale de ${nombre(Math.round(locatifSecteur))} €/m²/an.`);
    }
    if (phrases.length) {
      s.addText(phrases.join(' ') + ' Source : data-B', {
        x: 1.1, y: 6.15, w: 11.1, h: 1.1, align: 'center', fontFace: SANS, fontSize: 12.5, color: C.ivoire, valign: 'top',
      });
    }
  }

  // --- 11. Projection financière ---------------------------------------------------------------
  // Tableau reconstruit avec les règles du simulateur : loyers indexés (et
  // revalorisés le cas échéant), charges de copropriété et taxe foncière
  // seulement si elles ne sont pas refacturées, travaux article 606 aux années
  // saisies. En bas, l'enchaînement acquisition → revente → plus-value.
  {
    const s = slide();
    titreSlide(s, 'Projection financière — revenus fonciers');

    if (loyer && prix) {
      const N = 20;
      const rendementRevente = positif(p.sim_rendement_capital) || 6.5;
      const revalorisationAn = positif(p.sim_annee_revalorisation);
      const loyerRevalorise = positif(p.sim_loyer_revalorise);
      const chargesCopro = p.sim_charges_refacturable === false ? positif(p.sim_charges_copropriete) : null;
      const taxeFonciere = p.sim_taxe_refacturable === false ? positif(p.sim_taxe_fonciere) : null;
      const travaux = {};
      for (let i = 1; i <= 20; i++) {
        const a = positif(p[`sim_travaux_annee${i}`]);
        const m = positif(p[`sim_travaux_montant${i}`]);
        if (a && m) travaux[a] = (travaux[a] || 0) + m;
      }

      const bruts = [];
      let courant = loyer;
      for (let a = 1; a <= N; a++) {
        if (a > 1) courant = courant * (1 + indexation / 100);
        if (revalorisationAn && loyerRevalorise && a === revalorisationAn) courant = loyerRevalorise;
        bruts.push(courant);
      }
      const nets = bruts.map((b, i) => b - (chargesCopro || 0) - (taxeFonciere || 0) - (travaux[i + 1] || 0));
      const cumuls = nets.reduce((acc, v) => { acc.push((acc[acc.length - 1] || 0) + v); return acc; }, []);

      s.addText('Hypothèse : maintien des conditions actuelles du bail', {
        x: 0.65, y: 1.1, w: 12, h: 0.32, fontFace: SERIF, fontSize: 14, color: C.tealClair,
      });
      s.addText(
        `Conservation du loyer actuel avec une indexation annuelle de ${String(indexation).replace('.', ',')} %` +
        `${chargesCopro || taxeFonciere ? '.' : ' — charges et taxe foncière à la charge du locataire.'}`,
        { x: 0.65, y: 1.44, w: 12, h: 0.3, fontFace: SANS, fontSize: 11, color: C.ivoire }
      );

      const enTete = { fill: { color: '1D7A70' }, color: 'FFFFFF', bold: true };
      const etiquette = { fill: { color: '2A9D8F' }, color: 'FFFFFF', bold: true, italic: true, align: 'left' };
      const cellule = { fill: { color: '2A9D8F' }, color: 'FFFFFF' };
      const ligne = (nom, valeurs) => [
        { text: nom, options: etiquette },
        ...valeurs.map((v) => ({ text: v == null ? '' : `${nf.format(Math.round(v))} €`, options: cellule })),
      ];
      const table = [
        [{ text: 'Année', options: { ...enTete, italic: true, align: 'left' } },
          ...bruts.map((_, i) => ({ text: `Année ${i + 1}`, options: enTete }))],
        ligne('Loyers annuels bruts HT HC', bruts),
        ligne('Charges de copropriété', bruts.map(() => chargesCopro)),
        ligne('Taxe Foncière', bruts.map(() => taxeFonciere)),
        ligne('Travaux article 606', bruts.map((_, i) => travaux[i + 1] || null)),
        ligne('Loyers annuels nets HT', nets),
        ligne('Loyer annuel net HT cumulés', cumuls),
      ];
      s.addTable(table, {
        x: 0.3, y: 1.85, w: LARGEUR - 0.6,
        colW: [1.55, ...bruts.map(() => (LARGEUR - 0.6 - 1.55) / N)],
        fontFace: SANS, fontSize: 6.2, align: 'center', valign: 'middle',
        border: { type: 'solid', color: '000000', pt: 0.5 },
        rowH: 0.24,
      });

      const revente = Math.round(bruts[N - 1] / (rendementRevente / 100));
      const plusValue = revente - prix;
      s.addText(`Projection en cas de revente à ${N} ans`, {
        x: 0.65, y: 3.75, w: 12, h: 0.32, fontFace: SERIF, fontSize: 14, color: C.tealClair,
      });
      const bloc = { y: 4.25, w: 3.3, h: 1.15 };
      blocTeal(s, { x: 1.15, ...bloc, titre: 'Prix d’acquisition droits inclus', valeur: euros(prix), corps: 16 });
      s.addText('→', { x: 4.55, y: 4.55, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 22, color: C.tealClair });
      blocTeal(s, { x: 5.15, ...bloc, titre: `Revente à ${N} ans — rendement ${String(rendementRevente).replace('.', ',')} %`, valeur: euros(revente), corps: 16 });
      s.addText('→', { x: 8.55, y: 4.55, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 22, color: C.tealClair });
      blocTeal(s, { x: 9.15, ...bloc, titre: 'Plus-value — hypothèse', valeur: euros(plusValue), corps: 16 });

      const multipleLoyers = (cumuls[N - 1] / prix).toFixed(2).replace('.', ',');
      const multipleMurs = (revente / prix).toFixed(2).replace('.', ',');
      s.addText([
        { text: `Dans cette hypothèse, les revenus cumulés à ${N} ans représentent un multiple de ` },
        { text: `${multipleLoyers} du prix d’acquisition`, options: { color: C.tealClair } },
        { text: ' et la valeur des murs un multiple de ' },
        { text: multipleMurs, options: { color: C.tealClair } },
        { text: ' en cas de revente.' },
      ], { x: 1, y: 5.85, w: 11.3, h: 0.9, align: 'center', fontFace: SERIF, fontSize: 14, color: C.ivoire });
    } else {
      s.addText('Loyer ou prix d’acquisition manquant : renseignez le simulateur du projet pour alimenter cette page.', {
        x: 0.65, y: 1.5, w: 11, h: 0.6, fontFace: SANS, fontSize: 12, color: C.gris,
      });
    }
  }

  // --- 12. Conditions souhaitées --------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Conditions souhaitées', { align: imgConditions ? 'left' : 'center' });
    const bloc = { w: 3.2, h: 1.05 };
    blocTeal(s, { x: 0.6, y: 2.45, ...bloc, titre: 'Taux', valeur: 'FIXE', corps: 18 });
    blocTeal(s, { x: 4.5, y: 2.45, ...bloc, titre: 'Durée du crédit', valeur: `${dureeCredit} ANS`, corps: 18 });
    blocTeal(s, { x: 2.55, y: 4.1, ...bloc, titre: 'Apport', valeur: apport ? `${nf.format(apport)} €` : 'À définir', corps: 18 });
    s.addText(
      'Ces conditions souhaitées s’inscrivent pleinement dans les projections et objectifs de rentabilité de l’opération.',
      { x: 0.6, y: 6.15, w: 7.5, h: 0.8, fontFace: SERIF, fontSize: 14.5, color: C.ivoire, align: 'center' }
    );
    photoDroite(s, imgConditions, 4.43);
  }

  // --- 13. CV du porteur (placeholders à compléter dans Slides) --------------------------------
  {
    const s = slide();
    titreSlide(s, 'CV — porteur du projet');
    s.addShape('rect', { x: 5.92, y: 1.35, w: 1.5, h: 1.3, fill: { color: '4472C4' } });
    s.addText('PHOTO', { x: 5.92, y: 1.35, w: 1.5, h: 1.3, align: 'center', valign: 'middle', fontFace: SANS, fontSize: 12, color: 'FFFFFF' });
    s.addText('Prenom NOM', { x: 0, y: 2.85, w: LARGEUR, h: 0.4, align: 'center', fontFace: SERIF, fontSize: 18, color: C.tealClair });
    s.addText('Âge', { x: 0, y: 3.25, w: LARGEUR, h: 0.35, align: 'center', fontFace: SERIF, fontSize: 13, color: C.ivoire });
    const rubrique = (titre, corps, y) => {
      s.addText(titre, { x: 0, y, w: LARGEUR, h: 0.35, align: 'center', fontFace: SERIF, fontSize: 14, color: C.tealClair, underline: true });
      s.addText(corps, { x: 0, y: y + 0.38, w: LARGEUR, h: 0.75, align: 'center', fontFace: SERIF, fontSize: 12.5, color: C.ivoire, valign: 'top' });
    };
    rubrique('Principales expériences', 'Décrire brièvement le parcours professionnel en quelques lignes\nainsi que le parcours scolaire.', 3.8);
    rubrique('Situation professionnelle', 'Poste, type de contrat, ancienneté.', 4.95);
    rubrique('Revenus et épargne', 'Revenu annuel : … — Compte courant : … — Livret A : … — LDD : …', 5.95);
  }

  // --- 14. Structuration --------------------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Structuration (exemple)');
    const boite = (y, texte, sous) => {
      s.addShape('rect', { x: 5.05, y, w: 3.2, h: sous ? 1 : 0.5, fill: { color: C.teal } });
      s.addText(texte, { x: 5.05, y: y + 0.04, w: 3.2, h: 0.42, align: 'center', fontFace: SANS, fontSize: 13, bold: true, color: '083530' });
      if (sous) s.addText(sous, { x: 5.05, y: y + 0.42, w: 3.2, h: 0.55, align: 'center', fontFace: SANS, fontSize: 10.5, color: 'FFFFFF', valign: 'top' });
    };
    boite(1.7, 'Prenom NOM — XX %');
    boite(2.35, 'Prenom NOM — XX %');
    s.addText('↓', { x: 5.05, y: 3.0, w: 3.2, h: 0.6, align: 'center', fontFace: SANS, fontSize: 26, color: C.teal });
    boite(3.7, 'SCI — en cours de création', 'Objet : investissement immobilier');
  }

  // --- 15. Merci ------------------------------------------------------------------------------------
  {
    const s = slide();
    s.addText('MERCI', { x: 0, y: 0.9, w: LARGEUR, h: 1, align: 'center', fontFace: SANS, fontSize: 48, bold: true, color: C.ivoire });
    s.addShape('rect', { x: 5.92, y: 2.6, w: 1.5, h: 1.3, fill: { color: '4472C4' } });
    s.addText('PHOTO', { x: 5.92, y: 2.6, w: 1.5, h: 1.3, align: 'center', valign: 'middle', fontFace: SANS, fontSize: 12, color: 'FFFFFF' });
    s.addText('Contact :', { x: 0, y: 4.25, w: LARGEUR, h: 0.4, align: 'center', fontFace: SANS, fontSize: 17, color: C.tealClair });
    s.addText('Prenom NOM\nTéléphone\nE-mail', { x: 0, y: 4.7, w: LARGEUR, h: 1.3, align: 'center', fontFace: SANS, fontSize: 16, color: C.ivoire });
  }

  return pptx.write('nodebuffer');
}
