// Les notes de la fiche du bien : ce qu'il faut savoir sur chaque ligne avant
// de s'y fier, écrit à partir de ce que la fiche dit vraiment (la valeur lue,
// sa citation, sa confiance, les motifs de la grille). Aucun modèle : une
// note ne dit que ce qui est dans le dossier, et elle ne coûte rien.
//
// Le cas qui l'a fait naître : une fiche donne un prix net vendeur, les
// honoraires « à la charge du preneur » sans montant. Le prix affiché comme
// FAI est alors trop bas, le rendement trop haut, et rien ne le disait.

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const citation = (x) => (x && typeof x === 'object' ? x.citation : null) || null;
const euros = (n) => `${Math.round(n).toLocaleString('fr-FR')} €`;

// Les lignes de la fiche du bien et les champs qu'elles montrent.
const CHAMPS = {
  prix: ['prix_fai'],
  rendement: ['rendement_net_moyen', 'rendement_aem', 'rendement_fai'],
  loyer: ['loyer_annuel_ht_hc'],
  occupe: ['occupe'],
  activite: ['locataire_activite', 'categorie_activite', 'activite_exclue'],
  enseigne: ['locataire_nom', 'signature', 'signature_confiance'],
  emplacement: ['emplacement'],
};

/** Pure : le prix est-il un net vendeur dont les honoraires ne sont pas chiffrés ? */
export function netVendeurSansHonoraires(lot) {
  const l = lot?.lot || {};
  const prix = Number(val(l.prix_fai)) || null;
  if (!prix) return null;
  const hors = val(l.honoraires_inclus) === false || /net\s+vendeur/i.test(citation(l.prix_fai) || '');
  const montant = Number(val(l.montant_honoraires)) || 0;
  if (!hors) return null;
  return { prix, montant, chiffres: montant > 0, citation: citation(l.prix_fai), charge: citation(l.honoraires_inclus) };
}

/**
 * Pure : les notes par ligne de la fiche du bien, et les lignes qu'elles font
 * passer à vérifier. `lot` est le lot tel que la page le lit (grille calculée).
 * @returns {Object<string, {textes: string[], a_verifier: boolean}>}
 */
export function notesDuLot(lot) {
  const l = lot?.lot || {};
  const grille = lot?.evaluation?.grille || [];
  const notes = {};
  const ajouter = (ligne, texte, aVerifier = false) => {
    const n = (notes[ligne] = notes[ligne] || { textes: [], a_verifier: false });
    if (texte && !n.textes.includes(texte)) n.textes.push(texte);
    if (aVerifier) n.a_verifier = true;
  };

  const nv = netVendeurSansHonoraires(lot);
  if (nv && !nv.chiffres) {
    ajouter('prix', `Prix net vendeur${nv.citation ? ` (« ${nv.citation} »)` : ''}, pas un prix FAI. Les honoraires${nv.charge ? `, ${nv.charge.replace(/^honoraires\s*:\s*/i, '').toLowerCase()}` : ''}, ne sont pas chiffrés : le FAI réel est plus haut. Demander leur montant à l'agent.`, true);
    ajouter('rendement', 'Calculé sur le prix net vendeur : une fois les honoraires ajoutés, le rendement réel sera plus bas.', true);
  } else if (nv?.chiffres) {
    ajouter('prix', `Prix net vendeur de ${euros(nv.prix)} plus ${euros(nv.montant)} d'honoraires : ${euros(nv.prix + nv.montant)} FAI.`);
  }

  for (const [ligne, champs] of Object.entries(CHAMPS)) {
    for (const champ of champs) {
      const c = l[champ];
      if (c && typeof c === 'object' && !c.absent && c.confiance === 'basse') ajouter(ligne, `Lu avec une confiance basse${c.citation ? ` (« ${c.citation} »)` : ''} : à vérifier sur la fiche.`, true);
    }
    for (const c of grille.filter((x) => champs.includes(x.champ) && x.ok === false)) {
      if (c.motif) ajouter(ligne, c.motif, true);
      else if (c.valeur == null || c.valeur === '') ajouter(ligne, `${c.critere} absent de la fiche : à demander à l'agent.`, true);
      else if (c.attendu) ajouter(ligne, `${c.critere} : ${c.valeur}, attendu ${c.attendu}.`);
    }
  }
  return notes;
}
