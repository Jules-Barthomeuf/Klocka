// L'agent testeur : le critique. Il n'a pas exploré ; il ne voit que les
// captures et ce qu'on a mesuré, et juge l'interface avec la grille du
// système de design de Klocka. Par lots de quatre images, en JSON.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chatDocuments } from '../llm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Les règles du design system, résumées pour le critique (lues dans docs/design-system.md si présent). */
export function grilleDesign() {
  try {
    const t = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'design-system.md'), 'utf8');
    const debut = t.indexOf('## 1.');
    return t.slice(debut > 0 ? debut : 0, 9000);
  } catch { return "Sobre, sombre par défaut avec un thème clair, un accent menthe, sept tailles de texte, listes en lignes, pilules pour les onglets et boutons, un seul bouton principal par zone, phrases courtes en français, pas de jargon."; }
}

const SYSTEME = `Tu es un critique UX et UI exigeant, qui relit les écrans d'une application métier (Klocka, immobilier commercial). Tu n'as pas participé aux tests : tu juges ce que montrent les captures. Tu cherches ce qui gêne quelqu'un qui travaille là-dedans toute la journée : hiérarchie illisible, trop ou pas assez d'information, mots vagues, incohérences entre écrans, états vides muets, boutons concurrents, textes coupés, zones mortes, contrastes faibles, téléphone cassé. Tu ne commentes jamais le goût ; tu dis ce qui coûte un effort ou induit en erreur, et ce qu'on ferait à la place. Tu réponds en JSON strict, sans commentaire.`;

/**
 * Juge un lot de captures. Rend des constats { gravite, famille, quoi, ou, pourquoi, proposition, capture }.
 * `invoquer` se remplace dans les tests.
 */
export async function critiquer({ captures, pageNom, grille = grilleDesign(), invoquer = chatDocuments, journal = () => {} }) {
  const constats = [];
  const lots = [];
  for (let i = 0; i < Math.min(captures.length, 24); i += 4) lots.push(captures.slice(i, i + 4));
  for (const lot of lots) {
    const documents = lot.filter((c) => c.chemin && fs.existsSync(c.chemin)).map((c) => ({ nom: c.fichier, mimetype: 'image/png', buffer: fs.readFileSync(c.chemin) }));
    if (!documents.length) continue;
    const contenu = `Page « ${pageNom} ». ${documents.length} capture(s) : ${lot.map((c) => `${c.fichier} (${c.vue}, thème ${c.theme}${c.pensee ? `, après : ${c.pensee.slice(0, 60)}` : ''})`).join(' ; ')}.

Les règles de l'interface de Klocka, à faire respecter :
${grille}

Pour chaque capture, relève ce qui gêne, ce qui manque, ce qui est incohérent. Sois précis : nomme l'élément et sa place. Ne signale pas deux fois la même chose. Pas plus de six constats par capture, les plus utiles d'abord. Dis aussi, en une ligne, ce qui est réussi.

JSON : { "constats": [ { "capture": "<fichier>", "gravite": "bloquant" | "genant" | "detail", "famille": "ux" | "ui" | "texte" | "accessibilite" | "coherence", "quoi": "le problème, une phrase", "ou": "l'élément et sa place", "pourquoi": "ce que ça coûte à l'utilisateur", "proposition": "ce qu'on fait à la place, concret" } ], "reussi": [ "..." ] }`;
    try {
      const texte = await invoquer({ system: SYSTEME, messages: [{ role: 'user', contenu }], documents, profondeur: 'rapide' });
      const m = String(texte || '').match(/\{[\s\S]*\}/);
      const j = m ? JSON.parse(m[0]) : null;
      for (const c of j?.constats || []) if (c?.quoi) constats.push({ ...c, source: 'critique' });
      for (const r of j?.reussi || []) constats.push({ reussi: String(r), source: 'critique' });
    } catch (e) {
      journal(`Le critique n'a pas répondu sur un lot : ${e?.message || e}`);
    }
  }
  return constats;
}
