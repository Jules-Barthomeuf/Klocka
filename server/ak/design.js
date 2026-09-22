// « Redesign la page K-Zoning » : AK confie le travail à Claude Code, sur
// une copie du dépôt, et rend une branche.
//
// Le dépôt qui tourne n'est jamais touché : le travail se fait dans un
// worktree git à part, sur une branche ak/<sujet>, avec les mêmes garde-fous
// que l'équipe (lint, tests, build). La branche est poussée ; c'est un humain
// qui la relit et la fusionne. AK dit dans le chat ce qui a été fait et où.
//
// Il faut AK_DESIGN=true, la clé Anthropic, et un dépôt git avec un remote
// où pousser. Un projet dure de cinq à trente minutes.

import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execFile);
export const designActif = () => /^(1|true|oui|yes)$/i.test(process.env.AK_DESIGN || '');
const MAX_TOURS = Math.max(10, Number(process.env.AK_DESIGN_TOURS ?? 60));

const RACINE = process.cwd();
const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'projet';

const CONSIGNE = `Tu travailles sur le dépôt Klocka (plateforme interne d'un conseil en murs commerciaux : React + Vite + Tailwind côté client dans src/, Node/Express côté serveur dans server/). Lis CLAUDE.md d'abord et respecte-le. Fais exactement ce qui est demandé, proprement, dans le style du code existant (commentaires en français, pas d'emoji, pas de tiret cadratin). Ne touche pas au serveur si la demande porte sur une page. Avant de finir : \`npm run lint\` et \`npm run build\` doivent passer ; corrige ce que tu as cassé. Ne commit pas, ne push pas : c'est fait après toi. Termine par un résumé en cinq lignes maximum de ce que tu as changé, en français.`;

/**
 * Fait le projet et rend { branche, resume, fichiers, verifications }.
 * @param {string} demande ce que l'équipe a dit
 * @param {{journal?:Function}} [o]
 */
export async function realiser(demande, { journal = () => {} } = {}) {
  if (!designActif()) throw new Error("AK_DESIGN n'est pas activé sur ce serveur.");
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const nom = `ak/${slug(demande)}-${Date.now().toString(36).slice(-4)}`;
  const dossier = path.join(path.dirname(RACINE), `.klocka-ak-${slug(demande)}-${Date.now().toString(36)}`);

  journal(`worktree ${nom}`);
  await exec('git', ['fetch', 'origin', 'main'], { cwd: RACINE });
  await exec('git', ['worktree', 'add', '-b', nom, dossier, 'origin/main'], { cwd: RACINE });
  try {
    // Les dépendances du dépôt qui tourne servent : pas de réinstallation.
    if (!fs.existsSync(path.join(dossier, 'node_modules'))) fs.symlinkSync(path.join(RACINE, 'node_modules'), path.join(dossier, 'node_modules'), 'dir');
    if (fs.existsSync(path.join(RACINE, '.env')) && !fs.existsSync(path.join(dossier, '.env'))) fs.copyFileSync(path.join(RACINE, '.env'), path.join(dossier, '.env'));

    journal('Claude Code travaille…');
    let resume = '';
    let tours = 0;
    for await (const m of query({
      prompt: demande,
      options: {
        cwd: dossier,
        systemPrompt: { type: 'preset', preset: 'claude_code', append: CONSIGNE },
        allowedTools: ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash'],
        permissionMode: 'acceptEdits',
        maxTurns: MAX_TOURS,
        model: process.env.AK_DESIGN_MODELE || undefined,
      },
    })) {
      if (m.type === 'assistant') tours += 1;
      if (m.type === 'result') resume = m.result || m.subtype || '';
    }

    const verifications = {};
    for (const [cle, args] of [['lint', ['run', 'lint']], ['build', ['run', 'build']]]) {
      try { await exec('npm', args, { cwd: dossier, maxBuffer: 20 * 1024 * 1024 }); verifications[cle] = true; } catch (e) { verifications[cle] = String(e?.stdout || e?.message || '').slice(-400); }
    }
    const { stdout: statut } = await exec('git', ['status', '--porcelain'], { cwd: dossier });
    const fichiers = statut.split('\n').filter(Boolean).map((l) => l.slice(3)).filter((f) => f !== 'node_modules' && f !== '.env');
    if (!fichiers.length) return { branche: null, resume: resume || 'Rien n\'a été changé.', fichiers, verifications, tours };

    await exec('git', ['add', '-A', '--', ...fichiers], { cwd: dossier });
    const titre = `AK : ${demande.replace(/\s+/g, ' ').slice(0, 60)}`;
    await exec('git', ['commit', '-q', '-m', `${titre}\n\n${String(resume).slice(0, 1500)}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`], { cwd: dossier });
    let poussee = false;
    try { await exec('git', ['push', '-q', '-u', 'origin', nom], { cwd: dossier }); poussee = true; } catch (e) { journal(`push impossible : ${e?.message || e}`); }
    return { branche: nom, poussee, resume, fichiers, verifications, tours };
  } finally {
    try { await exec('git', ['worktree', 'remove', '--force', dossier], { cwd: RACINE }); } catch { /* le dossier reste, on le dira */ }
  }
}
