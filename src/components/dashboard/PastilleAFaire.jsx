import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { CadreEpingle } from "@/components/dashboard/CadreEpingle";
import { toast } from "@/components/ui/avis";
import { base44 } from "@/api/base44Client";
import { ICONE_ACTION } from "@/components/fiche-dossier/ActionApercu";
import { useNavigate } from "react-router-dom";
import { ouvrirCompteRendu } from "@/lib/compte-rendu-transfert";

// « À faire », en haut à droite de l'accueil (20 nov. 2026, Jules). Depuis le 28 nov. 2026, un panneau épinglé à droite
// du chat (voir CadreEpingle.jsx), au dessin de la capture de Jules (cases carrées, parties, la date à droite), avec
// « N tâches faites aujourd'hui » en bas. Un clic sur une action l'envoie au chat, qui rouvre sa
// conversation et pose l'action à droite ; le tic la ferme et l'écrit, datée, sur ses fiches.

const useMesActions = () => useQuery({ queryKey: ["fiche-dossier-mes-actions"], queryFn: () => base44.request("GET", "/api/fiche-dossier/mes-actions"), staleTime: 20_000, refetchInterval: 120_000, retry: false });

const isoJour = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const majuscule = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
/** La date à droite (capture de Jules du 28 nov.) : Aujourd'hui, Demain, « Ven. » dans la semaine, « Lun. 7 » plus loin. */
function quand(iso) {
  if (!iso) return "";
  const auj = isoJour();
  if (iso === auj) return "Aujourd'hui";
  if (iso === isoJour(new Date(Date.now() + 864e5))) return "Demain";
  const d = new Date(`${iso}T12:00:00`);
  const ecart = Math.round((d - new Date(`${auj}T12:00:00`)) / 864e5);
  const jourSem = majuscule(d.toLocaleDateString("fr-FR", { weekday: "short" }));
  if (ecart < 0) return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return ecart < 7 ? jourSem : `${jourSem} ${d.getDate()}`;
}

/** Le panneau « À faire », épinglé à droite du chat (voir CadreEpingle.jsx). */
export default function ListeAFaire() {
  const { data, refetch } = useMesActions();
  const actions = data?.actions || [];
  const faites = data?.faites || [];
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rafraichirFiches = () => { for (const k of [["fiche-dossier"], ["fiche-dossier-jour"]]) queryClient.invalidateQueries({ queryKey: k }); };
  // Cocher (25 nov. 2026, Jules : « on coche, ça enlève l'action, et ça met dans l'historique relancé le x novembre ») ;
  // depuis le 28 nov., la tâche cochée reste barrée jusqu'au soir, et un second clic la rouvre.
  const basculer = async (a, faite) => {
    queryClient.setQueryData(["fiche-dossier-mes-actions"], (d) => {
      if (!d) return d;
      const sans = (l) => (l || []).filter((x) => x.id !== a.id);
      return faite ? { ...d, actions: sans(d.actions), faites: [...sans(d.faites), { ...a, statut: "faite" }] } : { ...d, actions: [...sans(d.actions), { ...a, statut: "ouverte" }], faites: sans(d.faites) };
    });
    try {
      await base44.request("PATCH", `/api/fiche-dossier/actions/${a.id}`, { body: { statut: faite ? "faite" : "ouverte" } });
    } catch (e) {
      toast.error(e?.message || "L'action n'a pas changé.");
    }
    refetch();
    rafraichirFiches();
  };
  const reprendre = (a) => {
    if (a.genre === "transfert") { ouvrirCompteRendu(a.cr, navigate, a.conversation_id).then(() => refetch()); return; }
    if (a.genre === "notification") {
      base44.request("POST", `/api/notifications/${encodeURIComponent(a.notification)}/lue`).catch(() => {}).then(() => refetch());
      if (a.lien) { if (/^https?:/.test(a.lien)) window.location.assign(a.lien); else navigate(a.lien); }
      return;
    }
    window.dispatchEvent(new CustomEvent("klocka:reprendre-action", { detail: { action: a } }));
  };

  // Les parties, dans l'ordre du travail : à lire (comptes rendus, notifications), en retard, aujourd'hui (les faites du
  // jour y restent barrées), à venir, sans date.
  const auj = isoJour();
  const aLire = actions.filter((a) => a.genre === "transfert" || a.genre === "notification");
  const taches = actions.filter((a) => !aLire.includes(a));
  const parties = [
    ["À lire", aLire],
    ["En retard", taches.filter((a) => a.echeance && a.echeance < auj)],
    ["Aujourd'hui", [...taches.filter((a) => a.echeance === auj), ...faites]],
    ["À venir", taches.filter((a) => a.echeance && a.echeance > auj)],
    ["Sans date", taches.filter((a) => !a.echeance)],
  ].filter(([, l]) => l.length);
  const n = faites.length;

  return (
    <CadreEpingle titre="À faire"
      pied={<p className="m-0 border-t border-trait px-6 py-4 text-[13.5px] text-ardoise">{n ? `${n} tâche${n > 1 ? "s" : ""} faite${n > 1 ? "s" : ""} aujourd'hui` : "Aucune tâche faite aujourd'hui"}</p>}>
      {!parties.length ? <p className="m-0 px-6 py-3 text-[14px] leading-[1.5] text-ardoise">Rien à faire : les actions de tes notes viendront ici.</p> : (
        <div className="px-6 pb-4">
          {parties.map(([titre, liste]) => (
            <section key={titre} className="pt-3">
              <h3 className="m-0 pb-1 pt-2 text-[12px] font-medium uppercase tracking-[0.08em] text-brume">{titre}</h3>
              <ul className="m-0 list-none p-0">
                {liste.map((a) => {
                  const fait = a.statut === "faite";
                  const lire = titre === "À lire";
                  const I = ICONE_ACTION[a.genre] || ICONE_ACTION.tache;
                  const date = lire ? "" : quand(a.echeance);
                  const fiches = (a.fiches || []).map((f) => f.nom).filter(Boolean).join(", ");
                  return (
                    <li key={a.id} className="flex items-start gap-3 py-[7px]">
                      {lire ? <I className="mt-px h-[22px] w-[22px] flex-none p-0.5 text-ardoise" strokeWidth={1.7} /> : (
                        <button type="button" role="checkbox" aria-checked={fait} onClick={() => basculer(a, !fait)} aria-label={fait ? `Rouvrir : ${a.titre}` : `Fait : ${a.titre}`}
                          className={`mt-px grid h-[22px] w-[22px] flex-none place-items-center rounded-[6px] border-[1.5px] transition-colors ${fait ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent hover:border-menthe"}`} style={fait ? undefined : { background: "transparent" }}>
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </button>
                      )}
                      <button type="button" onClick={() => reprendre(a)} title={[a.resume, fiches].filter(Boolean).join(" · ") || undefined}
                        className={`min-w-0 flex-1 break-words pt-px text-left text-[15px] leading-[1.4] ${fait ? "text-ardoise line-through decoration-ardoise" : "text-encre hover:text-menthe"}`} style={{ background: "transparent" }}>
                        {a.titre}
                      </button>
                      {date && <span className={`flex-none pt-[2px] text-[13.5px] tabular-nums ${!fait && a.echeance < auj ? "text-ambre" : "text-ardoise"}`}>{date}</span>}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </CadreEpingle>
  );
}
