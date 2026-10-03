// Le chat du Mandat : comme celui de l'Estimation, il pose les questions du
// mandat de vente — celles du modèle « Mandat de vente » de MyNotary —, le
// mandat se construit à droite à chaque réponse, et quand tout est là, il
// part dans le vrai MyNotary (server/mynotary-agent.js) : le PDF revient dans
// le chat, avec le lien pour finir l'envoi au client sur MyNotary.
//
// Ce que MyNotary remplit seul (la partie Klocka : société, carte T,
// garantie, assurance) ne se demande jamais. Le mandataire donne le mandant,
// le bien, le prix, les honoraires, la durée.

import { Records } from './db.js';

const ENTITE = 'MandatMandataire';
const ESPACE_CHAT = 'mandataire-mandat';
const moi = (user) => String(user?.email || '').toLowerCase();

export const TYPES = { simple: 'Simple', semi_exclusif: 'Semi-exclusif', exclusif: 'Exclusif' };

// Ce que le mandat ne peut pas ne pas dire. Le reste s'affiche « à compléter ».
const OBLIGATOIRES = [
  ['type_mandat', 'le type de mandat (simple, semi-exclusif, exclusif)'],
  ['mandant', 'le mandant (nom et prénom, ou la société)'],
  ['vendeur_adresse', "l'adresse du mandant"],
  ['bien_adresse', "l'adresse du bien"],
  ['bien_designation', 'la désignation du bien (ex. local commercial en rez-de-chaussée)'],
  ['prix', 'le prix de vente'],
  ['honoraires', 'les honoraires'],
  ['honoraires_charge', 'la charge des honoraires (vendeur ou acquéreur)'],
  ['duree_mois', 'la durée du mandat'],
];

/** Pure : ce qui manque encore, en clair. */
export function manquantsMandat(q = {}) {
  const ok = (cle) => {
    if (cle === 'mandant') return !!(q.vendeur_societe || q.vendeur_nom);
    const v = q[cle];
    return v !== undefined && v !== null && v !== '';
  };
  return OBLIGATOIRES.filter(([cle]) => !ok(cle)).map(([, mot]) => mot);
}

/** Pure : un nombre dit comme on le dit (« 450 000 € », « 5 % », « 12 mois »). */
export function nombreDit(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').replace(/\u00a0|\u202f/g, ' ').match(/\d{1,3}(?:[ .]\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const brut = m[0];
  const n = /[ ]/.test(brut) || (/\.\d{3}(?!\d)/.test(brut) && !/,/.test(brut))
    ? Number(brut.replace(/[ .]/g, '').replace(',', '.'))
    : Number(brut.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const CHAMPS = {
  type_mandat: (v) => {
    const t = String(v || '').toLowerCase();
    if (/semi/.test(t)) return 'semi_exclusif';
    if (/exclu/.test(t)) return 'exclusif';
    if (/simple/.test(t)) return 'simple';
    return undefined;
  },
  vendeur_genre: (v) => (/moral|soci|sci|sarl|sas/i.test(String(v)) ? 'morale' : /physi|personne|particulier/i.test(String(v)) ? 'physique' : undefined),
  vendeur_civilite: (v) => String(v).trim().slice(0, 20),
  vendeur_nom: (v) => String(v).trim().slice(0, 80),
  vendeur_prenom: (v) => String(v).trim().slice(0, 80),
  vendeur_societe: (v) => String(v).trim().slice(0, 120),
  vendeur_forme: (v) => String(v).trim().slice(0, 40),
  vendeur_siren: (v) => (String(v).replace(/\D/g, '').length === 9 ? String(v).replace(/\D/g, '') : String(v).trim().slice(0, 20)),
  vendeur_representant: (v) => String(v).trim().slice(0, 120),
  vendeur_adresse: (v) => String(v).trim().slice(0, 200),
  vendeur_email: (v) => String(v).trim().toLowerCase().slice(0, 120),
  vendeur_telephone: (v) => String(v).trim().slice(0, 30),
  bien_adresse: (v) => String(v).trim().slice(0, 200),
  bien_designation: (v) => String(v).trim().slice(0, 400),
  bien_surface: (v) => { const n = nombreDit(v); return n > 0 && n < 100000 ? n : undefined; },
  bien_occupe: (v) => (typeof v === 'boolean' ? v : /oui|occup|lou/i.test(String(v)) ? true : /non|libre|vide/i.test(String(v)) ? false : undefined),
  bien_locataire: (v) => String(v).trim().slice(0, 160),
  prix: (v) => { const n = nombreDit(v); return n > 1000 && n < 1e9 ? Math.round(n) : undefined; },
  prix_tva: (v) => (typeof v === 'boolean' ? v : /oui|tva/i.test(String(v)) ? true : /non/i.test(String(v)) ? false : undefined),
  mobilier: (v) => (typeof v === 'boolean' ? v : /oui/i.test(String(v)) ? true : /non/i.test(String(v)) ? false : undefined),
  honoraires: (v) => { const n = nombreDit(v); return n > 0 && n < 1e7 ? n : undefined; },
  honoraires_unite: (v) => (/€|eur/i.test(String(v)) ? '€' : '%'),
  honoraires_charge: (v) => (/acqu/i.test(String(v)) ? 'acquereur' : /vend|mandant/i.test(String(v)) ? 'vendeur' : undefined),
  duree_mois: (v) => { const n = nombreDit(v); return n >= 1 && n <= 60 ? Math.round(n) : undefined; },
  date_effet: (v) => String(v).trim().slice(0, 40),
  observations: (v) => String(v).trim().slice(0, 1000),
};

/** Pure : les réponses dites, propres ; ce qui ne se lit pas est rendu à part. */
export function nettoyerReponses(reponses = {}) {
  const propres = {};
  const illisibles = [];
  for (const [cle, brut] of Object.entries(reponses || {})) {
    const f = CHAMPS[cle];
    if (!f || brut === null || brut === undefined || brut === '') continue;
    const v = f(brut);
    if (v === undefined || v === '') illisibles.push(cle);
    else propres[cle] = v;
  }
  // Des honoraires dits « 5 % » ou « 15 000 € » portent leur unité.
  if (reponses?.honoraires != null && propres.honoraires != null && !reponses.honoraires_unite) {
    propres.honoraires_unite = /€|eur/i.test(String(reponses.honoraires)) || propres.honoraires > 100 ? '€' : '%';
  }
  return { propres, illisibles };
}

/** Pure : « SCI » + « SCI du Pont » ne fait pas « SCI SCI du Pont ». */
export function societeAvecForme(forme, societe) {
  const f = String(forme || '').trim();
  const n = String(societe || '').trim();
  if (!f || new RegExp(`^${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(n)) return n;
  return `${f} ${n}`;
}

/** Pure : le nom du mandant tel qu'il s'écrit sur le mandat. */
export function nomMandant(q = {}) {
  if (q.vendeur_societe) return societeAvecForme(q.vendeur_forme, q.vendeur_societe);
  return [q.vendeur_civilite, q.vendeur_prenom, q.vendeur_nom].filter(Boolean).join(' ') || null;
}

// --- Le mandat en cours de la conversation ---------------------------------

function enCours(user, conv) {
  const miens = Records.list(ENTITE).filter((m) => m.mandataire_email === moi(user) && m.questionnaire);
  if (conv) {
    const lie = miens.filter((m) => m.conversation_id === conv).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0];
    if (lie) return lie;
  }
  // Le mandat commencé au premier message, avant que la conversation ait son identifiant.
  return miens.filter((m) => !m.conversation_id && m.statut === 'brouillon' && Date.now() - Date.parse(m.cree_le) < 10 * 60000)
    .sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le)))[0] || null;
}

export function commencerMandat({ bien = null } = {}, user, conv = null) {
  const deja = enCours(user, conv);
  if (deja && deja.statut === 'brouillon') return { ok: true, mandat_id: deja.id, deja: true };
  const m = Records.create(ENTITE, {
    mandataire_email: moi(user),
    bien: String(bien || 'Mandat de vente').trim().slice(0, 160),
    vendeur: null, vendeur_contact: null, prix: null, honoraires: null, honoraires_charge: null, type: null, duree_mois: null,
    questionnaire: {},
    conversation_id: conv,
    statut: 'brouillon',
    reference_mynotary: null, document: null, document_signe: null, numero_registre: null, mynotary_url: null,
    cree_le: new Date().toISOString(),
    historique: [{ le: new Date().toISOString(), par: user?.email || null, action: 'mandat commencé dans le chat' }],
  });
  return { ok: true, mandat_id: m.id };
}

export function noterMandat(reponses, user, conv = null) {
  const m = enCours(user, conv);
  if (!m) return { ok: false, error: "Aucun mandat en cours : commence-le d'abord (commencer_mandat)." };
  if (m.statut !== 'brouillon') return { ok: false, error: `Ce mandat est déjà parti (« ${m.statut} ») : une correction passe par corriger_mandat.` };
  const { propres, illisibles } = nettoyerReponses(reponses);
  const q = { ...(m.questionnaire || {}), ...propres };
  const titre = q.bien_adresse || q.bien_designation ? [q.bien_designation?.split(/[,.]/)[0], q.bien_adresse].filter(Boolean).join(' · ').slice(0, 160) : m.bien;
  // L'état d'avant reste à portée des flèches de l'aperçu (trente pas au plus).
  const passe = [...(m.questionnaire_passe || []), { questionnaire: m.questionnaire || {}, bien: m.bien }].slice(-30);
  Records.update(ENTITE, m.id, { questionnaire: q, bien: titre, questionnaire_passe: passe, questionnaire_futur: [], ...(conv && !m.conversation_id ? { conversation_id: conv } : {}) });
  const reste = manquantsMandat(q);
  return {
    ok: true, mandat_id: m.id, notes: Object.keys(propres),
    ...(illisibles.length ? { illisibles, note_illisibles: `Ces réponses ne se lisent pas : ${illisibles.join(', ')} — redemande-les.` } : {}),
    manquants: reste,
  };
}

/**
 * Tout est là : la demande devient un mandat « demande_envoyee » (la porte et
 * le registre le suivent comme avant), et l'agent MyNotary le crée s'il est
 * allumé. Sinon, ou s'il échoue, l'équipe Klocka le saisit — et on le dit.
 */
export async function envoyerMandat(user, conv = null, { surEtape = null } = {}) {
  const m = enCours(user, conv);
  if (!m) return { ok: false, error: 'Aucun mandat en cours.' };
  if (m.statut !== 'brouillon') return { ok: true, deja: true, mandat_id: m.id, statut: m.statut };
  const q = m.questionnaire || {};
  const reste = manquantsMandat(q);
  if (reste.length) return { ok: false, manquants: reste, error: `Il manque encore : ${reste.join(', ')}.` };

  surEtape?.('Le mandat est complet : préparation de la saisie MyNotary');
  Records.update(ENTITE, m.id, {
    vendeur: nomMandant(q),
    vendeur_contact: [q.vendeur_email, q.vendeur_telephone].filter(Boolean).join(' · ') || null,
    prix: q.prix,
    honoraires: q.honoraires,
    honoraires_charge: q.honoraires_charge,
    type: q.type_mandat === 'simple' ? 'simple' : 'exclusif',
    duree_mois: q.duree_mois,
    statut: 'demande_envoyee',
    demande_envoyee_le: new Date().toISOString(),
    historique: [...(m.historique || []), { le: new Date().toISOString(), par: user?.email || null, action: 'mandat complété dans le chat, envoyé à MyNotary' }],
  });

  const { agentMyNotaryActif, lancerAgentMandat } = await import('./mynotary-agent.js');
  if (!agentMyNotaryActif()) {
    return { ok: true, mandat_id: m.id, statut: 'demande_envoyee', en_file: true, note: "L'agent MyNotary n'est pas encore allumé : l'équipe Klocka saisit ce mandat sur MyNotary et le dépose ici. Dis-le en une ligne." };
  }
  surEtape?.('Connexion à MyNotary');
  const r = await lancerAgentMandat(m.id, { surEtape });
  if (!r.ok) {
    return { ok: true, mandat_id: m.id, statut: 'demande_envoyee', en_file: true, note: `La saisie automatique n'a pas abouti (${String(r.error || '').slice(0, 140)}) : l'équipe Klocka est prévenue et le saisit. Dis-le en une ligne, sans détail technique.` };
  }
  const frais = Records.get(ENTITE, m.id);
  return { ok: true, mandat_id: m.id, statut: frais.statut, document: frais.document || null, mynotary_url: frais.mynotary_url || null };
}

// --- Le chat ----------------------------------------------------------------

const OUTILS = [
  {
    name: 'commencer_mandat',
    description: 'Commence le mandat de cette conversation (une fois, au premier message qui parle d’un mandat).',
    input_schema: { type: 'object', properties: { bien: { type: 'string', description: 'Le bien, en quelques mots' } } },
  },
  {
    name: 'noter_mandat',
    description: 'Enregistre les réponses du mandataire. Clés possibles : type_mandat (simple|semi_exclusif|exclusif), vendeur_genre (physique|morale), vendeur_civilite, vendeur_nom, vendeur_prenom, vendeur_societe, vendeur_forme, vendeur_siren, vendeur_representant, vendeur_adresse, vendeur_email, vendeur_telephone, bien_adresse, bien_designation, bien_surface, bien_occupe, bien_locataire, prix, prix_tva, mobilier, honoraires, honoraires_unite (%|€), honoraires_charge (vendeur|acquereur), duree_mois, date_effet, observations. Les valeurs telles que dites.',
    input_schema: { type: 'object', properties: { reponses: { type: 'object' } }, required: ['reponses'] },
  },
  {
    name: 'envoyer_mynotary',
    description: 'Le mandat est complet ET le mandataire a dit que c’est bon (« c’est tout bon », « envoie », « vas-y ») : il part dans MyNotary. Jamais avant son accord.',
    input_schema: { type: 'object', properties: {} },
  },
];

const CONSIGNE = `Tu prépares, avec un mandataire du réseau K Partners, un MANDAT DE VENTE qui sera saisi dans MyNotary. Le mandat se construit à droite de l'écran à chaque réponse : le mandataire le voit.

1. Au premier message : commencer_mandat, puis noter_mandat avec TOUT ce qui a été dit (rien n'est redemandé).
2. Puis TOUTES les questions restantes EN UN SEUL MESSAGE, en liste numérotée courte : le mandant (personne ou société : nom, adresse, contact ; pour une société, forme, SIREN, représentant), le bien (adresse, désignation, surface, occupé ou libre), le prix de vente, TVA ou non, mobilier ou non, le type de mandat, les honoraires (montant ou %, à la charge de qui), la durée. Ne demande pas ce que MyNotary remplit seul : la partie Klocka (société, carte T, garantie, assurance) est déjà dans le modèle.
3. À chaque réponse : noter_mandat. S'il reste des manques, redemande-les en un message.
4. Quand plus rien ne manque : résume le mandat en 3 lignes (mandant, bien et prix, honoraires et durée) et demande « Je l'envoie dans MyNotary ? ». À son accord seulement : envoyer_mynotary.
5. Après l'envoi : une ligne. Si le PDF est revenu, dis qu'il s'ouvre et qu'on peut le compléter sur MyNotary pour l'envoyer au client. S'il est parti en file, dis que l'équipe Klocka le saisit.

On n'invente rien. Prix en euros, honoraires tels que dits. Phrases courtes, vouvoiement, pas de jargon technique.`;

/** Un tour du chat du Mandat. */
export async function discuterMandat({ historique = [], texte, user, surEtape = null, piece = null, conversation_id = null }) {
  const conv = conversation_id ? String(conversation_id) : null;
  if (conv) {
    // Le mandat commencé avant que la conversation ait son identifiant s'y rattache.
    const orphelin = enCours(user, null);
    if (orphelin && !orphelin.conversation_id && !Records.list(ENTITE).some((x) => x.conversation_id === conv)) Records.update(ENTITE, orphelin.id, { conversation_id: conv });
  }
  if (piece) {
    surEtape?.(piece.texte ? `Je lis le document : ${piece.nom}` : `${piece.nom} : illisible, je fais sans`);
    texte = `${texte || 'Voici une pièce.'}\n\n(pièce jointe : ${piece.nom}${piece.texte ? `. Ce qu'on y lit : ${piece.texte.slice(0, 12000)}` : ', illisible'})`;
  }
  const actuel = enCours(user, conv);
  const contexte = actuel
    ? `\n\nMandat en cours (${actuel.statut}) : ${JSON.stringify(actuel.questionnaire || {}).slice(0, 3000)}. Encore obligatoire : ${manquantsMandat(actuel.questionnaire || {}).join(', ') || 'rien'}.`
    : '\n\nAucun mandat en cours.';
  const { runAgent } = await import('./llm.js');
  let envoi = null;
  let mandatId = actuel?.id || null;
  const messages = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }]
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-24)
    .map((m) => ({ role: m.role, content: m.contenu }));
  const { text } = await runAgent({
    system: `${CONSIGNE}\n\nNous sommes le ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })}.${contexte}`,
    messages,
    tools: OUTILS,
    onTool: async ({ name, input = {} }) => {
      try {
        if (name === 'commencer_mandat') {
          surEtape?.('Nouveau mandat de vente');
          const r = commencerMandat(input, user, conv);
          if (r.mandat_id) mandatId = r.mandat_id;
          return r;
        }
        if (name === 'noter_mandat') {
          const cles = Object.keys(input.reponses || {}).map((k) => k.replaceAll('_', ' '));
          surEtape?.(cles.length ? `Je note : ${cles.slice(0, 8).join(', ')}${cles.length > 8 ? '…' : ''}` : 'Réponses enregistrées');
          const r = noterMandat(input.reponses, user, conv);
          if (r.mandat_id) mandatId = r.mandat_id;
          return r;
        }
        if (name === 'envoyer_mynotary') {
          const r = await envoyerMandat(user, conv, { surEtape });
          if (r.ok) envoi = r;
          return r;
        }
        return { ok: false, error: `Outil inconnu : ${name}` };
      } catch (e) {
        console.warn(`[mandat chat] ${name} :`, e?.stack || e);
        return { ok: false, error: `L'outil ${name} a échoué : ${e?.message || e}` };
      }
    },
  });
  return { texte: String(text || '').trim(), mandat_id: mandatId, ...(envoi ? { mandat: envoi } : {}) };
}

// --- L'aperçu et la reprise --------------------------------------------------

const lire = (id, user) => {
  const m = Records.get(ENTITE, id);
  return m && (m.mandataire_email === moi(user) || user?.role === 'admin') ? m : null;
};

/** Le mandat tel qu'il s'affiche à droite du chat. */
export function apercuMandat(id, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  const q = m.questionnaire || {
    // Un mandat d'avant le chat (formulaire) : ses champs, à l'aperçu.
    type_mandat: m.type, vendeur_nom: m.vendeur, bien_designation: m.bien, prix: m.prix,
    honoraires: m.honoraires, honoraires_unite: Number(m.honoraires) > 100 ? '€' : '%',
    honoraires_charge: m.honoraires_charge, duree_mois: m.duree_mois,
  };
  return { ok: true, mandat: m, questionnaire: q, manquants: manquantsMandat(q), mandant: nomMandant(q) };
}

/** La conversation d'un mandat : la sienne, ou une nouvelle qui reprend où on en était. */
export async function conversationDuMandat(id, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  const C = await import('./assistant-conversations.js');
  if (m.conversation_id && C.lireConversation(user, m.conversation_id, { espace: ESPACE_CHAT })) return { ok: true, conversation_id: m.conversation_id };
  const q = m.questionnaire || {};
  const reste = manquantsMandat(q);
  const messages = [
    { role: 'user', contenu: `Mandat · ${m.bien}` },
    {
      role: 'assistant',
      contenu: m.statut === 'brouillon'
        ? (reste.length ? `On reprend le mandat. Il manque encore : ${reste.join(', ')}.` : 'Le mandat est complet. Je l’envoie dans MyNotary ?')
        : `Mandat ${m.statut === 'demande_envoyee' ? 'envoyé : la saisie MyNotary est en cours' : m.statut === 'pret' ? 'prêt' : m.statut}. Une correction ? Dites-la ici.`,
      ...(m.document || m.mynotary_url ? { cartes: [{ titre: 'Mandat MyNotary', detail: 'Le PDF et le lien pour le compléter', etat: 'fait', lien: `mandat:${m.id}`, action: 'Ouvrir' }] } : {}),
    },
  ];
  const r = C.enregistrerConversation(user, { messages, espace: ESPACE_CHAT });
  if (!r.ok) return r;
  Records.update(ENTITE, m.id, { conversation_id: r.id });
  return { ok: true, conversation_id: r.id, cree: true };
}

/**
 * Les flèches de l'aperçu : revenir à la réponse d'avant, ou la rétablir.
 * Seulement tant que le mandat n'est pas parti dans MyNotary.
 */
export function naviguerMandat(id, sens, user) {
  const m = lire(id, user);
  if (!m) return { ok: false, error: 'Mandat introuvable.' };
  if (m.statut !== 'brouillon') return { ok: false, error: `Ce mandat est déjà parti (« ${m.statut} ») : il ne se défait plus d'ici.` };
  const passe = [...(m.questionnaire_passe || [])];
  const futur = [...(m.questionnaire_futur || [])];
  const ici = { questionnaire: m.questionnaire || {}, bien: m.bien };
  let cible;
  if (sens === 'annuler') {
    cible = passe.pop();
    if (!cible) return { ok: false, error: 'Rien à annuler.' };
    futur.push(ici);
  } else {
    cible = futur.pop();
    if (!cible) return { ok: false, error: 'Rien à rétablir.' };
    passe.push(ici);
  }
  Records.update(ENTITE, m.id, { questionnaire: cible.questionnaire, bien: cible.bien || m.bien, questionnaire_passe: passe.slice(-30), questionnaire_futur: futur.slice(-30) });
  return apercuMandat(m.id, user);
}
