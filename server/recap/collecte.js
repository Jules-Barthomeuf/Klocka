// Ce que le récap du matin lit sur le Mac de Jules (9 oct. 2026) : les
// commits, le travail pas commité, les sessions Claude Code et les mémoires.
// Ces sources n'existent que là ; le serveur de production ne les voit pas.
// Tout est lu, rien n'est modifié, et les secrets sont masqués avant de
// partir vers le modèle.

import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { execFileSync } from 'child_process';

export const DOSSIER_CLAUDE = path.join(os.homedir(), '.claude', 'projects', '-Users-julesbarthomeuf-Klocka');

/** Les dossiers de sessions du projet : le dépôt et ses ateliers (worktrees). */
export function dossiersClaude(base = DOSSIER_CLAUDE) {
  const parent = path.dirname(base);
  if (!fs.existsSync(parent)) return [];
  const nom = path.basename(base);
  return fs.readdirSync(parent).filter((d) => d === nom || d.startsWith(`${nom}-`)).map((d) => path.join(parent, d));
}

const couper = (t, n) => { const s = String(t || '').trim(); return s.length > n ? `${s.slice(0, n)}…` : s; };

/** Pure : masque ce qui ressemble à un secret (clés, jetons, mots de passe). */
export function masquer(texte) {
  return String(texte || '')
    .replace(/\b(sk|re|pk|rk)[-_](?=[A-Za-z_-]*\d)[A-Za-z0-9_-]{12,}/g, '[secret]')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(\.[A-Za-z0-9_-]+)?/g, '[jeton]')
    .replace(/\b(gh[pousr]_[A-Za-z0-9]{20,})/g, '[secret]')
    .replace(/((?:token|jeton|secret|api[_-]?key|password|mot_de_passe|mdp)["']?\s*[:=]\s*["']?)[^\s"',}]{6,}/gi, '$1[masqué]')
    .replace(/^([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)[A-Z0-9_]*=).+$/gm, '$1[masqué]');
}

const git = (racine, args) => { try { return execFileSync('git', args, { cwd: racine, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };

/** Les commits depuis une date, toutes branches : sha, date, message. */
export function commitsDepuis(racine, depuis) {
  const brut = git(racine, ['log', '--all', `--since=${depuis}`, '--date=iso-strict', '--format=%h%x1f%ad%x1f%B%x1e']);
  return brut.split('\x1e').map((x) => x.trim()).filter(Boolean).map((x) => {
    const [sha, le, message] = x.split('\x1f');
    return { sha, le, message: couper(String(message || '').replace(/\n*Co-Authored-By:.*$/gim, ''), 2500) };
  });
}

/** Le travail en cours : branche, fichiers pas commités, commits pas encore sur `main`. */
export function travailEnCours(racine) {
  const branche = git(racine, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const fichiers = git(racine, ['status', '--short']).split('\n').map((l) => l.trimEnd()).filter(Boolean);
  const pasSurMain = git(racine, ['log', '--oneline', 'main..HEAD']).split('\n').filter(Boolean);
  return { branche, fichiers: fichiers.slice(0, 60), fichiers_n: fichiers.length, pas_sur_main: pasSurMain.slice(0, 20), pas_sur_main_n: pasSurMain.length };
}

/** Pure : le texte tapé par Jules dans une ligne de session, ou null (outil, rappel système, sous-agent). */
export function texteDeJules(o) {
  if (!o || o.isSidechain || o.isMeta) return null;
  if (o.type === 'attachment' && o.attachment?.type === 'queued_command') {
    const p = String(o.attachment.prompt || '');
    return p.startsWith('<') ? null : p;
  }
  if (o.type !== 'user') return null;
  const c = o.message?.content;
  if (typeof c === 'string') return c.startsWith('<') || c.startsWith('[Request interrupted') ? null : c;
  if (!Array.isArray(c) || c.some((b) => b.type === 'tool_result')) return null;
  const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return t && !t.startsWith('<') ? t : null;
}

/** Pure : le texte d'une réponse de Claude dans une ligne de session, ou null. */
export function texteDeClaude(o) {
  if (!o || o.isSidechain || o.type !== 'assistant') return null;
  const c = o.message?.content;
  if (!Array.isArray(c)) return null;
  const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  return t || null;
}

/**
 * Une session : chaque demande de Jules depuis la date, avec la dernière
 * réponse de Claude avant la demande suivante (là où il dit ce qui est fait
 * et ce qui reste). Avant `recent`, l'historique est gardé plus court : il
 * sert à repérer ce qui a été demandé et jamais fini.
 */
export async function lireSession(fichier, depuis, recent = depuis) {
  const tours = [];
  let titre = null;
  let debut = null;
  const flux = readline.createInterface({ input: fs.createReadStream(fichier, { encoding: 'utf8' }), crlfDelay: Infinity });
  for await (const ligne of flux) {
    if (!ligne.includes('"type":"user"') && !ligne.includes('"type":"assistant"') && !ligne.includes('queued_command') && !ligne.includes('"ai-title"')) continue;
    let o;
    try { o = JSON.parse(ligne); } catch { continue; }
    if (o.type === 'ai-title') { titre = o.aiTitle || titre; continue; }
    if (o.timestamp && !debut) debut = o.timestamp;
    if (!o.timestamp || o.timestamp < depuis) continue;
    const frais = o.timestamp >= recent;
    const demande = texteDeJules(o);
    if (demande) { tours.push({ le: o.timestamp, recent: frais, demande: couper(masquer(demande), frais ? 1500 : 500), reponse: null }); continue; }
    const reponse = texteDeClaude(o);
    if (reponse && tours.length) tours[tours.length - 1].reponse = couper(masquer(reponse), tours[tours.length - 1].recent ? 1200 : 400);
  }
  return { session: path.basename(fichier, '.jsonl').slice(0, 8), titre, debut, dernier: tours.at(-1)?.le || null, tours };
}

/**
 * Les sessions touchées depuis la date, dans le dépôt et ses ateliers (les
 * fichiers plus anciens ne sont pas ouverts), de la plus récente à la plus
 * ancienne.
 */
export async function sessionsDepuis(depuis, dossiers = dossiersClaude(), recent = depuis) {
  const depuisMs = Date.parse(depuis);
  const fichiers = [].concat(dossiers).filter((d) => d && fs.existsSync(d))
    .flatMap((d) => fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(d, f)))
    .filter((f) => fs.statSync(f).mtimeMs >= depuisMs);
  const out = [];
  for (const f of fichiers) {
    const s = await lireSession(f, depuis, recent);
    if (s.tours.length) out.push(s);
  }
  return out.sort((a, b) => String(b.dernier).localeCompare(String(a.dernier)));
}

/**
 * Pure : les sessions pour le modèle, sous un budget de caractères partagé
 * entre elles. Une session trop longue garde sa fin (là où elle s'est
 * arrêtée) et dit combien de demandes plus anciennes sont omises.
 */
export function sessionsSousBudget(sessions, budget = 110_000) {
  if (!sessions.length) return [];
  const part = Math.floor(budget / sessions.length);
  return sessions.map((s) => {
    const garde = [];
    let taille = 0;
    for (let i = s.tours.length - 1; i >= 0; i -= 1) {
      const t = JSON.stringify(s.tours[i]).length;
      if (garde.length && taille + t > part) break;
      garde.unshift(s.tours[i]);
      taille += t;
    }
    return { session: s.session, titre: s.titre, debut: s.debut, dernier: s.dernier, demandes: s.tours.length, omises: s.tours.length - garde.length, tours: garde };
  });
}

const SIGNES_RESTE = /pas encore fait|reste à faire|à trancher|à valider|à venir|en attente|à câbler|dormant|non confirmé|à faire/i;

/** Les mémoires : la description de chacune, et ses lignes qui disent ce qui reste. */
export function memoires(dossier = path.join(DOSSIER_CLAUDE, 'memory')) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => {
    const texte = fs.readFileSync(path.join(dossier, f), 'utf8');
    const description = (texte.match(/^description:\s*"?(.+?)"?\s*$/m) || [])[1] || '';
    const corps = texte.replace(/^---[\s\S]*?---/, '');
    const reste = corps.split(/(?<=[.!?])\s+|\n+/).filter((p) => SIGNES_RESTE.test(p)).map((p) => couper(p, 400)).slice(0, 6);
    return { memoire: f.replace(/\.md$/, ''), description: couper(description, 300), reste };
  });
}
