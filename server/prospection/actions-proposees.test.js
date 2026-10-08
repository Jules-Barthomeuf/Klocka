// Les actions proposées après un appel, rejouées de bout en bout (8 oct. 2026,
// demande de Jules : « il faut vraiment que les actions proposées marchent
// tout le temps »). Le vrai parcours (noterIssue → validerIssue → mail différé
// → reçu → Annuler → nouvel essai), avec un faux tableau Monday qui se
// comporte comme « Agents immobiliers » (mêmes colonnes, mêmes relectures en
// texte, un nom vide ignoré) et une fausse boîte d'envoi. Chaque issue, chaque
// situation Monday (nouvelle ligne, ligne retrouvée, doute, panne puis reprise,
// écriture perdue) et chaque situation de mail (envoyé et retrouvé, non
// vérifié, échec, sans boîte, sans adresse).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-actions-'));
const MA = await import('./mode-appel.js');
const MON = await import('./monday-agents.js');
const MAILS = await import('./mails.js');
const R = await import('./regles.js');
const { Records } = await import('../db.js');

// ---------------------------------------------------------------------------
// Un faux « Agents immobiliers »
// ---------------------------------------------------------------------------

const COLONNES = [
  { id: 'name', title: 'Nom', type: 'name' }, { id: 'spoc', title: 'SPOC', type: 'people' }, { id: 'prenom', title: 'Prénom', type: 'text' },
  { id: 'date_contact', title: 'Date', type: 'date' }, { id: 'email', title: 'E-mail', type: 'email' }, { id: 'phone', title: 'Téléphone', type: 'phone' },
  { id: 'statut', title: 'Statut', type: 'status' }, { id: 'dernier', title: 'Dernier contact', type: 'text' }, { id: 'diffusion', title: 'Liste de diffusion', type: 'status' },
  { id: 'proprietes', title: 'Propriétés', type: 'board_relation' }, { id: 'ville', title: 'Ville', type: 'text' }, { id: 'entreprise', title: 'Entreprise', type: 'dropdown' },
  { id: 'remarques', title: 'Remarques', type: 'text' }, { id: 'priorite', title: 'Priorité', type: 'status' }, { id: 'relance', title: 'Prochaine relance', type: 'date' },
];
const ANALYSTES = { 'nora.l@klocka.immo': { id: 77, name: 'Nora Lorinquer' } };

/** Pure : ce que Monday relit d'une valeur écrite. */
function enTexte(type, v) {
  if (v == null || v === '') return '';
  if (typeof v === 'string') return v;
  if (type === 'date') return v.date || '';
  if (type === 'phone') return v.phone || '';
  if (type === 'email') return v.email || '';
  if (type === 'status') return v.label || '';
  if (type === 'dropdown') return (v.labels || []).join(', ');
  if (type === 'people') return (v.personsAndTeams || []).map((p) => Object.values(ANALYSTES).find((a) => a.id === p.id)?.name || '').join(', ');
  if (v.text != null) return v.text;
  return '';
}

function fauxMonday() {
  const items = new Map();
  let n = 1000;
  const f = {
    items, panne: false, perdreEcritures: false, creations: 0, majs: 0, suppressions: 0,
    mondayConfigure: () => true,
    async colonnesDuTableau() { return COLONNES; },
    async lireTableau() { if (f.panne) throw new Error('Monday a répondu 500'); return [...items.values()].map((x) => ({ id: x.id, nom: x.nom, colonnes: { ...x.colonnes } })); },
    async lireElement(id) { if (f.panne) throw new Error('Monday a répondu 500'); const x = items.get(String(id)); return x ? { id: x.id, nom: x.nom, colonnes: { ...x.colonnes } } : null; },
    async personneMonday({ email }) { return ANALYSTES[email] || null; },
    appliquer(x, valeurs) {
      for (const [k, v] of Object.entries(valeurs)) {
        // Monday ignore un nom vide ou d'espaces ; il garde un espace de largeur nulle.
        if (k === 'name') { if (String(v).trim() || String(v).includes('​')) x.nom = String(v); continue; }
        const c = COLONNES.find((y) => y.id === k);
        if (c) x.colonnes[k] = enTexte(c.type, v);
      }
    },
    async creerElement(_t, nom, valeurs) {
      if (f.panne) throw new Error('Monday a répondu 500');
      f.creations += 1;
      const x = { id: String(n++), nom, colonnes: Object.fromEntries(COLONNES.filter((c) => c.id !== 'name').map((c) => [c.id, ''])) };
      if (!f.perdreEcritures) f.appliquer(x, valeurs);
      items.set(x.id, x);
      return { id: x.id };
    },
    async majElement(_t, id, valeurs) {
      if (f.panne) throw new Error('Monday a répondu 500');
      f.majs += 1;
      const x = items.get(String(id));
      if (x && !f.perdreEcritures) f.appliquer(x, valeurs);
      return { id };
    },
    async supprimerElement(id) { f.suppressions += 1; items.delete(String(id)); },
    ajouter(nom, colonnes) { const x = { id: String(n++), nom, colonnes: { ...Object.fromEntries(COLONNES.filter((c) => c.id !== 'name').map((c) => [c.id, ''])), ...colonnes } }; items.set(x.id, x); return x; },
  };
  return f;
}

// ---------------------------------------------------------------------------
// Une fausse boîte d'envoi
// ---------------------------------------------------------------------------

const envoyes = [];
let modeEnvoi = 'gmail'; // gmail : retrouvé dans les envoyés ; smtp : parti sans preuve ; echec
MAILS.brancherEnvoiPourTests(async ({ to, subject, body, user }) => {
  if (modeEnvoi === 'echec') return { success: false, error: 'Gmail a refusé l\'envoi (401)' };
  envoyes.push({ to, subject, body, de: user?.email });
  return { success: true, messageId: `m${envoyes.length}`, dans_les_envoyes: modeEnvoi === 'gmail', expediteur: user?.email };
});
const nora = { email: 'nora.l@klocka.immo', role: 'admin', full_name: 'Nora Lorinquer' };
Records.create('User', { email: nora.email, role: 'admin', full_name: nora.full_name });
const avecBoite = () => MA.brancherBoitesPourTests([{ email: nora.email, peut_envoyer: true, par_defaut: true }]);
avecBoite();

const auj = R.jourDe(new Date());
let numero = 10;
function agence({ email = 'contact@agence-test.fr', nom = null, ville = 'Nice' } = {}) {
  numero += 1;
  const L = Records.create('ListeAgences', { ville, etat: 'fini', journal: [] });
  return Records.create('AgenceProspect', { liste_id: L.id, nom: nom || `Agence Test ${numero}`, telephone: `04 93 00 10 ${numero}`, email, agents: [], gerants: [], sources: ['Google Maps'] });
}
async function appeler(ag, issue, { modifier = null, cle = null } = {}) {
  const r = await MA.noterIssue({ agence_id: ag.id, issue, user: nora });
  assert.equal(r.ok, true, r.error);
  if (r.simple) return { r, v: r };
  let choix = r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  if (modifier) choix = modifier(choix, r.appel);
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix, cle: cle || `cle-${r.appel.id}`, user: nora, issue: r.appel.issue_tapee });
  assert.equal(v.ok, true, v.error);
  return { r, v };
}
const ligneDe = (faux, ag) => [...faux.items.values()].find((x) => x.colonnes.phone && R.normTel(x.colonnes.phone) === R.normTel(ag.telephone));

// ---------------------------------------------------------------------------

test("Pas de bien : nouvelle ligne Monday complète et relue, mail Présentation + cahier envoyé et retrouvé, liste de diffusion, relance J+30", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); modeEnvoi = 'gmail'; avecBoite();
  const ag = agence();
  const { r, v } = await appeler(ag, 'pas_de_murs');
  assert.equal(r.appel.propositions.find((p) => p.id === 'monday').ligne.etat, 'nouvelle', "l'aperçu annonce un nouveau contact");
  assert.equal(v.recu.monday.etat, 'ok', v.recu.monday.erreur);
  const l = ligneDe(faux, ag);
  assert.ok(l, 'la ligne existe dans Monday');
  assert.equal(l.nom, MON.CONTACT_VIDE, 'Contact vide : le nom n\'a pas été dit');
  assert.equal(l.colonnes.ville, 'Nice');
  assert.equal(l.colonnes.entreprise, ag.nom);
  assert.equal(l.colonnes.email, 'contact@agence-test.fr', "l'adresse du mail dans E-mail");
  assert.equal(l.colonnes.date_contact, auj, 'Date = le jour de l\'appel');
  assert.equal(l.colonnes.statut, "Pas de bien pour l'instant");
  assert.equal(l.colonnes.diffusion, 'Oui');
  assert.equal(l.colonnes.spoc, 'Nora Lorinquer');
  assert.match(l.colonnes.dernier, /^\d{2}\/\d{2}\/\d{4}/);
  assert.equal(l.colonnes.relance, R.ouvre(R.plusJours(auj, 30)));
  assert.match(l.colonnes.remarques, /^\d{2}\/\d{2}\/\d{4} · /);
  assert.equal(l.colonnes.priorite, '', 'Priorité jamais touchée');
  // Le mail part dix secondes après, et n'est « envoyé » qu'une fois retrouvé dans les envoyés.
  assert.equal(v.recu.mail.etat, 'attente');
  const d = await MA.envoyerMailDiffere(r.appel.id);
  assert.equal(d.mail.etat, 'ok');
  const m = envoyes.at(-1);
  assert.equal(m.to, 'contact@agence-test.fr');
  assert.equal(m.subject, 'Présentation de notre activité et cahier des charges – Klocka');
  assert.match(m.body, /^Bonjour,\n\nSuite à notre échange/);
  assert.match(m.body, /Je suis Nora Lorinquer, analyste/);
  assert.match(m.body, /Bien cordialement,\nNora Lorinquer\nKlocka · klocka\.immo\nnora\.l@klocka\.immo$/);
  assert.ok(!/\{\w+\}/.test(m.body), 'aucune variable laissée');
  assert.equal(v.recu.diffusion.etat, 'ok');
  assert.match(v.recu.relance.texte, /^Relance /);
  assert.equal(MA.recu(r.appel.id).recu.mail.etat, 'ok', 'le reçu relu le dit aussi');
});

test("A un bien : la ligne existante est retrouvée par le téléphone et mise à jour sans rien écraser ; mail fiche commerciale ; relance J+3 ouvrés", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); modeEnvoi = 'gmail'; avecBoite();
  const ag = agence();
  const existante = faux.ajouter('Sophie Martin', { phone: '+33' + R.normTel(ag.telephone), ville: 'Nice', entreprise: 'Libellé de l\'équipe', remarques: '12/09/2026 · ancienne note', priorite: 'Élevée', email: 'sophie@agence.fr' });
  const { r, v } = await appeler(ag, 'a_des_murs');
  assert.equal(r.appel.propositions.find((p) => p.id === 'monday').ligne.etat, 'trouvee');
  assert.equal(v.recu.monday.etat, 'ok', v.recu.monday.erreur);
  assert.equal(faux.creations, 0, 'aucun doublon créé');
  const l = faux.items.get(existante.id);
  assert.equal(l.nom, 'Sophie Martin', 'le contact garde son nom');
  assert.equal(l.colonnes.entreprise, "Libellé de l'équipe", 'l\'entreprise de l\'équipe n\'est pas écrasée');
  assert.equal(l.colonnes.email, 'sophie@agence.fr', 'l\'e-mail déjà là reste');
  assert.equal(l.colonnes.priorite, 'Élevée');
  assert.match(l.colonnes.remarques, /^12\/09\/2026 · ancienne note\n\d{2}\/\d{2}\/\d{4} · /, 'Remarques allongée');
  assert.equal(l.colonnes.statut, 'A un bien intéressant');
  assert.equal(l.colonnes.relance, R.plusJoursOuvres(auj, 3));
  assert.equal(r.appel.propositions.find((p) => p.id === 'mail').modele, 'demande-fiche');
  await MA.envoyerMailDiffere(r.appel.id);
  assert.match(envoyes.at(-1).body, /nous avons besoin de sa fiche commerciale/);
  assert.equal(envoyes.at(-1).subject, 'Murs commerciaux - Klocka');
});

test("Pas intéressé : Monday « Ne plus appeler », relance vidée, liste de diffusion Non, ni mail ni liste", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite();
  const ag = agence();
  const avant = envoyes.length;
  const { r, v } = await appeler(ag, 'pas_interesse');
  assert.ok(!r.appel.propositions.some((p) => ['mail', 'diffusion'].includes(p.id)));
  assert.equal(v.recu.monday.etat, 'ok', v.recu.monday.erreur);
  const l = ligneDe(faux, ag);
  assert.equal(l.colonnes.statut, 'Ne plus appeler');
  assert.equal(l.colonnes.relance, '');
  assert.equal(l.colonnes.diffusion, 'Non');
  assert.equal(v.recu.mail, null);
  assert.equal(envoyes.length, avant);
});

test('Pas de réponse et répondeur : rien dans Monday, rien par mail, la relance seule', async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux);
  for (const issue of ['pas_de_reponse', 'repondeur']) {
    const ag = agence();
    const { v } = await appeler(ag, issue);
    assert.equal(v.recu.monday, null, issue);
    assert.equal(v.recu.mail, null, issue);
    assert.match(v.recu.relance.texte, /^Relance /, issue);
  }
  assert.equal(faux.items.size, 0);
});

test("Monday en panne : reçu orange, l'écriture attend ; Monday revenu, le nouvel essai la passe au vert, sans doublon", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite();
  const ag = agence();
  faux.panne = true;
  const { r, v } = await appeler(ag, 'pas_de_murs');
  assert.equal(v.recu.monday.etat, 'attente');
  assert.ok(Records.list('MondayAttente').some((x) => x.appel_id === r.appel.id && !x.fait_le));
  faux.panne = false;
  await MA.reessayerAttentes();
  assert.equal(MA.recu(r.appel.id).recu.monday.etat, 'ok');
  await MA.reessayerAttentes();
  assert.equal([...faux.items.values()].filter((x) => R.normTel(x.colonnes.phone) === R.normTel(ag.telephone)).length, 1, 'une seule ligne');
});

test("Monday ne garde pas ce qu'on écrit : jamais de coche verte, l'écart est dit", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite();
  const ag = agence();
  faux.ajouter('Paul Durand', { phone: '+33' + R.normTel(ag.telephone), ville: 'Nice' });
  faux.perdreEcritures = true;
  const { v } = await appeler(ag, 'pas_de_murs');
  assert.equal(v.recu.monday.etat, 'attente');
  assert.match(v.recu.monday.erreur, /Monday affiche/);
  faux.perdreEcritures = false;
});

test("Deux lignes possibles : « C'est bien cette ligne ? », puis la ligne choisie est mise à jour", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite();
  const ag = agence();
  const a = faux.ajouter('Paul Durand', { phone: '+33' + R.normTel(ag.telephone), ville: 'Nice' });
  faux.ajouter('Marc Petit', { phone: '+33' + R.normTel(ag.telephone), ville: 'Nice' });
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_murs', user: nora });
  assert.equal(r.appel.propositions.find((p) => p.id === 'monday').ligne.etat, 'doute');
  // L'écran bloque la validation tant qu'on n'a pas choisi ; la ligne choisie part avec.
  const choix = r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix, monday_ligne: a.id, cle: 'doute-1', user: nora, issue: 'pas_de_murs' });
  assert.equal(v.recu.monday.etat, 'ok', v.recu.monday.erreur);
  assert.equal(faux.items.get(a.id).colonnes.statut, "Pas de bien pour l'instant");
  assert.equal(faux.creations, 0);
  // Sans choix (Monday indisponible à l'écran, doute découvert à la validation) : le reçu le demande, et le choix après coup marche.
  const ag2 = agence();
  faux.ajouter('Luc Un', { phone: '+33' + R.normTel(ag2.telephone) });
  faux.ajouter('Luc Deux', { phone: '+33' + R.normTel(ag2.telephone) });
  const r2 = await MA.noterIssue({ agence_id: ag2.id, issue: 'pas_de_murs', user: nora });
  const v2 = await MA.validerIssue({ appel_id: r2.appel.id, choix: r2.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id), cle: 'doute-2', user: nora, issue: 'pas_de_murs' });
  assert.equal(v2.recu.monday.etat, 'doute');
  const c = await MA.choisirLigneMonday(r2.appel.id, 'nouvelle');
  assert.equal(c.recu.monday.etat, 'ok');
});

test("Les mails : non vérifié (orange), échec puis renvoi, sans boîte (brouillon), sans adresse (dit, rien ne part)", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux);
  avecBoite(); modeEnvoi = 'smtp';
  const a1 = agence();
  const x1 = await appeler(a1, 'pas_de_murs');
  const m1 = await MA.envoyerMailDiffere(x1.r.appel.id);
  assert.equal(m1.mail.etat, 'attente');
  assert.match(m1.mail.texte, /pas retrouvé dans les envoyés/);
  modeEnvoi = 'echec';
  const a2 = agence();
  const x2 = await appeler(a2, 'pas_de_murs');
  const m2 = await MA.envoyerMailDiffere(x2.r.appel.id);
  assert.equal(m2.mail.etat, 'echec');
  modeEnvoi = 'gmail';
  const re = await MA.renvoyerMail(x2.r.appel.id, nora);
  assert.equal(re.ok, true, re.error);
  MA.brancherBoitesPourTests([]);
  const a3 = agence();
  const x3 = await appeler(a3, 'pas_de_murs');
  assert.equal(x3.v.recu.mail.etat, 'brouillon');
  assert.match(x3.v.recu.mail.mailto, /^mailto:contact%40agence-test\.fr\?subject=/);
  assert.ok(!/%7Bsignature%7D/.test(x3.v.recu.mail.mailto), 'la signature est posée dans le brouillon');
  avecBoite();
  const a4 = agence({ email: null });
  const x4 = await appeler(a4, 'pas_de_murs', { modifier: (choix) => [...new Set([...choix, 'mail'])] });
  assert.ok(!x4.v.recu.mail || x4.v.recu.mail.etat === 'echec');
});

test("Annuler dans les dix secondes : Monday comme avant (ligne créée retirée, ligne existante restaurée), mail retenu, liste et fiche remises", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite(); modeEnvoi = 'gmail';
  const a1 = agence();
  const x1 = await appeler(a1, 'pas_de_murs');
  assert.ok(ligneDe(faux, a1));
  const avant = envoyes.length;
  const an = await MA.annulerValidation(x1.r.appel.id, nora);
  assert.equal(an.ok, true, an.error);
  assert.ok(!ligneDe(faux, a1), 'la ligne créée est retirée');
  await MA.envoyerMailDiffere(x1.r.appel.id);
  assert.equal(envoyes.length, avant, 'le mail ne part pas');
  const a2 = agence();
  const e = faux.ajouter('Sophie Martin', { phone: '+33' + R.normTel(a2.telephone), ville: 'Nice', remarques: 'ancienne', relance: '2026-12-01', statut: '' });
  await appeler(a2, 'a_des_murs');
  assert.notEqual(faux.items.get(e.id).colonnes.remarques, 'ancienne');
  const appel2 = Records.list('AppelAgent').filter((x) => x.agence_id === a2.id).at(-1);
  await MA.annulerValidation(appel2.id, nora);
  const l = faux.items.get(e.id);
  assert.equal(l.colonnes.remarques, 'ancienne');
  assert.equal(l.colonnes.relance, '2026-12-01');
  assert.equal(l.colonnes.statut, '');
  // Revalider après Annuler : tout repart une fois.
  const v = await MA.validerIssue({ appel_id: appel2.id, choix: appel2.propositions.filter((p) => p.coche !== false).map((p) => p.id), cle: 'apres-annuler', user: nora, issue: 'a_des_murs' });
  assert.equal(v.recu.monday.etat, 'ok');
});

test('Double tap sur Valider : une seule ligne Monday, un seul mail', async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite(); modeEnvoi = 'gmail';
  const ag = agence();
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'pas_de_murs', user: nora });
  const choix = r.appel.propositions.filter((p) => p.coche !== false).map((p) => p.id);
  const [v1, v2] = await Promise.all([1, 2].map(() => MA.validerIssue({ appel_id: r.appel.id, choix, cle: 'dbl', user: nora, issue: 'pas_de_murs' })));
  assert.deepEqual(v1.recu, v2.recu);
  assert.equal(faux.creations, 1);
  const avant = envoyes.length;
  await Promise.all([MA.envoyerMailDiffere(r.appel.id), MA.envoyerMailDiffere(r.appel.id)]);
  assert.equal(envoyes.length, avant + 1, 'un seul mail');
});

test('Deux relances (un bien et un mandat annoncé) et la date changée à la main : la fiche et Monday suivent', async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux); avecBoite();
  const ag = agence();
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'a_des_murs', user: nora });
  // La seconde relance, comme l'écran la reçoit quand AK a entendu un mandat.
  const deuxieme = R.plusJours(auj, 20);
  const props = [...r.appel.propositions, { id: 'relance_2', type: 'relance_suivante', titre: 'Planifier la seconde relance', prochaine: { quoi: 'faire le point sur le mandat annoncé', le: deuxieme }, coche: true }];
  Records.update('AppelAgent', r.appel.id, { propositions: props });
  const premiere = R.plusJours(auj, 5);
  const v = await MA.validerIssue({ appel_id: r.appel.id, choix: props.filter((p) => p.coche !== false).map((p) => p.id), relance_le: premiere, cle: 'deux', user: nora, issue: 'a_des_murs' });
  const fiche = Records.get('AgentImmo', Records.get('AgenceProspect', ag.id).carnet_id);
  assert.equal(fiche.prochaine.le, premiere, 'la date changée à la main');
  assert.equal(fiche.relances_suivantes[0].le, deuxieme);
  assert.match(v.recu.relance.texte, /puis/);
  assert.equal(ligneDe(faux, ag).colonnes.relance, premiere);
});
