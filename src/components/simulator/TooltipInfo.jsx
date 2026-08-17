import React from "react";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const tooltipTexts = {
  prixBienFAI: "Prix affiché par l'agent immobilier, incluant ses honoraires (FAI = Frais d'Agence Inclus).",
  surface: "Surface pondérée du bien en m². La surface pondérée prend en compte les différentes qualités des espaces (cave, terrasse, etc.).",
  prixBienNegocie: "Prix final négocié avec le vendeur, incluant toujours les frais d'agence.",
  loyerInitialHTHC: "Loyer annuel hors taxes et hors charges. C'est le loyer de base avant TVA et provisions pour charges.",
  indexation: "Pourcentage annuel d'augmentation du loyer, généralement indexé sur l'ILC (Indice des Loyers Commerciaux).",
  loyerSoumisTVA: "Si activé, le loyer est soumis à la TVA (20%), ce qui permet de récupérer la TVA sur les charges.",
  chargesCopropriete: "Charges annuelles de copropriété (entretien parties communes, syndic, etc.).",
  taxeFonciere: "Taxe foncière annuelle due par le propriétaire.",
  apport: "Montant des fonds propres investis. Le reste sera financé par un crédit bancaire.",
  dureeCredit: "Durée totale du crédit en années. Plus la durée est longue, plus les mensualités sont faibles mais le coût total augmente.",
  tauxInteret: "Taux d'intérêt annuel du crédit bancaire (hors assurance).",
  tauxAssuranceCredit: "Taux annuel de l'assurance emprunteur, calculé sur le capital initial.",
  coutCreationSociete: "Frais de création de la société (SCI, SAS...) pour détenir le bien.",
  fraisDossierBancaire: "Frais de dossier facturés par la banque pour l'obtention du prêt.",
  fraisCourtage: "Honoraires du courtier en crédit immobilier, si vous en utilisez un.",
  comptabilite: "Coût annuel de la comptabilité de la société.",
  assurancePNE: "Assurance Propriétaire Non Exploitant, couvrant les risques liés au bien.",
  gestionLocative: "Pourcentage du loyer versé à une agence pour gérer la location.",
  chargesDiverses: "Autres charges annuelles non catégorisées.",
  anneeRevente: "Année à laquelle vous projetez de revendre le bien.",
  tauxCommissionAgentRevente: "Pourcentage du prix de vente versé à l'agent immobilier lors de la revente.",
  rendementBrutAcheteur: "Rendement brut attendu par un futur acheteur, utilisé pour estimer le prix de revente.",
  prixRevient: "Coût total de l'investissement, incluant le prix d'achat, les frais de notaire, les honoraires et les travaux initiaux.",
  loyerNetMoyen: "Loyer moyen après déduction des charges non récupérables et de la vacance locative.",
  echeanceCredit: "Montant total annuel à verser à la banque (capital + intérêts + assurance).",
  cashFlowNet: "Différence entre les revenus locatifs et toutes les charges (crédit, charges d'exploitation, impôts).",
  prixVenteFAI: "Prix de vente estimé du bien, frais d'agence inclus, basé sur le rendement attendu par l'acheteur.",
  prixReventeNet: "Prix de vente net après déduction des honoraires de l'agent immobilier.",
  capitalRestant: "Capital restant à rembourser à la banque à l'année de revente.",
  cashFlowCumule: "Total des flux de trésorerie accumulés sur toute la période de détention.",
  creationRichesse: "Gain net total = Cash-flow cumulé + Prix de revente net - Apport initial - Capital restant dû.",
  multipleFondsPropres: "Combien de fois votre apport initial a été multiplié grâce à l'investissement.",
  tri: "Taux de Rendement Interne : rendement annuel moyen de l'investissement en tenant compte du temps.",
  rendementGlobal: "Rendement locatif net moyen sur toute la période de détention.",
  enrichissementAn: "Création de richesse moyenne par an (création totale / nombre d'années)."
};

export default function TooltipInfo({ field }) {
  const text = tooltipTexts[field];
  
  if (!text) return null;

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="ml-1.5 text-[#7f9995] hover:text-[#33d6c0] transition-colors">
            <Info className="w-3.5 h-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-[#0a0f0e] text-white border-[#24312f] p-3 text-xs">
          <p>{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}