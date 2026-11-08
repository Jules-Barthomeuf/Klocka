import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, FileSignature, Link2, Loader2, Printer, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { bouton, boutonPlein } from "@/components/off-market/commun";
import { BonDeVisite, SignatureBon } from "@/components/mandataire/Visites";
import ChatDashboard from "@/components/dashboard/ChatDashboard";

// La fiche d'un contact acquéreur (7 nov. 2026, Jules), refaite le 8 nov. 2026 sur la fiche d'un commerce (Jules : « au
// milieu, le même fond, le même design ; la fiche, et en dessous l'assistant, pour lui parler directement ») : au centre de
// l'écran (460 px, `surface-pleine`, coins de 18 px) ; l'en-tête, la remarque de l'assistant (son résumé et la prochaine
// action), le bon de visite, les lignes à deux colonnes centrées modifiables d'un clic, les documents signés, les pièces
// ouvertes, le lien vers la data room, l'historique ; l'assistant collé en bas, qui prend la place de la fiche dès qu'on
// lui écrit (« Fiche · Conversation »). Le serveur : PATCH /api/mandataire/acquereurs/:id, POST .../lien-dataroom.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");
const montant = (n) => {
  if (n == null || n === "") return "";
  if (typeof n !== "number" || !isFinite(n)) return String(n);
  return n >= 1e6 ? `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n).toLocaleString("fr-FR")} €`;
};

/** Le type d'un acquéreur, tel qu'il s'affiche (le serveur garde la clé ; particulier par défaut, 8 nov. 2026). */
export const TYPES_ACQUEREUR = { particulier: "Particulier", SCI: "SCI", fonciere: "Foncière", societe: "Société", autre: "Autre" };

export const TEMPERATURES = {
  chaud: ["Chaud", "bg-pervenche"],
  tiede: ["Tiède", "bg-ambre"],
  froid: ["Froid", "bg-ardoise"],
  sans_suite: ["Sans suite", "bg-bord-vif"],
};

const DOCUMENTS = [
  ["confidentialite", "Engagement de confidentialité"],
  ["bon_visite", "Bon de visite"],
  ["offre", "Offre"],
  ["partage_honoraires", "Partage d'honoraires"],
];
const ETATS_DOC = {
  signe: ["Signé", "bg-menthe/15 text-menthe"],
  envoye: ["Envoyé", "bg-pervenche/15 text-pervenche"],
  a_faire: ["À faire", "bg-ambre/15 text-ambre"],
};
// Un clic fait avancer : à faire, envoyé, signé, puis de nouveau à faire.
const SUIVANT = { a_faire: "envoye", envoye: "signe", signe: "a_faire" };

function Section({ titre, children }) {
  return (
    <section className="mt-5">
      <p className="m-0 mb-2 text-[13px] text-ardoise">{titre}</p>
      {children}
    </section>
  );
}

/** Une ligne au dessin de la fiche d'un commerce : deux colonnes égales, centrées ; la valeur se corrige d'un clic. */
function Ligne({ mot, valeur, affiche = null, onGarder = null, enfant = null }) {
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(valeur ?? "");
  useEffect(() => { if (!edition) setTexte(valeur ?? ""); }, [valeur, edition]);
  const valider = () => { setEdition(false); if (String(texte).trim() !== String(valeur ?? "").trim()) onGarder?.(String(texte).trim() || null); };
  const vide = valeur == null || valeur === "";
  return (
    <div className="grid grid-cols-2 items-stretch border-t border-trait text-center first:border-t-0">
      <dt className="flex items-center justify-center px-4 py-3 text-[13px] text-ardoise">{mot}</dt>
      <dd className="m-0 flex min-w-0 items-center justify-center border-l border-bord-doux text-[14px] text-encre">
        {enfant ? <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-3">{enfant}</div>
          : edition ? (
            <input autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider} aria-label={mot}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { e.stopPropagation(); setTexte(valeur ?? ""); setEdition(false); } }}
              className="h-full w-full border-none bg-pervenche/[0.08] px-4 py-3 text-center text-[14px] text-encre outline-none max-md:text-[16px]" />
          ) : onGarder ? (
            <div role="button" tabIndex={0} onClick={() => setEdition(true)} onKeyDown={(e) => { if (e.key === "Enter") setEdition(true); }} title="Modifier"
              className="flex min-h-full min-w-0 flex-1 cursor-text items-center justify-center px-4 py-3 hover:bg-relief/40">
              <span className="line-clamp-2 min-w-0 break-words">{vide ? <span className="text-brume">À compléter</span> : (affiche ?? valeur)}</span>
            </div>
          ) : <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-3"><span className="line-clamp-2 min-w-0 break-words">{vide ? <span className="text-brume">—</span> : (affiche ?? valeur)}</span></div>}
      </dd>
    </div>
  );
}

export default function FicheContact({ contact: c, marcheId, proprietaireId = null, onFermer }) {
  const qc = useQueryClient();
  const cle = ["m-acquereurs", marcheId];
  // L'assistant en bas (8 nov. 2026) : un message envoyé ouvre la conversation à la place de la fiche.
  const [discussion, setDiscussion] = useState(false);
  const [vue, setVue] = useState("fiche");
  const surConversation = useCallback((o) => { setDiscussion((avant) => { if (avant !== o) setVue(o ? "conversation" : "fiche"); return o; }); }, []);
  const [bon, setBon] = useState(null); // « signer » ou « voir »
  const [lien, setLien] = useState(c?.lien_dataroom || null);
  useEffect(() => { setLien(c?.lien_dataroom || null); }, [c?.id, c?.lien_dataroom]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  // La ligne rendue par le serveur remplace la sienne dans le tableau (même clé que TableauAcquereurs).
  const poser = (ligne) => qc.setQueryData(cle, (d) => {
    if (!d || !ligne?.id) return d;
    const remplacer = (l) => (l || []).map((x) => (x.id === ligne.id ? { ...x, ...ligne } : x));
    if (Array.isArray(d)) return remplacer(d);
    return d.lignes ? { ...d, lignes: remplacer(d.lignes) } : d.acquereurs ? { ...d, acquereurs: remplacer(d.acquereurs) } : d;
  });
  const garder = useMutation({
    mutationFn: (corps) => base44.request("PATCH", `/api/mandataire/acquereurs/${encodeURIComponent(c.id)}`, { body: corps }),
    onSuccess: (r) => { const l = r?.ligne || r?.acquereur || null; if (l) poser(l); else qc.invalidateQueries({ queryKey: cle }); qc.invalidateQueries({ queryKey: ["m-vente-etat", marcheId] }); },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const copier = async (l) => {
    try { await navigator.clipboard.writeText(l); toast.success("Lien copié"); } catch { toast.error("La copie n'a pas marché : sélectionnez le lien à la main."); }
  };
  const creerLien = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/pistes/${encodeURIComponent(c.id)}/lien-dataroom`),
    onSuccess: (r) => { if (r?.lien) { setLien(r.lien); copier(r.lien); qc.invalidateQueries({ queryKey: cle }); } },
    onError: (e) => toast.error(e?.message || "Le lien ne s'est pas créé"),
  });
  if (!c) return null;

  const [motTemp] = TEMPERATURES[c.temperature] || [];
  const docs = c.documents || {};
  const tel = c.telephone ? String(c.telephone).replace(/[^\d+]/g, "") : null;
  const enConv = discussion && vue === "conversation";
  const enRetard = c.prochaine_le && new Date(c.prochaine_le) < new Date(new Date().toDateString());
  const quandVisite = c.visite ? new Date(c.visite.quand).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).replace(":", " h ") : null;
  const bascule = (
    <div className="flex w-fit gap-0.5 rounded-full border border-bord-doux bg-rail p-1" role="tablist" aria-label="Vue de la fiche">
      {[["fiche", "Fiche"], ["conversation", "Assistant"]].map(([k, mot]) => (
        <button key={k} type="button" role="tab" aria-selected={vue === k} onClick={() => setVue(k)}
          className={`h-8 rounded-full px-4 text-[13.5px] ${vue === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`} style={vue === k ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[95]" role="dialog" aria-label={`Fiche de ${c.nom || "ce contact"}`}>
      <motion.div className="absolute inset-0 bg-fond/40" onClick={onFermer} aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }} />
      {/* Au centre de l'écran, comme la fiche d'un commerce sur la carte du terrain. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-3">
        <motion.aside initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}
          className="pointer-events-auto flex h-[90dvh] w-full max-w-[460px] flex-col overflow-hidden rounded-[18px] bg-surface-pleine shadow-[0_12px_40px_rgb(0_0_0/0.3)]">
          {/* L'en-tête : le nom en 20 px, le type, la source et le budget en 13 px, le statut, la croix. */}
          <div className={`flex justify-between gap-3 px-5 ${enConv ? "items-center pb-2 pt-4" : "items-start pt-5"}`}>
            <div className="min-w-0">
              <h2 className={`m-0 truncate font-normal leading-[1.2] text-encre ${enConv ? "text-[17px]" : "text-[20px]"}`}>{c.nom || "Contact"}</h2>
              {!enConv && <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{[TYPES_ACQUEREUR[c.type] || c.type, c.source, c.budget ? montant(Number(c.budget) || c.budget) : null].filter(Boolean).join(" · ") || "Acquéreur"}</p>}
            </div>
            <span className="flex flex-none items-center gap-1">
              {enConv ? bascule : motTemp && <span className="rounded-full bg-pervenche/15 px-2.5 py-1 text-[12px] text-pervenche">{motTemp}{typeof c.score === "number" ? ` · ${c.score}` : ""}</span>}
              <button type="button" onClick={onFermer} aria-label="Fermer la fiche" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </span>
          </div>
          {discussion && !enConv && <div className="px-5 pt-3">{bascule}</div>}

          <div className={enConv ? "hidden" : "min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3"}>
            {/* La remarque de l'assistant : son résumé, puis la prochaine action. */}
            <div className="mt-1 rounded-[12px] bg-pervenche/10 px-4 py-3">
              <p className="m-0 inline-flex items-center gap-1.5 text-[13px] text-pervenche"><Sparkles className="h-3.5 w-3.5 flex-none" aria-hidden />Remarque de votre assistant</p>
              <p className="m-0 mt-1.5 whitespace-pre-line text-[14px] leading-[1.5] text-encre">{c.resume || "Rien de noté encore."}</p>
              {c.prochaine && <p className="m-0 mt-1.5 text-[13.5px] text-encre">Prochaine action : {c.prochaine}{c.prochaine_le ? <span className={enRetard ? "text-ambre" : "text-ardoise"}> · {jour(c.prochaine_le)}</span> : null}</p>}
            </div>

            {/* Le bon de visite (8 nov. 2026, Jules : « on clique sur le nom, puis Bon de visite ; en grand écran, il signe »). */}
            {c.visite && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-[12px] border border-bord-doux bg-surface/40 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[14px] text-encre first-letter:uppercase">{quandVisite}</p>
                  <p className={`m-0 mt-0.5 text-[12.5px] ${c.visite.bon === "signe" ? "text-menthe" : c.visite.bon === "manquant" ? "text-alerte" : "text-ambre"}`}>
                    {c.visite.bon === "signe" ? "Bon de visite signé" : c.visite.bon === "manquant" ? "Bon non signé : la commission n'est pas protégée" : "Bon de visite à faire signer sur place"}
                  </p>
                </div>
                {c.visite.bon === "signe"
                  ? <button type="button" onClick={() => setBon("voir")} className={bouton} style={{ background: "transparent" }}><Printer className="h-4 w-4" />Voir le bon</button>
                  : <button type="button" onClick={() => setBon("signer")} className={boutonPlein}><FileSignature className="h-4 w-4" />Bon de visite</button>}
              </div>
            )}

            {/* Les lignes, au dessin de la fiche d'un commerce. */}
            <dl className="m-0 mt-3 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
              <Ligne mot="Téléphone" valeur={c.telephone} onGarder={(v) => garder.mutate({ telephone: v })}
                enfant={tel ? <a href={`tel:${tel}`} className="text-encre hover:text-pervenche">{c.telephone}</a> : null} />
              <Ligne mot="Mail" valeur={c.email} onGarder={(v) => garder.mutate({ email: v })} />
              <Ligne mot="Type" valeur={c.type} enfant={
                <select value={c.type || "particulier"} onChange={(e) => garder.mutate({ type: e.target.value })} aria-label="Type"
                  className="w-full cursor-pointer border-none bg-transparent text-center text-[14px] text-encre outline-none max-md:text-[16px]">
                  {Object.entries(TYPES_ACQUEREUR).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
                </select>
              } />
              <Ligne mot="Budget" valeur={c.budget} affiche={montant(Number(c.budget) || c.budget)} onGarder={(v) => garder.mutate({ budget: v })} />
              <Ligne mot="Financement" valeur={c.financement} onGarder={(v) => garder.mutate({ financement: v })} />
              <Ligne mot="Structure" valeur={c.structure} onGarder={(v) => garder.mutate({ structure: v })} />
              <Ligne mot="Critères" valeur={c.criteres} onGarder={(v) => garder.mutate({ criteres: v })} />
              <Ligne mot="Source" valeur={c.source} />
            </dl>

            <Section titre="Documents signés">
              <dl className="m-0 overflow-hidden rounded-[12px] border border-bord-doux bg-surface/40">
                {DOCUMENTS.map(([k, mot]) => {
                  const etat = docs[k] || "a_faire";
                  const [motEtat, teinte] = ETATS_DOC[etat] || ETATS_DOC.a_faire;
                  return (
                    <Ligne key={k} mot={mot} valeur={motEtat} enfant={
                      <button type="button" title="Changer l'état" disabled={garder.isPending} onClick={() => garder.mutate({ documents: { ...docs, [k]: SUIVANT[etat] || "envoye" } })}
                        className={`rounded-full px-2.5 py-0.5 text-[12px] ${teinte}`}>{motEtat}</button>
                    } />
                  );
                })}
              </dl>
            </Section>

            <Section titre="Pièces consultées">
              {(c.consultations || []).length ? (
                <div className="m-0">
                  {c.consultations.map((x, i) => (
                    <div key={`${x.cle}-${x.le}-${i}`} className="flex gap-6 py-2 text-[13.5px]">
                      <span className="w-12 flex-none tabular-nums text-ardoise">{jourCourt(x.le)}</span>
                      <span className="min-w-0 truncate text-encre">{x.mot || x.cle}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="m-0 text-[13.5px] text-brume">Aucune pièce ouverte pour l'instant.</p>}
            </Section>

            <Section titre="Lien vers la data room">
              {lien ? (
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] text-ardoise">{lien}</span>
                  <button type="button" onClick={() => copier(lien)} className={`${bouton} h-8 flex-none text-[12.5px]`} style={{ background: "transparent" }}><Copy className="h-3.5 w-3.5" />Copier</button>
                </div>
              ) : (
                <button type="button" onClick={() => creerLien.mutate()} disabled={creerLien.isPending} className={`${bouton} h-8 text-[12.5px]`} style={{ background: "transparent" }}>
                  {creerLien.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}Créer et copier le lien
                </button>
              )}
            </Section>

            <Section titre="Historique">
              {(c.historique || []).length ? [...c.historique].sort((a, b) => String(b.le || "").localeCompare(String(a.le || ""))).slice(0, 15).map((h, i) => (
                <div key={`${h.le}-${i}`} className="flex gap-6 py-2 text-[13.5px]">
                  <span className="w-12 flex-none tabular-nums text-ardoise">{jourCourt(h.le)}</span>
                  <span className="min-w-0 text-encre">{h.action}</span>
                </div>
              )) : <p className="m-0 py-2 text-[13.5px] text-brume">Rien encore.</p>}
            </Section>
          </div>

          {/* L'assistant, collé en bas (8 nov. 2026, Jules : « la fiche et en dessous l'assistant, pour lui parler directement »). */}
          <div className={enConv ? "flex min-h-0 flex-1 flex-col px-5 pt-1" : discussion ? "hidden" : "flex-none border-t border-trait bg-rail px-5 pb-4 pt-4"}>
            <ChatDashboard espace="mandataire" proprietaireId={proprietaireId} marcheId={marcheId} compact sansSkills epure lueur libelleAccueil="Assistant KPartners" menusVersLeHaut
              placeholderAccueil={`Parler à l'assistant de ${c.nom || "ce contact"}…`} onConversation={surConversation} sansBarreHaut={enConv}
              onReponse={() => { qc.invalidateQueries({ queryKey: cle }); qc.invalidateQueries({ queryKey: ["m-vente-etat", marcheId] }); }} />
          </div>
        </motion.aside>
      </div>
      <AnimatePresence>
        {bon === "signer" && c.visite && <SignatureBon key="signer" id={c.visite.id} plein onFermer={() => setBon(null)}
          onFait={() => { setBon(null); toast.success("Bon de visite signé"); qc.invalidateQueries({ queryKey: cle }); qc.invalidateQueries({ queryKey: ["m-vente-etat", marcheId] }); }} />}
        {bon === "voir" && c.visite && <BonDeVisite key="voir" id={c.visite.id} onFermer={() => setBon(null)} />}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
