// Dossier « Projet de Financement » d'un projet : le modèle de diapositives
// (construireDiapos) puis le PPTX (rendrePptx, pptxgenjs).
//
// Depuis le 12 oct. 2026, le modèle est le « Deck complet » de Jules
// (artefact « Présentation bancaire Klocka ») : seize diapositives de
// 1280 × 720, un panneau sauge à gauche, une carte sombre à droite, une barre
// noire en bas. Les mesures partagées avec l'éditeur sont dans
// src/lib/presentation-modele.js ; l'éditeur (components/presentations/)
// dessine les mêmes diapositives à l'écran.
//
//  1 Couverture       2 Sommaire          3 La ville          4 Emplacement (carte IGN)
//  5 Le quartier      6 Le local          7 Le local en images 8 Le bail
//  9 Enseignes       10 Prix et marché   11 Projection        12 Revenus fonciers
// 13 Conditions      14 Porteur du projet 15 Structuration    16 Merci
//
// Les chiffres de la ville et du secteur viennent du dataset des grandes villes
// (sinon du LLM serveur, comme la page projet) ; les photos sont des URLs.

import { CHEMIN_UPLOADS } from './db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PptxGenJS from 'pptxgenjs';
import { invokeLLM, llmEnabled } from './llm.js';
import { trouverVille, trouverSecteur } from '../src/data/villes.js';
import { secteurGarde } from './projet-secteur.js';
import { TAILLES, CARTE, HEROS, BARRE, LARGEUR, HAUTEUR } from '../src/lib/presentation-modele.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = CHEMIN_UPLOADS;
const LOGO = path.join(__dirname, '..', 'public', 'logo-klocka-presentation.png');

// La palette du deck (celle de l'artefact) : elle ne suit pas le thème de l'application.
const C = {
  sauge: '96C0B8',
  encre: '08130D',
  carte: '121312',
  case: '191A19',
  ivoire: 'F2F2F0',
  gris: '9A9C99',
  grisFonce: '808280',
  clair: 'C9CBC7',
  noir: '000000',
  filet: 'F2F3F5',
};
const POLICE = 'Instrument Sans';

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
// Le modèle des diapositives
// ---------------------------------------------------------------------------
//
// construireDiapos lit le projet et rend les seize diapositives en données
// (textes et chiffres déjà écrits, photos par URL) ; rendrePptx les dessine.
// Entre les deux, l'éditeur et le chat d'AK retouchent le modèle : tout ce qui
// s'affiche est un champ, rien n'est recalculé au dessin. Ce qui manque
// s'écrit entre crochets, comme dans le modèle (« [Prénom NOM] »).

/** Les logos des enseignes, gardés en fichiers : le modèle ne porte que leurs URLs. */
function garderLogos(logos) {
  if (!logos.length) return new Map();
  const dossier = path.join(UPLOAD_DIR, 'presentations', 'logos');
  fs.mkdirSync(dossier, { recursive: true });
  return new Map(logos.map((l) => {
    const nom = `${String(l.marque).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'logo'}.png`;
    fs.writeFileSync(path.join(dossier, nom), Buffer.from(l.b64, 'base64'));
    return [l.marque, `/uploads/presentations/logos/${nom}`];
  }));
}

const CHAPITRES = {
  couverture: 'Projet de financement', sommaire: 'Projet de financement', ville: '01 · La ville', emplacement: '02 · Emplacement',
  quartier: '03 · Le quartier', local: '04 · Le local', photos: '04 · Le local', bail: '05 · Le bail en cours',
  enseignes: '03 · Le quartier', marche: '04 · Le local', projection: '06 · Projection financière', revenus: '06 · Projection financière',
  conditions: '07 · Conditions', porteur: '08 · Porteur du projet', structuration: '08 · Structuration', merci: 'Projet de financement',
};

/**
 * Les seize diapositives d'un projet, en données.
 * @param {object} project
 * @param {object} photos URLs : { couverture, ville, quartier, local1, local2, local3 }
 * @returns {Promise<Array>} chacune { id, type, chapitre, etape, heros: {…}, …champs de la carte }
 */
export async function construireDiapos(project, photos = {}) {
  const p = project;
  const [coords, analyse] = await Promise.all([geocoder(p), analyseVilleSecteur(p)]);
  const enseignes = await enseignesDuSecteur(coords);

  const nomVille = analyse.ville?.nom ||
    (p.adresse_complete || '').split(',').pop()?.replace(/\b\d{5}\b/, '').trim() || '[Ville]';
  const nomSecteur = analyse.secteur?.nom || p.marche_quartier_nom ||
    (p.adresse_complete || '').split(',')[0] || '[Secteur]';
  const adresse = p.adresse_complete || p.titre || '[Adresse]';
  const locataire = rempli(p.nom_locataire) ? `Société ${p.nom_locataire}` : '[Locataire]';
  const activite = rempli(p.activite_locataire) ? p.activite_locataire : '[Activité]';
  const surface = positif(p.surface_m2) || positif(p.sim_surface);
  const loyer = loyerInitial(p);
  const loyerM2 = positif(p.loyer_m2_an) || (surface && loyer ? Math.round(loyer / surface) : null);
  const prix = prixAcquisition(p);
  const prixM2 = surface && prix ? Math.round(prix / surface) : null;
  const indexation = positif(p.sim_indexation_loyers) ?? 2;
  const dureeCredit = positif(p.sim_duree_credit) || 20;
  const apport = positif(p.sim_apport);
  const echeance = p.bail_date_echeance || p.echeance_bail;
  const echeanceValide = echeance && !isNaN(new Date(echeance));
  const anneesRestantes = echeanceValide
    ? Math.max(0, (new Date(echeance) - Date.now()) / (365.25 * 24 * 3600 * 1000))
    : null;
  const virgule = (n, d = 1) => n.toFixed(d).replace('.', ',');
  const bail = anneesRestantes != null ? `${virgule(anneesRestantes)} ans` : '[— ans]';
  const echeanceCourte = echeanceValide ? `${String(new Date(echeance).getMonth() + 1).padStart(2, '0')}/${new Date(echeance).getFullYear()}` : '[—]';
  const echeanceLongue = echeanceValide ? new Date(echeance).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '[date]';
  const eur = (n) => (n ? euros(n) : '[Montant]');
  const m2an = (n) => (n ? `${nombre(Math.round(n))} €/m²/an` : '[— €/m²/an]');

  // Les chiffres de la ville et du secteur, rangés par ce qu'ils disent.
  const chiffreDe = (cs, re) => (cs || []).find((c) => re.test(String(c?.label || '')))?.valeur || null;
  const cv = analyse.ville?.chiffres || [];
  const cs = analyse.secteur?.chiffres || [];
  const pointsVille = (analyse.ville?.points || []).filter(Boolean).map(String);
  const pointsSecteur = (analyse.secteur?.points || []).filter(Boolean).map(String);
  const trois = (ps) => [0, 1, 2].map((i) => ps[i] || '[Atout à compléter]');

  // La projection, avec les règles du simulateur : loyers indexés (et
  // revalorisés le cas échéant), charges et taxe foncière seulement si elles
  // ne sont pas refacturées, travaux article 606 aux années saisies.
  const N = 20;
  const rendementRevente = positif(p.sim_rendement_capital) || 6.5;
  let projection = null;
  if (loyer && prix) {
    const revalorisationAn = positif(p.sim_annee_revalorisation);
    const loyerRevalorise = positif(p.sim_loyer_revalorise);
    const charges = (p.sim_charges_refacturable === false ? positif(p.sim_charges_copropriete) || 0 : 0) + (p.sim_taxe_refacturable === false ? positif(p.sim_taxe_fonciere) || 0 : 0);
    const travaux = {};
    for (let i = 1; i <= 20; i++) {
      const a = positif(p[`sim_travaux_annee${i}`]);
      const m = positif(p[`sim_travaux_montant${i}`]);
      if (a && m) travaux[a] = (travaux[a] || 0) + m;
    }
    const lignes = [];
    let courant = loyer;
    let cumul = 0;
    for (let a = 1; a <= N; a++) {
      if (a > 1) courant = courant * (1 + indexation / 100);
      if (revalorisationAn && loyerRevalorise && a === revalorisationAn) courant = loyerRevalorise;
      const net = courant - charges - (travaux[a] || 0);
      cumul += net;
      lignes.push({ annee: a, brut: courant, travaux: travaux[a] || 0, net, cumul });
    }
    const revente = Math.round(lignes[N - 1].brut / (rendementRevente / 100));
    projection = { lignes, cumul, revente, avecTravaux: Object.keys(travaux).length > 0, charges };
  }
  const hypothese = `Loyer actuel indexé de ${virgule(indexation, Number.isInteger(indexation) ? 0 : 1)} % par an. ${projection?.charges ? 'Charges de copropriété et taxe foncière non refacturées déduites.' : 'Charges de copropriété et taxe foncière à la charge du locataire.'}`;

  const diapo = (id, etape, heros, carte) => ({ id, type: id, chapitre: CHAPITRES[id], etape, heros, ...carte });
  const logos = garderLogos(enseignes.logos);

  return [
    diapo('couverture', 'Projet de financement',
      { titre: `Murs de commerce à ${nomVille}`, accroche: adresse, porteur: '[Prénom NOM]', banque: '[Banque]' },
      {
        photo: photos.couverture || null,
        stats: [
          { valeur: eur(prix), label: 'Acquisition droits inclus' },
          { valeur: eur(loyer), label: 'Loyer annuel HT/HC' },
          { valeur: bail, label: 'Bail restant à courir' },
        ],
      }),
    diapo('sommaire', 'Sommaire',
      { titre: 'Sommaire', accroche: 'Huit chapitres : le bien, son bail, puis le financement demandé.' },
      {
        items: [
          { titre: `La ville de ${nomVille}`, page: 'p. 03' },
          { titre: 'Un emplacement stratégique', page: 'p. 04' },
          { titre: 'Zoom sur le quartier', page: 'p. 05' },
          { titre: 'Présentation du local', page: 'p. 06' },
          { titre: 'Analyse du bail en cours', page: 'p. 08' },
          { titre: 'Projection financière', page: 'p. 11' },
          { titre: 'Conditions souhaitées', page: 'p. 13' },
          { titre: 'CV du porteur du projet et structuration', page: 'p. 14' },
        ],
      }),
    diapo('ville', `La ville de ${nomVille}`,
      { grand: chiffreDe(cv, /habitant|population/i) || '[Population]', accroche: `habitants à ${nomVille}.`, note: 'Population INSEE' },
      {
        photo: photos.ville || null,
        chiffres: [
          { label: 'Revenu médian disponible par UC', valeur: chiffreDe(cv, /revenu/i) || '[—]' },
          { label: 'Taux de chômage, zone d’emploi', valeur: chiffreDe(cv, /chômage|chomage/i) || '[—]' },
          { label: 'Prix médian du logement ancien', valeur: chiffreDe(cv, /prix|logement|m²/i) || '[—]' },
        ],
        atouts: trois(pointsVille),
      }),
    diapo('emplacement', 'Un emplacement stratégique',
      { titre: 'Un emplacement stratégique', accroche: pointsSecteur[0] || `Au cœur de ${nomSecteur}.`, note: adresse },
      { lat: coords?.lat ?? null, lon: coords?.lon ?? null, legende: 'Local commercial' }),
    diapo('quartier', 'Zoom sur le quartier',
      { grand: cs[0]?.valeur ? String(cs[0].valeur) : '[Chiffre clé]', accroche: pointsSecteur[1] || pointsSecteur[0] || '[Ce qui fait le quartier]', note: `Le secteur · ${nomSecteur}` },
      {
        photo: photos.quartier || null,
        chiffres: [
          { valeur: chiffreDe(cs, /zone|piéton|pieton/i) || '[—]', label: 'Type de zone' },
          { valeur: chiffreDe(cs, /loyer/i) || '[— €/m²/an]', label: 'Loyer commercial moyen' },
          { valeur: chiffreDe(cs, /murs|prix/i) || '[— €/m²]', label: 'Prix des murs commerciaux' },
          { valeur: chiffreDe(cs, /vacance/i) || '[—]', label: 'Vacance commerciale' },
        ],
        atouts: trois(pointsSecteur),
      }),
    diapo('local', 'Présentation du local',
      { grand: eur(loyer), accroche: `de loyer annuel HT/HC, versés par ${rempli(p.activite_locataire) ? p.activite_locataire.toLowerCase() : 'le locataire'} en place${echeanceValide ? ` jusqu’en ${new Date(echeance).getFullYear()}` : ''}.`, note: `Bail courant sur ${bail}` },
      {
        stats: [
          { valeur: loyerM2 ? `${nombre(loyerM2)} €` : '[—]', label: 'Loyer /m²/an' },
          { valeur: bail, label: 'Bail restant à courir' },
          { valeur: echeanceCourte, label: 'Échéance du bail' },
        ],
        identite: [
          { label: 'Raison sociale', valeur: locataire },
          { label: 'Activité', valeur: activite },
          { label: 'Adresse d’exploitation', valeur: adresse },
        ],
        economie: [
          { label: 'Loyer annuel HT/HC', valeur: eur(loyer) },
          { label: 'Loyer au m²', valeur: m2an(loyerM2) },
          { label: 'Échéance du bail', valeur: dateFr(echeance) || '[—]' },
        ],
      }),
    diapo('photos', 'Le local en images',
      { titre: 'Le local en images', accroche: '[Légende : ce que montrent les photos]' },
      { photos: [photos.local1 || null, photos.local2 || null, photos.local3 || null] }),
    diapo('bail', 'Zoom sur le bail',
      { grand: bail, accroche: `restant à courir sur le bail commercial, jusqu’au ${echeanceLongue}.`, note: 'Loyer indexé chaque année sur l’ILC' },
      {
        points: [
          ['Activité', activite],
          ['Statut du bail', rempli(p.statut_bail) ? p.statut_bail : 'En cours'],
          ['Date d’échéance', echeanceLongue],
          ['Loyer annuel HT', eur(loyer)],
          ['Loyer mensuel HT', loyer ? euros(loyer / 12) : '[Montant]'],
          ['Indice de référence', 'Indice des loyers commerciaux (ILC)'],
          ['Fréquence d’indexation', 'Révision annuelle'],
          ['Hypothèse de revalorisation', `+${virgule(indexation, Number.isInteger(indexation) ? 0 : 1)} % par an`],
          ['Impact de l’indexation', 'Augmentation progressive du loyer à chaque échéance'],
          ['Cadre contractuel', 'Conditions du bail initial applicables jusqu’au terme'],
        ].map(([titre, valeur]) => ({ titre, valeur })),
      }),
    diapo('enseignes', 'Enseignes du secteur',
      { titre: 'Des enseignes nationales sur le secteur', accroche: enseignes.noms.length ? `${enseignes.noms.slice(0, 3).join(', ')} : le secteur attire les réseaux.` : '[Ce que disent les enseignes du secteur]' },
      {
        enseignes: [0, 1, 2, 3, 4, 5].map((i) => {
          const nom = enseignes.noms[i];
          return nom ? { nom, secteur: '[Secteur]', logo: logos.get(nom) || null } : { nom: '[Enseigne à compléter]', secteur: '[Secteur]', logo: null };
        }),
      }),
    (() => {
      // Le loyer autour seul, comme l'onglet Marché : la correction de
      // l'équipe, sinon Equimmox (Data-B en repli). Pas de prix des murs du
      // secteur, faute de source fiable (6 oct. 2026) : la case reste à remplir.
      const lu = secteurGarde(p.id)?.rue || null;
      const locatifSecteur = positif(p.marche_loyer_autour) || positif(lu?.loyer_m2_an);
      return diapo('marche', 'Prix et loyers vs marché',
        { grand: eur(prix), accroche: 'Prix d’acquisition et loyer du local, comparés au marché du secteur.', note: 'Prix d’acquisition des murs' },
        {
          marche: { titre: 'Marché du secteur', murs: '[— €/m²]', murs_label: 'Valeur moyenne des murs', loyer: m2an(locatifSecteur), loyer_label: 'Valeur locative moyenne' },
          local: {
            titre: `Local · ${nomSecteur}`,
            prix_m2: prixM2 ? `${nombre(prixM2)} €/m²` : '[— €/m²]', prix_label: `Valeur d’acquisition des murs · prix : ${eur(prix)}`,
            loyer_m2: m2an(loyerM2), loyer_label: `Loyer actuel · annuel HC HT : ${eur(loyer)}`,
          },
        });
    })(),
    diapo('projection', 'Projection financière',
      projection
        ? { grand: `× ${virgule(projection.cumul / prix, 2)}`, accroche: `Les loyers nets cumulés sur ${N} ans rapportés au prix d’acquisition.`, note: `Hypothèse : bail maintenu, indexation de ${virgule(indexation, Number.isInteger(indexation) ? 0 : 1)} % par an` }
        : { grand: '[× —]', accroche: 'Loyer ou prix d’acquisition manquant : renseignez le simulateur du projet.', note: '' },
      {
        lignes: [
          { label: 'Acquisition droits inclus', valeur: eur(prix) },
          { label: `Loyers nets HT cumulés sur ${N} ans`, valeur: projection ? euros(projection.cumul) : '[Montant]' },
          { label: `Revente à ${N} ans, rendement ${virgule(rendementRevente, Number.isInteger(rendementRevente) ? 0 : 1)} %`, valeur: projection ? euros(projection.revente) : '[Montant]' },
          { label: `Plus-value, hypothèse${projection ? ` · × ${virgule(projection.revente / prix, 2)} le prix` : ''}`, valeur: projection ? euros(projection.revente - prix) : '[Montant]' },
        ],
        barres: projection ? projection.lignes.map((l) => Math.round((l.cumul / projection.cumul) * 100)) : [],
        legende: projection?.avecTravaux ? 'Loyers nets HT cumulés, travaux art. 606 déduits' : 'Loyers nets HT cumulés',
      }),
    diapo('revenus', `Revenus fonciers sur ${N} ans`,
      { titre: 'Revenus fonciers, année par année', accroche: hypothese },
      {
        entetes: ['Année', 'Brut HT HC', 'Travaux 606', 'Net HT', 'Net cumulé'],
        lignes: projection
          ? projection.lignes.map((l) => [String(l.annee), euros(l.brut), l.travaux ? euros(-l.travaux) : '—', euros(l.net), euros(l.cumul)])
          : [],
      }),
    diapo('conditions', 'Conditions souhaitées',
      { titre: 'Conditions souhaitées', accroche: 'Elles s’inscrivent pleinement dans les projections et objectifs de rentabilité de l’opération.' },
      {
        blocs: [
          { titre: 'Taux', valeur: 'Fixe' },
          { titre: 'Durée du crédit', valeur: `${dureeCredit} ans` },
          { titre: 'Montant à financer', valeur: prix && apport ? euros(prix - apport) : '[Montant]' },
          { titre: 'Apport', valeur: apport ? euros(apport) : '[À définir]' },
        ],
      }),
    diapo('porteur', 'Porteur du projet',
      { titre: '[Prénom NOM]', accroche: '[Âge] ans · porteur du projet', photo: null },
      {
        experiences: '[Décrire brièvement le parcours professionnel en quelques lignes, ainsi que le parcours scolaire.]',
        situation: [
          { valeur: '[Poste]', label: 'Fonction' },
          { valeur: '[Type de contrat]', label: 'Contrat' },
          { valeur: '[Ancienneté]', label: 'Ancienneté' },
        ],
        revenus: [
          { label: 'Revenu annuel', valeur: '[Montant]' },
          { label: 'Compte courant', valeur: '[Montant]' },
          { label: 'Livret A', valeur: '[Montant]' },
          { label: 'LDD', valeur: '[Montant]' },
        ],
      }),
    diapo('structuration', 'Structuration',
      { grand: 'SCI', accroche: 'en cours de création, pour porter l’acquisition des murs.', note: 'Structuration donnée à titre d’exemple' },
      {
        associes: [{ nom: '[Prénom NOM]', part: '[XX] %' }, { nom: '[Prénom NOM]', part: '[XX] %' }],
        structure: { type: 'Société civile immobilière', nom: 'SCI [Nom]', statut: 'En cours de création · objet : investissement immobilier' },
        detient: { titre: 'Détient les murs', adresse, loue: `Loués à ${locataire}` },
      }),
    diapo('merci', 'Merci',
      { titre: 'Merci.', accroche: 'Nous restons à votre disposition pour toute pièce complémentaire.' },
      { photo: null, porteur: '[Prénom NOM]', telephone: '[Téléphone]', email: '[E-mail]' }),
  ];
}

// ---------------------------------------------------------------------------
// Le dessin
// ---------------------------------------------------------------------------

const texte = (v) => String(v ?? '');
const pouces = (v) => v / 96; // 1280 px = 13,33 pouces
const points = (v) => v * 0.75; // une taille en pixels, en points

// La palette du deck, par nom : l'écran (components/presentations/Deck.jsx, PALETTE) lit les mêmes.
const COULEURS = { ivoire: C.ivoire, sauge: C.sauge, clair: C.clair, gris: C.gris, encre: C.encre };
const couleurDe = (c) => (!c ? null : /^#/.test(c) ? c.slice(1).toUpperCase() : COULEURS[c] || null);
// Les mises en forme de la diapositive en cours de dessin (diapo.styles).
let stylesCourants = {};
/** Pure : les options pptxgenjs d'une mise en forme ; null si l'élément est masqué. */
export function optionsDeStyle(st) {
  if (!st) return {};
  if (st.masque) return null;
  return {
    ...(st.taille ? { fontSize: points(st.taille) } : {}),
    ...(st.gras ? { bold: true } : {}),
    ...(st.italique ? { italic: true } : {}),
    ...(couleurDe(st.couleur) ? { color: couleurDe(st.couleur) } : {}),
    ...(st.aligner ? { align: st.aligner } : {}),
    ...(st.opacite != null ? { transparency: 100 - st.opacite } : {}),
  };
}
/** Un texte posé à des coordonnées de la diapositive (pixels) ; `chemin` lui applique sa mise en forme. */
function ecrire(s, t, { x, y, w, h, taille = 15, couleur = C.ivoire, chemin = null, ...o }) {
  const st = chemin ? optionsDeStyle(stylesCourants[chemin]) : {};
  if (st === null) return;
  s.addText(texte(t), { x: pouces(x), y: pouces(y), w: pouces(w), h: pouces(h), fontFace: POLICE, fontSize: points(taille), color: couleur, margin: 0, valign: 'middle', ...o, ...st });
}
function filet(s, x, y, w, transparence = 84) {
  s.addShape('line', { x: pouces(x), y: pouces(y), w: pouces(w), h: 0, line: { color: C.filet, width: 0.75, transparency: transparence } });
}
function boite(s, { x, y, w, h, fond = null, bord = null, rayon = 20, pointille = false }) {
  s.addShape('roundRect', {
    x: pouces(x), y: pouces(y), w: pouces(w), h: pouces(h), rectRadius: pouces(rayon),
    fill: fond ? { color: fond } : { type: 'none' },
    line: bord ? { color: C.filet, width: 0.75, transparency: bord, dashType: pointille ? 'dash' : 'solid' } : { type: 'none' },
  });
}
/** Une photo, ou sa case vide en pointillé. */
function photo(s, b64, { x, y, w, h }, vide = '[Photo]', chemin = null) {
  const st = chemin ? optionsDeStyle(stylesCourants[chemin]) : {};
  if (st === null) return;
  if (b64) {
    s.addImage({ data: `data:image/jpeg;base64,${b64}`, x: pouces(x), y: pouces(y), w: pouces(w), h: pouces(h), sizing: { type: 'cover', w: pouces(w), h: pouces(h) } });
  } else {
    boite(s, { x, y, w, h, fond: C.case, bord: 76, pointille: true });
    ecrire(s, vide, { x, y, w, h, taille: 14, couleur: C.gris, align: 'center' });
  }
}

/**
 * Dessine les diapositives en PPTX. Les diapositives masquées sont sautées.
 * @param {Array} diapos le modèle (construireDiapos, retouché ou non)
 * @param {object} [options] { titre }
 * @returns {Promise<Buffer>} le PPTX
 */
export async function rendrePptx(diapos, { titre = '' } = {}) {
  const visibles = (diapos || []).filter((d) => d && !d.masquee);

  const urls = new Set();
  for (const d of visibles) {
    if (d.photo) urls.add(d.photo);
    if (d.heros?.photo) urls.add(d.heros.photo);
    for (const u of d.photos || []) if (u) urls.add(u);
    for (const e of d.enseignes || []) if (e?.logo) urls.add(e.logo);
  }
  const images = new Map(await Promise.all([...urls].map(async (u) => [u, await chargerImage(u)])));
  const img = (u) => (u ? images.get(u) || null : null);
  const cartes = new Map(await Promise.all(visibles
    .filter((d) => d.type === 'emplacement' && d.lat != null && d.lon != null && isFinite(Number(d.lat)) && isFinite(Number(d.lon)))
    .map(async (d) => [d, await tuilesCarte(Number(d.lat), Number(d.lon), 16, 5, 4)])));
  const logo = fs.existsSync(LOGO) ? fs.readFileSync(LOGO).toString('base64') : null;

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Klocka';
  pptx.title = titre ? `Projet de financement — ${titre}` : 'Projet de financement';

  const total = visibles.length;
  visibles.forEach((d, i) => {
    const s = pptx.addSlide();
    s.background = { color: C.sauge };
    stylesCourants = d.styles || {};
    // Le numéro en filigrane, sous tout le reste : 390 px, gras, encre à 10 %.
    ecrire(s, String(i + 1).padStart(2, '0'), { x: 34, y: 64, w: 600, h: 390, taille: 390, couleur: C.encre, bold: true, transparency: 90, charSpacing: -24, valign: 'top' });
    heros(s, d, i, total);
    barre(s, d, i, total, logo);
    boite(s, { ...CARTE, fond: d.type === 'merci' ? C.noir : d.type === 'emplacement' && cartes.get(d) ? null : C.carte, bord: 84, rayon: 28 });
    DESSINS[d.type]?.(s, d, { img, carte: cartes.get(d) || null, logo });
  });
  return pptx.write('nodebuffer');
}

/** Le panneau de gauche : le chapitre, puis le chiffre ou le titre, l'accroche et la note, calés en bas. */
function heros(s, d, i, total) {
  const h = d.heros || {};
  const t = TAILLES[d.type] || {};
  ecrire(s, texte(d.chapitre).toUpperCase(), { x: HEROS.x, y: 40, w: 300, h: 18, taille: 13, couleur: C.encre, charSpacing: 1.8, chemin: 'chapitre' });
  ecrire(s, `${String(i + 1).padStart(2, '0')} — ${total}`, { x: HEROS.x + 200, y: 40, w: HEROS.w - 200, h: 18, taille: 13, couleur: C.encre, align: 'right', charSpacing: 1.8 });
  const bas = HAUTEUR - BARRE - HEROS.bas;
  let fin = bas;
  // La couverture : porteur et banque, sous l'adresse.
  if (d.type === 'couverture') {
    [['Porteur du projet', h.porteur, 'heros.porteur'], ['À l’attention de', h.banque, 'heros.banque']].forEach(([l, v, chemin], k) => {
      ecrire(s, l.toUpperCase(), { x: HEROS.x + k * 190, y: bas - 40, w: 180, h: 16, taille: 11, couleur: C.encre, charSpacing: 1.8 });
      ecrire(s, v, { x: HEROS.x + k * 190, y: bas - 20, w: 180, h: 20, taille: 14, couleur: C.encre, chemin });
    });
    fin = bas - 56;
  }
  // Chaque ligne du panneau garde sa mise en forme (taille, gras, couleur…) ; masquée, elle saute.
  const runs = [];
  const run = (texteRun, chemin, options) => {
    const st = optionsDeStyle(stylesCourants[chemin]);
    if (st === null) return;
    runs.push({ text: texte(texteRun), options: { ...options, ...st } });
  };
  const grand = h.grand ?? h.titre;
  if (grand != null) run(grand, h.grand !== undefined ? 'heros.grand' : 'heros.titre', { fontSize: points(t.grand || t.titre || 60), breakLine: true, paraSpaceAfter: 10 });
  if (h.accroche) run(h.accroche, 'heros.accroche', { fontSize: points(t.accroche || 24), breakLine: true, paraSpaceAfter: 10 });
  if (h.note) run(h.note, 'heros.note', { fontSize: points(13.5) });
  if (runs.length) runs.at(-1).options.breakLine = false;
  const haut = d.type === 'porteur' ? 260 : 90;
  if (runs.length) s.addText(runs, { x: pouces(HEROS.x), y: pouces(haut), w: pouces(HEROS.w), h: pouces(fin - haut), fontFace: POLICE, color: C.encre, valign: 'bottom', margin: 0, lineSpacingMultiple: 0.95 });
  // Le porteur : sa photo en rond au-dessus de son nom (posée par DESSINS.porteur), ou la case vide.
  if (d.type === 'porteur' && !h.photo) {
    s.addShape('ellipse', { x: pouces(HEROS.x), y: pouces(110), w: pouces(140), h: pouces(140), fill: { type: 'none' }, line: { color: C.encre, width: 1.1, dashType: 'dash' } });
    ecrire(s, '[Photo]', { x: HEROS.x, y: 110, w: 140, h: 140, taille: 14, couleur: C.encre, align: 'center' });
  }
}

/** La barre noire du bas : le logo, l'étape, la frise, le numéro. */
function barre(s, d, i, total, logo) {
  const y = HAUTEUR - BARRE;
  s.addShape('rect', { x: 0, y: pouces(y), w: pouces(LARGEUR), h: pouces(BARRE), fill: { color: C.noir }, line: { type: 'none' } });
  if (logo) s.addImage({ data: `data:image/png;base64,${logo}`, x: pouces(48), y: pouces(y + 27.5), w: pouces(108), h: pouces(17) });
  ecrire(s, texte(d.etape).toUpperCase(), { x: 184, y: y + 26, w: 230, h: 20, taille: 12.5, couleur: C.clair, charSpacing: 1.2, chemin: 'etape' });
  const x0 = 442;
  const x1 = 1090;
  const part = (i + 0.5) / total;
  s.addShape('rect', { x: pouces(x0), y: pouces(y + 35), w: pouces(x1 - x0), h: pouces(2), fill: { color: C.filet, transparency: 84 }, line: { type: 'none' } });
  s.addShape('rect', { x: pouces(x0), y: pouces(y + 35), w: pouces((x1 - x0) * part), h: pouces(2), fill: { color: C.sauge }, line: { type: 'none' } });
  // Un repère par diapositive : passés et courant en sauge, à venir en clair.
  const pas = (x1 - x0) / total;
  for (let k = 0; k < total; k++) {
    s.addShape('roundRect', { x: pouces(x0 + (k + 0.5) * pas - 1), y: pouces(y + 32), w: pouces(2), h: pouces(8), rectRadius: pouces(1), fill: k <= i ? { color: C.sauge } : { color: C.filet, transparency: 60 }, line: { type: 'none' } });
  }
  s.addShape('ellipse', { x: pouces(x0 + (x1 - x0) * part - 8), y: pouces(y + 28), w: pouces(16), h: pouces(16), fill: { color: C.sauge }, line: { type: 'none' } });
  ecrire(s, `${String(i + 1).padStart(2, '0')} / ${total}`, { x: x1 + 12, y: y + 26, w: 60, h: 20, taille: 13, couleur: C.clair, align: 'right', charSpacing: 1 });
  // Les deux flèches : précédente à contour, suivante pleine (sans action dans un PPTX).
  const fy = y + 14;
  s.addShape('ellipse', { x: pouces(1176), y: pouces(fy), w: pouces(44), h: pouces(44), fill: { type: 'none' }, line: { color: C.filet, width: 0.75, transparency: 76 } });
  ecrire(s, '←', { x: 1176, y: fy, w: 44, h: 44, taille: 18, couleur: C.ivoire, align: 'center' });
  s.addShape('ellipse', { x: pouces(1228), y: pouces(fy), w: pouces(44), h: pouces(44), fill: { color: C.sauge }, line: { type: 'none' } });
  ecrire(s, '→', { x: 1228, y: fy, w: 44, h: 44, taille: 18, couleur: C.encre, align: 'center' });
}

const X = CARTE.x;
const Y = CARTE.y;
const W = CARTE.w;
const H = CARTE.h;

/** Une liste libellé / valeur, une ligne chacune, séparées d'un filet. */
function lignes(s, ls, { x, y, w, pas = 40, taille = 15, couleurValeur = () => C.ivoire, chemin = null }) {
  ls.forEach((l, k) => {
    filet(s, x, y + k * pas, w, k === 0 ? 84 : 92);
    ecrire(s, l.label, { x, y: y + k * pas, w: w * 0.45, h: pas, taille, couleur: C.gris, chemin: chemin && `${chemin}.${k}.label` });
    ecrire(s, l.valeur, { x: x + w * 0.4, y: y + k * pas, w: w * 0.6, h: pas, taille, couleur: couleurValeur(k), align: 'right', chemin: chemin && `${chemin}.${k}.valeur` });
  });
}
/** Trois atouts : A, B, C. */
function atouts(s, as, { x, y, w, pas = 34 }) {
  (as || []).slice(0, 3).forEach((a, k) => {
    ecrire(s, 'ABC'[k], { x, y: y + k * pas, w: 16, h: pas, taille: 13, couleur: C.sauge });
    ecrire(s, a, { x: x + 32, y: y + k * pas, w: w - 32, h: pas, taille: 14.5, couleur: C.clair, chemin: `atouts.${k}` });
  });
}
/** Un chiffre et son libellé sous un filet. */
function chiffre(s, c, { x, y, w, taille = 30, couleur = C.ivoire, labelTaille = 13, chemin = null }) {
  filet(s, x, y, w);
  ecrire(s, c?.valeur, { x, y: y + 10, w, h: taille * 1.25, taille, couleur, chemin: chemin && `${chemin}.valeur` });
  ecrire(s, c?.label, { x, y: y + 10 + taille * 1.25, w, h: 18, taille: labelTaille, couleur: C.gris, chemin: chemin && `${chemin}.label` });
}

const DESSINS = {
  couverture(s, d, { img, logo }) {
    if (logo) s.addImage({ data: `data:image/png;base64,${logo}`, x: pouces(X + W - 36 - 152), y: pouces(Y + 36), w: pouces(152), h: pouces(24) });
    photo(s, img(d.photo), { x: X + 36, y: Y + 82, w: W - 72, h: 330 }, '[Photo de couverture]', 'photo');
    const w = (W - 72 - 48) / 3;
    (d.stats || []).slice(0, 3).forEach((c, k) => chiffre(s, c, { x: X + 36 + k * (w + 24), y: Y + 440, w, couleur: k === 1 ? C.sauge : C.ivoire, chemin: `stats.${k}` }));
  },
  sommaire(s, d) {
    const items = d.items || [];
    const pas = (H - 56) / Math.max(1, items.length);
    items.forEach((it, k) => {
      const y = Y + 28 + k * pas;
      if (k > 0) filet(s, X + 36, y, W - 72, 89);
      ecrire(s, String(k + 1).padStart(2, '0'), { x: X + 36, y, w: 32, h: pas, taille: 14, couleur: C.sauge });
      ecrire(s, it.titre, { x: X + 90, y, w: W - 220, h: pas, taille: 21, chemin: `items.${k}.titre` });
      ecrire(s, it.page, { x: X + W - 136, y, w: 100, h: pas, taille: 14, couleur: C.grisFonce, align: 'right', chemin: `items.${k}.page` });
    });
  },
  ville(s, d, { img }) {
    photo(s, img(d.photo), { x: X + 36, y: Y + 36, w: W - 72, h: 130 }, '[Photo de la ville]', 'photo');
    (d.chiffres || []).slice(0, 3).forEach((c, k) => {
      const y = Y + 200 + k * 62;
      filet(s, X + 36, y, W - 72);
      ecrire(s, c.label, { x: X + 36, y, w: 380, h: 62, taille: 14, couleur: C.gris, chemin: `chiffres.${k}.label` });
      ecrire(s, c.valeur, { x: X + 300, y, w: W - 336, h: 62, taille: 34, align: 'right', chemin: `chiffres.${k}.valeur` });
    });
    filet(s, X + 36, Y + 386, W - 72);
    atouts(s, d.atouts, { x: X + 36, y: Y + 418, w: W - 72 });
  },
  emplacement(s, d, { carte }) {
    if (carte) {
      const tw = W / carte.cols;
      const th = H / carte.lignes;
      for (const t of carte.tuiles) s.addImage({ data: `data:image/png;base64,${t.b64}`, x: pouces(X + t.i * tw), y: pouces(Y + t.j * th), w: pouces(tw + 0.5), h: pouces(th + 0.5) });
      const px = X + carte.fx * W;
      const py = Y + carte.fy * H;
      s.addShape('ellipse', { x: pouces(px - 9), y: pouces(py - 9), w: pouces(18), h: pouces(18), fill: { color: C.sauge }, line: { color: C.encre, width: 2.2 } });
      boite(s, { x: px + 20, y: py - 40, w: Math.max(150, texte(d.legende).length * 9 + 40), h: 40, fond: C.encre, rayon: 20 });
      ecrire(s, d.legende, { x: px + 20, y: py - 40, w: Math.max(150, texte(d.legende).length * 9 + 40), h: 40, taille: 15, align: 'center', chemin: 'legende' });
      ecrire(s, '© IGN', { x: X + W - 90, y: Y + H - 26, w: 70, h: 18, taille: 10, couleur: C.encre, align: 'right' });
    } else {
      boite(s, { ...CARTE, fond: C.case, bord: 76, rayon: 28, pointille: true });
      ecrire(s, 'Adresse non géolocalisable : carte à insérer.', { x: X, y: Y + H - 80, w: W, h: 30, taille: 14, couleur: C.gris, align: 'center' });
    }
  },
  quartier(s, d, { img }) {
    photo(s, img(d.photo), { x: X + 36, y: Y + 36, w: 190, h: H - 72 }, '[Photo du quartier]', 'photo');
    const x = X + 36 + 190 + 24;
    const w = W - 36 - (x - X);
    const cw = (w - 22) / 2;
    (d.chiffres || []).slice(0, 4).forEach((c, k) => chiffre(s, c, { x: x + (k % 2) * (cw + 22), y: Y + 36 + Math.floor(k / 2) * 100, w: cw, taille: 23, couleur: k === 1 ? C.sauge : C.ivoire, labelTaille: 12.5, chemin: `chiffres.${k}` }));
    (d.atouts || []).slice(0, 3).forEach((a, k) => {
      const y = Y + 290 + k * 80;
      filet(s, x, y, w, k === 0 ? 84 : 92);
      ecrire(s, 'ABC'[k], { x, y, w: 16, h: 80, taille: 13, couleur: C.sauge });
      ecrire(s, a, { x: x + 32, y, w: w - 32, h: 80, taille: 14.5, chemin: `atouts.${k}` });
    });
  },
  local(s, d) {
    const w = (W - 72 - 24) / 3;
    (d.stats || []).slice(0, 3).forEach((c, k) => {
      const x = X + 36 + k * (w + 12);
      boite(s, { x, y: Y + 32, w, h: 96, fond: k === 0 ? C.sauge : null, bord: k === 0 ? null : 84 });
      ecrire(s, c.valeur, { x: x + 20, y: Y + 46, w: w - 40, h: 42, taille: 36, couleur: k === 0 ? C.encre : C.ivoire, chemin: `stats.${k}.valeur` });
      ecrire(s, c.label, { x: x + 20, y: Y + 92, w: w - 40, h: 20, taille: 13, couleur: k === 0 ? C.encre : C.gris, chemin: `stats.${k}.label` });
    });
    ecrire(s, 'IDENTITÉ', { x: X + 36, y: Y + 160, w: 300, h: 18, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    lignes(s, d.identite || [], { x: X + 36, y: Y + 186, w: W - 72, chemin: 'identite' });
    ecrire(s, 'ÉCONOMIE DE LA SIGNATURE', { x: X + 36, y: Y + 330, w: 300, h: 18, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    lignes(s, d.economie || [], { x: X + 36, y: Y + 356, w: W - 72, couleurValeur: (k) => (k === 1 ? C.sauge : C.ivoire), chemin: 'economie' });
  },
  photos(s, d, { img }) {
    const [a, b, c] = (d.photos || []).map(img);
    const g = 12;
    const wg = (W - 2 * g - g) * (1.7 / 2.7);
    const wd = W - 2 * g - g - wg;
    const hd = (H - 2 * g - g) / 2;
    photo(s, a, { x: X + g, y: Y + g, w: wg, h: H - 2 * g }, '[Photo 1]', 'photos.0');
    photo(s, b, { x: X + g + wg + g, y: Y + g, w: wd, h: hd }, '[Photo 2]', 'photos.1');
    photo(s, c, { x: X + g + wg + g, y: Y + g + hd + g, w: wd, h: hd }, '[Photo 3]', 'photos.2');
  },
  bail(s, d) {
    const ps = d.points || [];
    const pas = (H - 52) / Math.max(1, ps.length);
    ps.forEach((pt, k) => {
      const y = Y + 26 + k * pas;
      if (k > 0) filet(s, X + 36, y, W - 72, 92);
      ecrire(s, String(k + 1).padStart(2, '0'), { x: X + 36, y, w: 34, h: pas, taille: 13, couleur: C.sauge });
      ecrire(s, pt.titre, { x: X + 70, y, w: 220, h: pas, taille: 15, couleur: C.gris, chemin: `points.${k}.titre` });
      ecrire(s, pt.valeur, { x: X + 290, y, w: W - 326, h: pas, taille: 15, chemin: `points.${k}.valeur` });
    });
  },
  enseignes(s, d, { img }) {
    const es = (d.enseignes || []).slice(0, 6);
    const g = 12;
    const cw = (W - 64 - 2 * g) / 3;
    const ch = (H - 64 - g) / 2;
    es.forEach((e, k) => {
      const x = X + 32 + (k % 3) * (cw + g);
      const y = Y + 32 + Math.floor(k / 3) * (ch + g);
      // La sixième tuile reste un emplacement libre, en pointillé, tant qu'elle n'a pas d'enseigne.
      const libre = k === 5 && /^\[/.test(texte(e.nom));
      boite(s, { x, y, w: cw, h: ch, rayon: 18, bord: libre ? 76 : 92, fond: libre ? null : C.case, pointille: libre });
      const b64 = img(e.logo);
      if (libre && !b64) {
        boite(s, { x: x + 14, y: y + 14, w: cw - 28, h: ch - 90, rayon: 10, bord: 76, pointille: true });
        ecrire(s, '[Logo]', { x: x + 14, y: y + 14, w: cw - 28, h: ch - 90, taille: 13, couleur: C.gris, align: 'center' });
      } else {
        boite(s, { x: x + 14, y: y + 14, w: cw - 28, h: ch - 90, rayon: 10, fond: C.ivoire });
        if (b64) s.addImage({ data: `data:image/png;base64,${b64}`, x: pouces(x + 34), y: pouces(y + 24), w: pouces(cw - 68), h: pouces(ch - 110), sizing: { type: 'contain', w: pouces(cw - 68), h: pouces(ch - 110) } });
        else ecrire(s, '[Logo]', { x: x + 14, y: y + 14, w: cw - 28, h: ch - 90, taille: 13, couleur: '6F716E', align: 'center' });
      }
      ecrire(s, e.nom, { x: x + 14, y: y + ch - 66, w: cw - 28, h: 24, taille: 17, couleur: libre ? C.clair : C.ivoire, chemin: `enseignes.${k}.nom` });
      ecrire(s, e.secteur, { x: x + 14, y: y + ch - 40, w: cw - 28, h: 20, taille: 13, couleur: C.gris, chemin: `enseignes.${k}.secteur` });
    });
  },
  marche(s, d) {
    const m = d.marche || {};
    const l = d.local || {};
    const hb = (H - 64 - 12 - 22 - 12) / 2;
    boite(s, { x: X + 32, y: Y + 32, w: W - 64, h: hb, bord: 84 });
    ecrire(s, texte(m.titre).toUpperCase(), { x: X + 58, y: Y + 54, w: 400, h: 16, taille: 11, couleur: C.grisFonce, charSpacing: 1.8, chemin: 'marche.titre' });
    const cw = (W - 64 - 52 - 24) / 2;
    [[m.murs, m.murs_label, 'murs', 'murs_label'], [m.loyer, m.loyer_label, 'loyer', 'loyer_label']].forEach(([v, lb, cv, cl], k) => {
      ecrire(s, v, { x: X + 58 + k * (cw + 24), y: Y + 32 + hb - 90, w: cw, h: 46, taille: 36, couleur: C.gris, chemin: `marche.${cv}` });
      ecrire(s, lb, { x: X + 58 + k * (cw + 24), y: Y + 32 + hb - 42, w: cw, h: 20, taille: 13.5, couleur: C.gris, chemin: `marche.${cl}` });
    });
    const yc = Y + 32 + hb + 12;
    filet(s, X + 32, yc + 11, (W - 64) / 2 - 50);
    ecrire(s, 'comparé à', { x: X + W / 2 - 45, y: yc, w: 90, h: 22, taille: 13.5, couleur: C.gris, align: 'center' });
    filet(s, X + W / 2 + 50, yc + 11, (W - 64) / 2 - 50);
    const yl = yc + 22 + 12;
    boite(s, { x: X + 32, y: yl, w: W - 64, h: hb, fond: C.sauge });
    ecrire(s, texte(l.titre).toUpperCase(), { x: X + 58, y: yl + 22, w: 500, h: 16, taille: 11, couleur: C.encre, charSpacing: 1.8, chemin: 'local.titre' });
    [[l.prix_m2, l.prix_label, 'prix_m2', 'prix_label'], [l.loyer_m2, l.loyer_label, 'loyer_m2', 'loyer_label']].forEach(([v, lb, cv, cl], k) => {
      ecrire(s, v, { x: X + 58 + k * (cw + 24), y: yl + hb - 90, w: cw, h: 46, taille: 36, couleur: C.encre, chemin: `local.${cv}` });
      ecrire(s, lb, { x: X + 58 + k * (cw + 24), y: yl + hb - 42, w: cw, h: 34, taille: 13.5, couleur: C.encre, valign: 'top', chemin: `local.${cl}` });
    });
  },
  projection(s, d) {
    (d.lignes || []).slice(0, 4).forEach((l, k) => {
      const y = Y + 28 + k * 62;
      if (k > 0) filet(s, X + 36, y, W - 72, 89);
      ecrire(s, l.label, { x: X + 36, y, w: 380, h: 62, taille: 14, couleur: C.gris, chemin: `lignes.${k}.label` });
      ecrire(s, l.valeur, { x: X + 330, y, w: W - 366, h: 62, taille: 34, couleur: k === 3 ? C.sauge : C.ivoire, align: 'right', chemin: `lignes.${k}.valeur` });
    });
    filet(s, X + 36, Y + 28 + 4 * 62, W - 72);
    const barres = d.barres || [];
    const haut = Y + 28 + 4 * 62 + 24;
    const bas = Y + H - 32 - 24;
    const g = 5;
    const bw = (W - 72 - g * (barres.length - 1)) / Math.max(1, barres.length);
    barres.forEach((v, k) => {
      const h = Math.max(4, ((bas - haut) * Math.min(100, Number(v) || 0)) / 100);
      s.addShape('rect', { x: pouces(X + 36 + k * (bw + g)), y: pouces(bas - h), w: pouces(bw), h: pouces(h), fill: k === barres.length - 1 ? { color: C.sauge } : { color: C.filet, transparency: 80 }, line: { type: 'none' } });
    });
    ecrire(s, 'Année 1', { x: X + 36, y: bas + 6, w: 120, h: 18, taille: 12.5, couleur: C.grisFonce });
    ecrire(s, d.legende, { x: X + 160, y: bas + 6, w: W - 320, h: 18, taille: 12.5, couleur: C.grisFonce, align: 'center', chemin: 'legende' });
    ecrire(s, `Année ${barres.length || 20}`, { x: X + W - 156, y: bas + 6, w: 120, h: 18, taille: 12.5, couleur: C.grisFonce, align: 'right' });
  },
  revenus(s, d) {
    const ent = d.entetes || [];
    const ls = d.lignes || [];
    if (!ls.length) {
      ecrire(s, 'Loyer ou prix d’acquisition manquant : le tableau se remplit depuis le simulateur du projet.', { x: X + 36, y: Y + 40, w: W - 72, h: 40, taille: 14, couleur: C.gris });
      return;
    }
    const cols = [0.5, 1, 1, 1, 1.1];
    const somme = cols.reduce((a, b) => a + b, 0);
    const largeurs = cols.map((c) => ((W - 64) * c) / somme);
    const bord = (bas) => [{ type: 'none' }, { type: 'none' }, bas ? { type: 'solid', pt: 0.5, color: '3A3B3A' } : { type: 'none' }, { type: 'none' }];
    const ligne = (cellules, entete = false) => cellules.map((c, k) => ({
      text: texte(c),
      options: {
        color: entete ? C.sauge : k === 0 || k === 2 ? C.gris : C.ivoire, align: k === 0 ? 'left' : 'right', fontSize: entete ? 7.9 : 9.75,
        charSpacing: entete ? 1.2 : 0, border: bord(true),
      },
    }));
    s.addTable([ligne(ent.map((e) => texte(e).toUpperCase()), true), ...ls.map((l) => ligne(l))], {
      x: pouces(X + 32), y: pouces(Y + 20), w: pouces(W - 64), colW: largeurs.map(pouces),
      rowH: pouces((H - 42) / (ls.length + 1)), fontFace: POLICE, valign: 'middle', margin: 0.02,
    });
  },
  conditions(s, d) {
    const g = 12;
    const cw = (W - 64 - g) / 2;
    const ch = (H - 64 - g) / 2;
    (d.blocs || []).slice(0, 4).forEach((b, k) => {
      const x = X + 32 + (k % 2) * (cw + g);
      const y = Y + 32 + Math.floor(k / 2) * (ch + g);
      const plein = k === 1;
      boite(s, { x, y, w: cw, h: ch, fond: plein ? C.sauge : null, bord: plein ? null : k < 2 ? 84 : 76, pointille: k >= 2 });
      ecrire(s, texte(b.titre).toUpperCase(), { x: x + 26, y: y + 22, w: cw - 52, h: 18, taille: 13, couleur: plein ? C.encre : C.gris, charSpacing: 1.8, chemin: `blocs.${k}.titre` });
      ecrire(s, b.valeur, { x: x + 26, y: y + ch - 22 - 64, w: cw - 52, h: 64, taille: k < 2 ? 62 : 46, couleur: plein ? C.encre : k < 2 ? C.ivoire : C.gris, valign: 'bottom', chemin: `blocs.${k}.valeur` });
    });
  },
  porteur(s, d, { img }) {
    const b64 = img(d.heros?.photo);
    if (b64) s.addImage({ data: `data:image/jpeg;base64,${b64}`, x: pouces(HEROS.x), y: pouces(110), w: pouces(140), h: pouces(140), sizing: { type: 'cover', w: pouces(140), h: pouces(140) }, rounding: true });
    filet(s, X + 36, Y + 32, W - 72);
    ecrire(s, 'PRINCIPALES EXPÉRIENCES', { x: X + 36, y: Y + 46, w: 400, h: 16, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    ecrire(s, d.experiences, { x: X + 36, y: Y + 70, w: W - 72, h: 110, taille: 16, couleur: C.clair, valign: 'top', chemin: 'experiences' });
    filet(s, X + 36, Y + 196, W - 72);
    ecrire(s, 'SITUATION PROFESSIONNELLE', { x: X + 36, y: Y + 210, w: 400, h: 16, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    const cw = (W - 72 - 40) / 3;
    (d.situation || []).slice(0, 3).forEach((c, k) => {
      ecrire(s, c.valeur, { x: X + 36 + k * (cw + 20), y: Y + 234, w: cw, h: 28, taille: 20, chemin: `situation.${k}.valeur` });
      ecrire(s, c.label, { x: X + 36 + k * (cw + 20), y: Y + 262, w: cw, h: 18, taille: 13, couleur: C.gris, chemin: `situation.${k}.label` });
    });
    filet(s, X + 36, Y + 300, W - 72);
    ecrire(s, 'REVENUS ET ÉPARGNE', { x: X + 36, y: Y + 314, w: 400, h: 16, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    (d.revenus || []).slice(0, 4).forEach((l, k) => {
      const y = Y + 338 + k * 46;
      if (k > 0) filet(s, X + 36, y, W - 72, 92);
      ecrire(s, l.label, { x: X + 36, y, w: 300, h: 46, taille: 15, couleur: C.gris, chemin: `revenus.${k}.label` });
      ecrire(s, l.valeur, { x: X + 300, y, w: W - 336, h: 46, taille: 15, align: 'right', chemin: `revenus.${k}.valeur` });
    });
  },
  structuration(s, d) {
    const as = (d.associes || []).slice(0, 2);
    const cw = (W - 72 - 12) / 2;
    as.forEach((a, k) => {
      const x = X + 36 + k * (cw + 12);
      boite(s, { x, y: Y + 70, w: cw, h: 84, bord: 84, fond: C.case });
      ecrire(s, 'ASSOCIÉ', { x: x + 22, y: Y + 86, w: 200, h: 16, taille: 11, couleur: C.grisFonce, charSpacing: 1.8 });
      ecrire(s, a.nom, { x: x + 22, y: Y + 108, w: cw - 120, h: 28, taille: 20, chemin: `associes.${k}.nom` });
      ecrire(s, a.part, { x: x + cw - 120, y: Y + 108, w: 98, h: 28, taille: 20, couleur: C.sauge, align: 'right', chemin: `associes.${k}.part` });
    });
    s.addShape('line', { x: pouces(X + W / 2), y: pouces(Y + 154), w: 0, h: pouces(52), line: { color: C.filet, width: 0.75, transparency: 76 } });
    const st = d.structure || {};
    boite(s, { x: X + W / 2 - 200, y: Y + 206, w: 400, h: 116, fond: C.sauge });
    ecrire(s, texte(st.type).toUpperCase(), { x: X + W / 2 - 200, y: Y + 222, w: 400, h: 16, taille: 11, couleur: C.encre, align: 'center', charSpacing: 1.8, chemin: 'structure.type' });
    ecrire(s, st.nom, { x: X + W / 2 - 200, y: Y + 244, w: 400, h: 36, taille: 28, couleur: C.encre, align: 'center', chemin: 'structure.nom' });
    ecrire(s, st.statut, { x: X + W / 2 - 200, y: Y + 284, w: 400, h: 22, taille: 13.5, couleur: C.encre, align: 'center', chemin: 'structure.statut' });
    s.addShape('line', { x: pouces(X + W / 2), y: pouces(Y + 322), w: 0, h: pouces(32), line: { color: C.filet, width: 0.75, transparency: 76 } });
    const de = d.detient || {};
    boite(s, { x: X + W / 2 - 200, y: Y + 354, w: 400, h: 104, bord: 84 });
    ecrire(s, texte(de.titre).toUpperCase(), { x: X + W / 2 - 200, y: Y + 370, w: 400, h: 16, taille: 11, couleur: C.grisFonce, align: 'center', charSpacing: 1.8, chemin: 'detient.titre' });
    ecrire(s, de.adresse, { x: X + W / 2 - 190, y: Y + 390, w: 380, h: 28, taille: 18, align: 'center', chemin: 'detient.adresse' });
    ecrire(s, de.loue, { x: X + W / 2 - 190, y: Y + 420, w: 380, h: 22, taille: 13.5, couleur: C.gris, align: 'center', chemin: 'detient.loue' });
  },
  merci(s, d, { img, logo }) {
    if (logo) s.addImage({ data: `data:image/png;base64,${logo}`, x: pouces(X + 36), y: pouces(Y + 36), w: pouces(260), h: pouces(41) });
    const b64 = img(d.photo);
    if (b64) s.addImage({ data: `data:image/jpeg;base64,${b64}`, x: pouces(X + 36), y: pouces(Y + 220), w: pouces(120), h: pouces(120), sizing: { type: 'cover', w: pouces(120), h: pouces(120) }, rounding: true });
    else {
      s.addShape('ellipse', { x: pouces(X + 36), y: pouces(Y + 220), w: pouces(120), h: pouces(120), fill: { type: 'none' }, line: { color: C.filet, width: 0.75, transparency: 70, dashType: 'dash' } });
      ecrire(s, '[Photo]', { x: X + 36, y: Y + 220, w: 120, h: 120, taille: 13, couleur: C.gris, align: 'center' });
    }
    ecrire(s, 'CONTACT', { x: X + 180, y: Y + 246, w: 300, h: 16, taille: 11, couleur: C.sauge, charSpacing: 1.8 });
    ecrire(s, d.porteur, { x: X + 180, y: Y + 266, w: W - 216, h: 46, taille: 36, chemin: 'porteur' });
    [['Téléphone', d.telephone, 'telephone'], ['E-mail', d.email, 'email']].forEach(([l, v, chemin], k) => {
      const y = Y + H - 36 - 96 + k * 48;
      filet(s, X + 36, y, W - 72, k === 0 ? 84 : 92);
      ecrire(s, l, { x: X + 36, y, w: 300, h: 48, taille: 17, couleur: C.gris });
      ecrire(s, v, { x: X + 300, y, w: W - 336, h: 48, taille: 17, align: 'right', chemin });
    });
  },
};

/**
 * Le PPTX d'un projet, sans retouche : le modèle construit puis dessiné.
 * @param {object} project
 * @param {object} photos URLs : { couverture, ville, quartier, local1, local2, local3 }
 * @returns {Promise<Buffer>} le PPTX
 */
export async function genererPresentationProjet(project, photos = {}) {
  const diapos = await construireDiapos(project, photos);
  return rendrePptx(diapos, { titre: project.titre || project.adresse_complete || '' });
}
