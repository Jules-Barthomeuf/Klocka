// Les fiches métier d'AK (partie 3c, 13 oct. 2026) : les procédures longues
// (LOI, présentation bancaire, emailing, préanalyse, bail, data room…) quittent
// la consigne et se lisent à la demande (outil lire_procedure). Les textes sont
// dans docs/ak/procedures/*.md ; la grille du bail et les pièces d'une data room
// y sont ajoutées depuis le code de l'analyse, pour qu'il n'y en ait qu'une version.

import fs from 'fs';

const DOSSIER = new URL('../../docs/ak/procedures/', import.meta.url);

/** Les fiches, avec leur ligne pour la consigne. */
export const PROCEDURES = {
  loi: 'la lettre d\'intention : le bien, ce qu\'il faut demander, la correction d\'une lettre ouverte',
  'presentation-bancaire': 'la présentation bancaire : création, retouches, sources des chiffres, loyers et prix des murs, relecture d\'une préz jointe',
  emailing: 'les séquences et les newsletters : ton, valeur de chaque email, rythme, ce qu\'on ne fait jamais',
  preanalyse: 'la préanalyse d\'un dossier : fiche jointe ou collée, état, comparaison, renta, simulateur, création du projet',
  'lecture-bail': 'la lecture d\'un bail, des PV d\'AG et du règlement de copropriété : la grille de l\'équipe',
  'data-room': 'l\'analyse d\'une data room : les pièces attendues, ce qui manque, les points à trancher',
  'mails-agents': 'les mails et la boîte : à un agent, libres, retouches, « fais tout », brouillons',
  'prospection-appels': 'la prospection : notes d\'appel, appels du jour, agents, fiche client découverte',
  'off-market': 'l\'off-market : prospection d\'une ville, sociétés propriétaires, messages, brouillons aux propriétaires',
};

/** La ligne de la consigne qui les liste. */
export const listeProcedures = () => Object.entries(PROCEDURES).map(([nom, quoi]) => `${nom} (${quoi})`).join(' ; ');

async function annexe(nom) {
  if (nom === 'lecture-bail') {
    const { GRILLES } = await import('../deal/grille-bail.js');
    return Object.values(GRILLES).map((g) => `\n${g.titre.toUpperCase()}\n${g.criteres.map((c) => `- ${c.libelle} : ${c.regle}`).join('\n')}`).join('\n');
  }
  if (nom === 'data-room') {
    const { PIECES_ATTENDUES } = await import('../deal/dossier-lecture.js');
    return `\nPIÈCES ATTENDUES\n${PIECES_ATTENDUES.map((p) => `- ${p.libelle}${p.essentiel ? ' (essentiel)' : ''}`).join('\n')}`;
  }
  return '';
}

/** Une fiche par son nom. */
export async function lireProcedure({ nom } = {}) {
  const n = String(nom || '').trim().toLowerCase();
  if (!PROCEDURES[n]) return { ok: false, error: `Fiche inconnue : « ${nom} ». Fiches : ${Object.keys(PROCEDURES).join(', ')}.` };
  // Haka (17 oct. 2026) : la version publiée dans Paramètres › Compétences l'emporte sur le fichier.
  try {
    const { pourAK } = await import('../haka/competences.js');
    const publiee = pourAK(n);
    if (publiee) return { ok: true, nom: n, fiche: publiee + await annexe(n) };
  } catch { /* la base n'est pas là : le fichier */ }
  let texte;
  try { texte = fs.readFileSync(new URL(`${n}.md`, DOSSIER), 'utf8'); } catch { return { ok: false, error: `La fiche « ${n} » est introuvable sur le serveur.` }; }
  return { ok: true, nom: n, fiche: texte + await annexe(n) };
}
