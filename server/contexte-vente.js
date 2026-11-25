// Le contexte de la vente, dicté puis mis en forme pour les clients (25 nov. 2026, Jules : « pour le contexte de la
// vente, un chat où on peut dicter, et ça structure le texte pour les clients »). L'équipe dicte ou tape dans l'éditeur
// du projet (onglet Bien) ; l'IA écrit le texte que le client lira, en courtes parties titrées, puis le reprend à chaque
// message (« enlève la partie sur le prix »). Rien n'est inventé : seul ce qui est dit ou déjà écrit entre au texte.
// Le texte se garde sur le projet (`contexte_vente`), enregistré par l'éditeur comme tout autre champ.

const SCHEMA = {
  type: 'object',
  properties: {
    texte: { type: 'string', description: 'le contexte de la vente, entier, au format demandé' },
    reponse: { type: 'string', description: 'une phrase pour l’équipe : ce qui a changé, ou la seule question qui bloque' },
  },
  required: ['texte', 'reponse'],
};

/** Pure : la consigne du modèle. `projet` : ce que la page sait du bien ; `actuel` : le texte déjà écrit ; `historique` : les échanges. */
export function consigneContexte({ projet = {}, actuel = '', demande = '', historique = [] }) {
  const bien = [projet.titre, projet.activite_locataire, projet.ville || projet.adresse_complete].filter(Boolean).join(' · ');
  return [
    "Tu écris, pour les clients investisseurs de Klocka, le « Contexte de la vente » d'un bien (murs de commerce ou fonds) : pourquoi il est à vendre et ce qu'un acheteur doit savoir de la situation.",
    "Règles : français clair et sobre, phrases courtes, vouvoiement implicite (on ne s'adresse pas au lecteur). Deux à quatre parties, chacune une ligne de titre qui commence par « ## », puis une à trois phrases courtes ou des puces qui commencent par « - ». Pas de tiret long, pas d'emoji, pas de superlatifs commerciaux.",
    "N'invente rien : seulement ce que l'équipe a dit ou ce qui est déjà dans le texte. Un chiffre ou une date non dits ne s'écrivent pas. Jamais le nom d'une personne (vendeur, locataire, agent) : « le propriétaire », « le vendeur », « l'exploitant ». Rien de privé (santé, conflit familial, dettes personnelles) : le dire sobrement (« pour des raisons personnelles »).",
    "Un nouveau message complète ou corrige le texte actuel : rends toujours le texte entier, à jour. S'il demande de retirer quelque chose, retire-le. Si le message n'apporte rien d'utilisable, rends le texte actuel tel quel et pose la seule question qui manque dans « reponse ».",
    bien ? `Le bien : ${bien}.` : '',
    actuel ? `Le texte actuel :\n${String(actuel).slice(0, 6000)}` : 'Le texte actuel : aucun.',
    historique.length ? `Les échanges précédents :\n${historique.slice(-10).map((h) => `${h.role === 'equipe' ? 'Équipe' : 'Toi'} : ${String(h.texte || '').slice(0, 1500)}`).join('\n')}` : '',
    `Le nouveau message de l'équipe : « ${String(demande).slice(0, 4000)} »`,
  ].filter(Boolean).join('\n\n');
}

/** Pure : le texte rendu, nettoyé (titres « ## », puces « - », pas de tiret long ni de ligne vide en trop). */
export function nettoyer(texte) {
  return String(texte || '').replace(/\r/g, '').replace(/\s+—\s+/g, ', ').replace(/—/g, ', ').replace(/^\s*[*•]\s+/gm, '- ').replace(/^#{1,6}\s*/gm, '## ').replace(/\n{3,}/g, '\n\n').trim();
}

/** Rédige ou reprend le contexte. `lire` : l'appel au modèle (remplacé dans les tests). */
export async function redigerContexte({ projet, actuel = '', demande, historique = [] }, { lire = null } = {}) {
  const d = String(demande || '').trim();
  if (!d) return { ok: false, error: 'Dites ou écrivez le contexte.' };
  const appeler = lire || (async (prompt) => {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    // mesurer rend { resultat, consommation } : la réponse du modèle est dans resultat.
    return (await mesurer({ operation: 'contexte de la vente', sur: `projet:${projet?.id || ''}` }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, max_tokens: 2000 }))).resultat;
  });
  const r = await appeler(consigneContexte({ projet, actuel, demande: d, historique }));
  const texte = nettoyer(r?.texte);
  return { ok: true, texte: texte || String(actuel || ''), reponse: String(r?.reponse || '').trim() || 'C’est écrit.' };
}

/**
 * Le contexte dicté dans l'Analyse d'un dossier, onglet Bien/Contexte (25 nov. 2026, Jules : « je ne vois rien dans la
 * partie Bien/Contexte de l'analyse ») : gardé sur le dossier, et recopié sur les projets nés de lui tant que leur texte
 * n'a pas été changé à part (vide, ou égal au texte d'avant du dossier) : le client le lit sur la page projet.
 */
export async function contexteDuDossier(dealId, { demande, historique = [] }, { lire = null } = {}) {
  const { Records } = await import('./db.js');
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  const lot = deal.lots?.[0] || {};
  const d = lot.donnees || lot;
  const projet = { id: deal.deal_id, titre: deal.titre || d.titre || null, activite_locataire: d.activite || d.locataire_activite || null, adresse_complete: d.adresse || deal.adresse || null };
  const avant = String(deal.contexte_vente || '');
  const r = await redigerContexte({ projet, actuel: avant, demande, historique }, { lire });
  if (!r.ok) return r;
  Records.update('Deal', deal.id, { contexte_vente: r.texte });
  for (const p of Records.filter('Project', { deal_id: dealId })) {
    const sien = String(p.contexte_vente || '');
    if (!sien.trim() || sien === avant) Records.update('Project', p.id, { contexte_vente: r.texte });
  }
  return r;
}
