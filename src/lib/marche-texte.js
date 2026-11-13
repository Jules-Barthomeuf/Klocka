// Les mots du Marché affiné (outils/MarcheAffine.jsx), purs et sans React : montants en k€ et M€, chiffre avant la
// phrase, source en quelques mots, le chiffre qui résume un outil. Testés dans server/outils/marche-texte.test.js.

export const MOT = { ok: "OK", a_voir: "À voir", alerte: "Alerte", vide: "Pas de donnée" };

/** Pure : les montants en k€ et M€, le vrai signe moins. */
export function montants(texte) {
  return String(texte || "").replace(/(-?)(\d{1,3}(?:[\s\u00a0\u202f]\d{3})+) €(?!\/)/g, (tout, signe, n) => {
    const v = Number(n.replace(/\D/g, ""));
    const s = signe ? "−" : "";
    if (v >= 1e6) return `${s}${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })}\u00a0M€`;
    if (v >= 1e4) return `${s}${Math.round(v / 1000).toLocaleString("fr-FR")}\u00a0k€`;
    return tout.replace("-", "−");
  });
}

/** Pure : un message de service (« Google Maps a répondu 403. ») dit sans code. */
export function sansCode(texte) {
  const m = String(texte || "").match(/^(.+?) a répondu \d{3}\.?$/);
  return m ? `${m[1]} indisponible pour l'instant.` : texte;
}

/** Pure : la tête d'une phrase (le chiffre et son unité, un compte comme « 6 exploitants », ou le nom avant « · ») et la suite. */
export function teteEtSuite(texte) {
  const t = montants(texte);
  const n = t.match(/^([\u2212-]?\d[\d\s\u00a0\u202f,.]*\s?(?:€\/m²\/an|€\/m²|k€|M€|€|%|\/\s?10))\s+(.*)$/);
  if (n) return [n[1].replace(/\s?\/\s?10$/, "/10"), n[2]];
  const compte = t.match(/^(\d[\d\s\u00a0\u202f]*\s(?:exploitants?|habitants?|avis))\s+(.*)$/);
  if (compte) return [compte[1], compte[2]];
  const point = t.indexOf(" · ");
  if (point > 0 && point < 48) return [t.slice(0, point), t.slice(point + 3)];
  return [t, ""];
}

/**
 * Pure : la suite réduite au jugement, quand un visuel porte déjà les nombres (12 nov. 2026) : les parenthèses de
 * chiffres, de montants ou de listes de noms tombent, « face à … : » aussi ; « (provisoire : peu de lectures) » reste.
 */
export function suiteCourte(suite) {
  let s = String(suite || "").replace(/\s*\((?:-?\d|[A-ZÉÈ][^()]*,)[^()]*\)/g, "");
  const face = s.match(/^face à .*? : (.*)$/);
  if (face) s = face[1];
  return s.replace(/\s+/g, " ").replace(/\s+([:;,.])/g, " $1").replace(/\s[.,]$/, "").trim();
}

// Les tranches d'effectif de l'INSEE, telles que l'annuaire les code.
const EFFECTIFS = { "00": "0 salarié", "01": "1 ou 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés", 11: "10 à 19 salariés", 12: "20 à 49 salariés", 21: "50 à 99 salariés", 22: "100 à 199 salariés", 31: "200 à 249 salariés", 32: "250 à 499 salariés", 41: "500 à 999 salariés", 42: "1 000 à 1 999 salariés", 51: "2 000 à 4 999 salariés", 52: "5 000 à 9 999 salariés", 53: "10 000 salariés et plus" };
/** Pure : la tranche d'effectif en mots ; null quand l'INSEE ne la renseigne pas (« NN »). */
export function effectifLisible(code) {
  if (code == null || code === "") return null;
  return EFFECTIFS[String(code)] ?? null;
}

/**
 * Pure : le verdict d'une procédure collective en deux temps, le nom puis la suite (« Liquidation judiciaire »,
 * « prononcée le 16/07/2025 ») ; « Aucune » quand il n'y en a pas (12 nov. 2026, bloc Locataire).
 */
export function teteProcedure(texte) {
  const t = String(texte || "");
  if (/^Aucune procédure/.test(t)) return ["Aucune", ""];
  const m = t.match(/^(.*?)\s((?:prononcée|ouverte?|arrêté|close)\s.*)$/);
  if (m) return [m[1], m[2]];
  const le = t.match(/^(.*?)\s(le \d{2}\/\d{2}\/\d{4}.*)$/);
  if (le) return [le[1], le[2]];
  return [t, ""];
}

/** Pure : une source en quelques mots ; l'explication reste dans les preuves. */
export function sourceCourte(s) {
  if (!s) return "—";
  if (/taux valid/i.test(s)) return "Taux Klocka";
  if (/Indice Klocka/i.test(s)) return "Indice Klocka";
  return [...new Set(String(s).split(" et "))].join(" et ").replace(/\s*\(.*\)\s*/g, " ").trim();
}

/** Pure : le chiffre qui résume un outil dans la bande de verdicts. */
export function chiffreDe(o) {
  const r = o.lancement?.resultat;
  if (!r) return o.lancement?.statut === "en_cours" ? "…" : "—";
  const pts = r.points || [];
  const ecart = (p) => { const m = String(p?.resultat || "").match(/(\d+)\s*%\s*(au-dessus|en dessous|en-dessous)/); return m ? `${m[2] === "au-dessus" ? "+" : "−"}${m[1]} %` : null; };
  if (o.cle === "loyer") return ecart(pts.find((p) => p.cle === "loyer_marche")) || "—";
  if (o.cle === "prix") return ecart(pts.find((p) => p.cle === "verdict_prix")) || "—";
  if (o.cle === "emplacement") { const p = pts.find((x) => x.cle === "passage"); return p && p.statut !== "vide" ? teteEtSuite(p.resultat)[0] : "—"; }
  if (o.cle === "locataire") {
    // Une procédure en cours passe avant tout : c'est elle qu'on doit voir d'abord.
    const proc = pts.find((p) => p.cle === "procedures");
    if (proc?.statut === "alerte") { const m = String(proc.resultat).match(/Liquidation|Redressement|sauvegarde/i); if (m) return m[0][0].toUpperCase() + m[0].slice(1).toLowerCase(); }
  }
  return r.statut === "vide" ? "—" : MOT[r.statut] || "—";
}
