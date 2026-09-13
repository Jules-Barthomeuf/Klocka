import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Bouton, Etiquette, Nombre, TEINTES, emplacementDe, euros, joliNom } from "./alx-commun";

// La fiche d'un commerce, par-dessus la liste : le propriétaire et ses gérants
// à gauche, le verdict « va vendre ou pas » et ses raisons, le loyer et le
// prix ; la devanture à droite, puis la question. « Oui » écrit le message et
// le pose en brouillon ; « Non » demande le motif, ce qu'il généralise, crée
// la règle et propose les semblables. La fiche complète reste à un clic.

const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const VERDICTS = {
  appeler: ["Va vendre", TEINTES.ecrire],
  ecrire: ["Vendra un jour", TEINTES.ecrire],
  surveiller: ["Peu de chances pour l'instant", TEINTES.appeler],
  ecartee: ["Écartée", TEINTES.muet],
};

const Case = ({ coche }) => (
  <span
    className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold"
    style={{ borderColor: coche ? "#96c0b8" : "rgba(255,255,255,0.16)", background: coche ? "#96c0b8" : "transparent", color: "#08130D" }}
  >
    {coche ? "✓" : ""}
  </span>
);

export default function FicheCommerce({ id, onFermer }) {
  const qc = useQueryClient();
  const { data: c } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  const [mode, setMode] = useState("choix"); // choix | oui | non | fait
  const [motif, setMotif] = useState("");
  const [sur, setSur] = useState({ activite: false, proprietaire: false, enseigne: false });
  const [resultat, setResultat] = useState(null); // { semblables, regle } après un non
  const [message, setMessage] = useState(null);

  useEffect(() => { setMode("choix"); setMotif(""); setSur({ activite: false, proprietaire: false, enseigne: false }); setResultat(null); setMessage(null); }, [id]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cible", id] }); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); };
  const rediger = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal: c?.proprietaire?.forme && /SCI|SARL|SAS|SA\b/.test(c.proprietaire.forme) ? "courrier" : "mail" } }),
    onSuccess: (r) => { setMessage(r); setMode("oui"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Rédaction impossible"),
  });
  const ecarter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/ecarter`, { body: { motif: motif || null, sur } }),
    onSuccess: (r) => { setResultat({ semblables: r.semblables || [], regle: r.regle }); setMode("fait"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ecarterAussi = useMutation({
    mutationFn: (ids) => base44.request("POST", `/api/alx/cibles/ecarter-plusieurs`, { body: { ids, motif: motif || null, regle_id: resultat?.regle?.id || null } }),
    onSuccess: (r, ids) => { toast.success(`${r.cibles.length} écartée${r.cibles.length > 1 ? "s" : ""} aussi`); setResultat((x) => ({ ...x, semblables: x.semblables.filter((y) => !ids.includes(y.id)) })); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  if (!id) return null;
  const p = c?.proprietaire || {};
  const s = c?.societe || {};
  const v = c?.valorisation || {};
  const e = emplacementDe(c?.emplacement || null);
  const [verdict, teinteVerdict] = VERDICTS[c?.pile] || VERDICTS.surveiller;
  const raisons = c ? [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : "")) : [];
  if (c && !raisons.length && c.motif) raisons.push(c.motif);
  const gerants = (s.gerants || []).slice(0, 4);
  const brouillon = message || c?.brouillon || null;
  const depuis = c?.mutation?.du_local && c.mutation.date ? `propriétaire des murs depuis ${String(c.mutation.date).slice(0, 4)}` : s.creation && Number(String(s.creation).slice(0, 4)) > 1901 ? `société créée en ${String(s.creation).slice(0, 4)}` : null;
  const proprioMeta = [p.forme || s.forme ? (p.forme || s.forme) : p.nom ? "Personne physique" : null, depuis].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-[rgba(4,5,5,0.74)] px-6 py-10" onClick={onFermer}>
      <div onClick={(ev) => ev.stopPropagation()} className="alx-entree w-full max-w-[1080px] overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0B0D0C]">
        {!c ? (
          <div className="p-10 text-[#8B938F]">Lecture…</div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-5 px-[30px] pt-[26px]">
              <div className="min-w-0">
                <Etiquette teinte={e.teinte}>{c.emplacement ? `Emplacement ${e.mot}` : c.rue || "Hors classement"}</Etiquette>
                <div className="alx-serif mt-2.5 text-[34px] italic leading-tight text-[#F3F7F5]">{joliNom(c.enseigne) || c.adresse}</div>
                <div className="mt-1.5 text-[14px] text-[#8B938F]">{c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.activite ? ` · ${c.activite}` : ""}</div>
              </div>
              <button onClick={onFermer} className="shrink-0 px-1.5 py-1 text-[22px] leading-none text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }} aria-label="Fermer">×</button>
            </div>

            <div className="grid grid-cols-1 gap-[26px] px-[30px] pb-[30px] pt-[26px] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
              <div className="flex min-w-0 flex-col gap-[26px]">
                <div>
                  <Etiquette>Propriétaire</Etiquette>
                  <div className="mt-2 text-[19px] text-[#F3F7F5]">{p.nom ? joliNom(p.nom) : c.foncier ? "Plusieurs, à départager" : "À établir"}</div>
                  {proprioMeta && <div className="mt-1 text-[13.5px] text-[#8B938F]">{proprioMeta}</div>}
                </div>

                {gerants.length > 0 && (
                  <div>
                    <Etiquette>Gérants</Etiquette>
                    <div className="mt-2.5 flex flex-col">
                      {gerants.map((g, i) => (
                        <div key={i} className="flex items-baseline justify-between gap-3.5 border-t border-white/[0.055] py-[11px]">
                          <span className="text-[15px] text-[#E8EFEB]">{joliNom(g.nom)}{g.qualite ? <span className="text-[#8B938F]"> · {g.qualite}</span> : null}</span>
                          <Nombre taille={13.5} teinte="#C3CBC7">{g.tranche_age ? `${g.tranche_age} ans` : "—"}</Nombre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-[14px] border px-[22px] py-5" style={{ borderColor: `${teinteVerdict}47` }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-3.5">
                    <Etiquette>Va vendre ou pas</Etiquette>
                    <Etiquette teinte={teinteVerdict}>{verdict}</Etiquette>
                  </div>
                  <div className="mt-3.5 flex flex-col gap-[9px]">
                    {raisons.map((r) => (
                      <span key={r} className="flex items-baseline gap-3 text-[14.5px] leading-[1.5] text-[#C3CBC7]"><span style={{ color: teinteVerdict }}>—</span>{r}</span>
                    ))}
                    {c.foncier?.motif_choix && <span className="text-[12.5px] text-[#8B938F]">{c.foncier.motif_choix}</span>}
                  </div>
                </div>

                <Link to={`/ALXCible?id=${c.id}`} className="text-[13.5px] text-menthe hover:text-menthe-clair">Fiche complète →</Link>
              </div>

              <div className="flex min-w-0 flex-col gap-4">
                <div className="relative h-[300px] overflow-hidden rounded-[14px] border border-white/[0.07] bg-[#0A0C0B]">
                  {CLE_EMBED ? (
                    <iframe
                      title={`Street View ${c.adresse}`}
                      src={c.lat != null && c.lon != null
                        ? `https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`
                        : `https://www.google.com/maps/embed/v1/place?key=${CLE_EMBED}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`}
                      className="h-full w-full border-0"
                      allowFullScreen
                      loading="lazy"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-[13px] text-[#8B938F]">Devanture · Street View (clé VITE_GOOGLE_MAPS_API_KEY absente)</div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <Etiquette>Loyer estimé</Etiquette>
                    <div className="mt-1.5"><Nombre taille={19} teinte="#F3F7F5">{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</Nombre></div>
                  </div>
                  <div>
                    <Etiquette>Prix estimé</Etiquette>
                    <div className="mt-1.5"><Nombre taille={19} teinte="#F3F7F5">{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</Nombre></div>
                    {v.surface && <div className="mt-1 text-[12px] text-[#8B938F]">{v.surface} m²{v.surface_source ? ` · ${v.surface_source}` : ""}</div>}
                  </div>
                </div>

                {mode === "choix" && (
                  <div className="mt-auto flex flex-col gap-3">
                    {c.pile === "ecartee" ? (
                      <div className="text-[13.5px] text-[#8B938F]">Écartée{c.ecartee_motif ? ` : ${c.ecartee_motif}` : ""}. Reprenez-la depuis la fiche complète.</div>
                    ) : (
                      <>
                        {brouillon && <div className="text-[13px] text-menthe">Un message est déjà en brouillon.</div>}
                        <div className="flex gap-2.5">
                          <Bouton principal className="flex-1" onClick={() => (brouillon ? (setMessage(brouillon), setMode("oui")) : rediger.mutate())} disabled={rediger.isPending}>{rediger.isPending ? "…" : brouillon ? "Relire" : "Oui"}</Bouton>
                          <Bouton className="flex-1" onClick={() => setMode("non")}>Non</Bouton>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {mode === "oui" && (
                  <div className="mt-auto flex flex-col gap-3.5">
                    <Etiquette teinte="#c3ddd6">Message rédigé{brouillon?.canal ? ` · ${brouillon.canal}` : ""}</Etiquette>
                    {brouillon?.objet && <div className="text-[14px] text-[#E8EFEB]">{brouillon.objet}</div>}
                    <div className="max-h-[260px] overflow-auto whitespace-pre-line rounded-[14px] border border-white/[0.08] px-5 py-[18px] text-[14.5px] leading-[1.65] text-[#C3CBC7]">{brouillon?.texte}</div>
                    <div className="flex gap-2.5">
                      <Bouton principal className="flex-1" onClick={() => { toast.success("En brouillon", { description: "À relire et envoyer dans l'onglet Messages." }); onFermer(); }}>Garder en brouillon</Bouton>
                      <Bouton onClick={() => rediger.mutate()} disabled={rediger.isPending}>{rediger.isPending ? "…" : "Réécrire"}</Bouton>
                      <Bouton discret onClick={() => setMode("choix")}>Retour</Bouton>
                    </div>
                  </div>
                )}

                {mode === "non" && (
                  <div className="mt-auto flex flex-col gap-3.5">
                    <Etiquette>Motif du non</Etiquette>
                    <input
                      value={motif}
                      onChange={(ev) => setMotif(ev.target.value)}
                      placeholder="Le gérant vient de renouveler son bail"
                      className="rounded-[12px] border border-white/[0.09] bg-[#0A0C0B] px-4 py-[13px] text-[14.5px] text-[#E8EFEB] outline-none focus:border-menthe/50"
                    />
                    <Etiquette className="mt-1">Ce non généralise</Etiquette>
                    <div className="flex flex-col gap-0.5">
                      {[["activite", `Cette activité${c.activite ? ` (${c.activite})` : ""}`], ["proprietaire", `Ce propriétaire${p.nom ? ` (${joliNom(p.nom)})` : ""}`], ["enseigne", `Cette enseigne${c.enseigne ? ` (${joliNom(c.enseigne)})` : ""}`]].map(([k, mot]) => (
                        <button key={k} type="button" onClick={() => setSur((x) => ({ ...x, [k]: !x[k] }))} className="flex items-center gap-3 py-[9px] text-left" style={{ background: "transparent" }}>
                          <Case coche={sur[k]} />
                          <span className="text-[14.5px] text-[#E8EFEB]">{mot}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex gap-2.5">
                      <Bouton principal className="flex-1" onClick={() => ecarter.mutate()} disabled={ecarter.isPending}>{ecarter.isPending ? "…" : sur.activite || sur.proprietaire || sur.enseigne ? "Créer la règle" : "Écarter"}</Bouton>
                      <Bouton discret onClick={() => setMode("choix")}>Retour</Bouton>
                    </div>
                  </div>
                )}

                {mode === "fait" && (
                  <div className="mt-auto flex flex-col gap-3.5">
                    <div className="flex items-center gap-3 rounded-[14px] border border-menthe/30 px-5 py-[18px]">
                      <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-menthe text-[12px] font-bold text-[#08130D]">✓</span>
                      <span className="text-[14.5px] text-[#C3CBC7]">
                        {resultat?.regle ? "Règle créée et rejouée sur la ville." : "Écartée, avec son motif."}
                        {resultat?.semblables?.length ? ` ${resultat.semblables.length} commerce${resultat.semblables.length > 1 ? "s" : ""} qui ressemble${resultat.semblables.length > 1 ? "nt" : ""} :` : " Aucun autre commerce semblable."}
                      </span>
                    </div>
                    {resultat?.semblables?.length > 0 && (
                      <div className="flex flex-col">
                        {resultat.semblables.map((x) => (
                          <div key={x.id} className="flex items-center justify-between gap-3 border-t border-white/[0.055] py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-[14px] text-[#E8EFEB]">{joliNom(x.enseigne) || x.adresse}</div>
                              <div className="truncate text-[12px] text-[#8B938F]">{x.raisons.join(" · ")}</div>
                            </div>
                            <div className="flex shrink-0 gap-3 text-[12.5px]">
                              <button onClick={() => ecarterAussi.mutate([x.id])} disabled={ecarterAussi.isPending} className="text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Écarter aussi</button>
                              <button onClick={() => setResultat((r) => ({ ...r, semblables: r.semblables.filter((y) => y.id !== x.id) }))} className="text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>Garder</button>
                            </div>
                          </div>
                        ))}
                        {resultat.semblables.length > 1 && (
                          <div className="mt-3 flex gap-2.5">
                            <Bouton principal onClick={() => ecarterAussi.mutate(resultat.semblables.map((x) => x.id))} disabled={ecarterAussi.isPending}>Écarter les {resultat.semblables.length}</Bouton>
                            <Bouton onClick={() => setResultat((r) => ({ ...r, semblables: [] }))}>Tout garder</Bouton>
                          </div>
                        )}
                      </div>
                    )}
                    <div><Bouton onClick={onFermer}>Fermer</Bouton></div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
