import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Sparkles } from "lucide-react";
import { trouverVille, trouverSecteur } from "@/data/villes";

// Analyse IA de la page projet : avis de synthèse + chiffres clés et points
// marquants pour la ville et le secteur. Un SEUL appel LLM couvre les trois
// blocs (le quota Gemini est partagé), le résultat est mis en cache 30 jours
// par projet dans le navigateur.
const CACHE_PREFIX = "projet_analyse_ia_v2_";
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SCHEMA = {
  type: "object",
  properties: {
    avis_projet: {
      type: "string",
      description: "2 à 3 phrases : ce qui rend ce projet intéressant pour un investisseur en murs commerciaux, et le point de vigilance principal.",
    },
    avis_onglets: {
      type: "object",
      description: "Un avis court et DIFFÉRENT par onglet du dossier : chacun ne parle que de son sujet.",
      properties: {
        secteur: { type: "string", description: "2 phrases sur l'emplacement : ville, quartier, commercialité de la rue." },
        marche: { type: "string", description: "2 phrases sur le positionnement du prix et du loyer face au marché local, et la réversion éventuelle." },
        bien: { type: "string", description: "2 phrases sur le local lui-même : surface, configuration, état, conformité, potentiel de reconversion." },
        locataire: { type: "string", description: "2 phrases sur la signature : ancienneté, activité, solidité financière, garanties." },
        bail: { type: "string", description: "2 phrases sur l'économie du bail : durée restante, indexation, charges, clauses à surveiller." },
        copropriete: { type: "string", description: "2 phrases sur la copropriété : charges, quote-part, travaux votés ou à prévoir, règlement." },
        diagnostique: { type: "string", description: "2 phrases sur les diagnostics : classe énergétique, risques identifiés, coûts induits." },
        documents_projet: { type: "string", description: "2 phrases sur les pièces du dossier : ce qui est disponible, ce qu'il reste à obtenir avant l'offre." },
      },
    },
    ville: {
      type: "object",
      properties: {
        nom: { type: "string" },
        chiffres: {
          type: "array",
          description: "4 à 5 chiffres clés réels et vérifiables (population, évolution, revenu médian, taux de chômage, prix médian au m², touristes/an...).",
          items: {
            type: "object",
            properties: {
              valeur: { type: "string", description: "Chiffre formaté, ex. '873 000' ou '+2,4 %'" },
              label: { type: "string", description: "Libellé court, ex. 'Habitants'" },
            },
          },
        },
        points: {
          type: "array",
          description: "3 à 5 points courts (une phrase chacun) utiles à un investisseur : dynamique économique, projets urbains, démographie, tension locative.",
          items: { type: "string" },
        },
      },
    },
    secteur: {
      type: "object",
      properties: {
        nom: { type: "string", description: "Nom de la rue, du quartier ou de l'axe commercial" },
        chiffres: {
          type: "array",
          description: "3 à 5 chiffres clés du micro-secteur (flux piéton, loyers commerciaux €/m²/an, prix des murs €/m², taux de vacance commerciale, desserte).",
          items: {
            type: "object",
            properties: {
              valeur: { type: "string" },
              label: { type: "string" },
            },
          },
        },
        points: {
          type: "array",
          description: "3 à 5 points courts sur l'emplacement : commercialité, enseignes présentes, accessibilité, clientèle, projets à proximité.",
          items: { type: "string" },
        },
      },
    },
  },
};

function buildPrompt(project, villeData, secteurData) {
  const ctx = [
    project.titre && `Projet : ${project.titre}`,
    project.adresse_complete && `Adresse : ${project.adresse_complete}`,
    project.activite_locataire && `Activité exploitée : ${project.activite_locataire}`,
    project.surface_m2 > 0 && `Surface : ${project.surface_m2} m²`,
    (project.sim_loyer_initial_ht || project.loyer_annuel_ht) > 0 &&
      `Loyer annuel HT/HC : ${(project.sim_loyer_initial_ht || project.loyer_annuel_ht).toLocaleString("fr-FR")} €`,
    project.sim_prix_bien_negocie > 0 && `Prix négocié : ${project.sim_prix_bien_negocie.toLocaleString("fr-FR")} €`,
    project.marche_quartier_nom && `Quartier renseigné : ${project.marche_quartier_nom}`,
    villeData && `Contexte ville connu : ${villeData.nom} — ${villeData.points.slice(0, 3).join(" ")}`,
    secteurData && `Contexte secteur connu : ${secteurData.nom} — ${secteurData.points.slice(0, 2).join(" ")}`,
  ]
    .filter(Boolean)
    .join("\n");

  const onglets = `avis_onglets : un avis DISTINCT pour chacun des huit onglets (secteur, marche, bien, locataire, bail, copropriete, diagnostique, documents_projet). Chaque avis fait deux phrases et ne traite QUE son sujet — aucune redite d'un onglet à l'autre, aucun résumé général. Si une information manque au dossier pour un onglet, dis précisément ce qu'il faut obtenir avant de se décider.`;

  const attendus = villeData
    ? `1. avis_projet : 2 à 3 phrases sur l'intérêt de ce projet précis (emplacement, activité du locataire, rendement, liquidité à la revente), en terminant par le principal point de vigilance.
2. ${onglets}`
    : `1. avis_projet : 2 à 3 phrases sur l'intérêt de ce projet précis, en terminant par le principal point de vigilance.
2. ${onglets}
3. ville : les chiffres clés réels de la commune (données INSEE les plus récentes que tu connais) et les points marquants pour un investisseur.
4. secteur : les chiffres et points propres à la rue / au micro-quartier de l'adresse (commercialité, flux, loyers commerciaux, desserte).`;

  return `Tu es analyste en immobilier commercial (murs de boutique) chez Klocka. Tu rédiges pour un investisseur particulier.

${ctx}

Produis une analyse factuelle et vérifiable en français :
${attendus}

Règles : chiffres réels uniquement, jamais inventés ; si une donnée est incertaine, ne la mets pas. Phrases courtes, sans superlatif marketing, sans conseil d'achat explicite.`;
}

export function useAnalyseIA(project) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const projectId = project?.id;
  const adresse = project?.adresse_complete;
  const cacheKey = CACHE_PREFIX + projectId;

  // Le dataset local sert en premier : affichage immédiat, sans appel réseau.
  const villeData = useMemo(() => trouverVille(adresse), [adresse]);
  const secteurData = useMemo(() => trouverSecteur(villeData, adresse), [villeData, adresse]);

  const fetchAnalyse = useCallback(async () => {
    if (!adresse) return;
    setLoading(true);
    setError(null);
    try {
      // Quand la ville est déjà couverte par le dataset, l'IA ne rédige plus
      // que l'avis : la réponse est courte, donc rapide.
      const schema = villeData
        ? { type: "object", properties: { avis_projet: SCHEMA.properties.avis_projet, avis_onglets: SCHEMA.properties.avis_onglets } }
        : SCHEMA;
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: buildPrompt(project, villeData, secteurData),
        response_json_schema: schema,
      });
      if (result && typeof result === "object" && (result.ville || result.secteur || result.avis_projet)) {
        setData(result);
        try {
          localStorage.setItem(cacheKey, JSON.stringify({ data: result, timestamp: Date.now() }));
        } catch {
          /* quota de stockage plein : on garde l'analyse en mémoire */
        }
      } else {
        setError("Analyse indisponible pour le moment.");
      }
    } catch {
      setError("Analyse indisponible pour le moment.");
    }
    setLoading(false);
  }, [project, adresse, cacheKey]);

  useEffect(() => {
    if (!projectId || !adresse) return;
    try {
      const cached = JSON.parse(localStorage.getItem(cacheKey) || "null");
      if (cached?.data && Date.now() - cached.timestamp < TTL_MS) {
        setData(cached.data);
        return;
      }
    } catch {
      /* cache illisible : on relance l'analyse */
    }
    fetchAnalyse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, adresse]);

  return { analyse: data, villeData, secteurData, loading, error, refresh: fetchAnalyse };
}

function SkeletonLine({ w = "100%" }) {
  return <div className="h-3 bg-[#f2f3f5]/[0.07] animate-pulse" style={{ width: w }} />;
}

const TITRES_ONGLETS = {
  secteur: "Secteur",
  marche: "Marché",
  bien: "Le bien",
  locataire: "Locataire",
  bail: "Bail",
  copropriete: "Copropriété",
  diagnostique: "Diagnostics",
  documents_projet: "Documents",
};

// Avis de l'IA. `section` sélectionne l'avis propre à l'onglet affiché ; sans
// section (ou sans avis dédié), c'est l'avis général du projet qui s'affiche.
// En `vertical`, c'est le rail latéral qui suit le scroll.
export function AvisProjetIA({ analyse, loading, error, vertical = false, section }) {
  const texte = (section && analyse?.avis_onglets?.[section]) || analyse?.avis_projet;
  const sousTitre = section && analyse?.avis_onglets?.[section] ? TITRES_ONGLETS[section] : null;

  if (error && !analyse) return null;
  if (!loading && !texte) return null;

  const corps = loading && !analyse ? (
    <div className="space-y-2">
      <SkeletonLine />
      <SkeletonLine w="88%" />
      <SkeletonLine w="72%" />
    </div>
  ) : (
    <p className={`${vertical ? "text-[13.5px]" : "text-[14.5px] max-md:text-[13.5px]"} leading-[1.75] text-[#c9cdd6] mb-0`}>{texte}</p>
  );

  if (vertical) {
    return (
      <div className="border-l-2 border-[#96c0b8] pl-5 py-1">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#c3ddd6]" />
          <span className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6]">Analyse Klocka</span>
        </div>
        {sousTitre && <div className="text-[10px] tracking-[0.18em] uppercase text-[#9298a6] mb-3">{sousTitre}</div>}
        <div className={vertical ? "transition-opacity duration-300" : ""} key={section || "general"}>{corps}</div>
      </div>
    );
  }

  return (
    <div className="border border-[#96c0b8]/40 bg-[#96c0b8]/[0.05] px-6 py-5 max-md:px-4 max-md:py-4 mb-8 max-md:mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-[#c3ddd6]" />
        <span className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6]">Analyse Klocka</span>
        {sousTitre && <span className="text-[10px] tracking-[0.18em] uppercase text-[#9298a6]">· {sousTitre}</span>}
      </div>
      {corps}
    </div>
  );
}

// Pastille « i » : comment lire le chiffre. Ouvre au survol et au clic, pour
// rester utilisable sur mobile où il n'y a pas de survol.
function InfoDot({ texte }) {
  const [open, setOpen] = useState(false);
  if (!texte) return null;
  return (
    <span className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label="Comment lire ce chiffre"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        className={`w-[15px] h-[15px] rounded-full border text-[9px] leading-none flex items-center justify-center transition-colors
          ${open ? "border-[#c3ddd6] text-[#c3ddd6]" : "border-[#f2f3f5]/25 text-[#9298a6] hover:border-[#c3ddd6] hover:text-[#c3ddd6]"}`}
      >
        i
      </button>
      {open && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+8px)] z-30 w-64 max-md:w-52 bg-[#0f1114] border border-[#22262d] px-3.5 py-3 text-[12px] leading-[1.6] text-[#c9cdd6] text-left normal-case tracking-normal shadow-xl">
          {texte}
        </span>
      )}
    </span>
  );
}

function ChiffresStrip({ chiffres }) {
  const list = (chiffres || []).filter((c) => c && c.valeur);
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap border-t border-[#f2f3f5]/[0.35] mb-5">
      {list.map((c, i) => (
        <div key={i} className={`flex-1 min-w-[130px] max-md:min-w-[46%] py-4 max-md:py-3 pr-5 ${i > 0 ? "md:border-l md:border-[#f2f3f5]/[0.12] md:pl-5" : ""}`}>
          <div className="text-[22px] max-md:text-[18px] font-light text-[#f2f3f5]" style={{ fontVariantNumeric: "tabular-nums" }}>{c.valeur}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[11px] text-[#9298a6]">{c.label}</span>
            <InfoDot texte={c.info} />
          </div>
        </div>
      ))}
    </div>
  );
}

function PointsList({ points }) {
  const list = (points || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="md:columns-2 md:gap-10 space-y-2.5 list-none pl-0 mb-0">
      {list.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-[14px] leading-[1.7] text-[#c9cdd6] break-inside-avoid">
          <span className="text-[#96c0b8] flex-shrink-0 mt-[7px] w-1 h-1 rounded-full bg-[#96c0b8]" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Bloc({ label, nom, chiffres, points, loading, fallback }) {
  const hasIA = (chiffres && chiffres.length) || (points && points.length);
  if (!loading && !hasIA && !fallback) return null;
  return (
    <div className="mb-8 max-md:mb-6 last:mb-0">
      <div className="text-[10px] tracking-[0.2em] uppercase text-[#9298a6] mb-3">
        {label}{nom ? ` — ${nom}` : ""}
      </div>
      {loading && !hasIA ? (
        <div className="space-y-2.5">
          <SkeletonLine w="60%" />
          <SkeletonLine />
          <SkeletonLine w="88%" />
        </div>
      ) : hasIA ? (
        <>
          <ChiffresStrip chiffres={chiffres} />
          <PointsList points={points} />
        </>
      ) : (
        <p className="text-[14px] leading-[1.8] text-[#c9cdd6] text-justify whitespace-pre-wrap mb-0">{fallback}</p>
      )}
    </div>
  );
}

// Blocs « La ville » et « Le secteur » alimentés par l'IA, avec repli sur les
// descriptions saisies par l'administrateur si l'analyse échoue.
export default function VilleSecteurIA({ analyse, villeData, secteurData, loading, error, refresh, project, isPublic }) {
  // Dataset d'abord (instantané), IA ensuite si la ville n'est pas couverte.
  const ville = villeData || analyse?.ville;
  const secteur = secteurData || analyse?.secteur;
  const attenteIA = loading && !villeData;
  const rien = !loading && !ville && !secteur && !project.description_ville && !project.description_secteur;

  if (rien) {
    return <p className="text-[#9298a6] text-sm mb-0">Aucune donnée disponible pour ce secteur.</p>;
  }

  return (
    <div>
      <Bloc
        label="La ville"
        nom={ville?.nom}
        chiffres={ville?.chiffres}
        points={ville?.points}
        loading={attenteIA}
        fallback={project.description_ville}
      />
      <Bloc
        label="Le secteur"
        nom={secteur?.nom || project.marche_quartier_nom}
        chiffres={secteur?.chiffres}
        points={secteur?.points}
        loading={attenteIA}
        fallback={project.description_secteur}
      />
      <p className="text-[10.5px] text-[#6a7180] mb-0">Ordres de grandeur — INSEE (recensement 2022), observatoires notariaux et données publiques des collectivités.</p>
      {!isPublic && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-2 text-[10px] tracking-[0.18em] uppercase text-[#9298a6] hover:text-[#f2f3f5] transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Actualiser l'analyse
          </button>
          {error && <span className="text-[11px] text-[#96c0b8]">{error}</span>}
        </div>
      )}
    </div>
  );
}
