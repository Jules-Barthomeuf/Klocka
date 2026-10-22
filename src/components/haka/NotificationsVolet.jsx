import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { ilYa } from "@/components/dashboard/ChatDashboard";

// Mes notifications, dans le volet de la cloche (19 oct. 2026, Jules : « on doit voir ses notifications
// individuelles, et pouvoir les supprimer facilement »). Chacune se lit en un clic (elle mène à sa page) et
// part d'un clic sur la croix ; « Tout effacer » vide la liste. Une notification d'équipe ne part que de la
// liste de la personne qui l'efface. Mêmes lignes que le reste du volet.

export default function NotificationsVolet({ onOuvrir }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => base44.request("GET", "/api/notifications"), refetchInterval: 30_000, staleTime: 15_000 });
  // Une question de Haka est déjà dans « Ce qui t'attend » : elle ne se répète pas ici.
  const liste = (data?.notifications || []).filter((n) => n.genre !== "question_haka");
  const retirer = (ids) => qc.setQueryData(["notifications"], (d) => (d ? { ...d, notifications: d.notifications.filter((n) => !ids.includes(n.id)) } : d));
  const supprimer = (n) => { retirer([n.id]); base44.request("DELETE", `/api/notifications/${n.id}`).catch(() => qc.invalidateQueries({ queryKey: ["notifications"] })); };
  const toutEffacer = () => { retirer(liste.map((n) => n.id)); base44.request("POST", "/api/notifications/effacer").catch(() => qc.invalidateQueries({ queryKey: ["notifications"] })); };
  const ouvrir = (n) => {
    base44.request("POST", `/api/notifications/${n.id}/lue`).catch(() => {});
    if (n.lien) onOuvrir?.(n.lien);
  };
  if (!liste.length) return null;
  return (
    <div className="border-t border-trait px-2 pb-1.5 pt-2">
      <div className="flex items-center justify-between px-3 py-1.5">
        <p className="m-0 text-[12.5px] text-ardoise">Notifications</p>
        <button type="button" onClick={toutEffacer} className="text-[12.5px] text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>Tout effacer</button>
      </div>
      {liste.map((n) => (
        <div key={n.id} className="group flex items-start gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-encre/[0.04]">
          <span className={`mt-[7px] h-[7px] w-[7px] flex-none rounded-full ${n.lue ? "bg-brume" : "bg-ambre"}`} aria-label={n.lue ? "Lue" : "Non lue"} />
          <button type="button" onClick={() => ouvrir(n)} disabled={!n.lien} className="min-w-0 flex-1 text-left disabled:cursor-default" style={{ background: "transparent" }}>
            <p className={`m-0 text-[14px] leading-[1.4] ${n.lue ? "text-ardoise" : "text-encre"}`}>{n.titre}</p>
            {n.texte && <p className="m-0 mt-0.5 line-clamp-2 text-[12.5px] text-ardoise">{n.texte}</p>}
            <p className="m-0 mt-0.5 text-[12.5px] text-brume">{ilYa(n.le)}</p>
          </button>
          <button type="button" onClick={() => supprimer(n)} aria-label="Supprimer la notification" title="Supprimer"
            className="grid h-7 w-7 flex-none place-items-center rounded-full text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
