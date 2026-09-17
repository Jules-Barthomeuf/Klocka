/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";

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
  if (p.etat === "rues_proposees") return { titre: `${v.nom} est prête.`, detail: `${n(v.rues_nb ?? (v.rues || []).length, "rue classée", "rues classées")}, à cocher sur la carte.`, onglet: "rues" };
  if (p.etat === "fini") return { titre: `${v.nom} : lecture terminée.`, detail: `${c.appeler || 0} à appeler, ${c.ecrire || 0} à écrire, ${c.surveiller || 0} à surveiller${p.brouillons ? ` · ${n(p.brouillons, "message à relire", "messages à relire")}` : ""}.`, onglet: p.brouillons ? "messages" : "commerces" };
  if (p.etat === "arrete") return { titre: `${v.nom} : arrêté.`, detail: `${n(p.rues_faites, "rue lue", "rues lues")} avant l'arrêt.`, onglet: "commerces" };
  if (p.etat === "erreur") return { titre: `${v.nom} : en erreur.`, detail: (p.journal || []).slice(-1)[0]?.texte || "", onglet: "commerces", erreur: true };
  return null;
}

// Le mouvement de la carte : long et amorti, comme un tiroir qui se referme.
// Un ressort rapide donnerait l'impression que la carte claque.
const DUREE = "760ms";
const COURBE = "cubic-bezier(0.22, 1, 0.36, 1)";
const glisse = (props) => props.map((p) => `${p} ${DUREE} ${COURBE}`).join(", ");

/**
 * Une carte de veille : dépliée, ou repliée en pastille.
 *
 * Une seule boîte pour les deux états. La pastille vit à gauche, là où la
 * carte est ancrée : replier, c'est donc rentrer vers la gauche, et la
 * flèche regarde par là. Le corps se ferme en largeur (des pixels, pas un
 * `auto` que le navigateur ne sait pas animer), le nom de la ville glisse à
 * côté de la flèche, les coins s'arrondissent. La boîte, en largeur
 * naturelle, suit sans saut.
 */
const CORPS = 262;

function CarteVeille({ v, etat, onVoir, onFermer }) {
  const [repliee, setRepliee] = useState(false);
  const enCours = etat === "en_cours";
  const m = enCours ? pendant(v) : fini(v);
  if (!m) return null;
  const teinte = enCours ? J["ardoise"] : m.erreur ? J["emplacement-2"] : J["menthe"];
  const basculer = () => setRepliee((r) => !r);
  return (
    <div
      className="alx-entree flex w-max max-w-[calc(100vw-48px)] items-center overflow-hidden border shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
      style={{
        background: "#101211",
        columnGap: repliee ? 10 : 14,
        padding: repliee ? "8px 10px 8px 14px" : "15px 16px 15px 20px",
        borderRadius: repliee ? 999 : 15,
        borderColor: repliee ? `${teinte}55` : J["trait"],
        transition: glisse(["column-gap", "padding", "border-radius", "border-color"]),
      }}
    >
      {enCours ? (
        <span className="alx-pouls shrink-0 rounded-full" style={{ background: J["ardoise"], width: repliee ? 8 : 9, height: repliee ? 8 : 9, transition: glisse(["width", "height"]) }} />
      ) : (
        <span className="grid shrink-0 place-items-center rounded-full font-bold text-sur-menthe" style={{ background: teinte, width: repliee ? 14 : 22, height: repliee ? 14 : 22, fontSize: repliee ? 9 : 12.5, transition: glisse(["width", "height", "font-size"]) }}>{m.erreur ? "!" : "✓"}</span>
      )}

      {/* Le corps : titre, détail, Voir. Il se ferme en largeur et s'efface ;
          son contenu garde sa largeur pour ne pas se remettre en page pendant
          le mouvement. */}
      <div className="grid shrink-0 overflow-hidden" style={{ width: repliee ? 0 : CORPS, gridTemplateRows: repliee ? "0fr" : "1fr", opacity: repliee ? 0 : 1, transition: glisse(["width", "grid-template-rows", "opacity"]) }} aria-hidden={repliee}>
        <div className="min-h-0 overflow-hidden">
          <div className="flex items-center gap-3.5" style={{ width: CORPS }}>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] text-encre">{m.titre}</div>
              <div className="mt-1 text-[12.5px] leading-[1.45] text-ardoise">{m.detail}</div>
            </div>
            <button tabIndex={repliee ? -1 : 0} onClick={() => onVoir(m.onglet || ongletDe(v.parcours || {}))} className="alx-mont shrink-0 rounded-full border px-3.5 py-2 text-[11px] uppercase tracking-[.12em] transition-colors hover:bg-menthe/10" style={{ borderColor: "rgba(150,192,184,0.45)", color: J["menthe"], background: "transparent" }}>
              Voir
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* Le nom de la ville, seulement sur la pastille : il glisse depuis la flèche. */}
        <span className="overflow-hidden whitespace-nowrap text-[12.5px]" style={{ color: teinte, maxWidth: repliee ? 160 : 0, opacity: repliee ? 1 : 0, transition: glisse(["max-width", "opacity"]) }} aria-hidden={!repliee}>
          {v.nom}
        </span>
        <button
          onClick={basculer}
          aria-label={repliee ? "Déplier" : "Replier"} title={repliee ? m.titre : "Replier"}
          aria-expanded={!repliee}
          className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre"
          style={{ background: "transparent" }}
        >
          <ChevronLeft className="h-3.5 w-3.5" style={{ transform: repliee ? "rotate(180deg)" : "none", transition: glisse(["transform"]) }} />
        </button>
        {!enCours && (
          <button
            onClick={onFermer} aria-label="Fermer" title="Fermer" tabIndex={repliee ? -1 : 0}
            className="grid h-6 place-items-center overflow-hidden rounded-full text-[13.5px] leading-none text-ardoise hover:text-encre"
            style={{ background: "transparent", width: repliee ? 0 : 24, opacity: repliee ? 0 : 1, transition: glisse(["width", "opacity"]) }}
            aria-hidden={repliee}
          >
            ×
          </button>
        )}
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
    // La liste allégée : l'avancement et les trois comptes. La liste entière
    // pèse près de trois mégaoctets, et la veille interroge depuis toutes les
    // pages, toutes les trente secondes.
    queryFn: () => base44.request("GET", "/api/alx/villes?leger=1"),
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
