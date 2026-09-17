import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Bouton, Etiquette, TEINTES, joliNom } from "@/components/alx/alx-commun";
import { J } from "@/design/jetons";

// Le vendeur du dossier, vu par ALX.
//
// À gauche, le propriétaire des murs : qui vend vraiment derrière l'agent,
// sa société, ses gérants (tranche d'âge seulement), depuis quand il détient,
// où il siège. À droite, pourquoi il vend : les signaux d'ALX sur ce
// propriétaire, et ce que l'étude des vendeurs en dit. Chaque dossier lu est
// un vendeur réel de plus dans l'étude, qui affine la prédiction sur les rues
// prospectées. Quand l'agent a dit la vraie raison, on la note ici.

const val = (champ) => {
  const v = champ?.valeur;
  return v == null || v === "" ? null : v;
};
const annee = (iso) => (iso ? String(iso).slice(0, 4) : null);
const anneeUtile = (iso) => (annee(iso) && Number(annee(iso)) > 1901 ? annee(iso) : null);
const nombre = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));

const TEINTE_PILE = { appeler: TEINTES.appeler, ecrire: TEINTES.ecrire, surveiller: TEINTES.surveiller, ecartee: TEINTES.ecartee };
const MOT_PILE = { appeler: "Vend maintenant", ecrire: "Vend par patience", surveiller: "Rien ne le trahissait", ecartee: "Écarté" };

/** « ×2,5 chez les vendeurs » : ce que l'étude dit d'une raison. */
function Lift({ r }) {
  if (r.lift == null) return null;
  const teinte = r.lift >= 1.2 ? TEINTES.ecrire : r.lift <= 0.8 ? TEINTES.urgence5 : TEINTES.muet;
  return (
    <span className="shrink-0 rounded-full border px-2 py-[2px] text-[11px] font-medium tabular-nums" style={{ borderColor: `${teinte}55`, color: teinte }} title={`${r.vendeurs_pct} % des vendeurs, ${r.temoins_pct} % des commerces qui ne vendent pas`}>
      ×{String(r.lift).replace(".", ",")}
    </span>
  );
}

export default function MarcheVendeur({ lot, dossier, adresse, premiere = false }) {
  const client = useQueryClient();
  const l = lot?.lot || {};
  const corps = {
    adresse,
    locataire: val(l.locataire_nom),
    activite: val(l.activite) || val(l.activite_locataire),
    bail_echeance: val(l.bail_echeance),
    loyer_annuel: Number(val(l.loyer_annuel_ht_hc)) || null,
    surface: Number(val(l.surface_m2)) || null,
    dossier_id: dossier?.id || null,
  };
  const numerotee = /^\d/.test(String(adresse || "").trim());
  const { data: o, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["alx-vendeur", adresse],
    queryFn: () => base44.request("POST", "/api/alx/vendeur", { body: corps }),
    enabled: !!adresse && numerotee,
    staleTime: 3600000,
    retry: false,
  });
  const { data: liste } = useQuery({ queryKey: ["alx-vendeur-raisons"], queryFn: () => base44.request("GET", "/api/alx/vendeur/raisons"), staleTime: Infinity });
  const relire = useMutation({
    mutationFn: () => base44.request("POST", "/api/alx/vendeur", { body: { ...corps, forcer: true } }),
    onSuccess: (r) => client.setQueryData(["alx-vendeur", adresse], r),
  });
  const [raisonCle, setRaisonCle] = useState(null);
  const [raisonTexte, setRaisonTexte] = useState("");
  const poser = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/vendeur/${o.id}/raison`, { body: { raison_cle: raisonCle, raison: raisonTexte || null } }),
    onSuccess: (r) => { client.setQueryData(["alx-vendeur", adresse], { ...o, ...r.observation }); setRaisonCle(null); setRaisonTexte(""); },
  });

  if (!adresse || !numerotee) return null;
  if (isLoading) {
    return (
      <section className={premiere ? "" : "mt-[34px] border-t border-trait pt-7"}>
        <Etiquette>Le vendeur · ALX</Etiquette>
        <div className="mt-2 text-[13.5px] text-ardoise">ALX cherche le propriétaire des murs chez Data Foncier, puis sa société, le BODACC et DVF…</div>
      </section>
    );
  }
  if (error || !o) {
    return (
      <section className={premiere ? "" : "mt-[34px] border-t border-trait pt-7"}>
        <Etiquette>Le vendeur · ALX</Etiquette>
        <div className="mt-2 text-[13.5px] text-ardoise">{error?.message || "ALX n'a pas pu lire le vendeur."}</div>
        <button onClick={() => refetch()} className="mt-2 text-[12.5px] text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Réessayer</button>
      </section>
    );
  }

  const c = o.cible || {};
  const p = c.proprietaire || null;
  const s = c.societe || {};
  const gerants = (s.gerants || []).slice(0, 5);
  const teinte = TEINTE_PILE[o.pile] || TEINTES.surveiller;
  // Dans un immeuble à plusieurs propriétaires, la vente DVF sur la parcelle
  // peut être celle d'un autre lot : elle ne date la détention que si le
  // propriétaire est seul.
  const seul = !(o.foncier?.autres?.length);
  const depuis = seul && c.mutation?.du_local && c.mutation.date ? `propriétaire des murs depuis ${annee(c.mutation.date)}` : anneeUtile(s.creation) ? `société créée en ${anneeUtile(s.creation)}` : null;
  const meta = [p?.forme || s.forme || (p?.nom ? "Personne physique" : null), depuis, s.siege?.ville ? `siège à ${joliNom(s.siege.ville)}` : null, p?.droit && !/pleine/i.test(p.droit) ? p.droit : null].filter(Boolean).join(" · ");
  const lotsRdc = (p?.lots || []).filter((x) => x.rez_de_chaussee).length;
  const raisons = o.raisons || { signaux: [], drapeaux: [], traits: [], contre: [] };
  const etude = o.etude || {};

  return (
    <section className={premiere ? "" : "mt-[34px] border-t border-trait pt-7"}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <Etiquette>Le vendeur · ALX</Etiquette>
        <button onClick={() => relire.mutate()} disabled={relire.isPending || isFetching} className="text-[12.5px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }} aria-label="Relit Data Foncier, l'annuaire, le BODACC et DVF" title="Relit Data Foncier, l'annuaire, le BODACC et DVF">
          {relire.isPending ? "ALX relit…" : `Relire${o.du_cache ? ` · lu le ${new Date(o.le).toLocaleDateString("fr-FR")}` : ""}`}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Le propriétaire des murs */}
        <div className="flex flex-col gap-5">
          <div>
            <Etiquette className="!text-[11px]">Propriétaire des murs</Etiquette>
            <div className="mt-1.5 text-[18px] font-light tracking-[-.02em] text-encre">{p?.nom ? joliNom(p.nom) : o.foncier?.autres?.length ? "Plusieurs, à départager" : "Introuvable"}</div>
            {meta && <div className="mt-1 text-[12.5px] text-ardoise">{meta}</div>}
            {o.foncier?.motif_choix && <div className="mt-1 text-[12.5px] text-brume">{o.foncier.motif_choix}{o.foncier.adresse_fiche ? ` · fiche ${o.foncier.adresse_fiche}` : ""}</div>}
            {c.proprietaire_occupant && <div className="mt-1 text-[12.5px]" style={{ color: TEINTES.appeler }}>L'exploitant vend ses propres murs.</div>}
          </div>

          {gerants.length > 0 && (
            <div>
              <Etiquette className="!text-[11px]">Gérants</Etiquette>
              <div className="mt-1.5 flex flex-col">
                {gerants.map((g, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-3 border-t border-trait py-2">
                    <span className="text-[13.5px] text-encre">{joliNom(g.nom)}{g.qualite ? <span className="text-ardoise"> · {g.qualite}</span> : null}</span>
                    <span className="text-[12.5px] tabular-nums text-craie">{g.tranche_age ? `${g.tranche_age} ans` : "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            {[
              ["Lots au rez-de-chaussée", p ? `${lotsRdc || "—"}${(p.lots || []).length > lotsRdc ? ` sur ${(p.lots || []).length} dans l'immeuble` : ""}` : "—"],
              ["Autres propriétaires", o.foncier?.autres?.length ? `${o.foncier.autres.length} dans l'immeuble` : "aucun"],
              ["Établissements", s.nombre_etablissements != null ? nombre(s.nombre_etablissements) : "—"],
              [seul ? "Dernière vente du local" : "Dernière vente sur la parcelle", c.mutation?.du_local ? `${annee(c.mutation.date)}${c.mutation.prix ? ` · ${nombre(c.mutation.prix)} €` : ""}${c.mutation.surface ? ` · ${nombre(c.mutation.surface)} m²` : ""}` : c.dvf?.n ? `aucune ; ${c.dvf.n} vente${c.dvf.n > 1 ? "s" : ""} à 40 m` : "—"],
            ].map(([mot, v]) => (
              <div key={mot}>
                <Etiquette className="!text-[11px]">{mot}</Etiquette>
                <div className="mt-1 text-[13.5px] font-medium tabular-nums text-encre">{v}</div>
              </div>
            ))}
          </div>

          {(c.evenements || []).length > 0 && (
            <div>
              <Etiquette className="!text-[11px]">Au BODACC, trois ans</Etiquette>
              <div className="mt-1.5 flex flex-col gap-1">
                {c.evenements.slice(0, 4).map((e, i) => (
                  <div key={i} className="flex gap-3 text-[12.5px] text-craie"><span className="shrink-0 tabular-nums text-[11px] text-ardoise">{String(e.date).slice(0, 10)}</span><span className="min-w-0 truncate">{e.type}{e.detail ? ` · ${e.detail}` : ""}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Pourquoi il vend */}
        <div className="flex flex-col gap-4 rounded-[14px] border px-5 py-4" style={{ borderColor: `${teinte}47` }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Etiquette>Pourquoi il vend</Etiquette>
            <Etiquette teinte={teinte}>{MOT_PILE[o.pile] || o.pile}</Etiquette>
          </div>
          <p className="m-0 text-[13.5px] leading-[1.6] text-encre">{o.phrase}</p>

          {(raisons.signaux.length > 0 || raisons.drapeaux.length > 0) && (
            <div className="flex flex-col gap-2.5">
              {raisons.signaux.map((r) => (
                <div key={r.cle} className="flex items-start gap-3">
                  <span style={{ color: teinte }}>—</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[13.5px] text-encre">{r.libelle}{r.valeur ? <span className="text-ardoise">· {r.valeur}</span> : null}<Lift r={r} /></div>
                    {r.detail && <div className="mt-0.5 text-[12.5px] leading-[1.55] text-ardoise">{r.detail}</div>}
                  </div>
                </div>
              ))}
              {raisons.drapeaux.map((d) => (
                <div key={d.cle} className="flex items-start gap-3">
                  <span className="text-ardoise">—</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] text-craie">{d.libelle}{d.valeur ? <span className="text-ardoise"> · {d.valeur}</span> : null}</div>
                    {d.detail && <div className="mt-0.5 text-[12.5px] leading-[1.55] text-ardoise">{d.detail}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {raisons.traits.length > 0 && (
            <div>
              <Etiquette className="!text-[11px]">Ce que l'étude des vendeurs ajoute</Etiquette>
              <div className="mt-1.5 flex flex-col gap-1.5">
                {raisons.traits.map((t) => (
                  <div key={t.cle} className="flex flex-wrap items-center gap-2 text-[13.5px] text-craie">{t.libelle}<Lift r={t} /></div>
                ))}
              </div>
            </div>
          )}
          {raisons.contre.length > 0 && (
            <div className="text-[12.5px] leading-[1.55] text-ardoise">Joue contre : {raisons.contre.map((t) => `${t.libelle.toLowerCase()} (×${String(t.lift).replace(".", ",")})`).join(", ")}.</div>
          )}

          <div className="mt-auto border-t border-trait pt-3">
            <Etiquette className="!text-[11px]">La vraie raison, si l'agent l'a dite</Etiquette>
            {o.raison_reelle && raisonCle == null ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px] text-encre">
                {o.raison_reelle.mot}{o.raison_reelle.detail ? <span className="text-ardoise">· {o.raison_reelle.detail}</span> : null}
                <button onClick={() => setRaisonCle(o.raison_reelle.cle)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Changer</button>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-col gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {(liste?.raisons || []).map((r) => (
                    <button key={r.cle} onClick={() => setRaisonCle(r.cle)} className="rounded-full border px-2.5 py-1 text-[12.5px] transition-colors" style={{ borderColor: raisonCle === r.cle ? J["menthe"] : "rgba(255,255,255,0.1)", color: raisonCle === r.cle ? J["menthe"] : J["craie"], background: raisonCle === r.cle ? "rgba(150,192,184,0.1)" : "transparent" }}>{r.mot}</button>
                  ))}
                </div>
                {raisonCle && (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={raisonTexte} onChange={(e) => setRaisonTexte(e.target.value)} placeholder="Un mot de plus, si vous voulez" className="min-w-0 flex-1 rounded-[10px] border border-trait bg-surface px-3 py-1.5 text-[12.5px] text-encre outline-none focus:border-menthe/50" />
                    <Bouton principal onClick={() => poser.mutate()} disabled={poser.isPending}>{poser.isPending ? "…" : "ALX retient"}</Bouton>
                    <Bouton discret onClick={() => { setRaisonCle(null); setRaisonTexte(""); }}>Annuler</Bouton>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="m-0 mt-4 text-[11px] text-brume">
        Data Foncier (Data-B) · annuaire des entreprises · BODACC · DVF · loyer de la rue Data-B · sans crédit, gardé trente jours.
        {etude.vendeurs != null ? ` L'étude compare ${etude.vendeurs} vendeurs (${etude.projets} projets Klocka, ${etude.dossiers} dossier${etude.dossiers > 1 ? "s" : ""}) à ${etude.temoins} commerces qui ne vendent pas ; ce dossier en fait partie.` : ""}
      </p>
    </section>
  );
}
