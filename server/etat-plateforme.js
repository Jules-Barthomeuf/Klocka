// L'état de la plateforme, en une page, pour qu'on ne reparte pas de zéro.
//
// Les chiffres d'usage et de dépense vivent dans la base : qui ouvre quoi,
// ce que l'IA a coûté, par geste. Ils sont consultables sur les écrans Suivi
// et Coûts IA, mais un écran ne se lit qu'à l'écran — une session de travail
// qui s'ouvre, elle, ne sait rien de tout cela et redemande ce qu'on lui a
// déjà dit.
//
// Ce module écrit ces mêmes chiffres dans docs/etat-plateforme.md, un fichier
// court que CLAUDE.md désigne. Une session — la vôtre, ou le chantier de
// server/atelier.js — le lit en entrant et connaît l'usage réel : quelles
// pages comptent, qui travaille, ce qui coûte, ce qui attend une décision.
//
// Régénéré au démarrage du serveur puis une fois par jour, et à la main :
//     npm run etat            (30 jours)
//     npm run etat -- 90      (90 jours)
//
// Le fichier est écrit seulement là où le code est suivi par git : sur un
// serveur de production, il n'y a rien à tenir à jour.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthese } from './journal-usage.js';
import { coutsParAction, euros, syntheseCouts } from './llm-couts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.resolve(__dirname, '..');
export const CHEMIN = path.join(RACINE, 'docs', 'etat-plateforme.md');

const jour = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '—');
const nombre = (n) => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
const duree = (ms) => (!ms ? '—' : ms < 60000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60000)} min`);

/**
 * Ce que la plateforme a vécu sur la fenêtre : l'usage, la dépense, et les
 * leviers qui attendent.
 * @param {number} jours
 */
export function etatPlateforme(jours = 30) {
  const usage = synthese(jours);
  const couts = syntheseCouts(jours, { limite: 1 });
  const gestes = coutsParAction(jours);
  return { jours, le: new Date().toISOString(), usage, couts, gestes };
}

/** Le digest, en markdown : court, daté, et sans rien qu'on ne puisse vérifier. */
export function enMarkdown(etat) {
  const { jours, usage, couts, gestes } = etat;
  const l = [];

  l.push('# État de la plateforme');
  l.push('');
  l.push(`Écrit le ${jour(etat.le)} par \`npm run etat\`, sur les ${jours} derniers jours. Ne le modifiez pas à la main : il est réécrit.`);
  l.push('');
  l.push("Ce fichier existe pour qu'une session de travail connaisse l'usage réel avant de proposer quoi que ce soit. Les écrans Suivi et Coûts IA disent la même chose, en plus détaillé.");
  l.push('');

  l.push('## Qui travaille');
  l.push('');
  l.push(`${usage.totaux.personnes} personnes, ${nombre(usage.totaux.visites)} pages ouvertes, ${nombre(usage.totaux.requetes)} demandes à l'assistant, ${nombre(usage.totaux.actions)} actions exécutées.`);
  l.push('');
  l.push('| Personne | Pages | IA | Actions | Vu le |');
  l.push('| --- | ---: | ---: | ---: | --- |');
  for (const p of usage.personnes.slice(0, 12)) {
    l.push(`| ${p.email}${p.role === 'admin' ? ' (équipe)' : ''} | ${nombre(p.visites)} | ${p.requetes} | ${p.actions} | ${jour(p.derniere)} |`);
  }
  l.push('');

  l.push('## Les pages qui comptent');
  l.push('');
  l.push("L'ordre est celui de l'usage, pas celui du menu. Une page en tête mérite le soin qu'on donne à ce qui sert tous les jours ; une page absente de cette liste n'est pas ouverte.");
  l.push('');
  const total = usage.pages.reduce((n, p) => n + p.visites, 0) || 1;
  for (const p of usage.pages.slice(0, 12)) {
    l.push(`- **${p.page}** — ${nombre(p.visites)} (${Math.round((p.visites / total) * 100)} %)`);
  }
  const jamais = usage.pages.length > 12 ? usage.pages.slice(12).map((p) => p.page) : [];
  if (jamais.length) l.push(`- Le reste, sous ${Math.round((usage.pages[12].visites / total) * 100) || 1} % : ${jamais.join(', ')}`);
  l.push('');

  l.push("## Ce que l'IA coûte");
  l.push('');
  l.push(`${euros(couts.total.cout)} sur la période, ${nombre(couts.total.appels)} appels, ${nombre((couts.total.entree + couts.total.sortie) / 1000)} k jetons. ${Math.round(gestes.part_fond * 100)} % part en tâche de fond, sans que personne clique. ${Math.round(gestes.part_cache * 100)} % des jetons d'entrée sont servis par le cache, à un dixième du prix.`);
  l.push('');
  l.push('| Geste | Prix courant | Volume | Total | Durée |');
  l.push('| --- | ---: | ---: | ---: | ---: |');
  for (const a of gestes.actions.slice(0, 12)) {
    l.push(`| ${a.libelle}${a.fond ? ' (fond)' : ''} | ${euros(a.mediane)} ${a.unite} | ${nombre(a.unites)} | ${euros(a.cout)} | ${duree(a.duree_moyenne_ms)} |`);
  }
  l.push('');
  l.push('Le prix courant est la médiane : un dossier hors norme ne doit pas fausser ce qu\'on paie d\'habitude.');
  l.push('');
  if (gestes.non_classees.length) {
    l.push(`Pas encore rangé dans un geste, à classer dans \`server/llm-couts.js\` : ${gestes.non_classees.slice(0, 6).map((o) => `${o.operation} (${euros(o.cout)})`).join(' · ')}.`);
    l.push('');
  }

  const attente = (gestes.leviers || []).filter((x) => x.etat !== 'pose');
  const poses = (gestes.leviers || []).filter((x) => x.etat === 'pose');
  l.push('## Les leviers sur la dépense');
  l.push('');
  if (attente.length) {
    l.push("Ce qui attend une décision de Jules. Ne les reproposez pas comme des idées neuves : ils sont mesurés, ils attendent un arbitrage.");
    l.push('');
    for (const x of attente) {
      l.push(`- **${x.titre}** (${x.etat === 'regler' ? 'un réglage' : 'une décision'}) — ${x.effet}. ${x.texte} \`${x.ou}\``);
    }
    l.push('');
  }
  if (poses.length) {
    l.push(`Déjà en place, à ne pas défaire : ${poses.map((x) => x.titre.toLowerCase()).join(' · ')}.`);
    l.push('');
  }

  l.push('## Ce qu\'il faut en retenir');
  l.push('');
  const dominante = usage.pages[0];
  const cher = gestes.actions.find((a) => !a.fond);
  l.push(`- L'écran de travail, c'est **${dominante?.page || 'Analyse'}** : ${Math.round(((dominante?.visites || 0) / total) * 100)} % des pages ouvertes. Une régression y coûte plus cher qu'ailleurs.`);
  if (cher) l.push(`- Le geste le plus cher est « ${cher.libelle.toLowerCase()} » à ${euros(cher.mediane)} ${cher.unite} : tout ce qui évite de le refaire vaut mieux qu'une optimisation de jetons.`);
  l.push(`- ${Math.round(gestes.part_fond * 100)} % de la dépense part sans personne devant l'écran : la veille et les tâches de fond se règlent, elles ne se surveillent pas.`);
  l.push('');

  return l.join('\n');
}

/** Écrit le digest, et renvoie son chemin. Ne fait rien hors d'un dépôt git. */
export function ecrireEtat(jours = 30) {
  if (!fs.existsSync(path.join(RACINE, '.git'))) return null;
  const texte = enMarkdown(etatPlateforme(jours));
  fs.mkdirSync(path.dirname(CHEMIN), { recursive: true });
  fs.writeFileSync(CHEMIN, `${texte}\n`);
  return CHEMIN;
}

/**
 * Au démarrage, puis une fois par jour. Le fichier reste ainsi à moins d'un
 * jour de la vérité, sans que personne y pense.
 */
export function tenirAJour(jours = 30) {
  const ecrire = () => {
    try {
      const ou = ecrireEtat(jours);
      if (ou) console.log(`[état] ${path.relative(RACINE, ou)} à jour`);
    } catch (e) {
      console.error('[état] écriture impossible :', e.message);
    }
  };
  ecrire();
  const minuteur = setInterval(ecrire, 24 * 3600 * 1000);
  minuteur.unref?.();
  return minuteur;
}

// Appelé en ligne de commande : `node server/etat-plateforme.js [jours]`.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const jours = Number(process.argv[2]) || 30;
  const ou = ecrireEtat(jours);
  console.log(ou ? `Écrit dans ${path.relative(RACINE, ou)} (${jours} jours).` : 'Rien écrit : ce dossier n’est pas un dépôt git.');
}
