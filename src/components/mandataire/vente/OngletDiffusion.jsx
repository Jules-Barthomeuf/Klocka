import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2, Pencil, Send, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import AnnoncesBien from "@/components/mandataire/AnnoncesBien";
import { toast } from "@/components/ui/avis";
import Loader from "@/components/ui/Loader";
import TeaserBien, { ActionsTeaser } from "@/components/mandataire/Teaser";
import { bouton, boutonPlein } from "@/components/off-market/commun";

// L'onglet Diffusion de la Mise en vente (7 nov. 2026, Jules) : à gauche le teaser tel que l'acquéreur le lira, modifiable
// et téléchargeable ; à droite les annonces par canal (contacts et qualifiés, jamais de vues), les envois ciblés aux
// acquéreurs qui collent au bien et les réseaux partenaires. Klocka n'envoie rien : un envoi ouvre la messagerie.
// Le serveur : GET /api/mandataire/marches/:id/diffusion, POST …/envois, POST …/reseaux/:cle.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const mailto = (m) => `mailto:${encodeURIComponent(m?.a || "")}?subject=${encodeURIComponent(m?.objet || "")}&body=${encodeURIComponent(m?.corps || "")}`;

function Titre({ children, n = null }) {
  return <p className="m-0 mb-2 text-[12.5px] text-brume">{children}{n != null ? <span className="tabular-nums"> · {n}</span> : null}</p>;
}

/** Le teaser à gauche : la lecture par défaut ; « Modifier » ouvre l'éditeur du teaser, ou l'onglet du teaser (`onModifier`). */
function TeaserDiffusion({ marcheId, onModifier }) {
  const [mode, setMode] = useState("lecture");
  const [pdf, setPdf] = useState(false);
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/teaser`;
  // La même lecture que TeaserBien (même clé) : elle ne part qu'une fois.
  const { data, isLoading } = useQuery({ queryKey: ["m-teaser", marcheId], queryFn: () => base44.request("GET", url) });
  const telecharger = async () => {
    setPdf(true);
    try {
      const r = await fetch(`${url}/pdf`, { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || "Le PDF ne s'est pas fait."); }
      const nom = decodeURIComponent((r.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || "Teaser.pdf");
      const lien = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = lien; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(lien), 4000);
    } catch (e) { toast.error(e?.message || "Le PDF ne s'est pas fait"); } finally { setPdf(false); }
  };
  if (isLoading) return <Loader titre="Le teaser…" />;
  if (!data?.teaser) return <p className="m-0 py-8 text-center text-[13.5px] text-brume">Le teaser n'est pas encore prêt.</p>;
  const edition = mode !== "lecture";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Titre>Teaser</Titre>
        <span className="flex-1" />
        {edition ? (
          <>
            <ActionsTeaser marcheId={marcheId} mode={mode} onMode={setMode} onValide={() => setMode("lecture")} />
            <button type="button" onClick={() => setMode("lecture")} aria-label="Fermer l'éditeur" title="Fermer l'éditeur"
              className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => (onModifier ? onModifier() : setMode("edition"))} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>
              <Pencil className="h-3.5 w-3.5" />Modifier
            </button>
            <button type="button" onClick={telecharger} disabled={pdf} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>
              {pdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Télécharger
            </button>
          </>
        )}
      </div>
      <TeaserBien marcheId={marcheId} mode={mode} />
    </div>
  );
}

function Annonces({ canaux, ouvert = null, onOuvrir }) {
  return (
    <section aria-label="Annonces">
      <Titre n={canaux.length || null}>Annonces</Titre>
      {canaux.length ? (
        <ul className="m-0 list-none border-y border-trait p-0">
          {canaux.map((c) => (
            // Une ligne s'ouvre à gauche, son texte à copier (8 nov. 2026, Jules : « je ne peux pas cliquer sur les annonces »).
            <li key={c.cle} role="button" tabIndex={0} onClick={() => onOuvrir(c.cle)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOuvrir(c.cle); } }}
              className={`flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 border-t border-trait px-2 py-3 transition-colors first:border-t-0 hover:bg-relief/60 ${ouvert === c.cle ? "bg-relief" : ""}`}>
              <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{c.nom}</span>
              <span className={`flex-none rounded-full px-2.5 py-0.5 text-[12px] ${c.statut === "en_ligne" ? "bg-pervenche/15 text-pervenche" : "bg-relief text-ardoise"}`}>
                {c.statut === "en_ligne" ? `En ligne${c.le ? ` depuis le ${jour(c.le)}` : ""}` : "Brouillon"}
              </span>
              <span className="w-full text-[12.5px] text-ardoise sm:w-auto">
                <span className="tabular-nums text-encre">{c.contacts ?? 0}</span> contact{(c.contacts ?? 0) > 1 ? "s" : ""} · <span className="tabular-nums text-encre">{c.qualifies ?? 0}</span> qualifié{(c.qualifies ?? 0) > 1 ? "s" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 border-y border-trait py-4 text-[13.5px] text-brume">Aucune annonce pour l'instant.</p>}
    </section>
  );
}

function Envois({ marcheId, cibles, enLocation = false }) {
  const qc = useQueryClient();
  const cle = ["m-diffusion", marcheId];
  const envoyer = useMutation({
    mutationFn: (acquereur_id) => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/envois`, { body: { acquereur_id } }),
    onSuccess: (r, acquereur_id) => {
      if (r?.mail) window.location.href = mailto(r.mail);
      const le = new Date().toISOString();
      qc.setQueryData(cle, (d) => (d ? { ...d, cibles: (d.cibles || []).map((c) => (c.acquereur_id === acquereur_id ? { ...c, envoye_le: c.envoye_le || le } : c)) } : d));
      ["m-acquereurs", "m-vente-etat"].forEach((k) => qc.invalidateQueries({ queryKey: [k, marcheId] }));
    },
    onError: (e) => toast.error(e?.message || "Le mail ne s'est pas préparé"),
  });
  return (
    <section aria-label="Envois ciblés" className="mt-7">
      <Titre n={cibles.length || null}>Envois ciblés</Titre>
      {cibles.length ? (
        <ul className="m-0 list-none border-y border-trait p-0">
          {cibles.map((c) => (
            <li key={c.acquereur_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-trait py-3 first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[14.5px] text-encre">{c.nom}</p>
                {c.pourquoi && <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">{c.pourquoi}</p>}
              </div>
              {c.envoye_le ? <span className="flex-none text-[12.5px] text-brume">Envoyé le {jour(c.envoye_le)}</span> : (
                <button type="button" onClick={() => envoyer.mutate(c.acquereur_id)} disabled={envoyer.isPending}
                  className={`${boutonPlein} h-8 flex-none text-[12.5px]`}>
                  {envoyer.isPending && envoyer.variables === c.acquereur_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Envoyer le teaser
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="m-0 border-y border-trait py-4 text-[13.5px] text-brume">{enLocation ? "Aucun candidat de vos contacts ne colle encore à ce local." : "Aucun acquéreur de vos contacts ne colle encore à ce bien."}</p>}
    </section>
  );
}

function Reseaux({ marcheId, reseaux }) {
  const qc = useQueryClient();
  const proposer = useMutation({
    mutationFn: (cle) => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/reseaux/${encodeURIComponent(cle)}`),
    onSuccess: () => { toast.success("Bien proposé au réseau"); qc.invalidateQueries({ queryKey: ["m-diffusion", marcheId] }); },
    onError: (e) => toast.error(e?.message || "Non proposé"),
  });
  if (!reseaux.length) return null;
  return (
    <section aria-label="Réseaux partenaires" className="mt-7">
      <Titre>Réseaux partenaires</Titre>
      <ul className="m-0 list-none border-y border-trait p-0">
        {reseaux.map((r) => (
          <li key={r.cle} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-trait py-3 first:border-t-0">
            <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{r.nom}</span>
            {r.propose_le ? <span className="flex-none text-[12.5px] text-ardoise">{r.statut_texte || `Proposé le ${jour(r.propose_le)}`}</span>
              : r.possible === false ? (
                <span className="flex flex-none items-center gap-2">
                  <span className="text-[12.5px] text-brume">{r.statut_texte || "Pas encore possible"}</span>
                  <button type="button" disabled className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }} title={r.statut_texte || undefined}>Proposer</button>
                </span>
              ) : (
                <span className="flex flex-none items-center gap-2">
                  {r.statut_texte && <span className="text-[12.5px] text-ardoise">{r.statut_texte}</span>}
                  <button type="button" onClick={() => proposer.mutate(r.cle)} disabled={proposer.isPending} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>
                    {proposer.isPending && proposer.variables === r.cle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}Proposer
                  </button>
                </span>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OngletDiffusion({ marcheId, bien = null, onModifier = null }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["m-diffusion", marcheId],
    queryFn: () => base44.request("GET", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/diffusion`),
    enabled: !!marcheId,
  });
  const enLocation = bien?.proprietaire?.biens?.transaction === "location";
  const [canal, setCanal] = useState(null);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* À gauche, le teaser ou les annonces : une ligne d'annonce touchée ouvre son canal ; la bascule revient au teaser. */}
      <div className="min-w-0">
        <div className="mb-4 flex w-fit gap-0.5 rounded-full border border-bord-doux bg-rail p-1" role="tablist" aria-label="Teaser ou annonces">
          {[["teaser", "Teaser"], ["annonces", "Annonces"]].map(([k, mot]) => {
            const actif = (k === "teaser") === !canal;
            return (
              <button key={k} type="button" role="tab" aria-selected={actif} onClick={() => setCanal(k === "teaser" ? null : canal || data?.canaux?.[0]?.cle || "leboncoin")}
                className={`h-7 rounded-full px-3.5 text-[13px] ${actif ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`} style={actif ? undefined : { background: "transparent" }}>{mot}</button>
            );
          })}
        </div>
        {canal ? <AnnoncesBien marcheId={marcheId} dossierId={bien?.dossier?.id || null} canalInitial={canal} /> : <TeaserDiffusion marcheId={marcheId} onModifier={onModifier} />}
      </div>
      <div className="min-w-0">
        {isLoading ? <Loader titre="La diffusion…" /> : isError || !data ? <p className="m-0 py-8 text-[13.5px] text-alerte">La diffusion ne se charge pas.</p> : (
          <>
            <Annonces canaux={data.canaux || []} ouvert={canal} onOuvrir={setCanal} />
            <Envois marcheId={marcheId} cibles={data.cibles || []} enLocation={enLocation} />
            <Reseaux marcheId={marcheId} reseaux={data.reseaux || []} />
            <p className="m-0 mt-6 text-[12.5px] leading-[1.55] text-brume">Les clients de Klocka restent anonymes : vous voyez leur statut, pas leur nom.</p>
          </>
        )}
      </div>
    </div>
  );
}
