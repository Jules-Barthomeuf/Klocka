import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { Bouton, Etiquette, Nombre, TEINTES, emplacementDe, euros, Urgence, joliNom } from "@/components/alx/alx-commun";

// La fiche d'un commerce : la seule. À gauche, ce qu'on sait, le propriétaire,
// ses gérants, ce que fait le commerce, le verdict « va vendre ou pas » et ses
// raisons, le loyer et le prix ; à droite, la devanture sur Street View. Deux
// gestes en tête : écrire le message, ou écarter en disant pourquoi.

const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const VERDICTS = {
  appeler: ["Va vendre", TEINTES.ecrire],
  ecrire: ["Vendra un jour", TEINTES.ecrire],
  surveiller: ["Peu de chances pour l'instant", TEINTES.appeler],
  ecartee: ["Écartée", TEINTES.muet],
};

const annee = (iso) => (iso ? String(iso).slice(0, 4) : null);
const anneeUtile = (iso) => (annee(iso) && Number(annee(iso)) > 1901 ? annee(iso) : null);

const Case = ({ coche }) => (
  <span className="flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border text-[11px] font-bold" style={{ borderColor: coche ? "#96c0b8" : "rgba(255,255,255,0.16)", background: coche ? "#96c0b8" : "transparent", color: "#08130D" }}>
    {coche ? "✓" : ""}
  </span>
);

/** Ce que fait le commerce, en quelques phrases, avec ce qu'on a lu. */
function ceQueFait(c) {
  const o = c.occupant || {};
  const nom = joliNom(c.enseigne) || "Ce commerce";
  const phrases = [];
  phrases.push(`${nom} est ${c.activite ? `un commerce de ${c.activite.toLowerCase()}` : "un commerce de pied d'immeuble"}, au ${c.adresse}${c.ville ? ` à ${c.ville}` : ""}.`);
  if (o.nom) phrases.push(`Il est exploité par ${joliNom(o.nom)}${o.siren ? ` (SIREN ${o.siren})` : ""}${o.depuis ? `, installé ici depuis ${annee(o.depuis)}` : ""} : ${o.chaine ? "une enseigne nationale" : "un commerce indépendant"}.`);
  if (c.proprietaire_occupant) phrases.push("L'exploitant est aussi le propriétaire des murs.");
  const contacts = [c.site ? c.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null, c.telephone].filter(Boolean);
  if (contacts.length) phrases.push(`${contacts.join(" · ")}.`);
  if (c.source) phrases.push(`Vu sur ${c.source}.`);
  return phrases;
}

/** Un semblable en coup d'œil, par-dessus la fiche. */
function ApercuCible({ id, onFermer, onEcarter, onGarder, pending }) {
  const { data: c } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  if (!id) return null;
  const p = c?.proprietaire || {};
  const v = c?.valorisation || {};
  const raisons = c ? [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : "")) : [];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(4,5,5,0.74)] p-6" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="alx-entree w-full max-w-[960px] overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0B0D0C]">
        {!c ? <div className="p-10 text-[#8B938F]">Lecture…</div> : (
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="flex flex-col gap-5 p-7">
              <div>
                <Etiquette>Coup d'œil</Etiquette>
                <div className="alx-serif mt-2 text-[30px] italic leading-tight text-[#F3F7F5]">{joliNom(c.enseigne) || c.adresse}</div>
                <div className="mt-1 text-[13.5px] text-[#8B938F]">{c.adresse}{c.activite ? ` · ${c.activite}` : ""}</div>
              </div>
              <div>
                <Etiquette>Propriétaire</Etiquette>
                <div className="mt-1.5 text-[17px] text-[#F3F7F5]">{p.nom ? joliNom(p.nom) : "À établir"}</div>
              </div>
              <div>
                <Etiquette>Analyse</Etiquette>
                <div className="mt-2"><Urgence c={c} /></div>
                <div className="mt-2 flex flex-col gap-1.5 text-[13.5px] text-[#C3CBC7]">{(raisons.length ? raisons : [c.motif]).filter(Boolean).map((r) => <span key={r}>— {r}</span>)}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Etiquette>Loyer</Etiquette><div className="mt-1"><Nombre taille={15} teinte="#F3F7F5">{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</Nombre></div></div>
                <div><Etiquette>Prix</Etiquette><div className="mt-1"><Nombre taille={15} teinte="#F3F7F5">{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</Nombre></div></div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-2">
                {c.pile !== "ecartee" && <Bouton principal onClick={() => onEcarter(c.id)} disabled={pending}>Écarter aussi</Bouton>}
                <Bouton onClick={() => onGarder(c.id)}>Garder</Bouton>
                <Link to={`/ALXCible?id=${c.id}`} className="ml-1 text-[13px] text-menthe hover:text-menthe-clair">Ouvrir la fiche →</Link>
              </div>
            </div>
            <div className="min-h-[360px] bg-[#0A0C0B]">
              {CLE_EMBED && <iframe title={`Street View ${c.adresse}`} src={c.lat != null && c.lon != null ? `https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90` : `https://www.google.com/maps/embed/v1/place?key=${CLE_EMBED}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`} className="h-full min-h-[360px] w-full border-0" allowFullScreen loading="lazy" />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ALXCible() {
  const user = useUser();
  const [params] = useSearchParams();
  const id = params.get("id");
  const qc = useQueryClient();
  const { data: c, isLoading } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });

  const [mode, setMode] = useState("lecture"); // lecture | message | ecart | fait
  const [motif, setMotif] = useState("");
  const [sur, setSur] = useState({ activite: false, proprietaire: false, enseigne: false });
  const [resultat, setResultat] = useState(null); // { semblables, regle } après un écart
  const [apercu, setApercu] = useState(null);
  useEffect(() => { setMode("lecture"); setMotif(""); setSur({ activite: false, proprietaire: false, enseigne: false }); setResultat(null); }, [id]);
  useEffect(() => { if (window.location.hash === "#message" && c?.brouillon) setMode("message"); }, [c?.brouillon]);

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cible", id] }); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); qc.invalidateQueries({ queryKey: ["alx-villes"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  const rediger = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal: /SCI|SARL|SAS|SA\b/.test(c?.proprietaire?.forme || c?.societe?.forme || "") ? "courrier" : "mail" } }),
    onSuccess: () => { setMode("message"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Rédaction impossible"),
  });
  const ecarter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/ecarter`, { body: { motif: motif || null, sur } }),
    onSuccess: (r) => { toast.success("Écartée"); setResultat({ semblables: r.semblables || [], regle: r.regle }); setMode("fait"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ecarterAussi = useMutation({
    mutationFn: (ids) => base44.request("POST", `/api/alx/cibles/ecarter-plusieurs`, { body: { ids, motif: motif || null, regle_id: resultat?.regle?.id || null } }),
    onSuccess: (r, ids) => { toast.success(`${r.cibles.length} écartée${r.cibles.length > 1 ? "s" : ""} aussi`); setResultat((x) => ({ ...x, semblables: x.semblables.filter((y) => !ids.includes(y.id)) })); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const reprendre = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/reprendre`, { body: {} }),
    onSuccess: () => { toast.success("Reprise"); setMode("lecture"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const proprietaire = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/proprietaire`, { body: {} }),
    onSuccess: (r) => { toast.success(r.cible?.proprietaire?.nom ? `Propriétaire : ${joliNom(r.cible.proprietaire.nom)}` : r.foncier?.motif_choix || "Fiche lue"); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Data-B n'a pas répondu"),
  });

  if (!user || user.role !== "admin") return null;
  if (!id) return <div className="alx min-h-screen p-10 text-[#8B938F]">Aucun commerce désigné.</div>;
  if (isLoading || !c) return <div className="alx min-h-screen p-10 text-[#8B938F]">Lecture…</div>;

  const p = c.proprietaire || {};
  const s = c.societe || {};
  const v = c.valorisation || {};
  const e = emplacementDe(c.emplacement || null);
  const [verdict, teinteVerdict] = VERDICTS[c.pile] || VERDICTS.surveiller;
  const raisons = [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : ""));
  for (const d of c.drapeaux || []) if (d.effet !== "information") raisons.push(d.libelle);
  if (!raisons.length && c.motif) raisons.push(c.motif);
  const gerants = (s.gerants || []).slice(0, 5);
  const depuis = c.mutation?.du_local && c.mutation.date ? `propriétaire des murs depuis ${annee(c.mutation.date)}` : anneeUtile(s.creation) ? `société créée en ${anneeUtile(s.creation)}` : null;
  const proprioMeta = [p.forme || s.forme || (p.nom ? "Personne physique" : null), depuis, s.siege?.ville ? `siège à ${joliNom(s.siege.ville)}` : null].filter(Boolean).join(" · ");
  const brouillon = c.brouillon || null;
  const ecartee = c.pile === "ecartee";
  const retour = c.ville_id ? `/ALX?ville=${c.ville_id}&onglet=commerces` : "/ALX";

  return (
    <div className="alx min-h-screen">
      {apercu && (
        <ApercuCible
          id={apercu}
          onFermer={() => setApercu(null)}
          pending={ecarterAussi.isPending}
          onEcarter={(cid) => { ecarterAussi.mutate([cid]); setApercu(null); }}
          onGarder={(cid) => { setResultat((r) => (r ? { ...r, semblables: r.semblables.filter((y) => y.id !== cid) } : r)); setApercu(null); }}
        />
      )}
      <div className="mx-auto max-w-[1200px] px-[34px] pb-[70px] pt-[26px] max-md:px-4">
        <Link to={retour} className="text-[13.5px] text-[#8B938F] hover:text-[#E8EFEB]">← Tous les commerces</Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              {c.emplacement && <Etiquette teinte={e.teinte}>Emplacement {e.mot}</Etiquette>}
              <Etiquette teinte={teinteVerdict}>{ecartee ? "Écartée" : verdict}</Etiquette>
            </div>
            <h1 className="alx-serif m-0 mt-2.5 text-[44px] italic leading-[1.05] tracking-[-.01em] text-[#F3F7F5] max-md:text-[32px]">{joliNom(c.enseigne) || c.adresse}</h1>
            <div className="mt-2 text-[15px] text-[#8B938F]">{c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.activite ? ` · ${c.activite}` : ""}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {ecartee ? (
              <>
                <span className="text-[13px] text-[#8B938F]">{c.ecartee_motif ? `Écartée : ${c.ecartee_motif}` : c.ecartee_regle?.pourquoi ? `Écartée par une règle : ${c.ecartee_regle.pourquoi}` : "Écartée"}</span>
                <Bouton onClick={() => reprendre.mutate()} disabled={reprendre.isPending}>Reprendre</Bouton>
              </>
            ) : (
              <>
                <Bouton principal onClick={() => (brouillon ? setMode("message") : rediger.mutate())} disabled={rediger.isPending}>{rediger.isPending ? "…" : brouillon ? "Relire le message" : "Écrire le message"}</Bouton>
                <Bouton onClick={() => setMode("ecart")}>Écarter</Bouton>
              </>
            )}
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="flex flex-col gap-[26px] rounded-[20px] border border-white/[0.08] bg-[#0B0D0C] p-7">
            <div>
              <Etiquette>Propriétaire</Etiquette>
              <div className="mt-2 text-[22px] text-[#F3F7F5]">{p.nom ? joliNom(p.nom) : c.foncier ? "Plusieurs, à départager" : "À établir"}</div>
              {proprioMeta && <div className="mt-1 text-[13.5px] text-[#8B938F]">{proprioMeta}</div>}
              {!p.nom && (
                <button onClick={() => proprietaire.mutate()} disabled={proprietaire.isPending} className="mt-2 text-[13px] text-menthe hover:text-menthe-clair disabled:opacity-50" style={{ background: "transparent" }}>
                  {proprietaire.isPending ? "Data-B lit l'adresse…" : c.foncier ? "Relire chez Data-B" : "Chercher le propriétaire chez Data-B"}
                </button>
              )}
              {c.foncier?.motif_choix && <div className="mt-1.5 text-[12.5px] text-[#8B938F]">{c.foncier.motif_choix}</div>}
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

            <div>
              <Etiquette>Le commerce</Etiquette>
              <div className="mt-2 text-[14.5px] leading-[1.6] text-[#C3CBC7]">{ceQueFait(c).join(" ")}</div>
            </div>

            <div className="rounded-[14px] border px-[22px] py-5" style={{ borderColor: `${teinteVerdict}47` }}>
              <div className="flex flex-wrap items-center justify-between gap-3.5">
                <Etiquette>Va vendre ou pas</Etiquette>
                <div className="flex items-center gap-3">
                  <Urgence c={c} compact />
                  <Etiquette teinte={teinteVerdict}>{verdict}</Etiquette>
                </div>
              </div>
              <div className="mt-3.5 flex flex-col gap-[9px]">
                {raisons.map((r) => <span key={r} className="flex items-baseline gap-3 text-[14.5px] leading-[1.5] text-[#C3CBC7]"><span style={{ color: teinteVerdict }}>—</span>{r}</span>)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div>
                <Etiquette>Loyer estimé</Etiquette>
                <div className="mt-1.5"><Nombre taille={19} teinte="#F3F7F5">{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])}–${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</Nombre></div>
                {v.loyer_source && <div className="mt-1 text-[12px] text-[#8B938F]">{v.loyer_source}</div>}
              </div>
              <div>
                <Etiquette>Prix estimé</Etiquette>
                <div className="mt-1.5"><Nombre taille={19} teinte="#F3F7F5">{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</Nombre></div>
                <div className="mt-1 text-[12px] text-[#8B938F]">
                  {v.surface ? `${v.surface} m²${v.surface_source ? ` · ${v.surface_source}` : ""}` : c.mutation?.prix ? `Vente autour en ${annee(c.mutation.date)} : ${euros(c.mutation.prix)}${c.mutation.surface ? ` pour ${c.mutation.surface} m²` : ""}` : "surface inconnue"}
                </div>
              </div>
            </div>

            {mode === "message" && brouillon && (
              <div id="message" className="alx-entree flex flex-col gap-3.5 border-t border-white/[0.07] pt-6">
                <Etiquette teinte="#c3ddd6">Message rédigé · {brouillon.canal === "courrier" ? "courrier" : "e-mail"}</Etiquette>
                {brouillon.objet && <div className="text-[15px] text-[#E8EFEB]">{brouillon.objet}</div>}
                <div className="whitespace-pre-line rounded-[14px] border border-white/[0.08] px-5 py-[18px] text-[14.5px] leading-[1.65] text-[#C3CBC7]">{brouillon.texte}</div>
                <div className="flex flex-wrap gap-2.5">
                  <Bouton principal onClick={() => { toast.success("En brouillon", { description: "À retrouver dans l'onglet Messages." }); setMode("lecture"); }}>Garder en brouillon</Bouton>
                  <Bouton onClick={() => rediger.mutate()} disabled={rediger.isPending}>{rediger.isPending ? "…" : "Réécrire"}</Bouton>
                  <Bouton discret onClick={() => setMode("lecture")}>Fermer</Bouton>
                </div>
              </div>
            )}

            {mode === "ecart" && (
              <div className="alx-entree flex flex-col gap-3.5 border-t border-white/[0.07] pt-6">
                <Etiquette>Pourquoi écarter</Etiquette>
                <input value={motif} onChange={(ev) => setMotif(ev.target.value)} placeholder="Le gérant vient de renouveler son bail" className="rounded-[12px] border border-white/[0.09] bg-[#0A0C0B] px-4 py-[13px] text-[14.5px] text-[#E8EFEB] outline-none focus:border-menthe/50" />
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
                  <Bouton principal onClick={() => ecarter.mutate()} disabled={ecarter.isPending}>{ecarter.isPending ? "…" : sur.activite || sur.proprietaire || sur.enseigne ? "Créer la règle" : "Écarter"}</Bouton>
                  <Bouton discret onClick={() => setMode("lecture")}>Annuler</Bouton>
                </div>
              </div>
            )}

            {mode === "fait" && (
              <div className="alx-entree flex flex-col gap-3.5 border-t border-white/[0.07] pt-6">
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
                      <div key={x.id} onClick={() => setApercu(x.id)} className="flex cursor-pointer items-center justify-between gap-3 border-t border-white/[0.055] py-2.5 hover:bg-white/[0.025]">
                        <div className="min-w-0">
                          <div className="truncate text-[14px] text-[#E8EFEB]">{joliNom(x.enseigne) || x.adresse}</div>
                          <div className="truncate text-[12px] text-[#8B938F]">{x.adresse} · {x.raisons.join(" · ")}</div>
                        </div>
                        <div className="flex shrink-0 gap-3 text-[12.5px]">
                          <button onClick={(ev) => { ev.stopPropagation(); ecarterAussi.mutate([x.id]); }} disabled={ecarterAussi.isPending} className="text-menthe hover:text-menthe-clair" style={{ background: "transparent" }}>Écarter aussi</button>
                          <button onClick={(ev) => { ev.stopPropagation(); setResultat((r) => ({ ...r, semblables: r.semblables.filter((y) => y.id !== x.id) })); }} className="text-[#8B938F] hover:text-[#E8EFEB]" style={{ background: "transparent" }}>Garder</button>
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
                <div><Link to={retour} className="text-[13.5px] text-menthe hover:text-menthe-clair">← Retour aux commerces</Link></div>
              </div>
            )}
          </div>

          <div className="min-h-[460px] overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0A0C0B]">
            {CLE_EMBED ? (
              <iframe
                title={`Street View ${c.adresse}`}
                src={c.lat != null && c.lon != null
                  ? `https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`
                  : `https://www.google.com/maps/embed/v1/place?key=${CLE_EMBED}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`}
                className="h-full min-h-[460px] w-full border-0"
                allowFullScreen
                loading="lazy"
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-[13px] text-[#8B938F]">Street View demande la clé VITE_GOOGLE_MAPS_API_KEY dans le .env.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
