import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Clapperboard, ExternalLink, Plus } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J, alpha } from "@/design/jetons";
import { Bouton, BoutonFichier, Carte, EnTete, Frise, LienFichier, dateCourte, euros, formDe } from "@/components/mandataire/kit";

// Mise en marché, porte 3 (spécification V1, section 10). Après le go :
// Klocka produit le dossier investisseur, le mandataire tourne la vidéo,
// Klocka présente le bien aux clients et transmet les offres validées ; le
// mandataire négocie avec le vendeur, puis suit le bien jusqu'à l'acte.

const API = "/api/mandataire/marches";
export const ETAPES_MARCHE = [["preparation", "Dossier en préparation"], ["presente", "Présenté aux clients"], ["offre", "Offre"], ["compromis", "Compromis"], ["acte", "Acte"], ["commission_payee", "Commission payée"]];
const LIVRABLES = [["teaser", "Teaser"], ["fiche_deal", "Fiche deal"], ["data_room", "Data room"]];
const REPONSES = { acceptee: "Acceptée par le vendeur", refusee: "Refusée", contre_offre: "Contre-offre du vendeur" };

// Le guide de tournage : ce qu'un investisseur veut voir, dans l'ordre.
const GUIDE = [
  ["La rue, 15 secondes", "Téléphone à l'horizontale, depuis le trottoir d'en face : la façade, les voisins, le passage."],
  ["La vitrine et l'enseigne", "De près, puis en reculant : on doit lire l'enseigne et voir le linéaire de vitrine."],
  ["L'intérieur, en un seul plan", "De l'entrée vers le fond, lentement : la surface de vente, la hauteur, l'état."],
  ["Les réserves et l'arrière", "Réserve, sanitaires, accès livraison, cour : ce qui fait la valeur d'usage."],
  ["Les équipements", "Compteurs, extraction, climatisation, toiture si accessible : l'état des lieux en images."],
  ["Le commerçant, s'il accepte", "Trente secondes sur son activité et son ancienneté : rien ne rassure plus un acquéreur."],
];

export default function MandataireMarche() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-marches"], queryFn: () => base44.request("GET", API) });
  const marches = data?.marches || [];
  const types = data?.types_activite || {};
  const [ouvert, setOuvert] = useState(null);
  const [guide, setGuide] = useState(false);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ["m-marches"] });

  return (
    <div className="mx-auto max-w-[900px] px-5 pb-16 pt-6 md:px-8">
      <EnTete titre="Mise en marché" sous="Vos biens validés : le dossier investisseur, la vidéo, ce que font les clients, les offres, jusqu'à l'acte."
        action={<Bouton onClick={() => setGuide((v) => !v)}><Clapperboard className="h-4 w-4" /> Guide de tournage</Bouton>} />

      {guide && (
        <Carte className="mt-5">
          <p className="m-0 text-[11px] uppercase tracking-[.16em] text-ardoise">Guide de tournage · 2 à 3 minutes en tout</p>
          <ol className="m-0 mt-3 space-y-3 pl-0">
            {GUIDE.map(([t, d], i) => (
              <li key={t} className="flex list-none gap-3">
                <span className="grid h-6 w-6 flex-none place-items-center rounded-full text-[12px] tabular-nums" style={{ background: alpha("menthe", 0.14), color: J["menthe"] }}>{i + 1}</span>
                <span><span className="block text-[14px] text-encre">{t}</span><span className="block text-[13px] text-ardoise">{d}</span></span>
              </li>
            ))}
          </ol>
          <p className="m-0 mt-3 text-[12.5px] text-brume">Lumière du jour, pas de musique, pas de zoom numérique. Filmez sans parler : Klocka ajoute les sous-titres.</p>
        </Carte>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && <p className="m-0 text-[13.5px] text-brume">Lecture…</p>}
        {!isLoading && !marches.length && <p className="m-0 text-[13.5px] text-brume">Aucun bien en mise en marché : ils arrivent ici quand un analyste donne le go à un dossier.</p>}
        {marches.map((m) => (
          <div key={m.id}>
            <Carte actif={ouvert === m.id} onClick={() => setOuvert(ouvert === m.id ? null : m.id)}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-[15.5px] text-encre">{m.bien}</p>
                <span className="text-[12.5px] text-ardoise">{(m.activite || []).length} signe{(m.activite || []).length > 1 ? "s" : ""} d'intérêt · {(m.offres || []).length} offre{(m.offres || []).length > 1 ? "s" : ""}</span>
              </div>
              <div className="mt-3"><Frise etapes={ETAPES_MARCHE} statut={m.statut} /></div>
            </Carte>
            {ouvert === m.id && <Detail m={m} types={types} rafraichir={rafraichir} />}
          </div>
        ))}
      </div>
    </div>
  );
}

function Detail({ m, types, rafraichir }) {
  const onErr = (e) => toast.error(e?.message || "Impossible");
  const [note, setNote] = useState("");
  const video = useMutation({ mutationFn: (f) => base44.request("POST", `${API}/${m.id}/video`, { body: formDe(f), isForm: true }), onSuccess: () => { rafraichir(); toast.success("Vidéo déposée"); }, onError: onErr });
  const repondre = useMutation({ mutationFn: ({ offre, reponse }) => base44.request("POST", `${API}/${m.id}/offres/${offre}/reponse`, { body: { reponse } }), onSuccess: rafraichir, onError: onErr });
  const noter = useMutation({ mutationFn: () => base44.request("POST", `${API}/${m.id}/suivi`, { body: { texte: note } }), onSuccess: () => { setNote(""); rafraichir(); }, onError: onErr });
  const cocher = useMutation({ mutationFn: (i) => base44.request("POST", `${API}/${m.id}/suivi/${i}`), onSuccess: rafraichir, onError: onErr });
  const avance = ["compromis", "acte", "commission_payee"].includes(m.statut) || m.statut === "offre";

  return (
    <div className="mt-2 space-y-5 rounded-[16px] border border-trait px-5 py-4 max-md:px-4">
      <Section mot="Le dossier investisseur">
        <div className="flex flex-wrap gap-2">
          {LIVRABLES.map(([k, mot]) => (m.livrables?.[k] ? (
            <a key={k} href={m.livrables[k]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-menthe/40 px-3 py-1.5 text-[12.5px] text-menthe hover:bg-menthe/[0.06]">
              <ExternalLink className="h-3.5 w-3.5" /> {mot}
            </a>
          ) : (
            <span key={k} className="rounded-full border border-trait px-3 py-1.5 text-[12.5px] text-brume">{mot} · en préparation</span>
          )))}
        </div>
      </Section>

      <Section mot="La vidéo">
        <div className="flex flex-wrap items-center gap-3">
          {m.video ? <LienFichier f={m.video} /> : <span className="text-[13px] text-ardoise">À tourner sur place, avec le guide.</span>}
          <BoutonFichier mot={m.video ? "Remplacer" : "Déposer la vidéo"} accept="video/*" capture onFichier={(f) => video.mutate(f)} enCours={video.isPending} principal={!m.video} />
        </div>
      </Section>

      <Section mot="Ce que font les clients">
        {!(m.activite || []).length ? <p className="m-0 text-[13px] text-ardoise">Rien encore : l'activité s'affiche dès que Klocka présente le bien.</p> : (
          <ul className="m-0 space-y-1.5 p-0">
            {[...m.activite].reverse().map((a, i) => (
              <li key={i} className="flex list-none gap-3 text-[13.5px]">
                <span className="w-24 flex-none text-[12.5px] text-brume">{dateCourte(a.le)}</span>
                <span className="text-craie">{types[a.type] || a.type}{a.note ? ` · ${a.note}` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section mot="Les offres">
        {!(m.offres || []).length ? <p className="m-0 text-[13px] text-ardoise">Aucune offre transmise. Klocka valide chaque offre avant de vous la transmettre, avec son argumentaire.</p> : (
          <div className="space-y-3">
            {m.offres.map((o) => (
              <div key={o.id} className="rounded-[12px] border border-trait bg-surface px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="m-0 text-[20px] font-light tabular-nums text-encre">{euros(o.montant)}</p>
                  <span className="text-[12px] text-brume">{dateCourte(o.le)}</span>
                </div>
                {o.conditions && <p className="m-0 mt-1 text-[13px] text-ardoise">{o.conditions}</p>}
                {o.argumentaire && <p className="m-0 mt-2 text-[13.5px] leading-[1.55] text-craie"><span className="text-menthe">Argumentaire · </span>{o.argumentaire}</p>}
                {o.reponse ? (
                  <p className="m-0 mt-2 text-[13px]" style={{ color: o.reponse === "acceptee" ? J["menthe"] : o.reponse === "refusee" ? J["alerte"] : J["ambre"] }}>{REPONSES[o.reponse]}</p>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(REPONSES).map(([k, mot]) => <Bouton key={k} onClick={() => repondre.mutate({ offre: o.id, reponse: k })} disabled={repondre.isPending}>{mot}</Bouton>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {avance && (
        <Section mot="Jusqu'à l'acte">
          {(m.suivi_acte || []).map((s, i) => (
            <button key={i} type="button" onClick={() => cocher.mutate(i)} className="flex w-full items-center gap-3 border-t border-trait py-2.5 text-left first:border-t-0" style={{ background: "transparent" }}>
              <span className="grid h-5 w-5 flex-none place-items-center rounded border" style={{ borderColor: s.fait ? J["menthe"] : J["bord-vif"], background: s.fait ? J["menthe"] : "transparent" }}>
                {s.fait && <Check className="h-3 w-3" style={{ color: J["sur-menthe"] }} />}
              </span>
              <span className={`text-[13.5px] ${s.fait ? "text-brume line-through" : "text-craie"}`}>{s.texte}</span>
            </button>
          ))}
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (note.trim()) noter.mutate(); }}>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Pièce manquante, relance notaire…"
              className="min-w-0 flex-1 rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
            <Bouton type="submit" disabled={!note.trim() || noter.isPending}><Plus className="h-3.5 w-3.5" /> Noter</Bouton>
          </form>
        </Section>
      )}

      {m.commission?.montant && (
        <p className="m-0 border-t border-trait pt-4 text-[14px] text-menthe">Commission versée : {euros(m.commission.montant)} le {dateCourte(m.commission.payee_le)}</p>
      )}
    </div>
  );
}

function Section({ mot, children }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <section>
      <button type="button" onClick={() => setOuvert((v) => !v)} className="mb-2 flex w-full items-center gap-2 text-left" style={{ background: "transparent" }}>
        <span className="flex-1 text-[11.5px] uppercase tracking-[.1em] text-brume">{mot}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${ouvert ? "" : "-rotate-90"}`} />
      </button>
      {ouvert && children}
    </section>
  );
}
