import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { poser } from "@/components/ui/avis";

// Les notifications de l'application (ce qui arrivait avant dans Google
// Chat) : relevées toutes les trente secondes, chacune montrée une fois en
// carte en haut à droite, avec son bouton. Onglet caché : la notification du
// système, si elle est autorisée.
// Moins de cartes (22 oct. 2026, Jules : « à chaque fois on est obligé de fermer, c'est trop énervant ; il faut
// vraiment que ça soit utile, sinon on ne les regarde plus ») : deux au plus, huit secondes, et seulement ce qui
// vient d'arriver (moins de deux heures). Le reste attend dans la cloche, sans carte « N autres ».

const FRAICHE_MS = 2 * 3600 * 1000;
const CARTES_MAX = 2;

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
    const fraiches = (data?.notifications || []).filter((n) => !n.vue && !montrees.current.has(n.id) && Date.now() - Date.parse(n.le) <= FRAICHE_MS);
    // Au-delà de deux : vues sans carte, elles restent dans la cloche.
    for (const n of fraiches.slice(CARTES_MAX)) { montrees.current.add(n.id); base44.request("POST", `/api/notifications/${n.id}/vue`).catch(() => {}); }
    for (const n of fraiches.slice(0, CARTES_MAX)) {
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
        duration: 8000,
        ...(n.lien ? { action: { mot: "Voir", faire: ouvrir } } : {}),
      });
    }
  }, [data, navigate]);

  return null;
}
