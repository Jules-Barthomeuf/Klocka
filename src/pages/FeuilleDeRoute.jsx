import React, { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, ArrowLeft, Loader2, Check, MapPin, Store, Phone, Maximize2, Play, Clock, Globe } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";

// « Ma feuille de route » : la page ouverte à tous, sans compte.
//
// L'écran de résultat tient en deux colonnes. À GAUCHE, le portefeuille : les
// commerces à acheter, qu'on fait défiler, la fiche de celui qu'on regarde, et
// dessous le simulateur — un seul graphique, le cash-flow de TOUS les biens
// cumulés sur tout l'horizon, avec les années d'achat marquées. À DROITE, un
// guide qui se parcourt étape par étape et qui entoure, à gauche, ce dont il
// parle.
//
// Deux choses s'y disent franchement, parce qu'une page ouverte engage plus
// qu'une page interne : les commerces montrés ne sont pas à vendre, ce sont des
// devantures du quartier qui donnent le niveau de prix ; et quand l'objectif
// demande plus de temps que l'horizon voulu, la page le dit.

const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
const LIEN_RDV = import.meta.env.VITE_LM_LIEN_RDV || "mailto:sourcing@klocka.immo?subject=Je%20souhaite%20un%20appel%20Klocka";
const CARTE = "rounded-[18px] border border-trait bg-surface";
const HORIZONS = [10, 15, 20, 25, 30, 35];
const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
const k = (n) => `${Math.round(n / 1000)} k€`;

// Le guide ne cerne pas ce dont il parle : il efface le reste. Tant qu'on n'a
// pas commencé, rien n'est flouté — on voit la page entière, et la carte de
// droite propose d'entrer dans le guide.
const TRANSITION = "transition-[filter,opacity,transform] duration-700 ease-out";
const flouSi = (zoneActive, zone) => {
  if (!zoneActive) return TRANSITION;
  return zoneActive === zone
    ? `${TRANSITION} opacity-100 blur-0`
    : `${TRANSITION} pointer-events-none select-none opacity-30 blur-[5px]`;
};

function Champ({ label, aide = null, children }) {
  return (
    <div className="mb-4">
      <label className="alx-mont mb-1.5 block text-[10.5px] uppercase tracking-[.14em] text-encre">{label}</label>
      {children}
      {aide && <p className="m-0 mt-1 text-[11px] text-brume">{aide}</p>}
    </div>
  );
}

function Nombre({ valeur, onChange, unite, placeholder }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
      <input type="text" inputMode="numeric" value={valeur} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full bg-transparent text-[14px] tabular-nums text-encre outline-none placeholder:text-brume" />
      <span className="flex-shrink-0 text-[13px] text-ardoise">{unite}</span>
    </div>
  );
}

// ── Le guide, à droite ──────────────────────────────────────────────────────

function etapesDuGuide(r) {
  const a0 = r.acquisitions[0];
  const a1 = r.acquisitions[1];
  const anneeAchat1 = a0?.annee ?? 0;
  const creux = r.projection.find((p) => p.achats.length && p.annee > 0);
  const etapes = [
    {
      zone: "projet",
      titre: "Voici votre premier projet",
      texte: a0
        ? `Un local de ${a0.metier.toLowerCase()} d'environ ${a0.surface} m², à ${euros(a0.prix)}. Vous apportez ${euros(a0.apport)}, soit ${Math.round(r.hypotheses.part_apport * 100)} % du prix : le reste est financé par la banque, remboursé par le locataire. Il vous rapporte ${euros(a0.loyer_annuel)} de loyer par an.`
        : "Votre objectif est atteignable avec un seul bien.",
    },
    {
      zone: "projet",
      titre: "Qui paie le loyer",
      texte: a0?.exemple
        ? `À droite, la devanture d'un ${a0.metier.toLowerCase()} à ${a0.exemple.distance_m} m de chez vous. Un commerce comme celui-ci tient un bail 3-6-9 : c'est lui qui paie le crédit, les charges courantes et la taxe foncière quand le bail le prévoit. Ce commerce-là n'est pas à vendre, il montre le type d'exploitant qu'on cherche.`
        : `Un local commercial se loue par un bail 3-6-9 : c'est le commerçant qui paie le crédit, les charges courantes et la taxe foncière quand le bail le prévoit. C'est ce qui distingue un commerce d'un appartement.`,
    },
  ];
  if (a1) {
    // Deux achats la même année, ce n'est pas un effet boule de neige : ce sont
    // les fonds propres qui portent les deux. Le raconter autrement serait faux.
    const memeAnnee = a1.annee === anneeAchat1;
    etapes.push({
      zone: "simulateur",
      avant: 1,
      titre: memeAnnee ? "Deux acquisitions dès le départ" : `Le deuxième achat, en année ${a1.annee}`,
      texte: memeAnnee
        ? `Vos fonds propres couvrent deux apports d'emblée : après le premier local, il vous reste de quoi financer un ${a1.metier.toLowerCase()} de ${a1.surface} m² à ${euros(a1.prix)}, soit ${euros(a1.apport)} d'apport. Les deux loyers tombent dès la première année, et c'est eux qui financeront le troisième.`
        : `Vous n'attendez pas ${a1.annee} ans pour remettre de l'argent de côté : le premier local en produit déjà. Entre l'année ${anneeAchat1} et l'année ${a1.annee}, votre épargne et les loyers du premier bien réunissent les ${euros(a1.apport)} du second — un ${a1.metier.toLowerCase()} de ${a1.surface} m² à ${euros(a1.prix)}. C'est l'effet boule de neige.`,
    });
  }
  etapes.push({
    zone: "simulateur",
    titre: "Le calcul complet, poste par poste",
    texte: `Tout en bas, le simulateur de Klocka, celui que nous utilisons pour nos clients, pré-rempli avec le local que vous regardez à gauche : crédit, charges, impôt, revente, année par année. Changez de commerce en haut et il se recalcule. Tous les curseurs sont manipulables, essayez.`,
  });
  etapes.push({
    zone: "acquisitions",
    titre: `${r.nombre_acquisitions} acquisition${r.nombre_acquisitions > 1 ? "s" : ""} en tout`,
    texte: `Faites-les défiler à gauche. On commence petit, avec ce que vous avez, puis on monte en gamme à mesure que le portefeuille porte l'achat suivant. Au terme, ${euros(r.patrimoine_final)} de patrimoine produisant ${euros(r.atteint_mensuel)} par mois.`,
  });
  etapes.push({
    zone: "objectif",
    titre: r.dans_horizon ? "Votre objectif est tenu" : "Votre objectif demande un peu plus de temps",
    texte: r.dans_horizon
      ? `Vous visiez ${euros(r.objectif_mensuel)} par mois en ${r.horizon_ans} ans : le plan y arrive en ${r.annee_objectif} ans. Parlons-en de vive voix, c'est gratuit et sans engagement.`
      : `Vous visiez ${euros(r.objectif_mensuel)} par mois en ${r.horizon_ans} ans ; ce plan atteint ${euros(r.atteint_mensuel)} par mois. Nous préférons le dire plutôt que d'arrondir : avec plus d'apport de départ, un horizon plus long ou un objectif un peu moins haut, le compte y est. C'est exactement ce dont on parle en rendez-vous.`,
  });
  return etapes;
}

function Guide({ r, etape, setEtape, setAcqEnAvant, demarre, onDemarrer }) {
  const etapes = useMemo(() => etapesDuGuide(r), [r]);
  const e = etapes[etape];
  useEffect(() => { if (demarre) setAcqEnAvant(e?.avant ?? null); }, [etape, demarre]);

  // Avant de commencer : la page est entière et nette, et la carte invite.
  if (!demarre) {
    return (
      <div className={`${CARTE} flex h-full flex-col justify-center p-6 text-center`}>
        <h3 className="m-0 text-[20px] font-light leading-[1.3] text-encre">Votre feuille de route est prête</h3>
        <p className="m-0 mt-3 text-[13.5px] leading-[1.7] text-craie">
          Prenez trente secondes : nous vous montrons ce qu&apos;il y a à gauche, morceau par morceau — votre premier local,
          ce qu&apos;il rapporte, et comment le suivant se finance.
        </p>
        <button onClick={onDemarrer}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          <Play className="h-4 w-4" />Commencer
        </button>
        <p className="m-0 mt-3 text-[11px] text-brume">{etapes.length} étapes · vous pouvez sortir quand vous voulez</p>
      </div>
    );
  }

  return (
    <div className={`${CARTE} flex h-full flex-col p-5`}>
      <div className="flex items-center justify-between">
        <span className="alx-mont text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Le guide · {etape + 1} / {etapes.length}</span>
        <div className="flex gap-1">
          <button onClick={() => setEtape(Math.max(0, etape - 1))} disabled={etape === 0}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-bord text-ardoise transition-colors hover:text-encre disabled:opacity-30">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button onClick={() => setEtape(Math.min(etapes.length - 1, etape + 1))} disabled={etape === etapes.length - 1}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-menthe/40 bg-menthe/10 text-menthe-texte transition-colors hover:bg-menthe/20 disabled:opacity-30">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <h3 className="m-0 mt-4 text-[19px] font-medium leading-[1.3] text-encre">{e.titre}</h3>
      <p className="m-0 mt-3 flex-1 text-[13.5px] leading-[1.75] text-craie">{e.texte}</p>

      <div className="mt-5 flex gap-1">
        {etapes.map((_, i) => (
          <button key={i} onClick={() => setEtape(i)} aria-label={`Étape ${i + 1}`}
            className={`h-1 flex-1 rounded-full transition-colors ${i === etape ? "bg-menthe" : i < etape ? "bg-menthe/40" : "bg-trait"}`} />
        ))}
      </div>

      {etape === etapes.length - 1 ? (
        <a href={LIEN_RDV} target={LIEN_RDV.startsWith("http") ? "_blank" : undefined} rel="noreferrer"
          className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[12.5px] font-medium uppercase tracking-[.12em] text-sur-menthe">
          <Phone className="h-4 w-4" />Réserver mon appel gratuit
        </a>
      ) : (
        <button onClick={onDemarrer} className="mt-4 text-[11.5px] text-brume hover:text-ardoise">Voir toute la page</button>
      )}
    </div>
  );
}

// ── Le résultat ─────────────────────────────────────────────────────────────

function Resultat({ r, prenom, onRecommencer }) {
  const [demarre, setDemarre] = useState(false);
  const [etape, setEtape] = useState(0);
  const [acq, setAcq] = useState(0);
  const [acqEnAvant, setAcqEnAvant] = useState(null);
  const etapes = useMemo(() => etapesDuGuide(r), [r]);
  const zone = demarre ? etapes[etape]?.zone : null;
  const a = r.acquisitions[acq];
  const flou = (z) => flouSi(zone, z);

  // Le guide met en avant une acquisition : la fiche de gauche suit.
  useEffect(() => { if (acqEnAvant != null) setAcq(acqEnAvant); }, [acqEnAvant]);

  // Le simulateur complet, pré-rempli avec le local qu'on regarde. Il se
  // recalcule de lui-même quand l'acquisition change : son état suit ses
  // paramètres. Sans dealId, aucun enregistrement n'est proposé — cette page
  // n'a pas de compte derrière elle.
  const parametresSimulateur = useMemo(() => (a ? {
    surface: a.surface,
    loyerInitialHTHC: a.loyer_annuel,
    prixBienFAI: a.prix,
    prixBienNegocie: a.prix,
    apport: a.apport,
    dureeCredit: 20,
    tauxInteret: 3.7,
    anneeRevente: 20,
  } : null), [a]);

  return (
    <div className="mx-auto max-w-[1280px] px-4 pb-24 pt-10">
      <div className={`mb-8 text-center ${flou("titre")}`}>
        <p className="alx-mont m-0 text-[11px] uppercase tracking-[.2em] text-menthe-texte">Votre parcours d&apos;investissement</p>
        <h1 className="mx-auto mt-3 mb-0 max-w-[820px] text-[32px] font-light leading-[1.15] tracking-[-0.01em] text-encre">
          {prenom}, voici le chemin vers {euros(r.objectif_mensuel)} par mois
        </h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          {/* Les commerces à acheter, qu'on fait défiler */}
          <div className={`mb-4 ${flou("acquisitions")}`}>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {r.acquisitions.map((x, i) => (
                <button key={x.rang} onClick={() => setAcq(i)}
                  className={`flex-shrink-0 rounded-full border px-3.5 py-2 text-[12px] transition-colors ${i === acq ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                  <span className="font-medium">{x.metier}</span>
                  <span className="ml-2 text-brume">an {x.annee} · {k(x.prix)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* La fiche du projet regardé */}
          {a && (
            <div className={`${CARTE} mb-4 p-5 ${flou("projet")}`}>
              <p className="alx-mont m-0 text-[10.5px] uppercase tracking-[.14em] text-brume">Acquisition {a.rang} sur {r.nombre_acquisitions}</p>
              <h2 className="m-0 mt-1 text-[22px] font-light text-encre">{a.metier} · {euros(a.prix)}</h2>
              <p className="m-0 mt-1 text-[12.5px] text-ardoise">
                environ {a.surface} m² · achat en année {a.annee} · rendement cible {a.rendement_cible} %
              </p>

              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[["Apport", euros(a.apport)], ["Financé", euros(a.prix - a.apport)], ["Loyer annuel", euros(a.loyer_annuel)], ["Cash-flow", `${euros(a.cash_flow_mensuel)} / mois`]].map(([t, v]) => (
                      <div key={t} className="rounded-[10px] border border-trait bg-relief px-3 py-2">
                        <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                        <p className="m-0 mt-0.5 text-[15px] font-semibold tabular-nums text-encre">{v}</p>
                      </div>
                    ))}
                  </div>

                  {/* Le locataire : ce que la fiche du commerce dit vraiment,
                      sans rien inventer sur son bail ni sur ses comptes. */}
                  <p className="alx-mont mt-4 mb-2 text-[10.5px] uppercase tracking-[.14em] text-menthe-texte">Le locataire type</p>
                  {a.exemple ? (
                    <div className="rounded-[12px] border border-trait bg-relief p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-trait"><Store className="h-4 w-4 text-menthe" /></span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13.5px] font-medium text-encre">{a.exemple.nom}</span>
                          <span className="block truncate text-[11.5px] text-ardoise">
                            {a.exemple.metier}{a.exemple.enseigne && a.exemple.enseigne !== a.exemple.nom ? ` · enseigne ${a.exemple.enseigne}` : ""}
                            {a.exemple.distance_m != null ? ` · à ${a.exemple.distance_m} m de chez vous` : ""}
                          </span>
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[11.5px] text-ardoise">
                        {a.exemple.adresse && <p className="m-0 flex items-start gap-1.5"><MapPin className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.adresse}</p>}
                        {a.exemple.horaires && <p className="m-0 flex items-start gap-1.5"><Clock className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.horaires}</p>}
                        {a.exemple.telephone && <p className="m-0 flex items-start gap-1.5"><Phone className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" />{a.exemple.telephone}</p>}
                        {a.exemple.site && <p className="m-0 flex items-start gap-1.5"><Globe className="mt-0.5 h-3 w-3 flex-shrink-0 text-brume" /><span className="truncate">{a.exemple.site.replace(/^https?:\/\//, "")}</span></p>}
                      </div>
                      <p className="m-0 mt-2 border-t border-trait pt-2 text-[11px] leading-[1.6] text-brume">
                        Bail commercial 3-6-9 : le commerçant paie le loyer, les charges courantes, et la taxe foncière quand le bail le prévoit.
                        Ce commerce existe et <span className="text-ardoise">n&apos;est pas à vendre</span> : il montre le type d&apos;exploitant recherché.
                      </p>
                    </div>
                  ) : (
                    <p className="m-0 text-[12px] leading-[1.6] text-ardoise">
                      Bail commercial 3-6-9 : le commerçant paie le loyer, les charges courantes, et la taxe foncière quand le bail le prévoit.
                    </p>
                  )}
                </div>

                {/* La devanture, sur Google Maps */}
                <div className="min-h-[260px] overflow-hidden rounded-[12px] border border-trait">
                  {CLE_MAPS && a.exemple?.lat ? (
                    <iframe title={`Vue de la rue · ${a.exemple.nom}`} className="block h-full min-h-[260px] w-full border-0" loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade" allowFullScreen
                      src={`https://www.google.com/maps/embed/v1/streetview?key=${CLE_MAPS}&location=${a.exemple.lat},${a.exemple.lon}&heading=0&pitch=0&fov=90`} />
                  ) : CLE_MAPS && r.quartier ? (
                    <iframe title="Votre quartier" className="block h-full min-h-[260px] w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade"
                      src={`https://www.google.com/maps/embed/v1/place?key=${CLE_MAPS}&q=${encodeURIComponent(r.quartier || "")}&zoom=14`} />
                  ) : (
                    <div className="flex h-full min-h-[260px] items-center justify-center px-4 text-center text-[12px] text-brume">Plan indisponible</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className={`grid gap-2 sm:grid-cols-3 ${flou("objectif")}`}>
            {[
              ["Revenu au terme", `${euros(r.atteint_mensuel)} / mois`],
              ["Patrimoine", euros(r.patrimoine_final)],
              ["Objectif atteint", r.annee_objectif != null ? `en ${r.annee_objectif} ans` : "—"],
            ].map(([t, v]) => (
              <div key={t} className={`${CARTE} px-4 py-3`}>
                <p className="m-0 text-[10.5px] uppercase tracking-[.08em] text-brume">{t}</p>
                <p className="m-0 mt-0.5 text-[16px] font-semibold tabular-nums text-encre">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:sticky lg:top-6 lg:self-start">
          <Guide r={r} etape={etape} setEtape={setEtape} setAcqEnAvant={setAcqEnAvant}
            demarre={demarre} onDemarrer={() => { setDemarre((d) => !d); setEtape(0); }} />
        </div>
      </div>

      {/* Le simulateur complet, tout en bas : celui de Klocka, pré-rempli avec
          le local qu'on regarde, et qui se recalcule quand on en change. */}
      {parametresSimulateur && (
        <div className={`mt-6 ${flou("simulateur")}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="m-0 text-[18px] font-medium text-encre">Le calcul complet · {a.metier} à {euros(a.prix)}</h2>
              <p className="m-0 mt-0.5 text-[12px] text-ardoise">
                notre simulateur, pré-rempli avec ce local · changez de commerce en haut et tout se recalcule
              </p>
            </div>
            <a href={r.lien_simulateur} target="_blank" rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord px-3.5 text-[11px] uppercase tracking-[.1em] text-ardoise hover:text-encre">
              <Maximize2 className="h-3.5 w-3.5" />Ouvrir dans une page
            </a>
          </div>
          <SimulateurDossier parametres={parametresSimulateur} />
        </div>
      )}

      <details className={`mt-8 ${flou("annexes")}`}>
        <summary className="cursor-pointer text-[12.5px] text-ardoise hover:text-encre">Sur quoi ce plan est-il calculé ?</summary>
        <div className="mt-3 space-y-2 text-[12px] leading-[1.7] text-brume">
          <p className="m-0">Rendement brut visé : {r.hypotheses.rendement_cible} %. Part du loyer qui reste en poche une fois le crédit, les charges, la gestion et l&apos;impôt payés : {Math.round(r.hypotheses.part_cash_flow * 100)} %. Apport par acquisition : {Math.round(r.hypotheses.part_apport * 100)} % du prix. Épargne supposée : {Math.round(r.hypotheses.part_epargne * 100)} % de vos revenus nets. Le prix d&apos;un local est sa surface type multipliée par le prix du quartier.</p>
          {r.marche && <p className="m-0">Prix du quartier : médiane de {r.marche.ventes} ventes de locaux commerciaux ({r.marche.annees?.join(", ")}) publiées par l&apos;administration fiscale, entre {euros(r.marche.bas)} et {euros(r.marche.haut)} le m². <a className="text-menthe-texte" href={r.marche.lien} target="_blank" rel="noreferrer">Voir les ventes</a>.</p>}
          <p className="m-0">Ce plan est une simulation, pas un conseil en investissement, et ne vaut pas engagement. Les rendements passés ne préjugent pas des rendements futurs.</p>
        </div>
      </details>

      <button onClick={onRecommencer} className={`mt-6 text-[12.5px] text-ardoise hover:text-encre ${flou("annexes")}`}>Refaire avec d&apos;autres chiffres</button>

    </div>
  );
}

// ── La page ─────────────────────────────────────────────────────────────────

export default function FeuilleDeRoute() {
  const [f, setF] = useState({ nom: "", email: "", telephone: "", objectif_mensuel: "", revenus_annuels: "", fonds_propres: "", quartier: "", horizon_ans: 20, consentement: false });
  const [suggestions, setSuggestions] = useState([]);
  const [roadmap, setRoadmap] = useState(null);
  const poser = (k2, v) => setF((x) => ({ ...x, [k2]: v }));

  useEffect(() => {
    const q = f.quartier.trim();
    if (q.length < 3 || roadmap) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://api-adresse.data.gouv.fr/search/?type=municipality&autocomplete=1&limit=5&q=${encodeURIComponent(q)}`);
        const d = r.ok ? (await r.json()).features || [] : [];
        setSuggestions(d.map((x) => x.properties?.label).filter(Boolean));
      } catch { /* la Base Adresse ne répond pas : on saisit à la main */ }
    }, 250);
    return () => clearTimeout(t);
  }, [f.quartier, roadmap]);

  const envoyer = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lm/feuille-de-route/roadmap", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || "Nous n'avons pas pu calculer votre feuille de route.");
      return d;
    },
    onSuccess: (d) => { setRoadmap(d.roadmap); window.scrollTo({ top: 0, behavior: "smooth" }); },
  });

  const pret = f.nom.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(f.email) && f.quartier.trim().length >= 3 && Number(f.objectif_mensuel) > 0 && f.consentement;

  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10">
        {roadmap ? (
          <Resultat r={roadmap} prenom={f.nom.trim().split(" ")[0]} onRecommencer={() => setRoadmap(null)} />
        ) : (
          <div className="mx-auto max-w-[680px] px-4 pb-24 pt-14">
            <div className="mb-8 text-center">
              <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
              <h1 className="m-0 mb-3 text-[34px] font-light leading-[1.15] tracking-[-0.01em] text-encre">
                Combien de commerces pour vivre de vos loyers ?
              </h1>
              <p className="mx-auto m-0 max-w-[520px] text-[15px] leading-[1.7] text-ardoise">
                En deux minutes, vous repartez avec les commerces à acheter, leur prix, leur année, et le cash-flow de l&apos;ensemble —
                chiffrés sur les ventes réelles de votre quartier.
              </p>
            </div>

            <div className={`${CARTE} p-6 max-md:p-4`}>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Votre prénom">
                  <input value={f.nom} onChange={(e) => poser("nom", e.target.value)} placeholder="Camille"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
                <Champ label="Votre e-mail">
                  <input type="email" value={f.email} onChange={(e) => poser("email", e.target.value)} placeholder="camille@exemple.fr"
                    className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
                </Champ>
              </div>

              <Champ label="Votre objectif de revenu" aide="Ce que vous aimeriez toucher chaque mois, une fois les crédits et les charges payés.">
                <Nombre valeur={f.objectif_mensuel} onChange={(v) => poser("objectif_mensuel", v.replace(/[^\d]/g, ""))} unite="€ / mois" placeholder="2 000" />
              </Champ>

              <div className="grid gap-x-4 sm:grid-cols-2">
                <Champ label="Vos revenus nets annuels">
                  <Nombre valeur={f.revenus_annuels} onChange={(v) => poser("revenus_annuels", v.replace(/[^\d]/g, ""))} unite="€ / an" placeholder="55 000" />
                </Champ>
                <Champ label="Vos fonds propres">
                  <Nombre valeur={f.fonds_propres} onChange={(v) => poser("fonds_propres", v.replace(/[^\d]/g, ""))} unite="€" placeholder="60 000" />
                </Champ>
              </div>

              <Champ label="Votre ville ou quartier" aide="C'est là que nous prenons les prix réels et les commerces en exemple.">
                <div className="relative">
                  <div className="flex items-center gap-2 rounded-[10px] border border-bord bg-surface px-3 focus-within:border-menthe">
                    <MapPin className="h-4 w-4 flex-shrink-0 text-brume" />
                    <input value={f.quartier} onChange={(e) => poser("quartier", e.target.value)} placeholder="Nantes, Saint-Nazaire…"
                      className="h-11 w-full bg-transparent text-[14px] text-encre outline-none placeholder:text-brume" />
                  </div>
                  {suggestions.length > 0 && (
                    <ul className="absolute left-0 right-0 top-[48px] z-20 m-0 list-none overflow-hidden rounded-[10px] border border-bord bg-surface-pleine p-0 shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
                      {suggestions.map((s) => (
                        <li key={s}><button type="button" onClick={() => { poser("quartier", s); setSuggestions([]); }}
                          className="block w-full px-3 py-2 text-left text-[13px] text-craie hover:bg-relief hover:text-encre">{s}</button></li>
                      ))}
                    </ul>
                  )}
                </div>
              </Champ>

              <Champ label="Votre horizon" aide="Sur combien d'années vous vous projetez.">
                <div className="flex flex-wrap gap-1.5">
                  {HORIZONS.map((h) => (
                    <button key={h} type="button" onClick={() => poser("horizon_ans", h)}
                      className={`flex-1 rounded-[10px] border py-2.5 text-[13px] transition-colors ${f.horizon_ans === h ? "border-menthe bg-menthe/[0.14] text-menthe-texte" : "border-bord text-ardoise hover:text-encre"}`}>
                      {h} ans
                    </button>
                  ))}
                </div>
              </Champ>

              <Champ label="Votre téléphone" aide="Facultatif. Seulement si vous préférez qu'on vous appelle.">
                <input value={f.telephone} onChange={(e) => poser("telephone", e.target.value)} placeholder="06 12 34 56 78"
                  className="h-11 w-full rounded-[10px] border border-bord bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe" />
              </Champ>

              <label className="mt-2 flex cursor-pointer items-start gap-2.5 text-[12px] leading-[1.6] text-ardoise">
                <input type="checkbox" checked={f.consentement} onChange={(e) => poser("consentement", e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[#96c0b8]" />
                <span>
                  J&apos;accepte que Klocka conserve ces informations pour me recontacter au sujet de ma feuille de route. Elles ne sont ni
                  revendues ni transmises. Vous pouvez demander leur suppression à tout moment à sourcing@klocka.immo.
                </span>
              </label>

              {envoyer.isError && <p className="m-0 mt-4 text-[13px] text-alerte">{envoyer.error.message}</p>}

              <button onClick={() => envoyer.mutate()} disabled={!pret || envoyer.isPending}
                className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-menthe px-6 text-[13px] font-medium uppercase tracking-[.12em] text-sur-menthe disabled:opacity-50">
                {envoyer.isPending ? <><Loader2 className="h-4 w-4 animate-spin" />Nous calculons votre feuille de route…</> : <>Voir ma feuille de route<ArrowRight className="h-4 w-4" /></>}
              </button>
              <p className="m-0 mt-3 text-center text-[11px] text-brume">Gratuit, sans engagement, et sans création de compte.</p>
            </div>

            <div className="mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11.5px] text-brume">
              {["Chiffré sur les ventes réelles publiées par l'administration", "Des commerces de votre quartier en exemple", "Toutes les hypothèses affichées"].map((t) => (
                <span key={t} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-menthe" />{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
