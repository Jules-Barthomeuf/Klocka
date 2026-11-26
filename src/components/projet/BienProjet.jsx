import React, { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import PlanCadastral from "./PlanCadastral";
import { nf } from "./SecteurChiffres";
import { useEdition, ValeurEditable, Bloc } from "./EditionEnPlace";
import { InfoDot } from "./SecteurChiffres";
import { Carte } from "./Cartes";
import ContexteVente from "./ContexteVente";
import { ApercuGeorisques } from "./LocataireLiensSociaux";

// L'onglet Bien : le contexte de la vente en tête, puis le local en cartes, une par
// information (activité, détenu depuis, surface, dernière vente), au registre
// des cartes de l'onglet Marché : l'intitulé souligné d'un filet, le chiffre
// en grand dessous.
//
// L'activité tient en un mot ou deux ; le détail, s'il y en a un, reste
// derrière l'info au survol. En édition, les quatre cartes sont là même
// vides : on voit ce qu'il reste à trouver.

function CarteInfo({ id, label, valeur, sous, info, champ, type = "text", champSous = null }) {
  return (
    <Bloc id={id} titre={label}>
    <Carte className="flex h-full min-w-0 flex-col px-6 pb-6 pt-[22px] max-md:px-5">
      <div className="mb-5 flex items-center gap-1.5">
        <span className="min-w-0 truncate text-[16px] font-medium text-encre">{label}</span>
        <InfoDot texte={info} />
      </div>
      <span className={`text-[30px] max-md:text-[24px] leading-[1.15] tracking-[-0.02em] ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums", textWrap: "balance" }}>
        <ValeurEditable champ={champ} type={type}>{valeur || "—"}</ValeurEditable>
      </span>
      {(sous || champSous) && <span className="mt-2 text-[15px] text-craie" style={{ fontVariantNumeric: "tabular-nums" }}><ValeurEditable champ={champSous}>{sous || "+ prix"}</ValeurEditable></span>}
    </Carte>
    </Bloc>
  );
}

// Le plan et les équipements du local (25 nov. 2026, Jules : « on va également avoir la surface, le plan si on a et les
// équipements, extraction etc. »). Le plan est une pièce des documents du projet, rangée dans la partie « Plans » (elle
// vient de l'emplacement « Plans du local » de l'Analyse) ou nommée « plan » ; une image se montre telle quelle, un PDF
// ou un fichier Drive dans un cadre. Les équipements viennent de la Fiche du bien de l'Analyse, une ligne chacun.

const IMAGE = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;

/** Pure : les plans du projet, d'après ses documents. */
export function plansDuProjet(project) {
  return (project?.fichiers_projet || []).map((f, idx) => ({ ...f, idx })).filter((f) => f?.url && (/^plans?$/i.test(String(f.groupe || "").trim()) || /\bplans?\b/i.test(String(f.nom || "").replace(/[_.-]+/g, " "))));
}

/** Pure : l'adresse à montrer dans le cadre (l'aperçu Drive pour un fichier Drive), ou null pour une image. */
export function apercuDuPlan(url) {
  const u = String(url || "");
  if (IMAGE.test(u)) return null;
  const drive = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{20,})/);
  return drive ? `https://drive.google.com/file/d/${drive[1]}/preview` : u;
}

/** Pure : les équipements, un par ligne (la virgule ou le retour à la ligne les sépare). */
export function equipementsDuProjet(project) {
  return String(project?.equipements || "").split(/\s*[,;\n]\s*/).map((e) => e.trim().replace(/\.$/, "")).filter(Boolean)
    .map((e) => e[0].toUpperCase() + e.slice(1));
}

function TeteCarte({ label, info = null, droite = null }) {
  return (
    <div className="mb-5 flex items-center gap-1.5">
      <span className="min-w-0 truncate text-[16px] font-medium text-encre">{label}</span>
      <InfoDot texte={info} />
      {droite && <span className="ml-auto flex-none">{droite}</span>}
    </div>
  );
}

const surf = (n) => (Number(n) > 0 ? `${nf.format(Number(n))} m²` : null);

/**
 * La carte Plan : le plan importé s'il y en a un, sinon la parcelle du cadastre sur le plan IGN (25 nov. 2026, Jules :
 * « une capture DVF de la parcelle ou sinon on importe une image du plan ; de base tu mets le truc DVF »). Dans
 * l'éditeur, « Importer un plan » le range dans les documents (partie « Plans ») ; « Retirer » le rend à la parcelle.
 */
function CartePlan({ project, plans, parcelle, erreur = null, enLecture, enEdition, onImporter, onRetirer, envoi }) {
  const fichier = useRef(null);
  const p = parcelle?.parcelle;
  const titre = plans.length > 1 ? "Plans" : plans.length ? "Plan" : "Parcelle";
  return (
    <Bloc id="bien-plan" titre="Plan">
      <Carte className="flex h-full min-w-0 flex-col px-6 pb-6 pt-[22px] max-md:px-5">
        <TeteCarte label={titre} info={plans.length ? null : "La parcelle du cadastre qui porte l'adresse du bien (Géoplateforme), sur le Plan IGN. Un plan du local importé la remplace."}
          droite={enEdition ? (
            <>
              <input ref={fichier} type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onImporter(f); }} />
              <button type="button" onClick={() => fichier.current?.click()} disabled={envoi}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
                {envoi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}Importer un plan
              </button>
            </>
          ) : null} />
        {plans.length > 0 ? (
          <div className="flex flex-col gap-5">
            {plans.map((pl) => {
              const cadre = apercuDuPlan(pl.url);
              return (
                <figure key={`${pl.url}-${pl.idx}`} className="m-0 flex flex-col gap-2">
                  {cadre
                    ? <iframe src={cadre} title={pl.nom || "Plan"} className="h-[460px] w-full rounded-[12px] border border-trait bg-relief max-md:h-[340px]" />
                    : <img src={pl.url} alt={pl.nom || "Plan du local"} className="w-full rounded-[12px] border border-trait bg-relief object-contain" loading="lazy" />}
                  <figcaption className="flex items-center justify-between gap-3 text-[13.5px] text-ardoise">
                    <span className="min-w-0 truncate">{pl.nom}</span>
                    <span className="flex flex-none items-center gap-3">
                      {enEdition && <button type="button" onClick={() => onRetirer(pl.idx)} className="text-ardoise transition-colors hover:text-alerte" style={{ background: "transparent" }}>Retirer</button>}
                      <a href={pl.url} target="_blank" rel="noopener noreferrer" className="text-ardoise transition-colors hover:text-encre">Ouvrir</a>
                    </span>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        ) : parcelle?.point ? (
          <figure className="m-0 flex flex-col gap-2">
            <PlanCadastral plan={parcelle} />
            <figcaption className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[13.5px] text-ardoise">
              <span>{p ? [`Parcelle ${p.section} ${String(p.numero).replace(/^0+/, "")}`, surf(p.contenance), p.proche ? "la plus proche de l'adresse, à vérifier" : null].filter(Boolean).join(" · ") : "Aucune parcelle ne porte le point de l'adresse"}</span>
              <span className="text-brume">Cadastre et Plan IGN, Géoplateforme</span>
            </figcaption>
          </figure>
        ) : enLecture ? (
          <p className="m-0 flex items-center gap-2 text-[14px] text-ardoise"><Loader2 className="h-3.5 w-3.5 animate-spin" />Lecture de la parcelle…</p>
        ) : (
          <p className="m-0 text-[14px] text-brume">{project.adresse_complete ? `${erreur || "La parcelle n'a pas pu être lue."} Importez un plan.` : "Sans adresse, pas de parcelle : importez un plan."}</p>
        )}
      </Carte>
    </Bloc>
  );
}

function CarteEquipements({ project }) {
  const liste = equipementsDuProjet(project);
  return (
    <Bloc id="bien-equipements" titre="Équipements">
      <Carte className="flex h-full min-w-0 flex-col px-6 pb-6 pt-[22px] max-md:px-5">
        <TeteCarte label="Équipements" info="Ce que la fiche du bien ou l'Analyse nomme du local : extraction, terrasse, cave, climatisation…" />
        <ValeurEditable champ="equipements" type="text">
          {liste.length
            // Des lignes en span : en édition, la liste est dans le bouton de ValeurEditable.
            ? <span className="flex flex-col [&>span:first-child]:border-t-0 [&>span:first-child]:pt-0">{liste.map((e, i) => <span key={i} className="block border-t border-trait py-2.5 text-[15px] leading-[1.5] text-craie">{e}</span>)}</span>
            : <span className="text-[15px] text-brume">—</span>}
        </ValeurEditable>
      </Carte>
    </Bloc>
  );
}

export default function BienProjet({ project, isPublic = false }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const [envoi, setEnvoi] = useState(false);
  const surface = Number(project.sim_surface) || Number(project.surface_m2) || 0;
  const detenu = project.detenu_depuis || project.derniere_vente_annee || null;
  const prixVente = Number(project.derniere_vente_prix) > 0 ? `${nf.format(Number(project.derniere_vente_prix))} €` : null;

  const infos = [
    { id: "bien-activite", champ: "activite_locataire", valeur: project.activite_locataire && !/non renseign/i.test(project.activite_locataire) ? project.activite_locataire : null, label: "Activité", info: project.activite_detail || null },
    { id: "bien-detenu", champ: "detenu_depuis", valeur: detenu ? String(detenu) : null, label: "Détenu depuis", info: "Depuis quand le propriétaire actuel tient les murs, d'après la dernière mutation publiée (DVF) ou l'acte." },
    { id: "bien-surface", champ: "sim_surface", type: "number", valeur: surface > 0 ? `${nf.format(surface)} m²` : null, label: "Surface", info: project.surface_detail || null },
    // L'année en grand, le prix dessous : deux chiffres sur une ligne se
    // lisaient comme un seul.
    { id: "bien-vente", champ: "derniere_vente_annee", champSous: enEdition ? "derniere_vente_prix" : null, valeur: project.derniere_vente_annee ? String(project.derniere_vente_annee) : null, sous: prixVente, label: "Dernière vente", info: "L'année et le prix de la dernière mutation des murs, d'après les ventes publiées (DVF) ou l'acte." },
    // La dernière vente ne se montre que si on l'a trouvée, même dans l'éditeur (30 oct. 2026, Jules).
  ].filter((l) => l.valeur || (enEdition && l.id !== "bien-vente"));
  const plans = plansDuProjet(project);
  // La parcelle, quand aucun plan n'est importé : lue par le serveur, ou celle gardée pour le lien public.
  const avecId = !!project.id && project.id !== "apercu";
  const qParcelle = useQuery({
    queryKey: ["parcelle-projet", project.id, project.adresse_complete || ""],
    queryFn: () => base44.request("GET", `/api/projets/${project.id}/parcelle`),
    enabled: !isPublic && avecId && !plans.length && !!project.adresse_complete,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const parcelle = isPublic ? project.parcelle_cadastre || null : qParcelle.data?.plan || null;
  const montrerPlan = plans.length > 0 || !!parcelle?.point || enEdition;
  const importer = async (f) => {
    setEnvoi(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      edition.onChamp("fichiers_projet", [...(project.fichiers_projet || []), { nom: f.name, url: file_url, groupe: "Plans" }], true);
      toast.success("Plan importé", { description: "Il est aussi dans les documents, partie « Plans »." });
    } catch (e) {
      toast.error(e?.message || "Le plan n'a pas été importé.");
    } finally { setEnvoi(false); }
  };
  const retirer = (idx) => edition.onChamp("fichiers_projet", (project.fichiers_projet || []).filter((_, i) => i !== idx), true);
  // En édition, la carte des équipements est là même vide : on voit ce qu'il reste à trouver.
  const avecEquipements = equipementsDuProjet(project).length > 0 || enEdition;
  // La colonne de gauche : le contexte (montré au client s'il est écrit, toujours dans l'éditeur) et la parcelle.
  const gauche = montrerPlan || enEdition || !!String(project.contexte_vente || "").trim();
  // Géorisques en haut de la colonne de droite, au-dessus de l'activité (26 nov. 2026, Jules : « Géorisques, mets-le en
  // haut dans la colonne, au-dessus d'Activité » ; avant, sous Équipement) : le rapport des risques de l'adresse du bien.
  const georisques = project.adresse_complete ? <Bloc id="bien-georisques" titre="Géorisques"><ApercuGeorisques adresse={project.adresse_complete} /></Bloc> : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Plus de chronologie dans l'onglet Bien (25 nov. 2026, Jules : « enlève le truc chronologie dans Bien ») ; le
          composant reste (ChronologieBien.jsx). */}
      {/* Le contexte de la vente, dicté et mis en forme pour les clients (25 nov. 2026, Jules). */}
      {/* À gauche, le contexte de la vente puis la parcelle, de la même largeur ; à droite, depuis le haut, l'activité, la
          surface et les autres cartes du local, puis les équipements (26 nov. 2026, Jules : « contexte de la vente de la
          même largeur que parcelle, et tu remontes activité, surface, équipement »). Sans rien à gauche, les cartes
          reprennent toute la largeur. */}
      {gauche ? (
        <div className="grid items-start gap-4 lg:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
            <ContexteVente project={project} />
            {montrerPlan && <CartePlan project={project} plans={plans} parcelle={parcelle} erreur={qParcelle.data?.erreur || null} enLecture={qParcelle.isFetching} enEdition={enEdition} onImporter={importer} onRetirer={retirer} envoi={envoi} />}
          </div>
          {(infos.length > 0 || avecEquipements || georisques) && (
            <div className="flex min-w-0 flex-col gap-4">
              {georisques}
              {infos.length > 0 && (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  {infos.map((l) => <CarteInfo key={l.id} {...l} />)}
                </div>
              )}
              {avecEquipements && <CarteEquipements project={project} />}
            </div>
          )}
        </div>
      ) : (
        <>
          {georisques}
          {infos.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {infos.map((l) => <CarteInfo key={l.id} {...l} />)}
            </div>
          )}
          {avecEquipements && <CarteEquipements project={project} />}
        </>
      )}
    </div>
  );
}
