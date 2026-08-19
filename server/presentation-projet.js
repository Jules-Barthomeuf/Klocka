// Présentation de financement d'un PROJET, générée en PPTX (pptxgenjs), sur
// la trame du dossier « Projet de Financement » : couverture, sommaire, la
// ville, l'emplacement (carte), le quartier, le marché locatif, le local, le
// bail, la projection financière, les conditions souhaitées, le CV du porteur
// (placeholders à compléter dans Slides), la structuration et le contact.
//
// Chaque section n'apparaît que si le projet porte les données correspondantes.
// Les textes « ville » et « quartier » viennent des champs du projet quand ils
// sont renseignés, sinon du LLM serveur, sinon d'un repli factuel.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PptxGenJS from 'pptxgenjs';
import { invokeLLM, llmEnabled } from './llm.js';
import { resoudreCommune } from './deal/enrich.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, 'uploads');

const C = {
  fond: '000000',
  panneau: '101312',
  bordure: '2E3230',
  ivoire: 'FFFFFF',
  gris: 'B9BFBD',
  teal: '2A9D8F',
  tealClair: '7FD3C9',
};
const SERIF = 'Georgia';
const SANS = 'Helvetica';
const LARGEUR = 13.33;

const euros = (n) => (n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} €`);
const nombre = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n));
const rempli = (s) => typeof s === 'string' && s.trim() && !/^non disponible/i.test(s.trim());
const positif = (n) => (typeof n === 'number' && isFinite(n) && n > 0 ? n : null);
const dateFr = (s) => {
  const d = s ? new Date(s) : null;
  return d && !isNaN(d) ? d.toLocaleDateString('fr-FR') : null;
};

// ---------------------------------------------------------------------------
// Données dérivées
// ---------------------------------------------------------------------------

function decomposerAdresse(adresseComplete) {
  const cp = (adresseComplete || '').match(/\b(\d{5})\b/)?.[1] || null;
  const morceaux = String(adresseComplete || '').split(',').map((s) => s.trim());
  const ville = (morceaux[morceaux.length - 1] || '').replace(/\b\d{5}\b/, '').trim() || null;
  return { cp, ville };
}

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

// Prix de revient « droits inclus » : même logique que la fiche projet.
function prixDeRevient(p) {
  const negocie = positif(p.sim_prix_bien_negocie);
  if (negocie) {
    const commissionActive = !!p.sim_commission_agent_active;
    const commissionIncluse = p.sim_commission_agent_inclus_fai ?? true;
    const tauxCommission = p.sim_commission_agent ?? 5;
    const commission = commissionActive
      ? p.sim_commission_agent_type === 'fixe' ? tauxCommission : (negocie * tauxCommission) / 100
      : 0;
    const horsDroits = commissionIncluse ? negocie - commission : negocie;
    const droits = (horsDroits * (p.sim_droits_enregistrement ?? 8)) / 100;
    const fees = p.sim_fees_klocka_type === 'fixe'
      ? (p.sim_fees_klocka ?? 0)
      : (negocie * (p.sim_fees_klocka ?? 8)) / 100;
    const incentive = ((positif(p.sim_prix_bien_fai) || negocie) - negocie) * ((p.sim_incentive_klocka ?? 20) / 100);
    const divers = (p.sim_frais_dossier_bancaire || 0) + (p.sim_cout_creation_societe || 0) + (p.sim_frais_courtage || 0);
    return Math.round(negocie + droits + fees + incentive + divers + (commissionIncluse ? 0 : commission));
  }
  return positif(p.sim_prix_revient) || positif(p.prix_acquisition) ||
    (positif(p.sim_prix_bien_fai) ? Math.round(p.sim_prix_bien_fai * 1.08) : null);
}

function loyerInitial(p) {
  return positif(p.sim_loyer_initial_ht) || positif(p.loyer_annuel_ht) || positif(p.bail_loyer_actuel) || null;
}

// Textes ville & quartier : champs du projet, sinon LLM, sinon repli factuel.
// Rend des tableaux de puces (une chaîne libre est découpée par lignes).
function enPuces(texte) {
  if (Array.isArray(texte)) return texte;
  return String(texte)
    .split(/\n+/)
    .map((l) => l.replace(/^[-•●\s]+/, '').trim())
    .filter(Boolean);
}

async function textesVilleQuartier(p, commune) {
  const resultat = { ville: null, quartier: null };
  if (rempli(p.description_ville)) resultat.ville = enPuces(p.description_ville);
  if (rempli(p.description_secteur)) resultat.quartier = enPuces(p.description_secteur);
  if (resultat.ville && resultat.quartier) return resultat;

  if (llmEnabled) {
    try {
      const r = await invokeLLM({
        prompt:
          `Tu rédiges deux sections d'un dossier de financement bancaire pour des murs commerciaux situés ` +
          `« ${p.adresse_complete || p.titre} ». Locataire : ${p.nom_locataire || 'n/c'} (${p.activite_locataire || 'n/c'}). ` +
          `${commune?.population ? `Population de la commune : ${commune.population} habitants. ` : ''}` +
          `Écris en français, factuel et sobre, sans superlatifs commerciaux. ` +
          `"ville" : 4 à 6 puces sur la commune (situation, accessibilité, économie, marché immobilier). ` +
          `"quartier" : 3 à 5 puces sur le micro-emplacement (type d'axe, environnement, clientèle, prudences éventuelles). ` +
          `Chaque puce est une phrase complète de 15 à 25 mots. N'invente aucun chiffre précis.`,
        response_json_schema: {
          type: 'object',
          properties: {
            ville: { type: 'array', items: { type: 'string' } },
            quartier: { type: 'array', items: { type: 'string' } },
          },
          required: ['ville', 'quartier'],
        },
      });
      if (!resultat.ville && Array.isArray(r?.ville) && r.ville.length) resultat.ville = r.ville;
      if (!resultat.quartier && Array.isArray(r?.quartier) && r.quartier.length) resultat.quartier = r.quartier;
    } catch (e) {
      console.warn('[presentation projet] rédaction LLM indisponible :', e?.message || e);
    }
  }
  if (!resultat.ville && commune?.population) {
    resultat.ville = [`${commune.nom} compte environ ${nombre(commune.population)} habitants.`];
  }
  return resultat;
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
        fetch(`${TUILE_IGN}&TILEMATRIX=${zoom}&TILEROW=${y0 + j}&TILECOL=${x0 + i}`, {
          signal: AbortSignal.timeout(8000),
        })
          .then(async (r) => (r.ok ? { i, j, b64: Buffer.from(await r.arrayBuffer()).toString('base64') } : null))
          .catch(() => null)
      );
    }
  }
  const tuiles = (await Promise.all(chargements)).filter(Boolean);
  if (!tuiles.length) return null;
  return {
    tuiles,
    cols,
    lignes,
    // Position du point visé, en fraction de la grille (pour placer le pin).
    fx: (cx - x0) / cols,
    fy: (cy - y0) / lignes,
  };
}

// Une photo du projet, en base64 (fichier local /uploads ou URL distante).
async function photoProjet(p, index = 0) {
  const url = p.photos?.[index];
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

// ---------------------------------------------------------------------------
// Briques de mise en page
// ---------------------------------------------------------------------------

function cercles(s, x, y, taille = 1.05) {
  s.addShape('ellipse', { x, y, w: taille, h: taille, fill: { color: C.tealClair } });
  s.addShape('ellipse', { x: x + taille * 0.55, y: y + taille * 0.42, w: taille, h: taille, fill: { color: C.teal } });
}

function titreSlide(s, texte) {
  s.addText(texte, {
    x: 0.6, y: 0.35, w: LARGEUR - 1.2, h: 0.85,
    fontFace: SERIF, fontSize: 34, color: C.ivoire,
  });
}

function sousTitre(s, texte, x, y, w) {
  s.addText(texte, { x, y, w, h: 0.35, fontFace: SERIF, fontSize: 14.5, color: C.tealClair });
}

function puces(s, lignes, x, y, w, h, taille = 12.5) {
  s.addText(
    lignes.map((t) => ({ text: t, options: { bullet: { characterCode: '2022', indent: 12 }, paraSpaceAfter: 8 } })),
    { x, y, w, h, fontFace: SANS, fontSize: taille, color: C.ivoire, valign: 'top' }
  );
}

function blocTeal(s, { x, y, w, h, titre, valeur, corps = 15 }) {
  s.addShape('rect', { x, y, w, h, fill: { color: C.teal } });
  s.addText(titre.toUpperCase(), {
    x: x + 0.05, y: y + 0.1, w: w - 0.1, h: 0.32,
    align: 'center', fontFace: SANS, fontSize: 12, bold: true, color: '062420',
  });
  s.addText(String(valeur), {
    x: x + 0.05, y: y + 0.4, w: w - 0.1, h: h - 0.5,
    align: 'center', valign: 'top', fontFace: SANS, fontSize: corps, bold: true, color: C.ivoire,
  });
}

function photoDroite(s, b64) {
  if (!b64) return;
  s.addImage({
    data: `data:image/jpeg;base64,${b64}`,
    x: 8.9, y: 0, w: LARGEUR - 8.9, h: 7.5,
    sizing: { type: 'cover', w: LARGEUR - 8.9, h: 7.5 },
  });
  s.addShape('line', { x: 8.86, y: 0, w: 0, h: 7.5, line: { color: C.teal, width: 1.5 } });
}

// ---------------------------------------------------------------------------

/** @returns {Promise<Buffer>} le PPTX du dossier de financement */
export async function genererPresentationProjet(project) {
  const p = project;
  const { cp, ville } = decomposerAdresse(p.adresse_complete);
  const [coords, commune, photoLocal, photoVille] = await Promise.all([
    geocoder(p),
    ville ? resoudreCommune(cp, ville).catch(() => null) : null,
    photoProjet(p, 0),
    photoProjet(p, 1),
  ]);
  const textes = await textesVilleQuartier(p, commune);
  const carte = coords ? await tuilesCarte(coords.lat, coords.lon, 15, 6, 4) : null;

  const nomVille = commune?.nom || ville || '';
  const surface = positif(p.surface_m2) || positif(p.sim_surface);
  const loyer = loyerInitial(p);
  const loyerM2 = positif(p.loyer_m2_an) || (surface && loyer ? Math.round(loyer / surface) : null);
  const prixRevient = prixDeRevient(p);
  const indexation = positif(p.sim_indexation_loyers) ?? 2;
  const dureeCredit = positif(p.sim_duree_credit) || 20;
  const apport = positif(p.sim_apport);
  const marcheRue = positif(p.marche_baux_bas) && positif(p.marche_baux_haut)
    ? [p.marche_baux_bas, p.marche_baux_haut] : null;
  const marcheVille = positif(p.marche_offre_bas) && positif(p.marche_offre_haut)
    ? [p.marche_offre_bas, p.marche_offre_haut] : null;

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

  // --- 2. Sommaire (selon les sections réellement générées) ------------------
  const sommaire = [];
  if (textes.ville) sommaire.push(`La ville de ${nomVille || '…'}`);
  if (carte) sommaire.push('Un emplacement stratégique');
  if (textes.quartier) sommaire.push('Zoom sur le quartier');
  if (marcheRue || marcheVille) sommaire.push('Le marché locatif du secteur');
  sommaire.push(`Présentation du local${surface ? ` (${nombre(surface)} m²)` : ''}`);
  sommaire.push('Analyse du bail en cours');
  if (loyer && prixRevient) sommaire.push(`Projection financière`);
  sommaire.push(`Conditions souhaitées — ${dureeCredit} ans`);
  sommaire.push('CV des porteurs du projet & structuration');
  {
    const s = slide();
    s.addText('Sommaire', { x: 0.6, y: 0.5, w: 7, h: 1, fontFace: SERIF, fontSize: 44, color: C.ivoire });
    s.addText(
      sommaire.map((t, i) => ({
        text: `${i + 1}. ${t}`,
        options: { paraSpaceAfter: 12 },
      })),
      { x: 0.65, y: 1.8, w: 7.6, h: 5.2, fontFace: SERIF, fontSize: 15, color: C.ivoire, valign: 'top' }
    );
    cercles(s, 6.2, 5.5, 0.95);
    photoDroite(s, photoVille || photoLocal);
  }

  // --- 3. La ville -----------------------------------------------------------
  if (textes.ville) {
    const s = slide();
    titreSlide(s, `La ville de ${nomVille || '…'}`);
    const infos = [];
    if (commune?.population) infos.push(`Population : ~${nombre(commune.population)} habitants.`);
    puces(s, [...infos, ...textes.ville].slice(0, 12), 0.65, 1.45, photoVille ? 7.9 : 12, 5.6);
    photoDroite(s, photoVille);
  }

  // --- 4. L'emplacement (carte Plan IGN + pin) --------------------------------
  if (carte) {
    const s = slide();
    titreSlide(s, 'Un emplacement stratégique');
    const zone = { x: 1.35, y: 1.35, w: 10.6, h: 5.6 };
    const tw = zone.w / carte.cols;
    const th = zone.h / carte.lignes;
    for (const t of carte.tuiles) {
      s.addImage({
        data: `data:image/png;base64,${t.b64}`,
        x: zone.x + t.i * tw, y: zone.y + t.j * th, w: tw + 0.005, h: th + 0.005,
      });
    }
    // Pin sur le local + cartouche.
    const px = zone.x + carte.fx * zone.w;
    const py = zone.y + carte.fy * zone.h;
    s.addShape('ellipse', { x: px - 0.09, y: py - 0.09, w: 0.18, h: 0.18, fill: { color: C.teal }, line: { color: 'FFFFFF', width: 1.5 } });
    s.addShape('rect', { x: px - 0.85, y: py - 0.62, w: 1.7, h: 0.38, fill: { color: '1D7A70' } });
    s.addText('Local commercial', { x: px - 0.85, y: py - 0.62, w: 1.7, h: 0.38, align: 'center', valign: 'middle', fontFace: SANS, fontSize: 10, bold: true, color: 'FFFFFF' });
    s.addText('© IGN', { x: zone.x + zone.w - 0.8, y: zone.y + zone.h - 0.3, w: 0.75, h: 0.25, align: 'right', fontFace: SANS, fontSize: 8, color: '5A605E' });
  }

  // --- 5. Le quartier ----------------------------------------------------------
  if (textes.quartier) {
    const s = slide();
    titreSlide(s, 'Zoom sur le quartier');
    puces(s, textes.quartier.slice(0, 10), 0.65, 1.45, 12, 5.6, 13);
  }

  // --- 6. Le marché locatif ----------------------------------------------------
  if (marcheRue || marcheVille) {
    const s = slide();
    titreSlide(s, 'Un marché de l’immobilier dynamique');
    const blocs = [];
    if (marcheRue) blocs.push({ titre: 'Valeur locative — baux en cours', plage: marcheRue, note: 'Baux commerciaux du secteur, emplacements et surfaces équivalents' });
    if (marcheVille) blocs.push({ titre: 'Valeur locative — offres du marché', plage: marcheVille, note: `Offres en cours${nomVille ? ` à ${nomVille}` : ''}, emplacements et surfaces équivalents` });
    const w = 4.6;
    const positions = blocs.length === 2 ? [1.7, 7.05] : [(LARGEUR - w) / 2];
    blocs.forEach((b, i) => {
      blocTeal(s, {
        x: positions[i], y: 2.1, w, h: 1.5,
        titre: b.titre,
        valeur: `Entre ${nombre(b.plage[0])} €/m²/an\net ${nombre(b.plage[1])} €/m²/an`,
      });
      s.addText(`Source : ${rempli(p.marche_quartier_nom) ? p.marche_quartier_nom : 'données de marché du dossier'} — ${b.note}.`, {
        x: positions[i] - 0.3, y: 3.75, w: w + 0.6, h: 0.9,
        align: 'center', fontFace: SANS, fontSize: 10.5, color: C.gris, valign: 'top',
      });
    });
    if (positif(p.marche_baux_moyenne) && loyerM2) {
      const ecart = Math.round(((loyerM2 - p.marche_baux_moyenne) / p.marche_baux_moyenne) * 100);
      s.addText(
        `Le loyer en place ressort à ${nombre(loyerM2)} €/m²/an, soit ${Math.abs(ecart)} % ${ecart < 0 ? 'sous' : 'au-dessus de'} la moyenne des baux du secteur (${nombre(Math.round(p.marche_baux_moyenne))} €/m²/an).`,
        { x: 1.2, y: 5.6, w: 11, h: 0.8, align: 'center', fontFace: SERIF, fontSize: 14, color: C.ivoire }
      );
    }
  }

  // --- 7. Le local -------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Présentation du local');
    const lignes = [
      ['Adresse', p.adresse_complete],
      ['Surface', surface ? `${nombre(surface)} m²` : null],
      ['Loyer au m²/an', loyerM2 ? `${nombre(loyerM2)} €` : null],
      ['Locataire', rempli(p.nom_locataire) ? p.nom_locataire : null],
      ['Activité', rempli(p.activite_locataire) ? p.activite_locataire : null],
      ['Locataire depuis', dateFr(p.locataire_depuis)],
      ['Quote-part copropriété', positif(p.quote_part_lot) ? `${p.quote_part_lot}/1000e` : null],
    ].filter(([, v]) => v);
    let y = 1.5;
    for (const [label, valeur] of lignes) {
      s.addText([
        { text: `${label} : `, options: { color: C.tealClair } },
        { text: String(valeur), options: { color: C.ivoire } },
      ], { x: 0.65, y, w: photoLocal ? 7.9 : 12, h: 0.4, fontFace: SERIF, fontSize: 15 });
      y += 0.48;
    }
    if (rempli(p.description_bien)) {
      s.addText(p.description_bien.trim().slice(0, 700), {
        x: 0.65, y: y + 0.15, w: photoLocal ? 7.9 : 12, h: 6.9 - y, fontFace: SANS, fontSize: 12, color: C.ivoire, valign: 'top',
      });
    }
    photoDroite(s, photoLocal);
  }

  // --- 8. Le bail ---------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Zoom sur le bail commercial');
    const points = [
      rempli(p.activite_locataire) && `Activité : ${p.activite_locataire}`,
      rempli(p.bail_type) && `Type de bail : ${p.bail_type}`,
      dateFr(p.bail_date_debut) && `Début du bail : ${dateFr(p.bail_date_debut)}`,
      (dateFr(p.bail_date_echeance) || dateFr(p.echeance_bail)) &&
        `Échéance : ${dateFr(p.bail_date_echeance) || dateFr(p.echeance_bail)}`,
      loyer && `Loyer annuel HT : ${euros(loyer)}`,
      loyer && `Loyer mensuel HT : ${euros(loyer / 12)}`,
      `Indexation : révision annuelle sur l'ILC (hypothèse +${String(indexation).replace('.', ',')} %/an)`,
      rempli(p.bail_charges_redevable) && `Charges : ${p.bail_charges_redevable}`,
      positif(p.bail_taxe_fonciere) && `Taxe foncière : ${euros(p.bail_taxe_fonciere)} — refacturation selon bail`,
      positif(p.bail_droit_entree) && `Droit d'entrée versé par le preneur : ${euros(p.bail_droit_entree)}`,
      positif(p.bail_depot_garantie) && `Dépôt de garantie : ${euros(p.bail_depot_garantie)}`,
      rempli(p.statut_bail) && `Statut : ${p.statut_bail}`,
    ].filter(Boolean);
    puces(s, points, 0.65, 1.45, 12, 4.2, 13);
    if (rempli(p.bail_infos_importantes)) {
      sousTitre(s, 'Points d’attention du bail', 0.65, 5.55, 8);
      s.addText(p.bail_infos_importantes.trim().slice(0, 600), {
        x: 0.65, y: 5.95, w: 12, h: 1.15, fontFace: SANS, fontSize: 11, color: C.gris, valign: 'top',
      });
    }
  }

  // --- 9. Projection financière ---------------------------------------------------
  if (loyer && prixRevient) {
    const s = slide();
    titreSlide(s, 'Projection financière — revenus fonciers');
    sousTitre(s, 'Hypothèse : maintien des conditions actuelles du bail', 0.65, 1.25, 12);
    s.addText(
      `Conservation du loyer actuel avec une indexation annuelle de ${String(indexation).replace('.', ',')} % — charges et taxe foncière à la charge du locataire.`,
      { x: 0.65, y: 1.6, w: 12, h: 0.35, fontFace: SANS, fontSize: 11.5, color: C.ivoire }
    );

    const ANNEES = 20;
    const bruts = [];
    let courant = loyer;
    for (let a = 1; a <= ANNEES; a++) {
      if (a > 1) courant = courant * (1 + indexation / 100);
      bruts.push(Math.round(courant));
    }
    const cumuls = bruts.reduce((acc, v) => { acc.push((acc[acc.length - 1] || 0) + v); return acc; }, []);

    const enTete = { fill: { color: C.teal }, color: 'FFFFFF', bold: true };
    const cellule = { fill: { color: '17615A' }, color: 'FFFFFF' };
    const table = [
      [{ text: 'Année', options: enTete }, ...bruts.map((_, i) => ({ text: `A${i + 1}`, options: enTete }))],
      [{ text: 'Loyers bruts HT HC', options: cellule }, ...bruts.map((v) => ({ text: nombre(v), options: cellule }))],
      [{ text: 'Cumul', options: cellule }, ...cumuls.map((v) => ({ text: nombre(v), options: cellule }))],
    ];
    s.addTable(table, {
      x: 0.35, y: 2.1, w: LARGEUR - 0.7,
      fontFace: SANS, fontSize: 6.6, align: 'center', valign: 'middle',
      border: { type: 'solid', color: C.fond, pt: 0.5 },
      rowH: 0.28,
    });

    const revente = Math.round(bruts[ANNEES - 1] / 0.065);
    const plusValue = revente - prixRevient;
    sousTitre(s, `Projection en cas de revente à ${ANNEES} ans`, 0.65, 3.45, 12);
    const bloc = { y: 3.95, w: 3.3, h: 1.15 };
    blocTeal(s, { x: 1.15, ...bloc, titre: 'Prix d’acquisition droits inclus', valeur: euros(prixRevient), corps: 16 });
    s.addText('→', { x: 4.55, y: 4.25, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 22, color: C.tealClair });
    blocTeal(s, { x: 5.15, ...bloc, titre: `Revente à ${ANNEES} ans — rendement 6,5 %`, valeur: euros(revente), corps: 16 });
    s.addText('→', { x: 8.55, y: 4.25, w: 0.6, h: 0.5, align: 'center', fontFace: SANS, fontSize: 22, color: C.tealClair });
    blocTeal(s, { x: 9.15, ...bloc, titre: 'Plus-value — hypothèse', valeur: euros(plusValue), corps: 16 });

    const multipleLoyers = (cumuls[ANNEES - 1] / prixRevient).toFixed(2).replace('.', ',');
    const multipleMurs = (revente / prixRevient).toFixed(2).replace('.', ',');
    s.addText([
      { text: `Dans cette hypothèse, les revenus cumulés à ${ANNEES} ans représentent un multiple de ` },
      { text: `${multipleLoyers} du prix d’acquisition`, options: { color: C.tealClair } },
      { text: ' et la valeur des murs un multiple de ' },
      { text: multipleMurs, options: { color: C.tealClair } },
      { text: ' en cas de revente.' },
    ], { x: 1, y: 5.55, w: 11.3, h: 0.9, align: 'center', fontFace: SERIF, fontSize: 14, color: C.ivoire });
  }

  // --- 10. Conditions souhaitées ---------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Conditions souhaitées');
    const bloc = { y: 3, w: 3.2, h: 1.05 };
    blocTeal(s, { x: 1.35, ...bloc, titre: 'Taux', valeur: 'FIXE', corps: 18 });
    blocTeal(s, { x: 5.05, ...bloc, titre: 'Durée du crédit', valeur: `${dureeCredit} ANS`, corps: 18 });
    blocTeal(s, { x: 8.75, ...bloc, titre: 'Apport', valeur: apport ? `Jusqu'à ${nombre(Math.round(apport / 1000))} K€` : 'À définir', corps: 18 });
    s.addText(
      'Ces conditions souhaitées s’inscrivent pleinement dans les projections et objectifs de rentabilité de l’opération.',
      { x: 1.5, y: 5.4, w: 10.3, h: 0.7, align: 'center', fontFace: SERIF, fontSize: 15, color: C.ivoire }
    );
  }

  // --- 11. CV du porteur (placeholders à compléter dans Slides) ---------------------
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

  // --- 12. Structuration --------------------------------------------------------------
  {
    const s = slide();
    titreSlide(s, 'Structuration (exemple)');
    const boite = (y, texte, sous) => {
      s.addShape('rect', { x: 5.05, y, w: 3.2, h: sous ? 1 : 0.5, fill: { color: C.teal } });
      s.addText(texte, { x: 5.05, y: y + 0.04, w: 3.2, h: 0.42, align: 'center', fontFace: SANS, fontSize: 13, bold: true, color: '062420' });
      if (sous) s.addText(sous, { x: 5.05, y: y + 0.42, w: 3.2, h: 0.55, align: 'center', fontFace: SANS, fontSize: 10.5, color: 'FFFFFF', valign: 'top' });
    };
    boite(1.7, 'Prenom NOM — XX %');
    boite(2.35, 'Prenom NOM — XX %');
    s.addText('↓', { x: 5.05, y: 3.0, w: 3.2, h: 0.6, align: 'center', fontFace: SANS, fontSize: 26, color: C.teal });
    boite(3.7, 'SCI — en cours de création', 'Objet : investissement immobilier');
  }

  // --- 13. Merci ------------------------------------------------------------------------
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
