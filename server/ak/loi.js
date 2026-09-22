// La lettre d'intention d'achat (LOI), sur le modèle de l'équipe.
//
// Le modèle est celui de la lettre du 16/09/2026 pour le 1 avenue Mirabeau :
// l'acquéreur, le vendeur, l'identification de Klocka (fixe), l'offre, les
// conditions suspensives (financement, exclusivité et pièces, diagnostics),
// les modalités. Ce qui change d'une lettre à l'autre est un champ ; le reste
// est le texte de la maison, mot pour mot. La lettre sort en PDF par le
// navigateur sans écran (le même que pour Equimmox), et se relit avant de
// partir : AK la pose dans le chat, personne ne l'envoie à sa place.

import fs from 'fs';
import path from 'path';
import { CHEMIN_UPLOADS } from '../db.js';

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
const jour = (d) => (d ? new Date(d).toLocaleDateString('fr-FR') : '');
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

/** Le texte de la lettre, en HTML prêt à imprimer. Pure. */
export function lettre(brut) {
  const c = completer(brut);
  const acquereur = [c.acquereur_nom, c.acquereur_societe, c.acquereur_adresse].filter(Boolean);
  const vendeur = [c.vendeur_societe, c.vendeur_representant ? `Représentée par ${c.vendeur_representant}` : null, c.vendeur_adresse].filter(Boolean);
  const bien = [
    `Désignation du bien : Il s'agit d'un local commercial${c.surface_m2 ? ` d'une surface totale d'environ ${String(c.surface_m2).replace('.', ',')} m²` : ''},`,
    c.locataire ? `Local actuellement loué à l'enseigne ${c.locataire}${c.fin_bail ? ` via un bail commercial arrivant à échéance le ${jour(c.fin_bail)}` : ' via un bail commercial'}` : 'Local actuellement loué via un bail commercial',
    `Le prix de vente FAI TTC proposé est de <b>${euros(c.prix)} (<i>${enLettres(c.prix)} euros</i>).</b>`,
  ];
  const style = `body{font-family:Arial,Helvetica,sans-serif;font-size:11pt;line-height:1.45;color:#111;margin:0;padding:0 8mm}
    p{margin:0 0 8px} h2{font-size:11pt;color:#1f3a68;margin:22px 0 8px;text-transform:uppercase} h3{font-size:11pt;color:#1f3a68;margin:16px 0 6px}
    .droite{text-align:right} ul{margin:4px 0 10px 18px;padding:0} li{margin:2px 0} .signature{margin-top:36px;text-align:right}
    .objet{font-weight:bold;margin:26px 0 18px} .saut{page-break-before:always}`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>LOI ${html(c.adresse_bien)}</title><style>${style}</style></head><body>
<p>${acquereur.map(html).join('<br>')}</p>
<p class="droite" style="margin-top:34px">À l'attention de :<br>${vendeur.map(html).join('<br>')}</p>
<p class="droite">À ${html(c.lieu)}, le ${jour(c.date)}</p>
<p class="objet">Objet : Lettre d'intention d'achat d'un local commercial situé au ${html(c.adresse_bien)}</p>
<h2>Identification du conseil</h2>
<p>L'acquéreur est assisté dans cette opération par le cabinet :</p>
<ul>
<li>La société KLOCKA</li>
<li>Forme juridique : Société par action simplifiée (SAS) au capital social de 1 000 € (mille euros).</li>
<li>Siège social : 229 rue Saint-Honoré, 75001 Paris.</li>
<li>Immatriculation : R.C.S de Paris sous le numéro 932 230 394.</li>
<li>Représentation : Représentée par Paul de ZULUETA Y DE BESSON en qualité de Président.</li>
<li>Carte Professionnelle : n° CPI75012024000000529 portant la mention « transactions sur immeubles et fonds de commerce ».</li>
<li>Assurance RCP et Garantie : GALIAN ASSURANCES, 89 rue La Boétie, 75008 Paris.</li>
</ul>
<h2>I. L'offre</h2>
<p>Je soussigné, ${html(c.acquereur_nom)}, ai l'honneur de vous proposer l'achat d'un local commercial situé à l'adresse suivante : ${html(c.adresse_bien)}</p>
<ul>${bien.map((l) => `<li>${l}</li>`).join('')}</ul>
<p>À noter : Les honoraires de notre conseil, KLOCKA, seront également à notre charge.</p>
<h2>II. Conditions suspensives</h2>
<h3>II.1. Financement :</h3>
<p>Cette opération sera financée par un apport personnel de ${euros(c.apport)} (${enLettres(c.apport)} euros) et au moyen d'un crédit bancaire d'une durée maximale de ${c.duree_ans} ans avec un taux cible de ${String(c.taux).replace('.', ',')}% (hors assurance).</p>
<h3>II.2. Exclusivité et Due Diligence :</h3>
<p>Une période d'exclusivité permettant la Due Diligence à accorder à l'acquéreur. Cette période s'achèvera le ${jour(c.fin_exclusivite)}, sous réserve que l'ensemble des documents de la dataroom soient communiqués de façon exhaustive d'ici le ${jour(c.limite_documents)}. L'offre pourra être confirmée à l'issue de cette période si l'analyse des documents s'avère satisfaisante et conforme, par mes conseils, à l'exécution de l'acquisition.</p>
<p>Le vendeur s'engage à mettre à disposition :</p>
<ul>
<li>Les quittances de loyers sur les 3 dernières années et la situation de compte avec les dates de règlement.</li>
<li>La confirmation d'absence de désordre ou litige entre le locataire actuel et le propriétaire.</li>
<li>La confirmation d'absence de travaux majeurs dans la copropriété à la charge de l'acquéreur.</li>
<li>Les trois derniers procès-verbaux d'assemblée générale</li>
<li>Le règlement de copropriété n'indiquant aucune contradiction avec l'activité du preneur actuel.</li>
<li>Le détail de la taxe foncière et de sa répartition et refacturation avec le preneur</li>
<li>Les plans cotés des locaux concernés par la vente</li>
${c.locataire ? `<li>Le Kbis de la société ${html(c.locataire)}</li>` : ''}
<li>Transmettre tous les diagnostics réglementaires dans le cadre de cette vente</li>
<li>Tout autre document nécessaire à l'analyse du présent projet</li>
</ul>
<h3>II.3. Diagnostics :</h3>
<p>La réalisation des diagnostics réglementaires ne révélant aucune non conformité majeure.</p>
<h2>III. Modalités générales</h2>
<p>Clause de substitution : Je me réserve la faculté de me substituer toute structure (personne morale) dans laquelle je suis partie prenante.</p>
<p>Validité de l'offre : La présente offre est valable jusqu'au ${jour(c.validite)}.</p>
<p>Nous vous prions d'agréer, Monsieur, l'expression de nos salutations distinguées.</p>
<p class="signature">${html(c.acquereur_nom)}${c.acquereur_societe ? `<br>${html(c.acquereur_societe)}` : ''}</p>
</body></html>`;
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

/** La lettre en PDF, écrite dans les uploads. Rend son chemin et son adresse. */
export async function produire(champs) {
  const { lancerNavigateur } = await import('../marche/navigateur.js');
  const navigateur = await lancerNavigateur('La lettre d\'intention');
  try {
    const page = await navigateur.newPage();
    await page.setContent(lettre(champs), { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', margin: { top: '18mm', bottom: '18mm', left: '14mm', right: '14mm' }, printBackground: true });
    const dossier = path.join(CHEMIN_UPLOADS, 'loi');
    fs.mkdirSync(dossier, { recursive: true });
    const nom = `LOI ${String(champs.adresse_bien || 'local').replace(/[^\p{L}\p{N} .-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)} ${new Date().toISOString().slice(0, 10)}.pdf`;
    const chemin = path.join(dossier, nom);
    fs.writeFileSync(chemin, pdf);
    await page.close().catch(() => {});
    return { chemin, nom, url: `/uploads/loi/${encodeURIComponent(nom)}` };
  } finally {
    // Le navigateur est partagé (Equimmox s'en sert) : on ne le ferme pas.
  }
}
