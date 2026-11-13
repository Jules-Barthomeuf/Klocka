import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Loader2, PanelRightClose, PanelRightOpen } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { depuis } from "@/components/ui/liste-documents";
import { CLASSE_TABLE, CLASSE_TABLEAU, CLASSE_TD, CLASSE_TH, Filtres, Recherche, TitrePage, classeCase } from "@/components/mandataire/elements";
import { euros } from "@/components/mandataire/kit";
import { DocumentMandat } from "@/components/mandataire/ApercuMandat";
import { ApercuAvis } from "@/pages/MandataireEstimation";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import FilDossier from "@/components/mandataire/FilDossier";

// Les mandats des mandataires, côté Klocka (27 oct. 2026, Jules : « on reçoit le mandat créé sur la plateforme par
// le mandataire, c'est nous qui devons le mettre dans MyNotary et lui envoyer »). Sans automatisme : on lit le
// mandat, on le saisit sur MyNotary et on l'envoie en signature ; une fois signé, on joint le PDF dans la conversation ;
// le mandataire passe à l'étape suivante ; on l'inscrit au registre. Ce qui attend un geste de Klocka passe en tête.

const API = "/api/mandataire/admin/mandats";
const ETATS = {
  demande_envoyee: ["À saisir sur MyNotary", "text-ambre"],
  pret: ["Signé et envoyé au mandataire", "text-ardoise"],
  signe: ["Signé : à inscrire au registre", "text-ambre"],
  enregistre: ["Inscrit au registre", "text-menthe"],
  // Un bien dont le mandataire parle à l'équipe avant son mandat (2 nov. 2026) : son mandat reprendra la conversation.
  avant_mandat: ["Avant le mandat", "text-ardoise"],
};
// Pendant l'envoi, trois moments (2 nov. 2026, Jules) : à saisir, à relire chez le mandataire, validé et à envoyer en signature.
const etatDe = (m) => (m.statut !== "demande_envoyee" ? ETATS[m.statut]
  : m.valide_le ? ["Validé : à envoyer en signature", "text-ambre"]
  : m.a_relire ? ["À relire par le mandataire", "text-ardoise"] : ETATS.demande_envoyee);
const honoraires = (m) => (m.honoraires == null ? null : `honoraires ${m.honoraires}${Number(m.honoraires) <= 100 ? " %" : " €"}${m.honoraires_charge === "acquereur" ? " acquéreur" : ""}`);

const COULEUR_ETAT = { "text-ambre": "ambre", "text-menthe": "menthe", "text-alerte": "corail" };
const motDe = (m) => (etatDe(m) || [m.statut])[0] || "";
const FILTRES_M = { tous: () => true, inscrire: (m) => /inscrire/i.test(motDe(m)), saisir: (m) => /saisir/i.test(motDe(m)) };

export default function MandatsMandataires() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useQuery({ queryKey: ["k-mandats"], queryFn: () => base44.request("GET", API), refetchInterval: 30_000 });
  const mandats = data?.mandats || [];
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("tous");
  const t = q.trim().toLowerCase();
  const vus = mandats.filter(FILTRES_M[filtre]).filter((x) => !t || `${x.bien} ${x.vendeur || ""} ${x.mandataire_nom || ""}`.toLowerCase().includes(t));
  const ouvert = params.get("mandat");
  // La conversation se charge en même temps que la liste (une notification ouvre le mandat directement), et au survol
  // d'une ligne : elle est là au clic.
  const queryClient = useQueryClient();
  const precharger = (id) => queryClient.prefetchQuery({ queryKey: ["fil-dossier", `${API}/${id}`, "analyste"], queryFn: () => base44.request("GET", `${API}/${id}/fil?lire=0`), staleTime: 10_000 });
  useEffect(() => { if (ouvert) precharger(ouvert); }, [ouvert]);
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("mandat", id); else n.delete("mandat"); return n; });
  const m = mandats.find((x) => x.id === ouvert) || null;
  if (ouvert && m) return <Mandat m={m} onFermer={() => ouvrir(null)} />;

  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-[22px] md:px-8">
      <TitrePage titre="Mandats" nombre={mandats.length || null} className="md:!pr-[112px]" />
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <Recherche value={q} onChange={setQ} placeholder="Rechercher un mandat" className="w-full md:w-[320px]" />
        <Filtres label="Filtrer les mandats" valeur={filtre} onChange={setFiltre} options={[["tous", "Tous", mandats.length], ["inscrire", "À inscrire", mandats.filter(FILTRES_M.inscrire).length], ["saisir", "À saisir", mandats.filter(FILTRES_M.saisir).length]]} />
      </div>
      {isLoading ? <Chargement taille="grand" /> : !mandats.length ? (
        <p className="py-16 text-center text-sm text-brume">Aucun mandat reçu : ils arrivent ici quand un mandataire envoie le sien.</p>
      ) : (
        <div className={`mt-3 ${CLASSE_TABLEAU}`}>
          <table className={`${CLASSE_TABLE} min-w-[900px]`}>
            <colgroup><col style={{ width: "32%" }} /><col style={{ width: "26%" }} /><col style={{ width: "11%" }} /><col style={{ width: "12%" }} /><col style={{ width: "19%" }} /></colgroup>
            <thead><tr>{["Nom", "Détail", "Modifié", "Auteur", "Où il en est"].map((t) => <th key={t} className={CLASSE_TH}>{t}</th>)}</tr></thead>
            <tbody>
              {vus.map((x) => {
                const [mot, teinte] = etatDe(x) || [x.statut, "text-ardoise"];
                const detail = x.avant_mandat ? x.dernier?.texte || "" : [x.vendeur, x.prix ? euros(x.prix) : null, honoraires(x), x.type, x.duree_mois ? `${x.duree_mois} mois` : null].filter(Boolean).join(" · ");
                return (
                  <tr key={x.id} onMouseEnter={() => precharger(x.id)} onFocus={() => precharger(x.id)} onClick={() => ouvrir(x.id)} className="cursor-pointer hover:bg-relief/60">
                    <td className={CLASSE_TD}><span className="inline-flex max-w-full items-center gap-2"><span className="truncate">{x.bien}</span><PointNouveau n={x.non_lus} /></span></td>
                    <td className={CLASSE_TD} title={detail}>{detail}</td>
                    <td className={CLASSE_TD}>{depuis(x.activite)}</td>
                    <td className={CLASSE_TD}>{x.mandataire_nom}</td>
                    <td className={`${CLASSE_TD} ${classeCase(COULEUR_ETAT[teinte] || "gris")}`}>{mot}{x.statut === "enregistre" && x.numero_registre ? `, n° ${x.numero_registre}` : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * Un mandat ouvert, au style du mandataire (2 nov. 2026, Jules) : on arrive sur la conversation, le mandat à droite
 * (avant le mandat, l'avis de valeur) ; un bouton ferme le document, le même le rouvre. La conversation sans cadre, ses
 * quatre temps en tête vus depuis Klocka. Au téléphone, le document s'ouvre au-dessus de la conversation.
 */
function Mandat({ m, onFermer }) {
  const large = useEcranLarge();
  const avant = !!m.avant_mandat;
  const [docOuvert, setDocOuvert] = useState(true);
  useEffect(() => {
    if (!large) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [large]);
  // Le document de la conversation : le mandat, ou avant lui l'avis de valeur du bien s'il y en a un.
  const doc = avant ? (m.estimation_id ? { nom: "l'avis", note: null, contenu: <ApercuAvis id={m.estimation_id} sansStatut equipe /> } : null) : {
    nom: "le mandat",
    note: "Le mandat tel que le mandataire l'a préparé : à reprendre dans MyNotary.",
    contenu: (
      <div className="h-full min-h-0 overflow-y-auto px-6 py-6 max-md:px-3 max-md:py-4">
        <DocumentMandat q={m.questionnaire || {}} numero={m.numero_registre} />
      </div>
    ),
  };
  // Le document ouvert, son bouton est dans sa barre, à gauche (comme chez le mandataire) ; fermé, il revient en haut.
  const enTeteDoc = doc && (
    <div className="flex h-12 flex-none items-center gap-3 border-b border-trait px-4 text-[12.5px] text-ardoise">
      <button type="button" onClick={() => setDocOuvert(false)} aria-label={`Masquer ${doc.nom}`} title={`Masquer ${doc.nom}`}
        className="grid h-8 w-8 flex-none place-items-center rounded-full border border-bord-doux text-craie hover:text-encre" style={{ background: "transparent" }}>
        <PanelRightClose className="h-4 w-4" />
      </button>
      {doc.note && <span className="min-w-0 truncate">{doc.note}</span>}
    </div>
  );
  // Fermé, le document se rouvre d'une icône : à droite de la carte des quatre temps, hors d'elle (2 nov. 2026, Jules),
  // ou en haut pour l'avis d'avant le mandat, qui n'a pas de carte.
  const voir = doc && !docOuvert ? (
    <button type="button" onClick={() => setDocOuvert(true)} aria-label={`Voir ${doc.nom}`} title={`Voir ${doc.nom}`}
      className="grid h-8 w-8 flex-none place-items-center rounded-full border border-bord-doux text-craie hover:text-encre" style={{ background: "transparent" }}>
      <PanelRightOpen className="h-4 w-4" />
    </button>
  ) : null;
  const fil = (
    <FilDossier api={`${API}/${m.id}`} cote="analyste" plein={large} sansCadre={large} titre={`Avec ${m.mandataire_nom}`}
      enTete={avant ? null : (
        // L'icône qui rouvre le mandat, hors de la carte des étapes, à sa droite (2 nov. 2026, Jules).
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1"><TempsKlocka m={m} /></div>
          {voir && <div className="mt-[9px] flex-none">{voir}</div>}
        </div>
      )}
      vide={avant ? "Le mandataire écrit ici sur ce bien, avant son mandat. Le mandat, une fois envoyé, reprendra cette conversation." : "Saisissez le mandat sur MyNotary et envoyez-le en signature. Une fois signé, joignez ici le PDF."} />
  );
  const ouvert = !!doc && docOuvert;
  const barre = (
    <div className="flex h-12 flex-none items-center gap-3 border-b border-trait px-4 md:pr-[120px] max-md:h-auto max-md:flex-wrap max-md:border-none max-md:px-0 max-md:py-0">
      <button type="button" onClick={onFermer} className="inline-flex flex-none items-center gap-1.5 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
        <ArrowLeft className="h-4 w-4" /> Mandats
      </button>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-encre max-md:order-first max-md:basis-full">{m.bien}<span className="text-ardoise"> · {m.mandataire_nom}{avant ? " · avant le mandat" : ""}</span></span>
      {avant && voir}
    </div>
  );
  if (!large) {
    return (
      <div className="flex flex-col gap-4 px-4 py-4">
        {barre}
        {ouvert && <div className="flex h-[70dvh] flex-col overflow-hidden rounded-[16px] border border-trait">{enTeteDoc}<div className="min-h-0 flex-1 [&>div]:h-full">{doc.contenu}</div></div>}
        {fil}
      </div>
    );
  }
  return (
    <div className="flex h-[100dvh] min-h-0 flex-col overflow-hidden">
      {barre}
      {/* Le document s'ouvre et se ferme en glissant (2 nov. 2026, Jules : « pas brutal, soft ») : la colonne change de
          largeur et s'efface en une demi-seconde ; son contenu garde sa largeur, rogné plutôt que tassé. */}
      <div className="grid min-h-0 flex-1 transition-[grid-template-columns] duration-500 ease-in-out motion-reduce:transition-none"
        style={{ gridTemplateColumns: ouvert ? "minmax(0,1fr) minmax(0,1.15fr)" : "minmax(0,1fr) minmax(0,0fr)" }}>
        <div className="min-h-0 min-w-0">{fil}</div>
        {doc && (
          <div aria-hidden={!ouvert} className={`min-h-0 min-w-0 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none ${ouvert ? "border-l border-trait opacity-100" : "pointer-events-none opacity-0"}`}>
            <div className="flex h-full min-h-0 min-w-[560px] flex-col">
              {enTeteDoc}
              <div className="min-h-0 flex-1 [&>div]:h-full">{doc.contenu}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Les quatre temps d'un mandat envoyé, vus depuis Klocka : les mêmes que chez le mandataire (MandataireBiens), avec ce
// que l'équipe a à faire à chacun.
const tempsDuMandat = (m) => (m.statut === "signe" || m.statut === "enregistre" ? 4 : m.statut === "pret" ? 3 : m.valide_le ? 2 : m.a_relire ? 1 : 0);
const TEMPS_KLOCKA = [["Envoyé", "vous le saisissez sur MyNotary"], ["Mandat à relire", "le mandataire"], ["En signature", "le vendeur"], ["Mandat signé reçu", "le mandataire, puis le registre"]];

/** La carte en tête de la conversation : la phrase de ce qu'il faut faire, les quatre temps, et le geste de Klocka. */
function TempsKlocka({ m }) {
  const queryClient = useQueryClient();
  const registre = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${m.id}/registre`),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["k-mandats"] });
      queryClient.invalidateQueries({ queryKey: ["fil-dossier", `${API}/${m.id}`, "analyste"] });
      toast.success(`Inscrit au registre, n° ${r.mandat?.numero_registre || ""}`);
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // L'équipe coche les étapes elle-même (2 nov. 2026, Jules : « cliquer sur les étapes pour les valider ») : un clic
  // sur une étape pas encore faite la coche, avec celles d'avant ; le dernier PDF joint ici devient le mandat rempli,
  // puis signé.
  const cocher = useMutation({
    mutationFn: (etape) => base44.request("POST", `${API}/${m.id}/etape`, { body: { etape } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["k-mandats"] });
      queryClient.invalidateQueries({ queryKey: ["fil-dossier", `${API}/${m.id}`, "analyste"] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const n = tempsDuMandat(m);
  const phrase = m.statut === "enregistre" ? `Inscrit au registre${m.numero_registre ? `, n° ${m.numero_registre}` : ""}.`
    : m.statut === "signe" ? "Mandat signé reçu : inscrivez-le au registre."
    : n === 3 ? "Le mandat signé est chez le mandataire. Cochez « Mandat signé reçu » quand c'est bon."
    : n === 2 ? "Envoyez-le en signature sur MyNotary, joignez ici le PDF signé, puis cochez « En signature »."
    : "Saisissez le mandat sur MyNotary et joignez ici le PDF rempli. Quand le mandataire l'a relu, cochez « Mandat à relire ».";
  return (
    <div className="flex-none k-verre px-4 py-3.5 text-left">
      <p className="m-0 text-[14px] leading-[1.5] text-encre">{phrase}</p>
      <p className="m-0 mt-1 text-[12.5px] text-ardoise">{[m.vendeur, m.vendeur_contact, m.prix ? euros(m.prix) : null, honoraires(m)].filter(Boolean).join(" · ")}</p>
      <ol className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0">
        {TEMPS_KLOCKA.map(([mot, qui], i) => {
          const fait = i < n || i === 0 || n >= 4;
          // Envoyé est fait d'office : l'étape en cours est au moins « Mandat à relire ».
          const ici = i === Math.max(n, 1) && n < 4;
          const enCours = cocher.isPending && cocher.variables === i;
          const contenu = (
            <>
              <span className={`grid h-4 w-4 flex-none place-items-center rounded-full transition-colors ${fait ? "bg-menthe text-sur-menthe" : ici ? "border border-menthe bg-transparent group-hover:bg-menthe/20" : "border border-bord-vif bg-transparent group-hover:border-menthe"}`}>
                {enCours ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : fait && <Check className="h-2.5 w-2.5" />}
              </span>
              <span className={fait ? "text-ardoise" : ici ? "text-encre" : "text-brume group-hover:text-craie"}>{mot}</span>
              <span className="text-[12.5px] text-brume">{qui}</span>
            </>
          );
          return (
            <li key={mot} className="text-[13.5px]">
              {fait ? <span className="flex items-center gap-2.5">{contenu}</span> : (
                <button type="button" onClick={() => cocher.mutate(i)} disabled={cocher.isPending} title={`Cocher « ${mot} »${i > n ? " et les étapes d'avant" : ""}`}
                  className="group -mx-1 flex items-center gap-2.5 rounded-[6px] px-1 text-left disabled:opacity-60" style={{ background: "transparent" }}>
                  {contenu}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {m.statut === "signe" && (
        <button type="button" onClick={() => registre.mutate()} disabled={registre.isPending}
          className="mt-3 inline-flex h-9 w-fit items-center gap-2 rounded-full bg-menthe px-4 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {registre.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Inscrire au registre
        </button>
      )}
    </div>
  );
}

/** Un écran assez large pour le fil et le mandat côte à côte. */
function useEcranLarge() {
  const requete = "(min-width: 1024px)";
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const q = window.matchMedia(requete);
    const changer = () => setLarge(q.matches);
    q.addEventListener("change", changer);
    return () => q.removeEventListener("change", changer);
  }, []);
  return large;
}
