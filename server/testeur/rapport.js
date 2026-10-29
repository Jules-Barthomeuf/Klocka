// L'agent testeur : le lancement de bout en bout, et le rapport. Bac à sable,
// navigateur, captures d'état (ordi sombre et clair, portable, téléphone),
// exploration sur ordinateur puis courte sur téléphone, clavier, critique sur
// les captures, régression contre le dernier audit de la même page, synthèse,
// enregistrement `RapportTesteur`, mail à Jules, notification dans l'app.

import fs from 'fs';
import path from 'path';
import { Records, Meta } from '../db.js';
import { UPLOAD_DIR } from '../contexte.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { ouvrirBacASable } from './bac-a-sable.js';
import { ouvrirNavigateur, ouvrirSession, parcoursClavier } from './navigateur.js';
import { explorer, BUDGET } from './explorateur.js';
import { critiquer } from './critique.js';
import { manifesteDe } from './manifestes.js';

export const RAPPORT = 'RapportTesteur';
export const PLAFOND_JOUR = Number(process.env.TESTEUR_PLAFOND_JOUR) || 6;
const DESTINATAIRE = () => (process.env.TESTEUR_A || process.env.RECAP_A || 'jules.b@klocka.immo').trim();
const maintenant = () => new Date().toISOString();
const jourParis = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

export const enVol = () => { const b = Meta.get('testeur-en-vol'); if (!b) return null; try { const v = JSON.parse(b); return Date.now() - Date.parse(v.depuis) < 40 * 60000 ? v : null; } catch { return null; } };
export const lancementsDuJour = () => Number(Meta.get(`testeur-jour:${jourParis()}`) || 0);
const prendreCredit = () => Meta.set(`testeur-jour:${jourParis()}`, String(lancementsDuJour() + 1));
export const arretDemande = (id) => Meta.get(`testeur-arret:${id}`) === '1';
export const demanderArret = (id) => Meta.set(`testeur-arret:${id}`, '1');

export const CATEGORIES = ['fonctionnel', 'taches', 'interface', 'performance', 'accessibilite'];

const SCHEMA_SYNTHESE = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: 'Trois phrases : l\'état de la page, le plus grave, ce qui marche.' },
    notes: { type: 'object', properties: Object.fromEntries(CATEGORIES.map((c) => [c, { type: 'integer', minimum: 0, maximum: 10 }])), required: CATEGORIES },
    problemes: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, gravite: { type: 'string', enum: ['bloquant', 'genant', 'detail'] }, famille: { type: 'string' }, reproduire: { type: 'string' }, cause_probable: { type: 'string' }, correction: { type: 'string' }, capture: { type: ['string', 'null'] }, effort: { type: 'string', enum: ['quick win', 'refonte'] } }, required: ['titre', 'gravite', 'reproduire', 'correction', 'effort'] } },
    reussi: { type: 'array', items: { type: 'string' } },
    couverture: { type: 'object', properties: { teste: { type: 'array', items: { type: 'string' } }, pas_teste: { type: 'array', items: { type: 'string' } } } },
    prompt_correction: { type: 'string', description: 'Un prompt complet, prêt à coller dans Claude Code, qui demande de corriger les problèmes bloquants et gênants dans ce dépôt, avec les étapes de reproduction. En français, impératif, précis.' },
  },
  required: ['resume', 'notes', 'problemes', 'reussi', 'couverture', 'prompt_correction'],
};

/** Pure : la synthèse de la trace en un rapport, par le modèle. `invoquer` se remplace dans les tests. */
export async function synthetiser({ pageNom, vue, manifeste, note, etat, traces, clavier, critiques, precedent = null, invoquer = invokeLLM }) {
  const erreursTech = traces.flatMap((t) => t.session.erreurs.map((e) => `${t.vue} · ${e.type} · ${e.texte}`));
  const lents = traces.flatMap((t) => t.session.reseau.filter((r) => r.ms && r.ms > 2000).map((r) => `${r.methode} ${r.chemin} en ${r.ms} ms`));
  const defauts = traces.flatMap((t) => (t.defauts || []).map((d) => `${t.vue} · ${d.texte}`));
  const prompt = `Tu rédiges le rapport d'un audit de la page « ${pageNom} » de Klocka (vue ${vue}), joué dans un bac à sable par un agent testeur puis relu par un critique. Rien n'est réel ; tout ce qui suit a été observé.

${manifeste ? `Ce que sert la page : ${manifeste.but}. Tâches attendues : ${manifeste.taches.join(' ; ')}.` : ''}
${note ? `Consigne de Jules : ${note}` : ''}

Chargement initial : ${etat.chargement_ms} ms. Hauteur de page : ${etat.hauteur} px.

Erreurs techniques (${erreursTech.length}) :
${[...new Set(erreursTech)].slice(0, 40).join('\n') || 'aucune'}
Requêtes lentes (> 2 s) : ${lents.slice(0, 15).join(' ; ') || 'aucune'}
Défauts mesurés (libellés, débordements, contraste, zones tactiles) :
${[...new Set(defauts)].slice(0, 30).join('\n') || 'aucun'}
Images absentes (uploads, devantures) : ${traces.reduce((n, t) => n + (t.session.images_manquantes || 0), 0)} ; hôtes externes coupés par le garde-fou : ${[...new Set(traces.flatMap((t) => [...(t.session.bloquees?.keys?.() || [])]))].join(', ') || 'aucun'}.
Clavier (Tab ×${clavier.pas}) : focus perdu ${clavier.perdus} fois, hors écran ${clavier.hors_ecran}, sans anneau visible ${clavier.sans_anneau}.

Parcours de l'explorateur (ordinateur, ${traces[0]?.pas?.length || 0} pas, ${traces[0]?.duree_s || 0} s) :
${(traces[0]?.pas || []).map((p) => `${p.i}. ${p.action.type}${p.action.n ? ` #${p.action.n}` : ''}${p.action.valeur ? ` « ${String(p.action.valeur).slice(0, 40)} »` : ''} : ${p.pensee.slice(0, 90)} → ${p.resultat.ok ? 'ok' : `échec (${p.resultat.erreur})`}${p.erreurs ? ` · ${p.erreurs} erreur(s)` : ''}${p.capture ? ` [${p.capture}]` : ''}`).join('\n')}
Constats de l'explorateur :
${traces.flatMap((t) => t.constats).map((c) => `- [${c.gravite}/${c.famille}] ${c.quoi} (${c.ou || '?'})${c.reproduire ? ` · reproduire : ${c.reproduire}` : ''}`).join('\n') || 'aucun'}
Tâches jouées :
${traces.flatMap((t) => t.taches).map((t) => `- ${t.tache} : ${t.resultat}, ${t.clics} clics, ${t.hesitations} hésitation(s)`).join('\n') || 'aucune'}
Hésitations (ce qu'un analyste aurait pensé) :
${traces.flatMap((t) => t.hesitations).map((h) => `- pas ${h.pas} : ${h.texte}`).join('\n') || 'aucune'}
${traces[1] ? `Téléphone (${traces[1].pas.length} pas) : ${traces[1].constats.map((c) => c.quoi).join(' ; ') || 'rien de particulier'}` : ''}

Constats du critique sur les captures :
${critiques.filter((c) => c.quoi).map((c) => `- [${c.gravite}/${c.famille}] ${c.quoi} · ${c.ou || ''} · ${c.proposition || ''} [${c.capture || ''}]`).join('\n') || 'aucun'}
Réussi selon le critique : ${critiques.filter((c) => c.reussi).map((c) => c.reussi).join(' ; ') || '-'}

${precedent ? `Audit précédent de cette page (${precedent.lance_le.slice(0, 10)}) : notes ${JSON.stringify(precedent.notes)} ; problèmes : ${(precedent.problemes || []).map((p) => p.titre).join(' ; ')}. Dis ce qui est résolu, ce qui reste, ce qui réapparaît.` : 'Premier audit de cette page.'}

Rédige : un résumé en trois phrases ; des notes sur 10 par catégorie (fonctionnel, taches, interface, performance, accessibilite), sévères et justifiées par les faits ci-dessus ; les problèmes, dédoublonnés, les plus graves d'abord (dix au plus), chacun avec étapes de reproduction, cause probable, correction concrète, la capture qui le montre si elle existe, et l'effort (quick win ou refonte) ; ce qui est réussi ; la couverture (testé / pas testé) ; et un prompt de correction prêt pour Claude Code. Français, phrases courtes, aucun jargon. JSON.`;
  return invoquer({ prompt, response_json_schema: SCHEMA_SYNTHESE, effort: 'high', max_tokens: 32000 });
}

/** Le lancement, en tâche de fond. Met le rapport à jour à chaque phase. */
export async function lancerAudit({ id, user, page: pageNom, url, vue = 'admin', note = null, journal = (t) => console.log(`[testeur] ${t}`) }) {
  const rapport = Records.get(RAPPORT, id);
  if (!rapport) return;
  const dossier = path.join(UPLOAD_DIR, 'agent-testeur', id);
  fs.mkdirSync(dossier, { recursive: true });
  const avancer = (texte, phase, extra = {}) => { journal(texte); Records.update(RAPPORT, id, { avancement: { phase, texte, le: maintenant() }, ...extra }); };
  Meta.set('testeur-en-vol', JSON.stringify({ id, depuis: maintenant(), page: pageNom }));
  prendreCredit();
  let bac = null;
  let navigateur = null;
  const sessions = [];
  try {
    const { resultat, consommation } = await mesurer({ operation: 'agent testeur', par: user?.email || null, sur: id }, async () => {
      avancer('Le bac à sable démarre (copie de la base, mails et Sunday CRM coupés).', 'bac');
      bac = await ouvrirBacASable({ user, vue, id, journal });
      navigateur = await ouvrirNavigateur();
      const chemin = url.replace(/^https?:\/\/[^/]+/, '') || '/';
      const manifeste = manifesteDe(pageNom);
      const captures = [];
      const ouvrir = async (v, theme) => { const s = await ouvrirSession(navigateur, { base: bac.base, jeton: bac.jeton, vue: v, theme, id, dossier, journal }); sessions.push(s); return s; };

      // 1. L'état de la page : quatre regards.
      avancer('État de la page : ordinateur, portable, téléphone, sombre et clair.', 'etat');
      const ordi = await ouvrir('ordi', 'sombre');
      const { ms: chargement_ms } = await ordi.aller(chemin);
      const inv0 = await ordi.inventaire();
      captures.push(await ordi.capturer('etat', { forcer: true, pleine: true }));
      const clair = await ouvrir('ordi', 'clair'); await clair.aller(chemin); captures.push(await clair.capturer('etat-clair', { forcer: true })); await clair.fermer();
      const portable = await ouvrir('portable', 'sombre'); await portable.aller(chemin); const invPortable = await portable.inventaire(); captures.push(await portable.capturer('etat', { forcer: true })); await portable.fermer();
      const tel = await ouvrir('tel', 'sombre'); await tel.aller(chemin); const invTel = await tel.inventaire(); captures.push(await tel.capturer('etat', { forcer: true, pleine: true }));
      const etat = { chargement_ms, hauteur: inv0.hauteur, erreurs_chargement: ordi.erreurs.length };

      // 2. L'exploration sur ordinateur, puis courte sur téléphone.
      avancer('Exploration sur ordinateur : chaque bouton, chaque champ, les tâches du manifeste.', 'exploration');
      const traceOrdi = await explorer({ session: ordi, pageNom, url: chemin, manifeste, note, journal, arreter: () => arretDemande(id), surPas: async ({ i, maxPas, pensee }) => avancer(`Pas ${i}/${maxPas} : ${pensee}`, 'exploration') });
      traceOrdi.vue = 'ordi'; traceOrdi.session = ordi; traceOrdi.defauts = inv0.defauts;
      captures.push(...traceOrdi.captures);
      avancer('Exploration au téléphone.', 'exploration-tel');
      const traceTel = await explorer({ session: tel, pageNom, url: chemin, manifeste, note, journal, arreter: () => arretDemande(id), budget: { ...BUDGET, pas: BUDGET.pasTel } });
      traceTel.vue = 'tel'; traceTel.session = tel; traceTel.defauts = [...invTel.defauts, ...invPortable.defauts.map((d) => ({ ...d, texte: `portable · ${d.texte}` }))];
      captures.push(...traceTel.captures);

      // 3. Le clavier.
      avancer('Le clavier : où va le focus.', 'clavier');
      await ordi.aller(chemin);
      const clavier = await parcoursClavier(ordi.page, 20);

      // 4. Le critique, sur les captures.
      const toutes = captures.filter(Boolean);
      avancer(`Le critique relit ${Math.min(24, toutes.length)} captures.`, 'critique');
      const critiques = await critiquer({ captures: toutes, pageNom, journal });

      // 5. La synthèse, avec le dernier audit de la même page.
      avancer('Synthèse et rapport.', 'synthese');
      const precedent = Records.filter(RAPPORT, { page: pageNom }).filter((r) => r.id !== id && r.etat === 'fini').sort((a, b) => String(b.lance_le).localeCompare(String(a.lance_le)))[0] || null;
      const synthese = await synthetiser({ pageNom, vue, manifeste, note, etat, traces: [traceOrdi, traceTel], clavier, critiques, precedent });
      for (const s of sessions) await s.fermer(s === ordi ? path.join(dossier, 'trace.zip') : null);
      sessions.length = 0;
      return { synthese, etat, traceOrdi, traceTel, clavier, critiques, precedent, toutes };
    });
    const { synthese, etat, traceOrdi, traceTel, clavier, critiques, precedent, toutes } = resultat;
    const captures = toutes.map((c) => ({ nom: c.nom, fichier: c.fichier, vue: c.vue, theme: c.theme, url: `/uploads/agent-testeur/${id}/${c.fichier}`, pensee: c.pensee || null }));
    const variation = precedent?.notes ? Object.fromEntries(CATEGORIES.map((c) => [c, (synthese.notes?.[c] ?? 0) - (precedent.notes[c] ?? 0)])) : null;
    Records.update(RAPPORT, id, {
      etat: 'fini', fini_le: maintenant(), avancement: { phase: 'fini', texte: 'Terminé.', le: maintenant() },
      resume: synthese.resume, notes: synthese.notes, variation, problemes: synthese.problemes || [], reussi: synthese.reussi || [], couverture: synthese.couverture || null, prompt_correction: synthese.prompt_correction || null,
      captures, trace_url: fs.existsSync(path.join(dossier, 'trace.zip')) ? `/uploads/agent-testeur/${id}/trace.zip` : null,
      erreurs_techniques: [...traceOrdi.session.erreurs, ...traceTel.session.erreurs].slice(0, 120),
      pas: traceOrdi.pas.length + traceTel.pas.length, taches: [...traceOrdi.taches, ...traceTel.taches], hesitations: [...traceOrdi.hesitations, ...traceTel.hesitations], clavier, chargement_ms: etat.chargement_ms,
      constats_bruts: { explorateur: [...traceOrdi.constats, ...traceTel.constats], critique: critiques.filter((c) => c.quoi) },
      cout_usd: consommation?.cout_usd ?? consommation?.cout ?? null, appels: consommation?.appels ?? null,
    });
    await envoyerRapport(Records.get(RAPPORT, id));
  } catch (e) {
    journal(`Échec : ${e?.message || e}`);
    Records.update(RAPPORT, id, { etat: 'erreur', fini_le: maintenant(), erreur: String(e?.message || e).slice(0, 500), avancement: { phase: 'erreur', texte: String(e?.message || e).slice(0, 200), le: maintenant() } });
  } finally {
    for (const s of sessions) await s.fermer().catch(() => {});
    if (bac) await bac.fermer().catch(() => {});
    Meta.set('testeur-en-vol', '');
  }
}

/** Le mail et la notification, à partir du rapport enregistré. */
export async function envoyerRapport(r, { envoyerMail = null, notifierApp = null } = {}) {
  const lien = `${(process.env.APP_URL || 'http://localhost:3001').replace(/\/$/, '')}/SuiviTesteur?rapport=${r.id}`;
  const notes = CATEGORIES.map((c) => `${c} : ${r.notes?.[c] ?? '-'} / 10${r.variation && r.variation[c] ? ` (${r.variation[c] > 0 ? '+' : ''}${r.variation[c]})` : ''}`).join('\n');
  const probs = (r.problemes || []).slice(0, 3).map((p, i) => `${i + 1}. [${p.gravite}] ${p.titre}\nReproduire : ${p.reproduire}\nCause probable : ${p.cause_probable || '?'}\nCorrection : ${p.correction} (${p.effort})`).join('\n\n') || 'Aucun problème relevé.';
  const autres = (r.problemes || []).slice(3).map((p) => `- [${p.gravite}] ${p.titre} (${p.effort})`).join('\n') || '-';
  const taches = (r.taches || []).map((t) => `- ${t.tache} : ${t.resultat}, ${t.clics} clics${t.hesitations ? `, ${t.hesitations} hésitation(s)` : ''}`).join('\n') || '-';
  const couverture = r.couverture ? `Testé : ${(r.couverture.teste || []).join(', ') || '-'}\nPas testé : ${(r.couverture.pas_teste || []).join(', ') || '-'}` : '-';
  const vars = {
    objet: `Agent testeur · ${r.page} · ${(r.problemes || []).length} problème${(r.problemes || []).length > 1 ? 's' : ''}`,
    titre: `${r.page} : ${(r.problemes || []).filter((p) => p.gravite === 'bloquant').length} bloquant(s), ${(r.problemes || []).filter((p) => p.gravite === 'genant').length} gênant(s)`,
    resume: r.resume || '', notes, problemes: probs, autres, taches, reussi: (r.reussi || []).map((x) => `- ${x}`).join('\n') || '-', couverture, lien, prompt: r.prompt_correction || '-',
    details: `${r.pas || 0} pas, ${(r.captures || []).length} captures, ${(r.erreurs_techniques || []).length} erreurs techniques, chargement ${r.chargement_ms || '?'} ms${r.cout_usd != null ? `, ${Number(r.cout_usd).toFixed(2)} $` : ''}.`,
  };
  const { envoyerPlateforme } = await import('../emailing/index.js');
  const a = DESTINATAIRE();
  const m = envoyerMail ? await envoyerMail(vars) : await envoyerPlateforme('rapport_testeur', { a, vars, testeur: a });
  const { notifier } = await import('../notifications.js');
  (notifierApp || notifier)({ pour: r.lance_par || null, genre: 'info', titre: `Audit de ${r.page} terminé`, texte: r.resume ? r.resume.slice(0, 200) : null, lien: `/SuiviTesteur?rapport=${r.id}`, cle: `testeur:${r.id}` });
  Records.update(RAPPORT, r.id, { mail: m?.ok ? (m.simule ? 'simulé' : m.redirige ? `redirigé vers ${m.redirige}` : 'envoyé') : `échec : ${m?.error || '?'}` });
  return m;
}

/** Crée le rapport et lance l'audit en tâche de fond. Rend { ok, id } ou l'erreur. */
export function demarrer({ user, page, url, vue = 'admin', note = null, contexte = null, lancer = lancerAudit }) {
  if (!page || !url) return { ok: false, error: 'Page inconnue.' };
  if (enVol()) return { ok: false, code: 409, error: `Un audit est déjà en cours (${enVol().page}) : attendez qu'il finisse ou arrêtez-le.` };
  if (lancementsDuJour() >= PLAFOND_JOUR) return { ok: false, code: 429, error: `${PLAFOND_JOUR} audits aujourd'hui, c'est le plafond : demain.` };
  const r = Records.create(RAPPORT, { page, url, vue, note: note ? String(note).slice(0, 500) : null, contexte, lance_par: user?.email || null, lance_le: maintenant(), etat: 'en_cours', avancement: { phase: 'depart', texte: 'Lancement…', le: maintenant() } });
  setImmediate(() => lancer({ id: r.id, user, page, url, vue, note }));
  return { ok: true, id: r.id };
}
