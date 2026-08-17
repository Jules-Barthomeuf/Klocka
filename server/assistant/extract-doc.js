// Extraction des champs d'un document, ancrée à la page.
//
// Chaque valeur relevée porte une citation littérale ET le numéro de page où
// elle figure. Le garde-fou vérifie les deux : une citation introuvable fait
// tomber la valeur, et une citation trouvée sur une autre page voit sa page
// corrigée plutôt que d'envoyer l'utilisateur au mauvais endroit.

import { invokeLLM, llmEnabled } from '../llm.js';

function normaliser(str) {
  return String(str ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[    ]/g, ' ')
    .replace(/[''`´]/g, "'")
    .replace(/[""«»]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Page où figure littéralement la citation, sinon null. */
export function trouverPage(citation, pages) {
  const c = normaliser(citation);
  if (!c || c.length < 4) return null;
  for (const p of pages) {
    if (normaliser(p.texte).includes(c)) return p.page;
  }
  return null;
}

function schemaPour(type) {
  const props = {};
  for (const champ of type.champs) {
    props[champ.id] = {
      type: 'object',
      properties: {
        valeur: { type: 'string', description: champ.format || '' },
        citation: { type: 'string', description: 'Extrait littéral du document contenant cette information' },
        page: { type: 'number', description: 'Numéro de page où figure la citation' },
        confiance: { type: 'string', enum: ['haute', 'moyenne', 'basse'] },
        absent: { type: 'boolean' },
      },
    };
  }
  return { type: 'object', properties: props };
}

function consignes(type) {
  return `Tu dépouilles un ${type.libelle} pour une société d'investissement en murs commerciaux.

TU NE CALCULES RIEN QUI NE SOIT DEMANDÉ. TU N'INTERPRÈTES PAS. Tu relèves ce qui est écrit.

Chaque champ est un objet à cinq attributs :
- "valeur"    : l'information, mise au format demandé pour ce champ
- "citation"  : un extrait LITTÉRAL du document, copié caractère pour caractère, contenant cette information
- "page"      : le numéro de la page où figure cette citation (les pages sont balisées ===PAGE n===)
- "confiance" : "haute", "moyenne" ou "basse"
- "absent"    : true si l'information ne figure pas dans le document

RÈGLES IMPÉRATIVES :
1. Ne jamais inventer. Une information absente donne {"valeur": null, "citation": null, "page": null, "confiance": null, "absent": true}.
2. "citation" doit exister telle quelle dans le document. Ne la reformule pas, ne la complète pas. Si tu ne peux pas citer, le champ est absent.
3. "page" doit être le numéro réellement porté par le marqueur ===PAGE n=== du passage cité.
4. Respecte scrupuleusement le format indiqué pour chaque champ.
5. Quand un champ demande une reprise littérale (destination, activités, conditions de cession), recopie le texte du document plutôt que de le résumer.
6. Français. Aucun champ hors du schéma.

CHAMPS À RELEVER :
${type.champs
  .map(
    (c) =>
      `- ${c.id} (${c.libelle})\n    Où : ${c.ou || '—'}\n    Format attendu : ${c.format || '—'}${
        c.remarque ? `\n    À signaler : ${c.remarque}` : ''
      }`
  )
  .join('\n')}`;
}

const champAbsent = () => ({ valeur: null, citation: null, page: null, confiance: null, absent: true });

/**
 * @param {object} type - entrée du référentiel
 * @param {{page:number,texte:string}[]} pages
 * @returns {Promise<{champs:object, incidents:object[], ia:boolean}>}
 */
export async function extraireDocument(type, pages) {
  const vide = {};
  for (const c of type.champs) vide[c.id] = champAbsent();

  if (!llmEnabled) {
    return { champs: vide, incidents: [{ champ: '*', motif: 'ia_non_configuree' }], ia: false };
  }

  const corpus = pages.map((p) => `===PAGE ${p.page}===\n${p.texte}`).join('\n\n');

  // L'IA peut être momentanément indisponible (quota du palier gratuit, panne).
  // Le document est alors conservé tel quel — pages comprises — avec un
  // incident dédié : « Redépouiller » relancera l'extraction sans nouveau
  // téléversement, une fois le quota revenu.
  let brut;
  try {
    brut = await invokeLLM({
      prompt: `${consignes(type)}\n\n--- DOCUMENT ---\n${corpus}\n--- FIN DU DOCUMENT ---`,
      response_json_schema: schemaPour(type),
    });
  } catch (e) {
    console.error('[alexis] extraction impossible (IA indisponible) :', e?.message || e);
    return {
      champs: vide,
      incidents: [{ champ: '*', motif: 'ia_indisponible', detail: String(e?.message || e).slice(0, 200) }],
      ia: false,
    };
  }

  const champs = {};
  const incidents = [];

  for (const c of type.champs) {
    const v = brut?.[c.id];
    if (!v || typeof v !== 'object' || v.absent === true || v.valeur == null || v.valeur === '') {
      champs[c.id] = champAbsent();
      continue;
    }

    const pageReelle = trouverPage(v.citation, pages);
    if (pageReelle === null) {
      // Citation introuvable : la valeur ne peut pas être adossée au document.
      incidents.push({
        champ: c.id,
        libelle: c.libelle,
        motif: v.citation ? 'citation_introuvable' : 'citation_absente',
        citation: v.citation ?? null,
        valeur_rejetee: v.valeur,
      });
      champs[c.id] = champAbsent();
      continue;
    }

    const pageAnnoncee = Number(v.page) || null;
    if (pageAnnoncee && pageAnnoncee !== pageReelle) {
      incidents.push({
        champ: c.id,
        libelle: c.libelle,
        motif: 'page_corrigee',
        page_annoncee: pageAnnoncee,
        page_reelle: pageReelle,
      });
    }

    champs[c.id] = {
      valeur: String(v.valeur),
      citation: v.citation,
      page: pageReelle, // toujours la page vérifiée
      confiance: ['haute', 'moyenne', 'basse'].includes(v.confiance) ? v.confiance : 'moyenne',
      absent: false,
    };
  }

  if (incidents.length) {
    console.warn(
      `[alexis] ${type.code} : ${incidents.length} incident(s) — ` +
        incidents.map((i) => `${i.champ}(${i.motif})`).join(', ')
    );
  }

  return { champs, incidents, ia: true };
}
