import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useAjoutFichier } from "@/components/ui/ajout-fichier";
import TexteEnPlace from "@/components/ui/texte-en-place";
import { FileText, Loader2, Plus, X } from "lucide-react";
import { AUTRES_DOCUMENTS, documentsParGroupe, groupesDuProjet } from "@/lib/groupes-documents";
import { PileDocuments, typeDePartie, useLecteurDocument } from "@/components/projet/DocumentsProjet";

// L'onglet Documents d'un projet, en édition. Une zone par partie (24 nov. 2026, Jules : « des parties comme dans
// l'analyse, un truc quittances, un truc PV d'AG, des groupes de documents qu'on peut nommer »), au dessin de la Data
// Room (preanalyse/DepotsDossier.jsx) : toute la zone se clique et ouvre le petit menu Ordinateur / Google Drive
// (ui/ajout-fichier), on peut y glisser un fichier, ou une pièce d'une autre partie pour l'y ranger. Le nom d'une
// partie s'écrit sur place ; « Nouvelle partie » en ajoute une. Voir src/lib/groupes-documents.js.
// `avecListe` : les pièces sous chaque partie, quand la page ne les montre pas déjà.

const PIECE = "text/x-klocka-piece";
const cadre = (survol) => `flex min-h-[150px] flex-col rounded-[16px] border p-4 text-left shadow-lg backdrop-blur-xl transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-bord-doux bg-[var(--k-surface)] hover:border-bord-vif"}`;
const arreter = (ev) => ev.stopPropagation();

export default function ProjectFormDocumentsTab({ formData, setFormData, avecListe = true }) {
  const parties = documentsParGroupe(formData);
  const choix = useRef(null);
  const cible = useRef(null);
  const [envoi, setEnvoi] = useState({});

  // Toute modification fige la liste des parties dans le projet : l'ordre et les parties vides se gardent.
  const poser = (faire) => setFormData((f) => faire({ ...f, groupes_documents: groupesDuProjet(f) }));
  const compter = (nom, n) => setEnvoi((e) => ({ ...e, [nom]: Math.max(0, (e[nom] || 0) + n) }));

  const ajouter = async (liste, nom = cible.current) => {
    const tous = [...(liste || [])];
    if (!tous.length) return;
    const groupe = nom && nom !== AUTRES_DOCUMENTS ? nom : undefined;
    compter(nom, tous.length);
    const ajoutes = [];
    for (const file of tous) {
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        ajoutes.push({ nom: file.name, url: file_url, ...(groupe ? { groupe } : {}) });
      } catch (e) {
        toast.error(e?.message || `« ${file.name} » n'a pas pu être ajouté`);
      } finally {
        compter(nom, -1);
      }
    }
    if (ajoutes.length) poser((f) => ({ ...f, fichiers_projet: [...(f.fichiers_projet || []), ...ajoutes] }));
  };
  const ajout = useAjoutFichier({ onOrdinateur: () => choix.current?.click(), onFichiers: (fichiers) => ajouter(fichiers) });
  const lecteur = useLecteurDocument();
  const ouvrir = (nom, ev) => { cible.current = nom; ajout.ouvrir(ev); };

  const retirer = (idx) => setFormData((f) => ({ ...f, fichiers_projet: (f.fichiers_projet || []).filter((_, i) => i !== idx) }));
  const ranger = (idx, nom) => poser((f) => ({
    ...f,
    fichiers_projet: (f.fichiers_projet || []).map((p, i) => {
      if (i !== idx) return p;
      const { groupe: _ancien, ...reste } = p;
      return nom === AUTRES_DOCUMENTS ? reste : { ...reste, groupe: nom };
    }),
  }));
  const renommer = (ancien, nouveau) => {
    const nom = String(nouveau || "").trim();
    if (!nom || nom === ancien) return;
    if (nom === AUTRES_DOCUMENTS || groupesDuProjet(formData).includes(nom)) { toast.error(`Une partie s'appelle déjà « ${nom} »`); return; }
    poser((f) => ({
      ...f,
      groupes_documents: f.groupes_documents.map((g) => (g === ancien ? nom : g)),
      fichiers_projet: (f.fichiers_projet || []).map((p) => (p.groupe === ancien ? { ...p, groupe: nom } : p)),
    }));
  };
  const retirerPartie = (nom) => poser((f) => ({ ...f, groupes_documents: f.groupes_documents.filter((g) => g !== nom) }));
  const creerPartie = (nouveau) => {
    const nom = String(nouveau || "").trim();
    if (!nom) return false;
    if (nom === AUTRES_DOCUMENTS || groupesDuProjet(formData).includes(nom)) { toast.error(`Une partie s'appelle déjà « ${nom} »`); return false; }
    poser((f) => ({ ...f, groupes_documents: [...f.groupes_documents, nom] }));
    return true;
  };

  return (
    <div className="mb-5">
      <input ref={choix} type="file" multiple className="hidden" onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
      {ajout.rendu}
      {lecteur.rendu}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {parties.map((p) => (
          <Partie key={p.nom} partie={p} avecListe={avecListe} occupe={(envoi[p.nom] || 0) > 0} onVoir={lecteur.ouvrir}
            onOuvrir={(ev) => ouvrir(p.nom, ev)} onFichiers={(fichiers) => ajouter(fichiers, p.nom)} onRanger={(idx) => ranger(idx, p.nom)}
            onRenommer={(nom) => renommer(p.nom, nom)} onRetirerPartie={() => retirerPartie(p.nom)} onRetirer={retirer} />
        ))}
        <NouvellePartie onCreer={creerPartie} />
      </div>
    </div>
  );
}

function Partie({ partie, avecListe, occupe, onOuvrir, onFichiers, onRanger, onRenommer, onRetirerPartie, onRetirer, onVoir }) {
  const [survol, setSurvol] = useState(false);
  const n = partie.fichiers.length;
  const deposer = (ev) => {
    ev.preventDefault();
    setSurvol(false);
    const piece = ev.dataTransfer.getData(PIECE);
    if (piece !== "") { onRanger(Number(piece)); return; }
    onFichiers([...ev.dataTransfer.files]);
  };
  return (
    <section role="button" tabIndex={0} aria-label={`Ajouter dans : ${partie.nom}`}
      onClick={(ev) => !occupe && onOuvrir(ev)}
      onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); onOuvrir(ev); } }}
      onDragOver={(ev) => { ev.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)} onDrop={deposer}
      className={`group cursor-pointer ${cadre(survol)}`}>
      <div className="flex items-baseline justify-between gap-3">
        {partie.autres
          ? <p className="m-0 text-[15px] text-encre">{partie.nom}</p>
          : <TexteEnPlace valeur={partie.nom} placeholder="Nom de la partie" onEnregistrer={onRenommer} classeCase="flex-1"
              className="text-[15px] text-encre placeholder:text-brume max-md:text-[16px]" />}
        <span className="flex flex-none items-center gap-1">
          {n > 0 && <span className="text-[12.5px] tabular-nums text-brume">{n}</span>}
          {!partie.autres && !n && (
            <button type="button" onClick={(ev) => { arreter(ev); onRetirerPartie(); }} className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre"
              style={{ background: "transparent" }} aria-label={`Retirer la partie ${partie.nom}`} title="Retirer cette partie">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      {/* Les pièces en vignettes de leur première page (26 nov. 2026, Jules) : un clic l'ouvre, on la glisse dans une autre
          partie pour l'y ranger, la croix au survol la retire. */}
      {avecListe && n > 0 && (
        <>
          {/* La pile de la partie, comme en vue client (26 nov. 2026, Jules) : un clic sur une page l'ouvre. */}
          <div className="relative mt-3 h-[150px] text-black" onClick={arreter}>
            <div className="absolute inset-0 overflow-hidden rounded-[12px] bg-menthe" />
            <p className="absolute left-4 top-1/2 z-10 m-0 -translate-y-1/2 text-[14px] font-medium">{n} document{n > 1 ? "s" : ""}</p>
            <PileDocuments fichiers={partie.fichiers} onOuvrir={onVoir} type={typeDePartie(partie.nom)} largeur={92} droite={22} bas={-30} />
          </div>
          {/* Les noms : glisser dans une autre partie pour ranger, la croix pour retirer. */}
          <ul className="m-0 mt-3 list-none space-y-1 p-0">
            {partie.fichiers.map((f) => (
              <li key={f.idx} draggable onDragStart={(ev) => { ev.dataTransfer.setData(PIECE, String(f.idx)); ev.dataTransfer.effectAllowed = "move"; }}
                onClick={(ev) => { arreter(ev); onVoir(f); }} title="Ouvrir ; glissez-la dans une autre partie pour l'y ranger"
                className="group/ligne flex cursor-pointer items-center gap-2 text-[13px] active:cursor-grabbing">
                <span className="min-w-0 flex-1 truncate text-craie group-hover/ligne:text-encre">{f.nom}</span>
                <button type="button" onClick={(ev) => { arreter(ev); onRetirer(f.idx); }}
                  className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise opacity-0 transition-opacity hover:text-encre group-hover/ligne:opacity-100 focus:opacity-100 max-md:opacity-100"
                  style={{ background: "transparent" }} aria-label={`Retirer ${f.nom}`} title="Retirer">
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="m-0 mt-auto flex items-center justify-center gap-1.5 pt-4 text-[12.5px] text-brume">
        {occupe && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {occupe ? "Ajout en cours…" : n ? "Cliquez ou glissez pour en ajouter" : "Cliquez ou glissez un fichier"}
      </p>
    </section>
  );
}

// Le « + » : on nomme la partie (Entrée), elle se place avant lui, vide, prête à recevoir ses pièces.
function NouvellePartie({ onCreer }) {
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const fermer = () => { setOuvert(false); setNom(""); };
  if (!ouvert) {
    return (
      <button type="button" onClick={() => setOuvert(true)} className={`${cadre(false)} items-center justify-center gap-2 text-brume hover:text-encre`} style={{ background: "rgb(var(--k-rail-rgb))" }}>
        <Plus className="h-5 w-5" />
        <span className="text-[13.5px]">Nouvelle partie</span>
      </button>
    );
  }
  return (
    <section className={`${cadre(false)} gap-3`}>
      <input autoFocus value={nom} onChange={(ev) => setNom(ev.target.value)} placeholder="Nom de la partie : état locatif, plans…" aria-label="Nom de la partie"
        onKeyDown={(ev) => { if (ev.key === "Escape") fermer(); if (ev.key === "Enter") { ev.preventDefault(); if (onCreer(nom)) fermer(); } }}
        className="h-9 w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
      <div className="mt-auto flex items-center gap-3">
        <button type="button" disabled={!nom.trim()} onClick={() => { if (onCreer(nom)) fermer(); }}
          className="inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          Ajouter la partie
        </button>
        <button type="button" onClick={fermer} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
      </div>
    </section>
  );
}
