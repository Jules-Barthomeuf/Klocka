import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Archive, ArrowRight, Check, Loader2, Lock, MoreHorizontal, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import FilDossier from "@/components/mandataire/FilDossier";
import ClientsCorrespondants from "@/components/admin/ClientsCorrespondants";
import { VuesLieu } from "@/components/preanalyse/DealResultat";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { FRISE, etapeFrise } from "@/lib/dossiers-architecture";

// Les pièces du dossier ouvert (17 oct. 2026, Jules) : la frise de huit
// étapes, le verdict, l'action suivante, la colonne de droite (investisseurs
// compatibles, documents, livrables, fil) et les trois vues nouvelles
// (Réception, Clients, Offre). Les étapes qui existaient déjà (pré-analyse,
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

/** La frise : huit étapes, la faite cochée, l'atteinte soulignée, l'ouverte pleine, la fermée avec un cadenas. */
export function FriseDossier({ vue, atteinte, debloquee, onAller, occupe = false }) {
  return (
    <nav aria-label="Étapes du dossier" className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol className="m-0 grid min-w-[760px] list-none grid-cols-8 gap-1 p-0">
        {FRISE.map((e) => {
          const ouverte = vue === e.id;
          const faite = e.n < atteinte;
          const ferme = PORTE[e.id] > debloquee && e.n > atteinte;
          return (
            <li key={e.id} className="min-w-0">
              <button type="button" onClick={() => onAller(e.id)} disabled={occupe} aria-current={ouverte ? "step" : undefined}
                title={ferme ? "Ouvrir cette étape valide les précédentes" : undefined}
                className={`group flex w-full flex-col items-start gap-2 rounded-[12px] px-3 py-2.5 text-left transition-colors ${ouverte ? "bg-rail-actif" : "hover:bg-rail"}`} style={ouverte ? undefined : { background: "transparent" }}>
                <span className={`h-[3px] w-full rounded-full transition-colors duration-500 ${faite || e.n === atteinte ? "bg-menthe" : "bg-encre/[0.12]"}`} />
                <span className="flex min-w-0 items-center gap-2">
                  <span className={`grid h-[20px] w-[20px] flex-none place-items-center rounded-full text-[11px] tabular-nums ${ouverte ? "bg-encre text-fond" : faite ? "bg-menthe text-sur-menthe" : "bg-relief text-craie"}`}>
                    {faite && !ouverte ? <Check className="h-3 w-3" /> : ferme ? <Lock className="h-2.5 w-2.5" /> : e.n}
                  </span>
                  <span className={`truncate text-[13px] ${ouverte ? "text-encre" : ferme ? "text-brume" : "text-craie group-hover:text-encre"}`}>{e.label}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const TON_VERDICT = { GO: "text-menthe border-menthe/50", "GO SOUS RÉSERVE": "text-ambre border-ambre/50", INSUFFISANT: "text-ambre border-ambre/50", "NO-GO": "text-alerte border-alerte/50" };

/** Le verdict d'AK sur le bien, avec ses chiffres, en tête de la colonne principale. */
export function VerdictDossier({ dossier }) {
  const lot = dossier?.lots?.[0];
  const verdict = lot?.evaluation?.verdict;
  if (!lot || !verdict) return null;
  const prix = lot.lot?.prix_fai?.absent === false ? lot.lot.prix_fai.valeur : null;
  const loyer = lot.lot?.loyer_annuel_ht_hc?.absent === false ? lot.lot.loyer_annuel_ht_hc.valeur : null;
  const surface = lot.lot?.surface_m2?.absent === false ? lot.lot.surface_m2.valeur : null;
  const rendement = lot.evaluation?.contexte?.rendement_net_moyen ?? lot.evaluation?.aem?.rendement_aem ?? null;
  const chiffres = [["Prix FAI", argent(prix)], ["Loyer annuel", argent(loyer)], ["Surface", surface ? `${surface} m²` : null], ["Rendement net", rendement != null ? `${String(Math.round(rendement * 10) / 10).replace(".", ",")} %` : null]].filter(([, v]) => v);
  return (
    <section aria-label="Verdict" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[16px] border border-trait bg-rail px-5 py-4">
      <div>
        <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Verdict d'AK</p>
        <span className={`mt-1.5 inline-flex h-8 items-center rounded-full border px-3.5 text-[14px] ${TON_VERDICT[verdict] || "border-trait text-craie"}`}>{verdict}</span>
      </div>
      <dl className="m-0 flex flex-1 flex-wrap gap-x-7 gap-y-2">
        {chiffres.map(([k, v]) => (
          <div key={k}><dt className="text-[12px] text-ardoise">{k}</dt><dd className="m-0 text-[16px] tabular-nums text-encre">{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

/** L'action suivante : l'étape d'après, nommée, un clic pour y passer. */
export function ActionSuivante({ vue, onAller, occupe = false }) {
  const i = FRISE.findIndex((e) => e.id === vue);
  const suivante = FRISE[i + 1];
  if (!suivante) return null;
  return (
    <section aria-label="Action suivante" className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-trait px-5 py-4">
      <div>
        <p className="m-0 text-[11px] uppercase tracking-[.16em] text-brume">Action suivante</p>
        <p className="m-0 mt-1 text-[15px] text-encre">Passer à l'étape {suivante.n}, {suivante.label}</p>
      </div>
      <button type="button" onClick={() => onAller(suivante.id)} disabled={occupe}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
        {occupe ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{suivante.label}<ArrowRight className="h-4 w-4" />
      </button>
    </section>
  );
}

function useLettres(dealId) {
  return useQuery({ queryKey: ["offres"], queryFn: () => base44.request("GET", "/api/offres"), enabled: !!dealId, select: (d) => (d.offres || []).filter((o) => o.deal_id === dealId) });
}

const bloc = "rounded-[16px] border border-trait bg-rail p-4";
const titreBloc = "m-0 mb-2.5 text-[11px] uppercase tracking-[.16em] text-brume";

/** La colonne de droite, fixe : investisseurs compatibles (d'après Monday), Street View et plan, et le fil d'un dossier de mandataire. Documents et livrables retirés le 17 oct. 2026 (Jules). */
export function ColonneDroite({ dossier, apercu = false }) {
  const lot = dossier?.lots?.[0];
  // À qui ce bien pourrait correspondre, d'après les investisseurs de Monday.
  const correspondances = useQuery({
    queryKey: ["dossier-clients", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/clients`),
    enabled: !!dossier?.deal_id && !apercu,
    staleTime: 5 * 60 * 1000,
  });
  return (
    <aside aria-label="Autour du dossier" className="flex flex-col gap-4 lg:self-start">
      <section className={bloc}>
        <p className={titreBloc}>Investisseurs compatibles</p>
        <p className="m-0 text-[12.5px] text-brume">Budget, apport et zone de recherche, d'après Monday</p>
        <ClientsCorrespondants clients={correspondances.data?.clients} chargement={correspondances.isLoading} configure={correspondances.data?.configure} erreur={correspondances.isError} />
      </section>

      {lot && !apercu && (
        <section className={bloc}>
          <p className={titreBloc}>Street View et plan</p>
          <VuesLieu lot={lot} enr={lot.enrichissement} coteACote empile dealId={dossier?.deal_id} />
        </section>
      )}

      {/* Le fil n'existe que pour un dossier de mandataire : sans lui, rien à montrer (17 oct. 2026, Jules). */}
      {dossier?.dossier_mandataire_id && !apercu && (
        <section className={bloc}>
          <p className={titreBloc}>Fil</p>
          <FilDossier dossierId={dossier.dossier_mandataire_id} cote="analyste" hauteur="max-h-none" />
        </section>
      )}
    </aside>
  );
}

const panneau = "rounded-[16px] border border-trait bg-rail px-5 py-6";

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
    <div className={panneau}>
      <h2 className="m-0 mb-4 text-[20px] font-normal text-encre">Réception</h2>
      <dl className="m-0 grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-[14px] max-md:grid-cols-1">
        {lignes.map(([k, v]) => (<React.Fragment key={k}><dt className="text-ardoise">{k}</dt><dd className="m-0 break-words text-encre">{v}</dd></React.Fragment>))}
      </dl>
    </div>
  );
}

/** Étape 6 : les clients à qui le bien est proposé. */
export function VueClients({ dossier }) {
  return (
    <div className={panneau}>
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
    <div className={panneau}>
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
        className="grid h-10 w-10 place-items-center rounded-full border border-trait text-ardoise hover:text-encre" style={{ background: "transparent" }}>
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
