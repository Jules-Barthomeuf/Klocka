import React, { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";
import RendezVousFondateur, { useVisiteSimulateur } from "@/components/simulator/RendezVousFondateur";
import { COMMERCES, HYPOTHESES, planRetraite } from "@/lib/outils-investisseur";

// « Vision : bâtissez votre retraite » (9 oct. 2026) : la page publique d'un
// asset des newsletters. Combien voulez-vous toucher par mois ? Quel commerce ?
// La page dit combien de murs acheter et en combien de temps, hypothèses
// affichées. Avec le jeton du lien (k), l'objectif de revenu et l'horizon se
// rangent dans la fiche du contact ; sans jeton, rien n'est noté.

const CARTE = "rounded-[18px] border border-trait bg-surface";
const HORIZONS = [10, 15, 20, 25, 30];
const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const ans = (n) => `${n} an${n > 1 ? "s" : ""}`;
const pastille = (actif) => `inline-flex h-9 items-center rounded-full px-4 text-[13.5px] transition-colors ${actif ? "bg-menthe text-sur-menthe" : "border border-trait text-craie hover:border-menthe hover:text-encre"}`;

function Champ({ label, aide, children }) {
  return (
    <div className="mb-5">
      <span className="mb-1.5 block text-[11px] uppercase tracking-[.14em] text-brume">{label}</span>
      {children}
      {aide && <p className="m-0 mt-1.5 text-[12.5px] text-brume">{aide}</p>}
    </div>
  );
}

function Nombre({ valeur, onChange, unite, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input inputMode="numeric" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""))}
        className="h-11 w-full bg-transparent text-[15px] tabular-nums text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
      <span className="flex-none text-[13.5px] text-ardoise">{unite}</span>
    </div>
  );
}

export default function VisionRetraite() {
  const [f, setF] = useState({ revenu: "1500", commerce: "proximite", epargne: "800", apport: "40000", horizon: 25 });
  const [construit, setConstruit] = useState(false);
  const poser = (cle, v) => setF((x) => ({ ...x, [cle]: v }));
  const plan = useMemo(() => planRetraite({
    revenuMensuel: Number(f.revenu), commerce: f.commerce, epargneMensuelle: Number(f.epargne), apportInitial: Number(f.apport), horizon: f.horizon,
  }), [f]);
  const valeurs = construit ? {
    revenu_mensuel: Number(f.revenu), horizon: f.horizon, commerce: f.commerce, epargne_mensuelle: Number(f.epargne),
    apport_initial: Number(f.apport), murs: plan.murs, ...(plan.anneeLibre != null ? { annee_libre: plan.anneeLibre } : {}),
  } : null;
  const { visite, qui } = useVisiteSimulateur(valeurs, "vision");
  const an0 = new Date().getFullYear();
  const pret = Number(f.revenu) > 0;
  const c = plan.commerce;

  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10 mx-auto max-w-[680px] px-4 pb-24 pt-14 max-md:pt-8">
        <div className="mb-8 text-center">
          <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
          <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.2] tracking-[-0.02em] text-encre">Combien voulez-vous toucher par mois à la retraite ?</h1>
          <p className="mx-auto m-0 mt-3 max-w-[500px] text-[15px] leading-[1.6] text-ardoise">Choisissez un type de commerce : la page vous dit combien de murs acheter, et en combien de temps.</p>
        </div>

        <div className={`${CARTE} p-6 max-md:p-4`}>
          <Champ label="Votre revenu à la retraite" aide="Les loyers que vous voulez toucher chaque mois, une fois les crédits remboursés, avant impôt.">
            <Nombre valeur={f.revenu} onChange={(v) => poser("revenu", v)} unite="€ / mois" placeholder="2 000" />
          </Champ>
          <Champ label="Le commerce">
            <div className="grid gap-2 sm:grid-cols-2">
              {COMMERCES.map((x) => (
                <button key={x.cle} type="button" onClick={() => poser("commerce", x.cle)} aria-pressed={f.commerce === x.cle}
                  className={`rounded-[10px] border px-4 py-3 text-left transition-colors ${f.commerce === x.cle ? "border-menthe bg-menthe/10" : "border-trait hover:border-bord-doux"}`}
                  style={f.commerce === x.cle ? undefined : { background: "transparent" }}>
                  <span className="block text-[15px] text-encre">{x.nom}</span>
                  <span className="block text-[12.5px] text-ardoise">{x.exemple}</span>
                  <span className="mt-1 block text-[12.5px] tabular-nums text-craie">{Math.round(x.prix / 1000)} k€ · {String(x.rendement).replace(".", ",")} % brut</span>
                </button>
              ))}
            </div>
          </Champ>
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Champ label="Ce que vous épargnez">
              <Nombre valeur={f.epargne} onChange={(v) => poser("epargne", v)} unite="€ / mois" placeholder="500" />
            </Champ>
            <Champ label="Ce que vous pouvez investir aujourd'hui">
              <Nombre valeur={f.apport} onChange={(v) => poser("apport", v)} unite="€" placeholder="20 000" />
            </Champ>
          </div>
          <Champ label="Votre retraite, dans">
            <div className="flex flex-wrap gap-2">
              {HORIZONS.map((n) => <button key={n} type="button" onClick={() => poser("horizon", n)} aria-pressed={f.horizon === n} className={pastille(f.horizon === n)} style={f.horizon === n ? undefined : { background: "transparent" }}>{ans(n)}</button>)}
            </div>
          </Champ>
          {!construit && (
            <button type="button" disabled={!pret} onClick={() => setConstruit(true)}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              Construire mon plan<ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {construit && pret && (
          <div className={`${CARTE} mt-4 p-6 duration-300 animate-in fade-in-0 slide-in-from-bottom-2 max-md:p-4`}>
            <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Votre plan</p>
            <h2 className="m-0 mt-2 text-[22px] font-normal leading-[1.3] text-encre">
              {plan.murs} {plan.murs > 1 ? "murs" : "mur"} de {c.nom.toLowerCase()}, soit {euros(plan.investissement)} investis
            </h2>
            <p className="m-0 mt-2 text-[15px] leading-[1.6] text-craie">
              Chaque mur rapporte environ {euros(plan.loyerMensuelParMur)} par mois une fois remboursé.
              {plan.complet ? ` Vos crédits sont soldés en ${an0 + plan.anneeLibre}, dans ${ans(plan.anneeLibre)}.` : ` Avec cette épargne, le plan dépasse ${HYPOTHESES.anneesMax} ans : il faut plus d'apport ou un commerce plus petit.`}
            </p>

            <div className="mt-5 border-y border-trait">
              {plan.achats.map((a, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-trait px-2 py-3 first:border-t-0">
                  <span className="text-[15px] text-encre">Mur {i + 1}</span>
                  <span className="text-[13.5px] tabular-nums text-ardoise">{a === 0 ? "cette année" : `en ${an0 + a}`} · apport {euros(plan.apportParMur)}</span>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <div className="rounded-[10px] border border-trait bg-relief px-4 py-3">
                <p className="m-0 text-[12.5px] text-ardoise">Dans {ans(f.horizon)}, en {an0 + f.horizon}</p>
                <p className="m-0 mt-0.5 text-[18px] tabular-nums text-encre">{euros(plan.revenuHorizon)} / mois</p>
              </div>
              <div className="rounded-[10px] border border-trait bg-relief px-4 py-3">
                <p className="m-0 text-[12.5px] text-ardoise">Votre objectif</p>
                <p className={`m-0 mt-0.5 text-[18px] ${plan.atteint ? "text-menthe" : "text-encre"}`}>{plan.atteint ? "Atteint à temps" : plan.complet ? `Atteint en ${an0 + plan.anneeLibre}` : "Hors d'atteinte"}</p>
              </div>
            </div>
            {!plan.atteint && plan.complet && (
              <p className="m-0 mt-3 text-[13.5px] leading-[1.6] text-ardoise">
                Le temps qui manque, c'est la durée des crédits. Un apport plus fort au départ, un crédit plus court ou une revente en cours de route rapprochent la date : c'est ce que le fondateur regarde avec vous.
              </p>
            )}

            <div className="mt-6 flex flex-wrap items-center gap-2">
              <RendezVousFondateur visite={visite} qui={qui} libelle="Le concrétiser avec le fondateur" />
            </div>

            <p className="m-0 mt-6 text-[12.5px] leading-[1.6] text-brume">
              Hypothèses : prix et rendement brut types du commerce choisi ; {Math.round(HYPOTHESES.partLoyerGardee * 100)} % du loyer gardé (vacance, charges, entretien) ;
              {" "}{Math.round(HYPOTHESES.partApport * 100)} % d'apport par achat (frais et part de la banque) ; crédit sur {HYPOTHESES.dureeCredit} ans à {String(HYPOTHESES.tauxCredit).replace(".", ",")} % ;
              {" "}l'épargne et les excédents de loyer paient les apports suivants. Avant impôt, sous réserve de l'accord de la banque. Un ordre de grandeur, pas une offre.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
