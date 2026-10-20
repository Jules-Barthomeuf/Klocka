import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { useCompteHaka, usePropositions } from "@/components/haka/useFileHaka";
import { ilYa } from "@/components/dashboard/ChatDashboard";
import NotificationsVolet from "@/components/haka/NotificationsVolet";
import ApercuFicheRecue from "@/components/haka/ApercuFicheRecue";

// La cloche, dans la barre du haut (17 oct. 2026, Jules, variante B : « l'accueil reste celui de Max, ce qui
// attend passe par une cloche »). Entre les boîtes connectées et le mode appel, sur toutes les pages de
// l'équipe. Le compteur ne compte que ce qui attend une action de la personne connectée : ses dossiers et
// les relances de ses agents. Un clic ouvre le volet « Ce qui t'attend », le reste de la page s'assombrit.
// On ne valide rien dans le volet : il sert à savoir et à aller au bon endroit, où l'objet vit avec son contexte.

const orange = "bg-ambre";
const vert = "bg-menthe";

/** Pure : les lignes du volet, depuis mes propositions et les lignes dues de « Ce qui vous attend ». */
export function lignesDeLaCloche({ propositions = [], dues = [], alertes = [] } = {}) {
  // Les alertes des automatismes (Jules seul) : en erreur, plafond atteint, planifié qui n'a pas tourné.
  const lignes = alertes.map((a) => ({ cle: `alerte:${a.cle}`, teinte: orange, phrase: a.phrase, lieu: a.lieu, quand: a.le ? ilYa(a.le) : "aujourd'hui", lien: a.lien, action: true, le: a.le }));
  const relances = propositions.filter((p) => p.type === "relance_mail");
  for (const p of propositions) {
    if (p.type === "relance_mail") continue;
    const info = Array.isArray(p.actions) && p.actions.length === 1 && p.actions[0] === "vu";
    const dossier = p.dossier ? `/Dossiers?deal_id=${p.dossier}` : null;
    if (p.type === "preanalyser_fiche") {
      // Une fiche reçue (19 oct. 2026, Jules) : rien n'est pré-analysé sans un clic. Depuis le 20 oct. : « Voir » ouvre la
      // fiche ou le mail, et c'est là qu'on la rentre ou non (un humain dans la boucle).
      const de = p.charge?.de || p.charge?.de_email || null;
      lignes.push({ cle: p.id, teinte: orange, phrase: "Une nouvelle fiche commerciale est arrivée", lieu: [de && `De ${de}`, p.charge?.objet].filter(Boolean).join(" · ") || p.resume || "Fiche reçue", quand: ilYa(p.cree_le), lien: null, fiche: p.id, proposition: p, action: true, le: p.cree_le });
    } else if (p.type === "meme_bien_recu") {
      lignes.push({ cle: p.id, teinte: vert, phrase: p.titre, lieu: "Dossier", quand: ilYa(p.cree_le), lien: dossier || `/AValider?id=${p.id}`, vu: p.id, action: false, le: p.cree_le });
    } else if (p.type === "demande_documents") {
      lignes.push({ cle: p.id, teinte: orange, phrase: "Demande de documents prête", lieu: `Dossier · ${String(p.titre || "").replace(/^Demander les documents\s*[·:-]?\s*/i, "") || "ouvrir"}`, quand: ilYa(p.cree_le), lien: dossier || `/AValider?id=${p.id}`, action: true, le: p.cree_le });
    } else {
      lignes.push({ cle: p.id, teinte: info ? vert : orange, phrase: p.titre, lieu: p.dossier ? "Dossier" : "À valider", quand: ilYa(p.cree_le), lien: dossier && !info ? dossier : `/AValider?id=${p.id}`, action: !info, le: p.cree_le });
    }
  }
  if (relances.length) {
    const recente = relances.map((p) => p.cree_le).sort().pop();
    lignes.push({ cle: "relances", teinte: orange, phrase: `${relances.length} relance${relances.length > 1 ? "s" : ""} préparée${relances.length > 1 ? "s" : ""}`, lieu: "Appels", quand: ilYa(recente), lien: "/Prospection?partie=journee", action: true, n: relances.length, le: recente });
  }
  // Ce qui était déjà dû avant Haka (rappels, promesses, relances de dossier) : le volet le reprend.
  for (const l of dues) {
    lignes.push({ cle: `${l.source}:${l.id}`, teinte: l.nouveau ? vert : orange, phrase: l.titre, lieu: l.dossier || l.detail || (l.source === "rappel" ? "Rappel" : l.source === "promesse" ? "Promesse" : "Relance"), quand: l.nouveau ? "à l'instant" : l.dans < 0 ? `en retard de ${-l.dans} jour${-l.dans > 1 ? "s" : ""}` : "aujourd'hui", lien: l.lien || null, action: !l.nouveau, ancien: l, le: null });
  }
  return lignes;
}

/** Pure : le nombre d'éléments qui attendent une action (une ligne groupée compte pour ses éléments). */
export const compteurDeLaCloche = (lignes) => lignes.filter((l) => l.action).reduce((n, l) => n + (l.n || 1), 0);

export default function Cloche({ className = "" }) {
  const [ouvert, setOuvert] = useState(false);
  const navigate = useNavigate();
  const user = useUser();
  const actif = !!useCompteHaka().data?.actif;
  const moi = usePropositions("moi");
  // Les fiches reçues dans une boîte commune (sourcing@) n'ont pas de propriétaire : elles sonnent aussi.
  const commun = usePropositions("commun");
  const alertes = useQuery({ queryKey: ["haka-alertes"], queryFn: () => base44.request("GET", "/api/haka/alertes"), refetchInterval: 120_000, retry: false });
  const attend = useQuery({ queryKey: ["ce-qui-attend"], queryFn: () => base44.request("GET", "/api/assistant/attend"), refetchInterval: 60_000, staleTime: 30_000 });
  const lignes = useMemo(() => {
    const dues = (attend.data?.lignes || []).filter((l) => l.nouveau || (l.dans != null && l.dans <= 0));
    const fichesCommunes = (commun.data?.propositions || []).filter((p) => p.type === "preanalyser_fiche");
    return lignesDeLaCloche({ propositions: actif ? [...(moi.data?.propositions || []), ...fichesCommunes] : [], dues, alertes: alertes.data?.alertes || [] });
  }, [actif, moi.data, commun.data, attend.data, alertes.data]);
  const n = compteurDeLaCloche(lignes);

  useEffect(() => {
    if (!ouvert) return undefined;
    const touche = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [ouvert]);

  const ouvrir = (l) => {
    setOuvert(false);
    // Une information se lit en ouvrant l'objet, puis disparaît.
    if (l.vu) base44.request("POST", `/api/haka/propositions/${l.vu}/valider`, { body: {} }).catch(() => {});
    if (l.lien) navigate(l.lien);
  };
  // Pré-analyser ou non une fiche reçue : la ligne part, la pré-analyse tourne en fond et prévient quand elle est prête.
  const [decidees, setDecidees] = useState(() => new Set());
  const [apercu, setApercu] = useState(null); // la proposition ouverte
  const trancher = (l, choix) => {
    setDecidees((s) => new Set([...s, l.fiche]));
    base44.request("POST", `/api/haka/propositions/${l.fiche}/valider`, { body: { choix } })
      .then(() => { moi.refetch(); commun.refetch(); })
      .catch(() => setDecidees((s) => { const n = new Set(s); n.delete(l.fiche); return n; }));
  };
  const fait = (l) => {
    base44.request("POST", `/api/assistant/attend/${l.ancien.source}/${encodeURIComponent(l.ancien.id)}/fait`).then(() => attend.refetch()).catch(() => {});
  };

  return (
    <div className={`${ouvert ? "z-[56]" : "z-40"} ${className}`}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="dialog"
        aria-label={n ? `Ce qui t'attend : ${n}` : "Ce qui t'attend"} title="Ce qui t'attend"
        className="relative grid h-[38px] w-[38px] place-items-center rounded-full border border-trait bg-surface-pleine text-ardoise transition-colors duration-300 hover:border-bord-doux hover:text-encre">
        <motion.span className="grid place-items-center" animate={{ rotate: ouvert ? [0, -14, 10, -6, 0] : 0 }} transition={{ duration: 0.5 }}><Bell className="h-4 w-4" strokeWidth={1.7} /></motion.span>
        <AnimatePresence initial={false}>
          {n > 0 && (
            <motion.span key={n} initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}
              className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ambre px-1 text-[11px] font-medium tabular-nums text-fond">{n}</motion.span>
          )}
        </AnimatePresence>
      </button>
      {createPortal(
        <AnimatePresence>
          {ouvert && (
            <>
              <motion.div key="voile" className="fixed inset-0 z-[54] bg-black/25" onClick={() => setOuvert(false)}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
              <motion.div key="volet" role="dialog" aria-label="Ce qui t'attend"
                className="fixed right-4 top-[66px] z-[55] w-[440px] max-w-[calc(100vw-2rem)] origin-top-right overflow-hidden rounded-[18px] border border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.28)]"
                initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
                <div className="flex items-center justify-between border-b border-trait px-5 py-3.5">
                  <p className="m-0 text-[14px] text-encre">Ce qui t'attend</p>
                  <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
                </div>
                <div className="max-h-[min(60vh,520px)] overflow-y-auto px-2 py-1.5">
                  {!lignes.length ? (
                    <p className="m-0 px-3 py-6 text-center text-[13.5px] text-brume">Rien n'attend votre action pour l'instant.</p>
                  ) : lignes.filter((l) => !decidees.has(l.fiche)).map((l, i) => (
                    <motion.div key={l.cle} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.25), ease: [0.22, 1, 0.36, 1] }}
                      className="flex items-start gap-3 rounded-[12px] px-3 py-3 transition-colors hover:bg-encre/[0.04]">
                      <span className={`mt-[7px] h-[7px] w-[7px] flex-none rounded-full ${l.teinte}`} aria-label={l.action ? "Action attendue" : "Information"} />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[14.5px] leading-[1.4] text-encre">{l.phrase}</p>
                        <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{[l.lieu, l.quand].filter(Boolean).join(" · ")}</p>
                      </div>
                      {l.fiche ? (
                        <button type="button" onClick={() => { setOuvert(false); setApercu(l.proposition); }} className="inline-flex h-8 flex-none items-center rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe transition-colors hover:bg-menthe-survol">Voir</button>
                      ) : l.lien ? (
                        <button type="button" onClick={() => ouvrir(l)} className="inline-flex h-8 flex-none items-center rounded-full border border-trait px-3.5 text-[13px] text-encre transition-colors hover:border-bord-vif" style={{ background: "transparent" }}>Ouvrir</button>
                      ) : l.ancien ? (
                        <button type="button" onClick={() => fait(l)} className="inline-flex h-8 flex-none items-center rounded-full border border-trait px-3.5 text-[13px] text-ardoise transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Fait</button>
                      ) : null}
                    </motion.div>
                  ))}
                  {/* Mes notifications, sous ce qui attend (19 oct. 2026, Jules) : chacune se lit ou s'efface d'un clic. */}
                  <NotificationsVolet onOuvrir={(lien) => { setOuvert(false); navigate(lien); }} />
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
      {apercu && <ApercuFicheRecue proposition={apercu} onFermer={() => setApercu(null)} onTrancher={(choix) => { trancher({ fiche: apercu.id }, choix); setApercu(null); }} />}
    </div>
  );
}
