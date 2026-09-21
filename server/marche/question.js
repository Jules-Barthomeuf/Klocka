// Poser une question au marché, et obtenir une réponse sourcée.
//
// « Quelle est la valeur locative moyenne à Lyon 2e ? » — le modèle ne répond
// pas de mémoire : il n'a le droit qu'aux outils, et chaque outil est un
// connecteur réel. Ce qu'il rend est accompagné de ce qui a été lu, avec le
// service, l'échelle, l'heure et le lien : on peut aller vérifier.
//
// La règle, écrite dans les consignes ET tenue par la structure : un chiffre
// qui n'est pas revenu d'un outil n'a pas le droit d'être écrit. Le modèle
// n'a aucune connaissance du marché immobilier français à offrir ici — il
// sait seulement appeler, lire et rapporter.

import { runAgent, llmEnabled } from '../llm.js';
import { registreParDefaut } from './chaine.js';

/** Les outils offerts au modèle : un par connecteur, plus l'adresse. */
const OUTILS = [
  {
    name: 'valeur_locative',
    description:
      "Le loyer commercial au m² par an autour d'une adresse. Interroge Equimmox (baux réellement signés dans un rayon de 500 m, à surface comparable), puis la valeur locative du secteur (Equimmox à l'échelle de la rue, du quartier et de la ville, et le loyer déduit des ventes DVF), et rend le tout pour comparaison. C'est l'outil à utiliser pour toute question de loyer commercial, de valeur locative ou de prix au m² d'un local.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: "l'adresse COMPLÈTE, telle qu'on l'écrirait sur une enveloppe : « 12 rue de la République, 69002 Lyon ». Recopie exactement l'adresse du dossier, ou exactement celle que l'utilisateur a écrite — ne compose JAMAIS une adresse en mélangeant les deux. Equimmox exige une rue : avec une ville seule, il échouera et seul le loyer déduit des ventes répondra." },
        surface: { type: 'number', description: 'la surface du local en m², si elle est connue ; 0 sinon. Elle resserre la recherche Equimmox à ±30 %.' },
      },
      required: ['adresse'],
    },
  },
  {
    name: 'cessions_de_fonds',
    description:
      "Les cessions de fonds de commerce autour d'une adresse : combien se sont vendues, à quel prix, pour quelles activités, à quelle distance. Source : BODACC, rayon 250 m, adresses géocodées. À utiliser pour toute question sur le prix d'un fonds, la vitalité commerciale d'une rue ou ce qui s'y est vendu.",
    input_schema: {
      type: 'object',
      properties: { adresse: { type: 'string', description: "l'adresse complète, recopiée du dossier ou de la question — jamais un mélange des deux" } },
      required: ['adresse'],
    },
  },
  {
    name: 'residentiel',
    description:
      "Le marché résidentiel d'un quartier et de sa commune : prix au m² (bas, médian, haut), évolution sur 1 an et 5 ans, loyer mensuel au m² avec sa fourchette. Source : Le Figaro Immobilier, pages publiques. À utiliser pour comparer le commerce au logement, ou pour toute question sur les prix de l'habitation.",
    input_schema: {
      type: 'object',
      properties: { adresse: { type: 'string', description: "l'adresse complète, recopiée du dossier ou de la question — jamais un mélange des deux" } },
      required: ['adresse'],
    },
  },
  {
    name: 'ventes_reelles',
    description:
      "Les ventes de locaux commerciaux RÉELLEMENT conclues autour d'une adresse : prix au m² (P25, médiane, P75), nombre de ventes, période, et le détail vente par vente avec adresse, surface, prix et distance. Source : DVF, les actes notariés transmis à la DGFiP, publiés par Etalab. C'est la seule source qui dise ce qui a été PAYÉ et non ce qui est demandé — à utiliser pour juger un prix de vente, contredire une valorisation faite au taux du vendeur, ou répondre à « combien se vendent les murs ici ». Gratuit, aucun crédit. Ne couvre ni l'Alsace-Moselle ni Mayotte.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: "l'adresse complète, recopiée du dossier ou de la question — jamais un mélange des deux" },
        rayon: { type: 'number', description: 'le rayon de recherche en mètres ; 500 par défaut. Élargir à 1000 quand il y a trop peu de ventes.' },
      },
      required: ['adresse'],
    },
  },
  {
    name: 'vitalite_rue',
    description:
      "Ce qui ouvre, se vend et ferme dans une rue : créations d'entreprises, cessions de fonds (avec leur prix quand il est publié), procédures collectives, radiations — sur les vingt-quatre derniers mois, avec le même décompte pour la commune entière en comparaison. Source : BODACC, la publication légale des greffes. À utiliser pour juger si une rue tient, si des commerces y ferment, ou ce qu'un fonds s'y est vendu. Gratuit, aucun crédit. Attention : le BODACC dit qu'un commerce a fermé, jamais si le local est resté vide — il ne donne pas de taux de vacance.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: "l'adresse complète, recopiée du dossier ou de la question — jamais un mélange des deux" },
        mois: { type: 'number', description: 'la profondeur d\'historique en mois ; 24 par défaut' },
      },
      required: ['adresse'],
    },
  },
  {
    name: 'emplacement',
    description:
      "L'étude d'implantation d'une adresse : flux piéton et flux voiture notés sur cinq, commerces du tronçon de rue numéro par numéro, démographie, revenu moyen, CSP+, propriétaires de la zone. Source : Data-B, module Expertise / ELM. ATTENTION : cette étude CONSOMME UN CRÉDIT Data-B et prend deux à trois minutes. Ne l'utiliser que si la question porte vraiment sur l'emplacement, le passage, les commerces voisins ou la population.",
    input_schema: {
      type: 'object',
      properties: {
        adresse: { type: 'string', description: "l'adresse précise, numéro compris" },
        activite: { type: 'string', description: "l'activité du commerce, si elle est connue ; chaîne vide sinon" },
      },
      required: ['adresse'],
    },
  },
];

const CONSIGNES = `Tu réponds à des questions de marché immobilier commercial pour l'équipe de Klocka, qui achète des murs de commerce.

RÈGLE ABSOLUE : tu n'as aucune connaissance propre du marché. Chaque chiffre que tu écris doit venir d'un appel d'outil que tu viens de faire, dans cette conversation. Si un outil échoue ou ne rend rien, tu le dis — tu n'estimes pas, tu n'extrapoles pas, tu ne complètes pas de mémoire. « Je n'ai pas pu l'obtenir » est une réponse acceptable ; un chiffre inventé ne l'est jamais.

Comment répondre :
- Appelle les outils dont tu as besoin, puis réponds en français, brièvement — trois à six lignes.
- Donne les chiffres avec leur unité et leur échelle : « 225 €/m²/an, moyenne des baux Equimmox dans un rayon de 500 m » et non « environ 225 ».
- Quand deux sources donnent des chiffres différents pour la même chose, dis-le et dis de combien : c'est souvent l'information la plus utile.
- Ne répète pas les liens ni les horodatages dans ton texte : ils sont affichés séparément sous ta réponse.
- Si la question ne porte pas sur le marché (ou si aucun outil ne peut y répondre), dis-le en une ligne.

L'outil « emplacement » consomme un crédit payant et prend plusieurs minutes : ne l'appelle que si la question porte réellement sur le passage, les commerces voisins ou la population.

« ventes_reelles » et « vitalite_rue » sont gratuits et rapides : n'hésite pas. Quand une question porte sur un PRIX de vente, appelle « ventes_reelles » — les autres sources ne parlent que de loyers et de demandes, et une valorisation calculée au taux affiché par le vendeur ne se vérifie qu'avec des ventes réelles.

L'ADRESSE : c'est l'erreur la plus coûteuse. Tu ne dois JAMAIS fabriquer une adresse en mélangeant un nom de rue tiré de la question avec la ville du dossier — le géocodage tombe alors sur une autre commune et tout ce qui suit est faux. Deux cas, deux seulement :
- l'utilisateur nomme un lieu → recopie-le tel quel ;
- il n'en nomme aucun → utilise l'adresse du dossier, telle qu'elle t'est donnée, sans la modifier.
En cas de doute, demande plutôt que de deviner.`;

/**
 * Répond à une question de marché en n'utilisant que les connecteurs.
 *
 * @param {string} question
 * @param {{adresse?: string, surface?: number, activite?: string, user?: object, historique?: Array}} contexte
 * @returns {Promise<{reponse: string, sources: Array, outils: Array}>}
 */
export async function repondre(question, contexte = {}) {
  // Rapidité : seules les sources qui répondent en quelques secondes. Equimmox
  // ouvre un vrai navigateur (une minute) et l'étude d'implantation coûte un
  // crédit — on ne les engage que si l'utilisateur a demandé « Réflexion ».
  const rapide = contexte.profondeur === 'rapide';
  const q = String(question || '').trim();
  if (!q) return { reponse: 'Posez une question.', sources: [], outils: [] };
  if (!llmEnabled) {
    return {
      reponse: "L'assistant n'est pas configuré : ajoutez ANTHROPIC_API_KEY ou GEMINI_API_KEY dans .env.",
      sources: [],
      outils: [],
    };
  }

  const connecteurs = await registreParDefaut();
  const { adresse: adresseDefaut = null, surface = null, activite = null, user = null } = contexte;
  const outilsOfferts = rapide ? OUTILS.filter((o) => o.name !== 'emplacement') : OUTILS;
  // Ce que les outils ont réellement rendu. C'est la seule source de vérité
  // de la réponse ; le texte du modèle n'en est que la lecture.
  const sources = [];
  const outils = [];

  const lire = async (cle, ctx) => {
    const connecteur = connecteurs[cle];
    const debut = Date.now();
    try {
      const brut = await connecteur.lire({ ...ctx, forcer: false, user });
      const valeurs = connecteur.normaliser(brut) || [];
      for (const v of valeurs) {
        if (!v) continue;
        sources.push({
          indicateur: v.cle,
          titre: v.titre,
          unite: v.unite,
          bas: v.bas,
          median: v.median,
          haut: v.haut,
          echelle: v.echelle,
          precision: v.precision,
          service: v.service,
          source: v.source,
          lien: v.lien,
          collecte_le: v.collecte_le,
          du_cache: v.du_cache,
        });
      }
      outils.push({ outil: cle, service: connecteur.service, ok: true, ms: Date.now() - debut, adresse: ctx.adresse });
      return { ok: true, service: connecteur.service, valeurs, brut: resume(cle, brut) };
    } catch (e) {
      outils.push({ outil: cle, service: connecteur.service, ok: false, ms: Date.now() - debut, adresse: ctx.adresse, erreur: e?.message || String(e) });
      return { ok: false, service: connecteur.service, erreur: e?.message || String(e) };
    }
  };

  const onTool = async ({ name, input }) => {
    const adresse = String(input?.adresse || adresseDefaut || '').trim();
    if (!adresse) return { erreur: "Aucune adresse : précisez la ville ou l'adresse du bien." };
    switch (name) {
      case 'valeur_locative': {
        // Les deux sources, toujours : c'est leur écart qui informe. En mode
        // rapide, Equimmox est écarté — une minute de navigateur pour une
        // question posée en passant, c'est trop.
        const s = Number(input?.surface) > 0 ? Number(input.surface) : surface || null;
        if (rapide) {
          const dataB = await lire('data-b-valeur-locative', { adresse });
          return { data_b: dataB, note: 'Mode Rapidité : Equimmox n’a pas été interrogé (une minute de lecture). Data-B estime ; pour une fourchette de baux réellement signés, repassez en Réflexion.' };
        }
        const [equimmox, dataB] = await Promise.all([
          lire('equimmox', { adresse, surface: s }),
          lire('valeur-locative', { adresse }),
        ]);
        return { equimmox, secteur: dataB, note: 'Equimmox à surface comparable, puis la rue, le quartier et la ville, et le loyer déduit des ventes DVF. Un écart entre ces lectures mérite d’être signalé.' };
      }
      case 'cessions_de_fonds':
        return lire('bodacc-cessions', { adresse, rayon: 250 });
      case 'residentiel':
        return lire('figaro', { adresse });
      case 'ventes_reelles':
        return lire('dvf', { adresse, rayon: Number(input?.rayon) > 0 ? Number(input.rayon) : 500 });
      case 'vitalite_rue':
        return lire('bodacc', { adresse, mois: Number(input?.mois) > 0 ? Number(input.mois) : 24 });
      case 'emplacement':
        if (rapide) return { erreur: 'Mode Rapidité : l’étude d’implantation coûte un crédit et prend trois minutes. Repassez en Réflexion pour la lancer.' };
        return lire('data-b-implantation', { adresse, activite: input?.activite || activite || null });
      default:
        return { erreur: `Outil inconnu : ${name}.` };
    }
  };

  const messages = [
    ...(contexte.historique || []).map((m) => ({ role: m.role, content: String(m.content || '') })),
    { role: 'user', content: adresseDefaut ? `${q}\n\n(Le dossier en cours porte sur : ${adresseDefaut}${surface ? `, ${surface} m²` : ''}${activite ? `, activité : ${activite}` : ''}.)` : q },
  ];

  const consignes = rapide
    ? `${CONSIGNES}\n\nMODE RAPIDITÉ : Equimmox et l'étude d'implantation ne sont pas disponibles pour cette question. Réponds avec ce que Data-B et Le Figaro donnent, et dis en une ligne ce qui manque de ce fait.`
    : CONSIGNES;
  const { text } = await runAgent({ system: consignes, messages, tools: outilsOfferts, onTool });
  return { reponse: text || 'Je n’ai pas de réponse.', sources, outils };
}

/** Ce qu'on donne au modèle d'un résultat brut : assez pour répondre, pas plus. */
function resume(cle, r) {
  if (!r) return null;
  switch (cle) {
    case 'equimmox':
      return { bas: r.bas, moyenne: r.moyenne, haut: r.haut, rayon: r.rayon, surface_min: r.surface_min, surface_max: r.surface_max, delai_jours: r.delai_jours };
    case 'valeur-locative':
      return { rue: r.rue, quartier: r.quartier, ville: r.ville };
    case 'bodacc-cessions':
      return { total: r.total, rayon: r.rayon, marche: r.marche, rue: r.rue, pertinentes: (r.pertinentes || []).slice(0, 8) };
    case 'figaro':
      return { quartier: r.quartier, commune: r.commune };
    case 'dvf':
      return { prix_m2: r.prix_m2, n: r.n, rayon: r.rayon, periode: r.periode, annees: r.annees, ecartees: r.ecartees, ventes: (r.ventes || []).slice(0, 12) };
    case 'bodacc':
      return { rue: r.rue, mois: r.mois, sur_la_rue: { ...r.sur_la_rue, evenements: (r.sur_la_rue?.evenements || []).slice(0, 15) }, commune_entiere: r.commune_entiere, cessions_avec_prix: r.cessions_avec_prix };
    case 'data-b-implantation':
      return {
        flux_pieton: r.flux_pieton, flux_voiture: r.flux_voiture, rue: r.rue, troncon: r.troncon,
        demographie: r.demographie, revenu: r.revenu, zone_primaire: r.zone_primaire,
        commerces_troncon: r.commerces_troncon?.total,
      };
    default:
      return r;
  }
}
