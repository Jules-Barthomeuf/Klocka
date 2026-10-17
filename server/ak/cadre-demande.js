// Les réglages d'une demande faite depuis l'Accueil (17 oct. 2026, Jules) :
// les sources (« Auto » ou celles cochées) et la réponse attendue (« Répondre »
// dans la conversation, ou « Produire » un livrable qui finit dans À valider).
// Pure : rend le texte ajouté au cadre de la page, vide quand rien n'est réglé.

const propre = (x) => String(x || '').replace(/[\n\r]+/g, ' ').trim().slice(0, 60);

export function cadreDemande(contexte) {
  const sources = (Array.isArray(contexte?.sources) ? contexte.sources : []).map((s) => propre(typeof s === 'string' ? s : s?.nom)).filter(Boolean).slice(0, 20);
  const sortie = contexte?.sortie === 'produire' || contexte?.sortie === 'repondre' ? contexte.sortie : null;
  let t = '';
  if (sources.length) {
    t += `\n\nSOURCES CHOISIES PAR LA PERSONNE : ${sources.join(', ')}. Appuie-toi sur elles seules ; n'appelle aucun autre outil de données. Si elles ne suffisent pas, dis-le et dis ce qui manque, au lieu de chercher ailleurs. Cite la source de chaque chiffre.`;
  }
  if (sortie === 'produire') {
    t += '\n\nLA PERSONNE VEUT UN LIVRABLE : produis-le avec l\'outil qui le crée (dossier analysé, LOI, page plateforme, présentation, mail préparé…), pas seulement une réponse. Dis en une phrase ce que tu as produit et où il se trouve ; rien ne part vers l\'extérieur sans sa validation.';
  } else if (sortie === 'repondre') {
    t += '\n\nLA PERSONNE VEUT UNE RÉPONSE DANS LA CONVERSATION, avec ses sources. Ne crée ni ne modifie de document, sauf si elle le demande expressément.';
  }
  return t;
}
