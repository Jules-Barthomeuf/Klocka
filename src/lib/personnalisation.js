// La personnalisation : ce que chacun règle pour lui, et qui s'applique à
// toute l'application.
//
// Tout tient dans un objet de préférences, normalisé ici (une valeur inconnue
// retombe sur le défaut), gardé en copie locale pour le premier rendu, et
// enregistré sur le compte pour suivre la personne d'un appareil à l'autre
// (PersonnalisationProvider). L'application se fait sur <html> : un attribut
// de thème et quelques variables CSS, que Tailwind et les styles en ligne
// lisent déjà. Aucun écran n'a à savoir qu'une préférence existe.
//
// Les couleurs des accents et des fonds vivent dans src/design/jetons.json,
// le seul endroit où une couleur s'écrit : ici on ne fait que les lire, et
// dériver la famille d'un accent (clair, survol, foncé, texte posé dessus).
import jetons from "@/design/jetons.json";
import { pageDeChemin } from "@/lib/adresses";

export const CLE_LOCALE = "klocka-personnalisation";
// L'ancienne clé du thème seul : reprise une fois, pour qui avait choisi le clair.
const ANCIENNE_CLE_THEME = "klocka-theme";
export const SOMBRE = "sombre";
export const CLAIR = "clair";

export const DEFAUT = Object.freeze({
  mode: "sombre", // sombre | clair | appareil
  accent: "menthe",
  // La couleur d'accent personnalisée, enregistrée (9 oct. 2026) : on la retrouve même après être revenu à une teinte proposée.
  accent_perso: null,
  fond_sombre: "noir", // noir (chaud, maquette) | profond (noir pur) | anthracite
  fond_clair: "perle", // perle (gris chaud, maquette) | blanc
  // La couleur de la barre latérale, que reprennent les panneaux en bg-rail
  // (9 oct. 2026) : une teinte de jetons.barres, ou n'importe quel #rrggbb.
  barre_sombre: "origine",
  barre_clair: "origine",
  halo: false,
  surfaces: "verre", // verre | plein
  police: "instrument", // instrument | figtree | montserrat | systeme
  boutons: "pilule", // pilule | arrondi | carre
  taille: 100, // 90 | 100 | 110 | 120
  animations: "normales", // normales | reduites
  accueil: "Dashboard",
  barre: "depliee", // depliee | repliee (un rail d'icônes)
  menu_masques: [],
  menu_ordre: [],
  menu_autre: null, // les clés rangées dans « Autre » ; null : les groupes d'origine
  assistant: "droite", // droite | gauche | masquee
  grille: ["panneaux", "listes"], // où poser la grille de points : panneaux | listes | barre | fond
  grille_intensite: 50, // la force des points, de 10 (à peine) à 100 (marqués) ; 50 : celle d'origine
  points_actions: "oui", // les points dans la fenêtre des actions proposées (8 oct. 2026) : oui | non
});

/** Les choix offerts, dans l'ordre où la page les montre : [valeur, libellé]. */
export const OPTIONS = {
  mode: [[SOMBRE, "Sombre"], [CLAIR, "Clair"], ["appareil", "Comme l'appareil"]],
  accent: Object.entries(jetons.accents).map(([cle, a]) => [cle, a.nom]),
  fond_sombre: [["noir", "Noir chaud"], ["profond", "Noir pur"], ["anthracite", "Anthracite"]],
  fond_clair: [["perle", "Gris perle"], ["blanc", "Blanc"]],
  halo: [[true, "Avec"], [false, "Sans"]],
  surfaces: [["verre", "Verre translucide"], ["plein", "Aplats opaques"]],
  police: [["instrument", "Instrument Sans"], ["figtree", "Figtree"], ["montserrat", "Montserrat"], ["systeme", "Celle du système"]],
  boutons: [["pilule", "Pilules"], ["arrondi", "Angles arrondis"], ["carre", "Carrés"]],
  taille: [[90, "90 %"], [100, "100 %"], [110, "110 %"], [120, "120 %"]],
  animations: [["normales", "Normales"], ["reduites", "Réduites"]],
  barre: [["depliee", "Dépliée"], ["repliee", "Repliée"]],
  assistant: [["droite", "En bas à droite"], ["gauche", "En bas à gauche"], ["masquee", "Masquée"]],
  grille: [["panneaux", "Panneaux et fenêtres"], ["listes", "Listes de prospection"], ["barre", "Barre latérale"], ["fond", "Fond des pages"]],
  points_actions: [["oui", "Avec des points"], ["non", "Sans points"]],
};

/** Les polices, telles que le CSS les lit. Toutes sont déjà chargées (index.html). */
export const POLICES = {
  instrument: "'Instrument Sans', Inter, system-ui, sans-serif",
  figtree: "Figtree, 'Instrument Sans', system-ui, sans-serif",
  montserrat: "Montserrat, 'Instrument Sans', system-ui, sans-serif",
  systeme: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
};

const CHOIX = Object.fromEntries(Object.entries(OPTIONS).map(([k, liste]) => [k, liste.map(([v]) => v)]));

/** Des préférences complètes et sûres : ce qui manque ou n'existe pas retombe sur le défaut. */
export function normaliser(brut) {
  const p = { ...DEFAUT, ...(brut && typeof brut === "object" ? brut : {}) };
  p.taille = Number(p.taille);
  p.halo = p.halo !== false && p.halo !== "false";
  for (const t of ["sombre", "clair"]) {
    const v = String(p[`barre_${t}`] || "");
    p[`barre_${t}`] = jetons.barres[t][v] ? v : /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : "origine";
  }
  // Un accent personnalisé est un code couleur ; il échappe à la liste des teintes proposées.
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? String(v).toLowerCase() : null);
  p.accent_perso = hex(p.accent_perso);
  const accentPerso = hex(p.accent);
  for (const [k, valeurs] of Object.entries(CHOIX)) if (k !== "halo" && k !== "grille" && !(k === "accent" && accentPerso) && !valeurs.includes(p[k])) p[k] = DEFAUT[k];
  if (accentPerso) p.accent = accentPerso;
  p.grille = Array.isArray(p.grille) ? [...new Set(p.grille.map(String).filter((z) => CHOIX.grille.includes(z)))] : [...DEFAUT.grille];
  const force = Math.round(Number(p.grille_intensite));
  p.grille_intensite = Number.isFinite(force) ? Math.min(100, Math.max(10, force)) : DEFAUT.grille_intensite;
  p.accueil = typeof p.accueil === "string" && /^[A-Za-z]{2,40}$/.test(p.accueil) ? p.accueil : DEFAUT.accueil;
  p.menu_masques = Array.isArray(p.menu_masques) ? p.menu_masques.map(String).slice(0, 40) : [];
  p.menu_ordre = Array.isArray(p.menu_ordre) ? p.menu_ordre.map(String).slice(0, 40) : [];
  p.menu_autre = Array.isArray(p.menu_autre) ? p.menu_autre.map(String).slice(0, 40) : null;
  p.menu_masques = p.menu_masques.filter((c) => c !== "Personnalisation");
  return p;
}

/** La copie locale, pour peindre avant que le compte ait répondu. */
export function lirePrefs() {
  try {
    const brut = localStorage.getItem(CLE_LOCALE);
    if (brut) return normaliser(JSON.parse(brut));
    const ancien = localStorage.getItem(ANCIENNE_CLE_THEME);
    return normaliser(ancien === CLAIR ? { mode: CLAIR } : {});
  } catch {
    // Navigation privée, stockage refusé : les défauts.
    return { ...DEFAUT };
  }
}

export function ecrirePrefsLocales(p) {
  try {
    localStorage.setItem(CLE_LOCALE, JSON.stringify(p));
  } catch { /* stockage refusé : la préférence vaut pour cette page */ }
}

/** Le thème réellement affiché : « comme l'appareil » suit le réglage du système. */
export function themeEffectif(p) {
  if (p.mode === "appareil") {
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? CLAIR : SOMBRE;
  }
  return p.mode === CLAIR ? CLAIR : SOMBRE;
}

// --- Couleurs : lire un hexadécimal, éclaircir ou assombrir -----------------

const hexVersRgb = (hex) => {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbVersHsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
};
const hslVersRgb = ([h, s, l]) => {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((x) => Math.round(x * 255));
};
const luminosite = (rgb, delta) => {
  const [h, s, l] = rgbVersHsl(rgb);
  return hslVersRgb([h, s, Math.max(0, Math.min(1, l + delta))]);
};
const triplet = (rgb) => rgb.join(" ");
// La luminance relative (WCAG), pour savoir si un texte clair reste lisible sur une teinte.
const luminance = (rgb) => {
  const [r, g, b] = rgb.map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** La teinte de la barre choisie pour un thème, en hexadécimal. */
export function barreHex(p, theme) {
  const t = theme === CLAIR ? "clair" : "sombre";
  const v = p[`barre_${t}`] || "origine";
  return jetons.barres[t][v]?.teinte || (v.startsWith("#") ? v : jetons.barres[t].origine.teinte);
}

/** Le texte de l'application reste-t-il lisible sur cette barre (contraste 4,5 au moins) ? */
export function barreLisible(hex, theme) {
  const texte = hexVersRgb(theme === CLAIR ? jetons.couleurs_clair.encre : jetons.couleurs.encre);
  const [a, b] = [luminance(hexVersRgb(hex)), luminance(texte)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05) >= 4.5;
}

// Le sélecteur de couleur pense en teinte, saturation, valeur (le carré et le spectre).
export const hexVersHsv = (hex) => {
  const [r, g, b] = hexVersRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, max ? d / max : 0, max];
};
export const hsvVersHex = (h, s, v) => {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return `#${[f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
};

/** L'accent choisi, en hexadécimal, pour un thème : ce que la page montre en pastille. */
export const accentHex = (cle, theme) => (/^#[0-9a-f]{6}$/i.test(String(cle || "")) ? String(cle).toLowerCase() : (jetons.accents[cle] || jetons.accents.menthe)[theme === CLAIR ? "clair" : "sombre"]);

/**
 * La famille d'un accent : les sept jetons que la menthe occupe, dérivés de
 * la teinte de base pour un thème. En sombre les variantes s'éclaircissent,
 * en clair elles s'assombrissent, et le texte posé sur un bouton plein est
 * sombre sur un accent pâle, blanc sur un accent foncé.
 */
export function famille(cle, theme) {
  const clair = theme === CLAIR;
  const base = hexVersRgb(accentHex(cle, theme));
  return {
    menthe: base,
    "menthe-clair": luminosite(base, clair ? -0.08 : 0.14),
    "menthe-survol": luminosite(base, clair ? -0.05 : 0.07),
    "menthe-fonce": luminosite(base, clair ? -0.14 : -0.1),
    "menthe-texte": clair ? luminosite(base, -0.08) : base,
    "sur-menthe": clair ? [255, 255, 255] : luminosite(base, -0.55),
    ecrire: base,
  };
}

/** Pose le thème sur <html> : l'attribut, la classe des composants shadcn, les éléments natifs. */
let finFondu = null;
export function appliquerTheme(theme) {
  const clair = theme === CLAIR;
  const racine = document.documentElement;
  // Le passage sombre/clair se fond sur 300 ms : la classe pose une
  // transition sur tout, le temps du changement. Jamais au premier
  // affichage, ni quand la personne (ou son système) réduit le mouvement.
  const avant = racine.getAttribute("data-theme") === CLAIR ? CLAIR : SOMBRE;
  const apres = clair ? CLAIR : SOMBRE;
  const reduit = racine.getAttribute("data-animations") === "reduites"
    || (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  if (racine.dataset.themePret && avant !== apres && !reduit) {
    racine.classList.add("k-theme-fondu");
    clearTimeout(finFondu);
    finFondu = setTimeout(() => racine.classList.remove("k-theme-fondu"), 350);
  }
  racine.dataset.themePret = "1";
  if (clair) racine.setAttribute("data-theme", CLAIR);
  else racine.removeAttribute("data-theme");
  racine.classList.toggle("dark", !clair);
  racine.style.colorScheme = clair ? "light" : "dark";
}

/**
 * Applique des préférences à la page. Appelé au démarrage (main.jsx) avant le
 * premier rendu, puis à chaque changement. Ne retire que ce qu'il a posé :
 * un réglage revenu au défaut rend la main à la feuille de style.
 */
// Les pages d'avant la connexion (l'accueil, l'arrivée par invitation) ont
// toujours le même visage : celui par défaut, quels que soient les réglages
// gardés dans ce navigateur. On y arrive et on en repart par un rechargement
// complet, qui réapplique les réglages de la personne.
const PAGES_NEUTRES = new Set(["", "Home", "Bienvenue"]);
export const pageNeutre = () => typeof window !== "undefined" && PAGES_NEUTRES.has(pageDeChemin(window.location.pathname));

export function appliquerPrefs(brut) {
  if (typeof document === "undefined") return;
  const p = normaliser(pageNeutre() ? DEFAUT : brut);
  const theme = themeEffectif(p);
  const clair = theme === CLAIR;
  appliquerTheme(theme);
  const racine = document.documentElement;
  const st = racine.style;
  const poser = (nom, valeur) => (valeur == null ? st.removeProperty(nom) : st.setProperty(nom, valeur));

  // L'accent : la famille menthe, recalculée pour le thème en cours. La
  // menthe elle-même reste aux valeurs de la feuille de style.
  const fam = p.accent === "menthe" ? null : famille(p.accent, theme);
  for (const nom of ["menthe", "menthe-clair", "menthe-survol", "menthe-fonce", "menthe-texte", "sur-menthe", "ecrire"]) {
    poser(`--k-${nom}-rgb`, fam ? triplet(fam[nom]) : null);
  }

  // Le fond, et le halo qui en découle.
  const choixFond = clair ? p.fond_clair : p.fond_sombre;
  const fond = jetons.fonds[clair ? "clair" : "sombre"][choixFond];
  const fondDefaut = clair ? choixFond === "perle" : choixFond === "noir";
  poser("--k-fond-rgb", fondDefaut || !fond ? null : triplet(hexVersRgb(fond.fond)));
  poser("--k-fond-halo-rgb", fondDefaut || !fond ? null : triplet(hexVersRgb(fond.halo)));
  // En anthracite, la barre de chat (et les bulles envoyées, qui partagent son
  // jeton) se confondrait avec le fond : elle prend la teinte de la barre de
  // navigation (décision du 3 oct. 2026).
  // La barre latérale choisie (9 oct. 2026) : elle et tous les panneaux en
  // bg-rail prennent sa teinte ; la barre de chat la suit aussi dès qu'elle
  // n'est plus celle d'origine. Le survol s'adapte : un voile clair sur une
  // barre sombre, foncé sur une barre claire.
  const choixBarre = p[clair ? "barre_clair" : "barre_sombre"];
  const barre = hexVersRgb(barreHex(p, theme));
  const barreChoisie = choixBarre !== "origine";
  poser("--k-rail-rgb", barreChoisie ? triplet(barre) : null);
  poser("--k-rail-actif", barreChoisie ? (luminance(barre) > 0.35 ? "rgba(28, 29, 28, 0.08)" : "rgba(242, 243, 245, 0.08)") : null);
  poser("--k-barre-rgb", barreChoisie || (!clair && choixFond === "anthracite") ? triplet(barreChoisie ? barre : hexVersRgb(jetons.couleurs.rail)) : null);

  // Le fond des cartes à grille, des tableaux et des champs de recherche : la
  // teinte d'un onglet au repos, la surface à 60 % sur le fond choisi. Calculé
  // ici pour que le noir pur, l'anthracite ou le blanc aient chacun la leur.
  const surfacePleine = hexVersRgb((clair ? jetons.couleurs_clair : jetons.couleurs)["surface-pleine"]);
  const fondRgb = hexVersRgb(fond?.fond || (clair ? jetons.couleurs_clair : jetons.couleurs).fond);
  poser("--k-carte-grille-rgb", barreChoisie ? triplet(barre) : triplet(surfacePleine.map((c, i) => Math.round(c * 0.6 + fondRgb[i] * 0.4))));

  // Les surfaces : du verre, ou des aplats.
  const aplats = p.surfaces === "plein" ? jetons.surfaces_pleines[clair ? "clair" : "sombre"] : null;
  // Une barre choisie l'emporte : toutes les cartes, panneaux et fenêtres
  // prennent sa teinte (9 oct. 2026). Les champs et menus montent d'un cran,
  // le relief (survol, case active) de deux, pour rester visibles dessus.
  const cran = (d) => triplet(luminosite(barre, luminance(barre) > 0.35 ? -d : d));
  poser("--k-surface", barreChoisie ? `rgb(${triplet(barre)})` : aplats ? aplats.surface : null);
  poser("--k-relief", barreChoisie ? `rgb(${cran(0.06)})` : aplats ? aplats.relief : null);
  poser("--k-surface-pleine-rgb", barreChoisie ? cran(0.03) : null);
  poser("--k-barre-relief-rgb", barreChoisie ? cran(0.07) : null);

  // La police : la même partout, ALX compris, dès qu'on en choisit une.
  const police = p.police === "instrument" ? null : POLICES[p.police];
  poser("--k-police", police);
  poser("--k-police-alx", police);

  racine.dataset.halo = p.halo ? "1" : "0";
  racine.dataset.boutons = p.boutons;
  racine.dataset.animations = p.animations;
  racine.dataset.assistant = p.assistant;
  // Les zones où la grille de points se dessine (index.css, .k-grid et .k-points).
  racine.dataset.grille = p.grille.join(" ");
  racine.dataset.pointsActions = p.points_actions;
  // Leur force : 50 rend les points d'origine, 100 les double.
  poser("--k-grid-force", p.grille_intensite === 50 ? null : String(p.grille_intensite / 50));
  // La taille : tout grossit d'un bloc, texte et espacements.
  st.zoom = p.taille === 100 ? "" : String(p.taille / 100);
}
