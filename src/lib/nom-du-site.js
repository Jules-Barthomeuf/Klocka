// Le nom d'une page du locataire, pour sa bannière et son « Voir sur … » (26 nov. 2026, Jules : « pour chaque page, si ce
// n'est ni le site web ni un des réseaux, tu mets le titre de ce que c'est dans l'image et “Voir sur machin” ; il faut que
// ça marche pour tout type de site, de plateforme »). Une plateforme connue garde son nom écrit comme elle l'écrit ; une
// autre prend le nom de son domaine, en capitale (« lebonbail.fr » → « Lebonbail ») ; le site du locataire lui-même (type
// « site_web » sans plateforme reconnue) reste « Site web » et « Voir le site ».

const PLATEFORMES = [
  [/(^|\.)instagram\.com$/, "Instagram"],
  [/(^|\.)facebook\.com$/, "Facebook"],
  [/(^|\.)linkedin\.com$/, "LinkedIn"],
  [/(^|\.)tripadvisor\.[a-z.]+$/, "Tripadvisor"],
  [/(^|\.)(google\.[a-z.]+|goo\.gl|g\.page)$/, "Google"],
  [/(^|\.)pappers\.fr$/, "Pappers"],
  [/(^|\.)ubereats\.com$/, "Uber Eats"],
  [/(^|\.)deliveroo\.[a-z.]+$/, "Deliveroo"],
  [/(^|\.)just-?eat\.[a-z.]+$/, "Just Eat"],
  [/(^|\.)(thefork|lafourchette)\.[a-z.]+$/, "TheFork"],
  [/(^|\.)pagesjaunes\.fr$/, "PagesJaunes"],
  [/(^|\.)(x|twitter)\.com$/, "X"],
  [/(^|\.)tiktok\.com$/, "TikTok"],
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, "YouTube"],
  [/(^|\.)pinterest\.[a-z.]+$/, "Pinterest"],
  [/(^|\.)doctolib\.fr$/, "Doctolib"],
  [/(^|\.)planity\.com$/, "Planity"],
  [/(^|\.)treatwell\.[a-z.]+$/, "Treatwell"],
  [/(^|\.)yelp\.[a-z.]+$/, "Yelp"],
  [/(^|\.)societe\.com$/, "Societe.com"],
  [/(^|\.)infogreffe\.fr$/, "Infogreffe"],
  [/(^|\.)bodacc\.fr$/, "BODACC"],
  [/(^|\.)annuaire-entreprises\.data\.gouv\.fr$/, "Annuaire des Entreprises"],
  [/(^|\.)wikipedia\.org$/, "Wikipédia"],
];

const hote = (url) => { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; } };

/**
 * Pure : { nom, libelle, plateforme } d'une page. `type` est celui de la ligne (« site_web », « instagram », « autre »…),
 * `label` le nom saisi s'il y en a un.
 */
export function nomDuSite(url, { type = null, label = null } = {}) {
  const h = hote(url);
  const connue = PLATEFORMES.find(([re]) => re.test(h));
  if (type === "google_avis") return { nom: "Google", libelle: "Voir les avis Google", plateforme: true };
  if (connue) return { nom: connue[1], libelle: `Voir sur ${connue[1]}`, plateforme: true };
  // Le site du locataire : pas de nom de plateforme à donner.
  if (!type || type === "site_web") return { nom: "Site web", libelle: "Voir le site", plateforme: false };
  // Une autre page : le nom saisi, sinon le domaine sans son extension.
  const saisi = String(label || "").trim();
  const nom = saisi && !/^autre$/i.test(saisi) ? saisi : nomDuDomaine(h);
  return nom ? { nom, libelle: `Voir sur ${nom}`, plateforme: false } : { nom: "Site web", libelle: "Voir le site", plateforme: false };
}

/** Pure : « app.lebonbail.fr » → « Lebonbail » ; « mon-commerce.co.uk » → « Mon-commerce ». */
export function nomDuDomaine(h) {
  const parts = String(h || "").split(".").filter(Boolean);
  if (parts.length < 2) return parts[0] ? cap(parts[0]) : "";
  // L'extension en deux morceaux (co.uk, com.au, gouv.fr) ne compte pas.
  const deux = /^(co|com|org|net|gouv|ac)$/.test(parts[parts.length - 2]) && parts.length >= 3;
  const nom = parts[parts.length - (deux ? 3 : 2)];
  return cap(nom);
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
