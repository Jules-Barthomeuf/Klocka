import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { avis } from "@/components/ui/avis";
import { compteRenduPlusTard, ouvrirCompteRendu } from "@/lib/compte-rendu-transfert";

// La notification du compte rendu d'un transfert à sourcing@ (23 nov. 2026, Jules : « une notification normale, pas un
// truc en bas à droite ; on clique dessus, on arrive sur la conversation ; si on va sur l'assistant, on voit la page
// normale ; quand on la ferme, c'est mis dans À faire, on clique dessus et ça ouvre la bonne conversation »). La même
// que « analyse terminée » (src/lib/notifications.js) : l'avis de l'application en haut au centre, ou la notification
// du système quand l'onglet est caché et qu'elle est autorisée. « Voir » ouvre la conversation ; fermée sans l'ouvrir
// (la croix, ou laissée filer), elle va dans « À faire ». Une fois par compte rendu. Les autres notifications gardées
// (server/notifications.js) passent par la même voie le même jour.

const DUREE = 15000;

export default function PopupTransfert() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dits = useRef(new Set());
  const { data } = useQuery({ queryKey: ["comptes-rendus-transfert"], queryFn: () => base44.request("GET", "/api/assistant/comptes-rendus"), refetchInterval: 60_000, retry: false, staleTime: 30_000 });
  // Les autres notifications gardées (server/notifications.js, GARDEES) : la même notification, « Voir » ouvre leur page.
  const { data: utiles } = useQuery({ queryKey: ["notifications-a-montrer"], queryFn: () => base44.request("GET", "/api/notifications/a-montrer"), refetchInterval: 60_000, retry: false, staleTime: 30_000 });
  useEffect(() => {
    for (const n of utiles?.notifications || []) {
      if (dits.current.has(`n:${n.id}`)) continue;
      dits.current.add(`n:${n.id}`);
      let ouvert = false;
      const rafraichir = () => qc.invalidateQueries({ queryKey: ["fiche-dossier-mes-actions"] });
      const ouvrir = () => {
        ouvert = true;
        base44.request("POST", `/api/notifications/${encodeURIComponent(n.id)}/lue`).catch(() => {}).then(rafraichir);
        if (n.lien) { if (/^https?:/.test(n.lien)) window.location.assign(n.lien); else navigate(n.lien); }
      };
      const plusTard = () => { if (!ouvert) base44.request("POST", `/api/notifications/${encodeURIComponent(n.id)}/plus-tard`).catch(() => {}).then(rafraichir); };
      avis.information(n.titre, { description: n.texte || undefined, duration: DUREE, ...(n.lien ? { action: { label: n.action && n.action !== "Ouvrir" ? n.action : "Voir", onClick: ouvrir } } : {}), surFermeture: plusTard, surFin: plusTard });
    }
  }, [utiles, navigate, qc]);

  useEffect(() => {
    for (const c of data?.comptes_rendus || []) {
      // Par compte rendu et par moment : la suite d'un transfert (le portefeuille pré-analysé) se dit aussi.
      const cle = `${c.id}:${c.le}`;
      if (!c.conversation_id || dits.current.has(cle)) continue;
      dits.current.add(cle);
      let ouvert = false;
      const rafraichir = () => { qc.invalidateQueries({ queryKey: ["fiche-dossier-mes-actions"] }); qc.invalidateQueries({ queryKey: ["assistant-conversations"] }); };
      const ouvrir = () => { ouvert = true; ouvrirCompteRendu(c.id, navigate, c.conversation_id).then(rafraichir); };
      const plusTard = () => { if (!ouvert) compteRenduPlusTard(c.id).then(rafraichir); };
      const titre = `Votre transfert « ${c.objet} »`;
      const cachee = typeof document !== "undefined" && document.visibilityState === "hidden";
      if (cachee && "Notification" in window && Notification.permission === "granted") {
        try {
          const n = new Notification(titre, { body: c.resume || "Compte rendu prêt", icon: "/icones/apple-touch-icon.png", tag: `transfert-${c.id}` });
          n.onclick = () => { window.focus(); ouvrir(); n.close(); };
          n.onclose = plusTard;
          continue;
        } catch { /* le navigateur a refusé : l'avis de l'application */ }
      }
      avis.information(titre, { description: c.resume || undefined, duration: DUREE, action: { label: "Voir", onClick: ouvrir }, surFermeture: plusTard, surFin: plusTard });
    }
  }, [data, navigate, qc]);

  return null;
}
