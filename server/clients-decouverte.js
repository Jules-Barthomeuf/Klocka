// Un compte rendu d'appel de découverte devient un client.
//
// Paul raccroche, Gemini a résumé l'appel. On colle le résumé dans le chat du
// tableau de bord : le modèle en tire ce que le tableau « Clients » de Monday
// attend — budget, fonds propres, revenu, où il cherche, quel objectif — et
// le compte Klocka naît avec son lien d'invitation, profil pré-rempli.
//
// Le modèle lit ; il ne décide pas. Ce qu'il n'a pas trouvé reste vide, une
// case vide vaut mieux qu'une invention, et l'admin relit avant de valider.

import { Records } from './db.js';

// Les listes fermées du tableau, relevées sur place. Un libellé hors liste
// n'est pas posé : Monday le refuserait, et on ne veut pas d'à-peu-près.
export const LISTES = {
  statut: ['Intérêt', 'Def Strategie', 'Recherche', 'Négociation', 'Financement', 'Compromis', 'Projet Signé', 'Mandat signé', 'Stand-by', 'Abandonné'],
  objectif: ['Patrimoniale', 'Cashflow', 'Auto-Finance', 'Equilibre'],
  source: ['PDZ', 'LINKEDIN', 'WEBI', 'MDI', 'PARRAIN', 'GROUPE FB', 'MAIL', 'CHRIS', 'INSTAGRAM'],
  oui_non: ['Oui', 'Non'],
};

const COL = {
  email: 'email',
  telephone: 'phone',
  statut: 'status1',
  mandat: 'color_mkv2zyy3',
  patrimoine: 'text_mkv2vxfp',
  revenu: 'numeric_mkv24e64',
  fonds_propres: 'numeric_mkv27he0',
  budget: 'numeric_mkv6khwn',
  localisation: 'location_mkv2tpc2',
  formation: 'color_mkv2q4fv',
  source: 'color_mkv2n9bh',
  remarque: 'long_text_mkv2twrk',
  lieu_recherche: 'text_mkzm6pdz',
  objectif: 'color_mkzm7em7',
  information: 'text_mkvngea0',
  fonction: 'text_mkvnmx09',
  personnes: 'multiple_person_mkv6tmmw',
};

const SCHEMA = {
  type: 'object',
  properties: {
    prenom: { type: 'string' },
    nom: { type: 'string' },
    email: { type: 'string', description: "adresse mail du client si elle est dite, sinon chaîne vide" },
    telephone: { type: 'string', description: 'numéro si dit, sinon chaîne vide' },
    fonction: { type: 'string', description: 'métier ou situation professionnelle' },
    localisation: { type: 'string', description: 'ville où le client habite, si dite' },
    lieu_recherche: { type: 'string', description: 'où il veut investir : villes, régions, ou « partout »' },
    budget: { type: 'number', description: "budget d'acquisition en euros, 0 si inconnu" },
    fonds_propres: { type: 'number', description: 'apport disponible en euros, 0 si inconnu' },
    revenu: { type: 'number', description: 'revenus annuels du foyer en euros, 0 si inconnu' },
    epargne_annuelle: { type: 'number', description: "capacité d'épargne annuelle en euros, 0 si inconnue" },
    duree_emprunt: { type: 'number', description: "durée d'emprunt souhaitée en années, 0 si inconnue" },
    patrimoine: { type: 'string', description: 'patrimoine existant, en une ligne (résidence principale, locatif, placements…)' },
    objectif: { type: 'string', enum: [...LISTES.objectif, ''], description: 'Patrimoniale = transmettre/sécuriser ; Cashflow = revenus immédiats ; Auto-Finance = le loyer paie le crédit ; Equilibre = les deux' },
    profil_investisseur: { type: 'string', enum: ['equilibriste', 'risk_taker', 'collectionneur', 'visionnaire', ''], description: "le profil Klocka : équilibriste (prudent, rendement raisonnable), risk taker (rendement d'abord), collectionneur (emplacement et patrimoine), visionnaire (long terme, plus-value)" },
    statut: { type: 'string', enum: [...LISTES.statut, ''], description: "l'étape du client après cet appel : le plus souvent « Def Strategie » (stratégie à définir) ou « Recherche » si elle est déjà claire" },
    source: { type: 'string', enum: [...LISTES.source, ''], description: 'comment il a connu Klocka, si dit' },
    mandat_signe: { type: 'string', enum: [...LISTES.oui_non, ''] },
    remarque: { type: 'string', description: "résumé de l'appel en trois à six lignes : situation, attentes, points d'attention, prochaine étape convenue" },
    information: { type: 'string', description: "un fait utile en une ligne (situation familiale, échéance, contrainte), sinon chaîne vide" },
  },
  required: ['prenom', 'nom', 'remarque'],
};

/** Ce que le modèle lit dans le compte rendu. */
export async function extraireClient(texte, { par } = {}) {
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { resultat } = await mesurer({ operation: 'découverte client', par: par?.email || null }, () =>
    invokeLLM({
      prompt: `Voici le compte rendu d'un appel de découverte entre un conseiller Klocka (investissement en murs commerciaux) et un futur client. Relève ce que le tableau CRM attend. Ne devine rien : un montant non dit vaut 0, un champ non dit vaut chaîne vide. Les montants en « k » sont des milliers d'euros (« 300 k » = 300000). Le prénom et le nom sont ceux du CLIENT, pas du conseiller.

--- COMPTE RENDU ---
${String(texte || '').slice(0, 24000)}
--- FIN ---`,
      response_json_schema: SCHEMA,
    })
  );
  const c = resultat || {};
  const nombre = (v) => (typeof v === 'number' && v > 0 ? Math.round(v) : null);
  const texteOuNull = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const dansListe = (v, liste) => (liste.includes(v) ? v : null);
  return {
    prenom: texteOuNull(c.prenom),
    nom: texteOuNull(c.nom),
    email: texteOuNull(c.email)?.toLowerCase() || null,
    telephone: texteOuNull(c.telephone),
    fonction: texteOuNull(c.fonction),
    localisation: texteOuNull(c.localisation),
    lieu_recherche: texteOuNull(c.lieu_recherche),
    budget: nombre(c.budget),
    fonds_propres: nombre(c.fonds_propres),
    revenu: nombre(c.revenu),
    epargne_annuelle: nombre(c.epargne_annuelle),
    duree_emprunt: nombre(c.duree_emprunt),
    patrimoine: texteOuNull(c.patrimoine),
    objectif: dansListe(c.objectif, LISTES.objectif),
    profil_investisseur: dansListe(c.profil_investisseur, ['equilibriste', 'risk_taker', 'collectionneur', 'visionnaire']),
    statut: dansListe(c.statut, LISTES.statut) || 'Def Strategie',
    source: dansListe(c.source, LISTES.source),
    mandat_signe: dansListe(c.mandat_signe, LISTES.oui_non),
    remarque: texteOuNull(c.remarque),
    information: texteOuNull(c.information),
  };
}

/** La fiche Monday du client, créée ou mise à jour (par adresse mail). */
export async function poserClientMonday(champs, { par } = {}) {
  const { mondayConfigure, TABLEAUX, poserElement, personneMonday } = await import('./monday.js');
  if (!mondayConfigure()) return { ignore: true, raison: "aucun jeton Monday n'est déclaré (MONDAY_TOKEN)" };
  if (!TABLEAUX.investisseurs) return { ignore: true, raison: 'le tableau Clients n\'est pas déclaré (MONDAY_BOARD_INVESTISSEURS)' };
  const { valeurAdresse, oublierCache } = await import('./deal/monday-sync.js');

  const nom = [champs.prenom, champs.nom].filter(Boolean).join(' ').trim() || champs.email || 'Client';
  const colonnes = {};
  if (champs.email) colonnes[COL.email] = { email: champs.email, text: champs.email };
  if (champs.telephone) colonnes[COL.telephone] = { phone: champs.telephone.replace(/\s+/g, ''), countryShortName: 'FR' };
  if (champs.statut) colonnes[COL.statut] = { label: champs.statut };
  if (champs.objectif) colonnes[COL.objectif] = { label: champs.objectif };
  if (champs.source) colonnes[COL.source] = { label: champs.source };
  if (champs.mandat_signe) colonnes[COL.mandat] = { label: champs.mandat_signe };
  if (champs.budget) colonnes[COL.budget] = champs.budget;
  if (champs.fonds_propres) colonnes[COL.fonds_propres] = champs.fonds_propres;
  if (champs.revenu) colonnes[COL.revenu] = champs.revenu;
  if (champs.patrimoine) colonnes[COL.patrimoine] = champs.patrimoine;
  if (champs.lieu_recherche) colonnes[COL.lieu_recherche] = champs.lieu_recherche;
  if (champs.information) colonnes[COL.information] = champs.information;
  if (champs.fonction) colonnes[COL.fonction] = champs.fonction;
  if (champs.remarque) colonnes[COL.remarque] = { text: champs.remarque };
  if (champs.localisation) {
    const adresse = await valeurAdresse({ adresse: champs.localisation });
    if (adresse) colonnes[COL.localisation] = adresse;
  }
  // Qui a mené l'appel, dans la colonne Personnes.
  if (par?.email) {
    try {
      const moi = await personneMonday({ email: par.email, nom: par.full_name });
      if (moi) colonnes[COL.personnes] = { personsAndTeams: [{ id: Number(moi.id), kind: 'person' }] };
    } catch {
      /* sans correspondance, la case reste vide */
    }
  }

  const r = await poserElement(TABLEAUX.investisseurs, {
    nom,
    colonnes,
    cle: champs.email ? { colonne: COL.email, valeur: champs.email } : null,
  });
  oublierCache?.('investisseurs');
  return r;
}

/**
 * Tout d'un coup : la fiche Monday, le compte Klocka pré-rempli, le lien
 * d'invitation. Sans adresse mail, la fiche seule — un compte sans adresse ne
 * s'invite pas.
 */
export async function creerClientDepuisDecouverte(champs, { admin, base }) {
  const fait = [];
  const rates = [];
  let monday = null;
  try {
    monday = await poserClientMonday(champs, { par: admin });
    if (monday?.id) fait.push(monday.cree ? 'fiche Monday créée' : 'fiche Monday mise à jour');
    else if (monday?.ignore) rates.push(`Monday : ${monday.raison}`);
  } catch (e) {
    rates.push(`Monday : ${e?.message || e}`);
  }

  let invitation = null;
  if (champs.email) {
    const { creerInvitation } = await import('./clients-invitation.js');
    const r = creerInvitation({
      email: champs.email,
      full_name: [champs.prenom, champs.nom].filter(Boolean).join(' '),
      admin,
      base,
      profil: {
        telephone: champs.telephone,
        profil_investisseur: champs.profil_investisseur,
        revenus_annuels: champs.revenu,
        epargne_annuelle: champs.epargne_annuelle,
        apport_disponible: champs.fonds_propres,
        duree_emprunt: champs.duree_emprunt,
        objectif: champs.objectif,
        lieu_recherche: champs.lieu_recherche,
        compte_rendu_decouverte: champs.remarque,
      },
    });
    if (r.ok && r.promu) {
      invitation = { promu: true, email: champs.email, user_id: r.user.id };
      fait.push('compte découverte passé client, profil complété — la personne voit l\'espace client à sa prochaine ouverture');
    } else if (r.ok) {
      invitation = { lien: r.lien, email: champs.email, expire_le: r.expire_le, user_id: r.user.id };
      fait.push('compte Klocka créé, lien d\'invitation prêt');
    } else {
      rates.push(`Compte Klocka : ${r.error}`);
      if (r.user) invitation = { deja_actif: true, email: champs.email, user_id: r.user.id };
    }
  } else {
    rates.push("Pas d'adresse mail dans le compte rendu : le compte Klocka et son lien attendent qu'on l'ajoute.");
  }

  return {
    ok: !!(monday?.id || invitation),
    monday: monday?.id ? { id: monday.id, cree: !!monday.cree } : null,
    invitation,
    fait,
    rates,
  };
}
