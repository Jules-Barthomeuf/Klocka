// L'agent testeur : l'explorateur. Observer, décider, agir, dans une boucle
// bornée. Le modèle voit l'inventaire numéroté, ce qu'il a déjà fait et ce
// qu'il a constaté ; il rend le prochain geste, ou s'arrête. Il ne juge pas :
// le critique, qui n'a pas exploré, le fera sur la trace.

import { invokeLLM } from '../llm.js';

export const BUDGET = { pas: 120, minutes: 25, pasTel: 20 };

const SCHEMA = {
  type: 'object',
  properties: {
    pensee: { type: 'string', description: 'Une phrase : ce que tu cherches à vérifier maintenant.' },
    passe: { type: 'string', enum: ['fonctionnelle', 'tache', 'interface', 'fin'] },
    tache: { type: ['string', 'null'], description: 'La tâche du manifeste en cours, si tu en joues une.' },
    action: {
      type: ['object', 'null'],
      properties: {
        type: { type: 'string', enum: ['cliquer', 'cliquer_a', 'double_cliquer_a', 'saisir', 'choisir', 'touche', 'defiler', 'retour', 'attendre', 'survoler'] },
        x: { type: ['integer', 'null'] }, y: { type: ['integer', 'null'] },
        n: { type: ['integer', 'null'] }, valeur: { type: ['string', 'null'] }, entree: { type: ['boolean', 'null'] }, touche: { type: ['string', 'null'] }, direction: { type: ['string', 'null'] }, ms: { type: ['integer', 'null'] },
      },
    },
    constat: {
      type: ['object', 'null'],
      description: 'Un fait observé qui mérite d\'être noté : bug, blocage, confusion, lenteur, incohérence. Rien de subjectif sur le dessin.',
      properties: { gravite: { type: 'string', enum: ['bloquant', 'genant', 'detail'] }, famille: { type: 'string', enum: ['bug', 'ux', 'texte', 'performance', 'accessibilite'] }, quoi: { type: 'string' }, ou: { type: 'string' }, reproduire: { type: 'string' } },
    },
    hesitation: { type: ['string', 'null'], description: 'Si tu as dû deviner ou revenir en arrière : pourquoi. Sinon null.' },
    tache_resultat: { type: ['string', 'null'], enum: ['reussie', 'echouee', null], description: 'Quand une tâche du manifeste se termine.' },
    fin: { type: 'boolean' },
  },
  required: ['pensee', 'passe', 'action', 'fin'],
};

const compact = (inv) => ({
  url: inv.url, dialogue: inv.dialogue, en_chargement: inv.en_chargement,
  elements: inv.elements.map((e) => `${e.n}${e.desactive ? '× (désactivé)' : ''} ${e.role}${e.role === 'carte' ? ` [${e.x},${e.y} ${e.w}×${e.h}]` : ''}${e.type ? `:${e.type}` : ''}${e.presse != null ? (e.presse ? ' [actif]' : '') : ''}${e.ouvert != null ? (e.ouvert ? ' [ouvert]' : ' [fermé]') : ''} « ${e.texte || e.libelle || e.placeholder || ''} »${e.valeur ? ` = ${e.valeur}` : ''}${e.options ? ` {${e.options.join(' | ')}}` : ''}`),
  texte: inv.texte.slice(0, 2200),
  defauts: inv.defauts.slice(0, 8).map((d) => d.texte),
});

/**
 * Explore une page dans une session. Rend la trace : les pas, les constats,
 * les tâches jouées, les hésitations, les captures. `invoquer` se remplace
 * dans les tests.
 */
export async function explorer({ session, pageNom, url, manifeste = null, note = null, profondeur = 1, budget = BUDGET, invoquer = invokeLLM, journal = () => {}, surPas = async () => {}, arreter = () => false }) {
  const t0 = Date.now();
  const maxPas = session.vue === 'tel' ? budget.pasTel : budget.pas;
  const pas = [];
  const constats = [];
  const hesitations = [];
  const taches = [];
  const captures = [];
  const pagesVues = new Map(); // chemin → profondeur
  const cheminDe = (u) => String(u || '').split('?')[0];
  const origine = cheminDe(url);
  pagesVues.set(origine, 0);
  let inv = await session.inventaire();
  let tacheEnCours = null;
  let dernierHesitation = null;
  const cap0 = await session.capturer('arrivee', { forcer: true });
  if (cap0) captures.push(cap0);

  for (let i = 0; i < maxPas; i += 1) {
    if (arreter() || Date.now() - t0 > budget.minutes * 60000) { journal(`Budget atteint après ${i} pas.`); break; }
    const c = compact(inv);
    const prompt = `Tu es un testeur qui découvre l'application Klocka (immobilier commercial, équipe d'analystes, mandataires, clients investisseurs). Tu explores la page « ${pageNom} » dans un bac à sable : tout est permis, rien n'est réel. Écran : ${session.vue === 'tel' ? 'téléphone 390 px' : session.vue === 'portable' ? 'portable 1024 px' : 'ordinateur 1440 px'}.

${manifeste ? `Ce que sert la page : ${manifeste.but}.\nPersonas : ${manifeste.personas.join(', ')}.\nTâches à jouer, dans l'ordre, en te mettant dans la peau de quelqu'un qui découvre : \n${manifeste.taches.map((t, k) => `${k + 1}. ${t}`).join('\n')}\nInterdits : ${manifeste.interdits.join(' ; ') || 'aucun'}.` : "Pas de manifeste : déduis à quoi sert la page de ce que tu vois, puis joue deux tâches plausibles."}
${note ? `Consigne de Jules pour ce lancement : ${note}` : ''}

Méthode, en ${maxPas} pas au plus :
1. Passe fonctionnelle : exerce chaque bouton, onglet, menu, fenêtre et champ de la page. Les formulaires avec des valeurs valides, puis vides, puis aberrantes (du texte dans un montant, 10 000 caractères, caractères spéciaux « <script> ' " é »). Ferme ce que tu ouvres (Échap ou le bouton). Note toute erreur, blocage (chargement qui ne finit pas), lien qui mène nulle part, geste sans effet.
2. Passe par tâche : joue les tâches du manifeste. Compte tes clics ; quand tu dois deviner ou revenir en arrière, dis-le dans « hesitation ».
3. Passe interface : états vides, messages d'erreur compréhensibles, mots identiques pour les mêmes actions, ce qui est coupé ou illisible.
Un élément marqué × est désactivé : cherche ce qui le débloque (une case à cocher, un champ) au lieu de le recliquer. Une carte se manipule avec cliquer_a (x, y en pixels dans sa zone) ; une fenêtre se ferme par Échap ou son bouton. « retour » revient à la page précédente du navigateur, pas à l'écran précédent d'une même page.
Tu peux suivre un lien vers une autre page de l'application (une seule profondeur) : tu y reviens ensuite avec « retour ». Ne quitte jamais le domaine. Ne relance pas une action qui vient d'échouer de la même façon. Quand tout est exercé et les tâches jouées, « fin » : true.

Ce que tu as déjà fait (${pas.length} pas) :
${pas.slice(-14).map((p) => `- ${p.i}. ${p.action.type}${p.action.n ? ` ${p.action.n}` : ''}${p.action.valeur ? ` « ${String(p.action.valeur).slice(0, 30)} »` : ''} (${p.pensee.slice(0, 70)}) → ${p.resultat.ok ? 'ok' : `échec : ${p.resultat.erreur}`}${p.erreurs ? ` · ${p.erreurs} erreur(s) technique(s)` : ''}`).join('\n') || '- rien encore'}
Constats déjà notés : ${constats.length}${constats.length ? ' : ' + constats.slice(-5).map((x) => x.quoi.slice(0, 60)).join(' ; ') : ''}.
Tâches : ${taches.map((t) => `${t.tache} (${t.resultat}, ${t.clics} clics)`).join(' ; ') || 'aucune jouée'}${tacheEnCours ? ` · en cours : ${tacheEnCours.tache} (${tacheEnCours.clics} clics)` : ''}.

L'écran maintenant (${c.url}${c.dialogue ? `, fenêtre ouverte : « ${c.dialogue} »` : ''}${c.en_chargement ? `, ${c.en_chargement} chargement(s) en cours` : ''}) :
Éléments (numéro rôle « texte ») :
${c.elements.join('\n')}
Texte visible :
${c.texte}
${c.defauts.length ? `Défauts mesurés : ${c.defauts.join(' ; ')}` : ''}

Réponds en JSON : pensee, passe, tache, action (type, n, x, y, valeur, entree, touche, direction, ms), constat (ou null), hesitation (ou null), tache_resultat (ou null), fin.`;
    let decision;
    try {
      decision = await invoquer({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 1500 });
    } catch (e) {
      journal(`Le modèle n'a pas répondu : ${e?.message || e}`);
      break;
    }
    if (!decision || typeof decision !== 'object') break;
    if (decision.constat?.quoi) constats.push({ ...decision.constat, pas: i + 1, url: c.url, vue: session.vue });
    if (decision.hesitation && decision.hesitation !== dernierHesitation) { hesitations.push({ pas: i + 1, texte: decision.hesitation, tache: decision.tache || tacheEnCours?.tache || null }); dernierHesitation = decision.hesitation; }
    if (decision.tache && decision.tache !== tacheEnCours?.tache) tacheEnCours = { tache: decision.tache, clics: 0, depuis: i + 1 };
    const clore = () => { if (decision.tache_resultat && tacheEnCours) { taches.push({ ...tacheEnCours, resultat: decision.tache_resultat, hesitations: hesitations.filter((h) => h.tache === tacheEnCours.tache).length }); tacheEnCours = null; } };
    if (decision.fin || !decision.action?.type) { clore(); journal(`Fin décidée par l'agent après ${i} pas.`); break; }
    const avantErreurs = session.erreurs.length;
    const avantUrl = c.url;
    const resultat = await session.agir(decision.action);
    if (tacheEnCours && ['cliquer', 'saisir', 'choisir'].includes(decision.action.type)) tacheEnCours.clics += 1;
    clore(); // la tâche se ferme après le geste qui la termine
    inv = await session.inventaire().catch(() => inv);
    // La profondeur : une page d'un autre chemin, une seule fois, puis retour.
    const chemin = cheminDe(inv.url);
    if (chemin !== cheminDe(avantUrl) && !pagesVues.has(chemin)) {
      const prof = (pagesVues.get(cheminDe(avantUrl)) ?? 0) + 1;
      pagesVues.set(chemin, prof);
      if (prof > profondeur) { journal(`Trop loin (${chemin}) : retour.`); await session.agir({ type: 'retour' }); inv = await session.inventaire().catch(() => inv); }
    }
    const nouvellesErreurs = session.erreurs.length - avantErreurs;
    const capture = await session.capturer(`${decision.action.type}-${(decision.action.n ?? '')}`.replace(/-$/, ''));
    if (capture) captures.push({ ...capture, pas: i + 1, pensee: decision.pensee });
    const p = { i: i + 1, pensee: decision.pensee, passe: decision.passe, action: decision.action, resultat, erreurs: nouvellesErreurs, url: inv.url, capture: capture?.fichier || null };
    pas.push(p);
    await surPas({ i: i + 1, maxPas, pensee: decision.pensee, passe: decision.passe });
  }
  if (tacheEnCours) taches.push({ ...tacheEnCours, resultat: 'interrompue', hesitations: hesitations.filter((h) => h.tache === tacheEnCours.tache).length });
  return { pas, constats, hesitations, taches, captures, pages: [...pagesVues.keys()], duree_s: Math.round((Date.now() - t0) / 1000) };
}
