import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Sparkles } from "lucide-react";
import { trouverVille, trouverSecteur, chiffresVille } from "@/data/villes";
import { useSecteurProjet, ChiffresStrip, chiffresSecteur, PrixEtLoyers, nf } from "./SecteurChiffres";

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
          description: "Le revenu médian par unité de consommation de la commune, s'il est connu.",
          items: {
            type: "object",
            properties: {
              valeur: { type: "string", description: "Chiffre formaté, ex. '23 400 €'" },
              label: { type: "string", description: "Libellé court, ex. 'Revenu médian / UC'" },
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
        points: {
          type: "array",
          description: "UNE seule phrase courte sur l'emplacement : sa commercialité et la clientèle qui y passe.",
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
3. ville : le revenu médian par UC de la commune (INSEE) s'il est connu, et les points marquants pour un investisseur.
4. secteur : le nom de la rue ou du micro-quartier, et UNE seule phrase courte sur sa commercialité.`;

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

  }, [projectId, adresse]);

  return { analyse: data, villeData, secteurData, loading, error, refresh: fetchAnalyse };
}

function SkeletonLine({ w = "100%" }) {
  return <div className="h-3 bg-encre/[0.07] animate-pulse" style={{ width: w }} />;
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
    <p className={`${vertical ? "text-[13.5px]" : "text-[15px] max-md:text-[13.5px]"} leading-[1.75] text-craie mb-0`}>{texte}</p>
  );

  if (vertical) {
    return (
      <div className="border-l-2 border-menthe pl-5 py-1">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="w-3.5 h-3.5 text-menthe-clair" />
          <span className="text-[11px] tracking-[0.2em] uppercase text-menthe-clair">Le secteur</span>
        </div>
        {sousTitre && <div className="text-[11px] tracking-[0.18em] uppercase text-ardoise mb-3">{sousTitre}</div>}
        <div className={vertical ? "transition-opacity duration-300" : ""} key={section || "general"}>{corps}</div>
      </div>
    );
  }

  return (
    <div className="border border-menthe/40 bg-menthe/[0.05] px-6 py-5 max-md:px-4 max-md:py-4 mb-8 max-md:mb-6">
      <div className="flex items-center gap-2 mb-2.5">
        <Sparkles className="w-3.5 h-3.5 text-menthe-clair" />
        <span className="text-[11px] tracking-[0.2em] uppercase text-menthe-clair">Le secteur</span>
        {sousTitre && <span className="text-[11px] tracking-[0.18em] uppercase text-ardoise">· {sousTitre}</span>}
      </div>
      {corps}
    </div>
  );
}

function PointsList({ points }) {
  const list = (points || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <ul className="md:columns-2 md:gap-10 space-y-2.5 list-none pl-0 mb-0">
      {list.map((p, i) => (
        <li key={i} className="flex gap-2.5 text-[13.5px] leading-[1.7] text-craie break-inside-avoid">
          <span className="text-menthe flex-shrink-0 mt-[7px] w-1 h-1 rounded-full bg-menthe" />
          <span>{p}</span>
        </li>
      ))}
    </ul>
  );
}

function Titre({ label, nom }) {
  return (
    <div className="text-[11px] tracking-[0.2em] uppercase text-ardoise mb-3">
      {label}{nom ? ` — ${nom}` : ""}
    </div>
  );
}

function Attente() {
  return (
    <div className="space-y-2.5">
      <SkeletonLine w="60%" />
      <SkeletonLine />
      <SkeletonLine w="88%" />
    </div>
  );
}

const premierePhrase = (texte) => String(texte || "").trim().match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0] || String(texte || "").trim();

// Blocs « La ville » et « Le secteur ». La ville : habitants de l'agglomération
// et revenu médian. Le secteur : une phrase, puis distance, commercialité et
// flux, puis les prix et loyers du résidentiel, de la rue et du projet.
export default function VilleSecteurIA({ analyse, villeData, secteurData, loading, error, refresh, project, isPublic, prixM2Revient = 0, loyerM2 = 0 }) {
  const { data: donnees, isLoading: secteurEnAttente } = useSecteurProjet(project, !isPublic);

  // Ce que la fiche porte l'emporte : un chiffre corrigé à la main doit
  // s'afficher, sinon on corrigerait dans le vide.
  const agglo = Number(project.ville_habitants_agglo) || donnees?.agglomeration?.population || 0;
  const revenu = Number(project.ville_revenu_median) || villeData?.revenu || 0;
  const revenuIA = !revenu ? (analyse?.ville?.chiffres || []).find((c) => /revenu/i.test(c?.label || "")) : null;
  const chiffresDeLaVille = [
    agglo > 0 && {
      valeur: nf.format(agglo),
      label: "Habitants agglomération",
      info: donnees?.agglomeration
        ? `Unité urbaine de ${donnees.agglomeration.nom} : ${nf.format(donnees.agglomeration.communes)} commune${donnees.agglomeration.communes > 1 ? "s" : ""} (Insee, unités urbaines 2020).`
        : null,
    },
    ...(revenu > 0 ? chiffresVille({ revenu }) : revenuIA ? [revenuIA] : []),
  ].filter(Boolean);

  const nomVille = project.ville_secteur_champ1 || villeData?.nom || analyse?.ville?.nom || donnees?.agglomeration?.nom;
  const pointsVille = project.ville_points?.length ? project.ville_points : (villeData?.points || analyse?.ville?.points);

  const nomSecteur = secteurData?.nom || donnees?.rue?.nom || analyse?.secteur?.nom || project.marche_quartier_nom;
  const phraseSecteur = premierePhrase(
    project.secteur_points?.[0] || secteurData?.points?.[0] || analyse?.secteur?.points?.[0] || project.description_secteur || analyse?.avis_onglets?.secteur,
  );
  const bandeSecteur = chiffresSecteur(donnees);

  const attenteVille = (loading && !villeData && !chiffresDeLaVille.length) || (secteurEnAttente && !chiffresDeLaVille.length);
  const rien = !loading && !secteurEnAttente && !chiffresDeLaVille.length && !pointsVille?.length && !phraseSecteur && !bandeSecteur.length && !project.description_ville;

  if (rien) {
    return <p className="text-ardoise text-sm mb-0">Aucune donnée disponible pour ce secteur.</p>;
  }

  return (
    <div>
      <div className="mb-8 max-md:mb-6">
        <Titre label="La ville" nom={nomVille} />
        {attenteVille ? <Attente /> : (
          <>
            <ChiffresStrip chiffres={chiffresDeLaVille} />
            {pointsVille?.length ? <PointsList points={pointsVille} /> : project.description_ville ? (
              <p className="text-[13.5px] leading-[1.8] text-craie whitespace-pre-wrap mb-0">{project.description_ville}</p>
            ) : null}
          </>
        )}
      </div>

      <div className="mb-8 max-md:mb-6">
        <Titre label="Le secteur" nom={nomSecteur} />
        {phraseSecteur && <p className="text-[13.5px] leading-[1.75] text-craie mb-4 max-w-[720px]">{phraseSecteur}</p>}
        {secteurEnAttente ? <Attente /> : <ChiffresStrip chiffres={bandeSecteur} />}
        {donnees?.en_cours && !bandeSecteur.length && (
          <p className="text-[12.5px] text-brume mb-4">Lecture du secteur en cours : distance, rue et marché résidentiel arrivent.</p>
        )}
        <PrixEtLoyers donnees={donnees} prixM2Revient={prixM2Revient} loyerM2={loyerM2} />
      </div>

      <p className="text-[11px] text-brume mb-0">
        Sources : Insee (unités urbaines 2020, revenus), Le Figaro Immobilier, Data-B, relevé OpenStreetMap et Base Adresse Nationale
        {donnees?.le ? `, lus le ${new Date(donnees.le).toLocaleDateString("fr-FR")}` : ""}.
      </p>
      {!isPublic && (
        <div className="flex items-center gap-3 mt-3">
          <button onClick={refresh} disabled={loading}
            className="inline-flex items-center gap-2 text-[11px] tracking-[0.18em] uppercase text-ardoise hover:text-encre transition-colors disabled:opacity-40">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Actualiser l'analyse
          </button>
          {error && <span className="text-[11px] text-menthe">{error}</span>}
        </div>
      )}
    </div>
  );
}
