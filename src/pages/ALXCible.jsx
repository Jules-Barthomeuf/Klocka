import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Carte, Bouton, Champ, PILES, euros, quand, Halo, Urgence, urgenceDe, joliNom } from "@/components/alx/alx-commun";
import EchelleFourchettes from "@/components/preanalyse/EchelleFourchettes";

// La fiche d'une cible : le signal en tête, le propriétaire et ses gens, la
// fourchette de prix, la devanture, le message à relire, l'historique des
// contacts. Chaque geste est un bouton ; chaque bouton dit ce qu'il attend
// quand la source n'est pas branchée.

const CLE_EMBED = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const Ligne = ({ mot, children }) => (
  <div className="flex items-baseline gap-4 py-1.5">
    <span className="w-[150px] flex-none text-[12px] text-brume">{mot}</span>
    <span className="text-[14px] text-craie min-w-0 flex-1">{children ?? "—"}</span>
  </div>
);

/** Un commerce en coup d'œil, par-dessus la fiche : pour juger vite s'il faut l'écarter aussi. */
function ApercuCible({ id, onFermer, onEcarter, onGarder, pending }) {
  const { data: c } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  React.useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  if (!id) return null;
  const p = c?.proprietaire || {};
  const s = c?.societe || {};
  const v = c?.valorisation || {};
  const raisons = c ? [...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => x.libelle + (x.valeur ? ` (${x.valeur})` : "")) : [];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/70 backdrop-blur-[2px]" onClick={onFermer}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[1100px] max-h-[90vh] overflow-auto bg-surface border border-white/[0.12] rounded-[20px] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        {!c ? (
          <div className="p-10 text-brume flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture…</div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4 px-7 pt-6 pb-4 border-b border-white/[0.06]">
              <div>
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">{c.pile === "ecartee" ? "Écartée" : "Coup d'œil"}</div>
                <div className="text-[26px] font-semibold tracking-[-.02em] text-encre leading-tight">{joliNom(c.enseigne) || c.adresse}</div>
                <div className="text-[13.5px] text-ardoise">{c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.activite ? ` · ${c.activite}` : ""}</div>
              </div>
              <button onClick={onFermer} className="text-[13px] text-ardoise hover:text-encre">Fermer ✕</button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-0">
              <div className="p-7 flex flex-col gap-4">
                <div>
                  <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le propriétaire</div>
                  <div className="mt-1 text-[20px] font-semibold text-encre">{p.nom ? joliNom(p.nom) : c.foncier ? "Plusieurs, à départager" : "À établir"}</div>
                  <div className="text-[12.5px] text-ardoise">{[s.forme || p.forme, s.creation ? `créée en ${String(s.creation).slice(0, 4)}` : null, (s.gerants || []).length ? `${s.gerants.length} gérant${s.gerants.length > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}</div>
                  {(s.gerants || []).slice(0, 5).map((g, i) => <div key={i} className="text-[12.5px] text-craie">{joliNom(g.nom)}<span className="text-brume">{g.tranche_age ? ` · ${g.tranche_age} ans` : ""}{g.qualite ? ` · ${g.qualite}` : ""}</span></div>)}
                </div>
                <div className="border-t border-white/[0.08] pt-3">
                  <div className="text-[10px] tracking-[.16em] uppercase text-ardoise mb-2">L'analyse</div>
                  <Urgence c={c} />
                  <ul className="m-0 mt-2 pl-4 text-[13px] text-craie leading-[1.6]">
                    {raisons.map((r) => <li key={r}>{r}</li>)}
                    {!raisons.length && <li>{c.motif}</li>}
                  </ul>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-3 text-[13px]">
                  <div><div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Loyer</div><div className="text-encre mt-1">{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])} – ${Math.round(v.loyer_fourchette[1])} €/m²/an` : "—"}</div></div>
                  <div><div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Prix estimé</div><div className="text-encre mt-1">{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</div></div>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.08] pt-4 mt-auto">
                  {c.pile !== "ecartee" && <Bouton principal onClick={() => onEcarter(c.id)} disabled={pending}>Écarter aussi</Bouton>}
                  <Bouton onClick={() => onGarder(c.id)}>Garder</Bouton>
                  <Link to={`/ALXCible?id=${c.id}`} className="text-[13px] text-menthe hover:text-menthe-clair ml-1">Ouvrir la fiche complète →</Link>
                </div>
              </div>
              <div className="min-h-[360px] bg-fond lg:rounded-br-[20px] overflow-hidden">
                {CLE_EMBED ? (
                  <iframe
                    title={`Street View ${c.adresse}`}
                    src={c.lat != null && c.lon != null
                      ? `https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`
                      : `https://www.google.com/maps/embed/v1/place?key=${CLE_EMBED}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`}
                    className="w-full h-full min-h-[360px] border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[11px] tracking-[.1em] uppercase text-brume">Street View indisponible</div>
                )}
              </div>
            </div>
          </>
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
  const [brouillon, setBrouillon] = useState(null);
  const [brouillonVu, setBrouillonVu] = useState(null);
  const [saisie, setSaisie] = useState({});
  const [issue, setIssue] = useState({});

  const { data: c, isLoading } = useQuery({ queryKey: ["alx-cible", id], queryFn: () => base44.request("GET", `/api/alx/cibles/${id}`), enabled: !!id });
  const { data: etat } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 30000 });
  const { data: pourClients } = useQuery({
    queryKey: ["alx-cible-clients", id, c?.valorisation?.fourchette],
    queryFn: () => base44.request("GET", `/api/alx/cibles/${id}/clients`),
    enabled: !!id && !!c?.valorisation?.fourchette,
  });
  const outils = etat?.outils || {};

  const rafraichir = () => { qc.invalidateQueries({ queryKey: ["alx-cible", id] }); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); qc.invalidateQueries({ queryKey: ["alx-etat"] }); };
  const useGeste = (chemin, body = {}, mot = "Fait") =>
    useMutation({
      mutationFn: (b) => base44.request("POST", `/api/alx/cibles/${id}/${chemin}`, { body: { ...body, ...(b || {}) } }),
      onSuccess: (r) => { if (mot) toast.success(mot); rafraichir(); return r; },
      onError: (e) => toast.error(e?.message || "Impossible"),
    });

  const devanture = useGeste("devanture", {}, "Devanture lue");
  const societe = useGeste("societe", {}, "Société lue");
  const proprietaire = useGeste("proprietaire", {}, null);
  const evenements = useGeste("evenements", {}, "BODACC relu");
  const mutation = useGeste("mutation", {}, "DVF relu");
  const loyer = useGeste("loyer", {}, "Loyer de marché relevé");
  const prix = useGeste("prix", {}, "Fourchette calculée");
  const dossier = useGeste("dossier", {}, "Dossier créé");
  const enregistrer = useMutation({
    mutationFn: (patch) => base44.request("PUT", `/api/alx/cibles/${id}`, { body: patch }),
    onSuccess: () => { toast.success("Enregistré"); setSaisie({}); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const rediger = useMutation({
    mutationFn: (canal) => base44.request("POST", `/api/alx/cibles/${id}/message`, { body: { canal } }),
    onSuccess: (r) => { setBrouillon({ ...r, destinataire: "" }); setBrouillonVu(id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const approche = useMutation({
    mutationFn: (body) => base44.request("POST", `/api/alx/cibles/${id}/approches`, { body }),
    onSuccess: () => { toast.success("Approche enregistrée"); setBrouillon(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const [ecart, setEcart] = useState(null); // null | { ouvert: true } | { semblables, regle, motif }
  const [apercu, setApercu] = useState(null); // l'id du semblable qu'on regarde
  const [motifEcart, setMotifEcart] = useState("");
  const [sur, setSur] = useState({ activite: false, proprietaire: false, enseigne: false });
  const ecarter = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/ecarter`, { body: { motif: motifEcart || null, sur } }),
    onSuccess: (r) => { toast.success("Écartée"); setEcart({ semblables: r.semblables || [], regle: r.regle, motif: motifEcart }); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const ecarterAussi = useMutation({
    mutationFn: (ids) => base44.request("POST", `/api/alx/cibles/ecarter-plusieurs`, { body: { ids, motif: ecart?.motif || null, regle_id: ecart?.regle?.id || null } }),
    onSuccess: (r, ids) => { toast.success(`${r.cibles.length} écartée${r.cibles.length > 1 ? "s" : ""} aussi`); setEcart((e) => ({ ...e, semblables: e.semblables.filter((x) => !ids.includes(x.id)) })); qc.invalidateQueries({ queryKey: ["alx-cibles"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const reprendre = useMutation({
    mutationFn: () => base44.request("POST", `/api/alx/cibles/${id}/reprendre`, { body: {} }),
    onSuccess: () => { toast.success("Reprise"); setEcart(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const qualifier = useMutation({
    mutationFn: ({ aid, ...body }) => base44.request("POST", `/api/alx/approches/${aid}/issue`, { body }),
    onSuccess: () => { toast.success("Réponse notée"); setIssue({}); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Le brouillon que le parcours a laissé sur la cible arrive dans l'éditeur,
  // une fois, sans écraser ce qu'on est en train d'écrire.
  if (c?.brouillon && brouillonVu !== c.id && !brouillon) {
    setBrouillon({ canal: c.brouillon.canal, objet: c.brouillon.objet, texte: c.brouillon.texte, destinataire: "" });
    setBrouillonVu(c.id);
  }

  if (!user || user.role !== "admin") return null;
  if (!id) return <div className="p-10 text-brume">Aucune cible désignée.</div>;
  if (isLoading || !c) return <div className="p-10 text-brume flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture…</div>;

  const s = c.societe || {};
  const p = c.proprietaire || {};
  const v = c.valorisation || {};
  const forts = c.signaux?.forts || [];
  const patients = c.signaux?.patients || [];
  const signalPrincipal = forts[0] || patients[0] || null;
  const pileInfo = PILES.find((x) => x.cle === (c.pile || "surveiller"));
  const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`;

  return (
    <div className="bg-fond min-h-screen text-encre">
      {apercu && (
        <ApercuCible
          id={apercu}
          onFermer={() => setApercu(null)}
          pending={ecarterAussi.isPending}
          onEcarter={(cid) => { ecarterAussi.mutate([cid]); setApercu(null); }}
          onGarder={(cid) => { setEcart((e) => (e?.semblables ? { ...e, semblables: e.semblables.filter((y) => y.id !== cid) } : e)); setApercu(null); }}
        />
      )}
      <div className="max-w-[1440px] mx-auto px-7 pt-7 pb-20">
        <Link to={c.ville_id ? `/ALX?ville=${c.ville_id}` : "/ALX"} className="inline-block mb-5 text-[13px] text-menthe hover:text-menthe-clair">
          ← Toutes les cibles
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div className="flex flex-col gap-2">
            <div className="text-[10px] tracking-[.16em] uppercase font-semibold" style={{ color: pileInfo.teinte }}>{pileInfo.mot}</div>
            <h1 className="m-0 text-[36px] max-md:text-[26px] font-semibold tracking-[-.025em] leading-[1.05] text-encre">{joliNom(c.enseigne) || c.adresse}</h1>
            <div className="text-[15px] text-ardoise">
              {c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.emplacement ? ` · Emplacement ${c.emplacement}` : ""}{c.activite ? ` · ${c.activite}` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 border border-bord-doux text-craie hover:text-encre hover:border-bord-vif rounded-full px-4 py-2.5 text-[13px] transition-colors">
              Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
            {c.deal_id ? (
              <Link to={`/Analyse?deal_id=${c.deal_id}`} className="inline-flex items-center bg-menthe text-[#0b1211] rounded-full px-4 py-2.5 text-[13px] font-medium hover:bg-menthe-clair transition-colors">Ouvrir le dossier</Link>
            ) : (
              <Bouton onClick={() => { if (window.confirm("Créer le dossier à l'étape 1 ? À faire quand le bail et les quittances sont arrivés.")) dossier.mutate(); }} disabled={dossier.isPending} principal>Créer le dossier</Bouton>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-4 mb-5">
          <div className="relative overflow-hidden bg-surface border border-white/[0.08] rounded-[20px] p-7 flex flex-col gap-5">
            <Halo teinte={pileInfo.cle === "appeler" ? "232,178,120" : pileInfo.cle === "ecrire" ? "120,150,235" : "150,192,184"} />
            <div className="relative">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le propriétaire</div>
              <div className="mt-2 text-[28px] font-semibold tracking-[-.02em] text-encre leading-tight">{p.nom ? joliNom(p.nom) : c.foncier ? "Plusieurs propriétaires, à départager" : "À établir"}</div>
              <div className="mt-1 text-[13px] text-ardoise">
                {[s.forme || p.forme, s.creation ? `créée en ${String(s.creation).slice(0, 4)}` : null, p.parcelle ? `parcelle ${p.parcelle}` : null].filter(Boolean).join(" · ")}
              </div>
              {(s.gerants || []).length > 0 && (
                <div className="mt-3 flex flex-col gap-1">
                  {s.gerants.map((g, i) => (
                    <div key={i} className="text-[13px] text-craie">{joliNom(g.nom)}<span className="text-brume">{g.tranche_age ? ` · ${g.tranche_age} ans` : ""}{g.qualite ? ` · ${g.qualite}` : ""}</span></div>
                  ))}
                </div>
              )}
            </div>
            <div className="relative border-t border-white/[0.08] pt-4">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise mb-2">Mon analyse</div>
              <Urgence c={c} />
              <ul className="m-0 mt-2 pl-4 text-[13.5px] text-craie leading-[1.6]">
                {[...(c.signaux?.forts || []), ...(c.signaux?.patients || [])].map((x) => <li key={x.cle}>{x.libelle}{x.valeur ? ` (${x.valeur})` : ""}</li>)}
                {(c.drapeaux || []).filter((d) => d.effet !== "information").map((d) => <li key={d.cle}>{d.libelle}</li>)}
                {!(c.signaux?.forts?.length || c.signaux?.patients?.length) && <li>{c.motif}</li>}
                {c.foncier?.motif_choix && <li className="text-brume">{c.foncier.motif_choix}</li>}
              </ul>
            </div>
            <div className="relative grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-4">
              <div>
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Loyer estimé</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums text-encre">{v.loyer_fourchette?.[0] != null ? `${Math.round(v.loyer_fourchette[0])} – ${Math.round(v.loyer_fourchette[1])}` : "—"}<span className="text-[12px] text-brume font-normal"> €/m²/an</span></div>
                {v.surface && v.loyer_m2_marche ? <div className="text-[12px] text-brume">{Math.round(v.surface * v.loyer_m2_marche).toLocaleString("fr-FR")} € par an pour {v.surface} m²</div> : null}
              </div>
              <div>
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Prix estimé</div>
                <div className="mt-1 text-[20px] font-semibold tabular-nums text-encre">{v.fourchette ? `${euros(v.fourchette[0])} – ${euros(v.fourchette[1])}` : "—"}</div>
                {!v.fourchette && <div className="text-[12px] text-brume">{v.loyer_m2_marche ? "saisissez la surface plus bas" : "après le loyer de la rue"}</div>}
                {v.fourchette && v.surface && <div className="text-[12px]" style={{ color: v.surface_a_confirmer ? "#E8B278" : "var(--k-brume)" }}>{v.surface} m² · {v.surface_source}</div>}
                {c.mutation?.du_local && <div className="text-[12px] text-brume">Le local s'est vendu {euros(c.mutation.prix)} en {String(c.mutation.date).slice(0, 4)}</div>}
              </div>
            </div>
            <div className="relative flex flex-wrap items-center gap-2.5 border-t border-white/[0.08] pt-4">
              {c.brouillon ? (
                <a href="#message" className="inline-flex items-center bg-menthe text-[#0b1211] rounded-full px-4 py-2.5 text-[13px] font-medium hover:bg-menthe-clair transition-colors">Relire le message</a>
              ) : (
                <Bouton principal onClick={() => rediger.mutate(c.pile === "appeler" ? "mail" : "courrier")} disabled={rediger.isPending || !outils.modele || c.pile === "ecartee"}>
                  {rediger.isPending ? "Rédaction…" : "Oui, écrire le message"}
                </Bouton>
              )}
              {c.pile !== "ecartee" ? (
                <Bouton onClick={() => setEcart({ ouvert: true })} disabled={ecarter.isPending}>Non, écarter</Bouton>
              ) : c.ecartee_equipe || c.ecartee_regle ? (
                <Bouton onClick={() => reprendre.mutate()} disabled={reprendre.isPending}>Reprendre</Bouton>
              ) : null}
            </div>

            {ecart?.ouvert && (
              <div className="relative border-t border-white/[0.08] pt-4 flex flex-col gap-3">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Pourquoi non ? ALX apprend de ce retour</div>
                <textarea
                  value={motifEcart}
                  onChange={(e) => setMotifEcart(e.target.value)}
                  rows={2}
                  placeholder="Pas une vraie vitrine, trop cher, déjà en mandat, on ne cible pas ce genre de commerce…"
                  className="w-full bg-fond border border-bord rounded-[10px] px-4 py-3 text-[13.5px] text-encre placeholder:text-brume outline-none focus:border-menthe resize-y"
                />
                <div className="flex flex-col gap-1.5 text-[13px] text-craie">
                  <span className="text-[12px] text-brume">Et à l'avenir, écarter d'office :</span>
                  {c.activite && <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={sur.activite} onChange={(e) => setSur((x) => ({ ...x, activite: e.target.checked }))} className="accent-[#96c0b8]" /> toute cette activité : {c.activite}</label>}
                  {p.nom && <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={sur.proprietaire} onChange={(e) => setSur((x) => ({ ...x, proprietaire: e.target.checked }))} className="accent-[#96c0b8]" /> tout ce propriétaire : {joliNom(p.nom)}</label>}
                  {c.enseigne && <label className="flex items-center gap-2.5 cursor-pointer"><input type="checkbox" checked={sur.enseigne} onChange={(e) => setSur((x) => ({ ...x, enseigne: e.target.checked }))} className="accent-[#96c0b8]" /> toute cette enseigne : {joliNom(c.enseigne)}</label>}
                </div>
                <div className="flex gap-2.5">
                  <Bouton principal onClick={() => ecarter.mutate()} disabled={ecarter.isPending}>{ecarter.isPending ? "…" : "Écarter"}</Bouton>
                  <Bouton onClick={() => setEcart(null)}>Annuler</Bouton>
                </div>
              </div>
            )}

            {ecart?.semblables && (
              <div className="relative border-t border-white/[0.08] pt-4 flex flex-col gap-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">
                    {ecart.semblables.length ? `${ecart.semblables.length} commerce${ecart.semblables.length > 1 ? "s" : ""} qui ressemble${ecart.semblables.length > 1 ? "nt" : ""} : les écarter aussi ?` : "Aucun autre commerce semblable dans cette ville."}
                  </div>
                  {ecart.regle && <span className="text-[12px] text-menthe">Règle enregistrée : les prochains du même genre seront écartés d'office.</span>}
                </div>
                {ecart.semblables.map((x) => (
                  <div key={x.id} onClick={() => setApercu(x.id)} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 items-center bg-fond/60 border border-white/[0.06] hover:border-white/[0.18] rounded-[12px] px-4 py-3 cursor-pointer" title="Voir ce commerce en coup d'œil">
                    <div className="min-w-0">
                      <div className="text-[14px] text-encre truncate">{joliNom(x.enseigne) || x.adresse}<span className="text-brume text-[12px]"> · {x.adresse}{x.activite ? ` · ${x.activite}` : ""}</span></div>
                      <div className="text-[12px] text-brume truncate">{x.proprietaire ? joliNom(x.proprietaire) + " · " : ""}{x.raisons.join(", ")}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); ecarterAussi.mutate([x.id]); }} disabled={ecarterAussi.isPending} className="text-[12px] text-menthe hover:text-menthe-clair">Écarter aussi</button>
                      <button onClick={(e) => { e.stopPropagation(); setEcart((e0) => ({ ...e0, semblables: e0.semblables.filter((y) => y.id !== x.id) })); }} className="text-[12px] text-ardoise hover:text-encre">Garder</button>
                    </div>
                  </div>
                ))}
                {ecart.semblables.length > 1 && (
                  <div className="flex gap-2.5">
                    <Bouton principal onClick={() => ecarterAussi.mutate(ecart.semblables.map((x) => x.id))} disabled={ecarterAussi.isPending}>Écarter les {ecart.semblables.length}</Bouton>
                    <Bouton onClick={() => setEcart(null)}>Tout garder</Bouton>
                  </div>
                )}
                {ecart.semblables.length <= 1 && <div><Bouton onClick={() => setEcart(null)}>Fermer</Bouton></div>}
              </div>
            )}
          </div>

          <div className="bg-surface border border-white/[0.08] rounded-[20px] overflow-hidden flex flex-col">
            {CLE_EMBED ? (
              <iframe
                title={`Street View ${c.adresse}`}
                src={c.lat != null && c.lon != null
                  ? `https://www.google.com/maps/embed/v1/streetview?key=${CLE_EMBED}&location=${c.lat},${c.lon}&heading=0&pitch=0&fov=90`
                  : `https://www.google.com/maps/embed/v1/place?key=${CLE_EMBED}&q=${encodeURIComponent([c.adresse, c.ville].filter(Boolean).join(", "))}`}
                className="w-full flex-1 min-h-[420px] border-0"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex-1 min-h-[420px] flex items-center justify-center text-[11px] tracking-[.1em] uppercase text-brume">Street View : clé VITE_GOOGLE_MAPS_API_KEY absente</div>
            )}
            <div className="px-5 py-3 flex items-center justify-between text-[12px] text-brume border-t border-white/[0.06]">
              <span>{c.adresse}{c.ville ? `, ${c.ville}` : ""}{c.occupant?.nom ? ` · ${joliNom(c.occupant.nom)}` : ""}</span>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="text-menthe hover:text-menthe-clair">Ouvrir dans Maps</a>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.4fr_1fr] gap-5 items-start">
          <div className="flex flex-col gap-4">

            <Carte className="flex flex-col gap-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le propriétaire</div>
                <div className="flex gap-2">
                  <Bouton
                    principal
                    onClick={() => proprietaire.mutate({}, { onSuccess: (r) => toast.success(r.cible?.proprietaire?.nom ? `Propriétaire : ${r.cible.proprietaire.nom}` : r.foncier?.motif_choix || "Fiche lue") })}
                    disabled={proprietaire.isPending || !outils.data_b}
                    title={outils.data_b ? "Data Foncier, par l'adresse" : "Data-B n'est pas configuré"}
                  >
                    {proprietaire.isPending ? "Data-B…" : "Trouver le propriétaire"}
                  </Bouton>
                  <Bouton onClick={() => societe.mutate()} disabled={societe.isPending || (!p.nom && !p.siren && !saisie.proprietaire_nom)} title="Annuaire des entreprises, gratuit, sans clé">
                    {societe.isPending ? "Lecture…" : "Lire la société"}
                  </Bouton>
                </div>
              </div>
              <p className="m-0 -mt-3 text-[12.5px] text-brume">
                Data-B donne les propriétaires du bâtiment, lot par lot ; ALX retient celui du rez-de-chaussée. L'annuaire des entreprises complète la société.
              </p>

              {c.foncier && (
                <div className="flex flex-col gap-2 bg-fond/60 border border-white/[0.06] rounded-[12px] p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-[12.5px] text-craie">
                      {c.foncier.adresse_fiche || c.foncier.adresse}
                      {c.foncier.parcelle && <span className="text-brume"> · parcelle {c.foncier.parcelle}</span>}
                      {c.foncier.surface_batiment && <span className="text-brume"> · bâtiment {c.foncier.surface_batiment} m²</span>}
                    </div>
                    <div className="text-[11px] text-brume">Data-B · {quand(c.foncier.lu_le)}</div>
                  </div>
                  {c.foncier.adresse_non_confirmee && <p className="m-0 text-[12px]" style={{ color: "#E8B278" }}>Le numéro de la fiche ne concorde pas avec l'adresse : vérifiez sur la carte Data-B.</p>}
                  <p className="m-0 text-[12px] text-brume">{c.foncier.motif_choix}</p>
                  {(c.foncier.proprietaires || []).length > 0 && (
                    <div className="flex flex-col">
                      {c.foncier.proprietaires.map((f) => {
                        const retenu = p.siren && f.siren === p.siren;
                        return (
                          <div key={f.siren || f.nom} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center py-2 border-t border-white/[0.05]">
                            <div className="min-w-0">
                              <div className="text-[13.5px] text-craie truncate">{f.nom}{f.forme ? <span className="text-brume"> · {f.forme}</span> : null}</div>
                              <div className="text-[12px] text-brume truncate">
                                {f.lots.length ? `lots : ${f.lots.map((l) => l.etage).join(", ")}` : "lot non précisé"}
                                {f.gerants?.length ? ` · ${f.gerants.length} gérant${f.gerants.length > 1 ? "s" : ""}` : ""}
                              </div>
                            </div>
                            <span className="text-[10px] tracking-[.12em] uppercase" style={{ color: f.rez_de_chaussee ? "var(--k-menthe)" : "var(--k-brume)" }}>{f.rez_de_chaussee ? "RDC" : "étage"}</span>
                            {retenu ? (
                              <span className="text-[11px] text-menthe">retenu</span>
                            ) : (
                              <button onClick={() => proprietaire.mutate({ siren: f.siren })} disabled={proprietaire.isPending || !f.siren} className="text-[11px] text-ardoise hover:text-encre disabled:opacity-40">Retenir</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-4">
                <Champ label="Nom (société ou personne)" value={saisie.proprietaire_nom ?? p.nom} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_nom: x }))} className="flex-1 min-w-[200px]" />
                <Champ label="SIREN" value={saisie.proprietaire_siren ?? p.siren} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_siren: x }))} className="w-[150px]" />
                <Champ label="Droit (pleine propriété, usufruit, indivision)" value={saisie.proprietaire_droit ?? p.droit} onChange={(x) => setSaisie((s0) => ({ ...s0, proprietaire_droit: x }))} className="flex-1 min-w-[200px]" />
              </div>

              {s.nom && (
                <>
                  <div className="grid gap-px bg-white/[0.07] border border-white/[0.07] rounded-[12px] overflow-hidden" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                    <div className="bg-[#121414] p-[18px] flex flex-col gap-1.5">
                      <div className="text-[9px] tracking-[.14em] uppercase text-brume">Société</div>
                      <div className="text-[16px] font-medium text-encre truncate">{s.nom}</div>
                      <div className="text-[12px] text-brume">{s.forme}</div>
                    </div>
                    <div className="bg-[#121414] p-[18px] flex flex-col gap-1.5">
                      <div className="text-[9px] tracking-[.14em] uppercase text-brume">Créée en</div>
                      <div className="text-[16px] font-medium text-encre">{s.creation ? String(s.creation).slice(0, 4) : "—"}</div>
                      <div className="text-[12px] text-brume">{s.active === false ? `Fermée${s.fermee_le ? ` ${quand(s.fermee_le)}` : ""}` : "active"}</div>
                    </div>
                    <div className="bg-[#121414] p-[18px] flex flex-col gap-1.5">
                      <div className="text-[9px] tracking-[.14em] uppercase text-brume">Code APE</div>
                      <div className="text-[16px] font-medium text-encre" style={/6810Z/i.test(s.ape || "") ? { color: "#E8B278" } : undefined}>{s.ape || "—"}</div>
                      <div className="text-[12px] text-brume truncate">{s.ape_libelle}</div>
                    </div>
                  </div>

                  {(s.gerants || []).length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[10px] tracking-[.16em] uppercase text-ardoise mb-1">Les gérants</div>
                      {s.gerants.map((g, i) => (
                        <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1.1fr)] gap-3.5 items-center py-3 border-t border-white/[0.05]">
                          <div className="text-[15px] text-craie truncate">{g.nom}</div>
                          <div className="text-[13px] text-ardoise">{g.tranche_age || "—"}</div>
                          <div className="text-[13px] text-ardoise truncate">{g.qualite}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-5 border-t border-white/[0.06] pt-4 text-[13px] text-ardoise">
                    <div>{s.comptes_deposes ? "Comptes déposés" : "Aucun compte déposé récemment"}</div>
                    {s.homonymes > 1 && <div style={{ color: "#E8B278" }}>Homonyme possible ({s.homonymes} sociétés de ce nom) : vérifiez le SIREN sur Data-B</div>}
                  </div>
                </>
              )}
            </Carte>

            <Carte className="flex flex-col gap-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Événements et mutation</div>
                <div className="flex gap-2">
                  <Bouton onClick={() => evenements.mutate()} disabled={evenements.isPending || !(p.siren || s.siren)} title={p.siren || s.siren ? "" : "Il faut un SIREN"}>{evenements.isPending ? "…" : "BODACC"}</Bouton>
                  <Bouton onClick={() => mutation.mutate()} disabled={mutation.isPending}>{mutation.isPending ? "…" : "DVF"}</Bouton>
                </div>
              </div>
              {(c.evenements || []).length ? (c.evenements || []).slice(0, 6).map((e, i) => (
                <Ligne key={i} mot={quand(e.date)}>{e.type}{e.detail ? <span className="text-brume"> · {e.detail}</span> : null}</Ligne>
              )) : <p className="m-0 text-[12.5px] text-brume">Aucun événement relu.</p>}
              <Ligne mot="Dernière mutation">{c.mutation?.date ? `${quand(c.mutation.date)} · ${euros(c.mutation.prix)}${c.mutation.distance_m != null ? ` · à ${c.mutation.distance_m} m` : ""}` : null}</Ligne>
              <div className="flex flex-wrap gap-4">
                <Champ label="Échéance du bail" type="date" value={(saisie.bail_echeance ?? c.bail_echeance ?? "").slice(0, 10)} onChange={(x) => setSaisie((s0) => ({ ...s0, bail_echeance: x }))} className="w-[200px]" />
                <Champ label="Loyer du bail, €/m²/an" type="number" value={saisie.loyer_m2_bail ?? c.loyer_m2_bail} onChange={(x) => setSaisie((s0) => ({ ...s0, loyer_m2_bail: x }))} className="w-[200px]" />
              </div>
            </Carte>

            {Object.keys(saisie).length > 0 && (
              <Bouton principal onClick={() => {
                const patch = { ...saisie };
                if ("proprietaire_nom" in patch || "proprietaire_siren" in patch || "proprietaire_droit" in patch) {
                  patch.proprietaire = { ...p, nom: patch.proprietaire_nom ?? p.nom, siren: patch.proprietaire_siren ?? p.siren, droit: patch.proprietaire_droit ?? p.droit, source: p.source || "saisie" };
                  delete patch.proprietaire_nom; delete patch.proprietaire_siren; delete patch.proprietaire_droit;
                }
                if ("loyer_m2_bail" in patch) patch.loyer_m2_bail = patch.loyer_m2_bail === "" ? null : Number(patch.loyer_m2_bail);
                if ("bail_echeance" in patch) patch.bail_echeance = patch.bail_echeance || null;
                enregistrer.mutate(patch);
              }}>Enregistrer et reclasser</Bouton>
            )}
          </div>

          <div className="flex flex-col gap-4">
            <Carte className="flex flex-col gap-4">
              <div className="flex items-baseline justify-between">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Devanture</div>
                <Bouton onClick={() => devanture.mutate()} disabled={devanture.isPending || !outils.street_view} title={outils.street_view ? "" : "Clé GOOGLE_MAPS_SERVEUR à poser"}>
                  {devanture.isPending ? "Lecture…" : "Lire sur Street View"}
                </Bouton>
              </div>
              {c.photo?.lecture ? (
                <>
                  <Ligne mot="Photo du">{c.photo.date || "date inconnue"}</Ligne>
                  <Ligne mot="Enseigne lue">{c.photo.lecture.enseigne}</Ligne>
                  <Ligne mot="Activité lue">{c.photo.lecture.activite}</Ligne>
                  <Ligne mot="État">{c.photo.lecture.etat}{c.photo.lecture.terrasse ? " · terrasse" : ""}</Ligne>
                  <Ligne mot="Confiance">{c.photo.lecture.confiance}</Ligne>
                </>
              ) : (
                <p className="m-0 text-[12.5px] text-brume">{outils.street_view ? "Pas encore lue." : "Street View n'est pas branché : la lecture automatique attend la clé. L'adresse s'ouvre dans Maps ci-dessus."}</p>
              )}
              <div className="flex flex-wrap gap-4">
                <Champ label="Enseigne" value={saisie.enseigne ?? c.enseigne} onChange={(x) => setSaisie((s0) => ({ ...s0, enseigne: x }))} className="flex-1 min-w-[140px]" />
                <Champ label="Activité" value={saisie.activite ?? c.activite} onChange={(x) => setSaisie((s0) => ({ ...s0, activite: x }))} className="flex-1 min-w-[140px]" />
              </div>
              {c.activite_exclue && <p className="m-0 text-[12px] text-alerte">Activité exclue du périmètre.</p>}
            </Carte>

            <Carte className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Fourchette de prix</div>
                <div className="flex gap-2">
                  <Bouton onClick={() => loyer.mutate()} disabled={loyer.isPending || !outils.data_b}>{loyer.isPending ? "…" : "Loyer de la rue"}</Bouton>
                  <Bouton onClick={() => prix.mutate({ surface: saisie.surface ?? v.surface, taux: saisie.taux ?? v.taux })} disabled={prix.isPending || !(v.loyer_m2_marche > 0) || !((saisie.surface ?? v.surface) > 0)}>{prix.isPending ? "…" : "Calculer"}</Bouton>
                </div>
              </div>
              <div className="flex flex-wrap gap-4">
                <Champ label="Surface, m²" type="number" value={saisie.surface ?? v.surface} onChange={(x) => setSaisie((s0) => ({ ...s0, surface: x }))} className="w-[130px]" />
                <Champ label="Rendement visé, %" type="number" value={saisie.taux ?? v.taux ?? 7} onChange={(x) => setSaisie((s0) => ({ ...s0, taux: x }))} className="w-[150px]" />
              </div>
              {v.fourchette && (
                <div className="text-[32px] font-semibold tracking-[-.02em] tabular-nums text-encre">{euros(v.fourchette[0])} <span className="text-bord-vif">–</span> {euros(v.fourchette[1])}</div>
              )}
              {v.loyer_fourchette && (
                <EchelleFourchettes
                  lignes={[{ cle: "rue", libelle: "Loyer rue", basse: v.loyer_fourchette[0], haute: v.loyer_fourchette[1], primaire: true }]}
                  repere={c.loyer_m2_bail > 0 ? { valeur: c.loyer_m2_bail } : null}
                  legende={v.loyer_source}
                />
              )}
              {v.fourchette && <p className="m-0 text-[12px] text-brume">{Math.round(v.loyer_annuel).toLocaleString("fr-FR")} € de loyer annuel estimé, à {v.taux} % ± 1 point.</p>}
              {v.alerte && <p className="m-0 text-[12.5px] text-alerte">{v.alerte}</p>}
              {pourClients?.clients?.length > 0 && (
                <p className="m-0 text-[12.5px] text-menthe">
                  Concerne {pourClients.clients.length} client{pourClients.clients.length > 1 ? "s" : ""} actif{pourClients.clients.length > 1 ? "s" : ""} sur Monday : {pourClients.clients.map((cl) => cl.nom).join(", ")}
                </p>
              )}
            </Carte>

            <Carte className="flex flex-col gap-4" id="message">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Le message, à relire</div>
                {!c.deal_id && !brouillon && (
                  <div className="flex gap-2">
                    <Bouton onClick={() => rediger.mutate("mail")} disabled={rediger.isPending || !outils.modele}>{rediger.isPending ? "…" : "Rédiger un mail"}</Bouton>
                    <Bouton onClick={() => rediger.mutate("courrier")} disabled={rediger.isPending || !outils.modele}>Un courrier</Bouton>
                  </div>
                )}
              </div>
              {brouillon ? (
                <>
                  {brouillon.objet && <p className="m-0 text-[12px] text-ardoise">Objet : <span className="text-craie">{brouillon.objet}</span></p>}
                  <textarea
                    value={brouillon.texte}
                    onChange={(e) => setBrouillon((b) => ({ ...b, texte: e.target.value }))}
                    rows={10}
                    className="w-full bg-fond border border-white/[0.08] rounded-[10px] p-4 text-[13.5px] leading-[1.7] text-craie outline-none resize-y"
                  />
                  <Champ label="Destinataire" value={brouillon.destinataire ?? ""} onChange={(x) => setBrouillon((b) => ({ ...b, destinataire: x }))} placeholder={brouillon.canal === "mail" ? "adresse@exemple.fr" : "nom et adresse postale"} />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Bouton principal onClick={() => approche.mutate({ canal: brouillon.canal, message: brouillon.texte, destinataire: brouillon.destinataire || null })}>
                      {brouillon.canal === "mail" ? "Valider et envoyer" : "Marquer comme posté"}
                    </Bouton>
                    <Bouton onClick={() => setBrouillon(null)}>Réécrire</Bouton>
                    <span className="text-[12px]" style={{ color: "#E8B278" }}>Rien ne part sans ce clic</span>
                  </div>
                </>
              ) : (
                <p className="m-0 text-[12.5px] text-brume">Aucun message rédigé.</p>
              )}
            </Carte>

            <Carte className="flex flex-col gap-3">
              <div className="text-[10px] tracking-[.16em] uppercase text-ardoise">Les approches</div>
              {(c.approches || []).length === 0 && <p className="m-0 text-[12.5px] text-brume">Aucune approche.</p>}
              <div className="flex flex-col">
                {(c.approches || []).map((a) => (
                  <div key={a.id} className="py-3 border-t border-white/[0.05] first:border-t-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="m-0 text-[13.5px] text-craie">
                        {a.canal === "mail" ? "Mail" : a.canal === "courrier" ? "Courrier" : "Appel"} · {quand(a.le)}
                        {a.destinataire && <span className="text-brume"> · {a.destinataire}</span>}
                      </p>
                      <span className="text-[11px] tracking-[.12em] uppercase" style={{ color: a.issue === "oui" ? "var(--k-menthe)" : a.issue === "non" ? "var(--k-alerte)" : a.issue === "plus_tard" ? "#E8B278" : "var(--k-brume)" }}>
                        {a.issue === "oui" ? "Oui" : a.issue === "non" ? "Non" : a.issue === "plus_tard" ? "Plus tard" : "Sans réponse"}
                      </span>
                    </div>
                    {a.reponse && <p className="m-0 mt-1 text-[12.5px] text-ardoise">{a.reponse}</p>}
                    {a.motif_refus && <p className="m-0 mt-1 text-[12.5px] text-brume">Motif : {a.motif_refus}</p>}
                    {a.relance_le && <p className="m-0 mt-1 text-[11.5px] text-brume">Relance le {quand(a.relance_le)}</p>}
                    {a.issue === "sans_reponse" && (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <Champ label="Réponse ou motif" value={issue[a.id] ?? ""} onChange={(x) => setIssue((i) => ({ ...i, [a.id]: x }))} className="flex-1 min-w-[180px]" />
                        {[["oui", "Oui"], ["plus_tard", "Plus tard"], ["non", "Non"]].map(([k, mot]) => (
                          <Bouton key={k} onClick={() => qualifier.mutate({ aid: a.id, issue: k, reponse: issue[a.id] || null, motif_refus: k === "non" ? issue[a.id] || null : null })}>{mot}</Bouton>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {c.prochaine_action && (
                <div className="border-t border-white/[0.06] pt-3.5 flex justify-between items-center gap-3">
                  <span className="text-[13px] text-ardoise">Prochaine action</span>
                  <span className="text-[13px] text-menthe">{c.prochaine_action}{c.prochaine_action_le ? ` · ${quand(c.prochaine_action_le)}` : ""}</span>
                </div>
              )}
            </Carte>
          </div>
        </div>
      </div>
    </div>
  );
}
