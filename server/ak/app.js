// AK dans l'application : le chat du tableau de bord parle au même moteur
// que l'AK de Google Chat (même consigne, mêmes outils, mêmes garde-fous
// contre les doublons). Trois différences, parce que l'écran n'est pas un
// fil de chat :
//  - les étapes partent en direct (`surEtape`), le fil les affiche une à une ;
//  - un mail rédigé revient en brouillon à relire sous la réponse, au lieu
//    d'être collé dans la conversation ;
//  - une tâche de fond (LOI, K-Data, préz, prospection ALX) s'annonce, finie,
//    par une notification de l'application.

const CADRE_APP = `

TU RÉPONDS DANS L'APPLICATION KLOCKA (le chat du tableau de bord), pas dans Google Chat :
- pas de mention @, pas de pièce jointe à poster ;
- les liens vers la plateforme en chemins relatifs (/Dossiers?deal_id=…, /Projet?id=…) ;
- un mail rédigé (mail_agent, mail_libre, retoucher_brouillon) s'ouvre en brouillon sous ta réponse, à relire et envoyer d'un clic : dis-le en une ligne, ne le recopie pas ;
- une tâche de fond finie sera annoncée par une notification de l'application : dis « je te préviens quand c'est prêt ».`;

const LECTURES = new Set(['chercher_dossier', 'chercher_projet', 'etat_dossier', 'etat_projet', 'verifier', 'outils_kdata', 'taches_en_cours', 'historique_actions', 'plan_du_jour', 'registre_engagements', 'interroger_documents', 'marche_ville', 'boite_recue', 'lire_mail', 'mails_du_dossier', 'chercher_drive', 'agenda', 'souvenirs', 'verifier_renta', 'chercher_biens', 'lire_piece', 'chercher_cible', 'chercher_agents', 'version']);
const MAILS = new Set(['mail_agent', 'mail_libre', 'retoucher_brouillon']);

/**
 * Un tour du chat de l'application, traité par AK.
 * @param {{texte: string, historique?: Array<{role, contenu}>, user: object, surEtape?: Function}} p
 * @returns {Promise<{texte, actions, outils, brouillon, taches}>}
 */
export async function repondreApp({ texte, historique = [], user, surEtape = null }) {
  const { consigne, OUTILS, executerOutil, MODELE } = await import('./agent.js');
  const { runAgent } = await import('../llm.js');
  const { libelleOutil } = await import('../etapes-libelles.js');
  const { estEchec, journaliser } = await import('../assistant-journal.js');

  const espace = `app:${String(user?.email || 'inconnu').toLowerCase()}`;
  const prenom = String(user?.full_name || user?.email || 'Quelqu’un').split(/[ @]/)[0];
  const aujourdhui = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });
  const message = { espace, auteur: { nom: user?.email || null, affiche: prenom }, texte, pieces: [], groupe: false };
  const messages = [
    ...(Array.isArray(historique) ? historique : [])
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.contenu })),
    { role: 'user', content: `${prenom} (compte ${user?.email || '?'}, ${aujourdhui}, depuis l'application) : ${texte}` },
  ];

  const fond = [];
  const apres = [];
  const actions = [];
  const outils = [];
  const { text } = await runAgent({
    system: consigne() + CADRE_APP,
    messages,
    tools: OUTILS,
    model: MODELE,
    cache: true,
    onTool: async (appel) => {
      outils.push(appel.name);
      surEtape?.(libelleOutil(appel.name, appel.input));
      const resultat = await executerOutil(appel, user, { fond: (t) => fond.push(t), apres: (t) => apres.push(t), message });
      if (!LECTURES.has(appel.name)) {
        if (!estEchec(resultat)) actions.push({ ...appel, resultat });
        try { journaliser({ outil: appel.name, args: appel.input, resultat, user: { ...user, email: `${user?.email} (AK dans l'application)` } }); } catch (e) { console.warn('[ak app] journalisation impossible :', e?.message || e); }
      }
      return resultat;
    },
  });

  // Le mail rédigé : le brouillon qu'AK garde pour cet espace.
  let brouillon = null;
  if (outils.some((o) => MAILS.has(o))) {
    const { brouillonEnAttente } = await import('./mail-agent.js');
    const b = brouillonEnAttente(espace);
    if (b) brouillon = { destinataire: b.a || '', objet: b.objet || '', corps: b.corps || '', deal_id: b.deal_id || null, intention: b.intention || null, ak_id: b.id };
  }
  // Les tâches de fond partent, et s'annonceront par une notification.
  if (fond.length) {
    const { lancerTachesApp } = await import('./veille.js');
    lancerTachesApp(fond, user);
  }
  const reponse = [String(text || '').trim() || 'Rien à répondre là-dessus.', ...(brouillon ? [] : apres)].join('\n\n');
  return { texte: reponse, actions, outils, brouillon, taches: fond.map((t) => t.libelle) };
}
