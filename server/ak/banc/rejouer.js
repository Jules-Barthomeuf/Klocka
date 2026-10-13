// Le banc d'essai d'AK (12 oct. 2026). Trente demandes réelles (vingt le 12 oct., dix du journal le 13), tirées des
// conversations sauvegardées (dont les échecs connus), rejouées sur une copie
// de la base : rien n'est écrit dans la vraie base, rien ne sort (Monday,
// mails, Drive, agenda, crédits Data-B, K-Data, Apollo, MyNotary : coupés ou
// simulés, voir garde.js). Chaque demande rend sa réponse, ses outils, ses
// tours de modèle, son coût et sa durée.
//
//   npm run banc -- avant            rejoue les 20 cas, rapport « avant »
//   npm run banc -- apres --cas 03,05
//   npm run banc -- --comparer avant apres
//
// Les rapports vont dans server/data/banc/ (hors du dépôt : ils contiennent
// des données réelles).

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, '..', '..', '..');
const DOSSIER_RAPPORTS = path.join(RACINE, 'server', 'data', 'banc');
const CAS = JSON.parse(fs.readFileSync(path.join(__dirname, 'cas.json'), 'utf8'));

// Ce qui sortirait de la plateforme : vidé dans le processus du banc.
const COUPES = ['MONDAY_TOKEN', 'RESEND_API_KEY', 'SMTP_HOST', 'SMTP_PASS', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_CHAT', 'GOOGLE_CHAT_WEBHOOK_DOSSIERS',
  'APOLLO_API_KEY', 'DATAB_EMAIL', 'DATAB_MOT_DE_PASSE', 'EQUIMMOX_EMAIL', 'EQUIMMOX_MOT_DE_PASSE', 'MYNOTARY_AGENT', 'MYNOTARY_EMAIL', 'MYNOTARY_MOT_DE_PASSE', 'EMAILING_REEL', 'RENDER'];

const args = process.argv.slice(2);
const option = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : null; };

const euros = (usd) => `${(usd * 0.92).toFixed(3).replace('.', ',')} €`;
const court = (t, n) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

/** Le rapport Markdown d'une passe. */
export function rapport(passe) {
  const l = [`# Banc d'essai d'AK · ${passe.label}`, '', `${passe.le} · AK_MODELE ${passe.modele_ak} · ANTHROPIC_MODEL ${passe.modele}`, ''];
  const t = passe.resultats;
  const somme = (k) => t.reduce((n, r) => n + (r[k] || 0), 0);
  l.push(`${t.length} demandes · ${euros(somme('cout_usd'))} · ${Math.round(somme('duree_ms') / 1000)} s en tout · ${t.filter((r) => r.erreur).length} erreurs · ${t.filter((r) => r.limite).length} arrêtées à la limite de tours`, '');
  l.push('| Cas | Ce qu’on teste | Tours | Outils | Coût | Durée | Réponse |', '| --- | --- | ---: | --- | ---: | ---: | --- |');
  for (const r of t) l.push(`| ${r.id} | ${court(r.note, 60)} | ${r.tours ?? '—'}${r.limite ? ' (limite)' : ''} | ${r.outils.map((o) => `${o.outil}${o.echec ? ' ✗' : ''}`).join(', ') || '—'} | ${euros(r.cout_usd)} | ${Math.round(r.duree_ms / 1000)} s | ${court(r.erreur ? `ERREUR : ${r.erreur}` : r.reponse, 160).replace(/\|/g, '/')} |`);
  l.push('', '## Les réponses en entier', '');
  for (const r of t) {
    l.push(`### ${r.id} · ${r.note}`, '', `> ${court(r.texte, 400)}`, '', r.erreur ? `**Erreur** : ${r.erreur}` : r.reponse, '');
    if (r.outils.length) l.push('Outils :', ...r.outils.map((o) => `- ${o.outil} ${court(JSON.stringify(o.arguments), 200)}${o.echec ? ` → échec ${court(o.resultat || o.erreur, 200)}` : ''}`), '');
  }
  return l.join('\n');
}

/** Le comparatif de deux passes, cas par cas. */
export function comparatif(a, b) {
  const l = [`# Banc d'essai d'AK · ${a.label} contre ${b.label}`, ''];
  const somme = (p, k) => p.resultats.reduce((n, r) => n + (r[k] || 0), 0);
  const ligne = (nom, f) => `| ${nom} | ${f(a)} | ${f(b)} |`;
  l.push('| | ' + a.label + ' | ' + b.label + ' |', '| --- | ---: | ---: |',
    ligne('Modèle d’AK', (p) => p.modele_ak), ligne('Coût total', (p) => euros(somme(p, 'cout_usd'))), ligne('Durée totale', (p) => `${Math.round(somme(p, 'duree_ms') / 1000)} s`),
    ligne('Tours de modèle', (p) => somme(p, 'tours')), ligne('Appels d’outils', (p) => p.resultats.reduce((n, r) => n + r.outils.length, 0)),
    ligne('Outils en échec', (p) => p.resultats.reduce((n, r) => n + r.outils.filter((o) => o.echec).length, 0)),
    ligne('Arrêts à la limite de tours', (p) => p.resultats.filter((r) => r.limite).length), ligne('Erreurs', (p) => p.resultats.filter((r) => r.erreur).length), '');
  l.push('| Cas | Tours | Outils | Coût | Durée |', '| --- | --- | --- | --- | --- |');
  for (const ra of a.resultats) {
    const rb = b.resultats.find((x) => x.id === ra.id);
    if (!rb) continue;
    l.push(`| ${ra.id} ${court(ra.note, 40)} | ${ra.tours ?? '—'} → ${rb.tours ?? '—'} | ${ra.outils.length} → ${rb.outils.length} | ${euros(ra.cout_usd)} → ${euros(rb.cout_usd)} | ${Math.round(ra.duree_ms / 1000)} → ${Math.round(rb.duree_ms / 1000)} s |`);
  }
  l.push('', '## Les réponses côte à côte', '');
  for (const ra of a.resultats) {
    const rb = b.resultats.find((x) => x.id === ra.id);
    if (!rb) continue;
    l.push(`### ${ra.id} · ${ra.note}`, '', `> ${court(ra.texte, 300)}`, '', `**${a.label}** (${ra.outils.map((o) => o.outil).join(', ') || 'aucun outil'}) :`, '', ra.erreur ? `Erreur : ${ra.erreur}` : ra.reponse, '', `**${b.label}** (${rb.outils.map((o) => o.outil).join(', ') || 'aucun outil'}) :`, '', rb.erreur ? `Erreur : ${rb.erreur}` : rb.reponse, '');
  }
  return l.join('\n');
}

// --- Le processus du banc : il tourne sur la copie ---------------------------

async function rejouerDansLaCopie(label, ids) {
  const { Records, CHEMIN_UPLOADS } = await import('../../db.js');
  const { mesurer } = await import('../../llm-couts.js');
  const resultats = [];
  for (const c of CAS.filter((x) => !ids || ids.includes(x.id))) {
    const user = Records.findBy('User', 'email', c.user) || { email: c.user, full_name: c.user.split('@')[0], role: c.chat === 'mandataire' ? 'mandataire' : 'admin' };
    const avant = new Set(Records.list('CoutIA').map((x) => x.id));
    const debut = Date.now();
    let r = null;
    let erreur = null;
    try {
      const { resultat } = await mesurer({ operation: 'banc d\'essai', par: user.email, sur: c.id }, async () => {
        if (c.chat === 'mandataire') {
          const { discuter } = await import('../../mandataire.js');
          return discuter({ historique: c.historique, texte: c.texte, user });
        }
        const { traiterBoite } = await import('../../assistant-boite.js');
        const pieces = c.piece ? [{ nom: c.piece.nom, type: c.piece.type, chemin: path.join(CHEMIN_UPLOADS, path.basename(c.piece.chemin)), url: null }] : [];
        return traiterBoite({ texte: c.texte, historique: c.historique, user, contexte: c.contexte || (c.page ? { page: c.page } : null), pieces });
      });
      r = resultat;
    } catch (e) { erreur = String(e?.message || e).slice(0, 500); }
    const lignes = Records.list('CoutIA').filter((x) => !avant.has(x.id));
    const res = {
      id: c.id, note: c.note, texte: c.texte, chat: c.chat,
      reponse: r?.texte || (r?.type && r.type !== 'assistant' ? `(trié en « ${r.type} » avant AK)` : ''),
      tri: r?.type || null, outils: r?.trace || (r?.outils || []).map((o) => ({ outil: o })),
      tours: r?.tours ?? null, limite: !!r?.limite, erreur,
      cout_usd: lignes.reduce((n, x) => n + (x.cout || 0), 0), appels_modele: lignes.reduce((n, x) => n + (x.appels || 0), 0), duree_ms: Date.now() - debut,
    };
    resultats.push(res);
    console.log(`${c.id} ${res.erreur ? 'ERREUR' : 'ok'} · ${res.tours ?? '—'} tours · ${res.outils.length} outils · ${euros(res.cout_usd)} · ${Math.round(res.duree_ms / 1000)} s · ${court(res.erreur || res.reponse, 90)}`);
  }
  return { label, le: new Date().toISOString(), modele_ak: process.env.AK_MODELE || process.env.ANTHROPIC_MODEL || 'défaut', modele: process.env.ANTHROPIC_MODEL || 'défaut', resultats };
}

// --- Le processus parent : copie la base, lance le banc, écrit le rapport ----

async function main() {
  fs.mkdirSync(DOSSIER_RAPPORTS, { recursive: true });
  const comparer = args.indexOf('--comparer');
  if (comparer >= 0) {
    const [a, b] = args.slice(comparer + 1, comparer + 3).map((n) => JSON.parse(fs.readFileSync(path.join(DOSSIER_RAPPORTS, `${n}.json`), 'utf8')));
    const sortie = path.join(DOSSIER_RAPPORTS, `comparatif-${a.label}-${b.label}.md`);
    fs.writeFileSync(sortie, comparatif(a, b));
    console.log(`Comparatif : ${sortie}`);
    return;
  }
  const label = args.find((x) => !x.startsWith('--') && x !== option('--cas')) || `passe-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`;
  const ids = option('--cas') ? option('--cas').split(',').map((x) => x.trim().padStart(2, '0')) : null;

  if (process.env.KLOCKA_BANC === '1') {
    const passe = await rejouerDansLaCopie(label, ids);
    // Quelques cas rejoués sur une passe existante : ils y remplacent les leurs.
    const deja = path.join(DOSSIER_RAPPORTS, `${label}.json`);
    if (ids && fs.existsSync(deja)) {
      const ancienne = JSON.parse(fs.readFileSync(deja, 'utf8'));
      passe.resultats = [...ancienne.resultats.filter((r) => !ids.includes(r.id)), ...passe.resultats].sort((a, b) => a.id.localeCompare(b.id));
      passe.le = ancienne.le;
    }
    fs.writeFileSync(path.join(DOSSIER_RAPPORTS, `${label}.json`), JSON.stringify(passe, null, 1));
    fs.writeFileSync(path.join(DOSSIER_RAPPORTS, `${label}.md`), rapport(passe));
    console.log(`Rapport : ${path.join(DOSSIER_RAPPORTS, `${label}.md`)}`);
    process.exit(0);
  }

  await import('dotenv/config');
  // Une copie cohérente de la base (sauvegarde SQLite), et les pièces déposées en lien.
  const { default: db, CHEMIN_UPLOADS } = await import('../../db.js');
  const copie = path.join(DOSSIER_RAPPORTS, `base-${label}`);
  fs.rmSync(copie, { recursive: true, force: true });
  fs.mkdirSync(copie, { recursive: true });
  await db.backup(path.join(copie, 'klocka.db'));
  try { fs.symlinkSync(CHEMIN_UPLOADS, path.join(copie, 'uploads'), 'dir'); } catch { /* déjà là */ }
  const env = { ...process.env, KLOCKA_DATA_DIR: copie, KLOCKA_BANC: '1', OFF_MARKET_VEILLE: 'false', CONTROLES_AUTO: 'false' };
  for (const k of COUPES) env[k] = '';
  const enfant = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args], { cwd: RACINE, env, stdio: 'inherit' });
  const code = await new Promise((ok) => enfant.on('exit', ok));
  fs.rmSync(copie, { recursive: true, force: true });
  process.exit(code ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
