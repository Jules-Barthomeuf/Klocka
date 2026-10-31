// D'où vient chaque champ de l'avis de valeur et de son deck (26 oct. 2026, Jules : le mode Sources, « comme dans les
// autres pages »). Un chemin de l'avis (« chiffres.valeur », « marche.references.2 », « locatif.lignes.1.texte »)
// donne une fiche : sa nature (Equimmox, une source publique, un calcul, ce que dit le mandataire, la rédaction de
// Haka, à compléter), son origine, le détail et, pour un calcul, le calcul exact. Pure et testable.

const eur = (v) => (v == null || !Number.isFinite(Number(v)) ? "–" : `${Math.round(Number(v)).toLocaleString("fr-FR")} €`);
const pc = (v) => (v == null ? "–" : `${String(v).replace(".", ",")} %`);
const lire = (o, chemin) => String(chemin).split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);

/**
 * @param {string} chemin le chemin du champ dans l'avis
 * @param {{ avis: object, estimation?: object }} ctx
 * @returns {{ nature: string, origine?: string, detail: string, calcul?: string } | null}
 */
export function sourceDuChemin(chemin, { avis = {}, estimation = {} } = {}, texte = "") {
  if (!chemin) return null;
  const c = avis.chiffres || {};
  const m = avis.methodes || {};
  const eq = m.equimmox || null;
  // Un champ vide (« [à compléter] » dans l'avis, « à renseigner » dans le deck) : à demander.
  const valeurBrute = lire(avis, chemin);
  if (/à (compléter|renseigner)/i.test(String(texte || "")) || /\[à compléter\]/.test(String(valeurBrute ?? ""))) {
    if (/^ville\./.test(chemin)) return { nature: "a_remplir", origine: "INSEE, Le Figaro", detail: "Pas encore lu pour cette commune : demandez à l'Assistant KPartners les chiffres de la ville, ou rédigez l'avis de nouveau." };
    return { nature: "a_remplir", detail: "Rien n'est encore connu : à demander au propriétaire ou à lire dans le bail, puis à dire à l'Assistant KPartners." };
  }
  const ponderation = eq?.methodes?.length
    ? `(${eq.methodes.map((x) => `${eur(x.valeur)} × ${x.coefficient}`).join(" + ")}) ÷ ${eq.methodes.reduce((t, x) => t + (x.coefficient || 0), 0)} = ${eur(eq.valeur_brute)}`
    : null;

  if (chemin === "chiffres.valeur") {
    if (eq) return { nature: "equimmox", origine: "Estimation multicritères Equimmox", detail: `La moyenne des quatre méthodes, pondérées 2-1-1-2, arrondie au millier${eq.le ? `. Rapport du ${new Date(eq.le).toLocaleDateString("fr-FR")}` : ""}.`, calcul: `${ponderation} → ${eur(c.valeur)}` };
    if (c.capitalisation && m.loyer && m.taux) return { nature: "calcul", origine: "Capitalisation du loyer", detail: "Le loyer annuel divisé par le taux de rendement retenu, arrondi.", calcul: `${eur(m.loyer)} ÷ ${pc(m.taux)} = ${eur(c.capitalisation)} → ${eur(c.valeur)}` };
    return { nature: "calcul", origine: "Comparaison", detail: "La surface multipliée par le prix au m² retenu.", calcul: m.surface && m.prix_m2 ? `${m.surface} m² × ${eur(m.prix_m2)} = ${eur(c.valeur)}` : undefined };
  }
  if (chemin === "chiffres.bas" || chemin === "chiffres.haut") {
    const bas = chemin === "chiffres.bas";
    if (eq) return { nature: "calcul", origine: "Fourchette Equimmox", detail: `La même pondération, faite sur le ${bas ? "bas" : "haut"} de la fourchette au m² de chaque méthode (la capitalisation n'a qu'une valeur), arrondie à 5 000 €.`, calcul: eq.methodes.filter((x) => x.bas_m2).map((x) => `${x.nom} : ${(bas ? x.bas_m2 : x.haut_m2).toLocaleString("fr-FR")} €/m²`).join(" · ") };
    const s = c.sensibilite;
    return { nature: "calcul", origine: "Sensibilité au taux", detail: `La valeur au taux ${bas ? "haut" : "bas"}.`, calcul: s && m.loyer ? `${eur(m.loyer)} ÷ ${pc(bas ? s.taux_haut : s.taux_bas)} = ${eur(bas ? c.bas : c.haut)}` : undefined };
  }
  if (chemin === "chiffres.rendement") return { nature: "calcul", origine: "Rendement brut", detail: "Le loyer annuel rapporté à la valeur retenue.", calcul: m.loyer && c.valeur ? `${eur(m.loyer)} ÷ ${eur(c.valeur)} = ${pc(c.rendement)}` : undefined };
  if (chemin === "chiffres.cout_total" || chemin === "chiffres.prix_affiche") return { nature: "calcul", origine: "Prix acquéreur", detail: `La valeur, plus ${c.honoraires_pct ?? 5} % d'honoraires (prix affiché), plus ${c.frais_pct ?? 7.5} % de frais d'acquisition.`, calcul: `${eur(c.valeur)} × ${1 + (c.honoraires_pct ?? 5) / 100} = ${eur(c.prix_affiche)} ; × ${1 + (c.frais_pct ?? 7.5) / 100} = ${eur(c.cout_total)}` };
  if (chemin === "chiffres.rendement_total") return { nature: "calcul", origine: "Rendement acquéreur", detail: "Le loyer rapporté au prix acquéreur, frais compris.", calcul: m.loyer && c.cout_total ? `${eur(m.loyer)} ÷ ${eur(c.cout_total)} = ${pc(c.rendement_total)}` : undefined };
  if (chemin === "chiffres.m2") return { nature: "calcul", origine: "Valeur au m²", detail: "La valeur retenue divisée par la surface utile.", calcul: c.valeur && m.surface ? `${eur(c.valeur)} ÷ ${m.surface} m²` : undefined };
  if (chemin === "methodes.taux") return { nature: "donnee", origine: m.source_taux || "Taux de rendement retenu", detail: m.justification_taux || "Le taux de capitalisation moyen du secteur pour l'activité (Data-B), avant les ajustements propres au bien." };
  const meth = chemin.match(/^methodes\.equimmox\.methodes\.(\d+)/);
  if (meth && eq) {
    const x = eq.methodes[Number(meth[1])];
    if (x) return { nature: "equimmox", origine: `Equimmox · ${x.nom}`, detail: x.taux ? `Le loyer annuel capitalisé au taux moyen du secteur (${pc(x.taux)}). Coefficient ${x.coefficient}.` : `La moyenne au m² des comparables retenus (${x.bas_m2?.toLocaleString("fr-FR")} à ${x.haut_m2?.toLocaleString("fr-FR")} €/m²), multipliée par la surface. Coefficient ${x.coefficient}.`, calcul: x.moyenne_m2 && estimation?.equimmox?.params?.surface ? `${x.moyenne_m2.toLocaleString("fr-FR")} €/m² × ${estimation.equimmox.params.surface} m² = ${eur(x.valeur)}` : undefined };
  }
  const ref = chemin.match(/^marche\.references\.(\d+)/);
  if (ref) {
    const r = avis.marche?.references?.[Number(ref[1])];
    if (r) return { nature: eq ? "equimmox" : "donnee", origine: `${r.bien || "Vente"}${r.date ? `, ${r.date}` : ""}`, detail: [r.adresse, r.raison ? `retenu : ${r.raison}` : null].filter(Boolean).join(" · ") || "Comparable", calcul: r.prix && r.surface ? `${eur(r.prix)} ÷ ${r.surface} m² = ${eur(r.prix_m2)}/m²` : undefined };
  }
  if (/^marche\.loyers/.test(chemin)) return { nature: "donnee", origine: avis.marche?.loyers?.source || "Loyers de marché", detail: "La fourchette des loyers constatés autour (Equimmox, Data-B en repli)." };
  if (/^marche\./.test(chemin)) return { nature: eq ? "equimmox" : "donnee", origine: eq ? "Equimmox" : "DVF", detail: avis.marche?.source || "Les références de marché." };
  if (/^(locatif\.lignes|methodes\.loyer|demandeur|cadre\.visite|description\.surfaces)/.test(chemin)) return { nature: "saisie", origine: "Le bail et les réponses du mandataire", detail: "Ce que le mandataire a dit à l'Assistant KPartners ou ce qu'on a lu dans le bail joint." };
  const ville = chemin.match(/^ville\.(population|revenu|chomage|logement)$/);
  if (ville) {
    const x = (avis.ville || estimation?.ville_chiffres || {})[ville[1]];
    if (x) return { nature: "donnee", origine: x.source, detail: `${(avis.ville || estimation?.ville_chiffres || {}).commune || "La commune"}, lu le ${new Date((avis.ville || estimation.ville_chiffres).le).toLocaleDateString("fr-FR")}.` };
  }
  if (/^deck\./.test(chemin)) return { nature: "ia", origine: "Texte du deck", detail: "Composé depuis l'avis ; retouché à la main en mode Édition s'il a changé." };
  if (/^signataire\./.test(chemin)) return { nature: "saisie", origine: "Votre fiche mandataire", detail: "Tenue par l'équipe Klocka et sur votre page Compte." };
  if (/^(emplacement|description|locatif|juridique|conclusion|libre|methodes\.(synthese|justification))/.test(chemin)) {
    return { nature: "ia", origine: "Rédigé par l'Assistant KPartners", detail: `À partir des réponses du mandataire${eq?.methodes ? ", de l'environnement relevé par Equimmox" : ""} et des données de marché ; il n'invente rien de ce qui n'y est pas.` };
  }
  return { nature: "modele", detail: "Le texte du modèle d'avis K Partners." };
}
