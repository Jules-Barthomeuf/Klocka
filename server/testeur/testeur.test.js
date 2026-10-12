// L'agent testeur (10 oct. 2026) : l'explorateur avec un faux modèle et une
// fausse session, le critique avec un faux modèle, la synthèse, le mail, le
// plafond et le verrou, les manifestes. Rien n'ouvre de navigateur ici.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-testeur-'));
process.env.MONDAY_TOKEN = '';
const { explorer } = await import('./explorateur.js');
const { critiquer } = await import('./critique.js');
const { synthetiser, demarrer, envoyerRapport, enVol, lancementsDuJour, RAPPORT, PLAFOND_JOUR } = await import('./rapport.js');
const { manifesteDe } = await import('./manifestes.js');
const { mailPlateforme } = await import('../emailing/index.js');
const { Records, Meta } = await import('../db.js');

/** Une fausse session : un écran à deux boutons, qui change quand on clique le premier. */
function fausseSession(vue = 'ordi') {
  let etat = 0;
  const erreurs = [];
  return {
    vue, erreurs, reseau: [{ methode: 'GET', chemin: '/api/x', statut: 200, ms: 2500 }],
    inventaire: async () => ({ url: etat ? '/Page?onglet=2' : '/Page', dialogue: null, en_chargement: 0, hauteur: 1200, texte: etat ? 'Onglet deux ouvert' : 'Page de départ', defauts: [{ cle: 'sans_label', texte: 'Un champ sans libellé' }], elements: [{ n: 1, role: 'bouton', texte: 'Onglet deux' }, { n: 2, role: 'champ', type: 'text', libelle: 'Montant' }] }),
    agir: async (a) => { if (a.type === 'cliquer' && a.n === 1) { etat = 1; return { ok: true }; } if (a.type === 'cliquer' && a.n === 9) { erreurs.push({ type: 'console', texte: 'boum' }); return { ok: false, erreur: 'introuvable' }; } return { ok: true }; },
    capturer: async (nom) => ({ nom, fichier: `${nom}.png`, chemin: null, vue, theme: 'sombre' }),
  };
}

test('l\'explorateur : observer, décider, agir, et s\'arrêter ; constats, tâches, hésitations', async () => {
  const decisions = [
    { pensee: 'Ouvrir le second onglet', passe: 'fonctionnelle', tache: 'Trouver l\'onglet deux', action: { type: 'cliquer', n: 1 }, constat: null, hesitation: null, tache_resultat: null, fin: false },
    { pensee: 'Saisir du texte dans un montant', passe: 'fonctionnelle', tache: 'Trouver l\'onglet deux', action: { type: 'saisir', n: 2, valeur: 'abc' }, constat: { gravite: 'genant', famille: 'bug', quoi: 'Le montant accepte du texte', ou: 'champ Montant' }, hesitation: 'Je ne savais pas où était le montant', tache_resultat: 'reussie', fin: false },
    { pensee: 'Cliquer un élément disparu', passe: 'fonctionnelle', tache: null, action: { type: 'cliquer', n: 9 }, constat: null, hesitation: null, tache_resultat: null, fin: false },
    { pensee: 'Tout est vu', passe: 'fin', tache: null, action: null, constat: null, hesitation: null, tache_resultat: null, fin: true },
  ];
  let k = 0;
  const invoquer = async ({ prompt }) => { assert.match(prompt, /Éléments \(numéro rôle/); return decisions[k++]; };
  const s = fausseSession();
  const t = await explorer({ session: s, pageNom: 'Page', url: '/Page', manifeste: { but: 'tester', personas: ['x'], taches: ['Trouver l\'onglet deux'], interdits: [] }, invoquer });
  assert.equal(t.pas.length, 3);
  assert.equal(t.pas[2].resultat.ok, false);
  assert.equal(t.pas[2].erreurs, 1);
  assert.equal(t.constats.length, 1);
  assert.equal(t.taches.length, 1);
  assert.equal(t.taches[0].resultat, 'reussie');
  assert.equal(t.taches[0].clics, 2);
  assert.equal(t.hesitations.length, 1);
  assert.ok(t.captures.length >= 1);
});

test('l\'explorateur s\'arrête au budget de pas et sur un arrêt demandé', async () => {
  const invoquer = async () => ({ pensee: 'encore', passe: 'fonctionnelle', action: { type: 'defiler' }, fin: false });
  const t = await explorer({ session: fausseSession(), pageNom: 'P', url: '/P', invoquer, budget: { pas: 4, minutes: 5, pasTel: 2 } });
  assert.equal(t.pas.length, 4);
  let n = 0;
  const t2 = await explorer({ session: fausseSession(), pageNom: 'P', url: '/P', invoquer, arreter: () => (n++ >= 2) });
  assert.equal(t2.pas.length, 2);
});

test('le critique lit les captures par lots et rend des constats', async () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'captures-'));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  const captures = Array.from({ length: 6 }, (_, i) => { const chemin = path.join(dossier, `c${i}.png`); fs.writeFileSync(chemin, png); return { nom: `c${i}`, fichier: `c${i}.png`, chemin, vue: 'ordi', theme: 'sombre' }; });
  let lots = 0;
  const invoquer = async ({ documents }) => { lots += 1; assert.ok(documents.length <= 4); return `{"constats":[{"capture":"${documents[0].nom}","gravite":"genant","famille":"ui","quoi":"Titre trop petit","ou":"en-tête","pourquoi":"illisible","proposition":"22 px"}],"reussi":["La liste est claire"]}`; };
  const c = await critiquer({ captures, pageNom: 'P', grille: 'règles', invoquer });
  assert.equal(lots, 2);
  assert.equal(c.filter((x) => x.quoi).length, 2);
  assert.equal(c.filter((x) => x.reussi).length, 2);
});

test('la synthèse reçoit la trace complète et rend le rapport ; le mail se rend', async () => {
  const s = fausseSession();
  const trace = { vue: 'ordi', session: s, pas: [{ i: 1, pensee: 'x', action: { type: 'cliquer', n: 1 }, resultat: { ok: true }, erreurs: 0 }], constats: [{ gravite: 'genant', famille: 'bug', quoi: 'Q', ou: 'O' }], taches: [{ tache: 'T', resultat: 'reussie', clics: 3, hesitations: 0 }], hesitations: [], duree_s: 10, defauts: [] };
  const invoquer = async ({ prompt, response_json_schema }) => {
    assert.match(prompt, /Requêtes lentes.*2500 ms/);
    assert.ok(response_json_schema.required.includes('prompt_correction'));
    return { resume: 'R', notes: { fonctionnel: 7, taches: 8, interface: 6, performance: 5, accessibilite: 6 }, problemes: [{ titre: 'P1', gravite: 'bloquant', famille: 'bug', reproduire: 'cliquer', cause_probable: 'c', correction: 'f', capture: null, effort: 'quick win' }], reussi: ['ok'], couverture: { teste: ['a'], pas_teste: ['b'] }, prompt_correction: 'Corrige P1' };
  };
  const syn = await synthetiser({ pageNom: 'P', vue: 'admin', manifeste: null, note: null, etat: { chargement_ms: 900, hauteur: 1000 }, traces: [trace], clavier: { pas: 5, perdus: 0, hors_ecran: 0, sans_anneau: 1 }, critiques: [], invoquer });
  assert.equal(syn.notes.taches, 8);
  const r = Records.create(RAPPORT, { page: 'P', url: '/P', vue: 'admin', lance_par: 'j@k', lance_le: new Date().toISOString(), etat: 'fini', ...syn, captures: [], taches: trace.taches, pas: 1, chargement_ms: 900 });
  let vars = null; let notif = null;
  await envoyerRapport(r, { envoyerMail: async (v) => { vars = v; return { ok: true, simule: true }; }, notifierApp: (n) => { notif = n; } });
  assert.match(vars.objet, /Agent testeur · P · 1 problème/);
  assert.match(vars.problemes, /\[bloquant\] P1/);
  assert.match(vars.notes, /taches : 8 \/ 10/);
  assert.equal(notif.pour, 'j@k');
  assert.equal(Records.get(RAPPORT, r.id).mail, 'simulé');
  const m = mailPlateforme('rapport_testeur', vars);
  assert.ok(m && /Corrige P1/.test(m.texte));
});

test('démarrer : un seul audit à la fois, un plafond par jour, les manifestes', async () => {
  const lances = [];
  const lancer = async (x) => { lances.push(x); };
  const a = demarrer({ user: { email: 'j@k', role: 'admin' }, page: 'OffMarket', url: '/OffMarket', lancer });
  assert.ok(a.ok);
  await new Promise((r) => setImmediate(r));
  assert.equal(lances.length, 1);
  assert.equal(Records.get(RAPPORT, a.id).etat, 'en_cours');
  Meta.set('testeur-en-vol', JSON.stringify({ id: a.id, depuis: new Date().toISOString(), page: 'OffMarket' }));
  assert.ok(enVol());
  const b = demarrer({ user: { email: 'j@k' }, page: 'P', url: '/P', lancer });
  assert.equal(b.code, 409);
  Meta.set('testeur-en-vol', '');
  Meta.set(`testeur-jour:${new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' })}`, String(PLAFOND_JOUR));
  assert.equal(lancementsDuJour(), PLAFOND_JOUR);
  assert.equal(demarrer({ user: { email: 'j@k' }, page: 'P', url: '/P', lancer }).code, 429);
  assert.equal(manifesteDe('MandataireOffMarket').but, manifesteDe('OffMarket').but);
  assert.equal(manifesteDe('Inconnue'), null);
});
