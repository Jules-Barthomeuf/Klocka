import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useUser } from "@/components/providers/UserProvider";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp, ChevronDown, BarChart3, MapPin, TrendingUp, Table2, Gauge, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import CompareProjectSelector from "../components/comparateur/CompareProjectSelector";
import CompareKPICard from "../components/comparateur/CompareKPICard";
import CompareSummaryTable from "../components/comparateur/CompareSummaryTable";
import { RichesseChart, CashflowChart, CashflowCumuleChart, LoyerEvolutionChart, RendementCompareChart } from "../components/comparateur/CompareCharts";
import CompareMap from "../components/comparateur/CompareMap";
import InfoTooltip from "../components/comparateur/InfoTooltip";
import CompareCompatibilite from "../components/comparateur/CompareCompatibilite";
import { calculateProjectMetrics } from "../components/comparateur/ComparateurCalcul";

const TABS = [
  { id: "compatibilite", label: "Mon profil", icon: UserCheck },
  { id: "kpis", label: "Indicateurs", icon: Gauge },
  { id: "carte", label: "Carte", icon: MapPin },
  { id: "graphiques", label: "Graphiques", icon: TrendingUp },
  { id: "tableau", label: "Récapitulatif", icon: Table2 },
];

export default function Comparateur() {
  const user = useUser();
  const [selectedIds, setSelectedIds] = useState([]);
  const [showSelector, setShowSelector] = useState(true);
  const [activeTab, setActiveTab] = useState("compatibilite");

  // Gérer la présélection depuis l'URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const preselect = urlParams.get('preselect');
    if (preselect && !selectedIds.includes(preselect)) {
      setSelectedIds([preselect]);
      setShowSelector(true);
    }
  }, []);

  // Fetch user strategy
  const { data: strategies = [] } = useQuery({
    queryKey: ["comparateur-strategies", user?.email],
    queryFn: () => base44.entities.Strategy.list(),
    enabled: !!user,
    initialData: [],
  });

  const userStrategy = useMemo(() => {
    if (!user) return null;
    const emailToCheck = user.est_compte_shadow && user.compte_maitre_email
      ? user.compte_maitre_email
      : user.email;
    return strategies.find(s => s.client_email === emailToCheck || s.client_email === user.email) || null;
  }, [strategies, user]);

  const userProfil = user?.profil_investisseur || null;
  const budgetMax = userStrategy?.budget_max || 0;

  const { data: projects = [] } = useQuery({
    queryKey: ["comparateur-projects", user?.email, user?.compte_maitre_email],
    queryFn: async () => {
      if (!user) return [];
      const emailToCheck = user.est_compte_shadow && user.compte_maitre_email
        ? user.compte_maitre_email
        : user.email;
      const isAdmin = user.role === "admin";
      const allProjects = await base44.entities.Project.list();
      if (isAdmin) return allProjects;
      return allProjects.filter(
        (p) =>
          p.client_email === emailToCheck ||
          (p.client_emails && p.client_emails.includes(emailToCheck)) ||
          p.client_email === user.email ||
          (p.client_emails && p.client_emails.includes(user.email))
      );
    },
    enabled: !!user,
    initialData: [],
  });

  const toggleProject = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const metrics = useMemo(() => {
    return selectedIds
      .map((id) => projects.find((p) => p.id === id))
      .filter(Boolean)
      .map(calculateProjectMetrics);
  }, [selectedIds, projects]);

  const projectNames = metrics.map((m) => m.titre);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5]">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="mb-2">
            <p className="text-[#8fa0f2] uppercase tracking-[0.3em] text-[10px] font-medium">Comparateur</p>
            <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">Comparer mes projets</h1>
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-[#f2f3f5]/30 text-sm">
              Sélectionnez 2 à 4 projets pour les comparer côte à côte.
              {selectedIds.length > 0 && <span className="text-[#f2f3f5]/50 ml-2">({selectedIds.length} sélectionné{selectedIds.length > 1 ? "s" : ""})</span>}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSelector(!showSelector)}
              className="text-[#f2f3f5]/40 hover:text-[#f2f3f5] hover:bg-[#f2f3f5]/10 gap-1.5"
            >
              {showSelector ? "Masquer" : "Afficher"} les projets
              {showSelector ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>

          {/* Sélecteur de projets */}
          <AnimatePresence>
            {showSelector && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <CompareProjectSelector
                  projects={projects}
                  selectedIds={selectedIds}
                  onToggle={toggleProject}
                 
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Résultats comparaison */}
        {metrics.length >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-10"
          >
            {/* Onglets */}
            <div className="flex gap-1 border-b border-[#1f2228] mb-8 overflow-x-auto">
              {TABS.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 whitespace-nowrap ${
                      isActive
                        ? "text-[#8fa0f2] border-[#8fa0f2]"
                        : "text-[#f2f3f5]/30 border-transparent hover:text-[#f2f3f5]/60"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Contenu onglet: Compatibilité profil */}
            {activeTab === "compatibilite" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <CompareCompatibilite metrics={metrics} userProfil={userProfil} budgetMax={budgetMax} />
              </motion.div>
            )}

            {/* Contenu onglet: Indicateurs */}
            {activeTab === "kpis" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <CompareKPICard label="Prix de revient" values={metrics.map(m => m.prixRevient)} projectNames={projectNames} higherIsBetter={false} tooltip="Coût total d'acquisition incluant le prix négocié, les droits d'enregistrement, les honoraires et les frais divers." />
                  <CompareKPICard label="Rendement locatif global" values={metrics.map(m => m.rendementLocatifGlobal)} projectNames={projectNames} format="percent" tooltip="Performance annualisée totale de l'investissement rapportée à l'apport, incluant les loyers, les charges et la plus-value à la revente." />
                  <CompareKPICard label="Apport" values={metrics.map(m => m.apport)} projectNames={projectNames} format="currency" higherIsBetter={false} tooltip="Montant investi en fonds propres, fixé à 15% du prix de revient par défaut." />
                  <CompareKPICard label="Récupération apport" values={metrics.map(m => m.anneeRecuperationApport)} projectNames={projectNames} format="year" higherIsBetter={false} tooltip="Nombre d'années nécessaires pour récupérer votre apport grâce au cashflow et au capital remboursé." />
                  <CompareKPICard label="Cashflow cumulé" values={metrics.map(m => m.cashFlowCumule)} projectNames={projectNames} tooltip="Somme de tous les flux de trésorerie nets depuis l'acquisition jusqu'à la revente." />
                  <CompareKPICard label="Création de richesse" values={metrics.map(m => m.creationRichesse)} projectNames={projectNames} tooltip="Richesse nette créée = cashflow cumulé + prix de vente net - apport - capital restant dû. C'est le gain total de l'opération." />
                  <CompareKPICard label="Loyer annuel" values={metrics.map(m => m.loyerAnnuel)} projectNames={projectNames} tooltip="Loyer annuel initial HT perçu, avant indexation." />
                  <CompareKPICard label="Multiple fonds propres" values={metrics.map(m => m.multipleFondsPropres)} projectNames={projectNames} format="text" tooltip="Rapport entre la richesse créée et l'apport investi. Un multiple de 2x signifie que vous avez doublé votre mise." />
                  <CompareKPICard label="Ancienneté locataire" values={metrics.map(m => m.ancienneteLocataire)} projectNames={projectNames} format="years" tooltip="Durée depuis laquelle le locataire est en place. Une ancienneté élevée est un signe de stabilité." />
                  <CompareKPICard label="Échéance bail" values={metrics.map(m => m.echeanceBail)} projectNames={projectNames} format="date" higherIsBetter={false} tooltip="Date de fin du bail en cours. Une échéance lointaine sécurise les revenus locatifs." />
                </div>
              </motion.div>
            )}

            {/* Contenu onglet: Carte */}
            {activeTab === "carte" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <CompareMap metrics={metrics} />
              </motion.div>
            )}

            {/* Contenu onglet: Graphiques */}
            {activeTab === "graphiques" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-4">
                <RendementCompareChart metrics={metrics} />
                <RichesseChart metrics={metrics} />
                <LoyerEvolutionChart metrics={metrics} />
                <CashflowChart metrics={metrics} />
                <CashflowCumuleChart metrics={metrics} />
              </motion.div>
            )}

            {/* Contenu onglet: Récapitulatif */}
            {activeTab === "tableau" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
                <div className="flex items-center mb-4">
                  <InfoTooltip text="Synthèse de tous les indicateurs clés pour chaque projet. Les valeurs sont calculées sur la durée de détention définie dans la simulation de chaque projet." />
                </div>
                <CompareSummaryTable metrics={metrics} />
              </motion.div>
            )}
          </motion.div>
        )}

        {/* Message si < 2 projets sélectionnés */}
        {metrics.length < 2 && selectedIds.length > 0 && (
          <div className="mt-10 text-center py-12 bg-[#000000] rounded-md border border-[#1f2228]">
            <p className="text-[#f2f3f5]/30 text-sm">Sélectionnez au moins 2 projets pour voir la comparaison.</p>
          </div>
        )}
      </div>
    </div>
  );
}