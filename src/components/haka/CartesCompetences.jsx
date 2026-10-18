import React, { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PastilleSource, RESSORT } from "@/components/haka/ReglagesDemande";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { sourceDe } from "@/lib/sources";

// Les cartes de compétences (17 oct. 2026, Jules) : ce que Haka sait faire,
// et où il ira chercher. Sous chaque carte, ses sources en pastilles : un clic
// en éteint une pour ce lancement (le choix ne se garde pas), une source
// obligatoire ne s'éteint pas. Lancer remplit le chat, en disant ce qui est
// éteint ; la personne envoie.


function Carte({ c, contexte, onLancer }) {
  const [eteintes, setEteintes] = useState(() => new Set());
  // Trois sources se voient, les obligatoires d'abord ; « +n » montre les autres.
  const [toutes, setToutes] = useState(false);
  const outils = [...(c.outils || [])].sort((a, b) => Number(!!b.obligatoire) - Number(!!a.obligatoire));
  const visibles = toutes ? outils : outils.slice(0, 3);
  // On n'éteint plus une source à la carte (Jules, 18 oct. 2026) : les pastilles montrent ce que la compétence lit, rien de plus.
  const basculer = () => {};
  const lancer = () => {
    const sans = (c.outils || []).filter((o) => eteintes.has(o.cle)).map((o) => sourceDe(o.cle).nom);
    const texte = `${c.nom}${contexte?.titre ? ` du dossier « ${contexte.titre} »` : ""}${sans.length ? ` (sans ${sans.join(", ")})` : ""}.`;
    onLancer(texte, { cle: c.cle, nom: c.nom, outils: c.outils || [] }, (c.outils || []).filter((o) => eteintes.has(o.cle)).map((o) => o.cle));
    setEteintes(new Set());
  };
  // La carte (17 oct. 2026, design de Jules) : la tâche en une phrase, puis ses sources en pastilles,
  // les mêmes que celles du « + » (Jules, même jour) : un clic en éteint une pour ce lancement.
  const phrase = (() => { const t = String(c.resume || c.nom || "").trim(); return /[.!?…]$/.test(t) ? t : `${t}.`; })();
  return (
    <motion.article layout transition={RESSORT} variants={APPARITION}
      className="flex flex-col gap-4 rounded-[18px] border border-trait bg-surface-pleine p-5 shadow-[0_8px_24px_rgb(0_0_0/0.05)] transition-[border-color,box-shadow] duration-300 hover:border-bord-doux hover:shadow-[0_12px_32px_rgb(0_0_0/0.09)]">
      <button type="button" onClick={lancer} title="Poser cette demande dans le chat" className="block w-full p-0 text-left" style={{ background: "transparent" }}>
        <p className="m-0 text-[17px] leading-[1.4] tracking-[-0.01em] text-encre">{phrase}</p>
      </button>
      <motion.div layout transition={RESSORT} className="flex flex-wrap gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visibles.map((o) => {
            const s = sourceDe(o.cle);
            const eteinte = eteintes.has(o.cle);
            return (
              <motion.div key={o.cle} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={RESSORT}>
                <PastilleSource cle={o.cle} eteinte={eteinte} fixe onClick={() => basculer(o)} />
              </motion.div>
            );
          })}
          {outils.length > 3 && (
            <motion.div key="plus" layout transition={RESSORT}>
              <button type="button" onClick={() => setToutes((t) => !t)} aria-expanded={toutes} title={toutes ? "Moins de sources" : "Toutes les sources"}
                className="inline-flex h-9 items-center rounded-full border border-trait px-3 text-[13px] text-ardoise transition-colors duration-300 hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                {toutes ? "Moins" : `+${outils.length - 3}`}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.article>
  );
}

const APPARITION = { cache: { opacity: 0, y: 14 }, vu: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } } };

const D_ABORD = ["pre-analyse-fiche", "data-room", "loi", "presentation-bancaire"];
const rang = (cle) => { const i = D_ABORD.indexOf(cle); return i < 0 ? D_ABORD.length : i; };

/**
 * `limite` (Accueil, 17 oct. 2026) : les plus demandées d'abord (l'ordre des raccourcis), pas plus de `limite`.
 * @param {{declencheur: 'chat'|'dossier', contexte?: {deal_id?: string, titre?: string}, limite?: number, className?: string}} props
 */

export default function CartesCompetences({ declencheur = "chat", contexte = null, limite = 0, className = "" }) {
  const q = useQuery({ queryKey: ["haka-competences", declencheur], queryFn: () => base44.request("GET", `/api/haka/competences?declencheur=${declencheur}`), staleTime: 5 * 60_000, retry: false });
  const toutes = q.data?.competences || [];
  const liste = limite ? [...toutes].sort((a, b) => rang(a.cle) - rang(b.cle)).slice(0, limite) : toutes;
  // Les recettes se lisent même Haka éteint (17 oct. 2026, Jules : « je ne peux pas les voir ») : la carte pose une demande dans le chat, rien de plus.
  if (!liste.length) return null;
  // Lancer : le chat de la page reçoit le texte et prend la main ; rien ne part avant l'envoi.
  const lancer = (texte, competence, eteintes) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte, contexte, sortie: "produire", competence, eteintes } }));
  return (
    <section aria-label="Ce que Haka sait faire" className={className}>
      <p className="m-0 mb-3 text-[11px] uppercase tracking-[.16em] text-brume">Ce que Haka sait faire</p>
      <motion.div initial="cache" animate="vu" variants={{ vu: { transition: { staggerChildren: 0.06 } } }}
        className={`grid items-start gap-3 ${declencheur === "dossier" ? "grid-cols-1" : limite === 4 ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"}`}>
        {liste.map((c) => <Carte key={c.cle} c={c} contexte={contexte} onLancer={lancer} />)}
      </motion.div>
    </section>
  );
}
