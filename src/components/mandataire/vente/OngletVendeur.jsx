import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Mail, Sparkles } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Loader from "@/components/ui/Loader";
import { bouton, boutonPlein } from "@/components/off-market/commun";

// L'onglet Vendeur de la Mise en vente (7 nov. 2026, Jules) : le rapport à donner au vendeur, depuis la mise en ligne :
// les chiffres, la diffusion, les visites (impressions et réserves), les offres, les pièces qui manquent ; puis
// « Rédiger la recommandation », que l'assistant écrit avec son mail, ouvert dans la messagerie du mandataire.
// Klocka n'envoie rien. Le serveur : GET /api/mandataire/marches/:id/rapport-vendeur, POST …/rapport-vendeur/recommandation.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
const montant = (n) => {
  if (n == null || n === "" || !isFinite(Number(n))) return null;
  const v = Number(n);
  return Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(v).toLocaleString("fr-FR")} €`;
};
const mailto = (m) => `mailto:${encodeURIComponent(m?.a || "")}?subject=${encodeURIComponent(m?.objet || "")}&body=${encodeURIComponent(m?.corps || "")}`;
const CHIFFRES = { contacts: "Contacts", qualifies: "Qualifiés", visites: "Visites", offres: "Offres", jours_en_ligne: "Jours en ligne" };

function Section({ titre, children }) {
  return (
    <section className="mt-7">
      <p className="m-0 mb-2 text-[11px] uppercase tracking-[.16em] text-brume">{titre}</p>
      {children}
    </section>
  );
}
const Vide = ({ children }) => <p className="m-0 border-y border-trait py-4 text-[13.5px] text-brume">{children}</p>;

/** Les chiffres : un objet { contacts, visites… } ou une liste [{ mot, valeur }]. */
function lireChiffres(c) {
  if (!c) return [];
  if (Array.isArray(c)) return c.filter((x) => x && x.valeur != null).map((x) => [x.mot || x.cle, x.valeur]);
  if (typeof c === "object") return Object.entries(c).filter(([, v]) => typeof v === "number" || typeof v === "string").map(([k, v]) => [CHIFFRES[k] || k, v]);
  return [];
}

export default function OngletVendeur({ marcheId }) {
  const [reco, setReco] = useState(null);
  const { data: r, isLoading, isError } = useQuery({
    queryKey: ["m-rapport-vendeur", marcheId],
    queryFn: () => base44.request("GET", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/rapport-vendeur`),
    enabled: !!marcheId,
  });
  const rediger = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/rapport-vendeur/recommandation`),
    onSuccess: (x) => setReco(x || null),
    onError: (e) => toast.error(e?.message || "La recommandation ne s'est pas rédigée"),
  });
  if (isLoading) return <Loader titre="Le rapport…" />;
  if (isError || !r) return <p className="m-0 py-8 text-[14px] text-alerte">Le rapport ne se charge pas.</p>;
  if (r.pret === false) {
    return <p className="m-0 border-y border-trait py-10 text-center text-[13.5px] text-brume">Le rapport se remplit une fois le bien en ligne : contacts, visites et offres s'y retrouveront.</p>;
  }
  const chiffres = lireChiffres(r.chiffres);
  const diffusion = Array.isArray(r.diffusion) ? r.diffusion : [];
  const visites = r.visites || [];
  const offres = Array.isArray(r.offres) ? r.offres : [];
  const manquantes = r.pieces_manquantes || [];
  const depuis = typeof r.depuis === "number" ? `En vente depuis ${r.depuis} jour${r.depuis > 1 ? "s" : ""}` : r.depuis ? `En vente depuis le ${jour(r.depuis)}` : null;
  const recommandation = reco?.recommandation || r.recommandation || null;
  const mail = reco?.mail || null;

  return (
    <section aria-label="Le rapport au vendeur">
      {depuis && <p className="m-0 text-[13.5px] text-ardoise">{depuis}</p>}

      <Section titre="Les chiffres">
        {chiffres.length ? (
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {chiffres.map(([mot, v]) => (
              <div key={mot}><p className="m-0 text-[18px] tabular-nums text-encre">{v}</p><p className="m-0 text-[12.5px] text-ardoise">{mot}</p></div>
            ))}
          </div>
        ) : <Vide>Pas encore de chiffres.</Vide>}
      </Section>

      <Section titre="La diffusion">
        {diffusion.length ? (
          <ul className="m-0 list-none border-y border-trait p-0">
            {diffusion.map((d, i) => (typeof d === "string"
              ? <li key={i} className="border-t border-trait py-2.5 text-[13.5px] text-encre first:border-t-0">{d}</li>
              : (
                <li key={d.cle || i} className="flex flex-wrap items-baseline gap-x-3 border-t border-trait py-2.5 text-[13.5px] first:border-t-0">
                  <span className="min-w-0 flex-1 text-encre">{d.nom || d.mot}</span>
                  <span className="text-ardoise">{[d.statut === "en_ligne" ? "En ligne" : d.statut === "brouillon" ? "Brouillon" : d.statut_texte || null,
                    d.contacts != null ? `${d.contacts} contact${d.contacts > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</span>
                </li>
              )))}
          </ul>
        ) : typeof r.diffusion === "string" ? <p className="m-0 text-[14px] leading-[1.55] text-encre">{r.diffusion}</p> : <Vide>Rien n'est encore diffusé.</Vide>}
      </Section>

      <Section titre="Les visites">
        {visites.length ? (
          <ul className="m-0 list-none border-y border-trait p-0">
            {visites.map((x, i) => (
              <li key={`${x.le}-${i}`} className="border-t border-trait py-3 first:border-t-0">
                <p className="m-0 text-[14.5px] text-encre">{x.nom || "Visiteur"}<span className="text-[12.5px] text-ardoise">{x.le ? ` · ${jour(x.le)}` : ""}</span></p>
                {x.impression && <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-craie">{x.impression}</p>}
                {x.reserves && <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-ambre">Réserves : {x.reserves}</p>}
              </li>
            ))}
          </ul>
        ) : <Vide>Aucune visite pour l'instant.</Vide>}
      </Section>

      <Section titre="Les offres">
        {offres.length ? (
          <ul className="m-0 list-none border-y border-trait p-0">
            {offres.map((o, i) => (
              <li key={o.id || i} className="flex flex-wrap items-baseline gap-x-3 border-t border-trait py-2.5 text-[13.5px] first:border-t-0">
                <span className="min-w-0 flex-1 text-encre">{o.nom || "Offre"}{o.le ? <span className="text-ardoise"> · {jour(o.le)}</span> : null}</span>
                {montant(o.montant) && <span className="tabular-nums text-encre">{montant(o.montant)}</span>}
              </li>
            ))}
          </ul>
        ) : typeof r.offres === "string" ? <p className="m-0 text-[14px] text-encre">{r.offres}</p> : <Vide>Aucune offre pour l'instant.</Vide>}
      </Section>

      {manquantes.length > 0 && (
        <Section titre="Pièces manquantes">
          <ul className="m-0 list-none border-y border-trait p-0">
            {manquantes.map((p, i) => <li key={i} className="border-t border-trait py-2.5 text-[13.5px] text-ambre first:border-t-0">{typeof p === "string" ? p : p.mot || p.cle}</li>)}
          </ul>
        </Section>
      )}

      <Section titre="Recommandation">
        {recommandation && (
          <div className="rounded-[12px] bg-pervenche/10 px-4 py-3">
            <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-pervenche"><Sparkles className="h-3.5 w-3.5 flex-none" aria-hidden />L'Assistant KPartners</p>
            <p className="m-0 mt-1.5 whitespace-pre-line text-[14.5px] leading-[1.55] text-encre">{recommandation}</p>
          </div>
        )}
        {mail && (
          <div className="mt-3 rounded-[12px] border border-bord-doux bg-surface/40 px-4 py-3">
            <p className="m-0 text-[12.5px] text-ardoise">Objet</p>
            <p className="m-0 text-[14px] text-encre">{mail.objet}</p>
            <p className="m-0 mt-3 whitespace-pre-wrap text-[14px] leading-[1.6] text-craie">{mail.corps}</p>
            <a href={mailto(mail)} className={`${boutonPlein} mt-3`}><Mail className="h-4 w-4" />Ouvrir dans ma messagerie</a>
          </div>
        )}
        <button type="button" onClick={() => rediger.mutate()} disabled={rediger.isPending}
          className={`${recommandation ? bouton : boutonPlein} ${recommandation || mail ? "mt-3" : ""}`} style={recommandation ? { background: "transparent" } : undefined}>
          {rediger.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{recommandation ? "Rédiger de nouveau" : "Rédiger la recommandation"}
        </button>
      </Section>
    </section>
  );
}
