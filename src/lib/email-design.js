/* eslint-disable no-restricted-syntax -- palette d'email.
   Un email est lu dans Gmail ou Outlook, pas dans l'application : comme les
   documents imprimés, il garde sa palette figée, en hexadécimal, et ne suit
   pas les jetons du thème. */
// Le design d'un email : un thème et une suite de blocs (titre, texte,
// bouton, image, séparateur, signature). Pur, partagé par l'éditeur de la
// page Emailing (l'aperçu qu'on modifie sur place) et par le serveur, qui en
// tire le HTML envoyé par Resend : ce qu'on voit est ce qui part.
//
// Comme les documents imprimés, un email a sa propre palette, figée : il est
// lu dans Gmail ou Outlook, pas dans l'application, et ne suit pas le thème.
// Le HTML est en tableaux et en styles en ligne, la seule forme que les
// boîtes mail lisent toutes.

export const THEMES = {
  clair: {
    nom: "Clair", page: "#f3f4f2", carte: "#ffffff", texte: "#1c1d1c", doux: "#6b6f6c", trait: "#e4e6e3",
    accent: "#3f7466", surAccent: "#ffffff", titre: "#121312",
  },
  menthe: {
    nom: "Menthe", page: "#e9f1ee", carte: "#ffffff", texte: "#1c2421", doux: "#5f6d68", trait: "#d5e3de",
    accent: "#7fa898", surAccent: "#ffffff", titre: "#16302a",
  },
  sombre: {
    nom: "Sombre", page: "#0d0e0d", carte: "#1a1b1a", texte: "#e9eae7", doux: "#9a9e9b", trait: "#2c2e2c",
    accent: "#96c0b8", surAccent: "#08130d", titre: "#f2f2f0",
  },
};

export const POLICE = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Les polices d'un email (9 oct. 2026), une pour les titres et une pour le
 * texte. Les premières sont installées partout. Celles de Google Fonts
 * (`google`) s'affichent dans Apple Mail et sur iPhone ; Gmail et Outlook
 * prennent la police de repli de la pile, d'où une pile toujours complète.
 */
export const POLICES = {
  systeme: { nom: "Système", pile: POLICE },
  arial: { nom: "Arial", pile: "Arial,Helvetica,sans-serif" },
  helvetica: { nom: "Helvetica", pile: "'Helvetica Neue',Helvetica,Arial,sans-serif" },
  verdana: { nom: "Verdana", pile: "Verdana,Geneva,sans-serif" },
  trebuchet: { nom: "Trebuchet", pile: "'Trebuchet MS',Helvetica,sans-serif" },
  georgia: { nom: "Georgia", pile: "Georgia,'Times New Roman',serif" },
  times: { nom: "Times", pile: "'Times New Roman',Times,serif" },
  courier: { nom: "Courier", pile: "'Courier New',Courier,monospace" },
  inter: { nom: "Inter", pile: "Inter,Helvetica,Arial,sans-serif", google: "Inter:wght@400;600" },
  montserrat: { nom: "Montserrat", pile: "Montserrat,Helvetica,Arial,sans-serif", google: "Montserrat:wght@400;600" },
  lora: { nom: "Lora", pile: "Lora,Georgia,serif", google: "Lora:wght@400;600" },
  playfair: { nom: "Playfair Display", pile: "'Playfair Display',Georgia,serif", google: "Playfair+Display:wght@400;600" },
  manrope: { nom: "Manrope", pile: "Manrope,Helvetica,Arial,sans-serif", google: "Manrope:wght@400;600;700;800" },
  newsreader: { nom: "Newsreader", pile: "Newsreader,Georgia,serif", google: "Newsreader:opsz,wght@6..72,500;6..72,600" },
};

/**
 * Les mises en page d'un email (9 oct. 2026, maquettes de Jules), au-dessus
 * du thème : « Carte » (l'historique), « La Note » (un bandeau à la couleur
 * du thème, la carte qui le chevauche, une liste à cocher, un encadré, le
 * bouton sombre au centre, une carte de rendez-vous dessous) et « La Lettre »
 * (une lettre blanche, le titre en serif, la citation, la signature avec son
 * initiale). Le numéro (« N° 12 ») et la marque (« La Note ») s'y affichent.
 */
export const GABARITS = {
  carte: { nom: "Carte" },
  note: { nom: "La Note" },
  note_claire: { nom: "La Note claire" },
  lettre: { nom: "La Lettre" },
  dossier: { nom: "Le Dossier" },
};
const familleNote = (g) => g === "note" || g === "note_claire";

/** Pure : un mélange de deux couleurs (hexadécimal), `p` de la seconde ; les teintes douces des mails. */
export function melange(a, b, p) {
  const v = (h) => [1, 3, 5].map((i) => parseInt(String(h).slice(i, i + 2), 16));
  const [x, y] = [v(a), v(b)];
  if ([...x, ...y].some((n) => Number.isNaN(n))) return a;
  return `#${x.map((n, i) => Math.round(n + (y[i] - n) * p).toString(16).padStart(2, "0")).join("")}`;
}
const gabaritDe = (design) => (GABARITS[design?.gabarit] ? design.gabarit : "carte");

/** Pure : ce qu'on lit dans l'en-tête d'une Note ou d'une Lettre, « LA NOTE · N°12 ». */
export const mentionDe = (design) => [String(design?.marque ?? "La Note").trim() || "La Note", String(design?.numero ?? "").trim() ? `N°${String(design.numero).trim()}` : null].filter(Boolean).join(" · ");

/**
 * Pure : la Note sort de la carte ce qui ouvre le mail (surtitre, titre),
 * posé dans le bandeau, et la carte de rendez-vous qui le ferme, posée dessous.
 */
export function decouper(design, blocs) {
  const g = gabaritDe(design);
  if (g === "dossier") {
    let j = blocs.length;
    while (j > 0 && blocs[j - 1].type === "rdv") j -= 1;
    return { bande: [], corps: blocs.slice(0, j), apres: blocs.slice(j) };
  }
  if (!familleNote(g)) return { bande: [], corps: blocs, apres: [] };
  let i = 0;
  while (i < blocs.length && ["surtitre", "titre"].includes(blocs[i].type) && i < 2) i += 1;
  let j = blocs.length;
  while (j > i && blocs[j - 1].type === "rdv") j -= 1;
  return { bande: blocs.slice(0, i), corps: blocs.slice(i, j), apres: blocs.slice(j) };
}

/** Pure : les réglages d'un design reçu (polices, mise en page, numéro, marque), gardés s'ils sont valables, pour le serveur. */
export const policesPropres = (d) => ({
  police: POLICES[d?.police] ? d.police : null,
  police_titres: POLICES[d?.police_titres] ? d.police_titres : null,
  ...(GABARITS[d?.gabarit] && d.gabarit !== "carte" ? { gabarit: d.gabarit } : {}),
  ...(d?.numero != null && String(d.numero).trim() ? { numero: String(d.numero).trim().slice(0, 12) } : {}),
  ...(d?.marque != null && String(d.marque).trim() ? { marque: String(d.marque).trim().slice(0, 40) } : {}),
  ...(/^#[0-9a-f]{6}$/i.test(String(d?.accent || "")) ? { accent: String(d.accent).toLowerCase() } : {}),
});

/** Pure : le lien Google Fonts des polices choisies, ou null si toutes sont installées partout. */
export function lienPolices(design) {
  const familles = [...new Set([design?.police, design?.police_titres].map((k) => POLICES[k]?.google).filter(Boolean))];
  return familles.length ? `https://fonts.googleapis.com/css2?${familles.map((f) => `family=${f}`).join("&")}&display=swap` : null;
}

export const TYPES_BLOCS = [
  ["surtitre", "Surtitre"], ["etiquette", "Étiquette"], ["titre", "Titre"], ["chapo", "Chapô"], ["intertitre", "Intertitre"], ["texte", "Texte"], ["points", "Points à cocher"], ["etapes", "Étapes numérotées"], ["tableau", "Tableau"], ["chiffres", "Chiffres"], ["encadre", "Encadré"], ["verdict", "Verdict"], ["bouton", "Bouton"], ["legende", "Légende"], ["image", "Image"], ["citation", "Citation"], ["colonnes", "Deux colonnes"], ["separateur", "Séparateur"], ["signature", "Signature"], ["rdv", "Carte de rendez-vous"],
];

/** Un bloc neuf, prêt à remplir. */
export function blocNeuf(type) {
  const id = `b${Math.random().toString(36).slice(2, 9)}`;
  if (type === "titre") return { id, type, texte: "Un titre" };
  if (type === "bouton") return { id, type, texte: "Réserver un appel", lien: "https://klocka.immo" };
  if (type === "image") return { id, type, src: "", lien: "" };
  if (type === "separateur") return { id, type };
  if (type === "signature") return { id, type, texte: "L'équipe Klocka" };
  if (type === "citation") return { id, type, texte: "Une phrase qui marque.", auteur: "" };
  if (type === "colonnes") return { id, type, gauche: "**À gauche**\nVotre texte.", droite: "**À droite**\nVotre texte." };
  if (type === "surtitre") return { id, type, texte: "3 points à vérifier" };
  if (type === "points") return { id, type, items: [{ titre: "Une question ?", texte: "La réponse, en une phrase." }, { titre: "Une autre question ?", texte: "Sa réponse." }] };
  if (type === "encadre") return { id, type, texte: "Ce qu'il faut retenir, en une phrase." };
  if (type === "etiquette") return { id, type, texte: "Réalité" };
  if (type === "chapo") return { id, type, texte: "L'idée du mail, en une phrase forte." };
  if (type === "intertitre") return { id, type, texte: "Ce qui a fait la différence" };
  if (type === "etapes") return { id, type, items: [{ titre: "Premier point", texte: "ce qu'il a changé" }, { titre: "Deuxième point", texte: "ce qu'il a changé" }] };
  if (type === "tableau") return { id, type, entetes: ["L'annonce dit", "Vous payez / touchez"], lignes: [{ a: "Prix d'achat", b: "Prix + frais de notaire" }, { a: "Loyer brut", b: "Loyer moins les charges" }] };
  if (type === "chiffres") return { id, type, items: [{ label: "Ville", valeur: "[VILLE]" }, { label: "Prix affiché", valeur: "[PRIX] €" }, { label: "Rendement net", valeur: "[Y] %", fort: true }] };
  if (type === "verdict") return { id, type, titre: "Notre verdict", texte: "[Retenu / écarté], parce que [raison en une phrase]." };
  if (type === "legende") return { id, type, texte: "Une précision sous le bouton" };
  if (type === "rdv") return { id, type, initiale: "J", titre: "Un bien en vue ?", texte: "Jules et l'équipe Klocka le passent au crible avec vous, en 20 minutes.", lien_texte: "Réserver", lien: "https://klocka.immo" };
  return { id, type: "texte", texte: "Votre texte." };
}

/** Les variables qu'un email peut porter, et ce qu'elles deviennent. */
export const VARIABLES = [
  ["prenom", "Prénom"], ["nom", "Nom"], ["entreprise", "Entreprise"], ["ville", "Ville"], ["email", "Adresse"], ["lien", "Lien (invitation)"], ["lien_simulateur", "Lien du simulateur (personnel)"], ["expediteur", "Expéditeur"],
];

/** Pure : les variables d'un texte, avec leur valeur de repli ({{prenom | "Bonjour"}}). */
export function variablesDe(texte) {
  return [...String(texte ?? "").matchAll(/\{\{\s*(\w+)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/g)].map((m) => ({ cle: m[1], repli: m[2] ?? null }));
}

/** Pure : toutes les variables d'un email (objet, aperçu, blocs). */
export function variablesDeLEmail(etape) {
  const textes = [etape?.objet, etape?.apercu, ...(etape?.design?.blocs || []).flatMap((b) => [b.texte, b.lien, b.gauche, b.droite, b.auteur, b.titre, b.sous_titre, b.lien_texte, ...(b.items || []).flatMap((x) => [x.titre, x.texte, x.label, x.valeur]), ...(b.entetes || []), ...(b.lignes || []).flatMap((x) => [x.a, x.b])])];
  return textes.flatMap(variablesDe);
}

const echapper = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Pure : remplace les {{variables}}. Une variable vide disparaît, et la
 * virgule ou l'espace qui la précédait avec (« Bonjour {{prenom}}, » sans
 * prénom donne « Bonjour, »).
 */
export function remplir(texte, vars = {}) {
  return String(texte ?? "")
    .replace(/[ \u00a0]?\{\{\s*(\w+)\s*(?:\|\s*"([^"]*)"\s*)?\}\}/g, (m, k, repli) => {
      const v = vars[k] == null || vars[k] === "" ? (repli ?? "") : vars[k];
      if (v == null || v === "") return "";
      return (m.startsWith("{") ? "" : m[0]) + v;
    });
}

/**
 * Pure : un bloc s'affiche-t-il pour ce contact ? Sans condition, toujours ;
 * sans contact (aperçu générique), toujours aussi.
 * si : { type: "tag", valeur } ou { type: "champ", cle, valeur? } (valeur
 * absente : le champ est rempli).
 */
export function blocVisible(b, contact) {
  const si = b?.si;
  if (!si || !si.type || !contact) return true;
  if (si.type === "tag") return (contact.tags || []).includes(si.valeur);
  if (si.type === "champ") {
    const v = si.cle in (contact.champs || {}) ? contact.champs[si.cle] : contact[si.cle];
    const t = String(v ?? "").trim().toLowerCase();
    return si.valeur ? t === String(si.valeur).trim().toLowerCase() : !!t;
  }
  return true;
}

/** Pure : le texte d'un bloc en HTML sûr, avec **gras** et retours à la ligne. */
export function enHtml(texte) {
  return echapper(texte).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>");
}

const css = (o) => Object.entries(o).filter(([, v]) => v != null && v !== "").map(([k, v]) => `${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${v}`).join(";");

/** Les styles d'un bloc, en objet : React les pose tels quels, le HTML les sérialise. */
export function styles(theme, design = null) {
  // Une couleur d'accent propre au mail (un template importé d'une capture) remplace celle du thème.
  const t0 = THEMES[theme] || THEMES.clair;
  const t = /^#[0-9a-f]{6}$/i.test(String(design?.accent || "")) ? { ...t0, accent: design.accent } : t0;
  const corps = POLICES[design?.police]?.pile || POLICE;
  const titres = POLICES[design?.police_titres]?.pile || corps;
  const g = gabaritDe(design);
  const base = stylesDeBase(t, corps, titres);
  if (familleNote(g)) {
    // La Note claire : le bandeau à la couleur d'accent, le texte sombre dessus, la mention en pastille.
    const claire = g === "note_claire";
    const surBande = claire ? t.titre : "#ffffff";
    return { ...base, g, claire,
    page: { backgroundColor: t.page, padding: "0 0 32px", fontFamily: corps },
    bande: { backgroundColor: t.accent, padding: "28px 24px 30px" },
    bandeInterieur: { maxWidth: "520px", margin: "0 auto" },
    marque: { color: surBande, fontFamily: titres, fontSize: "15px", fontWeight: "700", verticalAlign: "middle" },
    mention: { color: surBande, opacity: claire ? "1" : "0.8", fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "right", verticalAlign: "middle" },
    mentionPastille: claire ? { display: "inline-block", backgroundColor: melange(t.accent, "#ffffff", 0.65), borderRadius: "999px", padding: "5px 10px" } : null,
    surtitreBande: { color: surBande, opacity: "0.82", fontFamily: corps, fontSize: "11.5px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", margin: "30px 0 10px" },
    titreBande: { color: surBande, fontFamily: titres, fontSize: "30px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-0.02em", margin: "0" },
    // La carte chevauche le bandeau : un dégradé net dans la cellule (repli : la carte juste dessous).
    zoneCarte: { backgroundColor: t.page, backgroundImage: `linear-gradient(${t.accent} 0, ${t.accent} 48px, ${t.page} 48px)`, padding: "0 16px" },
    carte: { backgroundColor: t.carte, borderRadius: "14px", padding: "30px 34px", maxWidth: "520px", margin: "0 auto", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" },
    bouton: { ...base.bouton, backgroundColor: claire ? t.accent : t.titre, color: claire ? t.titre : t.carte, fontWeight: "700", padding: "14px 26px" },
    zoneBouton: { margin: "10px 0 12px", textAlign: "center" },
    legende: { ...base.legende, textAlign: "center" },
    rdvCarte: { backgroundColor: t.carte, borderRadius: "14px", padding: "20px 24px", maxWidth: "520px", margin: "18px auto 0" },
    initiale: claire ? { ...base.initiale, backgroundColor: t.accent } : base.initiale,
    pied: { ...base.pied, margin: "22px auto 0", maxWidth: "520px" },
  };
  }
  // Le Dossier : toute la page à la couleur d'accent, l'en-tête dessus, une carte blanche, son pied de carte.
  if (g === "dossier") return { ...base, g,
    page: { backgroundColor: t.accent, padding: "28px 16px 32px", fontFamily: corps },
    bandeInterieur: { maxWidth: "520px", margin: "0 auto" },
    marque: { color: t.titre, fontFamily: titres, fontSize: "15px", fontWeight: "700", verticalAlign: "middle" },
    mention: { color: t.titre, fontSize: "11px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "right", verticalAlign: "middle" },
    carte: { backgroundColor: t.carte, borderRadius: "16px", padding: "30px 30px", maxWidth: "520px", margin: "18px auto 0" },
    surtitre: { ...base.surtitre, color: melange(t.accent, "#000000", 0.4) },
    titre: { ...base.titre, fontSize: "26px", lineHeight: "1.2", fontWeight: "800", letterSpacing: "-0.02em", margin: "0 0 12px" },
    texte: { ...base.texte, fontSize: "13.5px", lineHeight: "1.6" },
    bouton: { ...base.bouton, backgroundColor: t.titre, color: t.carte, fontWeight: "700", padding: "14px 26px" },
    zoneBouton: { margin: "10px 0 12px", textAlign: "center" },
    legende: { ...base.legende, textAlign: "center" },
    initiale: { ...base.initiale, backgroundColor: t.accent },
    rdvPied: { borderTop: `1px solid ${t.trait}`, margin: "26px -30px -30px", padding: "16px 30px" },
    pied: { ...base.pied, color: t.titre, margin: "18px auto 0", maxWidth: "520px" },
    lienPied: { ...base.lienPied, color: t.titre },
  };
  if (g === "lettre") return { ...base, g,
    page: { backgroundColor: t.carte, padding: "40px 20px", fontFamily: corps },
    carte: { backgroundColor: t.carte, maxWidth: "520px", margin: "0 auto", padding: "0" },
    entete: { color: t.doux, fontSize: "12px", margin: "0 0 26px" },
    titre: { ...base.titre, fontSize: "32px", lineHeight: "1.18", fontWeight: "600", letterSpacing: "-0.01em", margin: "0 0 24px" },
    citation: { color: t.titre, fontFamily: titres, fontSize: "20px", lineHeight: "1.45", fontWeight: "600", margin: "6px 0 24px", padding: "2px 0 2px 20px", borderLeft: `2px solid ${t.titre}` },
    bouton: { ...base.bouton, borderRadius: "8px", padding: "13px 22px" },
    zoneBouton: { margin: "8px 0 24px" },
    pied: { ...base.pied, textAlign: "left", maxWidth: "520px", margin: "30px auto 0", paddingTop: "18px", borderTop: `1px solid ${t.trait}` },
  };
  return { ...base, g };
}

function stylesDeBase(t, corps, titres) {
  return {
    t,
    page: { backgroundColor: t.page, padding: "32px 12px", fontFamily: corps },
    carte: { backgroundColor: t.carte, borderRadius: "14px", border: `1px solid ${t.trait}`, padding: "36px 40px", maxWidth: "580px", margin: "0 auto" },
    // La police posée sur chaque bloc : Outlook n'hérite pas toujours de celle de la page.
    titre: { color: t.titre, fontFamily: titres, fontSize: "24px", lineHeight: "1.3", fontWeight: "600", margin: "0 0 18px", letterSpacing: "-0.01em" },
    texte: { color: t.texte, fontFamily: corps, fontSize: "15px", lineHeight: "1.7", margin: "0 0 18px" },
    bouton: { display: "inline-block", backgroundColor: t.accent, color: t.surAccent, fontFamily: corps, fontSize: "15px", fontWeight: "600", textDecoration: "none", padding: "13px 26px", borderRadius: "999px" },
    zoneBouton: { margin: "8px 0 26px" },
    image: { display: "block", width: "100%", maxWidth: "500px", borderRadius: "10px", margin: "0 0 20px" },
    separateur: { border: "0", borderTop: `1px solid ${t.trait}`, margin: "26px 0" },
    signature: { color: t.texte, fontFamily: corps, fontSize: "15px", lineHeight: "1.6", margin: "24px 0 0", fontWeight: "600" },
    citation: { color: t.titre, fontFamily: titres, fontSize: "17px", lineHeight: "1.6", fontStyle: "italic", margin: "4px 0 22px", padding: "4px 0 4px 18px", borderLeft: `3px solid ${t.accent}` },
    auteur: { display: "block", color: t.doux, fontSize: "13px", fontStyle: "normal", marginTop: "8px" },
    colonne: { color: t.texte, fontFamily: corps, fontSize: "14.5px", lineHeight: "1.65", verticalAlign: "top", width: "50%" },
    logo: { display: "block", margin: "0 0 26px" },
    pied: { color: t.doux, fontSize: "12px", lineHeight: "1.6", textAlign: "center", margin: "18px auto 0", maxWidth: "580px" },
    lienPied: { color: t.doux, textDecoration: "underline" },
    surtitre: { color: t.doux, fontFamily: corps, fontSize: "11.5px", fontWeight: "700", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px" },
    legende: { color: t.doux, fontFamily: corps, fontSize: "12.5px", lineHeight: "1.5", margin: "0 0 18px" },
    encadre: { backgroundColor: t.page, borderRadius: "10px", padding: "16px 20px", margin: "6px 0 24px" },
    encadreTexte: { color: t.titre, fontFamily: corps, fontSize: "14.5px", lineHeight: "1.5", fontWeight: "700" },
    encadreIcone: { display: "inline-block", width: "15px", height: "15px", border: `1.5px solid ${t.titre}`, borderRadius: "50%", textAlign: "center", lineHeight: "15px", fontSize: "10px", fontWeight: "700", color: t.titre },
    point: { padding: "14px 0", verticalAlign: "top" },
    pointCase: { display: "inline-block", width: "18px", height: "18px", border: `1.5px solid ${t.titre}`, borderRadius: "5px", textAlign: "center", lineHeight: "18px", fontSize: "12px", color: t.titre },
    pointTitre: { color: t.titre, fontFamily: titres, fontSize: "15px", lineHeight: "1.4", fontWeight: "700", margin: "0 0 4px" },
    pointTexte: { color: t.texte, fontFamily: corps, fontSize: "13.5px", lineHeight: "1.55", margin: "0" },
    initiale: { display: "inline-block", width: "40px", height: "40px", borderRadius: "50%", backgroundColor: t.trait, color: t.titre, textAlign: "center", lineHeight: "40px", fontSize: "15px", fontWeight: "600", fontFamily: corps },
    rdvBoite: { border: `1px solid ${t.trait}`, borderRadius: "12px", padding: "16px 20px", margin: "8px 0 22px" },
    rdvTitre: { color: t.titre, fontFamily: titres, fontSize: "14.5px", fontWeight: "700", margin: "0 0 3px" },
    rdvTexte: { color: t.texte, fontFamily: corps, fontSize: "13px", lineHeight: "1.5", margin: "0" },
    rdvLien: { color: t.titre, fontFamily: corps, fontSize: "13.5px", fontWeight: "700", textDecoration: "underline", whiteSpace: "nowrap" },
    signatureNom: { color: t.titre, fontFamily: titres, fontSize: "17px", fontWeight: "600", margin: "0" },
    signatureSous: { color: t.doux, fontFamily: corps, fontSize: "12.5px", margin: "2px 0 0" },
    etiquette: { display: "inline-block", backgroundColor: t.titre, color: t.carte, fontFamily: corps, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.06em", textTransform: "uppercase", padding: "5px 10px", borderRadius: "999px" },
    chapo: { color: t.titre, fontFamily: titres, fontSize: "17px", lineHeight: "1.45", fontWeight: "700", margin: "0 0 22px" },
    intertitre: { color: t.titre, fontFamily: titres, fontSize: "16.5px", lineHeight: "1.35", fontWeight: "700", margin: "10px 0 14px" },
    teinte: melange(t.accent, t.carte, 0.82),
    tableEntete: { color: t.doux, fontFamily: corps, fontSize: "10.5px", fontWeight: "700", letterSpacing: "0.06em", textTransform: "uppercase", padding: "0 8px 10px 0", textAlign: "left" },
    tableEnteteFort: { color: melange(t.accent, "#000000", 0.4) },
    tableA: { color: t.doux, fontFamily: corps, fontSize: "13px", lineHeight: "1.45", padding: "12px 10px 12px 0", borderTop: `1px solid ${t.trait}`, verticalAlign: "top", width: "50%" },
    tableB: { color: t.titre, fontFamily: corps, fontSize: "13px", lineHeight: "1.45", fontWeight: "700", padding: "12px 0", borderTop: `1px solid ${t.trait}`, verticalAlign: "top" },
    tuile: { backgroundColor: melange(t.accent, t.carte, 0.82), borderRadius: "8px", padding: "10px 12px", verticalAlign: "top", width: "33%" },
    tuileForte: { backgroundColor: t.titre },
    tuileLabel: { color: t.doux, fontFamily: corps, fontSize: "11px", fontWeight: "600", margin: "0 0 3px" },
    tuileValeur: { color: t.titre, fontFamily: corps, fontSize: "14px", fontWeight: "700", margin: "0" },
    tuileLabelFort: { color: melange(t.carte, t.titre, 0.35) },
    tuileValeurFort: { color: t.accent },
    etapeNumero: { display: "inline-block", width: "22px", height: "22px", borderRadius: "50%", backgroundColor: melange(t.accent, t.carte, 0.7), color: t.titre, textAlign: "center", lineHeight: "22px", fontSize: "11.5px", fontWeight: "700", fontFamily: corps },
    etapeTexte: { color: t.texte, fontFamily: corps, fontSize: "13.5px", lineHeight: "1.55", margin: "0" },
    verdict: { border: `1.5px solid ${t.titre}`, borderRadius: "12px", padding: "16px 18px", margin: "8px 0 24px" },
    verdictTitre: { color: t.titre, fontFamily: corps, fontSize: "10.5px", fontWeight: "800", letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 6px" },
    verdictTexte: { color: t.titre, fontFamily: titres, fontSize: "16px", lineHeight: "1.4", fontWeight: "700", margin: "0" },
  };
}

/**
 * Pure : l'email en HTML et en texte. `desinscription` : le lien de
 * désinscription, posé en pied (obligatoire pour un envoi de prospection,
 * absent d'un mail de la plateforme). `logo` : l'adresse de l'image du logo.
 */
export function rendreEmail(design, vars = {}, { desinscription = null, logo = null, apercu = "", contact = null, adresse = null } = {}) {
  const s = styles(design?.theme, design);
  const blocs = (design?.blocs || []).filter((b) => blocVisible(b, contact));
  const parts = decouper(design, blocs);
  const enHtmlBloc = (b) => {
    const texte = remplir(b.texte, vars);
    const r = (v) => enHtml(remplir(v, vars));
    if (b.type === "surtitre") return `<p style="${css(s.surtitre)}">${enHtml(texte)}</p>`;
    if (b.type === "legende") return `<p style="${css(s.legende)}">${enHtml(texte)}</p>`;
    if (b.type === "encadre") return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css({ margin: s.encadre.margin })}"><tr><td style="${css({ ...s.encadre, margin: null, ...(b.ton === "accent" ? { backgroundColor: s.teinte } : {}) })}"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="width:30px;vertical-align:top;padding-top:2px"><span style="${css(s.encadreIcone)}">!</span></td><td style="${css(s.encadreTexte)}">${enHtml(texte)}</td></tr></table></td></tr></table>`;
    if (b.type === "etiquette") return `<p style="margin:0 0 14px"><span style="${css(s.etiquette)}">${enHtml(texte)}</span></p>`;
    if (b.type === "chapo") return `<p style="${css(s.chapo)}">${enHtml(texte)}</p>`;
    if (b.type === "intertitre") return `<p style="${css(s.intertitre)}">${enHtml(texte)}</p>`;
    if (b.type === "tableau") {
      const [ea, eb] = b.entetes || [];
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 22px"><tr><th style="${css(s.tableEntete)}">${r(ea)}</th><th style="${css({ ...s.tableEntete, ...s.tableEnteteFort })}">${r(eb)}</th></tr>${(b.lignes || []).map((x) => `<tr><td style="${css(s.tableA)}">${r(x.a)}</td><td style="${css(s.tableB)}">${r(x.b)}</td></tr>`).join("")}</table>`;
    }
    if (b.type === "chiffres") {
      const items = b.items || [];
      const rangees = [];
      for (let k = 0; k < items.length; k += 3) rangees.push(items.slice(k, k + 3));
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="6" style="margin:0 -6px 16px;border-collapse:separate">${rangees.map((l) => `<tr>${l.map((x) => `<td style="${css({ ...s.tuile, ...(x.fort ? s.tuileForte : {}) })}"><p style="${css({ ...s.tuileLabel, ...(x.fort ? s.tuileLabelFort : {}) })}">${r(x.label)}</p><p style="${css({ ...s.tuileValeur, ...(x.fort ? s.tuileValeurFort : {}) })}">${r(x.valeur)}</p></td>`).join("")}</tr>`).join("")}</table>`;
    }
    if (b.type === "etapes") return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${(b.items || []).map((x, k) => `<tr><td style="width:34px;vertical-align:top;padding:0 0 12px"><span style="${css(s.etapeNumero)}">${k + 1}</span></td><td style="vertical-align:top;padding:2px 0 12px"><p style="${css(s.etapeTexte)}">${x.titre ? `<strong style="color:${s.t.titre}">${r(x.titre)} :</strong> ` : ""}${r(x.texte)}</p></td></tr>`).join("")}</table>`;
    if (b.type === "verdict") return `<div style="${css(s.verdict)}">${b.titre ? `<p style="${css(s.verdictTitre)}">${r(b.titre)}</p>` : ""}<p style="${css(s.verdictTexte)}">${enHtml(texte)}</p></div>`;
    if (b.type === "points") return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${(b.items || []).map((x, i) => {
      const bord = i ? `border-top:1px solid ${s.t.trait};` : "";
      return `<tr><td style="${css(s.point)};${bord}width:34px"><span style="${css(s.pointCase)}">&#10003;</span></td><td style="${css(s.point)};${bord}"><p style="${css(s.pointTitre)}">${r(x.titre)}</p>${x.texte ? `<p style="${css(s.pointTexte)}">${r(x.texte)}</p>` : ""}</td></tr>`;
    }).join("")}</table>`;
    if (b.type === "rdv") {
      const ligne = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${b.initiale ? `<td style="width:56px;vertical-align:middle"><span style="${css(s.initiale)}">${echapper(String(b.initiale).slice(0, 2))}</span></td>` : ""}<td style="vertical-align:middle">${b.titre ? `<p style="${css(s.rdvTitre)}">${r(b.titre)}</p>` : ""}${b.texte ? `<p style="${css(s.rdvTexte)}">${r(b.texte)}</p>` : ""}</td>${b.lien_texte ? `<td style="vertical-align:middle;text-align:right;padding-left:12px"><a href="${echapper(remplir(b.lien, vars))}" style="${css(s.rdvLien)}">${r(b.lien_texte)} &rarr;</a></td>` : ""}</tr></table>`;
      // Posée dans sa propre carte (Note) ou en pied de carte (Dossier) : pas de cadre en plus.
      return familleNote(s.g) || s.g === "dossier" ? ligne : `<div style="${css(s.rdvBoite)}">${ligne}</div>`;
    }
    if (b.type === "signature" && (b.sous_titre || b.initiale)) return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 0"><tr>${b.initiale ? `<td style="width:54px;vertical-align:middle"><span style="${css(s.initiale)}">${echapper(String(b.initiale).slice(0, 2))}</span></td>` : ""}<td style="vertical-align:middle"><p style="${css(s.signatureNom)}">${enHtml(texte)}</p>${b.sous_titre ? `<p style="${css(s.signatureSous)}">${r(b.sous_titre)}</p>` : ""}</td></tr></table>`;
    if (b.type === "titre") return `<h1 style="${css(s.titre)}">${enHtml(texte)}</h1>`;
    if (b.type === "bouton") return `<div style="${css(s.zoneBouton)}"><a href="${echapper(remplir(b.lien, vars))}" style="${css(s.bouton)}">${enHtml(texte)}</a></div>`;
    if (b.type === "image") {
      if (!b.src) return "";
      const img = `<img src="${echapper(b.src)}" alt="" width="500" style="${css(s.image)}">`;
      return b.lien ? `<a href="${echapper(remplir(b.lien, vars))}">${img}</a>` : img;
    }
    if (b.type === "separateur") return `<hr style="${css(s.separateur)}">`;
    if (b.type === "citation") return `<blockquote style="${css(s.citation)}">${enHtml(texte)}${b.auteur ? `<span style="${css(s.auteur)}">${enHtml(remplir(b.auteur, vars))}</span>` : ""}</blockquote>`;
    if (b.type === "colonnes") return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px"><tr><td style="${css({ ...s.colonne, paddingRight: "12px" })}">${enHtml(remplir(b.gauche, vars))}</td><td style="${css({ ...s.colonne, paddingLeft: "12px" })}">${enHtml(remplir(b.droite, vars))}</td></tr></table>`;
    if (b.type === "signature") return `<p style="${css(s.signature)}">${enHtml(texte)}</p>`;
    return `<p style="${css(s.texte)}">${enHtml(texte)}</p>`;
  };
  const corps = parts.corps.map(enHtmlBloc).join("\n");
  const logoImg = (taille) => (logo && design?.logo !== false ? `<img src="${echapper(logo)}" alt="Klocka" width="${taille}" height="${taille}" style="display:inline-block;vertical-align:middle;border-radius:${Math.round(taille / 4)}px">` : "");
  const enTete = s.g === "lettre"
    ? `<p style="${css(s.entete)}">${logoImg(22)}${logo && design?.logo !== false ? "&nbsp;&nbsp;" : ""}Klocka · ${echapper(mentionDe(design))}</p>`
    : familleNote(s.g) || s.g === "dossier" ? "" : logoImg(40) ? `<div style="${css(s.logo)}">${logoImg(40)}</div>` : "";
  const piedNeuf = s.g !== "carte";
  const pied = desinscription
    ? piedNeuf
      ? `<p style="${css(s.pied)}">Vous recevez cet email car vous avez participé à un webinaire Klocka.<br>Klocka · ${echapper(adresse || "murs commerciaux")} · <a href="${echapper(desinscription)}" style="${css(s.lienPied)}">Se désinscrire</a></p>`
      : `<p style="${css(s.pied)}">Klocka · murs commerciaux<br>Vous recevez ce mail après votre inscription. <a href="${echapper(desinscription)}" style="${css(s.lienPied)}">Se désinscrire</a></p>`
    : "";
  // Le texte d'aperçu (preheader) : ce que la boîte affiche sous l'objet.
  const preheader = apercu ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${echapper(remplir(apercu, vars))}</div>` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">${lienPolices(design) ? `<link href="${echapper(lienPolices(design))}" rel="stylesheet">` : ""}</head>
<body style="margin:0;padding:0;background-color:${s.t.page}">${preheader}
${s.g === "dossier" ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css(s.page)}"><tr><td>
<div style="${css(s.bandeInterieur)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${css(s.marque)}">${logoImg(28)}${logoImg(28) ? "&nbsp;&nbsp;" : ""}Klocka</td><td style="${css(s.mention)}">${echapper(mentionDe(design))}</td></tr></table></div>
<div style="${css(s.carte)}">
${corps}
${parts.apres.map((b) => `<div style="${css(s.rdvPied)}">${enHtmlBloc(b)}</div>`).join("\n")}</div>${pied}
</td></tr></table>` : familleNote(s.g) ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css(s.page)}">
<tr><td style="${css(s.bande)}"><div style="${css(s.bandeInterieur)}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="${css(s.marque)}">${logoImg(28)}${logoImg(28) ? "&nbsp;&nbsp;" : ""}Klocka</td><td style="${css(s.mention)}">${s.mentionPastille ? `<span style="${css(s.mentionPastille)}">${echapper(mentionDe(design))}</span>` : echapper(mentionDe(design))}</td></tr></table>
${parts.bande.map((b) => (b.type === "surtitre" ? `<p style="${css(s.surtitreBande)}">${enHtml(remplir(b.texte, vars))}</p>` : `<h1 style="${css(s.titreBande)}">${enHtml(remplir(b.texte, vars))}</h1>`)).join("\n")}</div></td></tr>
<tr><td style="${css(s.zoneCarte)}"><div style="${css(s.carte)}">
${corps}
</div>${parts.apres.map((b) => `<div style="${css(s.rdvCarte)}">${enHtmlBloc(b)}</div>`).join("\n")}${pied}</td></tr></table>` : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css(s.page)}"><tr><td>
<div style="${css(s.carte)}">${enTete}
${corps}
</div>${pied}
</td></tr></table>`}</body></html>`;
  return { html, texte: versTexte(design, vars, desinscription, contact) };
}

/** Pure : la version texte, pour les boîtes qui ne lisent pas le HTML. */
export function versTexte(design, vars = {}, desinscription = null, contact = null) {
  const lignes = (design?.blocs || []).filter((b) => blocVisible(b, contact)).map((b) => {
    const t = remplir(b.texte, vars).replace(/\*\*/g, "");
    if (b.type === "colonnes") return [remplir(b.gauche, vars), remplir(b.droite, vars)].join("\n\n").replace(/\*\*/g, "");
    if (b.type === "citation") return `« ${t} »${b.auteur ? ` ${remplir(b.auteur, vars)}` : ""}`;
    if (b.type === "bouton") return `${t} : ${remplir(b.lien, vars)}`;
    if (b.type === "separateur") return "----";
    if (b.type === "image") return "";
    if (b.type === "points") return (b.items || []).map((x) => `- ${remplir(x.titre, vars)} ${remplir(x.texte, vars)}`.trim()).join("\n").replace(/\*\*/g, "");
    if (b.type === "tableau") return [(b.entetes || []).map((x) => remplir(x, vars)).join(" | "), ...(b.lignes || []).map((x) => `${remplir(x.a, vars)} | ${remplir(x.b, vars)}`)].join("\n").replace(/\*\*/g, "");
    if (b.type === "chiffres") return (b.items || []).map((x) => `${remplir(x.label, vars)} : ${remplir(x.valeur, vars)}`).join("\n");
    if (b.type === "etapes") return (b.items || []).map((x, k) => `${k + 1}. ${x.titre ? `${remplir(x.titre, vars)} : ` : ""}${remplir(x.texte, vars)}`).join("\n").replace(/\*\*/g, "");
    if (b.type === "verdict") return `${remplir(b.titre, vars)}\n${t}`.trim();
    if (b.type === "rdv") return [remplir(b.titre, vars), remplir(b.texte, vars), b.lien ? `${remplir(b.lien_texte, vars) || "Lien"} : ${remplir(b.lien, vars)}` : ""].filter(Boolean).join("\n");
    if (b.type === "signature" && b.sous_titre) return `${t}\n${remplir(b.sous_titre, vars)}`;
    return t;
  }).filter(Boolean);
  if (desinscription) lignes.push("", `Se désinscrire : ${desinscription}`);
  return lignes.join("\n\n");
}
