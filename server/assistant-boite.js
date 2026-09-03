// La boîte : un seul chat, on y met ce qu'on veut, il fait le tri.
//
// Une note en raccrochant, le mail d'un agent, le compte rendu d'un appel de
// découverte, une question, un ordre — tout arrive par la même porte. On
// classe d'abord par des règles (rapides, prévisibles) ; quand elles hésitent,
// le modèle tranche. Puis chaque famille suit son chemin, celui qui existait :
// la note remplit la fiche de l'agent, la fiche ouvre un dossier, le compte
// rendu prépare le client, la question va à l'assistant.

const TYPES = ['note', 'fiche', 'client', 'echeances', 'assistant'];

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const compter = (t, motifs) => motifs.reduce((n, m) => n + (m.test(t) ? 1 : 0), 0);

/** Les règles : un score par famille, et un verdict quand une famille domine nettement. */
export function classerParRegles(texte) {
  const t = norm(texte);
  const longueur = t.length;
  const scores = { note: 0, fiche: 0, client: 0, echeances: 0, assistant: 0 };

  // Une note d'appel commence presque toujours par « j'ai eu », « eu au téléphone »…
  if (/^(j'?ai eu|jai eu|eu au tel|eu au telephone|appel avec|appele|j'?ai appele|au tel avec|note|noter?\b)/.test(t)) scores.note += 3;
  scores.note += compter(t, [/il me rappelle|elle me rappelle|me rappelle/, /il m'?envoie|elle m'?envoie|m'?envoie les/, /rappeler|relancer? (le|la|lundi|mardi|mercredi|jeudi|vendredi)/, /de chez|de l'?agence|agence/, /d'?ici (lundi|mardi|mercredi|jeudi|vendredi|fin|la semaine)/]);

  // Le mail d'un agent ou une annonce : chiffres, surface, loyer, formules de mail.
  scores.fiche += compter(t, [/\bfai\b/, /m2|m²|metres? carres?/, /loyer/, /\bbail\b/, /locataire/, /prix de vente|a vendre|mise en vente|cession/, /bonjour|cordialement|bien a vous/, /honoraires/, /rendement/]);
  if (longueur > 600) scores.fiche += 2;
  if (longueur > 1500) scores.fiche += 2;

  // Le compte rendu d'un appel de découverte : le vocabulaire du client investisseur.
  scores.client += compter(t, [/compte[- ]rendu|resume de l'?appel|synthese de l'?appel/, /appel de decouverte|decouverte/, /budget/, /apport|fonds propres/, /revenus?|salaire/, /epargne/, /objectif/, /patrimoine/, /investisseur|investir/, /cashflow|cash-flow|patrimonial/, /profil/, /mandat/]);
  if (/gemini|transcript|participants?/.test(t)) scores.client += 2;

  // Ce qui attend : une question sur les relances, les retards, les réponses.
  if (/qu'?est[- ]ce qui attend|en attente|relances? (a faire|en retard|du jour)|qui n'?a pas repondu|sans reponse|echeances?/.test(t) && longueur < 200) scores.echeances += 4;

  // Une question ou un ordre court : l'assistant.
  if (longueur < 220) scores.assistant += 2;
  if (/\?$/.test(t.trim())) scores.assistant += 2;
  scores.assistant += compter(t, [/^(quels?|quelles?|combien|ou en est|montre|liste|prepare|envoie|annule|cherche|pousse|cree|ouvre|simule|explique|donne)/]);

  const tri = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [premier, second] = tri;
  const sur = premier[1] >= 3 && premier[1] >= second[1] + 2;
  return { type: premier[0], scores, sur };
}

/** Le modèle tranche quand les règles hésitent. */
export async function classerParModele(texte) {
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const { resultat } = await mesurer({ operation: 'boîte : tri' }, () =>
    invokeLLM({
      prompt: `Tu tries ce qu'un conseiller Klocka (investissement en murs commerciaux) vient de coller ou dicter dans son chat. Réponds par la famille :
- "note" : une note dictée après un appel avec un agent immobilier ou un contact (« j'ai eu Marc, il me rappelle jeudi… »)
- "fiche" : le mail ou l'annonce d'un agent décrivant un bien à vendre (prix, surface, loyer, bail…)
- "client" : le compte rendu d'un appel de découverte avec un futur client investisseur (budget, apport, objectifs…)
- "echeances" : il demande ce qui attend, les relances, ce qui n'a pas eu de réponse
- "assistant" : une question ou un ordre pour l'assistant (dossiers, mails, Monday, simulation…)

--- TEXTE ---
${String(texte || '').slice(0, 6000)}
--- FIN ---`,
      response_json_schema: {
        type: 'object',
        properties: { type: { type: 'string', enum: TYPES }, raison: { type: 'string' } },
        required: ['type'],
      },
    })
  );
  return TYPES.includes(resultat?.type) ? resultat.type : 'assistant';
}

export async function classer(texte) {
  const regles = classerParRegles(texte);
  if (regles.sur) return { type: regles.type, par: 'regles', scores: regles.scores };
  const type = await classerParModele(texte);
  return { type, par: 'modele', scores: regles.scores };
}

/**
 * La boîte, d'un bout à l'autre : on classe, on fait. `historique` porte les
 * échanges précédents pour l'assistant, qui a besoin du fil.
 */
export async function traiterBoite({ texte, historique = [], user, type: force = null }) {
  const tri = force && TYPES.includes(force) ? { type: force, par: 'force' } : await classer(texte);
  const base = { type: tri.type, tri: tri.par };

  if (tri.type === 'note') {
    const { traiterNoteAppel } = await import('./deal/appels.js');
    const r = await traiterNoteAppel(texte, { user });
    return { ...base, ...r };
  }

  if (tri.type === 'fiche') {
    const { analyserFiche, obtenirDossier } = await import('./deal/index.js');
    const r = await analyserFiche({ texte }, { user, dealId: null });
    const dossier = obtenirDossier(r.deal_id);
    let clients = null;
    try {
      const { mondayConfigure } = await import('./monday.js');
      if (mondayConfigure() && !dossier?.test) {
        const { investisseursPourDeal } = await import('./deal/monday-sync.js');
        const { Records } = await import('./db.js');
        const candidats = await investisseursPourDeal(Records.filter('Deal', { deal_id: r.deal_id })[0]);
        clients = candidats.map((c) => ({ nom: c.client.nom, email: c.client.email, raisons: c.raisons }));
      }
    } catch {
      /* sans Monday, pas de correspondance */
    }
    return { ...base, deal_id: r.deal_id, lot: r.lot, titre: dossier?.titre || null, clients };
  }

  if (tri.type === 'client') {
    const { extraireClient } = await import('./clients-decouverte.js');
    const champs = await extraireClient(texte, { par: user });
    return { ...base, champs };
  }

  if (tri.type === 'echeances') {
    const { echeances } = await import('./deal/echeances.js');
    return { ...base, ...echeances() };
  }

  const { commander } = await import('./assistant-commande.js');
  const suite = [...(Array.isArray(historique) ? historique : []), { role: 'user', contenu: texte }];
  const r = await commander(suite, user);
  return { ...base, ...r };
}
