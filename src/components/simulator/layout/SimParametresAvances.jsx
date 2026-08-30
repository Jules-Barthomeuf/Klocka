import React, { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import SimSlider from "./SimSlider";

function Card({ title, children }) {
  return (
    <div className="border border-[#1f2228] rounded-md bg-[#0f1114] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#1f2228]">
        <p className="text-[#f2f3f5] text-sm font-medium">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Kpi({ label, value, accent = "text-[#f2f3f5]" }) {
  return (
    <div className="flex-1 px-4 py-3 min-w-0">
      <p className="text-[9px] uppercase tracking-[0.16em] text-[#9298a6] font-medium truncate">{label}</p>
      <p className={`text-lg font-medium tabular-nums mt-1 truncate ${accent}`}>{value}</p>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-[13px] text-[#c9cdd6]">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} className="data-[state=checked]:bg-[#96c0b8] h-4 w-7" />
    </div>
  );
}

export default function SimParametresAvances({ values, advanced, calculs, formatCurrency }) {
  const [vacYear, setVacYear] = useState(1);
  const [vacMois, setVacMois] = useState("");
  const [travauxYear, setTravauxYear] = useState(1);
  const [travauxMontant, setTravauxMontant] = useState("");

  const ind = calculs.indicateurs;
  const nbVacance = advanced.vacancesLocatives.reduce((s, v) => s + (v || 0), 0);
  const totalTravaux = advanced.travauxBailleur.reduce((s, t) => s + (t || 0), 0);

  return (
    <div className="space-y-4">
      {/* Impacts chiffrés */}
      <div className="border border-[#1f2228] rounded-md bg-[#0f1114] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#1f2228]">
          <p className="text-[#f2f3f5] text-sm font-medium">Impact sur les indicateurs</p>
        </div>
        <div className="flex flex-wrap divide-x divide-[#1f2228]">
          <Kpi label="Cash-flow / mois" value={formatCurrency(ind.cashFlowMoyenMois)} />
          <Kpi label="Cash-flow cumulé" value={formatCurrency(ind.cashFlowCumule)} />
          <Kpi label="Création de richesse" value={formatCurrency(ind.creationRichesseBrute)} accent="text-[#96c0b8]" />
          <Kpi label="Rendement net" value={`${ind.rendementLocatifGlobalNet}%`} />
          <Kpi label="Mois de vacance" value={`${nbVacance} mois`} accent={nbVacance > 0 ? "text-[#E8836B]" : "text-[#f2f3f5]"} />
          <Kpi label="Total travaux" value={formatCurrency(totalTravaux)} accent={totalTravaux > 0 ? "text-[#E8836B]" : "text-[#f2f3f5]"} />
        </div>
      </div>

      {/* Renégociation & prêt */}
      <Card title="Financement">
        <div className="space-y-1">
          <ToggleRow label="Prêt in fine" checked={advanced.pretInFine} onChange={advanced.setPretInFine} />
          <ToggleRow label="Renégociation du crédit" checked={advanced.renegociationActive} onChange={advanced.setRenegociationActive} />
          {advanced.renegociationActive && (
            <div className="pt-1">
              <SimSlider label="Année renégociation" value={advanced.anneeRenegociation} onChange={advanced.setAnneeRenegociation} min={1} max={values.dureeCredit || 20} step={1} unit="" />
              <SimSlider label="Nouveau taux" value={advanced.nouveauTauxRenegociation} onChange={advanced.setNouveauTauxRenegociation} min={0} max={10} step={0.1} unit="%" />
              <SimSlider label="IRA (mois)" value={advanced.iraRenegociation} onChange={advanced.setIraRenegociation} min={0} max={12} step={1} unit="" />
            </div>
          )}
        </div>
      </Card>

      {/* Revalorisation */}
      <Card title="Revalorisation du loyer">
        <ToggleRow label="Activer une revalorisation" checked={advanced.revalorisationActive} onChange={advanced.setRevalorisationActive} />
        {advanced.revalorisationActive && (
          <div className="pt-1">
            <SimSlider label="Année de revalorisation" value={advanced.anneeRevalorisation || 1} onChange={advanced.setAnneeRevalorisation} min={1} max={25} step={1} unit="" />
            <SimSlider label="Nouveau loyer HC HT" value={advanced.loyerRevalorise} onChange={advanced.setLoyerRevalorise} min={0} max={200000} step={1000} unit=" €" />
          </div>
        )}
      </Card>

      {/* Vacance locative */}
      <Card title="Vacance locative">
        <div className="flex items-center gap-2">
          <Select value={String(vacYear)} onValueChange={(v) => setVacYear(Number(v))}>
            <SelectTrigger className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228] h-8 text-xs w-20 rounded-md"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#0c0d10] text-[#f2f3f5] border-[#f2f3f5]/[0.1]">
              {Array.from({ length: 25 }, (_, i) => i + 1).map((y) => <SelectItem key={y} value={String(y)}>An {y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min="0" max="12" placeholder="mois" value={vacMois} onChange={(e) => setVacMois(e.target.value)} className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228] h-8 text-xs w-24 rounded-md" />
          <button
            onClick={() => { if (vacMois) { const n = [...advanced.vacancesLocatives]; n[vacYear - 1] = Number(vacMois); advanced.setVacancesLocatives(n); setVacMois(""); } }}
            className="w-8 h-8 rounded-md bg-[#96c0b8] text-black flex items-center justify-center"
          ><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {advanced.vacancesLocatives.map((v, i) => v > 0 && (
            <span key={i} onClick={() => { const n = [...advanced.vacancesLocatives]; n[i] = 0; advanced.setVacancesLocatives(n); }} className="text-[11px] bg-[#96c0b8]/15 text-[#96c0b8] px-2 py-1 rounded cursor-pointer">An {i + 1}: {v}m ✕</span>
          ))}
          {nbVacance === 0 && <span className="text-[11px] text-[#6a7180]">Aucune vacance renseignée</span>}
        </div>
      </Card>

      {/* Travaux bailleur */}
      <Card title="Travaux bailleur">
        <div className="flex items-center gap-2">
          <Select value={String(travauxYear)} onValueChange={(v) => setTravauxYear(Number(v))}>
            <SelectTrigger className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228] h-8 text-xs w-20 rounded-md"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-[#0c0d10] text-[#f2f3f5] border-[#f2f3f5]/[0.1]">
              {Array.from({ length: 25 }, (_, i) => i + 1).map((y) => <SelectItem key={y} value={String(y)}>An {y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="€" value={travauxMontant} onChange={(e) => setTravauxMontant(e.target.value)} className="bg-[#0c0d10] text-[#f2f3f5] border-[#1f2228] h-8 text-xs w-28 rounded-md" />
          <button
            onClick={() => { if (travauxMontant) { const n = [...advanced.travauxBailleur]; n[travauxYear - 1] = Number(travauxMontant); advanced.setTravauxBailleur(n); setTravauxMontant(""); } }}
            className="w-8 h-8 rounded-md bg-[#96c0b8] text-black flex items-center justify-center"
          ><Plus className="w-4 h-4" /></button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {advanced.travauxBailleur.map((t, i) => t > 0 && (
            <span key={i} onClick={() => { const n = [...advanced.travauxBailleur]; n[i] = 0; advanced.setTravauxBailleur(n); }} className="text-[11px] bg-[#96c0b8]/15 text-[#96c0b8] px-2 py-1 rounded cursor-pointer">An {i + 1}: {t.toLocaleString("fr-FR")} € ✕</span>
          ))}
          {totalTravaux === 0 && <span className="text-[11px] text-[#6a7180]">Aucun travaux renseigné</span>}
        </div>
      </Card>
    </div>
  );
}