import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import SimSlider from "./SimSlider";

function SectionHeader({ title, open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-[#8b9391] font-medium pt-3 pb-1 hover:text-[#d3d8d6] transition-colors"
    >
      <span>{title}</span>
      <ChevronDown className={`w-3 h-3 transition-transform ${open ? "" : "-rotate-90"}`} />
    </button>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[12px] text-[#9aa19e]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#35a79b] h-4 w-7" />
    </div>
  );
}

export default function SimControlRail({ projects = [], selectedProjectId, onSelectProject, values, onChange, calculs, formatCurrency, advanced, activeTab, afficherScenario = true, titre = "Simulateur" }) {
  const [openSections, setOpenSections] = useState({});
  const toggleSection = (title) => setOpenSections((prev) => ({ ...prev, [title]: prev[title] === undefined ? false : !prev[title] }));
  const isOpen = (title) => openSections[title] !== false;

  const projectLocked = selectedProjectId && selectedProjectId !== "default";

  const acquisitionMainItems = [
    { key: "prixBienNegocie", label: "Prix négocié FAI", min: 50000, max: 2000000, step: 10000, unit: " €" },
    { key: "loyerInitialHTHC", label: "Loyer initial HC HT", min: 0, max: 100000, step: 1000, unit: " €", disabled: projectLocked },
    { key: "apport", label: "Apport", min: 0, max: 500000, step: 5000, unit: " €" },
    { key: "dureeCredit", label: "Durée crédit", min: 5, max: 30, step: 1, unit: " ans" },
    { key: "tauxInteret", label: "Taux intérêt", min: 0, max: 10, step: 0.1, unit: "%" },
    { key: "anneeRevente", label: "Année de revente", min: 1, max: 25, step: 1, unit: " ans" },
  ];

  const reventeMainItems = [
    { key: "anneeRevente", label: "Année de revente", min: 1, max: 25, step: 1, unit: " ans" },
    { key: "rendementBrutAcheteur", label: "Rendement brut acquéreur", min: 3, max: 12, step: 0.1, unit: "%" },
    { key: "tauxCommissionAgentRevente", label: "Honoraire agent revente TTC", min: 0, max: 10, step: 0.5, unit: "%" },
    { key: "indexation", label: "Indexation loyers", min: 0, max: 10, step: 0.1, unit: "%" },
    { key: "loyerInitialHTHC", label: "Loyer initial HC HT", min: 0, max: 100000, step: 1000, unit: " €", disabled: projectLocked },
  ];

  const isRevente = activeTab === "revente";

  const groups = [
    {
      title: "ACQUISITION",
      items: [
        { key: "prixBienFAI", label: "Prix FAI", min: 50000, max: 2000000, step: 10000, unit: " €", disabled: projectLocked },
        { key: "surface", label: "Surface pondérée", min: 10, max: 500, step: 1, unit: " m²", disabled: projectLocked },
        { key: "prixBienNegocie", label: "Prix négocié FAI", min: 50000, max: 2000000, step: 10000, unit: " €" },
      ],
    },
    {
      title: "LOCATION",
      items: [
        { key: "loyerInitialHTHC", label: "Loyer initial HC HT", min: 0, max: 100000, step: 1000, unit: " €", disabled: projectLocked },
        { key: "indexation", label: "Indexation loyers", min: 0, max: 10, step: 0.1, unit: "%" },
        { key: "chargesCopropriete", label: "Charges copro", min: 0, max: 10000, step: 100, unit: " €" },
        { key: "taxeFonciere", label: "Taxe foncière", min: 0, max: 10000, step: 100, unit: " €" },
      ],
    },
    {
      title: "FINANCEMENT",
      items: [
        { key: "apport", label: "Apport", min: 0, max: 500000, step: 5000, unit: " €" },
        { key: "dureeCredit", label: "Durée crédit", min: 5, max: 30, step: 1, unit: " ans" },
        { key: "tauxInteret", label: "Taux intérêt", min: 0, max: 10, step: 0.1, unit: "%" },
        { key: "tauxAssuranceCredit", label: "Taux assurance", min: 0, max: 2, step: 0.05, unit: "%" },
      ],
    },
    {
      title: "FRAIS & CHARGES",
      items: [
        { key: "coutCreationSociete", label: "Frais de création de société", min: 0, max: 20000, step: 100, unit: " €" },
        { key: "fraisDossierBancaire", label: "Frais de dossier bancaire", min: 0, max: 20000, step: 100, unit: " €" },
        { key: "fraisCourtage", label: "Frais de courtage", min: 0, max: 30000, step: 100, unit: " €" },
        { key: "comptabilite", label: "Comptabilité annuelle", min: 0, max: 10000, step: 100, unit: " €" },
        { key: "assurancePNE", label: "Assurance PNE", min: 0, max: 10000, step: 100, unit: " €" },
        { key: "gestionLocative", label: "Gestion locative (% HT du loyer)", min: 0, max: 15, step: 0.5, unit: "%" },
        { key: "chargesDiverses", label: "Charges diverses", min: 0, max: 20000, step: 100, unit: " €" },
      ],
    },
    {
      title: "REVENTE",
      items: [
        { key: "anneeRevente", label: "Année de revente", min: 1, max: 25, step: 1, unit: " ans" },
        { key: "tauxCommissionAgentRevente", label: "Honoraire agent revente TTC", min: 0, max: 10, step: 0.5, unit: "%" },
        { key: "rendementBrutAcheteur", label: "Rendement brut acquéreur", min: 3, max: 12, step: 0.1, unit: "%" },
      ],
    },
  ];

  return (
    <div className="flex flex-col h-full bg-[#0e100f] border-r border-[#282b2a]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-11 border-b border-[#242726] flex-shrink-0">
        <div className="w-5 h-5 rounded bg-[#35a79b]/15 flex items-center justify-center">
          <div className="w-2 h-2 rounded-sm bg-[#35a79b]" />
        </div>
        <span className="text-[#edeae5] text-sm font-medium">{titre}</span>
      </div>

      {/* Scenario select */}
      {afficherScenario ? (
      <div className="px-3 pt-3 pb-2 border-b border-[#242726]">
        <p className="text-[9px] uppercase tracking-[0.18em] text-[#6b7270] font-medium mb-1.5">Scénario</p>
        <Select value={selectedProjectId || "default"} onValueChange={onSelectProject}>
          <SelectTrigger className="bg-[#161616] text-[#edeae5] border-[#282b2a] h-8 text-xs rounded-md">
            <SelectValue placeholder="Mode par défaut" />
          </SelectTrigger>
          <SelectContent className="bg-[#161616] text-[#edeae5] border-[#edeae5]/[0.1]">
            <SelectItem value="default">Mode par défaut</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.titre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {calculs && (
          <p className="text-[10px] text-[#6b7270] mt-1.5">Prix de revient {formatCurrency(calculs.prixRevient)}</p>
        )}
      </div>
      ) : (
        calculs && (
          <div className="px-3 pt-3 pb-2 border-b border-[#242726]">
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#6b7270] font-medium mb-1.5">Prix de revient</p>
            <p className="text-[#edeae5] text-sm">{formatCurrency(calculs.prixRevient)}</p>
          </div>
        )
      )}

      {/* Sliders */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {/* Champs principaux - non repliable */}
        <div className="mt-3 rounded-lg border border-[#e0c9a0]/40 bg-[#e0c9a0]/[0.06] p-2.5">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#e0c9a0] font-semibold pb-1">Champs principaux</p>
          {acquisitionMainItems.map((it) => (
            <SimSlider
              key={it.key}
              label={it.label}
              value={values[it.key] ?? 0}
              onChange={(v) => onChange(it.key, v)}
              min={it.min}
              max={it.max}
              step={it.step}
              unit={it.unit}
              disabled={it.disabled}
            />
          ))}
        </div>

        {/* Champs revente - affichés uniquement sur l'onglet revente, sous les champs principaux */}
        <AnimatePresence initial={false}>
          {isRevente && (
            <motion.div
              key="revente-fields"
              initial={{ opacity: 0, height: 0, y: -8 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -8 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className="mt-3 rounded-lg border border-[#35a79b]/40 bg-[#35a79b]/[0.06] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.18em] text-[#35a79b] font-semibold pb-1">Champs revente</p>
                {reventeMainItems.map((it) => (
                  <SimSlider
                    key={it.key}
                    label={it.label}
                    value={values[it.key] ?? 0}
                    onChange={(v) => onChange(it.key, v)}
                    min={it.min}
                    max={it.max}
                    step={it.step}
                    unit={it.unit}
                    disabled={it.disabled}
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {groups.map((g) => (
          <div key={g.title}>
            <SectionHeader title={g.title} open={isOpen(g.title)} onToggle={() => toggleSection(g.title)} />
            {isOpen(g.title) && g.items.map((it) => (
              <SimSlider
                key={it.key}
                label={it.label}
                value={values[it.key] ?? 0}
                onChange={(v) => onChange(it.key, v)}
                min={it.min}
                max={it.max}
                step={it.step}
                unit={it.unit}
                disabled={it.disabled}
              />
            ))}
            {isOpen(g.title) && g.title === "LOCATION" && (
              <div className="mt-1 space-y-0">
                <ToggleRow label="Loyer soumis TVA" checked={advanced.loyerSoumisTVA} onChange={advanced.setLoyerSoumisTVA} />
                <ToggleRow label="Charges refacturables" checked={advanced.chargesCoproRefacturables} onChange={advanced.setChargesCoproRefacturables} />
                <ToggleRow label="Taxe foncière refact." checked={advanced.taxeFonciereRefacturable} onChange={advanced.setTaxeFonciereRefacturable} />
                <ToggleRow label="Revalorisation" checked={advanced.revalorisationActive} onChange={advanced.setRevalorisationActive} />
                {advanced.revalorisationActive && (
                  <>
                    <SimSlider label="Année revalorisation" value={advanced.anneeRevalorisation || 1} onChange={advanced.setAnneeRevalorisation} min={1} max={25} step={1} unit="" />
                    <SimSlider label="Loyer revalorisé" value={advanced.loyerRevalorise} onChange={advanced.setLoyerRevalorise} min={0} max={200000} step={1000} unit=" €" />
                  </>
                )}
              </div>
            )}
            {isOpen(g.title) && g.title === "FINANCEMENT" && (
              <div className="mt-1 space-y-0">
                <ToggleRow label="Prêt in fine" checked={advanced.pretInFine} onChange={advanced.setPretInFine} />
                <ToggleRow label="Renégociation" checked={advanced.renegociationActive} onChange={advanced.setRenegociationActive} />
                {advanced.renegociationActive && (
                  <>
                    <SimSlider label="Année renégociation" value={advanced.anneeRenegociation} onChange={advanced.setAnneeRenegociation} min={1} max={values.dureeCredit || 20} step={1} unit="" />
                    <SimSlider label="Nouveau taux" value={advanced.nouveauTauxRenegociation} onChange={advanced.setNouveauTauxRenegociation} min={0} max={10} step={0.1} unit="%" />
                    <SimSlider label="IRA (mois)" value={advanced.iraRenegociation} onChange={advanced.setIraRenegociation} min={0} max={12} step={1} unit="" />
                  </>
                )}
              </div>
            )}
            {isOpen(g.title) && g.title === "LOCATION" && values.loyerInitialHTHC > 0 && values.surface > 0 && (
              <p className="text-[10px] text-[#6b7270] -mt-0.5">{Math.round(values.loyerInitialHTHC / values.surface)} €/m²/an</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}