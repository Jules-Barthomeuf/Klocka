// Ce qu'un bien du mandataire garde de sa conversation et de son prix (25 oct. 2026, Jules) : une seule conversation,
// celle de la fiche ; le prix convenu avec le propriétaire, résultat de l'Avis de valeur (26 oct. 2026 : plus une étape) ;
// et ce que le chat en dit à Haka.

import { Records, Conversations } from './db.js';
import { ETAPES_BIEN, marqueurDe, rangValide } from '../src/lib/biens-mandataire.js';

const emailDe = (u) => String(u?.email || '').toLowerCase();
const maintenant = () => new Date().toISOString();

function sienne(id, user) {
  const p = id ? Records.get('ProprietaireMandataire', id) : null;
  return p && p.mandataire_email === emailDe(user) ? p : null;
}

/** La conversation du bien : la première enregistrée depuis la fiche, rouverte ensuite. */
export function lierConversation(id, conversationId, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  const c = conversationId ? String(conversationId).slice(0, 80) : null;
  // Marquée comme fil d'un bien : elle ne s'efface pas avec les vieilles conversations.
  const conv = c ? Conversations.get(c) : null;
  if (conv) Conversations.setMetadata(conv.id, { ...(conv.metadata || {}), bien: p.id });
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens: { ...(p.biens || {}), conversation_id: c } }) };
}

/** « 680 000 € », « 680k » : le prix comme il se dit. */
export function lirePrix(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v > 0 ? Math.round(v) : null;
  const t = String(v).toLowerCase().replace(/\s/g, '').replace(',', '.');
  const m = t.match(/^(\d+(?:\.\d+)?)(k|m|me|m€)?/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] ? 1e6 : 1);
  return n > 0 ? Math.round(n) : null;
}

/**
 * Le prix d'accord : le chiffre retenu avec le propriétaire, noté dans l'historique ; il fait l'étape Avis de valeur
 * (et celles d'avant). Vide, il s'efface sans toucher aux étapes.
 */
export function noterPrixAccord(id, prix, user) {
  const p = sienne(id, user);
  if (!p) return { ok: false, error: 'Fiche introuvable.' };
  if (!['rdv_pris', 'mandat_signe'].includes(p.statut)) return { ok: false, error: "Cette fiche n'est pas encore dans Biens : il faut un rendez-vous fixé." };
  const n = lirePrix(prix);
  if (prix != null && prix !== '' && !n) return { ok: false, error: 'Prix illisible.' };
  const biens = { ...(p.biens || {}), prix_accord: n };
  if (n && rangValide(biens.validee) < 1) { biens.validee = marqueurDe('estimation'); biens.pause = null; }
  const texte = n ? `Prix d'accord : ${n.toLocaleString('fr-FR')} €` : "Prix d'accord retiré";
  return { ok: true, proprietaire: Records.update('ProprietaireMandataire', p.id, { biens, historique: [...(p.historique || []), { le: maintenant(), type: 'etape', texte }] }) };
}

/** L'estimation et le mandat rattachés à la fiche (le plus récent de chacun). */
export function objetsDuBien(p) {
  if (!p) return { estimation: null, mandat: null };
  const recent = (a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || ''));
  const estimation = Records.list('EstimationMandataire').filter((e) => e.proprietaire_id === p.id).sort(recent)[0] || null;
  const mandat = estimation ? Records.list('MandatMandataire').filter((m) => m.estimation_id === estimation.id).sort(recent)[0] || null : null;
  return { estimation, mandat };
}

/** Ce que Haka sait du bien quand le mandataire parle depuis sa fiche : où il en est, et la suite. */
export function cadreDuBien(p) {
  if (!p || !['rdv_pris', 'mandat_signe'].includes(p.statut)) return '';
  const { estimation, mandat } = objetsDuBien(p);
  const r = estimation?.rapport || {};
  const lignes = [];
  const rang = rangValide(p.biens?.validee);
  lignes.push(`Ce bien est dans Biens, étapes ${ETAPES_BIEN.map((e) => e.label).join(', ')} ; dernière franchie à la main : ${rang < 0 ? 'aucune (le rendez-vous est pris)' : ETAPES_BIEN[rang].label}.`);
  if (estimation) lignes.push(`Avis de valeur « ${estimation.bien} » : ${estimation.statut}${r.prix_bas ? `, ${r.prix_bas.toLocaleString('fr-FR')} à ${r.prix_haut.toLocaleString('fr-FR')} €` : ''}.`);
  else lignes.push('Pas encore d\'avis de valeur.');
  if (p.biens?.prix_accord) lignes.push(`Prix d'accord avec le propriétaire : ${p.biens.prix_accord.toLocaleString('fr-FR')} € net vendeur.`);
  if (mandat) lignes.push(`Mandat : ${mandat.statut} (${Number(mandat.prix || 0).toLocaleString('fr-FR')} €, ${mandat.honoraires} d'honoraires).`);
  const notes = (p.historique || []).filter((h) => h.texte).slice(-8).map((h) => `${String(h.le || '').slice(0, 10)} ${h.texte}`);
  if (notes.length) lignes.push(`Historique de la fiche : ${notes.join(' ; ')}.`);
  lignes.push(
    "Pour l'avis de valeur : lancer_estimation avec bien = le commerce et la ville, et dans infos ce que la visite et l'historique ont appris (surface, loyer, bail, état) ; ne redemande pas ce que l'historique dit déjà. "
    + "Pour le mandat : demander_mandat avec le propriétaire des murs comme vendeur et le prix d'accord comme prix ; demande seulement ce qui manque (honoraires, en une ligne). "
    + "Un prix convenu avec le propriétaire : avancer_bien etape estimation avec le prix (il s'inscrit en tête de l'avis et fait l'étape).",
  );
  // La Pré-visite (26 oct. 2026) : Haka lit la préparation (signal, fiche, recherches clients, pré-estimation) et la
  // visite en cours ; une correction dite à la voix passe par corriger_preparation.
  const prep = p.preparation;
  if (prep?.v === 2) {
    const e = prep.estimation;
    lignes.push(`Préparation du rendez-vous : ${[
      prep.rdv?.le ? `rendez-vous le ${new Date(prep.rdv.le).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', dateStyle: 'full', timeStyle: 'short' })}${prep.rdv.adresse ? `, ${prep.rdv.adresse}` : ''}${prep.rdv.avec ? `, avec ${prep.rdv.avec}` : ''}` : null,
      prep.signal ? `signal : ${prep.signal}` : null,
      e?.basse ? `pré-estimation interne ${Math.round(e.basse / 1000)} à ${Math.round(e.haute / 1000)} k€ (jamais annoncée)` : null,
      prep.clients_compatibles?.liste?.length ? `${prep.clients_compatibles.liste.length} client(s) compatible(s)${prep.clients_compatibles.plafond ? `, plafond ${Math.round(prep.clients_compatibles.plafond / 1000)} k€` : ''}` : null,
    ].filter(Boolean).join(' ; ')}.`);
  }
  // Les questions de la préparation, mot pour mot : le compte rendu de visite les reprend une à une (27 oct. 2026).
  const qs = prep?.questions ? [...(prep.questions.indispensables || []), ...(prep.questions.autres || []), ...(prep.questions.a_confirmer || [])] : [];
  if (qs.length) lignes.push(`Questions de la préparation (à reprendre dans compte_rendu_visite.reponses, texte exact) : ${qs.map((x) => `« ${x} »`).join(' ; ')}.`);
  const cr = p.biens?.compte_rendu;
  if (cr) lignes.push(`Compte rendu de visite déjà enregistré le ${String(cr.le || '').slice(0, 10)} (interne) : ${JSON.stringify({ bien: cr.bien, etat: cr.etat, proprietaire: cr.proprietaire, locataire: cr.locataire, documents: cr.documents, a_confirmer: cr.a_confirmer })}. Pour l'estimation : lancer_estimation avec ce compte rendu dans infos, rien à redemander.`);
  const v = p.biens?.visite;
  if (v?.reponses && Object.keys(v.reponses).length) lignes.push(`Pendant la visite, le mandataire a noté : ${Object.entries(v.reponses).filter(([, x]) => x).map(([cle, x]) => `${cle} = ${x}`).join(' ; ')}${v.photos?.length ? ` ; ${v.photos.length} photo(s)` : ''}.`);
  if (prep) lignes.push("Une correction de la préparation dite au chat (« il vient avec son fils », « le rendez-vous est décalé à 15 h ») : corriger_preparation, puis confirme en une ligne.");
  return `\n\n${lignes.join(' ')}`;
}

// ---------------------------------------------------------------------------
// Le fil du bien (25 oct. 2026, Jules : « on peut lui parler où on veut ») : une seule conversation par fiche, de l'ajout
// à la liste jusqu'au mandat. La fiche d'une liste, le terrain, les étapes de Biens et le dashboard y écrivent ; Haka la
// relit avant de répondre. C'est une conversation du chat du mandataire, marquée `bien`, jamais effacée avec les vieilles.
// ---------------------------------------------------------------------------

const AGENT_FIL = 'dashboard-mandataire';

/** La conversation du bien, si elle existe (ou créée avec `creer`). */
export function filDuBien(p, user, { creer = false } = {}) {
  if (!p) return null;
  const qui = user?.email || 'anonyme';
  let c = p.biens?.conversation_id ? Conversations.get(p.biens.conversation_id) : null;
  if (c && (c.agent_name !== AGENT_FIL || c.metadata?.utilisateur !== qui)) c = null;
  if (!c && creer) {
    c = Conversations.create({ agent_name: AGENT_FIL, metadata: { utilisateur: qui, titre: p.commerce || p.nom || 'Bien', bien: p.id } });
    const frais = Records.get('ProprietaireMandataire', p.id) || p;
    Records.update('ProprietaireMandataire', p.id, { biens: { ...(frais.biens || {}), conversation_id: c.id } });
  }
  return c;
}

/** Ajoute des messages au fil du bien (le crée au besoin) ; garde les 80 derniers. */
export function versLeFil(p, user, messages = []) {
  const c = filDuBien(p, user, { creer: true });
  if (!c) return null;
  Conversations.setMessages(c.id, [...(c.messages || []), ...messages].slice(-80));
  return c.id;
}

/** Ce que Haka relit du fil avant de répondre : les derniers échanges, en commençant par un message du mandataire. */
export function contexteDuFil(p, user, n = 16) {
  const c = filDuBien(p, user);
  const msgs = (c?.messages || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.contenu === 'string' && m.contenu.trim())
    .slice(-n).map((m) => ({ role: m.role, contenu: m.contenu }));
  const i = msgs.findIndex((m) => m.role === 'user');
  return i < 0 ? [] : msgs.slice(i);
}

/** Où ouvrir le fil d'un bien depuis le dashboard : dans Biens s'il y est, sinon sa liste. */
export function lienDuFil(p) {
  if (!p) return null;
  const titre = [p.commerce || p.nom, p.ville].filter(Boolean).join(' · ') || 'Le bien';
  const dansBiens = ['rdv_pris', 'mandat_signe'].includes(p.statut);
  return { id: p.id, titre, lien: dansBiens ? `/MandataireBiens?bien=proprietaire:${p.id}` : p.liste_id ? `/MandataireProspection?onglet=listes&liste=${p.liste_id}` : null };
}
