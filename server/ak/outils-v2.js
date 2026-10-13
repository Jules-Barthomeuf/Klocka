// Les outils d'AK, version 2 (partie 3a, 13 oct. 2026) : 82 outils regroupés en
// 28 par domaine, avec un paramètre `action`. Chaque action appelle EXACTEMENT
// l'ancien outil (même nom côté exécution, mêmes paramètres, repris de son
// schéma) : le comportement ne change pas, seule la façon de le présenter au
// modèle change. Les gestes qui créent, suppriment, dépensent un crédit ou
// écrivent chez un tiers restent des outils à part. Les outils rares sont
// chargés à la demande (defer_loading, recherche d'outils d'Anthropic).
// Actif seulement avec AK_CONSIGNE=v2 (server/ak/app.js).

/**
 * Les groupes. `actions` : { action: 'ancien_outil' | { outil, fixe } } ; un groupe d'une seule entrée
 * sans action garde l'ancien outil tel quel. `differe` : chargé à la demande.
 */
export const GROUPES = [
  { nom: 'trouver_bien', defaut: 'recherche', actions: { recherche: 'trouver_bien', dossier: 'chercher_dossier', projet: 'chercher_projet', criteres: 'chercher_biens' },
    tete: "Retrouver un bien de la plateforme. À utiliser dès qu'un bien est nommé (une ville, une rue, une enseigne, un locataire) : recherche cherche dans les projets et les dossiers d'un coup ; dossier ou projet quand on sait lequel ; criteres pour des biens qui répondent à des critères (ville, prix, rendement, bail). Il te faut l'identifiant avant d'agir sur un bien. Pas pour compter ou exporter (chercher_entites). Rend les candidats avec leurs identifiants ; plusieurs : liste-les et demande lequel ; aucun : essaie une autre formulation avant de dire que tu n'as rien." },
  { nom: 'lire_entite', seul: 'lire_entite' },
  { nom: 'chercher_entites', seul: 'chercher_entites' },
  { nom: 'dossier', actions: { etat: 'etat_dossier', verifier: 'verifier', simuler: 'simuler_dossier', renta: 'verifier_renta', avis: 'avis_dossier', modifier: 'modifier_dossier', renommer: 'renommer_dossier', interroger: 'interroger_documents', extraire: 'extraire_documents', ajouter_document: 'ajouter_document' },
    tete: "Un dossier de préanalyse déjà sur la plateforme (après trouver_bien) : son état, la vérification, le simulateur, la renta (conclusion nette sur le rendement global contre le seuil de la grille), l'avis, une modification de chiffre (loyer, prix, surface, bail : le verdict et le simulateur se recalculent), un renommage, une question à ses pièces, une pièce à ajouter. Pas pour créer un dossier (creer_dossier) ni le supprimer (supprimer_dossier). Rend ce que rend chaque action ; une modification dit ce qui a changé." },
  { nom: 'creer_dossier', defaut: 'depuis_fiche', actions: { depuis_fiche: 'analyser_fiche', vide: 'creer_dossier' },
    tete: "Créer un dossier. depuis_fiche : une fiche commerciale, une annonce, un mémorandum ou un teaser (pièce jointe, texte collé, capture recopiée) : le dossier est créé ET préanalysé ; c'est le cas courant. vide : « crée un dossier X » sans pièce, et rien d'autre (Monday seulement si on le demande). Pas pour une pièce d'un dossier qui existe déjà (dossier, action ajouter_document), ni pour relire une présentation (presentation, action relire)." },
  { nom: 'supprimer_dossier', seul: 'supprimer_dossier' },
  { nom: 'projet', actions: { etat: 'etat_projet', photos: 'ajouter_photos_projet' },
    tete: "Un projet de la plateforme (après trouver_bien) : son état (statut, simulateur, bail, marché), ou des photos à lui ajouter. Pour un champ que l'état ne montre pas, lire_entite (type projet). Rend l'état du projet, ou ce qui a été ajouté." },
  { nom: 'creer_projet', seul: 'creer_projet_depuis_dossier' },
  { nom: 'presentation', actions: { creer: 'creer_presentation_bancaire', lire: 'lire_presentation', modifier: 'modifier_presentation', relire: 'verifier_presentation', drive: 'generer_prez_bancaire' },
    tete: "La présentation bancaire d'un projet (page Présentations). creer : la construire depuis son projet ; lire : la retrouver et la montrer ; modifier : une ou plusieurs retouches d'un coup sur la présentation ouverte (chaque chiffre posé porte sa source) ; relire : une préz jointe ou existante, chaque chiffre face au projet ; drive : l'ancienne génération PPTX vers le Drive, seulement si on la demande. Pas pour une création de dossier. Avant une création ou une relecture longue, lis la fiche presentation-bancaire (lire_procedure)." },
  { nom: 'marche', actions: { valeur_locative: { outil: 'data_b', fixe: { quoi: 'valeur_locative' } }, cessions: { outil: 'data_b', fixe: { quoi: 'cessions_fonds' } }, proprietaire: { outil: 'data_b', fixe: { quoi: 'proprietaire' } }, commune: 'donnees_commune', ville: 'marche_ville', loyers_equimmox: 'loyers_equimmox', prix_murs: 'prix_murs_equimmox' },
    tete: "Les données de marché, toujours sourcées : valeur_locative, cessions et proprietaire (Data-B, rangés dans le projet ou le dossier si on donne son identifiant), commune (habitants, revenu médian, chômage, prix du logement : INSEE, Le Figaro), ville (le point de marché d'une ville), loyers_equimmox (loyers des baux autour d'un projet), prix_murs (prix des murs au m², offres de vente Equimmox). Equimmox et Data-B sont les seules sources de loyer ; jamais un chiffre de tête. Pas pour une étude d'implantation (etude_implantation : un crédit). Rend les chiffres avec leur source ; répète-la." },
  { nom: 'etude_implantation', differe: true, seul: { outil: 'data_b', fixe: { quoi: 'etude_implantation' } },
    description: "L'étude d'implantation Data-B d'une adresse : flux piéton et voiture, commercialité, revenus de la zone. Coûte un crédit Data-B et prend plusieurs minutes. Seulement si la personne demande une étude d'implantation, des flux ou la commercialité ; jamais pour un loyer ou pour remplir des chiffres du quartier. Avec le projet_id ou le deal_id (le résultat y est rangé), sinon l'adresse." },
  { nom: 'kdata', differe: true, actions: { outils: 'outils_kdata', lancer: 'lancer_kdata' },
    tete: "K-Data, seulement quand la personne le nomme : outils (la liste et leurs réglages, à proposer avant de lancer), lancer (avec l'adresse et le deal_id). Ne lance rien tant que la personne n'a pas choisi, sauf préférence contraire." },
  { nom: 'mail', actions: { agent: 'mail_agent', libre: 'mail_libre', retoucher: 'retoucher_brouillon' },
    tete: "Rédiger un brouillon de mail, qui s'affiche sous ta réponse ; rien ne part sans le « envoie » de la personne. agent : à l'agent d'un dossier (feedback, refus, demande de pièces, relance), avec les raisons dans ses mots ; libre : tout autre mail (client, agent sans dossier), il faut l'adresse ; retoucher : une retouche sur le mail qui attend, toute la retouche d'un coup. Pas pour écrire le mail toi-même dans ta réponse. Rend le brouillon : ne le recopie pas." },
  { nom: 'boite', actions: { liste: 'boite_recue', lire: 'lire_mail', du_dossier: 'mails_du_dossier', deposer: 'deposer_mail', preanalyser: 'preanalyser_mail' },
    tete: "Les boîtes mail de l'équipe connectées à Klocka : liste (les mails reçus, une ligne chacun), lire (un mail entier), du_dossier (les mails d'un dossier, à résumer), deposer (un mail de compléments sur le dossier de son bien, sans doublon), preanalyser (la fiche d'un mail reçu). Pour tout faire d'un mail (dossier, préanalyse, Monday), faire_tout. Rend les mails ou ce qui a été fait." },
  { nom: 'faire_tout', seul: 'faire_tout' },
  { nom: 'monday_lire', seul: 'lire_fiche_monday' },
  { nom: 'monday_ecrire', actions: { dossier: 'pousser_dossier_monday', projet: 'pousser_projet_monday', agent: 'creer_agent_monday', client: 'creer_client_monday' },
    tete: "Écrire dans Monday (un tiers) : dossier ou projet dans le tableau Propriétés, agent dans Agent immobilier, client dans Clients. Seulement quand on le demande, et tu dis ce qui a été posé. Pour lire Monday, monday_lire." },
  { nom: 'rediger_loi', seul: 'rediger_loi' },
  { nom: 'prospection', actions: { note_d_appel: 'note_d_appel', appels_du_jour: 'appels_du_jour', noter_appel: 'noter_appel', ajouter_prospect: 'ajouter_prospect', agents: 'chercher_agents', fiche_client: 'fiche_client_decouverte' },
    tete: "La prospection des agents et les clients : note_d_appel (une note dictée ou collée, la fiche Monday de l'agent se met à jour), appels_du_jour, noter_appel (un appel de la liste du jour raconté), ajouter_prospect, agents (les agents que la plateforme connaît), fiche_client (le compte rendu d'un appel de découverte avec un futur client). Rien ne part vers un agent : tout se valide sur la page Prospection." },
  { nom: 'suivi', actions: { plan_du_jour: 'plan_du_jour', echeances: 'echeances', engagements: 'registre_engagements', noter_engagement: 'noter_engagement', tenir_engagement: 'tenir_engagement', taches: 'taches_en_cours', historique: 'historique_actions', version: 'version' },
    tete: "Le suivi : plan_du_jour, echeances (relances, ce qui attend, ce qui n'a pas eu de réponse), engagements (le registre), noter_engagement et tenir_engagement, taches (les tâches de fond en cours), historique (ce qu'AK a fait), version (la version de la plateforme)." },
  { nom: 'annuler_derniere_action', seul: 'annuler_derniere_action' },
  { nom: 'lire_piece', seul: 'lire_piece' },
  { nom: 'off_market', differe: true, actions: { cible: 'chercher_cible', brouillon: 'brouillon_proprietaire', societes: 'alx_societes', message: 'alx_message', appel: 'alx_appel', lancer: 'lancer_alx' },
    tete: "L'off-market : cible (un commerce repéré), brouillon (au propriétaire d'une cible), societes (les sociétés qui détiennent les murs), message (les messages aux gérants, un par un, ou une retouche), appel (un appel au gérant raconté), lancer (la prospection d'une ville). Rien ne part sans le « envoie » de la personne." },
  { nom: 'emailing', differe: true, actions: { newsletter: 'rediger_newsletter', sequence: 'rediger_sequence', asset: 'inserer_asset' },
    tete: "L'emailing (page Emailing) : newsletter, sequence, asset (un asset dans un mail). Avant de rédiger, lis la fiche emailing (lire_procedure)." },
  { nom: 'drive', differe: true, actions: { chercher: 'chercher_drive', ranger: 'ranger_drive', creer_dossier: 'creer_drive_dossier' },
    tete: "Le Drive partagé : chercher un fichier, ranger une pièce jointe du message, créer le dossier Drive d'un deal." },
  { nom: 'agenda', differe: true, actions: { lire: 'agenda', bloquer: 'bloquer_rdv' },
    tete: "L'agenda : lire un jour, bloquer un rendez-vous (la date exacte en ISO ; la date du jour t'est donnée)." },
  { nom: 'memoire', differe: true, actions: { retenir: 'retenir', oublier: 'oublier', lire: 'souvenirs' },
    tete: "Ce que tu retiens d'une personne ou de l'équipe : retenir, oublier, lire tes souvenirs." },
];

const premierePhrase = (t) => { const s = String(t || '').trim(); const i = s.search(/[.!?](\s|$)/); const p = i > 0 ? s.slice(0, i + 1) : s; return p.length > 160 ? `${p.slice(0, 159).replace(/\s+\S*$/, "")}…` : p; };
const cible = (a) => (typeof a === 'string' ? { outil: a, fixe: {} } : { outil: a.outil, fixe: a.fixe || {} });

/** Les définitions v2, construites sur les anciennes (`anciens` : OUTILS d'agent.js) ; outil_lire_procedure en plus. */
export function outilsV2(anciens, { listeProcedures = '' } = {}) {
  const par = new Map(anciens.map((o) => [o.name, o]));
  const defs = [];
  for (const g of GROUPES) {
    if (g.seul) {
      const c = cible(g.seul);
      const ancien = par.get(c.outil);
      if (!ancien) continue;
      const props = { ...(ancien.input_schema?.properties || {}) };
      for (const k of Object.keys(c.fixe)) delete props[k];
      defs.push({ name: g.nom, description: g.description || ancien.description, input_schema: { ...ancien.input_schema, properties: props, required: (ancien.input_schema?.required || []).filter((k) => !(k in c.fixe)) }, ...(g.differe ? { defer_loading: true } : {}) });
      continue;
    }
    const proprietes = {};
    const lignes = [];
    for (const [action, a] of Object.entries(g.actions)) {
      const c = cible(a);
      const ancien = par.get(c.outil);
      if (!ancien) continue;
      for (const [k, v] of Object.entries(ancien.input_schema?.properties || {})) if (!(k in c.fixe) && !(k in proprietes)) proprietes[k] = v;
      const requis = (ancien.input_schema?.required || []).filter((k) => !(k in c.fixe));
      lignes.push(`- ${action} : ${premierePhrase(ancien.description)}${requis.length ? ` (il faut : ${requis.join(', ')})` : ''}`);
    }
    const actions = Object.keys(g.actions).filter((k) => par.has(cible(g.actions[k]).outil));
    if (!actions.length) continue;
    defs.push({
      name: g.nom,
      description: `${g.tete}\nActions :\n${lignes.join('\n')}`,
      input_schema: { type: 'object', properties: { action: { type: 'string', enum: actions, ...(g.defaut ? { description: `par défaut ${g.defaut}` } : {}) }, ...proprietes }, required: g.defaut ? [] : ['action'] },
      ...(g.differe ? { defer_loading: true } : {}),
    });
  }
  defs.push({
    name: 'lire_procedure',
    description: `Lit une fiche métier avant une procédure longue, pour la faire comme l'équipe : ${listeProcedures}. Rend la fiche (les étapes, ce qu'il faut demander, ce qui ne se fait jamais, et pour le bail et la data room les grilles de l'équipe).`,
    input_schema: { type: 'object', properties: { nom: { type: 'string' } }, required: ['nom'] },
  });
  return defs;
}

/** Pure : l'appel v2 traduit en appel de l'ancien outil, ou null s'il n'est pas un outil v2. */
export function versAncien({ name, input = {} } = {}) {
  const g = GROUPES.find((x) => x.nom === name);
  if (!g) return null;
  if (g.seul) { const c = cible(g.seul); return { name: c.outil, input: { ...input, ...c.fixe } }; }
  const action = input.action || g.defaut;
  const a = g.actions[action];
  if (!a) return { erreur: `Action inconnue pour ${name} : « ${input.action} ». Actions : ${Object.keys(g.actions).join(', ')}.` };
  const c = cible(a);
  const { action: _a, ...reste } = input;
  return { name: c.outil, input: { ...reste, ...c.fixe } };
}

/** Les outils d'Anthropic de la v2 : le bac à sable, la recherche web simple (la récente a son propre bac à sable), la recherche d'outils. */
export const SERVEURS_V2 = [
  { type: 'code_execution_20260521', name: 'code_execution' },
  { type: 'web_search_20250305', name: 'web_search', max_uses: 5 },
  { type: 'tool_search_tool_bm25_20251119', name: 'tool_search_tool_bm25' },
];
