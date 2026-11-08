// Un PDF qui réunit plusieurs documents (6 nov. 2026, banc d'import, S07 : « elle m'a donné un PDF scanné où il y a
// tout mélangé, le bail et une taxe foncière »). Chaque page dont le haut porte le titre d'un document connu (« BAIL
// COMMERCIAL », « AVIS DE TAXES FONCIÈRES », « Diagnostic de performance énergétique »…) en ouvre un nouveau ; la suite
// lui appartient. Deux documents ou plus : le PDF se découpe en autant de fichiers, chacun nommé et rangé dans sa case.
// Un seul : rien ne change. Le découpage lit la couche texte, page par page ; un scan sans texte reste entier.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const sans = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// [nature, nom clair, titre en haut de page]. Le premier qui reconnaît le haut de la page l'emporte.
const TITRES = [
  ['avenant', 'Avenant au bail', /^\s*avenant\b/],
  ['bail', 'Bail commercial', /\bbail (commercial|professionnel|derogatoire)\b/],
  ['taxe_fonciere', 'Taxe foncière', /avis (de taxes? foncieres?|d.imposition)|taxe fonciere sur les proprietes/],
  ['diagnostics', 'Diagnostic', /diagnostic de performance|\bdpe\b.{0,20}(tertiaire|n°)|dossier de diagnostic|etat (des risques|amiante)/],
  ['copropriete', "PV d'assemblée générale", /proces.verbal d.assemblee|reglement de copropriete/],
  ['quittances', 'Quittances de loyer', /^\s*(quittances?|avis d.echeance) de loyer/],
  ['mandat', 'Mandat', /mandat de (vente|location)/],
  ['avis', 'Avis de valeur', /^\s*avis de valeur/],
  ['bilans', 'Bilans', /liasse|compte de resultat|bilan (simplifie|comptable)/],
  ['autres', "Offre d'achat", /^\s*offre d.achat/],
  ['autres', 'Compromis de vente', /promesse (synallagmatique|unilaterale) de vente|compromis de vente/],
];

/** Pure : le document qu'ouvre une page, d'après son haut (les 300 premiers caractères), ou null. */
export function titreDeLaPage(texte) {
  const haut = sans(texte).replace(/document fictif[^\n]*/g, '').trim().slice(0, 300);
  for (const [nature, nom, re] of TITRES) if (re.test(haut)) return { nature: nature === 'avenant' ? 'bail' : nature, nom };
  return null;
}

/**
 * Pure : les documents d'un PDF, d'après le texte de chaque page. Rend [{ debut, fin, nature, nom }] (pages comptées de
 * 0, fin incluse) quand au moins deux documents différents s'y suivent ; sinon [].
 */
export function documentsDuPdf(parPage = []) {
  const morceaux = [];
  parPage.forEach((texte, i) => {
    const t = titreDeLaPage(texte);
    const dernier = morceaux[morceaux.length - 1];
    // Une page titrée comme la précédente (les trois quittances à la suite) reste dans le même document.
    if (t && !(dernier && dernier.nom === t.nom)) morceaux.push({ debut: i, fin: i, ...t });
    else if (dernier) dernier.fin = i;
    else morceaux.push({ debut: i, fin: i, nature: null, nom: null });
  });
  const reconnus = morceaux.filter((m) => m.nom);
  return reconnus.length >= 2 ? morceaux : [];
}

/** Une année dans le texte d'un document (« AVIS DE TAXES FONCIÈRES 2024 »), pour son nom. */
const anneeDe = (texte) => (sans(texte).slice(0, 400).match(/\b(20\d{2})\b/) || [])[1] || null;

/**
 * Découpe un PDF déposé qui réunit plusieurs documents. `fichier` : { nom, url, chemin } (le chemin sur le disque).
 * Rend la liste des morceaux { nom, url, chemin, mimetype, nature, texte }, ou null quand il n'y a rien à découper.
 */
export async function decouperSiPlusieurs(fichier, { uploadDir = null } = {}) {
  if (!fichier?.chemin || !/\.pdf$/i.test(fichier.nom || fichier.chemin)) return null;
  let parPage = [];
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(fs.readFileSync(fichier.chemin)) });
    try { parPage = ((await parser.getText()).pages || []).map((p) => p.text || ''); } finally { await parser.destroy().catch(() => {}); }
  } catch { return null; }
  const docs = documentsDuPdf(parPage);
  if (!docs.length) return null;
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(fs.readFileSync(fichier.chemin), { ignoreEncryption: true });
  const dossier = uploadDir || path.dirname(fichier.chemin);
  const base = path.basename(fichier.nom || 'document', '.pdf');
  const out = [];
  for (const d of docs) {
    const pdf = await PDFDocument.create();
    const indices = Array.from({ length: d.fin - d.debut + 1 }, (_, k) => d.debut + k);
    for (const page of await pdf.copyPages(source, indices)) pdf.addPage(page);
    const texte = parPage.slice(d.debut, d.fin + 1).join('\n\n');
    const nom = d.nom ? `${d.nom}${anneeDe(texte) && d.nature === 'taxe_fonciere' ? ` ${anneeDe(texte)}` : ''}.pdf` : `${base} (pages ${d.debut + 1} à ${d.fin + 1}).pdf`;
    const fichierDisque = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${nom.replace(/[^\w.-]+/g, '_')}`;
    const chemin = path.join(dossier, fichierDisque);
    fs.writeFileSync(chemin, await pdf.save());
    out.push({ nom, url: `/uploads/${fichierDisque}`, chemin, mimetype: 'application/pdf', nature: d.nature || null, texte, pages: `${d.debut + 1}-${d.fin + 1}`, decoupe_de: fichier.nom || null });
  }
  return out;
}
