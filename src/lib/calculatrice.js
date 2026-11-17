/**
 * Pure : les chiffres de la calculatrice (15 nov. 2026, Jules). Le prix de base est le FAI, sinon le net vendeur ;
 * la négociation (en %) s'y applique. Rendement brut : loyer ÷ prix ; net : acte en main, le prix majoré des frais
 * d'acquisition (comme le reste de la plateforme). Les paliers (Jules, même jour) : les quatre demi-points au-dessus
 * du rendement brut affiché (6,9 % : 7 ; 7,5 ; 8 ; 8,5), chacun avec le prix FAI qui le donne et la négociation
 * à obtenir sur le prix demandé. Sans prix, à partir de 5 %.
 */
export function calculatrice({ loyer, prixFai, netVendeur = null, nego = 0 }, fraisPct = 7.5, nbPaliers = 4) {
  const l = Number(loyer) > 0 ? Number(loyer) : null;
  const base = Number(prixFai) > 0 ? Number(prixFai) : Number(netVendeur) > 0 ? Number(netVendeur) : null;
  const n = Number(nego) > 0 ? Number(nego) : 0;
  const prix = base ? base * (1 - n / 100) : null;
  const arrondi = (x) => Math.round(x * 100) / 100;
  // Le premier palier : le demi-point strictement au-dessus du brut affiché (au prix négocié s'il y en a un).
  const brutDemande = l && prix ? (l / prix) * 100 : null;
  const depart = brutDemande != null ? (Math.floor(Math.round(brutDemande * 1000) / 500) + 1) / 2 : 5;
  const paliers = Array.from({ length: nbPaliers }, (_, i) => depart + i * 0.5);
  return {
    brut: l && prix ? arrondi((l / prix) * 100) : null,
    net: l && prix ? arrondi((l / (prix * (1 + fraisPct / 100))) * 100) : null,
    prixNegocie: n && base ? Math.round(prix) : null,
    paliers: paliers.map((taux) => {
      const cible = l ? (l / taux) * 100 : null;
      return { taux, prix: cible ? Math.round(cible) : null, nego: cible && base ? arrondi((1 - cible / base) * 100) : null };
    }),
  };
}

/**
 * Pure : le prix dit, et l'autre qui s'en déduit (16 nov. 2026, Jules) : dit net vendeur, le FAI ajoute les honoraires
 * (en euros s'ils ont été dits, sinon le taux) ; dit FAI, le net vendeur les retire. Sans base dite, le prix compte comme
 * FAI et rien ne se déduit. Taux par défaut : 5 %, celui des avis de valeur.
 */
export function prixDesDeux({ prix, base = null, honorairesPct = null, honoraires = null }, tauxDefaut = 5) {
  const p = Number(prix) > 0 ? Number(prix) : null;
  if (!p) return { fai: null, net: null, honorairesPct: null };
  const hEuros = Number(honoraires) > 0 ? Number(honoraires) : null;
  const t = Number(honorairesPct) > 0 ? Number(honorairesPct) : tauxDefaut;
  if (base === 'net_vendeur') {
    const fai = hEuros ? p + hEuros : Math.round(p * (1 + t / 100));
    return { fai, net: p, honorairesPct: Math.round(((fai - p) / p) * 1000) / 10 };
  }
  if (base === 'fai') {
    const net = hEuros ? p - hEuros : Math.round(p / (1 + t / 100));
    return { fai: p, net, honorairesPct: Math.round(((p - net) / net) * 1000) / 10 };
  }
  return { fai: p, net: null, honorairesPct: null };
}
