// Le Layer, phase 5 (15 oct. 2026) : les synthèses vivantes.
//
// Une synthèse par fiche (agent, agence, dossier, investisseur, ville), de 10 à
// 15 lignes, dans un ordre fixe : qui / quoi en une phrase, situation actuelle,
// décisions prises, engagements ouverts, points de vigilance, dernier contact.
// Chaque ligne cite les faits validés sur lesquels elle s'appuie (leurs
// identifiants) : un clic ouvre le fait, puis sa source. La synthèse ne dit
// rien qui ne soit dans ces faits.
//
// Vivante : un fait validé, corrigé, remplacé ou archivé sur la fiche la
// marque périmée et met sa régénération en file, au plus une fois par heure
// et par fiche (`apres`). Modèle rapide (section 14 de la spec) ; coût gardé
// sur la synthèse.
//
// `ficheLayer(type, id)` est la seule fonction que les branchements appellent
// (mode appel, pré-analyse, matching, Ma journée) : la synthèse, les
// engagements ouverts, les derniers faits.

import db, { Records } from './db.js';
import { enfiler, enregistrer } from './layer-taches.js';

export const TYPES_FICHE = ['agent', 'agence', 'dossier', 'investisseur', 'ville'];
export const RUBRIQUES = [
  ['qui_quoi', 'Qui / quoi'],
  ['situation', 'Situation actuelle'],
  ['decisions', 'Décisions prises'],
  ['engagements', 'Engagements ouverts'],
  ['vigilance', 'Points de vigilance'],
  ['dernier_contact', 'Dernier contact'],
];
export const UNE_HEURE_MS = 3600000;
const MODELE_RAPIDE = 'claude-haiku-4-5';
const FAIT = 'CerveauFait';
const LIEN = 'CerveauLien';
const SOURCE = 'CerveauSource';
const maintenant = () => new Date().toISOString();

/** Les faits validés d'une fiche, du plus récent au plus ancien, avec la date de leur source. */
export function faitsDeLaFiche(type, id) {
  const ids = new Set(Records.list(LIEN).filter((l) => l.type_entite === type && String(l.entite_id) === String(id)).map((l) => l.fait_id));
  return [...ids].map((i) => Records.get(FAIT, i)).filter((f) => f && f.statut === 'valide')
    .map((f) => { const s = Records.get(SOURCE, f.source_id); return { ...f, date: String(s?.date || f.cree_le || '').slice(0, 10), source_type: s?.type || null, source_titre: s?.titre || null }; })
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

const lire = (r) => (r ? { ...r, lignes: JSON.parse(r.lignes || '[]'), faits: JSON.parse(r.faits || '[]'), perime: !!r.perime } : null);
export const synthese = (type, id) => lire(db.prepare('SELECT * FROM layer_syntheses WHERE type_entite = ? AND entite_id = ?').get(type, String(id)));
export const syntheses = ({ limite = 200 } = {}) => db.prepare('SELECT * FROM layer_syntheses ORDER BY genere_le DESC LIMIT ?').all(limite).map(lire);

const SCHEMA = {
  type: 'object',
  properties: {
    lignes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rubrique: { type: 'string', enum: RUBRIQUES.map(([k]) => k) },
          texte: { type: 'string', description: 'une ligne, une idée, en français, sans rien ajouter aux faits' },
          faits: { type: 'array', items: { type: 'string' }, description: 'les identifiants (#…) des faits sur lesquels la ligne s\'appuie' },
        },
        required: ['rubrique', 'texte', 'faits'],
      },
    },
  },
  required: ['lignes'],
};

/** La consigne : les faits numérotés, la structure fixe. */
export function consigneSynthese(type, libelle, faits, { aujourdhui = new Date().toISOString().slice(0, 10) } = {}) {
  const liste = faits.map((f) => `#${f.id} · ${f.date} · ${f.type}${f.type === 'engagement' ? ` (${f.statut_engagement || 'ouvert'}${f.echeance ? `, pour le ${f.echeance}` : ''})` : ''}${f.personne ? ` · ${f.personne}` : ''} : ${f.resume}`).join('\n');
  return `Tu tiens la mémoire de Klocka (immobilier commercial, murs de commerce). Écris la synthèse de la fiche ${type} « ${libelle} », au ${aujourdhui}, à partir de SES FAITS VALIDÉS ci-dessous et de rien d'autre.
Structure fixe, dans cet ordre, 10 à 15 lignes en tout (moins s'il y a peu de faits ; une rubrique sans fait n'a pas de ligne) :
- qui_quoi : une phrase, qui ou quoi est cette fiche ;
- situation : où en est-on aujourd'hui ;
- decisions : ce qui a été décidé, avec son motif ;
- engagements : les promesses encore ouvertes ou échues (qui, quoi, pour quand) ; jamais une promesse tenue ;
- vigilance : ce qui peut poser problème ;
- dernier_contact : la date et la nature du dernier échange.
Chaque ligne cite les identifiants des faits qui la portent (sans le #). N'invente rien, ne déduis rien qui ne soit dans un fait ; un fait plus récent l'emporte sur un plus ancien.

FAITS (du plus récent au plus ancien) :
${liste}`;
}

/** Pure : garde les lignes valides (rubrique connue, faits existants), dans l'ordre des rubriques, 15 au plus. */
export function ranger(lignes, idsConnus) {
  const ordre = new Map(RUBRIQUES.map(([k], i) => [k, i]));
  return (lignes || [])
    .filter((l) => ordre.has(l?.rubrique) && String(l?.texte || '').trim())
    .map((l) => ({ rubrique: l.rubrique, texte: String(l.texte).trim().slice(0, 400), faits: [...new Set((l.faits || []).map((x) => String(x).replace(/^#/, '')))].filter((x) => idsConnus.has(x)) }))
    .sort((a, b) => ordre.get(a.rubrique) - ordre.get(b.rubrique))
    .slice(0, 15);
}

/** Génère (ou régénère) la synthèse d'une fiche. `llm` : pour les tests. Sans fait validé, pas de synthèse. */
export async function generer(type, id, { libelle = null, llm = null } = {}) {
  const faits = faitsDeLaFiche(type, id);
  if (!faits.length) { db.prepare('DELETE FROM layer_syntheses WHERE type_entite = ? AND entite_id = ?').run(type, String(id)); return { ok: true, vide: true }; }
  const nom = libelle || (await import('./layer.js')).libelleEntite(type, id) || String(id);
  const prompt = consigneSynthese(type, nom, faits);
  let resultat; let cout = null;
  if (llm) resultat = await llm(prompt, SCHEMA);
  else {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    const m = await mesurer({ operation: 'cerveau', libelle: 'synthese', sur: `${type}:${id}` }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 3000 }));
    resultat = m.resultat; cout = m.consommation?.cout ?? null;
  }
  const lignes = ranger(resultat?.lignes, new Set(faits.map((f) => f.id)));
  const avant = synthese(type, id);
  const ligne = { type_entite: type, entite_id: String(id), texte: lignes.map((l) => l.texte).join('\n'), lignes: JSON.stringify(lignes), faits: JSON.stringify(faits.map((f) => f.id)), version: (avant?.version || 0) + 1, genere_le: maintenant(), perime: 0, cout_usd: cout };
  db.prepare(`INSERT INTO layer_syntheses (type_entite, entite_id, texte, lignes, faits, version, genere_le, perime, cout_usd) VALUES (@type_entite, @entite_id, @texte, @lignes, @faits, @version, @genere_le, @perime, @cout_usd)
    ON CONFLICT(type_entite, entite_id) DO UPDATE SET texte = excluded.texte, lignes = excluded.lignes, faits = excluded.faits, version = excluded.version, genere_le = excluded.genere_le, perime = 0, cout_usd = COALESCE(layer_syntheses.cout_usd, 0) + COALESCE(excluded.cout_usd, 0)`).run(ligne);
  return { ok: true, synthese: synthese(type, id) };
}
enregistrer('synthese', async ({ type, id }) => { const r = await generer(type, id); if (!r.ok) throw new Error(r.error || 'synthèse'); });

/**
 * Un fait a changé : ses fiches ont une synthèse périmée, régénérée en fond,
 * pas plus d'une fois par heure (la tâche attend l'heure révolue depuis la dernière).
 */
export function ficheChangee(faitId, { maintenantMs = Date.now() } = {}) {
  const liens = Records.list(LIEN).filter((l) => l.fait_id === faitId && TYPES_FICHE.includes(l.type_entite));
  for (const l of liens) {
    db.prepare('UPDATE layer_syntheses SET perime = 1 WHERE type_entite = ? AND entite_id = ?').run(l.type_entite, String(l.entite_id));
    const s = synthese(l.type_entite, l.entite_id);
    const apres = s?.genere_le && maintenantMs - Date.parse(s.genere_le) < UNE_HEURE_MS ? new Date(Date.parse(s.genere_le) + UNE_HEURE_MS).toISOString() : null;
    enfiler('synthese', { type: l.type_entite, id: String(l.entite_id) }, { cle: `synthese:${l.type_entite}:${l.entite_id}`, apres });
  }
  return liens.length;
}

/**
 * Ce que l'Intelligence sait d'une fiche, pour les branchements : la synthèse
 * (si elle existe), les engagements ouverts ou échus, les derniers faits.
 */
export function ficheLayer(type, id, { derniers = 30 } = {}) {
  const faits = faitsDeLaFiche(type, id);
  return {
    type_entite: type, entite_id: String(id),
    synthese: synthese(type, id),
    engagements: faits.filter((f) => f.type === 'engagement' && ['ouvert', 'echu'].includes(f.statut_engagement || 'ouvert')).map((f) => ({ id: f.id, resume: f.resume, echeance: f.echeance || null, statut_engagement: f.statut_engagement || 'ouvert', responsable: f.responsable || f.personne || null, date: f.date })),
    faits: faits.slice(0, derniers).map((f) => ({ id: f.id, type: f.type, resume: f.resume, date: f.date, personne: f.personne || null, source: f.source_titre, source_id: f.source_id })),
    total: faits.length,
  };
}

// --- Phase 6 : les branchements (15 oct. 2026) ------------------------------------------------

const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? x.valeur : x);
const normal = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Pré-analyse : ce que Klocka sait déjà d'un lot, sur l'enseigne du locataire,
 * la ville et l'agent du dossier. Les faits du dossier lui-même sont écartés ;
 * chacun dit pourquoi il est là. `rechercher` : pour les tests.
 */
export async function dejaSu(dealId, lotIndex = 0, { rechercher = null, limite = 8 } = {}) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { ok: false, error: 'Dossier introuvable.' };
  const lot = deal.lots?.[lotIndex]?.lot || deal.lots?.[0]?.lot || {};
  const enseigne = String(val(lot.locataire_nom) || '').trim() || null;
  const adresse = val(lot.adresse);
  const ville = (adresse && typeof adresse === 'object' ? adresse.ville : null) || null;
  const emailAgent = String(deal.contact_agent_email || '').toLowerCase();
  const agent = emailAgent ? Records.list('AgentImmo').find((a) => (a.emails || [a.email]).filter(Boolean).some((e) => String(e).toLowerCase() === emailAgent)) : null;
  const chercher = rechercher || (await import('./layer-recherche.js')).rechercher;
  const duDossier = new Set(Records.list(LIEN).filter((l) => l.type_entite === 'dossier' && l.entite_id === dealId).map((l) => l.fait_id));
  const vus = new Map();
  const ajouter = (faits, pourquoi) => { for (const f of faits) if (!duDossier.has(f.id) && !vus.has(f.id)) vus.set(f.id, { f, pourquoi }); };
  if (enseigne) ajouter((await chercher({ texte: enseigne, limite: 5 })).faits, `l'enseigne ${enseigne}`);
  if (ville) ajouter((await chercher({ texte: enseigne || ville, ville, limite: 5 })).faits, `la ville de ${ville}`);
  if (agent) ajouter(faitsDeLaFiche('agent', agent.id).slice(0, 5), `l'agent ${agent.nom || ''}`.trim());
  const faits = [...vus.values()].slice(0, limite).map(({ f, pourquoi }) => {
    const s = Records.get(SOURCE, f.source_id);
    return { id: f.id, type: f.type, resume: f.resume, pourquoi, date: String(s?.date || f.cree_le || '').slice(0, 10), personne: f.personne || null, source: s ? { id: s.id, type: s.type, titre: s.titre } : null };
  });
  return { ok: true, enseigne, ville, agent: agent ? { id: agent.id, nom: agent.nom } : null, faits };
}

/** Matching : la fiche d'un investisseur, retrouvé par son adresse ; seuls ses faits d'information et de décision (section 9). */
export function ficheInvestisseur(email) {
  const u = Records.list('User').find((x) => normal(x.email) === normal(email));
  if (!u) return { ok: true, investisseur: null, faits: [], synthese: null };
  const f = ficheLayer('investisseur', u.id, { derniers: 20 });
  return { ok: true, investisseur: { id: u.id, nom: u.full_name || u.email }, synthese: f.synthese, faits: f.faits.filter((x) => ['information', 'decision'].includes(x.type)), total: f.total };
}

/**
 * Ma journée (section 9) : les engagements du jour et en retard de la personne
 * (ceux de ses appels et débriefs, ou dont elle est responsable), ses faits à
 * valider, ses questions « pourquoi ? » en attente.
 */
export async function journee(user, { maintenantD = new Date() } = {}) {
  const email = normal(user?.email);
  const prenom = normal(String(user?.full_name || '').split(/\s+/)[0] || email.split('@')[0].split('.')[0]);
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(maintenantD);
  const engagements = Records.list(FAIT)
    .filter((f) => f.type === 'engagement' && f.statut === 'valide' && ['ouvert', 'echu'].includes(f.statut_engagement || 'ouvert'))
    .filter((f) => (f.statut_engagement === 'echu') || (f.echeance && f.echeance <= jour))
    .filter((f) => { const s = Records.get(SOURCE, f.source_id); return normal(s?.auteur) === email || (prenom && normal(f.responsable || f.personne).split(/\s+/).includes(prenom)); })
    .map((f) => {
      const l = Records.list(LIEN).find((x) => x.fait_id === f.id);
      return { id: f.id, resume: f.resume, echeance: f.echeance || null, statut_engagement: f.statut_engagement || 'ouvert', en_retard: f.statut_engagement === 'echu' || (f.echeance && f.echeance < jour), responsable: f.responsable || f.personne || null, fiche: l ? { type_entite: l.type_entite, entite_id: l.entite_id } : null };
    })
    .sort((a, b) => String(a.echeance || '').localeCompare(String(b.echeance || '')));
  const L = await import('./layer.js');
  const a_valider = (await L.aValider(user)).reduce((n, x) => n + x.faits.length, 0);
  const questions = Records.list('CerveauQuestion').filter((q) => normal(q.pour) === email && ['posee', 'en_attente'].includes(q.etat)).map((q) => ({ id: q.id, texte: q.texte, etat: q.etat, deal_id: q.deal_id }));
  return { ok: true, jour, engagements, a_valider, questions };
}
