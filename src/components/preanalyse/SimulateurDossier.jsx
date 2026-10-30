import React, { useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal, AlertTriangle, Loader2, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { calculerTableauAnnuel, travauxParDefaut } from "@/components/simulator/CalculFinancier";
import SimControlRail from "@/components/simulator/layout/SimControlRail";
import SimKpiRow from "@/components/simulator/layout/SimKpiRow";
import SimBudgetDonut from "@/components/simulator/layout/SimBudgetDonut";
import SimChartCarousel from "@/components/simulator/layout/SimChartCarousel";
import SimReventeSynthese from "@/components/simulator/layout/SimReventeSynthese";
import SimDataTable from "@/components/simulator/layout/SimDataTable";
import SimScenarios from "@/components/simulator/layout/SimScenarios";
import SimParametresAvances from "@/components/simulator/layout/SimParametresAvances";

// Le simulateur complet, embarqué dans la préanalyse et pré-rempli avec le
// dossier. Il remplace l'ancien calcul AEM figé : un dossier incomplet reste
// manipulable — on pose les hypothèses manquantes à la main et on regarde si le
// projet tient. Même moteur que la page Simulateur (calculerTableauAnnuel), donc
// un chiffre vu ici ne diffère jamais de la simulation complète.

// Hypothèses de départ, alignées sur les valeurs par défaut du simulateur.
const DEFAUTS = {
  surface: 0,
  loyerInitialHTHC: 0,
  prixBienFAI: 0,
  prixBienNegocie: 0,
  loyerSoumisTVA: false,
  tauxTVA: 20,
  chargesCoproRefacturables: true,
  chargesCopropriete: 0,
  taxeFonciereRefacturable: true,
  taxeFonciere: 0,
  loyerRevalorise: 0,
  anneeRevalorisation: null,
  revalorisationActive: false,
  gestionLocative: 0,
  comptabilite: 600,
  chargesDiverses: 0,
  assurancePNE: 400,
  fraisDossierBancaire: 1000,
  fraisCourtage: 0,
  coutCreationSociete: 1000,
  tauxCommissionAgent: 5,
  commissionAgentType: "pourcentage",
  commissionAgentInclusFAI: true,
  tauxDroitsEnregistrement: 8,
  tauxFeesKlocka: 8,
  feesKlockaType: "pourcentage",
  tauxIncentiveKlocka: 20,
  dureeCredit: 20,
  tauxInteret: 3.9,
  tauxAssuranceCredit: 0.25,
  pretInFine: false,
  sansCredit: false,
  renegociationActive: false,
  anneeRenegociation: 10,
  nouveauTauxRenegociation: 2.5,
  iraRenegociation: 0,
  indexation: 2,
  anneeRevente: 20,
  tauxCommissionAgentRevente: 5,
  rendementBrutAcheteur: 6.5,
};

// Champs pilotés par des curseurs / onglets : un seul état par clé.
const CHAMPS = Object.keys(DEFAUTS);

const etatInitial = (parametres = {}) => {
  const etat = {};
  for (const cle of CHAMPS) {
    const valeur = parametres[cle];
    etat[cle] = valeur === undefined || valeur === null ? DEFAUTS[cle] : valeur;
  }
  return etat;
};

// Les chiffres que les autres onglets de l'analyse donnent (bail, quittances, taxe foncière, surface) passent devant ceux
// du lot, sauf ceux qu'on a tapés ici à la main (`saisis`, 30 oct. 2026, Jules).
const avecAnalyse = (parametres = {}, depuisAnalyse = null) => {
  const saisis = new Set(parametres.saisis || []);
  const venus = Object.entries(depuisAnalyse?.valeurs || {}).filter(([cle]) => CHAMPS.includes(cle) && !saisis.has(cle));
  return venus.length ? { ...parametres, ...Object.fromEntries(venus) } : parametres;
};

const LIBELLES_ANALYSE = {
  loyerInitialHTHC: "loyer", loyerSoumisTVA: "TVA", chargesCoproRefacturables: "charges refacturées",
  taxeFonciereRefacturable: "taxe foncière refacturée", taxeFonciere: "taxe foncière", surface: "surface",
};

const ONGLETS = [
  { id: "graphiques", label: "Graphiques" },
  { id: "revente", label: "Revente" },
  { id: "scenarios", label: "Négociation" },
  { id: "avance", label: "Paramètres avancés" },
];

const formatCurrency = (value) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 })
    .format(Math.round(value || 0))
    .replace(/\u00A0/g, " ");

// compact : colonne étroite (étape Analyse) — le rail d'hypothèses passe en
// panneau dépliable au lieu d'occuper une colonne de gauche.
// dealId + lotIndex : les chiffres s'enregistrent sur le lot, on y revient
// plus tard et le projet créé depuis le deal en hérite.
export default function SimulateurDossier({ parametres: duLot, depuisAnalyse = null, compact = false, dealId = null, lotIndex = 0, onEnregistre = undefined }) {
  const parametres = useMemo(() => avecAnalyse(duLot, depuisAnalyse), [duLot, depuisAnalyse]);
  const [etat, setEtat] = useState(() => etatInitial(parametres));
  // Les champs tapés à la main : l'analyse ne les remplace plus.
  const saisis = useRef(new Set(duLot?.saisis || []));
  // Tableaux annuels : hors CHAMPS car ils ne viennent jamais du dossier.
  const [vacancesLocatives, setVacancesLocatives] = useState(() => Array(25).fill(0));
  const [travauxBailleur, setTravauxBailleur] = useState(travauxParDefaut);
  // Un apport enregistré est repris tel quel ; sinon il suit les 15 %.
  const [apport, setApport] = useState(() => (parametres?.apport != null ? parametres.apport : 0));
  const [ongletActif, setOngletActif] = useState("graphiques");
  const [negoPct, setNegoPct] = useState(0);
  const [railOuvert, setRailOuvert] = useState(false);
  // Tant que l'apport n'a pas été touché, il suit les 15 % du prix de revient.
  const apportTouche = useRef(parametres?.apport != null);

  // Le dossier change (autre lot, réanalyse) : on repart de ses chiffres. Pas quand le changement vient de notre
  // propre enregistrement : les travaux et la vacance, qui ne s'enregistrent pas, resteraient sinon remis à zéro.
  const signature = JSON.stringify(parametres || {});
  const vientDeMoi = useRef(false);
  useEffect(() => {
    if (vientDeMoi.current) { vientDeMoi.current = false; return; }
    setEtat(etatInitial(parametres));
    setVacancesLocatives(Array(25).fill(0));
    setTravauxBailleur(travauxParDefaut());
    setNegoPct(0);
    apportTouche.current = parametres?.apport != null;
    if (parametres?.apport != null) setApport(parametres.apport);
    saisis.current = new Set(duLot?.saisis || []);
  }, [signature]);

  // Enregistrer tout seul (29 oct. 2026, Jules) : le dernier chiffre tapé reste sur le lot, une seconde après
  // la dernière retouche, sans bouton.
  const enregistrer = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${lotIndex}/simulateur`, { body: corps }),
    onSuccess: () => { vientDeMoi.current = true; onEnregistre?.(); },
    onError: (e) => toast.error(e?.message || "Chiffres non enregistrés"),
  });
  // Seulement après une retouche à la main : ouvrir l'onglet n'écrit rien (l'apport qui suit les 15 % non plus).
  const retouche = useRef(false);
  const aEnvoyer = JSON.stringify({ ...etat, apport });
  useEffect(() => {
    if (!dealId || !retouche.current) return undefined;
    const t = setTimeout(() => { retouche.current = false; enregistrer.mutate({ ...JSON.parse(aEnvoyer), saisis: [...saisis.current] }); }, 1000);
    return () => clearTimeout(t);
  }, [aEnvoyer, dealId]);

  const maj = (cle, valeur) => {
    retouche.current = true;
    saisis.current.add(cle);
    if (cle === "apport") {
      apportTouche.current = true;
      setApport(valeur);
      return;
    }
    setEtat((e) => ({ ...e, [cle]: valeur }));
  };

  const negoActive = ongletActif === "scenarios" && negoPct > 0;
  const prixNegocieEffectif = negoActive
    ? Math.round(etat.prixBienNegocie * (1 - negoPct / 100))
    : etat.prixBienNegocie;

  const parametresCalcul = useMemo(
    () => ({
      ...etat,
      prixBienNegocie: prixNegocieEffectif,
      vacancesLocatives,
      travauxBailleur,
      // Honoraires d'agence : toujours comptés, comme dans le calcul AEM serveur.
      commissionAgentActive: true,
    }),
    [etat, prixNegocieEffectif, vacancesLocatives, travauxBailleur]
  );

  // Apport automatique : 15 % du prix de revient, jusqu'à saisie manuelle.
  const prixRevientSansApport = useMemo(
    () => calculerTableauAnnuel({ ...parametresCalcul, apport: 0 }).prixRevient,
    [parametresCalcul]
  );
  useEffect(() => {
    if (!apportTouche.current) setApport(Math.round(prixRevientSansApport * 0.15));
  }, [prixRevientSansApport]);

  const calculs = useMemo(
    () => calculerTableauAnnuel({ ...parametresCalcul, apport }),
    [parametresCalcul, apport]
  );

  const values = { ...etat, prixBienNegocie: etat.prixBienNegocie, apport };
  const advanced = {
    loyerSoumisTVA: etat.loyerSoumisTVA, setLoyerSoumisTVA: (v) => maj("loyerSoumisTVA", v),
    chargesCoproRefacturables: etat.chargesCoproRefacturables, setChargesCoproRefacturables: (v) => maj("chargesCoproRefacturables", v),
    taxeFonciereRefacturable: etat.taxeFonciereRefacturable, setTaxeFonciereRefacturable: (v) => maj("taxeFonciereRefacturable", v),
    pretInFine: etat.pretInFine, setPretInFine: (v) => maj("pretInFine", v),
    sansCredit: etat.sansCredit, setSansCredit: (v) => maj("sansCredit", v),
    revalorisationActive: etat.revalorisationActive, setRevalorisationActive: (v) => maj("revalorisationActive", v),
    anneeRevalorisation: etat.anneeRevalorisation, setAnneeRevalorisation: (v) => maj("anneeRevalorisation", v),
    loyerRevalorise: etat.loyerRevalorise, setLoyerRevalorise: (v) => maj("loyerRevalorise", v),
    renegociationActive: etat.renegociationActive, setRenegociationActive: (v) => maj("renegociationActive", v),
    anneeRenegociation: etat.anneeRenegociation, setAnneeRenegociation: (v) => maj("anneeRenegociation", v),
    nouveauTauxRenegociation: etat.nouveauTauxRenegociation, setNouveauTauxRenegociation: (v) => maj("nouveauTauxRenegociation", v),
    iraRenegociation: etat.iraRenegociation, setIraRenegociation: (v) => maj("iraRenegociation", v),
    vacancesLocatives, setVacancesLocatives,
    travauxBailleur, setTravauxBailleur,
  };

  // Données manquantes : on ne bloque pas, on signale ce qui est à poser à la main.
  const manquants = [
    !etat.prixBienFAI && "prix FAI",
    !etat.loyerInitialHTHC && "loyer annuel",
    !etat.surface && "surface",
  ].filter(Boolean);

  // Ce que l'analyse a posé et qui n'a pas été retouché depuis.
  const venusDeLAnalyse = Object.entries(depuisAnalyse?.sources || {}).filter(([cle]) => CHAMPS.includes(cle) && !saisis.current.has(cle));

  const rail = (
    <SimControlRail
      values={values}
      onChange={maj}
      calculs={calculs}
      formatCurrency={formatCurrency}
      advanced={advanced}
      activeTab={ongletActif}
      afficherScenario={false}
      titre="Simulateur"
      fermeParDefaut
      ouvertes={["ACQUISITION"]}
      alertes={{ prixBienFAI: !etat.prixBienFAI ? "Prix FAI à renseigner : sans lui, rien ne se calcule." : null, prixBienNegocie: !etat.prixBienNegocie ? "Prix négocié à 0." : null }}
    />
  );

  // Un seul fond (17 oct. 2026, Jules) : les cartes du simulateur laissent voir celui du panneau, sans à-plats plus clairs.
  return (
    <div data-zone="listes" className="k-points relative overflow-hidden rounded-[16px] border border-trait bg-rail [&_.bg-surface]:!bg-transparent [&_.sticky]:!bg-rail">
      {venusDeLAnalyse.length > 0 && (
        <div className="px-4 py-2 border-b border-trait text-[11px] text-ardoise">
          Rempli depuis l'analyse : {venusDeLAnalyse.map(([cle, source]) => `${LIBELLES_ANALYSE[cle] || cle} (${source.toLowerCase()})`).join(", ")}.
        </div>
      )}
      {manquants.length > 0 && (
        <div className="px-4 py-2 border-b border-trait flex items-start gap-2 text-[11px] text-menthe/80">
          <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>
            Absent du dossier : {manquants.join(", ")}. Les hypothèses sont à poser à la main dans les
            curseurs — la simulation reste exploitable pour dégrossir.
          </span>
        </div>
      )}

      <div className="flex">
        {/* Rail d'hypothèses : colonne à gauche sur grand écran */}
        {!compact && (
          <aside className="hidden lg:block w-[250px] flex-shrink-0 border-r border-trait">{rail}</aside>
        )}

        <div className="flex-1 w-0 min-w-0">
          {/* Onglets + actions */}
          {/* Au téléphone, les onglets puis les actions, sur deux rangées. */}
          <div className="flex items-center justify-between border-b border-trait px-3 h-10 gap-2 max-md:h-auto max-md:flex-col max-md:items-stretch max-md:gap-0 max-md:pb-2">
            <div className="flex items-center gap-4 h-full overflow-x-auto max-md:h-10">
              {ONGLETS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setOngletActif(o.id); if (o.id !== "scenarios") setNegoPct(0); }}
                  className={`text-xs h-full flex items-center border-b-2 whitespace-nowrap transition-colors ${
                    ongletActif === o.id
                      ? "border-menthe text-encre"
                      : "border-transparent text-ardoise hover:text-craie"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 max-md:flex-wrap">
              <button
                onClick={() => setRailOuvert((o) => !o)}
                className={`${compact ? "" : "lg:hidden "}flex items-center gap-1.5 px-2.5 h-7 max-md:h-8 rounded-full border border-bord text-craie hover:text-encre text-[11px]`}
              >
                <SlidersHorizontal className="w-3 h-3" /> Simulateur
              </button>
              {dealId && (enregistrer.isPending || parametres?.enregistre_le) && (
                <span className="flex items-center gap-1.5 text-[11px] text-ardoise" aria-live="polite">
                  {enregistrer.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 text-menthe" />}
                  {enregistrer.isPending ? "Enregistrement" : "Enregistré"}
                </span>
              )}
            </div>
          </div>

          {/* Rail replié sur petit écran */}
          {railOuvert && <div className={`${compact ? "" : "lg:hidden "}border-b border-trait`}>{rail}</div>}

          <div className="p-3 space-y-3 max-w-full overflow-hidden">
            {negoActive && (
              <div className="text-xs text-menthe bg-menthe/10 border border-menthe/25 rounded-lg px-3 py-2">
                Négociation -{negoPct} % appliquée : les chiffres ci-dessus et le tableau reflètent ce scénario.
              </div>
            )}

            {ongletActif === "scenarios" ? (
              <SimScenarios
                params={{
                  prixBienFAI: etat.prixBienFAI,
                  prixBienNegocieRef: etat.prixBienNegocie,
                  apport,
                  tauxDroitsEnregistrement: etat.tauxDroitsEnregistrement,
                  tauxFeesKlocka: etat.tauxFeesKlocka,
                  feesKlockaType: etat.feesKlockaType,
                  tauxIncentiveKlocka: etat.tauxIncentiveKlocka,
                  fraisDossierBancaire: etat.fraisDossierBancaire,
                  coutCreationSociete: etat.coutCreationSociete,
                  fraisCourtage: etat.fraisCourtage,
                  dureeCredit: etat.dureeCredit,
                  tauxInteret: etat.tauxInteret,
                  loyerInitialHTHC: etat.loyerInitialHTHC,
                  indexation: etat.indexation,
                  anneeRevente: etat.anneeRevente,
                  tauxCommissionAgentRevente: etat.tauxCommissionAgentRevente,
                  rendementBrutAcheteur: etat.rendementBrutAcheteur,
                }}
                formatCurrency={formatCurrency}
                selectedNiveau={negoPct}
                onSelectNiveau={setNegoPct}
              />
            ) : ongletActif === "avance" ? (
              <SimParametresAvances values={values} advanced={advanced} calculs={calculs} formatCurrency={formatCurrency} />
            ) : (
              <>
                {ongletActif !== "revente" && (
                  <SimBudgetDonut calculs={calculs} prixBienNegocie={prixNegocieEffectif} formatCurrency={formatCurrency} />
                )}
                <SimKpiRow calculs={calculs} anneeRevente={etat.anneeRevente} formatCurrency={formatCurrency} />
                {ongletActif === "revente" ? (
                  <SimReventeSynthese calculs={calculs} anneeRevente={etat.anneeRevente} formatCurrency={formatCurrency} />
                ) : (
                  <SimChartCarousel calculs={calculs} anneeRevente={etat.anneeRevente} formatCurrency={formatCurrency} />
                )}
              </>
            )}

            {ongletActif !== "avance" && (
              <SimDataTable calculs={calculs} anneeRevente={etat.anneeRevente} formatCurrency={formatCurrency} dureeCredit={etat.dureeCredit} />
            )}

            <p className="text-[11px] text-brume italic px-1">
              Projection financière : hypothèses par défaut du simulateur là où le dossier est muet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
