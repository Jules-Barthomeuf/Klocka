// Les parties de l'onglet Documents d'un projet (24 nov. 2026, Jules : « des parties comme dans l'analyse, un truc
// quittances, un truc PV d'AG, des groupes de documents qu'on peut nommer »). Chaque pièce de `fichiers_projet` porte
// le nom de sa partie (`groupe`) ; `groupes_documents` garde l'ordre des parties et celles encore vides. Sans liste
// posée, les parties de la Data Room de l'Analyse. Une pièce sans partie va dans « Autres documents ».

export const GROUPES_PAR_DEFAUT = ["Bail", "Quittances", "PV d'AG", "Règlement de copropriété", "Diagnostics", "Taxe foncière"];
export const AUTRES_DOCUMENTS = "Autres documents";

const nomPropre = (n) => String(n || "").trim();

/** Les noms des parties, dans l'ordre : la liste du projet (ou celle par défaut), puis celles que portent les pièces. */
export function groupesDuProjet(projet) {
  const base = Array.isArray(projet?.groupes_documents) ? projet.groupes_documents : GROUPES_PAR_DEFAUT;
  const vus = new Set();
  const noms = [];
  for (const n of [...base, ...(projet?.fichiers_projet || []).map((f) => f?.groupe)]) {
    const nom = nomPropre(n);
    if (!nom || nom === AUTRES_DOCUMENTS || vus.has(nom)) continue;
    vus.add(nom);
    noms.push(nom);
  }
  return noms;
}

/**
 * Les parties et leurs pièces ; chaque pièce garde son rang dans `fichiers_projet` (`idx`).
 * « Autres documents » vient en dernier, seulement s'il a des pièces.
 */
export function documentsParGroupe(projet) {
  const noms = groupesDuProjet(projet);
  const parNom = new Map(noms.map((nom) => [nom, []]));
  const autres = [];
  (projet?.fichiers_projet || []).forEach((f, idx) => {
    const liste = parNom.get(nomPropre(f?.groupe));
    (liste || autres).push({ ...f, idx });
  });
  const parties = noms.map((nom) => ({ nom, fichiers: parNom.get(nom), autres: false }));
  if (autres.length) parties.push({ nom: AUTRES_DOCUMENTS, fichiers: autres, autres: true });
  return parties;
}
