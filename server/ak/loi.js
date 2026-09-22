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

/**
 * La lettre, bloc par bloc : c'est la seule source. L'HTML (pour relire à
 * l'écran) et le PDF (pour envoyer) en sortent tous deux. Pure.
 * Types : entete (lignes à gauche), droite (lignes à droite), objet, h2, h3,
 * p, li (avec `html` pour la mise en forme, `texte` pour le PDF), signature.
 */
export function blocs(brut) {
  const c = completer(brut);
  const acquereur = [c.acquereur_nom, c.acquereur_societe, c.acquereur_adresse].filter(Boolean);
  const vendeur = ["À l'attention de :", c.vendeur_societe, c.vendeur_representant ? `Représentée par ${c.vendeur_representant}` : null, c.vendeur_adresse].filter(Boolean);
  const bien = [
    `Désignation du bien : Il s'agit d'un local commercial${c.surface_m2 ? ` d'une surface totale d'environ ${String(c.surface_m2).replace('.', ',')} m²` : ''},`,
    c.locataire ? `Local actuellement loué à l'enseigne ${c.locataire}${c.fin_bail ? ` via un bail commercial arrivant à échéance le ${jour(c.fin_bail)}` : ' via un bail commercial'}` : 'Local actuellement loué via un bail commercial',
  ];
  const prix = `Le prix de vente FAI TTC proposé est de ${euros(c.prix)} (${enLettres(c.prix)} euros).`;
  const li = (t, extra = {}) => ({ type: 'li', texte: t, ...extra });
  return [
    { type: 'entete', lignes: acquereur },
    { type: 'droite', lignes: vendeur },
    { type: 'droite', lignes: [`À ${c.lieu}, le ${jour(c.date)}`] },
    { type: 'objet', texte: `Objet : Lettre d'intention d'achat d'un local commercial situé au ${c.adresse_bien}` },
    { type: 'h2', texte: 'IDENTIFICATION DU CONSEIL' },
    { type: 'p', texte: "L'acquéreur est assisté dans cette opération par le cabinet :" },
    li('La société KLOCKA'),
    li('Forme juridique : Société par action simplifiée (SAS) au capital social de 1 000 € (mille euros).'),
    li('Siège social : 229 rue Saint-Honoré, 75001 Paris.'),
    li('Immatriculation : R.C.S de Paris sous le numéro 932 230 394.'),
    li('Représentation : Représentée par Paul de ZULUETA Y DE BESSON en qualité de Président.'),
    li('Carte Professionnelle : n° CPI75012024000000529 portant la mention « transactions sur immeubles et fonds de commerce ».'),
    li('Assurance RCP et Garantie : GALIAN ASSURANCES, 89 rue La Boétie, 75008 Paris.'),
    { type: 'h2', texte: "I. L'OFFRE" },
    { type: 'p', texte: `Je soussigné, ${c.acquereur_nom}, ai l'honneur de vous proposer l'achat d'un local commercial situé à l'adresse suivante : ${c.adresse_bien}` },
    ...bien.map((t) => li(t)),
    li(prix, { gras: true }),
    { type: 'p', texte: 'À noter : Les honoraires de notre conseil, KLOCKA, seront également à notre charge.' },
    { type: 'h2', texte: 'II. CONDITIONS SUSPENSIVES' },
    { type: 'h3', texte: 'II.1. Financement :' },
    { type: 'p', texte: `Cette opération sera financée par un apport personnel de ${euros(c.apport)} (${enLettres(c.apport)} euros) et au moyen d'un crédit bancaire d'une durée maximale de ${c.duree_ans} ans avec un taux cible de ${String(c.taux).replace('.', ',')}% (hors assurance).` },
    { type: 'h3', texte: 'II.2. Exclusivité et Due Diligence :' },
    { type: 'p', texte: `Une période d'exclusivité permettant la Due Diligence à accorder à l'acquéreur. Cette période s'achèvera le ${jour(c.fin_exclusivite)}, sous réserve que l'ensemble des documents de la dataroom soient communiqués de façon exhaustive d'ici le ${jour(c.limite_documents)}. L'offre pourra être confirmée à l'issue de cette période si l'analyse des documents s'avère satisfaisante et conforme, par mes conseils, à l'exécution de l'acquisition.` },
    { type: 'p', texte: "Le vendeur s'engage à mettre à disposition :" },
    li('Les quittances de loyers sur les 3 dernières années et la situation de compte avec les dates de règlement.'),
    li("La confirmation d'absence de désordre ou litige entre le locataire actuel et le propriétaire."),
    li("La confirmation d'absence de travaux majeurs dans la copropriété à la charge de l'acquéreur."),
    li("Les trois derniers procès-verbaux d'assemblée générale"),
    li("Le règlement de copropriété n'indiquant aucune contradiction avec l'activité du preneur actuel."),
    li('Le détail de la taxe foncière et de sa répartition et refacturation avec le preneur'),
    li('Les plans cotés des locaux concernés par la vente'),
    ...(c.locataire ? [li(`Le Kbis de la société ${c.locataire}`)] : []),
    li('Transmettre tous les diagnostics réglementaires dans le cadre de cette vente'),
    li("Tout autre document nécessaire à l'analyse du présent projet"),
    { type: 'h3', texte: 'II.3. Diagnostics :' },
    { type: 'p', texte: 'La réalisation des diagnostics réglementaires ne révélant aucune non conformité majeure.' },
    { type: 'h2', texte: 'III. MODALITÉS GÉNÉRALES' },
    { type: 'p', texte: 'Clause de substitution : Je me réserve la faculté de me substituer toute structure (personne morale) dans laquelle je suis partie prenante.' },
    { type: 'p', texte: `Validité de l'offre : La présente offre est valable jusqu'au ${jour(c.validite)}.` },
    { type: 'p', texte: "Nous vous prions d'agréer, Monsieur, l'expression de nos salutations distinguées." },
    { type: 'signature', lignes: [c.acquereur_nom, c.acquereur_societe].filter(Boolean) },
  ];
}

/** La lettre en HTML, pour la relire à l'écran. Pure. */
export function lettre(brut) {
  const c = completer(brut);
  const style = `body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#111;margin:0;padding:0 8mm}
    p{margin:0 0 8px} h2{font-size:11pt;color:#1f3a68;margin:22px 0 8px} h3{font-size:11pt;color:#1f3a68;margin:16px 0 6px}
    .droite{text-align:right} ul{margin:4px 0 10px 18px;padding:0} li{margin:2px 0} .signature{margin-top:36px;text-align:right} .objet{font-weight:bold;margin:26px 0 18px}`;
  const corps = [];
  let liste = [];
  const fermer = () => { if (liste.length) { corps.push(`<ul>${liste.join('')}</ul>`); liste = []; } };
  for (const b of blocs(c)) {
    if (b.type === 'li') { liste.push(`<li>${b.gras ? `<b>${html(b.texte)}</b>` : html(b.texte)}</li>`); continue; }
    fermer();
    if (b.type === 'entete') corps.push(`<p>${b.lignes.map(html).join('<br>')}</p>`);
    else if (b.type === 'droite') corps.push(`<p class="droite">${b.lignes.map(html).join('<br>')}</p>`);
    else if (b.type === 'objet') corps.push(`<p class="objet">${html(b.texte)}</p>`);
    else if (b.type === 'h2' || b.type === 'h3') corps.push(`<${b.type}>${html(b.texte)}</${b.type}>`);
    else if (b.type === 'signature') corps.push(`<p class="signature">${b.lignes.map(html).join('<br>')}</p>`);
    else corps.push(`<p>${html(b.texte)}</p>`);
  }
  fermer();
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>LOI ${html(c.adresse_bien)}</title><style>${style}</style></head><body>${corps.join('\n')}</body></html>`;
}

/**
 * La lettre en PDF, écrite par jsPDF : pas de navigateur, rien à installer
 * sur le serveur. A4, Helvetica, marges de 20 mm, saut de page quand il faut.
 * Rend le tampon.
 */
export async function pdf(brut) {
  const { jsPDF } = await import('jspdf');
  const d = new jsPDF({ unit: 'mm', format: 'a4' });
  const G = 20; const D = 190; const LARGEUR = D - G; const BAS = 277;
  const BLEU = [31, 58, 104];
  let y = 22;
  const police = (style = 'normal', taille = 11, couleur = [17, 17, 17]) => { d.setFont('helvetica', style); d.setFontSize(taille); d.setTextColor(...couleur); };
  const place = (h) => { if (y + h > BAS) { d.addPage(); y = 22; } };
  const lignes = (texte, largeur) => d.splitTextToSize(String(texte), largeur);
  const paragraphe = (texte, { style = 'normal', x = G, largeur = LARGEUR, apres = 3, interligne = 5.2, couleur } = {}) => {
    police(style, 11, couleur);
    for (const l of lignes(texte, largeur)) { place(interligne); d.text(l, x, y); y += interligne; }
    y += apres;
  };
  const droite = (liste, { style = 'normal', apres = 3 } = {}) => {
    police(style);
    for (const l of liste) { place(5.2); d.text(String(l), D, y, { align: 'right' }); y += 5.2; }
    y += apres;
  };
  for (const b of blocs(brut)) {
    if (b.type === 'entete') { for (const l of b.lignes) paragraphe(l, { apres: 0 }); y += 8; }
    else if (b.type === 'droite') droite(b.lignes, { apres: 2 });
    else if (b.type === 'objet') { y += 6; paragraphe(b.texte, { style: 'bold', apres: 6 }); }
    else if (b.type === 'h2') { y += 4; paragraphe(b.texte, { style: 'bold', apres: 2, couleur: BLEU }); }
    else if (b.type === 'h3') { y += 2; paragraphe(b.texte, { style: 'bold', apres: 1, couleur: BLEU }); }
    else if (b.type === 'li') {
      police(b.gras ? 'bold' : 'normal');
      const ls = lignes(b.texte, LARGEUR - 8);
      place(5.2); d.text('-', G + 2, y);
      for (const l of ls) { place(5.2); d.text(l, G + 8, y); y += 5.2; }
      y += 1;
    }
    else if (b.type === 'signature') { y += 10; droite(b.lignes); }
    else paragraphe(b.texte);
  }
  return Buffer.from(d.output('arraybuffer'));
}

/**
 * La lettre en Word (.docx), pour qu'on la retouche avant de l'envoyer :
 * mêmes blocs, Arial 11, listes à tirets, en-têtes en bleu, signature à
 * droite. C'est le format qui part dans le chat ; le PDF reste disponible.
 */
export async function docx(brut) {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import('docx');
  const BLEU = '1F3A68';
  const run = (texte, { gras = false, couleur = null, italique = false } = {}) => new TextRun({ text: String(texte), bold: gras, italics: italique, color: couleur || undefined, font: 'Arial', size: 22 });
  const para = (runs, { align = AlignmentType.LEFT, avant = 0, apres = 120, retrait = null } = {}) =>
    new Paragraph({ children: Array.isArray(runs) ? runs : [runs], alignment: align, spacing: { before: avant, after: apres, line: 300 }, ...(retrait ? { indent: retrait } : {}) });
  const enfants = [];
  for (const b of blocs(brut)) {
    if (b.type === 'entete') { for (const l of b.lignes) enfants.push(para(run(l), { apres: 0 })); enfants.push(para(run(''), { apres: 240 })); }
    else if (b.type === 'droite') { for (const l of b.lignes) enfants.push(para(run(l), { align: AlignmentType.RIGHT, apres: 0 })); enfants.push(para(run(''), { apres: 120 })); }
    else if (b.type === 'objet') enfants.push(para(run(b.texte, { gras: true }), { avant: 240, apres: 360 }));
    else if (b.type === 'h2') enfants.push(para(run(b.texte, { gras: true, couleur: BLEU }), { avant: 360, apres: 160 }));
    else if (b.type === 'h3') enfants.push(para(run(b.texte, { gras: true, couleur: BLEU }), { avant: 200, apres: 100 }));
    else if (b.type === 'li') enfants.push(para([run('-\t'), run(b.texte, { gras: !!b.gras })], { apres: 40, retrait: { left: 720, hanging: 360 } }));
    else if (b.type === 'signature') { enfants.push(para(run(''), { apres: 480 })); for (const l of b.lignes) enfants.push(para(run(l), { align: AlignmentType.RIGHT, apres: 0 })); }
    else enfants.push(para(run(b.texte)));
  }
  const doc = new Document({
    creator: 'Klocka',
    title: `LOI ${brut.adresse_bien || ''}`,
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{ properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: enfants }],
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
