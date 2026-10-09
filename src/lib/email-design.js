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

export const TYPES_BLOCS = [
  ["titre", "Titre"], ["texte", "Texte"], ["bouton", "Bouton"], ["image", "Image"], ["citation", "Citation"], ["colonnes", "Deux colonnes"], ["separateur", "Séparateur"], ["signature", "Signature"],
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
  const textes = [etape?.objet, etape?.apercu, ...(etape?.design?.blocs || []).flatMap((b) => [b.texte, b.lien, b.gauche, b.droite, b.auteur])];
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
export function styles(theme) {
  const t = THEMES[theme] || THEMES.clair;
  return {
    t,
    page: { backgroundColor: t.page, padding: "32px 12px", fontFamily: POLICE },
    carte: { backgroundColor: t.carte, borderRadius: "14px", border: `1px solid ${t.trait}`, padding: "36px 40px", maxWidth: "580px", margin: "0 auto" },
    titre: { color: t.titre, fontSize: "24px", lineHeight: "1.3", fontWeight: "600", margin: "0 0 18px", letterSpacing: "-0.01em" },
    texte: { color: t.texte, fontSize: "15px", lineHeight: "1.7", margin: "0 0 18px" },
    bouton: { display: "inline-block", backgroundColor: t.accent, color: t.surAccent, fontSize: "15px", fontWeight: "600", textDecoration: "none", padding: "13px 26px", borderRadius: "999px" },
    zoneBouton: { margin: "8px 0 26px" },
    image: { display: "block", width: "100%", maxWidth: "500px", borderRadius: "10px", margin: "0 0 20px" },
    separateur: { border: "0", borderTop: `1px solid ${t.trait}`, margin: "26px 0" },
    signature: { color: t.texte, fontSize: "15px", lineHeight: "1.6", margin: "24px 0 0", fontWeight: "600" },
    citation: { color: t.titre, fontSize: "17px", lineHeight: "1.6", fontStyle: "italic", margin: "4px 0 22px", padding: "4px 0 4px 18px", borderLeft: `3px solid ${t.accent}` },
    auteur: { display: "block", color: t.doux, fontSize: "13px", fontStyle: "normal", marginTop: "8px" },
    colonne: { color: t.texte, fontSize: "14.5px", lineHeight: "1.65", verticalAlign: "top", width: "50%" },
    logo: { display: "block", margin: "0 0 26px" },
    pied: { color: t.doux, fontSize: "12px", lineHeight: "1.6", textAlign: "center", margin: "18px auto 0", maxWidth: "580px" },
    lienPied: { color: t.doux, textDecoration: "underline" },
  };
}

/**
 * Pure : l'email en HTML et en texte. `desinscription` : le lien de
 * désinscription, posé en pied (obligatoire pour un envoi de prospection,
 * absent d'un mail de la plateforme). `logo` : l'adresse de l'image du logo.
 */
export function rendreEmail(design, vars = {}, { desinscription = null, logo = null, apercu = "", contact = null } = {}) {
  const s = styles(design?.theme);
  const blocs = (design?.blocs || []).filter((b) => blocVisible(b, contact));
  const corps = blocs.map((b) => {
    const texte = remplir(b.texte, vars);
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
  }).join("\n");
  const enTete = logo && design?.logo !== false ? `<img src="${echapper(logo)}" alt="Klocka" width="40" height="40" style="${css({ ...s.logo, borderRadius: "10px" })}">` : "";
  const pied = desinscription
    ? `<p style="${css(s.pied)}">Klocka · murs commerciaux<br>Vous recevez ce mail après votre inscription. <a href="${echapper(desinscription)}" style="${css(s.lienPied)}">Se désinscrire</a></p>`
    : "";
  // Le texte d'aperçu (preheader) : ce que la boîte affiche sous l'objet.
  const preheader = apercu ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${echapper(remplir(apercu, vars))}</div>` : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:0;background-color:${s.t.page}">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${css(s.page)}"><tr><td>
<div style="${css(s.carte)}">${enTete}
${corps}
</div>${pied}
</td></tr></table></body></html>`;
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
    return t;
  }).filter(Boolean);
  if (desinscription) lignes.push("", `Se désinscrire : ${desinscription}`);
  return lignes.join("\n\n");
}
