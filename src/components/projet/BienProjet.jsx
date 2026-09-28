import React, { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { nf } from "./SecteurChiffres";
import { useEdition } from "./EditionEnPlace";
import { InfoDot } from "./SecteurChiffres";
import { Carte, TitreCarte } from "./Cartes";

// Le bien : à gauche une capture choisie à la main ; à droite le
// local en quatre lignes (activité, détenu depuis, surface, dernière vente).
//
// L'activité tient en un mot ou deux ; le détail, s'il y en a un, reste
// derrière l'info au survol. En édition, les quatre lignes sont là même
// vides : on voit ce qu'il reste à trouver.

// La capture du bien : une image choisie à la main (capture d'écran d'une
// annonce, d'un plan, d'une fiche cadastrale...). Dans l'éditeur, on la dépose,
// on la colle (⌘V) ou on la choisit ; le client la voit telle quelle.
function Capture({ url }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const champ = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [grand, setGrand] = useState(false);

  const envoyer = async (fichier) => {
    if (!fichier || !/^image\//.test(fichier.type)) { setErreur("Il faut une image (PNG, JPG…)."); return; }
    setEnvoi(true); setErreur(null);
    try {
      const { file_url: lien } = await base44.integrations.Core.UploadFile({ file: fichier });
      edition.onChamp("bien_capture", lien, true);
    } catch (e) {
      setErreur(e?.message || "Envoi impossible.");
    } finally {
      setEnvoi(false);
      if (champ.current) champ.current.value = "";
    }
  };

  useEffect(() => {
    if (!enEdition) return undefined;
    const coller = (e) => {
      const image = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith("image/"));
      if (image) { e.preventDefault(); envoyer(image.getAsFile()); }
    };
    window.addEventListener("paste", coller);
    return () => window.removeEventListener("paste", coller);
  });

  if (!url && !enEdition) return null;
  return (
    <Carte className="p-5">
      {url ? (
        <div className="relative">
          <button type="button" onClick={() => setGrand(true)} className="block w-full overflow-hidden rounded-[14px] bg-relief" aria-label="Voir la capture en grand">
            <img src={url} alt="Capture du bien" className="w-full h-auto object-contain" />
          </button>
          {enEdition && (
            <div className="absolute right-3 top-3 flex gap-2">
              <button type="button" onClick={() => champ.current?.click()} className="k-verre rounded-full px-3 py-1.5 text-[12.5px]">Remplacer</button>
              <button type="button" onClick={() => edition.onChamp("bien_capture", "", true)} className="k-verre rounded-full px-3 py-1.5 text-[12.5px] text-alerte">Retirer</button>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => champ.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); envoyer(e.dataTransfer?.files?.[0]); }}
          className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-3 rounded-[14px] border border-dashed border-bord-doux text-center transition-colors hover:border-bord-vif"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-menthe/[0.12] text-menthe">
            {envoi ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
          <span className="text-[14px] text-encre">{envoi ? "Envoi…" : "Ajouter une capture"}</span>
          <span className="max-w-[32ch] text-[12.5px] text-ardoise">Collez-la (⌘V), déposez-la ici ou choisissez un fichier.</span>
        </button>
      )}
      <input ref={champ} type="file" accept="image/*" className="hidden" onChange={(e) => envoyer(e.target.files?.[0])} />
      {erreur && <p className="m-0 mt-3 text-[12.5px] text-alerte">{erreur}</p>}
      {grand && url && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/85 p-6" onClick={() => setGrand(false)}>
          <img src={url} alt="Capture du bien" className="max-h-[90vh] max-w-[92vw] rounded-[12px] object-contain" />
        </div>
      )}
    </Carte>
  );
}

function Ligne({ label, valeur, sous, info }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-4 border-t border-trait first:border-t-0">
      <span className="text-[14px] text-ardoise flex items-center gap-1.5">{label}<InfoDot texte={info} /></span>
      <span className="text-right">
        <span className={`block text-[22px] max-md:text-[18px] font-medium tracking-[-0.01em] ${valeur ? "text-encre" : "text-brume"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{valeur || "—"}</span>
        {sous && <span className="block text-[15px] max-md:text-[13.5px] text-craie mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>{sous}</span>}
      </span>
    </div>
  );
}

export default function BienProjet({ project }) {
  const edition = useEdition();
  const enEdition = !!edition?.onChamp;
  const surface = Number(project.sim_surface) || Number(project.surface_m2) || 0;
  const detenu = project.detenu_depuis || project.derniere_vente_annee || null;
  const prixVente = Number(project.derniere_vente_prix) > 0 ? `${nf.format(Number(project.derniere_vente_prix))} €` : null;

  const lignes = [
    { valeur: project.activite_locataire && !/non renseign/i.test(project.activite_locataire) ? project.activite_locataire : null, label: "Activité", info: project.activite_detail || null },
    { valeur: detenu ? String(detenu) : null, label: "Détenu depuis", info: "Depuis quand le propriétaire actuel tient les murs, d'après la dernière mutation publiée (DVF) ou l'acte." },
    { valeur: surface > 0 ? `${nf.format(surface)} m²` : null, label: "Surface", info: project.surface_detail || null },
    // L'année en grand, le prix dessous : deux chiffres sur une ligne se
    // lisaient comme un seul.
    { valeur: project.derniere_vente_annee ? String(project.derniere_vente_annee) : null, sous: prixVente, label: "Dernière vente", info: "L'année et le prix de la dernière mutation des murs, d'après les ventes publiées (DVF) ou l'acte." },
  ].filter((l) => enEdition || l.valeur);

  const capture = project.bien_capture || "";
  const avecCapture = !!capture || enEdition;
  if (!lignes.length && !avecCapture) return null;

  return (
    <div className={`grid gap-5 items-start ${avecCapture ? "md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]" : ""}`}>
      {avecCapture && <Capture url={capture} />}
      {lignes.length > 0 && (
        <Carte className="p-7 max-md:p-5">
          <TitreCarte titre="Le local" sous="Ce que les actes et les ventes publiées disent des murs" />
          <div className="mt-3">{lignes.map((l) => <Ligne key={l.label} {...l} />)}</div>
        </Carte>
      )}
    </div>
  );
}
