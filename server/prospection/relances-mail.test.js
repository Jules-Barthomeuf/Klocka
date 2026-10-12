// Les relances par mail (10 oct. 2026) : préparées par l'IA (ici, un faux
// rédacteur), validées d'un clic, elles comptent comme une relance : mail
// parti, contact noté, prochaine relance un mois plus tard, Monday à jour.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-relances-mail-'));
const RM = await import('./relances-mail.js');
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
const auj = R.jourDe(new Date());

function agentDu(jour, { email = 'marc@agence-sud.fr', nom = 'Marc Dupont' } = {}) {
  const L = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  const f = Records.create('AgentImmo', { nom, agence: 'Agence du Sud', emails: email ? [email] : [], telephones: ['0611223344'], statut: 'en_discussion', prochaine: { quoi: 'point du mois', le: jour } });
  const ag = Records.create('AgenceProspect', { liste_id: L.id, nom: 'Agence du Sud', telephone: '04 93 11 22 33', carnet_id: f.id, agents: [], gerants: [], sources: ['Google Maps'] });
  Records.create('AppelAgent', { agent_id: f.id, agence_id: ag.id, etat: 'valide', issue: 'pas_de_murs', le: '2026-09-01T09:00:00Z', valide_le: '2026-09-01T09:00:00Z', par: nora.email, resume: 'Rien en ce moment.' });
  return { f, ag };
}

test('un mois plus tard : le même jour, le dernier du mois au besoin, jamais un week-end', () => {
  assert.equal(RM.unMoisPlusTard('2026-10-12'), '2026-11-12');
  // Le 31 janvier donne le 28 février 2026, un samedi : la relance passe au lundi 2 mars.
  assert.equal(RM.unMoisPlusTard('2026-01-31'), '2026-03-02');
  assert.equal(RM.unMoisPlusTard('2026-04-30'), '2026-06-01', '30 mai 2026 est un samedi : lundi 1er juin');
});

test("préparer, valider : le mail part, la relance passe d'un mois, Monday et le Suivi le voient", async () => {
  const faux = fauxMonday(); MON.brancherPourTests(faux);
  const { f } = agentDu(auj);
  const sans = agentDu(auj, { email: null, nom: 'Paul Sansmail' });
  const vus = [];
  const r = await RM.preparerRelancesMail({ user: nora, rediger: async (contextes) => { vus.push(...contextes); return { mails: contextes.map((c) => ({ cle: c.cle, objet: 'Des nouvelles de vos murs ?', corps: `Bonjour ${c.prenom},\n\nAvez-vous de nouveaux murs commerciaux loués ?\n\nBien cordialement,` })) }; } });
  assert.equal(r.prepares, 1);
  assert.ok(r.sans_adresse >= 1, 'sans adresse : au téléphone');
  assert.equal(vus[0].prenom, 'Marc');
  assert.equal(vus[0].motif, 'Point mensuel');
  // Préparer deux fois ne double rien.
  assert.equal((await RM.preparerRelancesMail({ user: nora, rediger: async () => ({ mails: [] }) })).prepares, 0);
  const [m] = RM.relancesMailAValider();
  assert.equal(m.a, 'marc@agence-sud.fr');

  const envoyes = [];
  MAILS.brancherEnvoiPourTests(async ({ to, subject, body }) => { envoyes.push({ to, subject, body }); return { success: true, messageId: 'x', dans_les_envoyes: true }; });
  const v = await RM.validerRelanceMail(m.id, { objet: 'Des nouvelles ?' }, nora);
  assert.equal(v.ok, true, v.error);
  assert.equal(envoyes.length, 1);
  assert.equal(envoyes[0].subject, 'Des nouvelles ?');
  assert.match(envoyes[0].body, /Bien cordialement,\nNora Lorinquer/, 'la signature ajoutée');
  const fiche = Records.get('AgentImmo', f.id);
  assert.equal(fiche.prochaine.le, RM.unMoisPlusTard(auj));
  const contact = Records.list('AppelAgent').find((x) => x.agent_id === f.id && x.issue === 'relance_mail');
  assert.ok(contact && contact.etat === 'valide' && contact.canal === 'mail');
  assert.equal(v.recu.monday.etat, 'ok', v.recu.monday.erreur);
  const ligne = [...faux.items.values()].find((x) => x.colonnes.email === 'marc@agence-sud.fr');
  assert.ok(ligne, 'la ligne Monday de l\'agent');
  assert.equal(ligne.colonnes.relance, RM.unMoisPlusTard(auj));
  assert.match(ligne.colonnes.remarques, /Relance par mail/);
  assert.equal(RM.relancesMailAValider().length, 0);
  assert.equal((await RM.validerRelanceMail(m.id, {}, nora)).ok, false, 'une seule fois');
  // Un mail qui ne part pas ne compte pas comme une relance.
  const { f: f2 } = agentDu(auj, { email: 'lea@agence.fr', nom: 'Léa Martin' });
  await RM.preparerRelancesMail({ user: nora, rediger: async (cs) => ({ mails: cs.map((c) => ({ cle: c.cle, objet: 'o', corps: 'Bonjour,\n\nBien cordialement,' })) }) });
  MAILS.brancherEnvoiPourTests(async () => ({ success: false, error: 'Gmail a refusé' }));
  const m2 = RM.relancesMailAValider().find((x) => x.agent_id === f2.id);
  const rate = await RM.validerRelanceMail(m2.id, {}, nora);
  assert.equal(rate.ok, false);
  assert.equal(Records.get('AgentImmo', f2.id).prochaine.le, auj, 'la relance reste due');
  assert.equal(RM.ignorerRelanceMail(m2.id, nora).ok, true);
  void sans;
});

test('la mise en forme : une ligne vide après la salutation et avant la formule de politesse', () => {
  assert.equal(RM.mettreEnForme('Bonjour Marc,\nAvez-vous du nouveau ?\nBien cordialement,'), 'Bonjour Marc,\n\nAvez-vous du nouveau ?\n\nBien cordialement,');
  assert.equal(RM.mettreEnForme('Bonjour,\n\nTexte.\n\n\n\nBien cordialement,\n{signature}'), 'Bonjour,\n\nTexte.\n\nBien cordialement,');
});
