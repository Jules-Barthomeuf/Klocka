import React, { useMemo, useState } from "react";
import { calculerTableauAnnuel } from "@/components/simulator/CalculFinancier";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TrendingUp } from "lucide-react";

// Simulateur pré-rempli avec les données du dossier.
// Il s'appuie sur le MÊME moteur que la page Simulateur (calculerTableauAnnuel)
// pour qu'un chiffre vu ici ne diffère jamais de la simulation complète.

// Hypothèses de départ, alignées sur les valeurs par défaut du simulateur.
const DEFAUTS = {
  loyerSoumisTVA: false, tauxTVA: 20,
  chargesCoproRefacturables: true, chargesCopropriete: 0,
  taxeFonciereRefacturable: true, taxeFonciere: 0,
  loyerRevalorise: 0, anneeRevalorisation: null, revalorisationActive: false,
  gestionLocative: 0, comptabilite: 600, chargesDiverses: 0, assurancePNE: 400,
  vacancesLocatives: Array(25).fill(0), travauxBailleur: Array(25).fill(0),
  commissionAgentType: "pourcentage", commissionAgentActive: true,
  tauxAssuranceCredit: 0.25, pretInFine: false,
  renegociationActive: false, anneeRenegociation: 10, nouveauTauxRenegociation: 2.5, iraRenegociation: 0,
  indexation: 2, anneeRevente: 20, tauxCommissionAgentRevente: 5, rendementBrutAcheteur: 6.5,
};

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

export default function SimulateurRapide({ parametres, rendementCible = [5, 7] }) {
  const [prixNegocie, setPrixNegocie] = useState(parametres.prixBienNegocie || 0);
  const [apportPct, setApportPct] = useState(15);
  const [tauxInteret, setTauxInteret] = useState(3.7);
  const [dureeCredit, setDureeCredit] = useState(20);

  const resultat = useMemo(() => {
    if (!prixNegocie || !parametres.loyerInitialHTHC) return null;
    // L'apport est exprimé en % du prix de revient : on l'approche d'abord sur
    // le prix négocié, puis on rejoue le calcul avec le prix de revient obtenu.
    const premier = calculerTableauAnnuel({
      ...DEFAUTS, ...parametres,
      prixBienNegocie: prixNegocie, apport: 0, dureeCredit, tauxInteret,
    });
    const apport = Math.round((premier.prixRevient * apportPct) / 100);
    return calculerTableauAnnuel({
      ...DEFAUTS, ...parametres,
      prixBienNegocie: prixNegocie, apport, dureeCredit, tauxInteret,
    });
  }, [parametres, prixNegocie, apportPct, tauxInteret, dureeCredit]);

  if (!resultat) {
    return (
      <p className="text-gray-500 text-sm">
        Simulation indisponible : il manque le prix ou le loyer.
      </p>
    );
  }

  const rendementAem = resultat.prixRevient > 0
    ? (parametres.loyerInitialHTHC / resultat.prixRevient) * 100
    : 0;
  const dansCible = rendementAem >= rendementCible[0] && rendementAem <= rendementCible[1];
  const cashflowMois = resultat.indicateurs.cashFlowMoyenMois;

  return (
    <div className="space-y-5">
      {/* Curseurs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Champ label="Prix négocié" value={prixNegocie} onChange={setPrixNegocie} step={5000} suffixe="€" />
        <Champ label="Apport" value={apportPct} onChange={setApportPct} step={1} suffixe="%" />
        <Champ label="Taux" value={tauxInteret} onChange={setTauxInteret} step={0.1} suffixe="%" />
        <Champ label="Durée" value={dureeCredit} onChange={setDureeCredit} step={1} suffixe="ans" />
      </div>

      {/* Rendement AEM — l'indicateur qui décide */}
      <div className={`rounded-md border p-4 ${dansCible ? "border-[#33d6c0]/40 bg-[#33d6c0]/10" : "border-amber-500/30 bg-amber-500/[0.07]"}`}>
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-gray-400 text-xs mb-1">Rendement AEM</p>
            <p className={`text-3xl font-light ${dansCible ? "text-[#5ee7d4]" : "text-amber-300"}`}>
              {rendementAem.toFixed(2)} %
            </p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 text-xs mb-1">Prix de revient</p>
            <p className="text-white text-xl font-light">{euros(resultat.prixRevient)}</p>
          </div>
        </div>
        <p className={`text-xs mt-2 ${dansCible ? "text-[#5ee7d4]/80" : "text-amber-300/80"}`}>
          {dansCible
            ? `Dans la cible ${rendementCible[0]}–${rendementCible[1]} % AEM.`
            : rendementAem < rendementCible[0]
              ? `Sous la cible : il faudrait négocier autour de ${euros(negocePourCible(parametres.loyerInitialHTHC, rendementCible[1], resultat, prixNegocie))} pour atteindre ${rendementCible[1]} %.`
              : `Au-dessus de la cible ${rendementCible[0]}–${rendementCible[1]} % : à vérifier (risque locatif ?).`}
        </p>
      </div>

      {/* Décomposition du prix de revient */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
        <Ligne label="Prix négocié" valeur={euros(prixNegocie)} />
        <Ligne label="Droits d'enregistrement" valeur={euros(resultat.droitsEnregistrement)} />
        <Ligne label="Honoraires Klocka" valeur={euros(resultat.totalFraisKlocka)} />
        <Ligne label="Frais divers" valeur={euros(resultat.fraisDivers)} />
        <Ligne label="Emprunt" valeur={`${euros(resultat.montantEmprunt)} (${resultat.pourcentageEmprunt} %)`} />
        <Ligne label="Mensualité" valeur={euros(resultat.echeanceMensuelle)} />
      </div>

      {/* Indicateurs de sortie */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        <Kpi label="Cash-flow / mois" valeur={euros(cashflowMois)} positif={cashflowMois >= 0} />
        <Kpi label="Cash-flow cumulé" valeur={euros(resultat.indicateurs.cashFlowCumule)} positif={resultat.indicateurs.cashFlowCumule >= 0} />
        <Kpi label="TRI brut" valeur={`${resultat.indicateurs.triBrut} %`} />
        <Kpi label={`Création richesse ${resultat.indicateurs.nbAnnees} ans`} valeur={euros(resultat.indicateurs.creationRichesseBrute)} positif={resultat.indicateurs.creationRichesseBrute >= 0} />
      </div>

      <p className="text-gray-600 text-[11px]">
        Hypothèses par défaut du simulateur (indexation 2 %, revente à 20 ans, assurance 0,25 %). Ouvrez le
        simulateur complet pour affiner charges, travaux et vacance.
      </p>
    </div>
  );
}

// Prix négocié approximatif pour atteindre un rendement AEM cible : on se sert
// du ratio prix de revient / prix négocié observé sur la simulation courante.
function negocePourCible(loyer, rendementCible, resultat, prixNegocie) {
  if (!loyer || !rendementCible || !resultat?.prixRevient || !prixNegocie) return null;
  const ratio = resultat.prixRevient / prixNegocie;
  return (loyer / (rendementCible / 100)) / ratio;
}

function Champ({ label, value, onChange, step, suffixe }) {
  return (
    <div>
      <Label className="text-gray-400 text-xs mb-1.5 block">
        {label} <span className="text-gray-600">({suffixe})</span>
      </Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="bg-[#101715] border-[#1c2725] text-white h-9"
      />
    </div>
  );
}

function Ligne({ label, valeur }) {
  return (
    <div className="flex justify-between gap-2 border-b border-[#131c1b] py-1.5">
      <span className="text-gray-500 text-xs">{label}</span>
      <span className="text-gray-200 text-xs">{valeur}</span>
    </div>
  );
}

function Kpi({ label, valeur, positif }) {
  return (
    <div className="bg-[#101715]/60 border border-[#16201f] rounded-md px-3 py-2.5">
      <p className="text-gray-500 text-[11px] mb-0.5 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" /> {label}
      </p>
      <p className={`text-sm ${positif === undefined ? "text-white" : positif ? "text-[#5ee7d4]" : "text-red-400"}`}>
        {valeur}
      </p>
    </div>
  );
}
