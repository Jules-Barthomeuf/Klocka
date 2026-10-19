// La couleur personnalisée de la barre (19 oct. 2026, Jules : « le truc Personnaliser ne marche pas, change-le »).
// Le sélecteur libre laissait choisir n'importe quelle couleur : un vert vif inondait la barre, les panneaux et les
// cartes, et le texte devenait illisible ; un clic sur « Personnaliser » ne changeait rien de visible. On ne choisit
// plus que la teinte (0 à 359) et l'intensité (0 à 100) ; la clarté est fixée par le mode, celle d'une barre où le
// texte reste lisible. Sans alias : les tests du serveur l'importent.

const CLARTE = { sombre: 0.11, clair: 0.94 };
const SATURATION_MAX = { sombre: 0.45, clair: 0.5 };

/** Pure : la teinte de départ d'une barre personnalisée, visible tout de suite (un bleu-gris). */
export const TEINTE_DEPART = { teinte: 210, intensite: 45 };

const hex2 = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, "0");

/** Pure : teinte (degrés), intensité (0-100), mode (« sombre » ou « clair ») → la couleur de la barre, en hexadécimal. */
export function barreDepuisTeinte(teinte, intensite, mode = "sombre") {
  const m = mode === "clair" ? "clair" : "sombre";
  const h = ((Number(teinte) % 360) + 360) % 360;
  const s = (Math.min(100, Math.max(0, Number(intensite) || 0)) / 100) * SATURATION_MAX[m];
  const l = CLARTE[m];
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const k = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return `#${hex2((r + k) * 255)}${hex2((g + k) * 255)}${hex2((b + k) * 255)}`;
}

/** Pure : la teinte et l'intensité d'une barre déjà choisie, pour replacer les curseurs. */
export function teinteDeBarre(hex, mode = "sombre") {
  const m = mode === "clair" ? "clair" : "sombre";
  const v = /^#[0-9a-f]{6}$/i.test(String(hex || "")) ? String(hex) : null;
  if (!v) return { ...TEINTE_DEPART };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d) h = max === r ? 60 * (((g - b) / d) % 6) : max === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return { teinte: Math.round((h + 360) % 360), intensite: Math.round(Math.min(100, (s / SATURATION_MAX[m]) * 100)) };
}

// Les curseurs se montrent plus clairs que la barre (à la clarté de la barre, en sombre, tout serait noir) :
// on y voit les couleurs ; l'aperçu, lui, montre la vraie teinte.
const VUE = { sombre: 38, clair: 78 };

/** Pure : le dégradé du curseur de teinte. */
export const degradeTeintes = (mode = "sombre") =>
  `linear-gradient(to right, ${[0, 45, 90, 135, 180, 225, 270, 315, 359].map((h) => `hsl(${h} 55% ${VUE[mode === "clair" ? "clair" : "sombre"]}%)`).join(", ")})`;

/** Pure : le dégradé du curseur d'intensité, du gris à la teinte pleine. */
export const degradeIntensite = (teinte, mode = "sombre") => {
  const l = VUE[mode === "clair" ? "clair" : "sombre"];
  return `linear-gradient(to right, hsl(${teinte} 0% ${l}%), hsl(${teinte} 60% ${l}%))`;
};
