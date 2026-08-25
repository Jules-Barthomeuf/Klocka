// Synthèse documentaire d'un deal : « les points à regarder avant d'aller
// plus loin ».
//
// Le rédacteur croise les données STRUCTURÉES de l'extraction (champs
// {valeur, confiance, page} — jamais le texte des pages) avec la vue
// consolidée de l'annonce (vueRedacteur). Il signale les écarts
// annonce/documents, les échéances, les charges non refacturables, les
// travaux votés… Sans IA, un repli déterministe liste les champs douteux.

import { invokeLLM, llmEnabled } from '../llm.js';
import { vueRedacteur } from './redact.js';

const SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: '2 à 4 phrases : état du dossier documentaire.' },
    points_a_verifier: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          titre: { type: 'string' },
          detail: { type: 'string' },
          gravite: { type: 'string', enum: ['info', 'attention', 'bloquant'] },
        },
        required: ['titre', 'detail'],
      },
    },
  },
  required: ['resume', 'points_a_verifier'],
};

// Vue structurée d'un DossierDoc : champs et confiances, sans le texte source.
function vueDocuments(dossierDoc) {
  return (dossierDoc?.documents || []).map((d) => ({
    nom_fichier: d.nom_fichier,
    type: d.classement?.libelle || d.classement?.code || 'inconnu',
    confiance_type: d.classement?.confiance,
    incidents: (d.incidents || []).map((i) => `${i.libelle || i.champ}: ${i.motif}`),
    champs: Object.fromEntries(
      Object.entries(d.champs || {}).map(([k, v]) => [
        k,
        v?.absent ? { absent: true } : { valeur: v?.valeur, confiance: v?.confiance, page: v?.page },
      ])
    ),
  }));
}

// Repli sans IA : les champs absents ou à confiance basse, document par document.
function syntheseDeSecours(docs) {
  const points = [];
  for (const d of docs) {
    for (const [champ, v] of Object.entries(d.champs)) {
      if (v.absent) {
        points.push({ titre: `${d.type} — ${champ}`, detail: `Non trouvé dans ${d.nom_fichier}.`, gravite: 'attention' });
      } else if (v.confiance === 'basse') {
        points.push({ titre: `${d.type} — ${champ}`, detail: `Valeur « ${v.valeur} » extraite avec une confiance basse (p.${v.page}) : à vérifier dans ${d.nom_fichier}.`, gravite: 'attention' });
      }
    }
    for (const i of d.incidents) {
      points.push({ titre: `${d.type} — incident d'extraction`, detail: i, gravite: 'attention' });
    }
  }
  return {
    resume: `${docs.length} document(s) extrait(s). ${points.length ? `${points.length} point(s) à contrôler manuellement.` : 'Aucun point douteux détecté automatiquement.'}`,
    points_a_verifier: points,
  };
}

/**
 * @param {object} dossierLot  - { lot, enrichissement, evaluation } (annonce)
 * @param {object} dossierDoc  - l'enregistrement DossierDoc lié au deal
 * @returns {Promise<{resume, points_a_verifier, ia, genere_le}>}
 */
export async function syntheseDocuments(dossierLot, dossierDoc) {
  const docs = vueDocuments(dossierDoc);
  if (!docs.length) return null;

  if (!llmEnabled) {
    return { ...syntheseDeSecours(docs), ia: false, genere_le: new Date().toISOString() };
  }

  try {
    const r = await invokeLLM({
      prompt: `Tu es analyste chez Klocka (investissement en murs commerciaux). Les documents d'un deal ont été extraits automatiquement ; ton rôle est de dresser LA liste des points à regarder avant d'aller plus loin.

RÈGLES IMPÉRATIVES :
1. N'utilise QUE les données des deux JSON ci-dessous (annonce consolidée + champs extraits des documents). Tu n'as pas accès aux documents eux-mêmes — c'est voulu. N'invente rien.
2. Croise l'annonce et les documents : signale tout écart (loyer différent, surface différente, échéance de bail incohérente…), en citant les deux valeurs.
3. Signale les échéances proches, les charges non refacturables, le dépôt de garantie manquant, les travaux votés en AG, les diagnostics défavorables — quand les champs correspondants existent.
4. Chaque point est actionnable : ce qu'il faut vérifier, et dans quel document (nom du fichier).
5. gravite : "bloquant" si le point peut remettre en cause l'opération, "attention" à contrôler, "info" pour mémoire.
6. Les champs marqués absent:true ou confiance:"basse" méritent mention s'ils sont importants.
7. Français sobre, sans markdown.

--- ANNONCE CONSOLIDÉE ---
${JSON.stringify(vueRedacteur(dossierLot), null, 2)}
--- DOCUMENTS EXTRAITS ---
${JSON.stringify(docs, null, 2)}
--- FIN ---`,
      response_json_schema: SCHEMA,
    });
    if (!r?.resume) {
      return { ...syntheseDeSecours(docs), ia: false, genere_le: new Date().toISOString() };
    }
    return {
      resume: r.resume,
      points_a_verifier: Array.isArray(r.points_a_verifier) ? r.points_a_verifier : [],
      ia: true,
      genere_le: new Date().toISOString(),
    };
  } catch (e) {
    console.error('[preanalyse] synthèse documents impossible :', e?.message || e);
    return { ...syntheseDeSecours(docs), ia: false, genere_le: new Date().toISOString() };
  }
}
