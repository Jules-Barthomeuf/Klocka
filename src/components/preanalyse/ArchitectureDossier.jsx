import { VuesLieu } from "@/components/preanalyse/DealResultat";
import ClientsCorrespondants from "@/components/admin/ClientsCorrespondants";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, Check, MoreHorizontal, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import FilDossier from "@/components/mandataire/FilDossier";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { FRISE, checklistDataRoom, etapeFrise } from "@/lib/dossiers-architecture";
import PanneauAValiderDossier from "@/components/haka/PanneauAValiderDossier";
import { ZoneConversion } from "@/components/preanalyse/RoueConversion";
import { toast } from "@/components/ui/avis";

// Les pièces du dossier ouvert (17 oct. 2026, Jules) : la frise de huit
// étapes, le verdict, l'action suivante, la colonne de droite (investisseurs
// compatibles, documents, livrables, fil) et les trois vues nouvelles
// (Email, Clients, Offre). Les étapes qui existaient déjà (pré-analyse,
// documents, analyse, plateforme, dossier bancaire) gardent leurs écrans.

/** La porte du serveur (etape_max, 1 à 5) qu'une étape de la frise demande. */
export const PORTE = { reception: 1, preanalyse: 2, documents: 3, analyse: 3, plateforme: 4, clients: 4, offre: 4, bancaire: 5 };

const VUE_PAR_PORTE = { 1: "reception", 2: "preanalyse", 3: "analyse", 4: "plateforme", 5: "bancaire" };

/** L'étape de frise ouverte en arrivant sur une porte : celle où en est le dossier si elle y est, sinon la principale de la porte. */
export function vueDeLaPorte(porte, dossier) {
  if (dossier) {
    const id = FRISE[etapeFrise(dossier) - 1].id;
    if (PORTE[id] === porte) return id;
  }
  return VUE_PAR_PORTE[porte] || "preanalyse";
}

const argent = (n) => (n == null ? null : `${Math.round(n).toLocaleString("fr-FR")} €`);
const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");

export { FriseDossier } from "@/components/preanalyse/EtapesDossier";

function useLettres(dealId) {
  return useQuery({ queryKey: ["offres"], queryFn: () => base44.request("GET", "/api/offres"), enabled: !!dealId, select: (d) => (d.offres || []).filter((o) => o.deal_id === dealId) });
}

const bloc = "k-points relative overflow-hidden rounded-[16px] border border-trait bg-rail p-4";
const titreBloc = "m-0 mb-2.5 text-[11px] uppercase tracking-[.16em] text-brume";

/** La colonne de droite : la Data Room en liste à cocher (17 oct. 2026), et le fil d'un dossier de mandataire. Documents et livrables retirés le 17 oct. 2026 (Jules). */
export function ColonneDroite({ dossier, apercu = false, onAller = null, vue = null, onRefresh = null }) {
  // Pré-analyse : à qui ce bien pourrait correspondre, d'après les investisseurs de Monday (revenu le 18 oct. 2026, Jules).
  const correspondances = useQuery({
    queryKey: ["dossier-clients", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/clients`),
    enabled: !!dossier?.deal_id && !apercu && vue === "preanalyse",
    staleTime: 5 * 60 * 1000,
  });
  const { pieces, autres } = checklistDataRoom(dossier?.documents_espace || []);
  // Maj + glisser un fichier sur la Data Room ouvre la roue de conversion (18 oct. 2026, Jules) ; le centre le range tel quel.
  const ajouter = dossier?.deal_id && !apercu ? async (f) => {
    const form = new FormData();
    form.append("fichier", f);
    await base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/espace/documents`, { body: form, isForm: true });
    toast.success(`${f.name} rangé dans la Data Room`);
    onRefresh?.();
  } : null;
  return (
    <aside aria-label="Autour du dossier" className="k-serie flex flex-col gap-4 lg:self-start">
      {/* Haka (17 oct. 2026) : ce qu'il propose pour ce dossier, en tête. */}
      {dossier?.deal_id && !apercu && <PanneauAValiderDossier dealId={dossier.deal_id} />}
      {/* Pré-analyse : Street View et le plan, l'un sous l'autre (18 oct. 2026, Jules). */}
      {vue === "preanalyse" && dossier?.lots?.[0] && !apercu && (
        <section className={bloc}>
          <p className={titreBloc}>Emplacement</p>
          <VuesLieu lot={dossier.lots[0]} enr={dossier.lots[0].enrichissement} coteACote empile dealId={dossier?.deal_id} />
        </section>
      )}
      {vue === "preanalyse" && dossier?.deal_id && !apercu && (
        <section className={bloc}>
          <p className={titreBloc}>Clients intéressés</p>
          <p className="m-0 text-[12.5px] text-brume">Budget, apport et zone de recherche, d'après Monday</p>
          <ClientsCorrespondants clients={correspondances.data?.clients} chargement={correspondances.isLoading} configure={correspondances.data?.configure} erreur={correspondances.isError} />
        </section>
      )}
      {/* La Data Room en liste à cocher (17 oct. 2026, Jules) : ce qui est importé, ce qui manque. Seulement à l'étape Data Room (18 oct. 2026, Jules). */}
      {vue === "documents" && (
      <ZoneConversion onAjouter={ajouter}>
      <section data-zone="listes" className={bloc}>
        <button type="button" onClick={() => onAller?.("documents")} className="flex w-full items-baseline justify-between p-0 text-left" style={{ background: "transparent" }}>
          <span className="text-[15px] text-encre">Data Room</span>
          <span className="text-[12.5px] tabular-nums text-ardoise">{pieces.filter((x) => x.docs.length).length} sur {pieces.length}</span>
        </button>
        <ul className="m-0 mt-3 flex list-none flex-col p-0">
          {pieces.map((x) => (
            <li key={x.nom} className="flex items-start gap-2.5 border-t border-trait py-2 first:border-t-0">
              <span className={`mt-[3px] grid h-[16px] w-[16px] flex-none place-items-center rounded-[4px] border ${x.docs.length ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-doux"}`}>
                {x.docs.length > 0 && <Check className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[13.5px] ${x.docs.length ? "text-encre" : "text-craie"}`}>{x.nom}</span>
                <span className={`block truncate text-[12px] ${x.docs.length ? "text-ardoise" : "text-ambre"}`} title={x.docs.map((d) => d.nom).join(", ")}>
                  {x.docs.length ? x.docs.map((d) => d.nom).join(", ") : "Manquant"}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {autres.length > 0 && <p className="m-0 mt-2 text-[12px] text-brume">Et {autres.length} autre{autres.length > 1 ? "s" : ""} pièce{autres.length > 1 ? "s" : ""} importée{autres.length > 1 ? "s" : ""}.</p>}
        <p className="m-0 mt-3 text-[11.5px] text-brume">Maj + glisser un fichier ici : le convertir.</p>
      </section>
      </ZoneConversion>
      )}

      {/* Le fil n'existe que pour un dossier de mandataire : sans lui, rien à montrer (17 oct. 2026, Jules). */}
      {dossier?.dossier_mandataire_id && !apercu && (
        <section data-zone="listes" className={bloc}>
          <p className={titreBloc}>Fil</p>
          <FilDossier dossierId={dossier.dossier_mandataire_id} cote="analyste" hauteur="max-h-none" />
        </section>
      )}
    </aside>
  );
}


const panneau = "k-points relative overflow-hidden rounded-[16px] border border-trait bg-rail px-5 py-6";

/** Étape 1 : d'où vient le dossier, qui l'a envoyé, quand. */
export function VueReception({ dossier }) {
  const lignes = [
    ["Origine", dossier?.origine === "mandataire" ? `Mandataire K Partners${dossier?.mandataire_email ? `, ${dossier.mandataire_email}` : ""}` : "Reçu par l'équipe"],
    ["Fiche", dossier?.source?.nom_fichier || null],
    ["Agent", dossier?.contact_agent_email || null],
    ["Reçu le", jour(dossier?.cree_le || dossier?.created_date)],
    ["Responsables", (dossier?.responsables || []).join(", ") || null],
  ].filter(([, v]) => v);
  return (
    <div data-zone="listes" className={panneau}>
      <h2 className="m-0 mb-4 text-[20px] font-normal text-encre">Email</h2>
      <dl className="m-0 grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[14px] max-md:grid-cols-1">
        {lignes.map(([k, v]) => (<React.Fragment key={k}><dt className="text-ardoise">{k}</dt><dd className="m-0 break-words text-encre">{v}</dd></React.Fragment>))}
      </dl>
    </div>
  );
}

/** Étape 6 : les clients à qui le bien est proposé. */
export function VueClients({ dossier }) {
  return (
    <div data-zone="listes" className={panneau}>
      <h2 className="m-0 mb-2 text-[20px] font-normal text-encre">Clients</h2>
      <p className="m-0 text-[14px] leading-[1.6] text-ardoise">
        {dossier?.projet_id
          ? "Le projet est sur la plateforme : les investisseurs qui le consultent et les demandes qui lui correspondent s'afficheront ici."
          : "Les clients se rapprochent une fois le projet créé sur la plateforme (étape 5)."}
      </p>
      <Link to="/Clients" className="mt-4 inline-flex text-[13.5px] text-menthe underline-offset-4 hover:underline">Voir les demandes clients</Link>
    </div>
  );
}

/** Étape 7 : les lettres d'intention d'achat sur ce dossier. */
export function VueOffre({ dossier, apercu = false }) {
  const lettres = useLettres(apercu ? null : dossier?.deal_id);
  const liste = lettres.data || [];
  return (
    <div data-zone="listes" className={panneau}>
      <h2 className="m-0 mb-3 text-[20px] font-normal text-encre">Offre</h2>
      {liste.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {liste.map((o) => (
            <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-[12px] border border-trait px-4 py-3 text-[14px]">
              <span className="text-encre">{o.acquereur || "Acquéreur à renseigner"}</span>
              <span className="tabular-nums text-craie">{argent(o.prix) || "Prix à fixer"}</span>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-[14px] leading-[1.6] text-ardoise">Aucune lettre d'intention sur ce dossier. Dites au chat quelle offre préparer, elle apparaîtra ici.</p>}
      <Link to="/Offres" className="mt-4 inline-flex text-[13.5px] text-menthe underline-offset-4 hover:underline">Ouvrir les offres</Link>
    </div>
  );
}

/** Le menu ⋯ du dossier : abandonner, supprimer. */
export function MenuActionsDossier({ dossier, abandonne, onAbandonner, onSupprimer }) {
  const [ouvert, setOuvert] = useState(false);
  const zone = useFermerAuClicAilleurs(ouvert, () => setOuvert(false));
  const clos = dossier?.statut === "projet_cree";
  return (
    <div ref={zone} className="relative flex-none">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-haspopup="menu" aria-expanded={ouvert} aria-label="Actions du dossier" title="Actions du dossier"
        className="grid h-[38px] w-[38px] place-items-center rounded-full border border-trait text-ardoise hover:text-encre" style={{ background: "transparent" }}>
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {ouvert && (
        <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[220px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-xl duration-200 animate-in fade-in-0 zoom-in-95">
          <button role="menuitem" type="button" onClick={() => { setOuvert(false); onAbandonner(); }} disabled={abandonne || clos} title="Classer sans suite : le dossier reste consultable, il n'avance plus"
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-alerte hover:bg-alerte/[0.08] disabled:opacity-40" style={{ background: "transparent" }}><Archive className="h-3.5 w-3.5" />Abandonner</button>
          <button role="menuitem" type="button" onClick={() => { setOuvert(false); onSupprimer(); }} disabled={clos} title="Supprimer définitivement : le dossier disparaît et sa fiche ne compte plus comme importée"
            className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-alerte hover:bg-alerte/[0.08] disabled:opacity-40" style={{ background: "transparent" }}><Trash2 className="h-3.5 w-3.5" />Supprimer</button>
        </div>
      )}
    </div>
  );
}
