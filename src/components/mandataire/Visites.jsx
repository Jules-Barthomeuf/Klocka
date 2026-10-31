import React, { useEffect, useMemo, useRef, useState } from "react";
import Loader from "@/components/ui/Loader";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useSearchParams } from "react-router-dom";
import { ArrowUp, Check, Loader2, Mic, PenLine, Plus, Printer, Send, Square, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useMicro } from "@/components/mandataire/FicheMandataire";
import { bouton, boutonPlein, champ } from "@/components/off-market/commun";
import jetons from "@/design/jetons.json";

// Les visites d'acquéreurs (27 oct. 2026, Jules), dans la Commercialisation d'un bien : avant, la visite et son bon
// de visite, signé sur place au doigt ; après, le récit au micro, puis la note interne et le compte rendu au
// propriétaire que Haka propose et que le mandataire valide ; le compte rendu part de sa messagerie. Rien ne part
// sans validation, et rien de l'acquéreur (nom, budget, financement) ne va au propriétaire (server/visites-acquereur.js).

const API = "/api/mandataire/visites";
// Le bon est un document : encre sur papier blanc, quel que soit le thème (le canvas ne lit pas les variables).
const PAPIER = jetons.couleurs_clair.fond;
const ENCRE_PAPIER = jetons.couleurs_clair.encre;
const INTERETS = [["fort", "Fort", "bg-menthe"], ["moyen", "Moyen", "bg-ambre"], ["nul", "Nul", "bg-brume"]];
const ETATS_BON = {
  signe: ["text-menthe", "Bon signé"],
  a_signer: ["text-ambre", "Bon à signer"],
  manquant: ["text-alerte", "Sans bon signé"],
};
const quandLisible = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : "");

/** Les visites d'un bien : la liste, « Nouvelle visite », et la visite ouverte (aussi depuis un lien de Haka). */
export default function Visites({ bien }) {
  const { data, isLoading } = useQuery({ queryKey: ["m-visites"], queryFn: () => base44.request("GET", API) });
  const [params, setParams] = useSearchParams();
  const ouverte = params.get("visite");
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("visite", id); else n.delete("visite"); return n; }, { replace: true });
  const [nouvelle, setNouvelle] = useState(false);
  const ids = useMemo(() => new Set(bien?.ids || [bien?.cle].filter(Boolean)), [bien]);
  const visites = useMemo(() => (data?.visites || []).filter((v) => (v.bien?.cles || []).some((c) => ids.has(c))), [data, ids]);

  return (
    <section className="mt-6" aria-label="Visites">
      <div className="flex items-center gap-3">
        <h2 className="m-0 text-[15px] font-normal text-encre">Visites{visites.length ? <span className="text-ardoise"> · {visites.length}</span> : null}</h2>
        <span className="flex-1" />
        <button type="button" onClick={() => setNouvelle(true)} className={boutonPlein}><Plus className="h-4 w-4" /> Nouvelle visite</button>
      </div>
      {isLoading ? <Loader titre="Les visites…" />
        : !visites.length ? <p className="m-0 mt-3 text-[13.5px] text-brume">Aucune visite encore. Créez-la ici, ou dites-la à l'Assistant KPartners (« je fais visiter à M. Durand jeudi 15 h ») : le bon de visite se prépare, il se signe sur place.</p>
        : (
          <ul className="m-0 mt-3 list-none overflow-hidden rounded-bloc border border-trait p-0">
            {visites.map((v) => {
              const [couleur, mot] = ETATS_BON[v.etat_bon] || ETATS_BON.a_signer;
              const interet = INTERETS.find(([k]) => k === v.note_interne?.interet);
              return (
                <li key={v.id} className="border-b border-trait last:border-b-0">
                  <button type="button" onClick={() => ouvrir(v.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-relief/40" style={{ background: "transparent" }}>
                    <span className="w-[120px] flex-none text-[13px] tabular-nums text-craie max-md:w-[92px]">{quandLisible(v.quand)}</span>
                    <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{v.acquereur_nom}{v.acquereur?.profil ? <span className="text-ardoise"> · {v.acquereur.profil}</span> : null}</span>
                    {interet && <span className="inline-flex flex-none items-center gap-1.5 text-[12.5px] text-craie max-md:hidden"><span className={`h-2 w-2 rounded-full ${interet[2]}`} />Intérêt {interet[1].toLowerCase()}</span>}
                    <span className={`flex-none text-[12.5px] ${couleur}`}>{v.envoi?.le ? <span className="text-menthe">Compte rendu envoyé</span> : mot}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      <AnimatePresence>
        {nouvelle && <NouvelleVisite key="n" bien={bien} acquereurs={data?.acquereurs} onFermer={() => setNouvelle(false)} onCree={(id) => { setNouvelle(false); ouvrir(id); }} />}
        {ouverte && <VisiteOuverte key={ouverte} id={ouverte} onFermer={() => ouvrir(null)} />}
      </AnimatePresence>
    </section>
  );
}

/** Un panneau au centre de l'écran (plein écran au téléphone), la croix en haut à droite. */
function Panneau({ titre, sous = null, onFermer, children, large = false }) {
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onFermer]);
  return createPortal(
    <motion.div className="fixed inset-0 z-[95] flex items-start justify-center overflow-y-auto bg-fond/70 px-4 py-10 backdrop-blur-sm max-md:p-0"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} onClick={onFermer}>
      <motion.div role="dialog" aria-label={titre} onClick={(e) => e.stopPropagation()}
        initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 12, opacity: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}
        className={`relative w-full ${large ? "max-w-[820px]" : "max-w-[560px]"} rounded-[18px] border border-bord-doux bg-rail px-6 pb-6 pt-5 shadow-[0_20px_50px_rgb(0_0_0/0.28)] max-md:min-h-full max-md:rounded-none max-md:px-4`}>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        <h2 className="m-0 pr-10 text-[18px] font-normal text-encre">{titre}</h2>
        {sous && <p className="m-0 mt-1 text-[13px] text-ardoise">{sous}</p>}
        <div className="mt-5">{children}</div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

/** Créer une visite : l'acquéreur (le sien, un nouveau, ou un client de Klocka) et l'heure ; le bien est celui ouvert. */
function NouvelleVisite({ bien, acquereurs = {}, onFermer, onCree }) {
  const qc = useQueryClient();
  const [choix, setChoix] = useState("nouveau");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [email, setEmail] = useState("");
  const [quand, setQuand] = useState("");
  const creer = useMutation({
    mutationFn: () => {
      const acquereur = choix === "nouveau" ? { nom, telephone, email } : choix.startsWith("a:") ? { acquereur_id: choix.slice(2) } : { demande_id: choix.slice(2) };
      return base44.request("POST", API, { body: { bien: { ids: bien.ids, cle: bien.cle, titre: bien.titre, adresse: bien.adresse }, acquereur, quand: quand ? new Date(quand).toISOString() : null } });
    },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["m-visites"] }); toast.success("Visite notée : le bon de visite est prêt à signer."); onCree(r.visite.id); },
    onError: (e) => toast.error(e?.message || "La visite n'a pas pu être créée."),
  });
  const siens = acquereurs.siens || [];
  const klocka = acquereurs.klocka || [];
  return (
    <Panneau titre="Nouvelle visite" sous={bien?.titre} onFermer={onFermer}>
      <label className="block text-[12.5px] text-ardoise">Qui visite ?</label>
      <select value={choix} onChange={(e) => setChoix(e.target.value)} className={`${champ} mt-1.5 w-full`}>
        <option value="nouveau">Un nouvel acquéreur</option>
        {siens.length > 0 && <optgroup label="Mes acquéreurs">{siens.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.nom}</option>)}</optgroup>}
        {klocka.length > 0 && <optgroup label="Clients de Klocka">{klocka.map((d) => <option key={d.demande_id} value={`d:${d.demande_id}`}>{d.reference}{d.profil ? ` · ${d.profil}` : ""}</option>)}</optgroup>}
      </select>
      {choix === "nouveau" && (
        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Nom" className={`${champ} w-full`} />
          <input value={telephone} onChange={(e) => setTelephone(e.target.value)} placeholder="Téléphone" inputMode="tel" className={`${champ} w-full`} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Mail" inputMode="email" className={`${champ} w-full`} />
        </div>
      )}
      <label className="mt-4 block text-[12.5px] text-ardoise">Quand ?</label>
      <input type="datetime-local" value={quand} onChange={(e) => setQuand(e.target.value)} className={`${champ} mt-1.5 w-full`} />
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={() => creer.mutate()} disabled={creer.isPending || !quand || (choix === "nouveau" && !nom.trim())} className={boutonPlein}>
          {creer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Créer la visite
        </button>
      </div>
    </Panneau>
  );
}

/** Une visite ouverte : le bon, le récit, les deux documents, l'envoi au propriétaire. */
function VisiteOuverte({ id, onFermer }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-visite", id], queryFn: () => base44.request("GET", `${API}/${id}`) });
  const v = data?.visite;
  const [signer, setSigner] = useState(false);
  const [voirBon, setVoirBon] = useState(false);
  const maj = (r) => { qc.setQueryData(["m-visite", id], r); qc.invalidateQueries({ queryKey: ["m-visites"] }); };
  if (isLoading || isError || !v) {
    return <Panneau titre="Visite" onFermer={onFermer}>{isError ? <p className="m-0 text-[13.5px] text-alerte">Visite introuvable.</p> : <Loader2 className="h-5 w-5 animate-spin text-menthe" />}</Panneau>;
  }
  const [couleur, mot] = ETATS_BON[v.etat_bon] || ETATS_BON.a_signer;
  return (
    <Panneau large titre={`${v.acquereur_nom}${v.acquereur?.profil ? ` · ${v.acquereur.profil}` : ""}`} sous={`${v.bien?.titre || ""} · ${quandLisible(v.quand)}`} onFermer={onFermer}>
      {/* Le bon de visite : signé, ou à faire signer sur place ; sans bon, une alerte claire. */}
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-bord-doux px-4 py-3">
        <span className={`inline-flex items-center gap-2 text-[13.5px] ${couleur}`}><span className="h-2 w-2 rounded-full bg-current" />{mot}</span>
        {v.bon?.signe_le && <span className="text-[12.5px] text-ardoise">par {v.bon.nom}, {quandLisible(v.bon.signe_le)}</span>}
        <span className="flex-1" />
        {v.bon?.signe_le
          ? <button type="button" onClick={() => setVoirBon(true)} className={bouton}><Printer className="h-4 w-4" /> Voir le bon</button>
          : <button type="button" onClick={() => setSigner(true)} className={boutonPlein}><PenLine className="h-4 w-4" /> Faire signer</button>}
      </div>
      {v.etat_bon === "manquant" && <p className="m-0 mt-2 text-[12.5px] text-alerte">L'heure de la visite est passée sans bon signé : la commission n'est pas protégée. Faites-le signer dès que possible.</p>}

      {/* Le récit : au micro ou écrit ; Haka propose les deux documents. */}
      <h3 className="m-0 mt-6 text-[15px] font-normal text-encre">{v.recit ? "Le récit de la visite" : "Racontez la visite"}</h3>
      {v.recit && <p className="m-0 mt-1.5 line-clamp-3 text-[13px] leading-[1.55] text-ardoise">{v.recit.texte}</p>}
      <Recit id={id} refaire={!!v.recit} onFait={maj} />

      {(v.proposition || v.valide_le) && <Documents v={v} onFait={maj} />}

      <AnimatePresence>
        {signer && <SignatureBon key="s" id={id} onFermer={() => setSigner(false)} onFait={(r) => { maj(r); setSigner(false); toast.success("Bon de visite signé."); }} />}
        {voirBon && <BonDeVisite key="b" id={id} onFermer={() => setVoirBon(false)} />}
      </AnimatePresence>
    </Panneau>
  );
}

/** Dicter ou écrire le récit, comme la dictée de la fiche : une pilule, le micro et l'envoi. */
function Recit({ id, refaire, onFait }) {
  const [texte, setTexte] = useState("");
  const lire = useMutation({
    mutationFn: (son) => {
      if (son) { const f = new FormData(); f.append("audio", son, "visite.webm"); return base44.request("POST", `${API}/${id}/recit`, { body: f, isForm: true }); }
      return base44.request("POST", `${API}/${id}/recit`, { body: { texte: texte.trim() } });
    },
    onSuccess: (r) => { setTexte(""); onFait(r); if (r.compris) toast.success(r.compris); },
    onError: (e) => toast.error(e?.message || "L'Assistant KPartners n'a pas pu le lire."),
  });
  const micro = useMicro((son) => lire.mutate(son));
  return (
    <div className="mt-3">
      <div className="flex items-end gap-2 rounded-[22px] border border-bord-doux bg-fond px-3 py-2">
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={2} disabled={lire.isPending || micro.enCours}
          placeholder={refaire ? "Ajoutez ou corrigez : Assistant KPartners refait les documents" : "Sa réaction, ce qui lui a plu, ses objections, son intérêt, son budget et son financement, la suite"}
          className="min-h-[44px] flex-1 resize-none border-0 bg-transparent py-1.5 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        <button type="button" onClick={micro.enCours ? micro.arreter : micro.demarrer} disabled={lire.isPending} aria-label={micro.enCours ? "Arrêter" : "Dicter"}
          className={`grid h-9 w-9 flex-none place-items-center rounded-full ${micro.enCours ? "text-alerte" : "text-craie hover:text-encre"}`} style={{ background: "transparent" }}>
          {micro.enCours ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </button>
        <button type="button" onClick={() => lire.mutate(null)} disabled={lire.isPending || !texte.trim()} aria-label="Envoyer à l'Assistant KPartners"
          className="grid h-9 w-9 flex-none place-items-center rounded-full bg-pervenche text-sur-menthe-pale disabled:opacity-40">
          {lire.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </div>
      {micro.enCours && <p className="m-0 mt-1 text-[12.5px] text-alerte">Je vous écoute… appuyez sur le carré pour finir.</p>}
      {lire.isPending && <p className="m-0 mt-1 text-[12.5px] text-ardoise">L'Assistant KPartners prépare la note interne et le compte rendu…</p>}
    </div>
  );
}

const enLignes = (l) => (l || []).join("\n");
const deLignes = (t) => String(t || "").split("\n").map((x) => x.trim()).filter(Boolean);

function Ligne({ mot, children }) {
  return <label className="block"><span className="mb-1 block text-[12.5px] text-ardoise">{mot}</span>{children}</label>;
}

/** Les deux documents, à relire et corriger sur place, puis « Valider » ; validés, le compte rendu part par mail. */
function Documents({ v, onFait }) {
  const base = v.valide_le ? { note_interne: v.note_interne, compte_rendu: v.compte_rendu } : v.proposition;
  const [onglet, setOnglet] = useState("note");
  const [note, setNote] = useState(base?.note_interne || {});
  const [cr, setCr] = useState(base?.compte_rendu || {});
  // Une nouvelle proposition (récit refait) remplace ce qui est à l'écran.
  useEffect(() => { setNote(base?.note_interne || {}); setCr(base?.compte_rendu || {}); }, [v.proposition, v.valide_le]);
  const valider = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${v.id}/valider`, { body: { note_interne: note, compte_rendu: cr } }),
    onSuccess: (r) => { onFait(r); toast.success("Validé : la note est rangée, la relance est datée."); },
    onError: (e) => toast.error(e?.message || "La validation n'a pas pu se faire."),
  });
  const envoyer = useMutation({
    mutationFn: async () => {
      const { mail } = await base44.request("GET", `${API}/${v.id}/mail`);
      window.location.href = `mailto:${encodeURIComponent(mail.a || "")}?subject=${encodeURIComponent(mail.objet)}&body=${encodeURIComponent(mail.texte)}`;
      return base44.request("POST", `${API}/${v.id}/envoye`, { body: { a: mail.a } });
    },
    onSuccess: (r) => { onFait(r); toast.success("Le compte rendu s'ouvre dans votre messagerie."); },
    onError: (e) => toast.error(e?.message || "Le mail n'a pas pu se préparer."),
  });
  const n = (k) => (e) => setNote((x) => ({ ...x, [k]: e.target.value }));
  const modifie = JSON.stringify({ note, cr }) !== JSON.stringify({ note: base?.note_interne || {}, cr: base?.compte_rendu || {} });
  const champTexte = "w-full rounded-[12px] border border-bord-vif bg-fond px-3.5 py-2 text-[13.5px] leading-[1.5] text-encre outline-none focus:border-menthe max-md:text-[16px]";
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        {[["note", "Note interne"], ["cr", "Compte rendu au propriétaire"]].map(([k, mot]) => (
          <button key={k} type="button" onClick={() => setOnglet(k)} className={`h-9 rounded-full px-4 text-[13.5px] ${onglet === k ? "bg-relief text-encre" : "text-ardoise hover:text-encre"}`} style={onglet === k ? undefined : { background: "transparent" }}>{mot}</button>
        ))}
        <span className="flex-1" />
        {v.valide_le && <span className="text-[12.5px] text-menthe">Validé {quandLisible(v.valide_le)}</span>}
      </div>
      {onglet === "note" ? (
        <div className="mt-3 grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-ardoise">Intérêt</span>
            {INTERETS.map(([k, mot, pastille]) => (
              <button key={k} type="button" onClick={() => setNote((x) => ({ ...x, interet: k }))} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] ${note.interet === k ? "border-menthe text-encre" : "border-bord-vif text-craie"}`} style={{ background: "transparent" }}>
                <span className={`h-2 w-2 rounded-full ${pastille}`} />{mot}
              </button>
            ))}
          </div>
          <Ligne mot="Sa réaction"><input value={note.reaction || ""} onChange={n("reaction")} className={`${champ} w-full`} /></Ligne>
          <Ligne mot="Objections (une par ligne)"><textarea rows={3} value={enLignes(note.objections)} onChange={(e) => setNote((x) => ({ ...x, objections: deLignes(e.target.value) }))} className={champTexte} /></Ligne>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Ligne mot="Budget"><input value={note.budget || ""} onChange={n("budget")} className={`${champ} w-full`} /></Ligne>
            <Ligne mot="Financement"><input value={note.financement || ""} onChange={n("financement")} className={`${champ} w-full`} /></Ligne>
            <Ligne mot="Délai"><input value={note.delai || ""} onChange={n("delai")} className={`${champ} w-full`} /></Ligne>
            <Ligne mot="Autres biens visités"><input value={note.autres_biens || ""} onChange={n("autres_biens")} className={`${champ} w-full`} /></Ligne>
          </div>
          <Ligne mot="Prochaine étape"><input value={note.prochaine_etape || ""} onChange={n("prochaine_etape")} className={`${champ} w-full`} /></Ligne>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
            <Ligne mot="Relance"><input value={note.relance?.quoi || ""} onChange={(e) => setNote((x) => ({ ...x, relance: { ...(x.relance || {}), quoi: e.target.value } }))} className={`${champ} w-full`} /></Ligne>
            <Ligne mot="Le"><input type="date" value={note.relance?.le || ""} onChange={(e) => setNote((x) => ({ ...x, relance: { ...(x.relance || {}), le: e.target.value } }))} className={`${champ} w-full`} /></Ligne>
          </div>
          <p className="m-0 text-[12.5px] text-brume">Reste interne : rangée dans la fiche du bien et dans celle de l'acquéreur.</p>
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          <Ligne mot="Le visiteur, sans son nom"><input value={cr.profil || ""} onChange={(e) => setCr((x) => ({ ...x, profil: e.target.value }))} className={`${champ} w-full`} /></Ligne>
          <Ligne mot="Impression générale"><textarea rows={2} value={cr.impression || ""} onChange={(e) => setCr((x) => ({ ...x, impression: e.target.value }))} className={champTexte} /></Ligne>
          <Ligne mot="Points positifs (un par ligne)"><textarea rows={3} value={enLignes(cr.points_positifs)} onChange={(e) => setCr((x) => ({ ...x, points_positifs: deLignes(e.target.value) }))} className={champTexte} /></Ligne>
          <Ligne mot="Réserves (une par ligne)"><textarea rows={3} value={enLignes(cr.reserves)} onChange={(e) => setCr((x) => ({ ...x, reserves: deLignes(e.target.value) }))} className={champTexte} /></Ligne>
          <p className="m-0 text-[12.5px] text-brume">Jamais le nom, le budget ni le financement de l'acquéreur : ce qui en parle est retiré à la validation.</p>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
        {v.envoi?.le && <span className="mr-auto text-[12.5px] text-menthe">Compte rendu envoyé {quandLisible(v.envoi.le)}{v.envoi.a ? ` à ${v.envoi.a}` : ""}</span>}
        {(!v.valide_le || modifie) && (
          <button type="button" onClick={() => valider.mutate()} disabled={valider.isPending} className={boutonPlein}>
            {valider.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {v.valide_le ? "Revalider" : "Valider les deux documents"}
          </button>
        )}
        {v.valide_le && !modifie && (
          <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending} className={v.envoi?.le ? bouton : boutonPlein}>
            {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {v.envoi?.le ? "Renvoyer au propriétaire" : "Envoyer au propriétaire"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Le texte du bon, en document (encre sur papier). */
function FeuilleBon({ bon, children = null }) {
  return (
    <div className="rounded-[12px] px-6 py-5 text-[13.5px] leading-[1.6]" style={{ background: PAPIER, color: ENCRE_PAPIER }}>
      <p className="m-0 text-[18px]">{bon.titre}</p>
      {bon.lignes.map((l, i) => <p key={i} className="m-0 mt-3">{l}</p>)}
      {children}
    </div>
  );
}

/** Signer sur place : le visiteur lit le bon, écrit son nom et signe au doigt ; plein écran au téléphone. */
function SignatureBon({ id, onFermer, onFait }) {
  const { data } = useQuery({ queryKey: ["m-visite-bon", id], queryFn: () => base44.request("GET", `${API}/${id}/bon`) });
  const [nom, setNom] = useState("");
  const [trace, setTrace] = useState(false);
  const canvas = useRef(null);
  const dessin = useRef(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const k = window.devicePixelRatio || 1;
    c.width = r.width * k; c.height = r.height * k;
    const ctx = c.getContext("2d");
    ctx.scale(k, k);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = ENCRE_PAPIER;
  }, [data]);
  const point = (e) => { const r = canvas.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const debut = (e) => { e.preventDefault(); canvas.current.setPointerCapture(e.pointerId); dessin.current = point(e); };
  const bouge = (e) => {
    if (!dessin.current) return;
    const ctx = canvas.current.getContext("2d");
    const [x, y] = point(e);
    ctx.beginPath(); ctx.moveTo(...dessin.current); ctx.lineTo(x, y); ctx.stroke();
    dessin.current = [x, y];
    setTrace(true);
  };
  const fin = () => { dessin.current = null; };
  const effacer = () => { const c = canvas.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setTrace(false); };
  const signer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/bon`, { body: { nom: nom.trim(), signature: canvas.current.toDataURL("image/png") } }),
    onSuccess: onFait,
    onError: (e) => toast.error(e?.message || "La signature n'a pas pu être gardée."),
  });
  const bon = data?.bon ? { ...data.bon, lignes: data.bon.lignes.map((l) => l.replace("Je soussigné(e) …", `Je soussigné(e) ${nom.trim() || "…"}`)) } : null;
  return (
    <Panneau titre="Bon de visite" sous="À faire lire et signer par le visiteur, avant d'entrer." onFermer={onFermer}>
      {!bon ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : (
        <>
          <FeuilleBon bon={bon} />
          <label className="mt-4 block text-[12.5px] text-ardoise">Nom et prénom du visiteur</label>
          <input value={nom} onChange={(e) => setNom(e.target.value)} autoComplete="off" className={`${champ} mt-1.5 w-full`} />
          <div className="mt-4 flex items-center"><span className="text-[12.5px] text-ardoise">Signature</span><span className="flex-1" />{trace && <button type="button" onClick={effacer} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Effacer</button>}</div>
          <canvas ref={canvas} onPointerDown={debut} onPointerMove={bouge} onPointerUp={fin} onPointerCancel={fin}
            className="mt-1.5 h-[180px] w-full touch-none rounded-[12px]" style={{ background: PAPIER }} aria-label="Zone de signature" />
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={() => signer.mutate()} disabled={signer.isPending || !trace || !nom.trim()} className={boutonPlein}>
              {signer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Signer le bon
            </button>
          </div>
        </>
      )}
    </Panneau>
  );
}

/** Le bon signé, à montrer ou imprimer. */
function BonDeVisite({ id, onFermer }) {
  const { data } = useQuery({ queryKey: ["m-visite-bon", id, "signe"], queryFn: () => base44.request("GET", `${API}/${id}/bon`) });
  const bon = data?.bon;
  const imprimer = () => {
    const w = window.open("", "_blank");
    if (!w || !bon) return;
    const p = (t) => `<p style="margin:12px 0 0">${String(t).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]))}</p>`;
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Bon de visite</title><body style="font-family:system-ui,sans-serif;max-width:640px;margin:48px auto;line-height:1.6;font-size:14px"><h1 style="font-size:20px;font-weight:500">${bon.titre}</h1>${bon.lignes.map(p).join("")}${p(`Signé par ${bon.nom || ""} le ${quandLisible(bon.signe_le)}`)}${bon.signature ? `<img src="${bon.signature}" alt="Signature" style="margin-top:12px;height:120px">` : ""}</body>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Panneau titre="Bon de visite signé" onFermer={onFermer}>
      {!bon ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : (
        <>
          <FeuilleBon bon={bon}>
            <p className="m-0 mt-4">Signé par {bon.nom}, {quandLisible(bon.signe_le)}</p>
            {bon.signature && <img src={bon.signature} alt="Signature du visiteur" className="mt-2 h-[110px]" />}
          </FeuilleBon>
          <div className="mt-5 flex justify-end"><button type="button" onClick={imprimer} className={bouton}><Printer className="h-4 w-4" /> Imprimer</button></div>
        </>
      )}
    </Panneau>
  );
}
