import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { poser } from "@/components/ui/avis";

// Les notifications de l'application (ce qui arrivait avant dans Google
// Chat) : relevées toutes les trente secondes, chacune montrée une fois en
// carte en haut à droite, avec son bouton. Onglet caché : la notification du
// système, si elle est autorisée. Une notification de plus d'un jour ne se
// montre plus en carte : elle n'apprendrait plus rien.

const UN_JOUR = 24 * 3600 * 1000;

export default function NotificationsApp() {
  const navigate = useNavigate();
  const montrees = useRef(new Set());
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => base44.request("GET", "/api/notifications"),
    refetchInterval: 30 * 1000,
    staleTime: 15 * 1000,
  });

  useEffect(() => {
    const fraiches = (data?.notifications || []).filter((n) => !n.vue && !montrees.current.has(n.id) && Date.now() - Date.parse(n.le) <= UN_JOUR);
    // Trois cartes au plus : au-delà, une seule carte dit le reste.
    const trop = fraiches.length > 3 ? fraiches.slice(3) : [];
    if (trop.length) {
      for (const n of trop) { montrees.current.add(n.id); base44.request("POST", `/api/notifications/${n.id}/vue`).catch(() => {}); }
      poser("information", `${trop.length} autres notifications`, { description: "Le reste vous attend dans l'application.", duration: 12000 });
    }
    for (const n of fraiches.slice(0, 3)) {
      montrees.current.add(n.id);
      base44.request("POST", `/api/notifications/${n.id}/vue`).catch(() => {});
      const ouvrir = () => {
        base44.request("POST", `/api/notifications/${n.id}/lue`).catch(() => {});
        if (n.lien) navigate(n.lien);
      };
      const cachee = typeof document !== "undefined" && document.visibilityState === "hidden";
      if (cachee && "Notification" in window && Notification.permission === "granted") {
        try {
          const sys = new Notification(n.titre, { body: n.texte || "", icon: "/icones/apple-touch-icon.png", tag: n.id });
          sys.onclick = () => { window.focus(); ouvrir(); sys.close(); };
        } catch { /* le navigateur refuse : la carte suffira au retour */ }
      }
      poser(n.genre === "erreur" ? "erreur" : "information", n.titre, {
        description: n.texte,
        duration: 20000,
        ...(n.lien ? { action: { mot: "Voir", faire: ouvrir } } : {}),
      });
    }
  }, [data, navigate]);

  return null;
}
