// Présentation bancaire d'un lot, générée en PPTX (pptxgenjs).
//
// Document destiné au financeur : il n'expose que des FAITS du dossier (bien,
// bail, chiffres, plan de financement, marché) et les points forts rédigés —
// jamais le verdict interne ni les réserves. Le PPTX est ensuite converti en
// Google Slides (modifiable) via Drive quand un compte est connecté.

import PptxGenJS from 'pptxgenjs';
import { vueRedacteur } from './redact.js';

const val = (c) => (c && c.absent === false ? c.valeur : null);
const euros = (n) =>
  n == null ? '—' : `${new Intl.NumberFormat('fr-FR').format(Math.round(n))} €`;
const pct = (n) => (n == null ? '—' : `${String(n).replace('.', ',')} %`);
const nombre = (n) => (n == null ? '—' : new Intl.NumberFormat('fr-FR').format(n));

const TYPOLOGIES = {
  petite_ville: 'Petite ville',
  ville_moyenne: 'Ville moyenne',
  grande_ville: 'Grande ville',
  metropole: 'Métropole',
};

// Palette éditoriale de l'app (hex sans #, format pptxgenjs).
const C = {
  fond: '0A0C0C',
  panneau: '101312',
  bordure: '242726',
  ivoire: 'EDEAE5',
  gris: '8B9391',
  teal: '35A79B',
  tealClair: '7FD3C9',
};
const POLICE = 'Helvetica';

function slideBase(pptx, etiquette) {
  const s = pptx.addSlide();
  s.background = { color: C.fond };
  if (etiquette) {
    s.addText(etiquette.toUpperCase(), {
      x: 0.6, y: 0.35, w: 8, h: 0.4,
      fontFace: POLICE, fontSize: 12, color: C.teal, charSpacing: 6,
    });
    s.addShape('line', { x: 0.62, y: 0.85, w: 1.2, h: 0, line: { color: C.teal, width: 1.2 } });
  }
  // Pied de page discret.
  s.addText('KLOCKA — Développeur de revenus immobiliers', {
    x: 0.6, y: 7.02, w: 8, h: 0.3, fontFace: POLICE, fontSize: 9, color: C.gris,
  });
  return s;
}

// Lignes label/valeur empilées dans un panneau.
function panneauLignes(s, lignes, { x, y, w }) {
  const h = lignes.length * 0.62 + 0.3;
  s.addShape('roundRect', {
    x, y, w, h, rectRadius: 0.05,
    fill: { color: C.panneau }, line: { color: C.bordure, width: 1 },
  });
  lignes.forEach(([label, valeur], i) => {
    const ly = y + 0.18 + i * 0.62;
    s.addText(label, { x: x + 0.3, y: ly, w: w * 0.42, h: 0.5, fontFace: POLICE, fontSize: 13, color: C.gris, valign: 'middle' });
    s.addText(String(valeur), { x: x + w * 0.42, y: ly, w: w * 0.55, h: 0.5, fontFace: POLICE, fontSize: 15, color: C.ivoire, align: 'right', valign: 'middle' });
  });
  return h;
}

function tuile(s, { x, y, w, h, titre, valeur, note }) {
  s.addShape('roundRect', { x, y, w, h, rectRadius: 0.05, fill: { color: C.panneau }, line: { color: C.bordure, width: 1 } });
  s.addText(titre.toUpperCase(), { x: x + 0.1, y: y + 0.22, w: w - 0.2, h: 0.3, align: 'center', fontFace: POLICE, fontSize: 11, color: C.gris, charSpacing: 2 });
  s.addText(String(valeur), { x: x + 0.1, y: y + 0.6, w: w - 0.2, h: 0.6, align: 'center', fontFace: POLICE, fontSize: 26, color: C.tealClair });
  if (note) s.addText(note, { x: x + 0.1, y: y + 1.25, w: w - 0.2, h: 0.3, align: 'center', fontFace: POLICE, fontSize: 10, color: C.gris });
}

/**
 * @param {object} dossier - deal complet
 * @param {object} lot - dossier.lots[i]
 * @returns {Promise<Buffer>} le PPTX
 */
export async function genererPresentationBanque(dossier, lot) {
  const vue = vueRedacteur({ lot: lot.lot, enrichissement: lot.enrichissement, evaluation: lot.evaluation });
  const sim = lot.simulateur || {};
  const aem = lot.evaluation?.aem || {};
  const titre = lot.synthese?.titre || lot.intitule || 'Opportunité d’investissement';

  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Klocka';
  pptx.title = `Présentation bancaire — ${titre}`;

  // --- 1. Couverture ---------------------------------------------------------
  {
    const s = slideBase(pptx);
    s.addText('KLOCKA', { x: 0.6, y: 1.5, w: 6, h: 0.5, fontFace: POLICE, fontSize: 16, color: C.teal, charSpacing: 8 });
    s.addText('Dossier de présentation bancaire', { x: 0.6, y: 2.2, w: 12, h: 1.1, fontFace: POLICE, fontSize: 40, color: C.ivoire });
    s.addText(titre, { x: 0.6, y: 3.5, w: 12, h: 0.7, fontFace: POLICE, fontSize: 20, color: C.gris });
    s.addText(
      [vue.marche.commune, new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })]
        .filter(Boolean).join(' — '),
      { x: 0.6, y: 4.3, w: 12, h: 0.5, fontFace: POLICE, fontSize: 14, color: C.gris }
    );
  }

  // --- 2. Le bien ------------------------------------------------------------
  {
    const s = slideBase(pptx, 'Le bien');
    const adresse = vue.bien.adresse?.rue || (typeof vue.bien.adresse === 'string' ? vue.bien.adresse : null);
    panneauLignes(s, [
      ['Type d’actif', vue.bien.type_actif || '—'],
      ['Surface', vue.bien.surface_m2 ? `${nombre(vue.bien.surface_m2)} m²` : '—'],
      ['Localisation', [adresse, vue.marche.commune].filter(Boolean).join(', ') || '—'],
      ['Locataire', vue.bien.locataire || '—'],
      ['Activité', vue.bien.activite || '—'],
    ], { x: 0.6, y: 1.3, w: 12.1 });
  }

  // --- 3. Le bail ------------------------------------------------------------
  {
    const s = slideBase(pptx, 'Le bail');
    panneauLignes(s, [
      ['Type de bail', vue.bien.bail_type || '—'],
      ['Échéance', vue.bien.bail_echeance || '—'],
      ['Années restantes', vue.bien.annees_bail_restantes ?? '—'],
      ['Loyer annuel HT-HC', euros(vue.finances.loyer_annuel_ht_hc)],
    ], { x: 0.6, y: 1.3, w: 12.1 });
  }

  // --- 4. L'opération --------------------------------------------------------
  {
    const s = slideBase(pptx, 'L’opération');
    const t = { y: 1.5, w: 2.85, h: 1.7 };
    tuile(s, { x: 0.6, ...t, titre: 'Prix FAI', valeur: euros(vue.finances.prix_fai) });
    tuile(s, { x: 3.7, ...t, titre: 'Prix de revient', valeur: euros(vue.finances.prix_aem), note: 'acte en main' });
    tuile(s, { x: 6.8, ...t, titre: 'Rendement FAI', valeur: pct(vue.finances.rendement_fai ?? vue.finances.rendement_annonce) });
    tuile(s, { x: 9.9, ...t, titre: 'Rendement AEM', valeur: pct(aem.rendement_aem) });
    s.addText(
      'Le prix de revient « acte en main » intègre droits d’enregistrement, honoraires et frais — c’est la base de calcul du financement.',
      { x: 0.6, y: 3.6, w: 12.1, h: 0.5, fontFace: POLICE, fontSize: 12, color: C.gris }
    );
  }

  // --- 5. Plan de financement ------------------------------------------------
  {
    const s = slideBase(pptx, 'Plan de financement');
    const prix = vue.finances.prix_fai;
    const lignes = [];
    if (prix != null) {
      const droits = Math.round((prix * (sim.tauxDroitsEnregistrement ?? 8)) / 100);
      const fees = Math.round((prix * (sim.tauxFeesKlocka ?? 8)) / 100);
      lignes.push(['Prix du bien (FAI)', euros(prix)]);
      lignes.push([`Droits d’enregistrement (${pct(sim.tauxDroitsEnregistrement ?? 8)})`, euros(droits)]);
      lignes.push([`Honoraires Klocka (${pct(sim.tauxFeesKlocka ?? 8)})`, euros(fees)]);
      if (sim.fraisDossierBancaire) lignes.push(['Frais de dossier bancaire', euros(sim.fraisDossierBancaire)]);
      if (sim.coutCreationSociete) lignes.push(['Création de société', euros(sim.coutCreationSociete)]);
      if (sim.fraisCourtage) lignes.push(['Courtage', euros(sim.fraisCourtage)]);
      lignes.push(['Coût total de l’opération', euros(aem.prix_aem)]);
    } else {
      lignes.push(['Données de prix absentes de la fiche', '—']);
    }
    panneauLignes(s, lignes, { x: 0.6, y: 1.3, w: 12.1 });
  }

  // --- 6. La ville & le marché ----------------------------------------------
  {
    const s = slideBase(pptx, 'La ville & le marché');
    panneauLignes(s, [
      ['Commune', vue.marche.commune || '—'],
      ['Population', vue.marche.population ? `${nombre(vue.marche.population)} habitants` : '—'],
      ['Typologie', TYPOLOGIES[vue.marche.typologie_ville] || '—'],
    ], { x: 0.6, y: 1.3, w: 5.8 });
    const contexte = lot.contexte_marche?.resume;
    if (contexte) {
      s.addText('Contexte de marché (sources web)', { x: 6.8, y: 1.3, w: 5.9, h: 0.4, fontFace: POLICE, fontSize: 12, color: C.gris });
      s.addText(contexte.length > 900 ? `${contexte.slice(0, 900)}…` : contexte, {
        x: 6.8, y: 1.75, w: 5.9, h: 4.6, fontFace: POLICE, fontSize: 11.5, color: C.ivoire, valign: 'top',
      });
    }
  }

  // --- 7. Points forts & contact ---------------------------------------------
  {
    const s = slideBase(pptx, 'Synthèse');
    const forts = (lot.synthese?.points_forts || []).slice(0, 5);
    if (forts.length) {
      s.addText(
        forts.map((p) => ({ text: p, options: { bullet: { characterCode: '2013' }, paraSpaceAfter: 8 } })),
        { x: 0.6, y: 1.4, w: 7.2, h: 4.5, fontFace: POLICE, fontSize: 15, color: C.ivoire, valign: 'top' }
      );
    }
    s.addShape('roundRect', { x: 8.3, y: 1.4, w: 4.4, h: 2.3, rectRadius: 0.05, fill: { color: C.panneau }, line: { color: C.bordure, width: 1 } });
    s.addText('Votre interlocuteur', { x: 8.6, y: 1.65, w: 3.9, h: 0.4, fontFace: POLICE, fontSize: 11, color: C.gris, charSpacing: 2 });
    s.addText('Klocka', { x: 8.6, y: 2.1, w: 3.9, h: 0.5, fontFace: POLICE, fontSize: 20, color: C.ivoire });
    s.addText('Développeur de revenus immobiliers', { x: 8.6, y: 2.7, w: 3.9, h: 0.6, fontFace: POLICE, fontSize: 12, color: C.gris });
  }

  return pptx.write('nodebuffer');
}
