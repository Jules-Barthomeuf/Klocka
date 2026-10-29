import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { Lettre, MARQUES } from "@/components/offres/EditeurLoi";
import { PagesAvis } from "@/components/mandataire/EditeurAvis";

// Modèles (26 oct. 2026, Jules) : dans Administration, les modèles de documents de chaque marque, Klocka et
// K Partners, remplis avec un exemple. Le texte et la mise en page sont communs ; la marque change les couleurs,
// le logo et le pied. Rien ne se garde ici : on regarde, et on télécharge la lettre d'exemple en PDF ou en Word.

const DOCUMENTS = [["loi", "Lettre d'intention"], ["avis", "Avis de valeur"]];
const MODELES_LOI = [["classique", "Classique", "Encart, titres numérotés I à III"], ["menthe", "Bande", "Logo en tête, sections 00 à 03, bande au pied"]];
const rien = () => {};

/** Un sélecteur en pilule, celui des barres de l'application. */
function Pilules({ options, valeur, onChoisir, libelle }) {
  return (
    <div className="flex flex-none gap-1 rounded-full bg-rail-actif p-1" role="group" aria-label={libelle}>
      {options.map(([k, mot]) => (
        <button key={k} type="button" onClick={() => onChoisir(k)} aria-pressed={valeur === k}
          className={`rounded-full px-3.5 py-1.5 text-[13.5px] transition-colors ${valeur === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={valeur === k ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  );
}

export default function AdminModeles() {
  const [document, setDocument] = useState("loi");
  const [marque, setMarque] = useState("klocka");
  return (
    <div className="relative min-h-screen w-full max-w-full overflow-x-hidden px-5 py-6 text-encre md:px-10 md:py-9">
      <div className="mx-auto max-w-[1400px]">
        <header className="k-entree flex flex-col items-center gap-2 text-center">
          <h1 className="m-0 text-[30px] font-normal leading-[1.1] tracking-[-0.02em] text-encre max-md:text-[26px]">Modèles</h1>
          <p className="m-0 max-w-[60ch] text-[14px] text-ardoise">Les documents de Klocka et de K Partners, remplis avec un exemple. Le texte est le même ; la marque change les couleurs, le logo et le pied de page.</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <Pilules libelle="Document" options={DOCUMENTS} valeur={document} onChoisir={setDocument} />
            <Pilules libelle="Marque" options={MARQUES} valeur={marque} onChoisir={setMarque} />
          </div>
        </header>
        <div key={`${document}-${marque}`} className="mt-8 animate-in fade-in duration-500">
          {document === "loi" ? <ModelesLoi marque={marque} /> : <ModeleAvis marque={marque} />}
        </div>
      </div>
    </div>
  );
}

/** Les deux modèles de lettre d'intention de la marque, côte à côte, et leurs fichiers d'exemple. */
function ModelesLoi({ marque }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["offres-exemple", marque], queryFn: () => base44.request("GET", `/api/offres/exemple?marque=${marque}`) });
  const [enCours, setEnCours] = useState(null);
  const telecharger = async (modele, format) => {
    setEnCours(`${modele}-${format}`);
    try {
      const blob = await base44.fichier(`/api/offres/exemple/fichier?marque=${marque}&modele=${modele}&format=${format}`);
      const url = URL.createObjectURL(blob);
      const a = window.document.createElement("a");
      a.href = url;
      a.download = `LOI exemple ${marque === "kp" ? "K Partners" : "Klocka"} ${modele}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e?.message || "Téléchargement impossible");
    } finally {
      setEnCours(null);
    }
  };
  if (isLoading) return <Chargement />;
  if (error || !data) return <p className="m-0 py-12 text-center text-[14px] text-brume">{error?.message || "Les modèles ne se chargent pas."}</p>;
  const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] disabled:opacity-40";
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {MODELES_LOI.map(([m, nom, detail]) => (
        <section key={m} className="flex flex-col gap-3 rounded-[16px] border border-trait p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-[15px] text-encre">{nom}</span>
              <span className="block truncate text-[12.5px] text-ardoise">{detail}</span>
            </span>
            <span className="flex flex-none gap-1.5">
              <button type="button" onClick={() => telecharger(m, "docx")} disabled={!!enCours}
                className={`${bouton} border border-bord-doux text-craie hover:border-bord-vif hover:text-encre`} style={{ background: "transparent" }}>
                {enCours === `${m}-docx` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Word
              </button>
              <button type="button" onClick={() => telecharger(m, "pdf")} disabled={!!enCours}
                className={`${bouton} border border-bord-doux text-craie hover:border-bord-vif hover:text-encre`} style={{ background: "transparent" }}>
                {enCours === `${m}-pdf` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}PDF
              </button>
            </span>
          </div>
          <span className="loi-apercu block w-full">
            <Lettre d={{ ...data, ...data.versions[m] }} modele={m} apercu onChamp={rien} onTexte={rien} />
          </span>
        </section>
      ))}
    </div>
  );
}

/** L'avis de valeur de la marque, sur un avis d'exemple. */
function ModeleAvis({ marque }) {
  const { data, isLoading, error } = useQuery({ queryKey: ["modeles-avis"], queryFn: () => base44.request("GET", "/api/admin/modeles/avis") });
  if (isLoading) return <Chargement />;
  if (error || !data?.avis) return <p className="m-0 py-12 text-center text-[14px] text-brume">{error?.message || "Aucun avis d'exemple à montrer."}</p>;
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="m-0 text-center text-[13px] text-ardoise">{data.source === "exemple" ? "Rempli avec un bien d'exemple." : "Rempli avec le dernier avis rédigé sur un compte d'essai."} Les retouches faites ici ne sont pas gardées.</p>
      <div className="max-w-full overflow-x-auto" style={{ zoom: 0.62 }}>
        <PagesAvis avis={data.avis} onPose={rien} marque={marque} />
      </div>
    </div>
  );
}
