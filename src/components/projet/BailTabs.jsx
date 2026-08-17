import React, { useState, useMemo } from "react";
import moment from "moment";
import "moment/locale/fr";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus } from "lucide-react";
moment.locale("fr");

const tabStyle = (active) =>
  `px-4 py-2 text-sm transition-all duration-200 border-b-2 ${
    active
      ? "text-white border-[#33d6c0]"
      : "text-gray-500 border-transparent hover:text-gray-300"
  }`;

function InfoCard({ label, value, accent, badge, note, onDelete, showDelete }) {
  if (!value && value !== 0) return null;
  return (
    <div className="bg-gray-800/30 border border-gray-700/40 rounded-md p-4 flex flex-col gap-2 hover:border-gray-600/50 transition-colors relative">
      {showDelete && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="absolute top-2 right-2 h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-400/10"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 uppercase tracking-wider">{label}</span>
        {badge && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
            badge === "preneur" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
            "bg-amber-500/10 text-amber-400 border border-amber-500/20"
          }`}>
            {badge === "preneur" ? "Preneur" : "Bailleur"}
          </span>
        )}
      </div>
      <span className={`text-lg font-semibold leading-tight ${accent || "text-white"}`}>
        {value}
      </span>
      {note && <span className="text-[11px] text-gray-400 leading-tight">{note}</span>}
    </div>
  );
}

function SectionEmpty({ text }) {
  return (
    <div className="text-center py-8">
      <p className="text-gray-500 text-sm">{text}</p>
    </div>
  );
}

const fmt = (v) =>
  v != null
    ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v)
    : null;

const fmtOrZero = (v) => fmt(v != null ? v : 0);

/**
 * Parse l'analyse_bail texte pour extraire les données financières et administratives
 */
function parseNum(str) {
  if (!str) return null;
  return parseFloat(str.replace(/\s/g, '').replace(',', '.'));
}

function parseAnalyseBail(text) {
  if (!text) return {};
  const result = {};

  // --- FINANCIER ---

  // Loyer Actuel (multiple formats)
  const loyerActuelMatch = text.match(/Loyer\s+Actuel\s*(?:net|HT|TTC|HC)?\s*:?\s*([\d\s,.]+)\s*€/i) ||
    text.match(/Loyer\s+actuel\s*(?:annuel)?\s*(?:net|HT|TTC|HC)?\s*:?\s*([\d\s,.]+)\s*€/i);
  if (loyerActuelMatch) {
    result.loyerActuel = parseNum(loyerActuelMatch[1]);
  }

  // Loyer annuel (format alternatif) - essayer si pas encore trouvé
  if (!result.loyerActuel) {
    const loyerAnnuelMatch = text.match(/Loyer\s+(?:annuel|mensuel)\s*(?:HT|TTC|net|HC)?\s*:?\s*([\d\s,.]+)\s*€/i);
    if (loyerAnnuelMatch) {
      const val = parseNum(loyerAnnuelMatch[1]);
      // Si c'est mensuel, multiplier par 12
      result.loyerActuel = /mensuel/i.test(loyerAnnuelMatch[0]) ? val * 12 : val;
    }
  }

  // Loyer Annuel Initial (€ ou F)
  const loyerInitialMatch = text.match(/Loyer\s+(?:Annuel\s+)?Initial\s*(?:HT|TTC)?\s*:?\s*([\d\s,.]+)\s*(?:€|F|euros?|francs?)/i);
  if (loyerInitialMatch) {
    result.loyerInitial = parseNum(loyerInitialMatch[1]);
    result.loyerInitialDevise = /F|francs?/i.test(loyerInitialMatch[0]) ? "F" : "€";
  }

  // Charges / Taxes — format "Charges/Taxes : 75,28 € forfaitaires"
  const chargesMatch = text.match(/Charges?\s*(?:\/\s*Taxes?)?\s*:?\s*([\d\s,.]+)\s*€/i);
  if (chargesMatch) {
    result.charges = parseNum(chargesMatch[1]);
  }

  // Charges forfaitaires — format "75,28 € forfaitaires pour charges locatives"
  const chargesForfMatch = text.match(/([\d\s,.]+)\s*€\s*(?:forfaitaires?|(?:de\s+)?provisions?)\s*(?:pour\s+)?(?:charges?\s*(?:locatives?)?)?/i) ||
    text.match(/(?:forfaitaires?|provisions?)\s+(?:pour\s+)?charges?\s+(?:locatives?)?\s*:?\s*([\d\s,.]+)\s*€/i);
  if (chargesForfMatch) {
    const val = parseNum(chargesForfMatch[1] || chargesForfMatch[2]);
    result.provisionsCharges = val;
    if (!result.charges) result.charges = val;
  }

  // Qui paie les charges - détection élargie
  const preneurRegex = /(?:preneur\s+support|preneur\s+.*charges|charges?\s.*(?:à la charge|incomb|support)\s.*(?:du\s+)?preneur|le\s+preneur\s+(?:supporte|rembourse|prend\s+en\s+charge)|à\s+la\s+charge\s+(?:exclusive\s+)?du\s+preneur)/i;
  const bailleurRegex = /charges?\s.*(?:à la charge|incomb|support)\s.*(?:du\s+)?bailleur/i;
  if (preneurRegex.test(text)) {
    result.chargesRedevable = "preneur";
    if (!result.charges) result.charges = 0;
  } else if (bailleurRegex.test(text)) {
    result.chargesRedevable = "bailleur";
  }

  // Taxe foncière — montant
  const taxeFonciereMatch = text.match(/Taxe\s+foncière\s*:?\s*([\d\s,.]+)\s*€/i) ||
    text.match(/Provision\s+(?:pour\s+)?(?:taxe\s+)?foncière?\s*:?\s*([\d\s,.]+)\s*€/i);
  if (taxeFonciereMatch) {
    result.taxeFonciere = parseNum(taxeFonciereMatch[1]);
  }

  // Taxe foncière remboursée par le preneur
  const foncierPreneurRegex = /(?:rembours|support|prend\s+en\s+charge|à\s+la\s+charge\s+(?:exclusive\s+)?du\s+preneur).*(?:taxe\s+foncière|impôts?\s+fonciers?|taxes?\s+additionnelles)/i;
  const foncierPreneurRegex2 = /(?:taxe\s+foncière|impôts?\s+fonciers?).*(?:rembours|à\s+la\s+charge\s+(?:exclusive\s+)?du\s+preneur|support)/i;
  if (foncierPreneurRegex.test(text) || foncierPreneurRegex2.test(text)) {
    result.foncierPreneur = true;
    if (!result.taxeFonciere) result.taxeFonciere = 0;
  }

  // Dépôt de Garantie (€ ou F)
  const depotMatch = text.match(/Dépôt\s+de\s+Garantie\s*:?\s*([\d\s,.]+)\s*(?:€|F|euros?|francs?)/i) ||
    text.match(/Garantie\s*:?\s*([\d\s,.]+)\s*(?:€|F|euros?|francs?)/i);
  if (depotMatch) {
    result.depotGarantie = parseNum(depotMatch[1]);
    result.depotGarantieDevise = /F|francs?/i.test(depotMatch[0]) ? "F" : "€";
  }

  // Pas de porte
  const pasDePorteMatch = text.match(/Pas\s+de\s+porte\s*:?\s*([\d\s,.]+)\s*€/i);
  if (pasDePorteMatch) {
    result.pasDePorte = parseNum(pasDePorteMatch[1]);
  }

  // Droit d'entrée
  const droitEntreeMatch = text.match(/Droit\s+d['']entr[ée]e\s*:?\s*([\d\s,.]+)\s*€/i);
  if (droitEntreeMatch) {
    result.droitEntree = parseNum(droitEntreeMatch[1]);
  }

  // TVA — format "TVA : 20%" ou "TVA : 20% applicable"
  const tvaMatch = text.match(/TVA\s*:?\s*([\d,.]+)\s*%/i);
  if (tvaMatch) {
    result.tva = tvaMatch[1] + "%";
  } else if (/TVA\s*:?\s*(?:applicable|oui|assujetti)/i.test(text)) {
    result.tva = "20%";
  }

  // Clause pénale
  const clausePenaleMatch = text.match(/Clause\s+[Pp]énale\s*:?\s*([^.]+\.)/i);
  if (clausePenaleMatch) {
    result.clausePenale = clausePenaleMatch[1].trim();
  }

  // --- ADMINISTRATIF ---

  // Durée et dates
  const dureeMatch = text.match(/Durée\s*:?\s*(\d+)\s*an/i);
  if (dureeMatch) {
    result.dureeBail = dureeMatch[1] + " ans";
  }

  // Date début  
  const dateDebutMatch = text.match(/du\s+(\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})\s+au/i) ||
    text.match(/du\s+(\d{1,2}\/\d{2}\/\d{2,4})/i);
  if (dateDebutMatch) {
    result.dateDebut = dateDebutMatch[1].trim();
  }

  // Date échéance
  const dateFinMatch = text.match(/au\s+(\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})/i) ||
    text.match(/au\s+(\d{1,2}\/\d{2}\/\d{2,4})/i);
  if (dateFinMatch) {
    result.dateEcheance = dateFinMatch[1].trim();
  }

  // Type de bail - chercher bail commercial / professionnel
  if (/bail\s+commercial/i.test(text) || /3[\s/]*6[\s/]*9/i.test(text)) {
    result.typeBail = "Bail commercial (3/6/9)";
  } else if (/bail\s+professionnel/i.test(text)) {
    result.typeBail = "Bail professionnel";
  } else if (/bail\s+précaire|bail\s+dérogatoire/i.test(text)) {
    result.typeBail = "Bail dérogatoire (précaire)";
  }

  // Congé triennal
  const congeMatch = text.match(/Congé\s*:?\s*([^.]+\.?)/i);
  if (congeMatch) {
    result.congePeriode = congeMatch[1].trim();
  }

  // Periodicité paiement
  if (/mensuel/i.test(text)) {
    result.periodicitePaiement = "Mensuel";
  } else if (/trimestriel/i.test(text)) {
    result.periodicitePaiement = "Trimestriel";
  } else if (/terme\s+à\s+échoir/i.test(text)) {
    result.periodicitePaiement = "Terme à échoir";
  } else if (/terme\s+échu/i.test(text)) {
    result.periodicitePaiement = "Terme échu";
  }

  // Révision / Indexation
  const revisionMatch = text.match(/R[ée]vision\s*:?\s*([^.]+\.?)/i);
  if (revisionMatch) {
    result.revision = revisionMatch[1].trim();
  }

  // Usage / Destination
  const usageMatch = text.match(/Usage\s+(?:Exclusif|autoris[ée])\s*:?\s*([^.]+\.?)/i);
  if (usageMatch) {
    result.usage = usageMatch[1].trim();
  }

  // Cession / Sous-location
  const cessionMatch = text.match(/Cession\s*:?\s*([^.]+\.?)/i);
  if (cessionMatch) {
    result.cession = cessionMatch[1].trim();
  }

  const sousLocMatch = text.match(/Sous-[Ll]ocation\s*:?\s*([^.]+\.?)/i);
  if (sousLocMatch) {
    result.sousLocation = sousLocMatch[1].trim();
  }

  return result;
}

export default function BailTabs({ project }) {
  const [tab, setTab] = useState("administratif");
  const [adminFields, setAdminFields] = useState(project.bail_admin_fields || []);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldValue, setNewFieldValue] = useState('');
  
  const user = useUser();
  const queryClient = useQueryClient();
  
  const isAdmin = user?.role === "admin";
  const previewClientMode = typeof window !== 'undefined' && localStorage.getItem('previewClientMode') === 'true';
  const showAsAdmin = isAdmin && !previewClientMode;

  const parsed = useMemo(() => parseAnalyseBail(project.analyse_bail), [project.analyse_bail]);

  const handleAddField = async () => {
    if (!newFieldLabel.trim()) return;
    
    const updatedFields = [...adminFields, { label: newFieldLabel, value: newFieldValue }];
    setAdminFields(updatedFields);
    
    try {
      await base44.entities.Project.update(project.id, { bail_admin_fields: updatedFields });
      queryClient.invalidateQueries(['project', project.id]);
      setNewFieldLabel('');
      setNewFieldValue('');
    } catch (error) {
      console.error('Error updating admin fields:', error);
    }
  };
  
  const handleDeleteField = async (index) => {
    const updatedFields = adminFields.filter((_, i) => i !== index);
    setAdminFields(updatedFields);
    
    try {
      await base44.entities.Project.update(project.id, { bail_admin_fields: updatedFields });
      queryClient.invalidateQueries(['project', project.id]);
    } catch (error) {
      console.error('Error deleting field:', error);
    }
  };

  // Helper: pick first positive value from a list
  const pick = (...vals) => vals.find(v => v != null && v > 0) ?? null;

  // Loyer annuel initial: bail fields → simulateur → analyse du bail
  const loyerInitialVal = pick(project.bail_loyer_initial, project.sim_loyer_initial_ht) || parsed.loyerInitial || null;
  const loyerInitialDevise = parsed.loyerInitialDevise || "€";
  const loyerInitial = loyerInitialVal != null
    ? (loyerInitialDevise === "F" ? `${loyerInitialVal.toLocaleString("fr-FR")} F` : fmtOrZero(loyerInitialVal))
    : fmtOrZero(0);

  // Loyer actuel net: bail fields → loyer_annuel_ht → simulateur → analyse du bail
  const loyerActuelNetVal = pick(project.bail_loyer_actuel, project.loyer_annuel_ht, project.sim_loyer_initial_ht) || parsed.loyerActuel || null;
  const loyerActuelNet = loyerActuelNetVal != null ? fmtOrZero(loyerActuelNetVal) : fmtOrZero(0);

  // TVA: simulateur → analyse du bail
  const tvaInfo = project.sim_loyer_soumis_tva ? `Oui (${project.sim_taux_tva || 20}%)` :
    parsed.tva ? `Oui (${parsed.tva})` : "Non";

  // Charges: bail fields → simulateur → analyse du bail
  const chargesVal = pick(project.bail_charges_montant, project.sim_charges_copropriete);
  const chargesFinal = chargesVal != null ? chargesVal : (parsed.charges != null ? parsed.charges : null);
  const chargesMontant = chargesFinal != null ? fmtOrZero(chargesFinal) : fmtOrZero(0);

  const chargesRedevable = project.bail_charges_redevable || parsed.chargesRedevable || null;
  const chargesNote = chargesRedevable === "preneur" ? "À la charge du preneur" :
    chargesRedevable === "bailleur" ? "À la charge du bailleur" : null;

  // Provision foncier: bail fields → simulateur → taxe_fonciere_an → analyse du bail
  const foncierVal = pick(project.bail_taxe_fonciere, project.sim_taxe_fonciere, project.taxe_fonciere_an);
  const foncierFinal = foncierVal != null ? foncierVal : (parsed.taxeFonciere != null ? parsed.taxeFonciere : null);
  const provisionFoncier = foncierFinal != null ? fmtOrZero(foncierFinal) : fmtOrZero(0);
  const foncierNote = parsed.foncierPreneur ? "Remboursée par le preneur" : null;

  // Dépôt de garantie: bail fields → analyse du bail
  const depotVal = pick(project.bail_depot_garantie) || parsed.depotGarantie || null;
  const depotDevise = parsed.depotGarantieDevise || "€";
  const depotGarantie = depotVal != null
    ? (depotDevise === "F" ? `${depotVal.toLocaleString("fr-FR")} F` : fmtOrZero(depotVal))
    : fmtOrZero(0);

  // Valeurs administratives — dates en français
  const fmtDate = (d) => {
    const m = moment(d);
    if (!m.isValid()) return null;
    return m.format("D MMMM YYYY"); // ex: "7 août 2034"
  };

  const dateDebut = project.bail_date_debut ? fmtDate(project.bail_date_debut) :
    parsed.dateDebut || null;

  const dateEcheance = project.bail_date_echeance ? fmtDate(project.bail_date_echeance) :
    project.echeance_bail ? fmtDate(project.echeance_bail) :
    parsed.dateEcheance || null;

  const typeBail = project.bail_type || parsed.typeBail || (parsed.dureeBail ? `${parsed.dureeBail}` : null);

  const periodicitePaiement = project.bail_periodicite_paiement || parsed.periodicitePaiement || null;

  const infosImportantes = project.bail_infos_importantes || null;

  // Infos complémentaires extraites
  const extras = [];
  if (parsed.revision) extras.push({ label: "Révision du loyer", value: parsed.revision });
  if (parsed.tva) extras.push({ label: "TVA applicable", value: parsed.tva });
  if (parsed.clausePenale) extras.push({ label: "Clause pénale", value: parsed.clausePenale });
  if (parsed.congePeriode) extras.push({ label: "Congé", value: parsed.congePeriode });
  if (parsed.usage) extras.push({ label: "Destination des lieux", value: parsed.usage });
  if (parsed.cession) extras.push({ label: "Cession", value: parsed.cession });
  if (parsed.sousLocation) extras.push({ label: "Sous-location", value: parsed.sousLocation });

  const hasAdmin = adminFields.length > 0;
  const hasAnalyse = !!project.analyse_bail;

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-800 mb-6">
        <button className={tabStyle(tab === "administratif")} onClick={() => setTab("administratif")}>Résumé</button>
        <button className={tabStyle(tab === "analyse")} onClick={() => setTab("analyse")}>Analyse du bail</button>
      </div>

      {/* Résumé (Administratif) */}
      {tab === "administratif" && (
        hasAdmin || showAsAdmin ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {adminFields.map((field, index) => (
                <InfoCard 
                  key={index} 
                  label={field.label} 
                  value={field.value}
                  showDelete={showAsAdmin}
                  onDelete={() => handleDeleteField(index)}
                />
              ))}
            </div>
            

          </div>
        ) : (
          <SectionEmpty text="Aucune donnée disponible." />
        )
      )}

      {/* Analyse du bail */}
      {tab === "analyse" && (
        hasAnalyse ? (
          <div className="text-sm text-gray-300 leading-relaxed space-y-4">
            {project.analyse_bail.split(/(\b\d{1,2}\.\s+[A-ZÀ-Ü][^\n]+)/).filter(Boolean).map((section, idx) => {
              const isSectionTitle = /^\d{1,2}\.\s+[A-ZÀ-Ü]/.test(section.trim());
              if (isSectionTitle) {
                return <h4 key={idx} className="text-white font-semibold mt-4 first:mt-0">{section.trim()}</h4>;
              }
              return (
                <div key={idx} className="space-y-1">
                  {section.split("\n").filter((l) => l.trim()).map((line, li) => (
                    <p key={li} className="text-gray-300">{line.trim()}</p>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          <SectionEmpty text="Aucune analyse du bail renseignée." />
        )
      )}
    </div>
  );
}