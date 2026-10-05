// La lettre d'intention d'achat (LOI), sur le modèle de l'équipe.
//
// Le modèle est celui de la lettre du 16/09/2026 pour le 1 avenue Mirabeau :
// l'acquéreur, le vendeur, l'identification de Klocka (fixe), l'offre, les
// conditions suspensives (financement, exclusivité et pièces, diagnostics),
// les modalités. Ce qui change d'une lettre à l'autre est un champ ; le reste
// est le texte de la maison, mot pour mot. La lettre sort en Word (docx),
// pour être retouchée avant d'être envoyée, ou en PDF (jsPDF) ; ni l'un ni
// l'autre n'a besoin d'un navigateur. AK la pose dans le chat, personne ne
// l'envoie à sa place.

import fs from 'fs';
import path from 'path';
import { CHEMIN_UPLOADS } from '../db.js';
import { finDeBail } from './outils.js';

/** Les champs sans lesquels la lettre ne se rédige pas, et leur question. */
export const CHAMPS_REQUIS = [
  ['acquereur_nom', "le nom de l'acquéreur (la personne qui signe)"],
  ['vendeur_societe', 'le vendeur (société ou nom)'],
  ['adresse_bien', 'l\'adresse du local'],
  ['prix', 'le prix FAI TTC'],
  ['apport', "l'apport"],
];

const UNITES = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function moinsDeCent(n) {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10); const u = n % 10;
  if (d === 7 || d === 9) return `${DIZAINES[d]}${u === 1 && d === 7 ? ' et ' : '-'}${UNITES[10 + u]}`;
  if (u === 0) return d === 8 ? 'quatre-vingts' : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

// « cents » ne prend son s qu'en fin de nombre : « trois cents », mais
// « trois cent cinq » et « deux cent mille ».
function moinsDeMille(n, final = true) {
  const c = Math.floor(n / 100); const r = n % 100;
  const cent = c === 0 ? '' : c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 && final ? 's' : ''}`;
  return [cent, r ? moinsDeCent(r) : ''].filter(Boolean).join(' ');
}

/** « 200 000 » → « deux cent mille ». Pure. Jusqu'aux milliards, ce qui suffit à des murs. */
export function enLettres(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'zéro';
  const parts = [];
  const milliards = Math.floor(n / 1e9); const millions = Math.floor((n % 1e9) / 1e6); const milliers = Math.floor((n % 1e6) / 1e3); const reste = n % 1e3;
  if (milliards) parts.push(`${moinsDeMille(milliards, false)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) parts.push(`${moinsDeMille(millions, false)} million${millions > 1 ? 's' : ''}`);
  if (milliers) parts.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers, false)} mille`);
  if (reste) parts.push(moinsDeMille(reste, true));
  return parts.join(' ');
}

const euros = (n) => `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} €`;
// Une date telle qu'on l'écrit : « 30/04/2032 » comme « 2032-04-30 ».
const jour = (d) => { if (!d) return ''; const x = d instanceof Date ? d : finDeBail(d) || new Date(d); return Number.isNaN(x.getTime()) ? String(d) : x.toLocaleDateString('fr-FR', { timeZone: 'UTC' }); };
const plusJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const html = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Les champs qui manquent, avec leur question. Pure. */
export function manquants(champs = {}) {
  return CHAMPS_REQUIS.filter(([cle]) => !champs[cle] && champs[cle] !== 0).map(([cle, question]) => ({ cle, question }));
}

/** Les champs complétés par leurs valeurs par défaut. Pure. */
export function completer(champs = {}) {
  return {
    lieu: 'Nice',
    date: new Date().toISOString().slice(0, 10),
    duree_ans: 20,
    taux: 4,
    validite: plusJours(7),
    limite_documents: plusJours(9),
    fin_exclusivite: plusJours(23),
    surface_m2: null,
    locataire: null,
    fin_bail: null,
    ...Object.fromEntries(Object.entries(champs).filter(([, v]) => v !== undefined && v !== null && v !== '')),
  };
}

/** « le prix est de **200 000 €** » → [{ t, gras }]. Pure. */
export function segments(texte) {
  return String(texte ?? '').split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((x) => (x.startsWith('**') && x.endsWith('**') ? { t: x.slice(2, -2), gras: true } : { t: x, gras: false }));
}

/** Les deux colonnes du haut : l'acquéreur, et le vendeur à qui la lettre s'adresse. Pure. */
export function parties(brut) {
  const c = completer(brut);
  return {
    acquereur: [['acquereur_nom', c.acquereur_nom], ['acquereur_societe', c.acquereur_societe], ['acquereur_adresse', c.acquereur_adresse]].filter(([, v]) => v),
    vendeur: [['vendeur_societe', c.vendeur_societe], ['vendeur_representant', c.vendeur_representant ? `Représentée par ${c.vendeur_representant}` : null], ['vendeur_adresse', c.vendeur_adresse]].filter(([, v]) => v),
  };
}

/** L'en-tête et le pied de chaque page. Pure. */
export function cadre(brut) {
  const c = completer(brut);
  const menthe = c.modele === 'menthe';
  return {
    titre: `Lettre d'intention d'achat · ${c.adresse_bien || ''}`,
    // « 1 avenue Mirabeau, 06000 Nice » → « 1 avenue Mirabeau, Nice » : le titre du modèle menthe.
    adresse_courte: String(c.adresse_bien || '').replace(/\b\d{5}\s+/g, '').replace(/\s+,/g, ',').trim(),
    date: jour(c.date),
    lieu_date: `À ${c.lieu}, le ${jour(c.date)}`,
    pied_gauche: menthe ? 'KLOCKA · 229 rue Saint-Honoré, 75001 Paris' : 'KLOCKA · Développeur de revenus immobiliers',
    pied_droite: [c.acquereur_nom, c.acquereur_societe].filter(Boolean).join(' · '),
  };
}

/** Les deux modèles de lettre : « classique » (v2, 16/09/2026) et « menthe » (1c, bande menthe). */
export const MODELES = ['classique', 'menthe'];

/**
 * La lettre, bloc par bloc, sur le modèle « Lettre d'intention - 1 avenue
 * Mirabeau v2 » : c'est la seule source. L'éditeur de la page Offres, l'HTML,
 * le PDF et le Word en sortent tous. Chaque bloc a sa clé : une retouche à la
 * main (`textes[cle]`) remplace son texte et survit aux changements de
 * champs. `**…**` met en gras. Pure.
 * Types : date, objet, h2 (avec `num`), h3, p, signatures.
 */
export function blocs(brut) {
  const c = completer(brut);
  const t = c.textes || {};
  const menthe = c.modele === 'menthe';
  const g = (x) => (menthe ? `**${x}**` : x);
  const num = (classique, m) => (menthe ? m : classique);
  const bloc = (cle, type, texte, extra = {}) => ({ cle, type, texte: t[cle] ?? texte, retouche: t[cle] != null, ...extra });
  const occupe = c.locataire
    ? `, actuellement loué à l'enseigne ${c.locataire}${c.fin_bail ? ` via un bail commercial arrivant à échéance le ${g(jour(c.fin_bail))}` : ' via un bail commercial'}`
    : ', actuellement loué via un bail commercial';
  return [
    bloc('date', 'date', `À ${c.lieu}, le ${jour(c.date)}`),
    bloc('objet', 'objet', `Objet : Lettre d'intention d'achat d'un local commercial situé au ${c.adresse_bien}`),
    bloc('h-conseil', 'h2', 'Identification du conseil', { num: num(null, '00') }),
    bloc('conseil-1', 'p', "L'acquéreur est assisté dans cette opération par le cabinet **KLOCKA**, société par actions simplifiée (SAS) au capital social de 1 000 € (mille euros), dont le siège social est situé au 229 rue Saint-Honoré, 75001 Paris, immatriculée au R.C.S de Paris sous le numéro 932 230 394 et représentée par Paul de ZULUETA Y DE BESSON en qualité de Président."),
    bloc('conseil-2', 'p', 'KLOCKA est titulaire de la carte professionnelle n° CPI75012024000000529 portant la mention « transactions sur immeubles et fonds de commerce ». Son assurance RCP et sa garantie sont souscrites auprès de GALIAN ASSURANCES, 89 rue La Boétie, 75008 Paris.'),
    bloc('h-offre', 'h2', "L'offre", { num: num('I.', '01') }),
    bloc('offre-1', 'p', `Je soussigné, ${c.acquereur_nom}, ai l'honneur de vous proposer l'achat d'un local commercial situé au **${c.adresse_bien}**.`),
    bloc('offre-2', 'p', `Il s'agit d'un local commercial${c.surface_m2 ? ` d'une surface totale d'environ ${g(`${String(c.surface_m2).replace('.', ',')} m²`)}` : ''}${occupe}.`),
    bloc('offre-3', 'p', `Le prix de vente FAI TTC proposé est de **${euros(c.prix)} (${enLettres(c.prix)} euros)**. Les honoraires de notre conseil, KLOCKA, seront également à notre charge.`),
    bloc('h-conditions', 'h2', 'Conditions suspensives', { num: num('II.', '02') }),
    bloc('h-financement', 'h3', '1. Financement'),
    bloc('financement', 'p', `Cette opération sera financée par un apport personnel de ${g(`${euros(c.apport)} (${enLettres(c.apport)} euros)`)} et au moyen d'un crédit bancaire d'une durée maximale de ${c.duree_ans} ans avec un taux cible de ${String(c.taux).replace('.', ',')}% (hors assurance).`),
    bloc('h-exclusivite', 'h3', '2. Exclusivité et Due Diligence'),
    bloc('exclusivite', 'p', `Une période d'exclusivité permettant la Due Diligence à accorder à l'acquéreur. Cette période s'achèvera le **${jour(c.fin_exclusivite)}**, sous réserve que l'ensemble des documents de la dataroom soient communiqués de façon exhaustive d'ici le **${jour(c.limite_documents)}**. L'offre pourra être confirmée à l'issue de cette période si l'analyse des documents s'avère satisfaisante et conforme, par mes conseils, à l'exécution de l'acquisition.`),
    bloc('pieces', 'p', `Le vendeur s'engage à mettre à disposition les quittances de loyers sur les 3 dernières années ainsi que la situation de compte avec les dates de règlement${c.locataire ? `, le Kbis de la société ${c.locataire}` : ''}, les plans cotés des locaux concernés par la vente et l'ensemble des diagnostics réglementaires dans le cadre de cette vente.`),
    bloc('confirmations', 'p', "Il confirmera l'absence de désordre ou de litige entre le locataire actuel et le propriétaire, ainsi que l'absence de travaux majeurs dans la copropriété à la charge de l'acquéreur. Il communiquera également les trois derniers procès-verbaux d'assemblée générale, le règlement de copropriété, qui ne devra indiquer aucune contradiction avec l'activité du preneur actuel, et le détail de la taxe foncière avec sa répartition et sa refacturation au preneur."),
    bloc('autres', 'p', "Plus généralement, le vendeur transmettra tout autre document nécessaire à l'analyse du présent projet."),
    bloc('h-diagnostics', 'h3', '3. Diagnostics'),
    bloc('diagnostics', 'p', 'La réalisation des diagnostics réglementaires ne révélant aucune non conformité majeure.'),
    bloc('h-modalites', 'h2', 'Modalités générales', { num: num('III.', '03') }),
    bloc('substitution', 'p', 'Je me réserve la faculté de me substituer toute structure (personne morale) dans laquelle je suis partie prenante.'),
    bloc('validite', 'p', `La présente offre est valable jusqu'au **${jour(c.validite)}**.`),
    bloc('salutations', 'p', "Nous vous prions d'agréer, Monsieur, l'expression de nos salutations distinguées."),
    { cle: 'signatures', type: 'signatures', gauche: [c.acquereur_nom, c.acquereur_societe].filter(Boolean), droite: [c.vendeur_societe, 'Bon pour accord'].filter(Boolean) },
  ];
}

const htmlGras = (texte) => segments(texte).map((s) => (s.gras ? `<b>${html(s.t)}</b>` : html(s.t))).join('');

/** La lettre en HTML, pour la relire hors de la page Offres. Pure. */
export function lettre(brut) {
  const c = completer(brut);
  const p = parties(c);
  const k = cadre(c);
  const style = `body{font-family:Montserrat,Arial,Helvetica,sans-serif;font-size:10.5pt;line-height:1.6;color:#2a2a2a;margin:0;padding:0 14mm}
    p{margin:0 0 9px} h2{font-size:15pt;font-weight:500;color:#1d1d1d;margin:26px 0 10px} h2.conseil{color:#7fa898} h2 span{color:#7fa898;font-size:9pt;margin-right:8px}
    h3{font-size:10.5pt;margin:14px 0 4px} .haut{display:flex;justify-content:space-between;gap:24px} .attention{background:#eff3f1;padding:12px 18px}
    .label{font-size:8pt;letter-spacing:.18em;color:#777} .date{text-align:right;color:#555} .objet{font-size:14pt;border-top:1px solid #ddd;border-bottom:1px solid #ddd;padding:10px 0;margin:16px 0}
    .signatures{display:flex;gap:28px;margin-top:30px} .signatures div{flex:1}`;
  const corps = [
    `<div class="haut"><div><p class="label">ACQUÉREUR</p>${p.acquereur.map(([cle, v], i) => `<p>${i === 0 ? `<b>${html(v)}</b>` : html(v)}</p>`).join('')}</div>`,
    `<div class="attention"><p class="label">À L'ATTENTION DE</p>${p.vendeur.map(([, v], i) => `<p>${i === 0 ? `<b>${html(v)}</b>` : html(v)}</p>`).join('')}</div></div>`,
  ];
  for (const b of blocs(c)) {
    if (b.type === 'date') corps.push(`<p class="date">${html(b.texte)}</p>`);
    else if (b.type === 'objet') corps.push(`<p class="objet">${html(b.texte)}</p>`);
    else if (b.type === 'h2') corps.push(`<h2${b.num ? '' : ' class="conseil"'}>${b.num ? `<span>${html(b.num)}</span>` : ''}${html(b.texte)}</h2>`);
    else if (b.type === 'h3') corps.push(`<h3>${html(b.texte)}</h3>`);
    else if (b.type === 'signatures') corps.push(`<div class="signatures"><div>${b.gauche.map((l, i) => `<p>${i === 0 ? `<b>${html(l)}</b>` : html(l)}</p>`).join('')}<p class="label">SIGNATURE</p></div><div>${b.droite.map((l, i) => `<p>${i === 0 ? `<b>${html(l)}</b>` : html(l)}</p>`).join('')}<p class="label">DATE ET SIGNATURE</p></div></div>`);
    else corps.push(`<p>${htmlGras(b.texte)}</p>`);
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${html(k.titre)}</title><style>${style}</style></head><body>${corps.join('\n')}</body></html>`;
}

/**
 * Le K de Klocka (public/logo-k-klocka.png), en vecteurs : le fût et la
 * barre fine en noir, le jambage arrondi en menthe. Relevé sur l'image de
 * 625 px ; le fût fait 487 px de haut. `h` : la hauteur voulue, en mm.
 */
export function logoK(d, x, y, h) {
  const k = h / 487;
  const P = ([px, py]) => [x + px * k, y + py * k];
  // Un polygone, avec ses courbes : chaque segment est relatif au point d'avant.
  const forme = (depart, segments, couleur) => {
    const [x0, y0] = P(depart);
    let cx = x0; let cy = y0;
    const rel = segments.map((seg) => {
      const pts = [];
      for (let i = 0; i < seg.length; i += 2) pts.push(P([seg[i], seg[i + 1]]));
      const r = pts.flatMap(([a, b]) => [a - cx, b - cy]);
      [cx, cy] = pts.at(-1);
      return r;
    });
    d.setFillColor(...couleur);
    d.lines(rel, x0, y0, [1, 1], 'F', true);
  };
  d.setFillColor(0, 0, 0);
  d.rect(x, y, 82 * k, 487 * k, 'F');
  forme([376, 0], [[401, 0], [151, 225], [128, 225]], [0, 0, 0]);
  forme([104, 250], [[214, 250], [241, 250, 258, 260, 271, 277], [416, 487], [321, 487], [176, 282], [168, 270, 161, 267, 148, 267], [104, 267]], [114, 205, 186]);
}

/**
 * La lettre en PDF, écrite par jsPDF : pas de navigateur, rien à installer
 * sur le serveur. A4, Helvetica, en-tête et pied sur chaque page, les deux
 * colonnes du haut, les titres numérotés, les cadres de signature. Rend le
 * tampon.
 */
export async function pdf(brut) {
  const { jsPDF } = await import('jspdf');
  const c = completer(brut);
  if (c.modele === 'menthe') return pdfMenthe(c, jsPDF);
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  const G = 18; const D = 192; const LARGEUR = D - G; const HAUT = 30; const BAS = 270;
  const VERT = [127, 168, 152]; const ENCRE = [42, 42, 42]; const GRIS = [110, 110, 110];
  const k = cadre(c);
  let y = HAUT;
  const police = (style = 'normal', taille = 10, couleur = ENCRE) => { d.setFont('helvetica', style); d.setFontSize(taille); d.setTextColor(...couleur); };
  const decor = () => {
    logoK(d, G, 9.6, 5.8);
    police('normal', 8.5, GRIS); d.text(d.splitTextToSize(k.titre, 120)[0], G + 8, 14);
    police('bold', 8.5, VERT); d.text(k.date, D, 14, { align: 'right' });
    d.setDrawColor(225, 225, 225); d.line(0, 19, 210, 19); d.line(0, 283, 210, 283);
    police('normal', 7.5, GRIS); d.text(k.pied_gauche, G, 289); d.text(k.pied_droite, D, 289, { align: 'right' });
  };
  decor();
  const place = (h) => { if (y + h > BAS) { d.addPage(); decor(); y = HAUT; } };
  // Un paragraphe aux mots gras ou non : les mots se posent un à un.
  const riche = (texte, { taille = 10, interligne = 5.4, apres = 3.5, x0 = G, largeur = LARGEUR } = {}) => {
    // Les espaces insécables (« 200 000 € ») : Helvetica ne les a pas. Ils
    // tiennent les mots ensemble pendant la coupe, puis s'écrivent en espace.
    const mots = segments(texte).flatMap((s) => s.t.replace(/[\u202f\u00a0]/g, '\uE000').split(/(\s+)/).filter((m) => m !== '').map((m) => ({ m: m.replace(/\uE000/g, ' '), gras: s.gras })));
    let ligne = []; let l = 0;
    const poser = () => {
      place(interligne);
      let x = x0;
      for (const w of ligne) { police(w.gras ? 'bold' : 'normal', taille); d.text(w.m, x, y); x += d.getTextWidth(w.m); }
      y += interligne; ligne = []; l = 0;
    };
    for (const w of mots) {
      police(w.gras ? 'bold' : 'normal', taille);
      const lw = d.getTextWidth(w.m);
      if (/^\s+$/.test(w.m)) { if (ligne.length) { ligne.push(w); l += lw; } continue; }
      if (l + lw > largeur && ligne.length) { while (ligne.length && /^\s+$/.test(ligne.at(-1).m)) ligne.pop(); poser(); }
      ligne.push(w); l += lw;
    }
    if (ligne.length) poser();
    y += apres;
  };
  // Les deux colonnes du haut.
  const p = parties(c);
  const colonne = (lignes, x, largeur) => {
    let yy = y + 6;
    for (const [i, [, v]] of lignes.entries()) for (const l of d.splitTextToSize(String(v), largeur)) { police(i === 0 ? 'bold' : 'normal', 10, i === 2 ? GRIS : ENCRE); d.text(l, x, yy); yy += 5.2; }
    return yy;
  };
  police('normal', 7, GRIS); d.text('ACQUÉREUR', G, y);
  const finG = colonne(p.acquereur, G, 78);
  const xD = 112;
  const hD = 12 + p.vendeur.reduce((n, [, v]) => n + d.splitTextToSize(String(v), 70).length * 5.2, 0);
  d.setFillColor(239, 243, 241); d.rect(xD - 4, y - 5, D - xD + 4, hD, 'F');
  police('normal', 7, GRIS); d.text("À L'ATTENTION DE", xD, y);
  const finD = colonne(p.vendeur, xD, 70);
  y = Math.max(finG, finD) + 6;
  for (const b of blocs(c)) {
    if (b.type === 'date') { police('normal', 10, GRIS); place(6); d.text(b.texte, D, y, { align: 'right' }); y += 10; }
    else if (b.type === 'objet') {
      d.setDrawColor(225, 225, 225); d.line(G, y - 4, D, y - 4);
      police('normal', 13, [20, 20, 20]);
      for (const l of d.splitTextToSize(b.texte, LARGEUR)) { place(6.5); d.text(l, G, y + 2); y += 6.5; }
      d.line(G, y + 1, D, y + 1); y += 12;
    }
    else if (b.type === 'h2') {
      y += 4; place(12);
      let x = G;
      if (b.num) { police('bold', 8, VERT); d.text(b.num, x, y); x += d.getTextWidth(b.num) + 3; }
      police('normal', 14, b.num ? [20, 20, 20] : VERT); d.text(b.texte, x, y); y += 9;
    }
    else if (b.type === 'h3') { y += 1; place(6); police('bold', 10, [20, 20, 20]); d.text(b.texte, G, y); y += 6; }
    else if (b.type === 'signatures') {
      y += 6; place(40);
      const box = (lignes, x, sous) => {
        let yy = y;
        for (const [i, l] of lignes.entries()) { police(i === 0 ? 'bold' : 'normal', 10, i === 0 ? ENCRE : GRIS); d.text(String(l), x, yy); yy += 5.2; }
        d.setDrawColor(225, 225, 225); d.rect(x, yy + 1, 80, 26);
        police('normal', 6.5, VERT); d.text(sous, x + 3, yy + 24);
      };
      box(b.gauche, G, 'SIGNATURE'); box(b.droite, 112, 'DATE ET SIGNATURE');
      y += 40;
    }
    else riche(b.texte);
  }
  return Buffer.from(d.output('arraybuffer'));
}

/**
 * La lettre en Word (.docx), pour qu'on la retouche avant de l'envoyer :
 * mêmes blocs, en-tête et pied de page, les deux colonnes du haut en
 * tableau, le gras du modèle. Le PDF reste disponible.
 */
export async function docx(brut) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Footer, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = await import('docx');
  const c = completer(brut);
  if (c.modele === 'menthe') return docxMenthe(c);
  // Le K de Klocka en tête ; sans le fichier, la lettre sort quand même.
  let logo = null;
  try { logo = new ImageRun({ type: 'png', data: fs.readFileSync(new URL('../../public/logo-k-klocka.png', import.meta.url)), transformation: { width: 22, height: 22 } }); } catch { logo = null; }
  const k = cadre(c);
  const VERT = '7FA898'; const GRIS = '6E6E6E';
  const run = (texte, { gras = false, couleur = null, taille = 20, espace = null } = {}) => new TextRun({ text: String(texte), bold: gras, color: couleur || undefined, font: 'Arial', size: taille, ...(espace ? { characterSpacing: espace } : {}) });
  const para = (runs, { align = AlignmentType.LEFT, avant = 0, apres = 120 } = {}) =>
    new Paragraph({ children: Array.isArray(runs) ? runs : [runs], alignment: align, spacing: { before: avant, after: apres, line: 320 } });
  const sansBord = { top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }, right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' } };
  const p = parties(c);
  const cellule = (label, lignes, fond = null) => new TableCell({
    width: { size: 50, type: WidthType.PERCENTAGE }, borders: sansBord,
    ...(fond ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: fond } } : {}),
    margins: { top: 120, bottom: 120, left: 160, right: 160 },
    children: [para(run(label, { taille: 15, couleur: GRIS, espace: 40 }), { apres: 80 }), ...lignes.map(([, v], i) => para(run(v, { gras: i === 0, couleur: i === 2 ? GRIS : null }), { apres: 0 }))],
  });
  const enfants = [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: sansBord, rows: [new TableRow({ children: [cellule('ACQUÉREUR', p.acquereur), cellule("À L'ATTENTION DE", p.vendeur, 'EFF3F1')] })] })];
  for (const b of blocs(c)) {
    if (b.type === 'date') enfants.push(para(run(b.texte, { couleur: GRIS }), { align: AlignmentType.RIGHT, avant: 240, apres: 240 }));
    else if (b.type === 'objet') enfants.push(para(run(b.texte, { taille: 26 }), { avant: 120, apres: 360 }));
    else if (b.type === 'h2') enfants.push(para([...(b.num ? [run(`${b.num}  `, { gras: true, couleur: VERT, taille: 16 })] : []), run(b.texte, { taille: 28, couleur: b.num ? null : VERT })], { avant: 360, apres: 160 }));
    else if (b.type === 'h3') enfants.push(para(run(b.texte, { gras: true }), { avant: 160, apres: 80 }));
    else if (b.type === 'signatures') {
      enfants.push(para(run(''), { apres: 240 }));
      const bloc = (lignes, sous) => new TableCell({ width: { size: 50, type: WidthType.PERCENTAGE }, borders: sansBord, children: [...lignes.map((l, i) => para(run(l, { gras: i === 0, couleur: i === 0 ? null : GRIS }), { apres: 0 })), para(run(''), { apres: 900 }), para(run(sous, { taille: 14, couleur: VERT, espace: 40 }))] });
      enfants.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: sansBord, rows: [new TableRow({ children: [bloc(b.gauche, 'SIGNATURE'), bloc(b.droite, 'DATE ET SIGNATURE')] })] }));
    }
    else enfants.push(para(segments(b.texte).map((s) => run(s.t, { gras: s.gras }))));
  }
  const doc = new Document({
    creator: 'Klocka',
    title: k.titre,
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 1300, bottom: 1200, left: 1020, right: 1020 } } },
      headers: { default: new Header({ children: [para([logo || run('K', { gras: true, taille: 24 }), run('   '), run(k.titre, { couleur: GRIS, taille: 16 }), run(`      ${k.date}`, { gras: true, couleur: VERT, taille: 16 })])] }) },
      footers: { default: new Footer({ children: [para([run(k.pied_gauche, { couleur: GRIS, taille: 14 }), run(`      ${k.pied_droite}`, { couleur: GRIS, taille: 14 })])] }) },
      children: enfants,
    }],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------
// Le modèle « menthe » (Lettre d'intention - 1c bande menthe) : le K de
// Klocka en tête, la date à droite sur un filet noir, le titre et l'adresse
// en menthe, des sections numérotées 00 à 03 en grands chiffres fins, des
// lignes de signature, une bande menthe au pied de chaque page.
// ---------------------------------------------------------------------------

const MENTHE = [143, 178, 168];

function pdfMenthe(c, jsPDF) {
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  const G = 18; const D = 192; const LARGEUR = D - G; const BAS = 268; const HAUT = 20;
  const XT = 45; const LT = D - XT; // la colonne du texte, à droite des numéros
  const ENCRE = [42, 42, 42]; const NOIR = [22, 22, 22]; const GRIS = [110, 110, 110];
  const k = cadre(c);
  let y;
  const police = (style = 'normal', taille = 10, couleur = ENCRE) => { d.setFont('helvetica', style); d.setFontSize(taille); d.setTextColor(...couleur); };
  const pied = () => {
    police('normal', 7.5, GRIS); d.text(k.pied_gauche, G, 280); d.text(k.pied_droite, D, 280, { align: 'right' });
    d.setFillColor(...MENTHE); d.rect(G, 283, LARGEUR, 4, 'F');
  };
  const nouvellePage = () => { d.addPage(); pied(); y = HAUT; d.setDrawColor(230, 230, 230); d.line(G, y - 4, D, y - 4); y += 4; };
  const place = (h) => { if (y + h > BAS) nouvellePage(); };
  const riche = (texte, { taille = 10, interligne = 5.4, apres = 3.2, x0 = XT, largeur = LT } = {}) => {
    const mots = segments(texte).flatMap((s) => s.t.replace(/[\u202f\u00a0]/g, '\uE000').split(/(\s+)/).filter((m) => m !== '').map((m) => ({ m: m.replace(/\uE000/g, ' '), gras: s.gras })));
    let ligne = []; let l = 0;
    const poser = () => {
      place(interligne);
      let x = x0;
      for (const w of ligne) { police(w.gras ? 'bold' : 'normal', taille, w.gras ? NOIR : ENCRE); d.text(w.m, x, y); x += d.getTextWidth(w.m); }
      y += interligne; ligne = []; l = 0;
    };
    for (const w of mots) {
      police(w.gras ? 'bold' : 'normal', taille);
      const lw = d.getTextWidth(w.m);
      if (/^\s+$/.test(w.m)) { if (ligne.length) { ligne.push(w); l += lw; } continue; }
      if (l + lw > largeur && ligne.length) { while (ligne.length && /^\s+$/.test(ligne.at(-1).m)) ligne.pop(); poser(); }
      ligne.push(w); l += lw;
    }
    if (ligne.length) poser();
    y += apres;
  };
  pied();
  // L'en-tête : le K de Klocka, la date, le filet noir.
  logoK(d, G, 10, 11);
  police('normal', 10, GRIS); d.text(k.lieu_date, D, 18, { align: 'right' });
  d.setDrawColor(...NOIR); d.setLineWidth(0.6); d.line(G, 25, D, 25); d.setLineWidth(0.2);
  // Les parties.
  const p = parties(c);
  y = 34;
  const colonne = (lignes, x, depart, largeur) => {
    let yy = depart;
    for (const [i, [, v]] of lignes.entries()) for (const l of d.splitTextToSize(String(v), largeur)) { police(i === 0 ? 'bold' : 'normal', 10, i === lignes.length - 1 && i > 0 ? GRIS : i === 0 ? NOIR : ENCRE); d.text(l, x, yy); yy += 5.4; }
    return yy;
  };
  const finG = colonne(p.acquereur, G, y, 80);
  police('normal', 10, GRIS); d.text("À l'attention de", 108, y);
  const finD = colonne(p.vendeur, 108, y + 5.4, 84);
  y = Math.max(finG, finD) + 10;
  // Le titre et l'adresse.
  police('bold', 20, NOIR); d.text("Lettre d'intention d'achat", G, y); y += 8.5;
  police('bold', 20, MENTHE); for (const l of d.splitTextToSize(k.adresse_courte, LARGEUR)) { d.text(l, G, y); y += 8.5; }
  y += 1;
  const blocsC = blocs(c).filter((b) => !['date', 'objet'].includes(b.type));
  for (const b of blocsC) {
    if (b.type === 'h2') {
      place(24);
      d.setDrawColor(230, 230, 230); d.line(G, y, D, y); y += 9;
      police('normal', 26, MENTHE); d.text(b.num || '', G, y + 2);
      police('bold', 12, NOIR); d.text(b.texte, XT, y); y += 7;
    } else if (b.type === 'h3') {
      place(8); police('normal', 7.5, GRIS); d.text(String(b.texte).toUpperCase(), XT, y, { charSpace: 0.5 }); y += 5;
    } else if (b.type === 'signatures') {
      place(40);
      d.setDrawColor(230, 230, 230); d.line(G, y, D, y); y += 10;
      const sign = (lignes, x) => {
        let yy = y;
        for (const [i, l] of lignes.entries()) { police(i === 0 ? 'bold' : 'normal', 10, i === 0 ? NOIR : GRIS); d.text(String(l), x, yy); yy += 5.4; }
        d.setDrawColor(...NOIR); d.line(x, yy + 18, x + 80, yy + 18);
        police('normal', 7.5, MENTHE); d.text('Signature', x, yy + 23);
      };
      sign(b.gauche, G); sign(b.droite, 108);
      y += 40;
    } else if (b.cle === 'salutations') {
      // Les salutations sortent des sections, sur toute la largeur.
      y += 4; riche(b.texte, { x0: G, largeur: LARGEUR, apres: 4 });
    } else riche(b.texte);
  }
  return Buffer.from(d.output('arraybuffer'));
}

async function docxMenthe(c) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Footer, Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType } = await import('docx');
  const k = cadre(c);
  const VERT = '8FB2A8'; const GRIS = '6E6E6E'; const NOIR = '161616';
  const run = (texte, { gras = false, couleur = null, taille = 20, espace = null, maj = false } = {}) => new TextRun({ text: String(texte), bold: gras, color: couleur || undefined, font: 'Arial', size: taille, allCaps: maj, ...(espace ? { characterSpacing: espace } : {}) });
  const para = (runs, { align = AlignmentType.LEFT, avant = 0, apres = 120, bas = null } = {}) =>
    new Paragraph({ children: Array.isArray(runs) ? runs : [runs], alignment: align, spacing: { before: avant, after: apres, line: 320 }, ...(bas ? { border: { bottom: bas } } : {}) });
  const aucun = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const sansBord = { top: aucun, bottom: aucun, left: aucun, right: aucun };
  const cellule = (enfants, largeur) => new TableCell({ width: { size: largeur, type: WidthType.PERCENTAGE }, borders: sansBord, children: enfants });
  const tableau = (cellules) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: { ...sansBord, insideHorizontal: aucun, insideVertical: aucun }, rows: [new TableRow({ children: cellules })] });
  const p = parties(c);
  // Le K de Klocka en tête ; sans le fichier, la lettre sort quand même.
  let logo = null;
  try { logo = new ImageRun({ type: 'png', data: fs.readFileSync(new URL('../../public/logo-k-klocka.png', import.meta.url)), transformation: { width: 56, height: 56 } }); } catch { logo = null; }
  const enfants = [
    tableau([
      cellule([para(logo || run('K', { gras: true, taille: 36, couleur: NOIR }), { apres: 0 })], 60),
      cellule([para(run(k.lieu_date, { couleur: GRIS }), { align: AlignmentType.RIGHT, avant: 120 })], 40),
    ]),
    para(run(''), { apres: 240, bas: { style: BorderStyle.SINGLE, size: 12, color: NOIR } }),
    tableau([
      cellule(p.acquereur.map(([, v], i) => para(run(v, { gras: i === 0, couleur: i === 2 ? GRIS : null }), { apres: 0 })), 50),
      cellule([para(run("À l'attention de", { couleur: GRIS }), { apres: 0 }), ...p.vendeur.map(([, v], i) => para(run(v, { gras: i === 0, couleur: i === p.vendeur.length - 1 && i > 0 ? GRIS : null }), { apres: 0 }))], 50),
    ]),
    para(run("Lettre d'intention d'achat", { gras: true, taille: 40, couleur: NOIR }), { avant: 480, apres: 0 }),
    para(run(k.adresse_courte, { gras: true, taille: 40, couleur: VERT }), { apres: 240, bas: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6' } }),
  ];
  // Une section : le grand numéro à gauche, le titre et le texte à droite.
  let section = null;
  const fermer = () => {
    if (!section) return;
    enfants.push(tableau([cellule([para(run(section.num, { taille: 52, couleur: VERT }), { apres: 0 })], 14), cellule(section.contenu, 86)]));
    enfants.push(para(run(''), { apres: 120, bas: { style: BorderStyle.SINGLE, size: 4, color: 'E6E6E6' } }));
    section = null;
  };
  for (const b of blocs(c)) {
    if (['date', 'objet'].includes(b.type)) continue;
    if (b.type === 'h2') { fermer(); section = { num: b.num || '', contenu: [para(run(b.texte, { gras: true, taille: 24, couleur: NOIR }), { avant: 120, apres: 120 })] }; continue; }
    if (b.cle === 'salutations') { fermer(); enfants.push(para(segments(b.texte).map((x) => run(x.t, { gras: x.gras })), { avant: 240, apres: 360 })); continue; }
    if (b.type === 'signatures') {
      const sign = (lignes) => cellule([...lignes.map((l, i) => para(run(l, { gras: i === 0, couleur: i === 0 ? null : GRIS }), { apres: 0 })), para(run(''), { apres: 700, bas: { style: BorderStyle.SINGLE, size: 6, color: NOIR } }), para(run('Signature', { taille: 15, couleur: VERT }))], 50);
      enfants.push(tableau([sign(b.gauche), sign(b.droite)]));
      continue;
    }
    if (!section) continue;
    if (b.type === 'h3') section.contenu.push(para(run(b.texte, { taille: 15, couleur: GRIS, espace: 40, maj: true }), { avant: 100, apres: 60 }));
    else section.contenu.push(para(segments(b.texte).map((x) => run(x.t, { gras: x.gras, couleur: x.gras ? NOIR : null }))));
  }
  fermer();
  const doc = new Document({
    creator: 'Klocka',
    title: k.titre,
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: { page: { margin: { top: 1000, bottom: 1300, left: 1020, right: 1020 } } },
      footers: { default: new Footer({ children: [
        para([run(k.pied_gauche, { couleur: GRIS, taille: 14 }), run(`      ${k.pied_droite}`, { couleur: GRIS, taille: 14 })], { apres: 60 }),
        new Paragraph({ children: [run(' ', { taille: 8 })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: VERT } }),
      ] }) },
      children: enfants,
    }],
  });
  return Packer.toBuffer(doc);
}

/**
 * La lettre écrite dans les uploads, en Word par défaut (on la retouche),
 * en PDF si on le demande. Rend son chemin et son adresse.
 */
export async function produire(champs, { format = 'docx' } = {}) {
  const contenu = format === 'pdf' ? await pdf(champs) : await docx(champs);
  const dossier = path.join(CHEMIN_UPLOADS, 'loi');
  fs.mkdirSync(dossier, { recursive: true });
  const nom = `LOI ${String(champs.adresse_bien || 'local').replace(/[^\p{L}\p{N} .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)} ${new Date().toISOString().slice(0, 10)}.${format === 'pdf' ? 'pdf' : 'docx'}`;
  const chemin = path.join(dossier, nom);
  fs.writeFileSync(chemin, contenu);
  return { chemin, nom, url: `/uploads/loi/${encodeURIComponent(nom)}`, format: format === 'pdf' ? 'pdf' : 'docx' };
}

/** Ce que le projet sait déjà : l'adresse, la surface, le locataire, le bail, le prix. Pure. */
export function champsDepuisProjet(p) {
  const nombre = (...v) => v.find((x) => typeof x === 'number' && x > 0) ?? null;
  const adresse = [p?.adresse_complete, p?.adresse_complete && p?.ville_secteur_champ1 && !String(p.adresse_complete).toLowerCase().includes(String(p.ville_secteur_champ1).toLowerCase()) ? p.ville_secteur_champ1 : null].filter(Boolean).join(', ');
  return {
    adresse_bien: adresse || p?.ville_secteur_champ1 || null,
    surface_m2: nombre(p?.surface_m2, p?.sim_surface),
    locataire: p?.nom_locataire || null,
    fin_bail: p?.echeance_bail || null,
    prix: nombre(p?.prix_acquisition, p?.sim_prix_bien_negocie, p?.sim_prix_bien_fai),
  };
}

/** Ce que le dossier sait déjà : l'adresse, la surface, le locataire, le bail, le prix. Pure. */
export function champsDepuisDeal(deal) {
  const l = deal?.lots?.[0]?.lot || {};
  const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
  const a = val(l.adresse) || {};
  const adresse = typeof a === 'string' ? a : [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    adresse_bien: adresse || null,
    surface_m2: val(l.surface_m2) || null,
    locataire: val(l.locataire_nom) || null,
    fin_bail: val(l.bail_echeance) || null,
    prix: val(l.prix_fai) || null,
  };
}
