import React from "react";
import { Plus, X } from "lucide-react";
import MarcheCases from "./MarcheCases";
import SecteurTextes from "./SecteurTextes";
import { FField, FInput, FTextarea } from "./FormField";

// Le panneau du marché : la même structure que l'onglet Marché de la page.
//
// La ville d'abord (où l'on est, combien de gens, quel revenu), le secteur
// ensuite (ce qu'il faut en savoir, puis les chiffres du résidentiel et du
// commercial), les notes pour finir. Secteur et Marché étaient deux onglets
// quand la page en avait deux ; elle n'en a plus qu'un, le panneau non plus.

const Titre = ({ children }) => (
  <div className="text-[11px] uppercase tracking-[.16em] text-ardoise">{children}</div>
);

/**
 * Les notes de l'onglet, d'où qu'elles viennent. L'ancien onglet Secteur avait
 * les siennes ; la page les affiche déjà à la suite de celles du marché. On les
 * édite ensemble et tout repart dans `notes_marche` : une seule liste, à la fin.
 */
function Notes({ formData, setFormData }) {
  const liste = [...(formData.notes_secteur || []), ...(formData.notes_marche || [])];
  const ecrire = (suite) => setFormData({ ...formData, notes_marche: suite, notes_secteur: [] });

  return (
    <div className="space-y-3 pt-5 border-t border-trait">
      <div className="flex items-center justify-between">
        <Titre>Notes</Titre>
        <button
          type="button"
          onClick={() => ecrire([...liste, { titre: "", contenu: "" }])}
          className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3 py-1.5 text-[12px] text-craie hover:text-encre hover:border-bord-vif transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Ajouter une note
        </button>
      </div>
      {liste.map((note, idx) => (
        <div key={idx} className="rounded-[12px] border border-trait bg-surface p-3.5 space-y-2.5">
          <div className="flex items-center gap-2.5">
            <FField className="flex-1 !border-0 !bg-transparent !p-0">
              <FInput
                value={note.titre || ""}
                placeholder="Titre"
                onChange={(e) => ecrire(liste.map((n, i) => (i === idx ? { ...n, titre: e.target.value } : n)))}
              />
            </FField>
            <button
              type="button"
              onClick={() => ecrire(liste.filter((_, i) => i !== idx))}
              aria-label="Retirer cette note"
              className="text-[15px] leading-none text-ardoise hover:text-alerte"
              style={{ background: "transparent" }}
            >
              ×
            </button>
          </div>
          <FTextarea
            rows={3}
            value={note.contenu || ""}
            placeholder="Contenu"
            onChange={(e) => ecrire(liste.map((n, i) => (i === idx ? { ...n, contenu: e.target.value } : n)))}
            className="!text-[13.5px]"
          />
        </div>
      ))}
      {!liste.length && <p className="m-0 text-[12.5px] text-brume">Aucune note. La page n&apos;en affiche aucune.</p>}
    </div>
  );
}

export default function ProjectFormMarcheTab({ formData, setFormData, projetId = null }) {
  const texte = (champ) => (e) => setFormData({ ...formData, [champ]: e.target.value });
  const nombre = (champ) => (e) => setFormData({ ...formData, [champ]: e.target.value === "" ? null : parseFloat(e.target.value) });

  return (
    <div className="mt-6 space-y-6">
      <div className="space-y-3">
        <Titre>La ville</Titre>
        <div className="grid grid-cols-2 gap-3">
          <FField label="Commune"><FInput value={formData.ville_secteur_champ1 || ""} onChange={texte("ville_secteur_champ1")} placeholder="Lyon" /></FField>
          <FField label="Département"><FInput value={formData.ville_secteur_champ2 || ""} onChange={texte("ville_secteur_champ2")} placeholder="Rhône" /></FField>
          <FField label="Région" className="col-span-2"><FInput value={formData.ville_secteur_champ3 || ""} onChange={texte("ville_secteur_champ3")} placeholder="Auvergne-Rhône-Alpes" /></FField>
        </div>
        {/* Les deux chiffres de la bande du haut. Vides, la page prend
            l'agglomération Insee et le revenu du jeu de données ; saisis, ils
            l'emportent. */}
        <div className="grid grid-cols-2 gap-3">
          <FField label="Habitants agglomération">
            <FInput type="number" step="any" value={formData.ville_habitants_agglo ?? ""} onChange={nombre("ville_habitants_agglo")} placeholder="1 721 000" />
          </FField>
          <FField label="Revenu médian / UC (€)">
            <FInput type="number" step="any" value={formData.ville_revenu_median ?? ""} onChange={nombre("ville_revenu_median")} placeholder="24 300" />
          </FField>
        </div>
        <FField label="Description de la ville">
          <FTextarea rows={4} value={formData.description_ville || ""} onChange={texte("description_ville")} placeholder="Description de la ville…" />
        </FField>
      </div>

      <div className="space-y-4 pt-5 border-t border-trait">
        <Titre>Le secteur</Titre>
        <SecteurTextes formData={formData} setFormData={setFormData} />
        <FField label="Description du secteur">
          <FTextarea rows={4} value={formData.description_secteur || ""} onChange={texte("description_secteur")} placeholder="Description du secteur…" />
        </FField>
        <MarcheCases formData={formData} setFormData={setFormData} projetId={projetId} />
      </div>

      <Notes formData={formData} setFormData={setFormData} />
    </div>
  );
}
