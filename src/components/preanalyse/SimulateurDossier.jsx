import React, { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, SlidersHorizontal, AlertTriangle } from "lucide-react";
import { calculerTableauAnnuel } from "@/components/simulator/CalculFinancier";
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
  tauxInteret: 3.7,
  tauxAssuranceCredit: 0.25,
  pretInFine: false,
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
export default function SimulateurDossier({ parametres, rendementCible = [5, 7], compact = false }) {
  const [etat, setEtat] = useState(() => etatInitial(parametres));
  // Tableaux annuels : hors CHAMPS car ils ne viennent jamais du dossier.
  const [vacancesLocatives, setVacancesLocatives] = useState(() => Array(25).fill(0));
  const [travauxBailleur, setTravauxBailleur] = useState(() => Array(25).fill(0));
  const [apport, setApport] = useState(0);
  const [ongletActif, setOngletActif] = useState("graphiques");
  const [negoPct, setNegoPct] = useState(0);
  const [railOuvert, setRailOuvert] = useState(false);
  // Tant que l'apport n'a pas été touché, il suit les 15 % du prix de revient.
  const apportTouche = useRef(false);

  // Le dossier change (autre lot, réanalyse) : on repart de ses chiffres.
  const signature = JSON.stringify(parametres || {});
  useEffect(() => {
    setEtat(etatInitial(parametres));
    setVacancesLocatives(Array(25).fill(0));
    setTravauxBailleur(Array(25).fill(0));
    setNegoPct(0);
    apportTouche.current = false;
  }, [signature]);

  const maj = (cle, valeur) => {
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

  const reinitialiser = () => {
    setEtat(etatInitial(parametres));
    setVacancesLocatives(Array(25).fill(0));
    setTravauxBailleur(Array(25).fill(0));
    setNegoPct(0);
    apportTouche.current = false;
  };

  // Rendement AEM : le loyer sur le prix de revient, recalculé à chaque curseur.
  const rendementAem = calculs.prixRevient > 0 ? (etat.loyerInitialHTHC / calculs.prixRevient) * 100 : 0;
  const dansCible = rendementAem >= rendementCible[0] && rendementAem <= rendementCible[1];

  // Données manquantes : on ne bloque pas, on signale ce qui est à poser à la main.
  const manquants = [
    !etat.prixBienFAI && "prix FAI",
    !etat.loyerInitialHTHC && "loyer annuel",
    !etat.surface && "surface",
  ].filter(Boolean);

  const rail = (
    <SimControlRail
      values={values}
      onChange={maj}
      calculs={calculs}
      formatCurrency={formatCurrency}
      advanced={advanced}
      activeTab={ongletActif}
      afficherScenario={false}
      titre="Hypothèses"
    />
  );

  return (
    <div className="border border-[#1f2228] rounded-md overflow-hidden bg-[#000000]">
      {/* Bandeau de décision : rendement AEM live + prix de revient */}
      <div className={`px-4 py-3 border-b ${dansCible ? "border-[#96c0b8]/40 bg-[#96c0b8]/10" : "border-[#96c0b8]/30 bg-[#96c0b8]/[0.07]"}`}>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <p className="text-[#9298a6] text-xs mb-0.5">Rendement AEM</p>
            <p className={`text-2xl font-light ${dansCible ? "text-[#c3ddd6]" : "text-[#96c0b8]"}`}>
              {rendementAem.toFixed(2)} %
            </p>
          </div>
          <div>
            <p className="text-[#9298a6] text-xs mb-0.5">Prix de revient</p>
            <p className="text-[#f2f3f5] text-lg font-light">{formatCurrency(calculs.prixRevient)}</p>
          </div>
          <div>
            <p className="text-[#9298a6] text-xs mb-0.5">Cash-flow / mois</p>
            <p className={`text-lg font-light ${calculs.indicateurs.cashFlowMoyenMois >= 0 ? "text-[#c3ddd6]" : "text-red-400"}`}>
              {formatCurrency(calculs.indicateurs.cashFlowMoyenMois)}
            </p>
          </div>
          <p className={`text-xs max-w-md ${dansCible ? "text-[#c3ddd6]/80" : "text-[#96c0b8]/80"}`}>
            {dansCible
              ? `Dans la cible ${rendementCible[0]}–${rendementCible[1]} % AEM.`
              : rendementAem < rendementCible[0]
                ? `Sous la cible ${rendementCible[0]}–${rendementCible[1]} % : jouez sur le prix négocié pour voir ce qu'il faudrait obtenir.`
                : `Au-dessus de la cible ${rendementCible[0]}–${rendementCible[1]} % : à vérifier (risque locatif ?).`}
          </p>
        </div>
      </div>

      {manquants.length > 0 && (
        <div className="px-4 py-2 border-b border-[#1f2228] flex items-start gap-2 text-[11px] text-[#96c0b8]/80">
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
          <aside className="hidden lg:block w-[250px] flex-shrink-0 border-r border-[#1f2228]">{rail}</aside>
        )}

        <div className="flex-1 w-0 min-w-0">
          {/* Onglets + actions */}
          <div className="flex items-center justify-between border-b border-[#1f2228] px-3 h-10 gap-2">
            <div className="flex items-center gap-4 h-full overflow-x-auto">
              {ONGLETS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setOngletActif(o.id); if (o.id !== "scenarios") setNegoPct(0); }}
                  className={`text-xs h-full flex items-center border-b-2 whitespace-nowrap transition-colors ${
                    ongletActif === o.id
                      ? "border-[#96c0b8] text-[#f2f3f5]"
                      : "border-transparent text-[#9298a6] hover:text-[#c9cdd6]"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setRailOuvert((o) => !o)}
                className={`${compact ? "" : "lg:hidden "}flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-[#22262d] text-[#c9cdd6] hover:text-[#f2f3f5] text-[11px]`}
              >
                <SlidersHorizontal className="w-3 h-3" /> Hypothèses
              </button>
              <button
                onClick={reinitialiser}
                className="flex items-center gap-1.5 px-2.5 h-7 rounded-full border border-[#22262d] text-[#c9cdd6] hover:text-[#f2f3f5] text-[11px]"
              >
                <RefreshCw className="w-3 h-3" /> Dossier
              </button>
            </div>
          </div>

          {/* Rail replié sur petit écran */}
          {railOuvert && <div className={`${compact ? "" : "lg:hidden "}border-b border-[#1f2228]`}>{rail}</div>}

          <div className="p-3 space-y-3 max-w-full overflow-hidden">
            {negoActive && (
              <div className="text-xs text-[#96c0b8] bg-[#96c0b8]/10 border border-[#96c0b8]/25 rounded-lg px-3 py-2">
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

            <p className="text-[10px] text-[#6a7180] italic px-1">
              Projection financière : hypothèses par défaut du simulateur là où le dossier est muet.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
