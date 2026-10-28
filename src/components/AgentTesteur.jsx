import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { pageDeChemin } from "@/lib/adresses";
import { erreursRecentes } from "@/lib/NavigationTracker";

// L'agent testeur (10 oct. 2026) : un bouton en haut à droite, pour l'équipe.
// Un clic, et l'IA ouvre la page que l'on regarde dans un bac à sable, clique
// sur tout, la juge, puis envoie son analyse par mail et la garde dans
// Suivi > Agent testeur. Le bouton suit l'avancement pendant l'audit.

const req = (m, chemin, body) => base44.request(m, `/api/testeur${chemin}`, body ? { body } : undefined);
const secondaire = "h-10 rounded-full border border-bord-vif px-4 text-[14px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50";
const principal = "h-10 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50";

export function BoutonTesteur({ compact = false, vue = "admin" }) {
  const { pathname, search } = useLocation();
  const qc = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [note, setNote] = useState("");
  const etat = useQuery({ queryKey: ["testeur", "etat"], queryFn: () => req("GET", "/etat"), refetchInterval: (q) => (q.state.data?.en_cours ? 5000 : 60000) });
  const enCours = etat.data?.en_cours || null;
  const page = pageDeChemin(pathname) || pathname.replace(/^\//, "") || "Dashboard";
  const lancer = useMutation({
    mutationFn: () => req("POST", "/lancer", { page, url: pathname + search, vue, note: note.trim() || null, contexte: { largeur: window.innerWidth, hauteur: window.innerHeight, erreurs: erreursRecentes() } }),
    onSuccess: () => { toast.success(`Audit de ${page} lancé : le mail arrive dans une vingtaine de minutes.`); setOuvert(false); setNote(""); qc.invalidateQueries({ queryKey: ["testeur"] }); },
    onError: (e) => toast.error(e?.message || "Lancement impossible"),
  });
  const arreter = useMutation({ mutationFn: () => req("POST", `/rapports/${enCours.id}/arreter`, {}), onSuccess: () => toast.success("Arrêt demandé : l'agent finit son pas et rédige un rapport partiel.") });
  useEffect(() => {
    if (!ouvert) return undefined;
    const k = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [ouvert]);
  const titre = enCours ? `Audit en cours : ${enCours.page}` : "Tester cette page avec l'agent";
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} aria-label={titre} title={titre}
        className={compact ? "grid h-10 w-10 place-items-center rounded-full text-menthe hover:bg-menthe/10" : "relative grid h-11 w-11 place-items-center rounded-full border border-menthe/40 bg-rail text-menthe shadow-sm transition-colors hover:border-menthe/70 hover:bg-menthe/10"}
        style={{ background: compact ? "transparent" : undefined }}>
        {enCours ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.8} /> : <FlaskConical className="h-5 w-5" strokeWidth={1.8} />}
      </button>
      {ouvert && (
        <div role="dialog" aria-modal="true" aria-label={titre} className="fixed inset-0 z-[95] flex items-start justify-end p-3 md:left-[var(--k-barre-largeur,0px)]" onClick={(e) => { if (e.target === e.currentTarget) setOuvert(false); }}>
          <div className="k-grid mt-14 w-[420px] max-w-full rounded-bloc border border-bord-doux bg-surface-pleine p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Agent testeur</p>
                <h2 className="m-0 mt-1 text-[20px] font-normal leading-[1.2] text-encre">{enCours ? `Audit en cours : ${enCours.page}` : `Tester « ${page} »`}</h2>
              </div>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
            </div>
            {enCours ? (
              <div className="mt-4 flex flex-col gap-3">
                <p className="m-0 inline-flex items-start gap-2 text-[14px] text-craie"><Loader2 className="mt-0.5 h-4 w-4 flex-none animate-spin text-menthe" /><span>{enCours.avancement?.texte || "…"}</span></p>
                <p className="m-0 text-[12.5px] text-brume">Lancé par {enCours.lance_par} à {new Date(enCours.lance_le).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Le rapport arrive par mail et dans Suivi.</p>
                <div className="flex justify-end gap-2"><a href="/SuiviTesteur" className={`${secondaire} inline-flex items-center`}>Suivi</a><button type="button" onClick={() => arreter.mutate()} disabled={arreter.isPending} className={secondaire}>Arrêter</button></div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col gap-3">
                <p className="m-0 text-[14px] leading-[1.5] text-craie">L'agent ouvre cette page dans un bac à sable (copie de la base, mails et Sunday CRM coupés), avec la vue {vue === "admin" ? "équipe" : vue}. Il exerce chaque bouton, chaque champ et les tâches de la page, en ordinateur et au téléphone, sombre et clair ; un critique relit les captures ; vous recevez l'analyse par mail dans une vingtaine de minutes.</p>
                <label className="flex flex-col gap-1.5 text-[12.5px] text-ardoise">Une consigne, si vous voulez
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Concentre-toi sur le panneau de filtres. Teste comme un analyste qui découvre." className="rounded-champ border border-bord-vif bg-fond px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </label>
                <p className="m-0 text-[12px] text-brume">{etat.data ? `${etat.data.aujourdhui} audit(s) aujourd'hui sur ${etat.data.plafond}.` : ""}{etat.data?.dernier ? ` Dernier : ${etat.data.dernier.page}, ${new Date(etat.data.dernier.lance_le).toLocaleDateString("fr-FR")}.` : ""}</p>
                <div className="flex justify-end gap-2"><a href="/SuiviTesteur" className={`${secondaire} inline-flex items-center`}>Les rapports</a><button type="button" onClick={() => lancer.mutate()} disabled={lancer.isPending} className={principal}>{lancer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lancer l'audit"}</button></div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
