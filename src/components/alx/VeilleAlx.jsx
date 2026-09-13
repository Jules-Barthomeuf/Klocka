import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { avis } from "@/components/ui/avis";

// La veille d'ALX, depuis n'importe quelle page : tant qu'une ville tourne,
// un avis en bas à gauche dit ce qu'ALX est en train de faire (la rue, le
// commerce, les comptes) ; quand c'est fini, l'avis devient « Nice est
// prête », avec un bouton qui ramène au bon onglet. Sur la page de la ville
// elle-même, la phrase en cours est déjà à l'écran : l'avis se tait.

const POSITION = "bottom-left";
const ongletDe = (p) => (p.phase === "rues" ? "rues" : p.phase === "redaction" ? "messages" : "commerces");

function pendant(v) {
  const p = v.parcours || {};
  if (p.phase === "rues") return { titre: `${v.nom} · ALX relève les rues`, description: "Rues et vitrines sur OpenStreetMap, loyer chez Data-B. Une minute." };
  if (p.phase === "redaction") return { titre: `${v.nom} · ALX rédige`, description: `${p.brouillons || 0} message${(p.brouillons || 0) > 1 ? "s" : ""} écrit${(p.brouillons || 0) > 1 ? "s" : ""}.` };
  const faits = p.rues_faites || 0;
  const total = p.rues_total || 0;
  return {
    titre: p.rue_en_cours ? `${v.nom} · ALX lit ${p.rue_en_cours}` : `${v.nom} · ALX lit les commerces`,
    description: [p.commerce_en_cours ? `En ce moment : ${p.commerce_en_cours}.` : null, `${p.cibles_creees || 0} commerce${(p.cibles_creees || 0) > 1 ? "s" : ""}, ${p.proprietaires_trouves || 0} propriétaire${(p.proprietaires_trouves || 0) > 1 ? "s" : ""}${total ? ` · ${faits}/${total} rues` : ""}.`].filter(Boolean).join(" "),
    progression: total ? faits / total : null,
  };
}

function fini(v) {
  const p = v.parcours || {};
  const c = v.cibles || {};
  if (p.etat === "rues_proposees") return { titre: `${v.nom} est prête.`, description: `${(v.rues || []).length} rues classées, à cocher sur la carte.` };
  if (p.etat === "fini") return { titre: `${v.nom} : lecture terminée.`, description: `${c.appeler || 0} à appeler, ${c.ecrire || 0} à écrire, ${c.surveiller || 0} à surveiller${p.brouillons ? ` · ${p.brouillons} message${p.brouillons > 1 ? "s" : ""} à relire` : ""}.` };
  if (p.etat === "arrete") return { titre: `${v.nom} : arrêté.`, description: `${p.rues_faites || 0} rue${(p.rues_faites || 0) > 1 ? "s" : ""} lue${(p.rues_faites || 0) > 1 ? "s" : ""} avant l'arrêt.` };
  return null;
}

export default function VeilleAlx() {
  const user = useUser();
  const admin = !!user && user.role === "admin";
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const { data: villes = [] } = useQuery({
    queryKey: ["alx-villes"],
    queryFn: () => base44.request("GET", "/api/alx/villes"),
    enabled: admin,
    refetchInterval: (q) => ((q.state.data || []).some((v) => v.parcours?.etat === "en_cours") ? 5000 : 30000),
  });
  const etats = useRef(null); // { [villeId]: etat } au tour précédent

  useEffect(() => {
    if (!admin) return;
    const villeAffichee = /^\/alx$/i.test(pathname) ? new URLSearchParams(search).get("ville") : null;
    const precedent = etats.current;
    const courant = {};
    for (const v of villes) {
      const p = v.parcours || {};
      courant[v.id] = p.etat || null;
      const id = `alx-${v.id}`;
      if (p.etat === "en_cours") {
        if (v.id === villeAffichee) { avis.fermer(id); continue; }
        const m = pendant(v);
        avis.enCours(m.titre, { id, position: POSITION, description: m.description, progression: m.progression ?? undefined, action: { mot: "Voir", faire: () => navigate(`/ALX?ville=${v.id}&onglet=${ongletDe(p)}`) } });
      } else if (precedent && precedent[v.id] === "en_cours") {
        // Le passage de « en cours » à autre chose, vu par cette veille : c'est le moment de le dire.
        const m = fini(v) || { titre: `${v.nom} : ${p.etat === "erreur" ? "en erreur" : "interrompu"}.`, description: (p.journal || []).slice(-1)[0]?.texte || "" };
        const onglet = p.etat === "rues_proposees" ? "rues" : p.brouillons ? "messages" : "commerces";
        avis.fermer(id);
        (p.etat === "erreur" ? avis.erreur : avis.succes)(m.titre, { id: `${id}-fini`, position: POSITION, duration: 120000, description: m.description, action: { mot: "Voir", faire: () => navigate(`/ALX?ville=${v.id}&onglet=${onglet}`) } });
      }
    }
    etats.current = courant;
  }, [villes, admin, pathname, search, navigate]);

  return null;
}
