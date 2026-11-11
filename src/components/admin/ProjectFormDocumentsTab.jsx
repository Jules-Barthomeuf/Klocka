import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useAjoutFichier } from "@/components/ui/ajout-fichier";
import { FileText, Loader2, Upload, X } from "lucide-react";

// L'onglet Documents d'un projet, en édition (11 nov. 2026, Jules : « juste un truc d'upload ; on choisit depuis le
// Google Drive ou depuis l'ordi ») : une zone de dépôt au dessin de la Data Room, qui ouvre le petit menu commun
// Ordinateur / Google Drive (ui/ajout-fichier) ; on peut aussi y glisser un fichier. Plus d'ajout par URL, plus de
// liste à cocher, plus de phrases d'explication. `avecListe` : la liste des fichiers, quand la page ne la montre pas déjà.

export default function ProjectFormDocumentsTab({ formData, setFormData, avecListe = true }) {
  const fichiers = formData.fichiers_projet || [];
  const choix = useRef(null);
  const [envoi, setEnvoi] = useState(0);
  const [survol, setSurvol] = useState(false);

  const ajouter = async (liste) => {
    const tous = [...(liste || [])];
    if (!tous.length) return;
    setEnvoi((n) => n + tous.length);
    const ajoutes = [];
    for (const file of tous) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        ajoutes.push({ nom: file.name, url: file_url });
      } catch (e) {
        toast.error(e?.message || `« ${file.name} » n'a pas pu être ajouté`);
      } finally {
        setEnvoi((n) => n - 1);
      }
    }
    if (ajoutes.length) setFormData((f) => ({ ...f, fichiers_projet: [...(f.fichiers_projet || []), ...ajoutes] }));
  };
  const ajout = useAjoutFichier({ onOrdinateur: () => choix.current?.click(), onFichiers: ajouter });
  const retirer = (idx) => setFormData((f) => ({ ...f, fichiers_projet: (f.fichiers_projet || []).filter((_, i) => i !== idx) }));

  return (
    <div className="mb-5 space-y-4">
      <input ref={choix} type="file" multiple className="hidden" onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
      {ajout.rendu}
      <button type="button" onClick={ajout.ouvrir}
        onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
        onDrop={(e) => { e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer.files); }}
        className={`flex min-h-[120px] w-full flex-col items-center justify-center gap-2 rounded-[12px] border px-4 py-6 text-center transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-trait bg-rail hover:border-bord-vif"}`}>
        {envoi > 0 ? <Loader2 className="h-5 w-5 animate-spin text-ardoise" /> : <Upload className="h-5 w-5 text-ardoise" />}
        <span className="text-[14px] text-encre">{envoi > 0 ? "Ajout en cours…" : "Choisir un fichier"}</span>
        <span className="text-[12.5px] text-brume">Depuis l'ordinateur ou Google Drive, ou glissez-le ici</span>
      </button>
      {avecListe && fichiers.length > 0 && (
        <ul className="m-0 list-none border-b border-trait p-0">
          {fichiers.map((f, idx) => (
            <li key={idx} className="flex items-center gap-3 border-t border-trait py-3">
              <FileText className="h-4 w-4 flex-shrink-0 text-ardoise" />
              <span className="min-w-0 flex-1 truncate text-[15px] text-craie">{f.nom}</span>
              <button type="button" onClick={() => retirer(idx)} aria-label={`Retirer ${f.nom}`} title="Retirer"
                className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
