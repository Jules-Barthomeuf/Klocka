// Prospecter pour un client (24 oct. 2026, Jules : « je ne veux plus qu'on cherche un type de commerce, je veux qu'on
// cherche en fonction des clients qu'on a ; le mandataire ne dit plus "faites-moi confiance pour le vendre", il dit
// "j'ai déjà un acheteur qui cherche exactement ça" »). Pur : partagé par l'écran et les tests.

const nz = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
// Les mots d'une demande qui ne disent pas une activité (« Murs commerciaux », « Tout type de commerce »).
const VIDES = new Set(["commerce", "commerces", "commercial", "commerciaux", "commerciale", "local", "locaux", "murs", "tout", "tous", "toute", "type", "types", "bien", "biens", "occupe", "occupes", "occupee", "avec", "pour", "dans", "loue", "loues", "bail", "pied", "immeuble", "boutique", "boutiques", "activite", "activites", "rendement"]);

/** Pure : les racines des activités qu'un client cherche (« Boulangerie, coiffure » → boul, coif). Vide : toute activité. */
export function racinesDuType(type) {
  return [...new Set(nz(type).split(/[^a-z]+/).filter((m) => m.length > 3 && !VIDES.has(m)).map((m) => m.slice(0, 4)))];
}

// Les familles d'activité qu'un client écarte dans ses remarques (« Pas de pro de la santé comme locataire »).
const FAMILLES_EXCLUES = [
  { cle: "sante", mot: "santé", dit: /sant[eé]|m[eé]dical|pharmac/i, activite: /pharma|m[eé]dic|dentaire|kin[eé]|optic|laborat|infirm|orthop|audio|sant[eé]|clinique|v[eé]t[eé]rin/i },
  { cle: "restauration", mot: "restauration", dit: /restaura|food|snack|fast/i, activite: /restaura|snack|kebab|pizz|burger|sushi|traiteur|fast/i },
  { cle: "bar", mot: "bars", dit: /\bbars?\b|d[eé]bit de boissons|nuit/i, activite: /\bbar\b|bars|pub|d[eé]bit de boissons|discoth|cav(e|iste)/i },
  { cle: "beaute", mot: "coiffure et beauté", dit: /coiff|beaut|esth[eé]t|ongl/i, activite: /coiff|beaut|esth[eé]t|ongl|barbier|institut/i },
  { cle: "tabac", mot: "tabac", dit: /tabac|presse|cigarette/i, activite: /tabac|presse|cigarett|vapot/i },
];

/** Pure : ce que les remarques d'un client écartent (« pas de santé », « sans restauration », « hors bars »). */
export function exclusionsDe(d) {
  const texte = `${d?.remarque || ""} ${d?.information || ""} ${d?.bail || ""}`;
  const out = [];
  for (const m of texte.matchAll(/\b(?:pas de|pas d'|sans|hors|aucun(?:e)?|jamais de|exclure|[eé]viter)\s+([^.;,\n]{2,60})/gi)) {
    for (const f of FAMILLES_EXCLUES) if (f.dit.test(m[1]) && !out.some((x) => x.cle === f.cle)) out.push(f);
  }
  return out;
}

/** Pure : le client exige-t-il un emplacement n°1 (« Emplacement N1 ou retail park ») ? */
export const veutEmplacement1 = (d) => /emplacement\s*n?°?\s*1\b|\bn°?\s*1\b|n1\b|premier emplacement/i.test(`${(d?.zones || []).join(" ")} ${d?.remarque || ""} ${d?.bail || ""}`);

/** Pure : le client veut-il une enseigne nationale comme locataire (« Enseigne national / entrepot ») ? */
export const veutEnseigneNationale = (d) => /enseignes?\s+nationa|grandes?\s+enseignes?|locataire\s+national/i.test(`${(d?.zones || []).join(" ")} ${d?.remarque || ""} ${d?.bail || ""} ${d?.information || ""}`);

/**
 * Pure : ce commerce répond-il à la demande du client ? L'activité (un mot du commerce commence comme un mot cherché :
 * « coiffure » trouve « coiffeur »), puis le prix estimé face au budget, à 20 % près. Un prix inconnu ne l'écarte pas.
 */
export function pourClient(c, d) {
  if (!d) return true;
  const racines = racinesDuType(d.type_commerce);
  if (racines.length) {
    const mots = nz(`${c.activite || ""} ${c.enseigne || ""} ${c.nom || ""} ${c.nom_google || ""}`).split(/[^a-z]+/).filter(Boolean);
    if (!racines.some((r) => mots.some((m) => m.startsWith(r)))) return false;
  }
  // Les activités qu'il écarte, et l'emplacement n°1 qu'il exige (le centre commerçant de la ville).
  const activiteTexte = `${c.activite || ""} ${c.enseigne || ""} ${c.nom || ""} ${c.nom_google || ""}`;
  if (exclusionsDe(d).some((f) => f.activite.test(activiteTexte))) return false;
  if (veutEmplacement1(d) && c.centre === false) return false;
  if (veutEnseigneNationale(d) && c.chaine === false) return false;
  const max = Number(d.budget_max) || null;
  const min = Number(d.budget_min) || null;
  if (c.prix && (max || min)) {
    if (max && Number(c.prix.basse) > max * 1.2) return false;
    if (min && Number(c.prix.haute) < min * 0.8) return false;
  }
  return true;
}

/** Pure : « 450 k€ », « 1,7 M€ ». */
export function kEuros(v) {
  const n = Number(v);
  if (!n) return null;
  return n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString("fr-FR")} M€` : `${Math.round(n / 1000)} k€`;
}

/** Pure : le budget d'un client en clair. */
export function budgetDe(d) {
  const a = kEuros(d?.budget_min);
  const b = kEuros(d?.budget_max);
  return a && b ? `${a} – ${b}` : b ? `jusqu'à ${b}` : a ? `à partir de ${a}` : "Budget non précisé";
}

/** Pure : ce que le mandataire dit au propriétaire, pour ce commerce et ce client. */
export function accroche(c, d) {
  const quoi = d?.type_commerce ? `des murs ${/^[aeiouyh]/i.test(d.type_commerce) ? "d'" : "de "}${String(d.type_commerce).toLowerCase()}` : "des murs de commerce";
  const prix = c?.prix?.moyenne ? ` Votre local se situerait autour de ${kEuros(c.prix.moyenne)}.` : "";
  const b = budgetDe(d);
  const budget = b === "Budget non précisé" ? "budget à préciser" : /^\d/.test(b) ? `budget ${b}` : b;
  return `J'ai un acquéreur qui cherche exactement ${quoi} dans votre secteur, ${budget}.${prix} Seriez-vous ouvert à en discuter ?`;
}
