// Les réglages d'une demande faite depuis l'Accueil (17 oct. 2026, Jules) :
// les sources (« Auto » ou celles cochées) et la réponse attendue (« Répondre »
// dans la conversation, ou « Produire » un livrable qui finit dans À valider).
// Pure : rend le texte ajouté au cadre de la page, vide quand rien n'est réglé.

const propre = (x) => String(x || '').replace(/[\n\r]+/g, ' ').trim().slice(0, 60);

/**
 * @param {object} contexte  `sources`, `sortie`, `sources_eteintes`
 * @param {{competence?: {nom: string, texte: string}|null}} options  la compétence choisie (sa version publiée, rendue)
 */
export function cadreDemande(contexte, { competence = null } = {}) {
  const sources = (Array.isArray(contexte?.sources) ? contexte.sources : []).map((s) => propre(typeof s === 'string' ? s : s?.nom)).filter(Boolean).slice(0, 20);
  const sortie = contexte?.sortie === 'produire' || contexte?.sortie === 'repondre' ? contexte.sortie : null;
  let t = '';
  if (competence?.texte) {
    const eteintes = (Array.isArray(contexte?.sources_eteintes) ? contexte.sources_eteintes : []).map((s) => propre(typeof s === 'string' ? s : s?.nom)).filter(Boolean).slice(0, 20);
    t += `\n\nLA PERSONNE A CHOISI LA COMPÉTENCE « ${propre(competence.nom)} ». Suis sa méthode à la lettre ; elle est publiée, elle fait foi :\n${String(competence.texte).slice(0, 12000)}`;
    if (eteintes.length) t += `\n\nSOURCES ÉTEINTES POUR CE LANCEMENT : ${eteintes.join(', ')}. N'appelle pas ces sources, et DIS-LE dans le livrable (par exemple « analyse faite sans ${eteintes[0]} »).`;
  }
  if (sources.length) {
    t += `\n\nSOURCES CHOISIES PAR LA PERSONNE : ${sources.join(', ')}. Appuie-toi sur elles seules ; n'appelle aucun autre outil de données. Si elles ne suffisent pas, dis-le et dis ce qui manque, au lieu de chercher ailleurs. Cite la source de chaque chiffre.`;
  }
  if (sortie === 'produire') {
    t += '\n\nLA PERSONNE VEUT UN LIVRABLE : produis-le avec l\'outil qui le crée (dossier analysé, LOI, page plateforme, présentation, mail préparé…), pas seulement une réponse. Dis en une phrase ce que tu as produit et où il se trouve ; rien ne part vers l\'extérieur sans sa validation.';
  } else if (sortie === 'repondre') {
    t += '\n\nLA PERSONNE VEUT UNE RÉPONSE DANS LA CONVERSATION, avec ses sources. Ne crée ni ne modifie de document, sauf si elle le demande expressément.';
  }
  // Haka à la façon de la personne (Paramètres > Haka, 18 oct. 2026).
  const longueur = contexte?.haka?.longueur;
  if (longueur === 'tres_courte') t += '\n\nCETTE PERSONNE VEUT DES RÉPONSES TRÈS COURTES : deux ou trois phrases, le chiffre ou la décision d\'abord.';
  else if (longueur === 'detaillee') t += '\n\nCETTE PERSONNE ACCEPTE DES RÉPONSES PLUS DÉTAILLÉES : trois ou quatre paragraphes au plus quand le sujet le demande.';
  if (contexte?.haka?.tableaux === 'jamais') t += '\n\nCETTE PERSONNE NE VEUT PAS DE TABLEAU : des phrases seulement.';
  return t;
}
