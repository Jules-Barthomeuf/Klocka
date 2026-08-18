import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Info } from "lucide-react";

function Field({ label, info, children }) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label className="text-[#9aa19e] text-xs">{label}</Label>
        {info && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShow(v => !v)}
              className="text-[#6b7270] hover:text-[#edeae5] transition-colors"
            >
              <Info className="w-3 h-3" />
            </button>
            {show && (
              <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 bg-[#1a1a1a] border border-[#282b2a] rounded-lg p-2.5 text-xs text-[#d3d8d6] shadow-xl">
                {info}
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1a1a] border-r border-b border-[#282b2a] rotate-45 -mt-1" />
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder }) {
  return (
    <Input
      type="number"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
      placeholder={placeholder}
      className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] h-8 text-sm"
    />
  );
}


export default function ProjectFormEnvironnementTab({ formData, setFormData }) {
  const env = formData.env_data || {};

  const update = (key, value) => {
    setFormData({ ...formData, env_data: { ...env, [key]: value } });
  };

  return (
    <div className="space-y-8 mt-4">



      {/* DÉMOGRAPHIE */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b9391] uppercase tracking-wider mb-3">Démographie</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Field label="Population (hab.)" info="Population municipale au dernier recensement INSEE.">
            <NumberInput value={env.population} onChange={(v) => update("population", v)} placeholder="Ex: 45000" />
          </Field>
          <Field label="Évolution pop. 10 ans (%)" info="Variation de la population sur les 10 dernières années. Positif = croissance, négatif = déclin.">
            <NumberInput value={env.evolution_population_10ans} onChange={(v) => update("evolution_population_10ans", v)} placeholder="Ex: +3.2" />
          </Field>
          <Field label="Âge médian (ans)" info="Âge médian des habitants. Un âge médian bas indique une population jeune, favorable à une dynamique économique.">
            <NumberInput value={env.age_median} onChange={(v) => update("age_median", v)} placeholder="Ex: 38" />
          </Field>
          <Field label="% -25 ans" info="Proportion de la population âgée de moins de 25 ans. Indicateur de jeunesse et de dynamisme démographique.">
            <NumberInput value={env.pct_moins_25ans} onChange={(v) => update("pct_moins_25ans", v)} />
          </Field>
          <Field label="% +65 ans" info="Proportion de la population âgée de plus de 65 ans. Indicateur de vieillissement de la population.">
            <NumberInput value={env.pct_plus_65ans} onChange={(v) => update("pct_plus_65ans", v)} />
          </Field>
          <Field label="Densité (hab/km²)" info="Nombre d'habitants par km². Indicateur de concentration urbaine et de pression foncière potentielle.">
            <NumberInput value={env.densite_population} onChange={(v) => update("densite_population", v)} />
          </Field>
          <Field label="Solde migratoire" info="Différence entre les arrivées et les départs de population. Positif = attractivité résidentielle.">
            <NumberInput value={env.solde_migratoire} onChange={(v) => update("solde_migratoire", v)} />
          </Field>
          <Field label="Taux natalité (‰)" info="Nombre de naissances pour 1 000 habitants par an. Indicateur de dynamisme démographique naturel.">
            <NumberInput value={env.taux_natalite} onChange={(v) => update("taux_natalite", v)} />
          </Field>
        </div>
        <Field label="Tendances démographiques (analyse)" info="Analyse qualitative des tendances : croissance, vieillissement, attractivité, profil des habitants…">
          <Textarea value={env.analyse_demographie || ""} onChange={(e) => update("analyse_demographie", e.target.value)} placeholder="Ex: Ville en croissance soutenue grâce à l'attractivité économique, afflux de jeunes actifs..." rows={3} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
        </Field>
      </div>

      {/* POLITIQUE DE LA VILLE (sans orientation politique) */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b9391] uppercase tracking-wider mb-3">Politique de la ville</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Field label="Stabilité politique" info="Stabilité de la gouvernance municipale : ancienneté du maire, majorité confortable, renouvellements récents…">
            <Select value={env.stabilite_politique || "__none__"} onValueChange={(v) => update("stabilite_politique", v === "__none__" ? null : v)}>
              <SelectTrigger className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] h-8 text-sm"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">—</SelectItem>
                <SelectItem value="Très stable">Très stable</SelectItem>
                <SelectItem value="Stable">Stable</SelectItem>
                <SelectItem value="Incertain">Incertain</SelectItem>
                <SelectItem value="Instable">Instable</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Budget invest. annuel (M€)" info="Budget annuel d'investissement de la municipalité. Un budget élevé indique des projets d'infrastructure et une dynamique de développement.">
            <NumberInput value={env.budget_investissement_annuel} onChange={(v) => update("budget_investissement_annuel", v)} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Axes stratégiques de la municipalité" info="Priorités politiques de la ville : urbanisme, mobilité, numérique, environnement, économie… Ces axes influencent le développement du territoire.">
            <Textarea value={env.axes_strategiques_ville || ""} onChange={(e) => update("axes_strategiques_ville", e.target.value)} placeholder="Ex: Rénovation du centre-ville, développement numérique, mobilités douces..." rows={3} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
          <Field label="Politique fiscale locale (taxe foncière, CFE...)" info="Niveau de fiscalité locale : taxe foncière, CFE, taxes d'aménagement. Impacte directement les charges pour les propriétaires et les entreprises.">
            <Textarea value={env.politique_fiscale || ""} onChange={(e) => update("politique_fiscale", e.target.value)} placeholder="Ex: Taxe foncière dans la moyenne nationale, CFE compétitive pour les entreprises..." rows={2} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
        </div>
      </div>

      {/* PROJETS URBAINS */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b9391] uppercase tracking-wider mb-3">Projets urbains & Aménagements</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Field label="Investissement total prévu (M€)" info="Montant total des investissements publics prévus sur le territoire (ANRU, CRTE, Plan de relance, investissements propres…).">
            <NumberInput value={env.projets_investissement_total} onChange={(v) => update("projets_investissement_total", v)} />
          </Field>
          <Field label="Horizon des projets" info="Période couverte par les projets d'aménagement (ex: 2025–2030). Permet d'évaluer la valorisation future du secteur.">
            <Input value={env.projets_horizon || ""} onChange={(e) => update("projets_horizon", e.target.value)} placeholder="Ex: 2025–2030" className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] h-8 text-sm" />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Projets en cours / réalisés" info="Aménagements récemment livrés ou en cours de réalisation : transports, équipements, rénovation urbaine…">
            <Textarea value={env.projets_en_cours || ""} onChange={(e) => update("projets_en_cours", e.target.value)} placeholder="Ex: Réhabilitation du marché couvert (2023), tramway ligne 3 (livraison 2026)..." rows={3} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
          <Field label="Projets à venir / prévus" info="Futurs projets d'aménagement annoncés ou en phase de conception. Ces projets peuvent valoriser significativement le bien.">
            <Textarea value={env.projets_a_venir || ""} onChange={(e) => update("projets_a_venir", e.target.value)} placeholder="Ex: Nouveau quartier d'affaires (2027), zone commerciale Nord (2028)..." rows={3} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
          <Field label="Zones de revitalisation (QPV, ORT, Action Cœur de Ville…)" info="Dispositifs zonés permettant des avantages fiscaux et financiers : QPV (Quartiers Prioritaires), ORT (Opération de Revitalisation), Action Cœur de Ville, ANRU…">
            <Textarea value={env.zones_revitalisation || ""} onChange={(e) => update("zones_revitalisation", e.target.value)} placeholder="Ex: Zone ORT depuis 2022, éligible à la loi Pinel+..." rows={2} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
        </div>
      </div>

      {/* ATTRACTIVITÉ */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b9391] uppercase tracking-wider mb-3">Attractivité & Rayonnement</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
          <Field label="Score attractivité (/100)" info="Score composite évaluant l'attractivité globale de la ville : emploi, services, qualité de vie, accessibilité. 70+ = très attractive.">
            <NumberInput value={env.score_attractivite} onChange={(v) => update("score_attractivite", v)} />
          </Field>
          <Field label="Classement national (ville)" info="Position ou mention dans des classements reconnus : palmares villes dynamiques, qualité de vie, attractivité économique…">
            <Input value={env.classement_national || ""} onChange={(e) => update("classement_national", e.target.value)} placeholder="Ex: Top 20 villes dynamiques" className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] h-8 text-sm" />
          </Field>
          <Field label="Nb. touristes / an" info="Fréquentation touristique annuelle. Indique le rayonnement de la ville et peut soutenir la demande locative courte durée.">
            <NumberInput value={env.nb_touristes_an} onChange={(v) => update("nb_touristes_an", v)} />
          </Field>
          <Field label="Nb. étudiants" info="Population étudiante. Un nombre élevé d'étudiants génère une forte demande locative et une économie de services dynamique.">
            <NumberInput value={env.nb_etudiants} onChange={(v) => update("nb_etudiants", v)} />
          </Field>
          <Field label="Nb. établissements d'enseignement sup." info="Universités, grandes écoles, IUT, BTS... Indicateur du rayonnement académique et de l'attractivité pour les jeunes.">
            <NumberInput value={env.nb_etablissements_sup} onChange={(v) => update("nb_etablissements_sup", v)} />
          </Field>
          <Field label="Nb. hôpitaux / cliniques" info="Nombre d'établissements de santé. Indicateur de l'offre de soins et de l'emploi médical sur le territoire.">
            <NumberInput value={env.nb_hopitaux} onChange={(v) => update("nb_hopitaux", v)} />
          </Field>
        </div>
        <Field label="Points forts de la ville (analyse)" info="Synthèse qualitative des atouts majeurs : situation géographique, tissu économique, desserte, qualité de vie, projets structurants…">
          <Textarea value={env.points_forts_ville || ""} onChange={(e) => update("points_forts_ville", e.target.value)} placeholder="Ex: Ville universitaire dynamique, fort tissu industriel, bonne desserte TGV..." rows={3} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
        </Field>
      </div>

      {/* ÉCONOMIE LOCALE */}
      <div>
        <h3 className="text-sm font-semibold text-[#8b9391] uppercase tracking-wider mb-3">Économie locale</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
          <Field label="Taux de chômage (%)" info="Taux de chômage local (zone d'emploi). < 7% = marché du travail dynamique, > 10% = marché tendu. Source : INSEE / Pôle Emploi.">
            <NumberInput value={env.taux_chomage} onChange={(v) => update("taux_chomage", v)} />
          </Field>
          <Field label="Nb. entreprises" info="Nombre total d'entreprises actives sur la commune (toutes tailles). Indicateur du tissu économique local.">
            <NumberInput value={env.nb_entreprises} onChange={(v) => update("nb_entreprises", v)} />
          </Field>
          <Field label="Créations nettes / an" info="Nombre de créations d'entreprises par an (net des radiations). Un solde positif indique un territoire entrepreneurial dynamique.">
            <NumberInput value={env.creations_entreprises_an} onChange={(v) => update("creations_entreprises_an", v)} />
          </Field>
          <Field label="Taux de vacance commerciale (%)" info="Part des locaux commerciaux vacants en centre-ville. < 8% = marché sain, 8-15% = vigilance, > 15% = fragilité commerciale.">
            <NumberInput value={env.taux_vacance_commerciale} onChange={(v) => update("taux_vacance_commerciale", v)} />
          </Field>
          <Field label="Revenu médian (€/an)" info="Revenu médian annuel des foyers fiscaux de la commune. Indicateur du pouvoir d'achat local et de la solvabilité des locataires.">
            <NumberInput value={env.revenu_median_ville} onChange={(v) => update("revenu_median_ville", v)} />
          </Field>
          <Field label="PIB local / habitant (€)" info="Produit Intérieur Brut par habitant de la zone économique. Indicateur de la richesse produite et du dynamisme économique territorial.">
            <NumberInput value={env.pib_habitant} onChange={(v) => update("pib_habitant", v)} />
          </Field>
        </div>
        <div className="space-y-3">
          <Field label="Principaux secteurs d'activité" info="Secteurs économiques dominants sur le territoire : industrie, services, commerce, tourisme, agriculture, santé…">
            <Textarea value={env.secteurs_activite_dominants || ""} onChange={(e) => update("secteurs_activite_dominants", e.target.value)} placeholder="Ex: Industrie pharmaceutique, logistique, services aux entreprises, tourisme..." rows={2} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
          <Field label="Grands employeurs / entreprises majeures" info="Principaux employeurs locaux avec effectifs. La concentration sur un seul employeur peut représenter un risque (dépendance économique).">
            <Textarea value={env.grands_employeurs || ""} onChange={(e) => update("grands_employeurs", e.target.value)} placeholder="Ex: Michelin (3 000 emplois), CHU (2 500 emplois), Amazon Logistics (800 emplois)..." rows={2} className="bg-[#edeae5]/[0.03] text-[#edeae5] border-[#242726] text-sm" />
          </Field>
        </div>
      </div>

    </div>
  );
}