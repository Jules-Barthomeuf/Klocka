// Tout ce qu'on sait d'un bien, pour l'avis de valeur (1er nov. 2026, Jules : « ça doit vérifier dans le fil toutes les
// informations, toute la conversation, pour pas que ça me repose les mêmes questions ; c'est le pire truc »).
//
// Le fil du bien (appels, pré-visite, visite dictée, avis), la fiche (remarque, parties libres, historique) et le
// compte rendu de visite, mis bout à bout en texte. Il sert deux fois : à l'ouverture de l'avis, un modèle en tire les
// réponses du questionnaire ; à chaque tour du chat de l'avis, ce qui précède les derniers messages lui est redonné.

const nettoyer = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** Pure : les messages du fil en lignes « Mandataire : … » / « Assistant : … », dans l'ordre. */
export function lignesDuFil(messages = []) {
  return (messages || [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .map((m) => `${m.role === 'user' ? 'Mandataire' : 'Assistant'} : ${nettoyer(m.contenu)}`);
}

/** Pure : ce que la fiche du bien garde en texte (remarque, parties libres, compte rendu, historique). */
export function lignesDeLaFiche(p = {}) {
  if (!p) return [];
  const l = [];
  if (p.commerce || p.adresse) l.push(`Fiche : ${[p.commerce, p.activite, [p.adresse, p.ville].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}`);
  if (p.nom) l.push(`Propriétaire des murs (fiche) : ${nettoyer(p.nom)}`);
  if (p.remarque) l.push(`Remarque de la fiche : ${nettoyer(p.remarque)}`);
  for (const s of Array.isArray(p.sections) ? p.sections : []) if (s?.titre || s?.texte) l.push(`${nettoyer(s.titre)} : ${nettoyer(s.texte)}`);
  const cr = p.biens?.compte_rendu;
  if (cr?.texte) l.push(`Compte rendu de visite : ${nettoyer(cr.texte)}`);
  if (cr?.bien && typeof cr.bien === 'object') l.push(`Compte rendu de visite (structuré) : ${JSON.stringify(cr.bien)}`);
  for (const h of Array.isArray(p.historique) ? p.historique : []) if (h?.texte) l.push(`Historique ${String(h.le || '').slice(0, 10)} : ${nettoyer(h.texte)}`);
  return l;
}

/** Pure : un texte borné qui garde la fin (le plus récent) quand il déborde. */
export function borne(lignes, max) {
  const out = [];
  let n = 0;
  for (let i = lignes.length - 1; i >= 0; i -= 1) {
    const t = lignes[i].length > 4000 ? `${lignes[i].slice(0, 3999)}…` : lignes[i];
    if (n + t.length + 1 > max) break;
    out.unshift(t);
    n += t.length + 1;
  }
  return out.join('\n');
}

/** Pure : tout ce qu'on sait d'un bien, la fiche d'abord puis le fil, borné à `max` caractères. */
export function texteDuBien(p, messages, max = 40000) {
  return borne([...lignesDeLaFiche(p), ...lignesDuFil(messages)], max);
}

/** Pure : ne garde que les clés connues et les valeurs dites (ni vide, ni « nc » inventé, ni null). */
export function reponsesLues(brut, cles) {
  const out = {};
  for (const k of cles) {
    const v = brut?.[k];
    if (v == null || v === '' || (typeof v === 'string' && /^(nc|null|inconnu|non pr[ée]cis[ée]|\[?à compléter\]?)$/i.test(v.trim()))) continue;
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

/**
 * Ce que le fil et la fiche disent, en réponses du questionnaire de l'avis. `cles` : les clés à chercher, avec leur
 * libellé. Sans modèle (tests, pas de clé) ou sans rien à lire : {}. `invoke` remplace le modèle dans les tests.
 */
export async function lireLeBien({ p = null, messages = [], cles = {}, aujourdhui = '', user = null, invoke = null, location = false } = {}) {
  const texte = texteDuBien(p, messages);
  if (!texte.trim()) return {};
  const appeler = invoke || (async (args) => {
    const { invokeLLM, llmStatus } = await import('./llm.js');
    if (!llmStatus().enabled || process.env.NODE_TEST_CONTEXT) return null;
    const { mesurer } = await import('./llm-couts.js');
    return (await mesurer({ operation: 'mandataire', par: user?.email || null }, () => invokeLLM(args))).resultat;
  });
  const proprietes = Object.fromEntries(Object.keys(cles).map((k) => [k, k === 'occupe' ? { type: 'boolean' } : k === 'surface_utile' || k === 'loyer_annuel_hc' ? { type: 'number' } : { type: 'string' }]));
  const brut = await appeler({
    prompt:
      `Voici tout ce qu'un mandataire K Partners sait d'un local commercial : la fiche, puis la conversation du bien (appels, pré-visite, visite, avis), du plus ancien au plus récent. Nous sommes le ${aujourdhui}.\n\n` +
      `Remplis les réponses du questionnaire de son avis de valeur${location ? ' locative (le local est À LOUER : on estimera son loyer, il n\'a pas de bail en place)' : ''} avec ce qui est DIT, et seulement ce qui est dit. Une information dite deux fois : la plus récente l'emporte. Rien de déduit ni d'inventé : une clé dont rien ne parle reste absente. Les montants en nombre (loyer annuel HT hors charges en €, surface utile en m²) ; un loyer mensuel se multiplie par 12. Les dates en toutes lettres (« 12 mars 2021 »), une date relative (« hier ») calculée depuis la date du jour. ${location
        // Un local à louer (6 nov. 2026, Jules) : ses critères à lui, ni bail ni taux.
        ? 'Critères du local : rang_rue (n1 | n1bis | n2), extraction (oui | non), etat_local (a_rafraichir | bon | refait).'
        : 'Critères du taux : rang_rue (n1 | n1bis | n2), profil_locataire (enseigne | solide | fragile), charges_refacturees et taxe_fonciere_refacturee (oui | non).'}\n\n` +
      `Les clés :\n${Object.entries(cles).map(([k, mot]) => `- ${k} : ${mot}`).join('\n')}\n\n` +
      `CE QU'ON SAIT :\n${texte}`,
    response_json_schema: { type: 'object', properties: proprietes },
    max_tokens: 3000,
  });
  return reponsesLues(brut, Object.keys(cles));
}
