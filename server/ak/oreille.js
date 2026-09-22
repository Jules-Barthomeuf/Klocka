// L'oreille d'AK : ce qui se dit au bureau, transcrit par le navigateur
// (Web Speech, comme la dictée), envoyé ici par bouts, et relu toutes les
// quelques minutes pour en tirer ce qui compte : une décision, une tâche,
// un engagement, un fait sur un dossier. Le reste n'est pas gardé.
//
// Premier réglage, volontairement prudent : AK dit dans le groupe ce qu'il a
// compris, note les engagements au registre et retient les faits ; il ne
// crée rien et ne lance rien tout seul. Quand l'équipe lui fait confiance,
// on ouvre.

import { Records, Meta } from '../db.js';
import { runAgent } from '../llm.js';

const ENTITE = 'AkEcoute';
const CLE_LU = 'ak.oreille.lu';
const MINUTES = Math.max(1, Number(process.env.AK_OREILLE_MIN ?? 3));
const MIN_CARACTERES = 200;

/** Un bout de transcription, tel que le navigateur l'envoie. */
export function deposer({ texte, par = null, piece = null }) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return { ok: false, error: 'Rien à noter.' };
  const r = Records.create(ENTITE, { texte: t.slice(0, 4000), par, piece: piece || null, le: new Date().toISOString(), traite: false });
  return { ok: true, id: r.id };
}

/** Les bouts pas encore relus, dans l'ordre. */
export const enAttente = () => Records.filter(ENTITE, { traite: false }).sort((a, b) => String(a.le).localeCompare(String(b.le)));

/** Pure : le moment de relire ? Assez de texte, ou assez de temps depuis le dernier. */
export function estLeMoment(bouts, { maintenant = Date.now(), dernier = Number(Meta.get(CLE_LU) || 0) } = {}) {
  if (!bouts.length) return false;
  const caracteres = bouts.reduce((s, b) => s + b.texte.length, 0);
  const attente = maintenant - Math.max(dernier, Date.parse(bouts[0].le));
  return caracteres >= MIN_CARACTERES * 4 || attente >= MINUTES * 60000;
}

const CONSIGNE = `Tu écoutes une conversation de bureau chez Klocka (conseil en murs commerciaux), transcrite automatiquement, donc avec des fautes et des mots mal entendus. Tu en extrais UNIQUEMENT ce qui engage ou informe le travail, en JSON strict :
{
  "decisions": ["…"],
  "taches": [{ "qui": "prénom ou vide", "quoi": "…" }],
  "engagements": [{ "de": "qui doit (prénom, ou un tiers nommé)", "quoi": "…", "echeance": "AAAA-MM-JJ ou vide", "dossier": "nom du dossier ou du bien, ou vide" }],
  "faits": [{ "sujet": "un dossier, un client, une personne", "fait": "…" }],
  "doutes": ["ce que tu n'as pas compris et qui semble important"]
}
Rien d'inventé : un élément absent est une liste vide. Pas de bavardage, pas de vie privée, pas de ce qui ne concerne pas les dossiers, les clients, les agents ou le planning. Réponds avec le JSON seul.`;

/** Pure : le JSON du modèle, tolérant. */
export function lireExtraction(texte) {
  const m = String(texte || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { decisions: j.decisions || [], taches: j.taches || [], engagements: j.engagements || [], faits: j.faits || [], doutes: j.doutes || [] };
  } catch { return null; }
}

/** Pure : ce qu'AK poste, à partir de l'extraction. Vide si rien de notable. */
export function phrase(e, { mentionner = (x) => x } = {}) {
  if (!e) return '';
  const l = [];
  for (const d of e.decisions) l.push(`décision : ${d}`);
  for (const t of e.taches) l.push(`${t.qui ? `${mentionner(t.qui)} ` : ''}à faire : ${t.quoi}`);
  for (const g of e.engagements) l.push(`${g.de || 'quelqu\'un'} doit ${g.quoi}${g.dossier ? ` (${g.dossier})` : ''}${g.echeance ? ` pour le ${new Date(g.echeance).toLocaleDateString('fr-FR')}` : ''}, c'est au registre`);
  for (const f of e.faits) l.push(`noté : ${f.fait}${f.sujet ? ` (${f.sujet})` : ''}`);
  for (const d of e.doutes) l.push(`j'ai pas capté : ${d}`);
  if (!l.length) return '';
  return `j'ai entendu :\n${l.map((x) => `- ${x}`).join('\n')}`;
}

/**
 * Relit ce qui attend, en tire l'essentiel, agit prudemment (registre,
 * mémoire), et rend la phrase à poster. Null quand il n'y a rien.
 */
export async function relire({ modele = null, mentionner = (x) => x } = {}) {
  const bouts = enAttente();
  if (!bouts.length) return null;
  Meta.set(CLE_LU, String(Date.now()));
  for (const b of bouts) Records.update(ENTITE, b.id, { traite: true });
  const transcription = bouts.map((b) => `[${new Date(b.le).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}${b.par ? `, ${b.par}` : ''}] ${b.texte}`).join('\n');
  const { text } = await runAgent({ system: CONSIGNE, messages: [{ role: 'user', content: transcription }], model: modele });
  const e = lireExtraction(text);
  if (!e) return null;
  const { noter } = await import('../deal/engagements.js');
  const { retenir } = await import('./lecons.js');
  for (const g of e.engagements) {
    try { noter({ de: g.de || null, quoi: `${g.quoi}${g.dossier ? ` (${g.dossier})` : ''}`, echeance: g.echeance && /^\d{4}-\d{2}-\d{2}$/.test(g.echeance) ? `${g.echeance}T12:00:00.000Z` : null }); } catch { /* un engagement mal formé ne bloque pas le reste */ }
  }
  for (const f of e.faits) retenir({ sujet: f.sujet || 'bureau', fait: f.fait, par: 'entendu au bureau' });
  Records.create('AkEcouteLecture', { le: new Date().toISOString(), bouts: bouts.length, extraction: e });
  return phrase(e, { mentionner }) || null;
}
