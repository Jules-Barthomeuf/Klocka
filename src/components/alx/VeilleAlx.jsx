import { useEffect, useRef, useState } from "react";

const AUCUNE = [];
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { J } from "@/design/jetons";

// La veille d'ALX, depuis n'importe quelle page : en bas à gauche, une carte
// par ville qui tourne dit ce qu'ALX fait (la rue, le commerce, les comptes),
// puis « Nice est prête » avec un bouton qui ramène au bon onglet. Une petite
// flèche la replie en une pastille : grise tant que ça travaille, verte quand
// c'est fini. Sur la page de la ville elle-même, la carte se tait.

const ongletDe = (p) => (p.phase === "rues" ? "rues" : p.phase === "redaction" ? "messages" : "commerces");
const n = (x, un, des) => `${x || 0} ${(x || 0) > 1 ? des : un}`;

function pendant(v) {
  const p = v.parcours || {};
  if (p.phase === "rues") return { titre: `${v.nom} · ALX relève les rues`, detail: "Rues et vitrines sur OpenStreetMap, loyer chez Data-B. Une minute." };
  if (p.phase === "redaction") return { titre: `${v.nom} · ALX rédige`, detail: `${n(p.brouillons, "message écrit", "messages écrits")}.` };
  return {
    titre: p.rue_en_cours ? `${v.nom} · ALX lit ${p.rue_en_cours}` : `${v.nom} · ALX lit les commerces`,
    detail: [p.commerce_en_cours ? `En ce moment : ${p.commerce_en_cours}.` : null, `${n(p.cibles_creees, "commerce", "commerces")}, ${n(p.proprietaires_trouves, "propriétaire", "propriétaires")}${p.rues_total ? ` · ${p.rues_faites || 0}/${p.rues_total} rues` : ""}.`].filter(Boolean).join(" "),
  };
}

function fini(v) {
  const p = v.parcours || {};
  const c = v.cibles || {};
  if (p.etat === "rues_proposees") return { titre: `${v.nom} est prête.`, detail: `${n((v.rues || []).length, "rue classée", "rues classées")}, à cocher sur la carte.`, onglet: "rues" };
  if (p.etat === "fini") return { titre: `${v.nom} : lecture terminée.`, detail: `${c.appeler || 0} à appeler, ${c.ecrire || 0} à écrire, ${c.surveiller || 0} à surveiller${p.brouillons ? ` · ${n(p.brouillons, "message à relire", "messages à relire")}` : ""}.`, onglet: p.brouillons ? "messages" : "commerces" };
  if (p.etat === "arrete") return { titre: `${v.nom} : arrêté.`, detail: `${n(p.rues_faites, "rue lue", "rues lues")} avant l'arrêt.`, onglet: "commerces" };
  if (p.etat === "erreur") return { titre: `${v.nom} : en erreur.`, detail: (p.journal || []).slice(-1)[0]?.texte || "", onglet: "commerces", erreur: true };
  return null;
}

/** Une carte de veille : dépliée, ou repliée en pastille. */
function CarteVeille({ v, etat, onVoir, onFermer }) {
  const [repliee, setRepliee] = useState(false);
  const enCours = etat === "en_cours";
  const m = enCours ? pendant(v) : fini(v);
  if (!m) return null;
  const teinte = enCours ? J["ardoise"] : m.erreur ? J["emplacement-2"] : J["menthe"];
  if (repliee) {
    return (
      <button
        onClick={() => setRepliee(false)}
        title={m.titre}
        className="flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-[12.5px] transition-colors"
        style={{ background: "#101211", borderColor: `${teinte}55`, color: teinte }}
      >
        <span className={`h-2 w-2 rounded-full ${enCours ? "alx-pouls" : ""}`} style={{ background: teinte }} />
        {v.nom}
        <span className="text-[11px] opacity-70">▲</span>
      </button>
    );
  }
  return (
    <div className="alx-entree flex w-[380px] max-w-[calc(100vw-48px)] items-center gap-3.5 rounded-[15px] border border-trait px-5 py-[15px] shadow-[0_18px_40px_rgba(0,0,0,0.55)]" style={{ background: "#101211" }}>
      {enCours ? (
        <span className="alx-pouls h-[9px] w-[9px] shrink-0 rounded-full" style={{ background: J["ardoise"] }} />
      ) : (
        <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[12.5px] font-bold text-sur-menthe" style={{ background: teinte }}>{m.erreur ? "!" : "✓"}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[15px] text-encre">{m.titre}</div>
        <div className="mt-1 text-[12.5px] leading-[1.45] text-ardoise">{m.detail}</div>
      </div>
      <button onClick={() => onVoir(m.onglet || ongletDe(v.parcours || {}))} className="alx-mont shrink-0 rounded-full border px-3.5 py-2 text-[11px] uppercase tracking-[.12em] transition-colors hover:bg-menthe/10" style={{ borderColor: "rgba(150,192,184,0.45)", color: J["menthe"], background: "transparent" }}>
        Voir
      </button>
      <div className="flex shrink-0 flex-col gap-1">
        <button onClick={() => setRepliee(true)} title="Replier" className="px-1 text-[11px] leading-none text-ardoise hover:text-encre" style={{ background: "transparent" }}>▼</button>
        {!enCours && <button onClick={onFermer} title="Fermer" className="px-1 text-[13.5px] leading-none text-ardoise hover:text-encre" style={{ background: "transparent" }}>×</button>}
      </div>
    </div>
  );
}

export default function VeilleAlx() {
  const user = useUser();
  const admin = !!user && user.role === "admin";
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // Un tableau vide stable : un `= []` par défaut serait un tableau neuf à
  // chaque rendu, et l'effet qui dépend des villes tournerait sans fin.
  const { data: villesLues } = useQuery({
    queryKey: ["alx-villes"],
    queryFn: () => base44.request("GET", "/api/alx/villes"),
    enabled: admin,
    refetchInterval: (q) => ((q.state.data || []).some((v) => v.parcours?.etat === "en_cours") ? 5000 : 30000),
  });
  // Les villes qu'on suit : en cours, ou finies sous nos yeux et pas encore fermées.
  const villes = villesLues || AUCUNE;
  const [suivies, setSuivies] = useState({}); // { [villeId]: "en_cours" | "finie" }
  const etats = useRef(null);

  useEffect(() => {
    if (!admin) return;
    const precedent = etats.current;
    const courant = {};
    setSuivies((s) => {
      const n2 = { ...s };
      for (const v of villes) {
        const etat = v.parcours?.etat || null;
        courant[v.id] = etat;
        if (etat === "en_cours") n2[v.id] = "en_cours";
        else if (precedent && precedent[v.id] === "en_cours") n2[v.id] = "finie";
        else if (n2[v.id] === "en_cours") delete n2[v.id];
      }
      // Rien n'a changé : on rend le même objet, React ne redessine pas.
      const memes = Object.keys(n2).length === Object.keys(s).length && Object.keys(n2).every((k) => n2[k] === s[k]);
      return memes ? s : n2;
    });
    etats.current = courant;
  }, [villes, admin]);

  if (!admin) return null;
  const villeAffichee = /^\/alx$/i.test(pathname) ? new URLSearchParams(search).get("ville") : null;
  const cartes = villes.filter((v) => suivies[v.id] && v.id !== villeAffichee);
  if (!cartes.length) return null;

  return (
    <div className="fixed bottom-7 left-[34px] z-40 flex flex-col items-start gap-2.5 max-md:left-4">
      {cartes.map((v) => (
        <CarteVeille
          key={v.id}
          v={v}
          etat={suivies[v.id] === "en_cours" ? "en_cours" : v.parcours?.etat}
          onVoir={(onglet) => navigate(`/ALX?ville=${v.id}&onglet=${onglet}`)}
          onFermer={() => setSuivies((s) => { const n2 = { ...s }; delete n2[v.id]; return n2; })}
        />
      ))}
    </div>
  );
}
