// Les messages d'AK (16 oct. 2026, Jules : « quand on reçoit une fiche
// commerciale, l'agent fait la pré-analyse et nous met un message en bas à
// gauche ; on clique, c'est une discussion, il dit “j'ai bien préanalysé le
// dossier”, et on peut discuter avec lui »).
//
// Une conversation par personne, « Messages d'AK », rangée avec les autres
// conversations du Dashboard (agent `dashboard`) : c'est le même chat, le même
// moteur, la même mémoire ; AK y écrit de lui-même, et la personne lui répond.
// Ce qui n'a pas été vu se compte depuis la dernière ouverture.

import { Conversations, Meta, Records } from './db.js';

const AGENT = 'dashboard';
const TITRE = 'Assistant Klocka';
const cleLu = (email) => `ak-messages:lu:${String(email || '').toLowerCase()}`;

const boite = (email) => Conversations.list(AGENT).find((c) => c.metadata?.utilisateur === email && c.metadata?.messages_ak) || null;

/** AK écrit à quelqu'un. `cle` : un même message (un même dossier) ne s'écrit qu'une fois. */
export function ecrireDAK(email, contenu, { memoire = null, cartes = null, cle = null, maintenant = new Date() } = {}) {
  if (!email || !String(contenu || '').trim()) return null;
  let c = boite(email);
  if (!c) c = Conversations.create({ agent_name: AGENT, metadata: { utilisateur: email, titre: TITRE, messages_ak: true } });
  const messages = Conversations.get(c.id)?.messages || [];
  if (cle && messages.some((m) => m.ak_cle === cle)) return c.id;
  const m = { role: 'assistant', contenu: String(contenu).trim(), ak_le: maintenant.toISOString(), ...(cle ? { ak_cle: cle } : {}), ...(memoire ? { memoire } : {}), ...(cartes ? { cartes } : {}) };
  Conversations.setMessages(c.id, [...messages, m].slice(-80));
  return c.id;
}

/** Pure : ce qui n'a pas été vu, et le dernier message d'AK. */
export function etatDesMessages(messages = [], luJusqu = null) {
  const deAK = messages.filter((m) => m.role === 'assistant' && m.ak_le);
  const nonLus = deAK.filter((m) => !luJusqu || m.ak_le > luJusqu);
  const dernier = deAK.at(-1) || null;
  return { non_lus: nonLus.length, dernier: dernier ? { contenu: String(dernier.contenu).slice(0, 220), le: dernier.ak_le } : null };
}

export function etatDAK(email) {
  // La discussion avec AK est toujours là (16 oct. 2026, Jules : « un truc permanent ») : vide au départ.
  const c = boite(email) || (email ? Conversations.create({ agent_name: AGENT, metadata: { utilisateur: email, titre: TITRE, messages_ak: true } }) : null);
  if (!c) return { id: null, non_lus: 0, dernier: null };
  return { id: c.id, ...etatDesMessages(Conversations.get(c.id)?.messages || [], Meta.get(cleLu(email))) };
}

export function marquerLus(email, maintenant = new Date()) {
  Meta.set(cleLu(email), maintenant.toISOString());
  return { ok: true };
}

/** Pure : le message d'AK après la pré-analyse d'une fiche arrivée par mail. */
export function messagePreanalyse({ nom, de, avis = null }) {
  const debut = `J'ai reçu une fiche commerciale${de ? ` de ${de}` : ''} et je l'ai pré-analysée : ${nom || 'un nouveau dossier'}.`;
  // L'avis d'AK finit déjà par « dis-moi si tu veux que je fasse autre chose » ; sans lui, on le dit.
  return [debut, avis ? String(avis).trim() : 'La pré-analyse est prête à relire. Dis-moi si tu veux que j\'aille plus loin : le loyer face au marché, le bail, les clients à qui le proposer.'].join('\n\n');
}

/** L'avis d'AK sur un dossier, borné dans le temps ; dans les tests, sans réseau (ni marché ni Monday). */
export async function avisBorne(dealId, { delai = 20000 } = {}) {
  const { avisDuDossier } = await import('./ak/avis.js');
  const essai = process.env.NODE_TEST_CONTEXT ? avisDuDossier(dealId, { lien: null, marche: null }) : avisDuDossier(dealId, { lien: null });
  return Promise.race([essai, new Promise((ok) => setTimeout(() => ok(null), delai).unref?.())]);
}

/** Après la pré-analyse automatique d'une fiche : AK l'écrit à la personne de la boîte où elle est arrivée. */
export async function annoncerPreanalyse({ email, deal_id, nom, de }) {
  // L'avis d'AK lit le marché et Monday : vingt secondes au plus, sinon le message part sans lui.
  let avis = null;
  try { avis = await avisBorne(deal_id); } catch { avis = null; }
  const texte = typeof avis === 'string' ? avis : avis?.texte || null;
  return ecrireDAK(email, messagePreanalyse({ nom, de, avis: texte, deal_id }), {
    cle: `preanalyse:${deal_id}`,
    memoire: `Dossier pré-analysé à l'arrivée de la fiche : deal_id ${deal_id}${nom ? ` (${nom})` : ''}.`,
    cartes: [{ titre: nom || 'Le dossier', detail: 'La pré-analyse, prête à relire', etat: 'fait', lien: `/Dossiers?deal_id=${deal_id}`, action: 'Ouvrir' }],
  });
}

/**
 * Le premier message (16 oct. 2026, Jules : « envoie-moi un message pour que je voie ») : une fois par
 * super admin, AK se présente et montre sur le dernier dossier pré-analysé ce qu'il écrira à chaque fiche.
 */
export async function accueillir() {
  const { SUPER_ADMINS } = await import('./acces-pages.js');
  const deals = Records.list('Deal').filter((d) => !d.test && d.lots?.length).sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
  const dernier = deals[0] || null;
  for (const email of SUPER_ADMINS) {
    if (!Records.filter('User', { email })[0]) continue;
    const cle = 'accueil-messages-ak';
    let avis = null;
    if (dernier) { try { const a = await avisBorne(dernier.deal_id); avis = typeof a === 'string' ? a : a?.texte || null; } catch { avis = null; } }
    const prenom = (Records.filter('User', { email })[0]?.full_name || '').split(/\s+/)[0] || '';
    const texte = [
      `Bonjour${prenom ? ` ${prenom}` : ''}, c'est l'assistant Klocka. Je t'écris désormais ici, en bas à gauche.`,
      "Dès qu'une fiche commerciale arrive dans une boîte de l'équipe, je la pré-analyse tout seul et je te le dis dans cette discussion : le bien, le prix, le loyer, mon avis. Tu peux me répondre ici, comme dans le chat.",
      dernier ? `Voici ce que ça donne avec le dernier dossier, ${dernier.nom || dernier.deal_id} :\n\n${avis || 'la pré-analyse est prête à relire.'}` : null,
    ].filter(Boolean).join('\n\n');
    ecrireDAK(email, texte, { cle, ...(dernier ? { memoire: `Dossier montré en exemple : deal_id ${dernier.deal_id}${dernier.nom ? ` (${dernier.nom})` : ''}.`, cartes: [{ titre: dernier.nom || 'Le dossier', detail: 'La pré-analyse', etat: 'fait', lien: `/Dossiers?deal_id=${dernier.deal_id}`, action: 'Ouvrir' }] } : {}) });
  }
}
