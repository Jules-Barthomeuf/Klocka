// Les dix lead magnets des newsletters (9 oct. 2026) : des pages publiques,
// sans compte, qui répondent à une question précise d'un investisseur en murs
// commerciaux. Comme le quiz et Vision (outils-investisseur.js) : AUCUN
// modèle de langage, AUCUNE source payante, un calcul pur fait dans le
// navigateur, et chaque hypothèse dite à côté du résultat.
//
// Une définition par outil : ses champs, son calcul, ses hypothèses. La page
// OutilInvestisseur les affiche toutes de la même façon ; les tests du
// serveur vérifient les calculs.

import { annuite } from "./outils-investisseur.js";

const pct = (n, d = 1) => `${(Math.round(n * 10 ** d) / 10 ** d).toLocaleString("fr-FR")} %`;
const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const num = (v, defaut = 0) => (Number.isFinite(Number(v)) ? Number(v) : defaut);

// --- Les repères, tous ici --------------------------------------------------

export const REPERES = {
  /** Frais d'acquisition dans l'ancien (notaire, droits) : de 7 à 8 % du prix. */
  frais: 7.5,
  /** Le taux d'endettement qu'une banque accepte, tous crédits confondus. */
  endettement: 0.35,
  /** La part des loyers qu'une banque réintègre dans les revenus. */
  loyersRetenus: 0.7,
  /** Le rendement brut type d'un commerce, pour estimer le loyer d'un bien qu'on n'a pas encore. */
  rendementType: 7,
  tauxCredit: 4.5,
  /** Prélèvements sociaux sur les revenus fonciers. */
  prelevementsSociaux: 17.2,
  /** Le plafond du micro-foncier (loyers bruts annuels) et son abattement. */
  plafondMicroFoncier: 15000,
  abattementMicro: 0.3,
  /** L'impôt sur les sociétés : taux réduit jusqu'à 42 500 € de bénéfice, puis taux normal. */
  isReduit: 15, plafondIsReduit: 42500, isNormal: 25,
  /** En SCI à l'IS : la part du prix amortissable (le bâti, hors terrain) et sa durée. */
  partBati: 0.8, dureeAmortissement: 30,
  /** Le délai retenu pour relouer un local vide. */
  moisRelocation: 6,
  /** Donation en ligne directe : l'abattement par enfant et par parent, renouvelable tous les 15 ans. */
  abattementEnfant: 100000,
};

/** Le barème des droits de donation en ligne directe, par part taxable (tranche haute, taux). */
export const BAREME_DONATION = [[8072, 5], [12109, 10], [15932, 15], [552324, 20], [902838, 30], [1805677, 40], [Infinity, 45]];

/** Pure : les droits sur une part taxable, tranche par tranche. */
export function droitsDonation(taxable) {
  let reste = Math.max(0, taxable);
  let bas = 0;
  let droits = 0;
  for (const [haut, taux] of BAREME_DONATION) {
    const tranche = Math.min(reste, haut - bas);
    if (tranche <= 0) break;
    droits += (tranche * taux) / 100;
    reste -= tranche;
    bas = haut;
  }
  return droits;
}

/** Pure : la part de l'usufruit selon l'âge de l'usufruitier (article 669 du code général des impôts). */
export function partUsufruit(age) {
  const a = num(age, 60);
  if (a < 21) return 0.9;
  if (a >= 91) return 0.1;
  return Math.round((0.9 - Math.floor((a - 11) / 10) * 0.1) * 10) / 10;
}

// --- Les dix outils -----------------------------------------------------------

const RENDEMENT_NET = {
  cle: "rendement-net",
  nom: "Le vrai rendement de l'annonce",
  titre: "Combien ce bien rapporte vraiment ?",
  accroche: "Le rendement d'une annonce se calcule sur le prix seul. Entrez les chiffres : la page refait le calcul avec ce que vous payez et ce que vous gardez.",
  champs: [
    { cle: "prix", label: "Prix affiché", unite: "€", defaut: 250000 },
    { cle: "loyer", label: "Loyer annuel hors charges", unite: "€ / an", defaut: 18000 },
    { cle: "frais", label: "Frais d'acquisition", unite: "%", defaut: REPERES.frais, aide: "Notaire et droits : de 7 à 8 % dans l'ancien." },
    { cle: "taxe", label: "Taxe foncière restant à votre charge", unite: "€ / an", defaut: 1500, aide: "Zéro si le bail la refacture au locataire." },
    { cle: "charges", label: "Autres charges non refacturées", unite: "€ / an", defaut: 800, aide: "Assurance du bâtiment, copropriété, gestion." },
    { cle: "vacance", label: "Mois sans loyer prévus sur 10 ans", unite: "mois", defaut: 6 },
  ],
  calcul(v) {
    const prix = num(v.prix);
    const loyer = num(v.loyer);
    const cout = prix * (1 + num(v.frais) / 100);
    const garde = loyer * (1 - num(v.vacance) / 120) - num(v.taxe) - num(v.charges);
    const brut = prix ? (loyer / prix) * 100 : 0;
    const net = cout ? (garde / cout) * 100 : 0;
    return {
      fort: { label: "Votre rendement net", valeur: pct(net) },
      phrase: `L'annonce affiche ${pct(brut)} brut. Sur ce que vous payez vraiment, et avec ce que vous gardez, le bien rapporte ${pct(net)}.`,
      lignes: [["Rendement brut de l'annonce", pct(brut)], ["Ce que vous payez, frais compris", euros(cout)], ["Ce que vous gardez chaque année", euros(garde)], ["Écart avec l'annonce", `${(Math.round((brut - net) * 10) / 10).toLocaleString("fr-FR")} point${brut - net >= 2 ? "s" : ""} de moins`]],
      conseils: [net < brut - 1.5 ? "L'écart dépasse 1,5 point : relisez le bail, la taxe foncière et les charges y pèsent." : "L'écart reste contenu : le bail protège bien le propriétaire.", "Comparez toujours deux biens sur leur rendement net, jamais sur celui de l'annonce."],
      resultat: Math.round(net * 100) / 100,
    };
  },
  hypotheses: "Vacance étalée sur 10 ans. Avant impôt et sans crédit.",
};

const CAPACITE = {
  cle: "capacite",
  nom: "Combien la banque peut vous prêter",
  titre: "Jusqu'à quel prix pouvez-vous acheter des murs ?",
  accroche: "La banque regarde vos revenus, vos crédits en cours et une partie du futur loyer. La page fait le même calcul.",
  champs: [
    { cle: "revenus", label: "Revenus nets du foyer", unite: "€ / mois", defaut: 5000 },
    { cle: "credits", label: "Mensualités de vos crédits en cours", unite: "€ / mois", defaut: 0 },
    { cle: "loyers", label: "Loyers que vous touchez déjà", unite: "€ / mois", defaut: 0 },
    { cle: "apport", label: "Ce que vous pouvez apporter", unite: "€", defaut: 40000 },
    { cle: "duree", label: "Durée du crédit", unite: "ans", defaut: 20 },
  ],
  calcul(v) {
    const r = REPERES;
    const duree = Math.max(5, num(v.duree, 20));
    const a = annuite(1, r.tauxCredit, duree) / 12;
    const marge = r.endettement * (num(v.revenus) + r.loyersRetenus * num(v.loyers)) - num(v.credits) + a * num(v.apport);
    // Le loyer du bien acheté entre aussi pour 70 % : chaque euro de prix rapporte du loyer retenu.
    const coef = a * (1 + r.frais / 100) - (r.endettement * r.loyersRetenus * (r.rendementType / 100)) / 12;
    const prix = coef > 0 ? Math.max(0, marge / coef) : 0;
    const emprunt = Math.max(0, prix * (1 + r.frais / 100) - num(v.apport));
    return {
      fort: { label: "Prix maximum, hors frais", valeur: euros(prix) },
      phrase: prix > 0 ? `Avec vos revenus et ${euros(num(v.apport))} d'apport, une banque peut financer des murs jusqu'à environ ${euros(prix)}.` : "Avec ces chiffres, votre taux d'endettement est déjà atteint : il faut d'abord alléger un crédit ou augmenter l'apport.",
      lignes: [["Montant emprunté", euros(emprunt)], ["Mensualité", `${euros(emprunt * a)} / mois`], ["Loyer estimé du bien", `${euros((prix * r.rendementType) / 100 / 12)} / mois`], ["Durée", `${duree} ans à ${String(r.tauxCredit).replace(".", ",")} %`]],
      conseils: ["Le loyer du bien compte dans le calcul : c'est ce qui permet, ensuite, d'acheter le suivant.", "Un apport plus fort ou une durée plus longue élargit la capacité ; la banque décide au cas par cas."],
      resultat: Math.round(prix),
    };
  },
  hypotheses: `Endettement maximal de ${Math.round(REPERES.endettement * 100)} %, loyers retenus à ${Math.round(REPERES.loyersRetenus * 100)} %, loyer du bien estimé à ${REPERES.rendementType} % brut, frais de ${String(REPERES.frais).replace(".", ",")} %. Sous réserve de l'accord de la banque.`,
};

const PRIX_MAX = {
  cle: "prix-max",
  nom: "Quel prix offrir pour ces murs",
  titre: "Quel prix offrir pour garder votre rendement ?",
  accroche: "Vous connaissez le loyer et le rendement que vous voulez. La page dit le prix à ne pas dépasser.",
  champs: [
    { cle: "loyer", label: "Loyer annuel hors charges", unite: "€ / an", defaut: 18000 },
    { cle: "vise", label: "Rendement net que vous voulez", unite: "%", defaut: 6 },
    { cle: "charges", label: "Charges et taxe restant à votre charge", unite: "€ / an", defaut: 1500 },
    { cle: "frais", label: "Frais d'acquisition", unite: "%", defaut: REPERES.frais },
  ],
  calcul(v) {
    const garde = num(v.loyer) - num(v.charges);
    const budget = num(v.vise) > 0 ? garde / (num(v.vise) / 100) : 0;
    const prix = budget / (1 + num(v.frais) / 100);
    return {
      fort: { label: "Prix maximum à offrir", valeur: euros(prix) },
      phrase: `Pour garder ${pct(num(v.vise))} net, n'offrez pas plus de ${euros(prix)}, soit ${euros(budget)} frais compris.`,
      lignes: [["Budget total, frais compris", euros(budget)], ["Ce que vous gardez chaque année", euros(garde)], ["Rendement brut à ce prix", pct(prix ? (num(v.loyer) / prix) * 100 : 0)]],
      conseils: ["Au-dessus de ce prix, vous achetez un rendement plus bas que celui que vous visez.", "La négociation porte sur le prix : les frais suivent."],
      resultat: Math.round(prix),
    };
  },
  hypotheses: "Sans vacance ni crédit, avant impôt.",
};

const BAIL = {
  cle: "bail",
  nom: "Votre bail est-il solide ?",
  titre: "Le bail de ce commerce est-il solide ?",
  accroche: "Dix questions à poser avant d'acheter. Répondez par oui ou non : la page dit ce qui reste à vérifier.",
  champs: [
    ["duree", "Le bail a-t-il encore au moins six ans à courir ?", "La durée restante du bail : moins de trois ans, le locataire peut partir sans attendre."],
    ["destination", "L'activité autorisée (la destination) est-elle écrite clairement ?", "La destination : une clause trop étroite gêne la relocation."],
    ["indexation", "Le loyer est-il indexé (indice ILC ou ILAT) ?", "L'indexation : sans elle, le loyer ne suit pas les prix."],
    ["taxe", "La taxe foncière est-elle refacturée au locataire ?", "La taxe foncière : à votre charge, elle retire souvent un point de rendement."],
    ["travaux", "Savez-vous qui paie les gros travaux (toiture, structure) ?", "Les gros travaux : depuis la loi Pinel, ils restent au propriétaire dans les baux signés ou renouvelés depuis fin 2014."],
    ["garantie", "Un dépôt de garantie ou une caution est-il prévu ?", "Les garanties : un dépôt ou une caution protège contre un impayé."],
    ["paiement", "Le locataire paie-t-il à l'heure depuis douze mois ?", "Le paiement : demandez l'historique des loyers encaissés."],
    ["anciennete", "Le commerce est-il ouvert à cette adresse depuis plus de trois ans ?", "L'ancienneté : un commerce récent n'a pas encore prouvé qu'il tient."],
    ["effort", "Le loyer pèse-t-il moins de 10 % du chiffre d'affaires du commerce ?", "Le poids du loyer : au-delà d'environ 10 % du chiffre d'affaires (le repère varie selon l'activité), le commerce peut être à la peine."],
    ["annexes", "L'état des lieux et l'inventaire des charges sont-ils annexés au bail ?", "Les annexes : la loi Pinel les rend obligatoires."],
  ].map(([cle, label, aVerifier]) => ({ cle, label, type: "oui_non", aVerifier, defaut: null })),
  calcul(v) {
    const qs = BAIL.champs;
    const oui = qs.filter((q) => v[q.cle] === true).length;
    const manque = qs.filter((q) => v[q.cle] !== true);
    const niveau = oui >= 9 ? "Bail solide" : oui >= 6 ? "Bail à vérifier" : "Bail fragile";
    return {
      fort: { label: "Votre bail", valeur: `${oui} / ${qs.length}` },
      titre: niveau,
      phrase: oui >= 9 ? "Le bail protège bien le propriétaire : ce qui reste se règle avec le notaire." : oui >= 6 ? "Le bail tient, mais plusieurs points sont à éclaircir avant de signer." : "Plusieurs garanties manquent : ce bail fait porter trop de risque au propriétaire.",
      lignes: [],
      conseils: manque.map((q) => q.aVerifier),
      resultat: oui,
    };
  },
  hypotheses: "Une liste de points de vigilance, pas un audit juridique : faites relire le bail par votre notaire ou votre avocat.",
};

const EMPLACEMENT = {
  cle: "emplacement",
  nom: "Cet emplacement tient-il ?",
  titre: "Cet emplacement tiendra-t-il dans dix ans ?",
  accroche: "Six questions sur la rue et le quartier, celles que l'on se pose sur place. La page donne une note et ce qui la tire vers le bas.",
  champs: [
    ["passage", "Le passage devant la vitrine", ["Une rue passante toute la journée", "Du passage aux heures de pointe", "Peu de passants"]],
    ["visibilite", "La vitrine", ["Bien visible, en angle ou en façade large", "Visible de près", "En retrait ou cachée"]],
    ["acces", "Pour venir", ["Transports et stationnement faciles", "L'un ou l'autre", "Difficile"]],
    ["locomotive", "Les commerces voisins", ["Une locomotive à côté (supermarché, pharmacie, boulangerie)", "Quelques commerces actifs", "Peu de commerces autour"]],
    ["vacance", "Les locaux vides dans la rue", ["Aucun", "Un ou deux", "Plusieurs"]],
    ["quartier", "Le quartier", ["Population en hausse, projets en cours", "Stable", "En perte de vitesse"]],
  ].map(([cle, label, choix]) => ({ cle, label, type: "choix", choix, defaut: null })),
  calcul(v) {
    const qs = EMPLACEMENT.champs;
    const points = qs.reduce((s, q) => s + (v[q.cle] == null ? 0 : 2 - Number(v[q.cle])), 0);
    const note = points >= 10 ? "A" : points >= 6 ? "B" : "C";
    const faibles = qs.filter((q) => Number(v[q.cle]) === 2);
    return {
      fort: { label: "Note de l'emplacement", valeur: note },
      titre: note === "A" ? "Un emplacement qui tient" : note === "B" ? "Un emplacement correct" : "Un emplacement à risque",
      phrase: note === "A" ? "Le local se relouera vite : c'est l'emplacement qui fait la valeur des murs." : note === "B" ? "L'emplacement tient, si le locataire est solide et le prix juste." : "En cas de départ du locataire, la relocation peut être longue : le prix doit en tenir compte.",
      lignes: [["Score", `${points} / ${qs.length * 2}`]],
      conseils: faibles.length ? faibles.map((q) => `${q.label} : ${q.choix[2].toLowerCase()}. C'est ce qui pèse le plus sur la note.`) : ["Aucun point faible : vérifiez tout de même le bail et le locataire."],
      resultat: points,
    };
  },
  hypotheses: "Une grille d'observation, pas une étude de marché : allez voir la rue à plusieurs heures de la journée.",
};

const COMPARATEUR = {
  cle: "comparateur",
  nom: "Murs, SCPI, locatif ou livret",
  titre: "À montant égal, que rapporte chaque placement ?",
  accroche: "Le même capital placé dans des murs de commerce, une SCPI, un appartement loué ou un livret. Chaque taux est modifiable.",
  champs: [
    { cle: "montant", label: "Le capital placé", unite: "€", defaut: 100000 },
    { cle: "duree", label: "Pendant", unite: "ans", defaut: 15 },
    { cle: "murs", label: "Murs commerciaux, rendement net", unite: "%", defaut: 6, aide: "Après charges et vacance." },
    { cle: "scpi", label: "SCPI, rendement net de frais de gestion", unite: "%", defaut: 4.5, aide: "Les frais d'entrée sont retirés du capital placé." },
    { cle: "entree", label: "Frais d'entrée de la SCPI", unite: "%", defaut: 10 },
    { cle: "locatif", label: "Appartement loué, rendement net", unite: "%", defaut: 3 },
    { cle: "livret", label: "Livret, taux", unite: "%", defaut: 1.5, aide: "À ajuster au taux du moment." },
  ],
  calcul(v) {
    const m = num(v.montant);
    const d = Math.max(1, num(v.duree, 15));
    const lignesDe = [
      ["Murs commerciaux", (m * num(v.murs)) / 100],
      ["SCPI", (m * (1 - num(v.entree) / 100) * num(v.scpi)) / 100],
      ["Appartement loué", (m * num(v.locatif)) / 100],
      ["Livret", (m * num(v.livret)) / 100],
    ];
    const murs = lignesDe[0][1];
    return {
      fort: { label: "Murs commerciaux, chaque année", valeur: euros(murs) },
      phrase: `En ${d} ans, les murs versent ${euros(murs * d)}, contre ${euros(lignesDe[1][1] * d)} pour la SCPI et ${euros(lignesDe[3][1] * d)} pour le livret.`,
      lignes: lignesDe.map(([nom, an]) => [nom, `${euros(an)} / an · ${euros(an * d)} en ${d} ans`]),
      conseils: ["Les murs demandent plus de travail (choisir, gérer le bail), la SCPI aucun : c'est ce qu'on paie dans l'écart.", "Avec un crédit, l'écart se creuse : le loyer des murs rembourse une partie de l'achat."],
      resultat: Math.round(murs),
    };
  },
  hypotheses: "Sans crédit, sans impôt et sans revalorisation du capital : une comparaison des revenus, pas des patrimoines.",
};

const FISCALITE = {
  cle: "fiscalite",
  nom: "Nom propre ou SCI à l'IS",
  titre: "Nom propre ou SCI à l'IS : combien d'impôt sur vos loyers ?",
  accroche: "Les mêmes loyers, deux façons de les détenir. La page compare l'impôt de la première année.",
  champs: [
    { cle: "loyer", label: "Loyers annuels", unite: "€ / an", defaut: 18000 },
    { cle: "charges", label: "Charges déductibles (taxe, assurance, travaux)", unite: "€ / an", defaut: 3000 },
    { cle: "interets", label: "Intérêts d'emprunt de l'année", unite: "€ / an", defaut: 6000 },
    { cle: "prix", label: "Prix du bien", unite: "€", defaut: 250000 },
    { cle: "tmi", label: "Votre tranche d'impôt", type: "choix", choix: ["0 %", "11 %", "30 %", "41 %", "45 %"], valeurs: [0, 11, 30, 41, 45], defaut: 2 },
  ],
  calcul(v) {
    const r = REPERES;
    const tmi = [0, 11, 30, 41, 45][num(v.tmi, 2)] ?? 30;
    const loyer = num(v.loyer);
    const taux = (tmi + r.prelevementsSociaux) / 100;
    const reel = Math.max(0, loyer - num(v.charges) - num(v.interets)) * taux;
    const micro = loyer <= r.plafondMicroFoncier ? loyer * (1 - r.abattementMicro) * taux : null;
    const nomPropre = micro != null ? Math.min(micro, reel) : reel;
    const amort = (num(v.prix) * r.partBati) / r.dureeAmortissement;
    const benefice = Math.max(0, loyer - num(v.charges) - num(v.interets) - amort);
    const is = (Math.min(benefice, r.plafondIsReduit) * r.isReduit + Math.max(0, benefice - r.plafondIsReduit) * r.isNormal) / 100;
    return {
      fort: { label: "Écart d'impôt la première année", valeur: euros(Math.abs(nomPropre - is)) },
      titre: is < nomPropre ? "La SCI à l'IS paie moins" : "Le nom propre paie moins",
      phrase: `En nom propre, environ ${euros(nomPropre)} d'impôt et de prélèvements sociaux ; en SCI à l'IS, environ ${euros(is)} d'impôt sur les sociétés.`,
      lignes: [["Nom propre, régime réel", euros(reel)], ...(micro != null ? [["Nom propre, micro-foncier", euros(micro)]] : []), ["SCI à l'IS", euros(is)], ["Amortissement déduit en SCI", `${euros(amort)} / an`]],
      conseils: ["En SCI à l'IS, l'argent sorti de la société (dividendes) est taxé en plus, et la plus-value de revente est plus lourde : l'IS convient à qui réinvestit.", "Le choix se fait avec un expert-comptable, sur toute la durée de détention."],
      resultat: Math.round(nomPropre - is),
    };
  },
  hypotheses: `Prélèvements sociaux ${String(REPERES.prelevementsSociaux).replace(".", ",")} % ; micro-foncier sous ${euros(REPERES.plafondMicroFoncier)} de loyers (abattement ${Math.round(REPERES.abattementMicro * 100)} %) ; IS à ${REPERES.isReduit} % jusqu'à ${euros(REPERES.plafondIsReduit)}, ${REPERES.isNormal} % au-delà ; bâti amorti (${Math.round(REPERES.partBati * 100)} % du prix) sur ${REPERES.dureeAmortissement} ans. Un ordre de grandeur, pas un conseil fiscal.`,
};

const INDEXATION = {
  cle: "indexation",
  nom: "Votre loyer dans 9 ans",
  titre: "Combien vaudra votre loyer à la fin du bail ?",
  accroche: "Un bail commercial indexe le loyer chaque année. La page montre le loyer, année après année, et ce que vaut le bien à la fin.",
  champs: [
    { cle: "loyer", label: "Loyer annuel aujourd'hui", unite: "€ / an", defaut: 18000 },
    { cle: "indice", label: "Hausse annuelle de l'indice", unite: "%", defaut: 2, aide: "L'indice ILC bouge chaque trimestre et d'une année à l'autre : choisissez votre hypothèse." },
    { cle: "duree", label: "Durée", unite: "ans", defaut: 9 },
    { cle: "rendement", label: "Rendement de revente", unite: "%", defaut: 7, aide: "Le rendement brut auquel un acheteur reprendrait le bien." },
  ],
  calcul(v) {
    const d = Math.max(1, Math.min(30, num(v.duree, 9)));
    const i = num(v.indice) / 100;
    const fin = num(v.loyer) * (1 + i) ** d;
    const total = Array.from({ length: d }, (_, n) => num(v.loyer) * (1 + i) ** n).reduce((s, x) => s + x, 0);
    const r = num(v.rendement) / 100;
    return {
      fort: { label: `Loyer dans ${d} ans`, valeur: `${euros(fin)} / an` },
      phrase: `Indexé de ${pct(num(v.indice))} par an, le loyer passe de ${euros(num(v.loyer))} à ${euros(fin)}. À rendement égal, le bien vaut ${euros(r ? fin / r : 0)} au lieu de ${euros(r ? num(v.loyer) / r : 0)}.`,
      lignes: [["Loyers encaissés sur la période", euros(total)], ["Valeur du bien aujourd'hui", euros(r ? num(v.loyer) / r : 0)], [`Valeur dans ${d} ans`, euros(r ? fin / r : 0)]],
      conseils: ["Vérifiez que le bail prévoit bien l'indexation annuelle : sans clause, le loyer ne bouge qu'à la révision triennale.", "Au renouvellement, le loyer peut être plafonné : la hausse n'est pas acquise au-delà du bail."],
      resultat: Math.round(fin),
    };
  },
  hypotheses: "Indexation constante chaque année, rendement de revente inchangé. Avant impôt.",
};

const VACANCE = {
  cle: "vacance",
  nom: "Combien de mois sans loyer pouvez-vous tenir ?",
  titre: "Si le locataire part, combien de mois tenez-vous ?",
  accroche: "Un local vide continue de coûter : le crédit, la taxe, les charges. La page dit combien de mois votre épargne couvre, et la réserve à viser.",
  champs: [
    { cle: "mensualite", label: "Mensualité du crédit", unite: "€ / mois", defaut: 1100 },
    { cle: "charges", label: "Taxe foncière et charges, au mois", unite: "€ / mois", defaut: 200 },
    { cle: "epargne", label: "Votre épargne de précaution", unite: "€", defaut: 10000 },
    { cle: "loyer", label: "Loyer mensuel", unite: "€ / mois", defaut: 1500 },
  ],
  calcul(v) {
    const cout = num(v.mensualite) + num(v.charges);
    const mois = cout > 0 ? num(v.epargne) / cout : Infinity;
    const reserve = cout * REPERES.moisRelocation;
    const manque = Math.max(0, reserve - num(v.epargne));
    return {
      fort: { label: "Mois couverts sans loyer", valeur: Number.isFinite(mois) ? `${Math.floor(mois)} mois` : "Sans limite" },
      phrase: mois >= REPERES.moisRelocation ? `Votre épargne couvre ${Math.floor(mois)} mois : de quoi attendre un nouveau locataire.` : `Votre épargne couvre ${Math.floor(mois)} mois : il manque ${euros(manque)} pour tenir ${REPERES.moisRelocation} mois.`,
      lignes: [["Ce que coûte le local vide", `${euros(cout)} / mois`], [`Réserve pour ${REPERES.moisRelocation} mois`, euros(reserve)], ["Mois de loyer pour la constituer", `${num(v.loyer) ? Math.ceil(reserve / num(v.loyer)) : "—"} mois`]],
      conseils: ["Mettez de côté une part du loyer chaque mois jusqu'à atteindre la réserve.", "Un bail long, un locataire installé et un bon emplacement réduisent le risque, pas le besoin de réserve."],
      resultat: Number.isFinite(mois) ? Math.floor(mois) : 99,
    };
  },
  hypotheses: `${REPERES.moisRelocation} mois pour relouer un local, un délai courant ; il peut être plus long hors des bons emplacements.`,
};

const TRANSMISSION = {
  cle: "transmission",
  nom: "Transmettre vos murs",
  titre: "Transmettre vos murs à vos enfants : combien de droits ?",
  accroche: "Donner les murs en pleine propriété, ou seulement la nue-propriété en gardant les loyers : la page compare les droits à payer.",
  champs: [
    { cle: "valeur", label: "Valeur des murs", unite: "€", defaut: 300000 },
    { cle: "enfants", label: "Nombre d'enfants", unite: "", defaut: 2 },
    { cle: "age", label: "Votre âge", unite: "ans", defaut: 60 },
  ],
  calcul(v) {
    const n = Math.max(1, Math.round(num(v.enfants, 1)));
    const part = num(v.valeur) / n;
    const usufruit = partUsufruit(v.age);
    const pleine = droitsDonation(part - REPERES.abattementEnfant) * n;
    const nue = droitsDonation(part * (1 - usufruit) - REPERES.abattementEnfant) * n;
    return {
      fort: { label: "Droits en donnant la nue-propriété", valeur: euros(nue) },
      phrase: `En pleine propriété, vos ${n} enfant${n > 1 ? "s" : ""} paieraient environ ${euros(pleine)} de droits. En donnant la nue-propriété et en gardant les loyers, environ ${euros(nue)}.`,
      lignes: [["Part de chaque enfant", euros(part)], ["Valeur de l'usufruit à votre âge", pct(usufruit * 100, 0)], ["Droits en pleine propriété", euros(pleine)], ["Droits en nue-propriété", euros(nue)]],
      conseils: ["Au décès, l'usufruit rejoint la nue-propriété sans droits supplémentaires : les enfants deviennent pleins propriétaires.", "Les abattements se renouvellent tous les quinze ans : donner tôt et en plusieurs fois réduit les droits. Un notaire chiffre votre cas."],
      resultat: Math.round(pleine - nue),
    };
  },
  hypotheses: `Donation d'un parent à ses enfants, abattement de ${euros(REPERES.abattementEnfant)} par enfant, barème des droits en ligne directe et barème fiscal de l'usufruit en vigueur, sans donation dans les quinze dernières années. Un ordre de grandeur, à faire confirmer par un notaire.`,
};

export const LEAD_MAGNETS = [RENDEMENT_NET, CAPACITE, PRIX_MAX, BAIL, EMPLACEMENT, COMPARATEUR, FISCALITE, INDEXATION, VACANCE, TRANSMISSION];

/** Pure : les valeurs par défaut d'un outil. */
export const valeursParDefaut = (outil) => Object.fromEntries(outil.champs.map((c) => [c.cle, c.defaut]));
