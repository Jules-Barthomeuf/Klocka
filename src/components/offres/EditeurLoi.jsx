import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Download, LayoutTemplate, Loader2, RotateCcw, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { MiseAJourDocument } from "@/components/mandataire/GenerationDocument";
import "./lettre-intention.css";

// La lettre d'intention ouverte, à droite du chat de la page Offres : le
// modèle de la maison, rempli, qui se relit et se retouche sur place. Un
// clic dans un paragraphe le modifie (Cmd+B pour le gras) ; un champ des
// parties (l'acquéreur, le vendeur) change la lettre entière. Le chat, lui,
// corrige les champs ou réécrit un paragraphe. Word et PDF sortent du serveur.

const echapper = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** « **gras** » → HTML pour l'écran. */
const versHtml = (t) => String(t ?? "").split(/(\*\*[^*]+\*\*)/).filter(Boolean)
  .map((x) => (x.startsWith("**") && x.endsWith("**") ? `<b>${echapper(x.slice(2, -2))}</b>` : echapper(x))).join("");
/** Le HTML retouché → « **gras** ». Tout le reste n'est que du texte. */
function versTexte(el) {
  let s = "";
  for (const n of el.childNodes) {
    if (n.nodeType === 3) s += n.textContent;
    else if (n.nodeName === "BR") s += " ";
    else if (["B", "STRONG"].includes(n.nodeName)) { const t = n.textContent; s += t.trim() ? `**${t}**` : t; }
    else s += versTexte(n);
  }
  return s.replace(/\u00a0/g, " ").replace(/\*\*\*\*/g, "").replace(/\s+/g, " ").trim();
}

export default function EditeurLoi({ id, onFermer, travail = null }) {
  const queryClient = useQueryClient();
  const cle = ["offre", id];
  const { data, isLoading, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `/api/offres/${id}`), enabled: !!id });
  const modifier = useMutation({
    mutationFn: (corps) => base44.request("PATCH", `/api/offres/${id}`, { body: corps }),
    onSuccess: (d) => { queryClient.setQueryData(cle, d); queryClient.invalidateQueries({ queryKey: ["offres"] }); },
    onError: (e) => toast.error(e?.message || "La retouche n'a pas été gardée"),
  });
  const [telechargement, setTelechargement] = useState(null);
  const telecharger = async (format) => {
    setTelechargement(format);
    try {
      const blob = await base44.fichier(`/api/offres/${id}/fichier?format=${format}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `LOI ${data?.lettre?.adresse || "local"}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) {
      toast.error(e?.message || "Téléchargement impossible");
    } finally {
      setTelechargement(null);
    }
  };

  // Pendant que le chat travaille, ses étapes à la place de la lettre, puis elle revient.
  const [maj, setMaj] = useState(false);
  const enCours = !!travail?.enCours;
  useEffect(() => {
    if (enCours) { setMaj(true); return undefined; }
    queryClient.invalidateQueries({ queryKey: cle });
    const t = setTimeout(() => setMaj(false), 700);
    return () => clearTimeout(t);
  }, [enCours]);

  const modele = data?.lettre?.modele || null;
  // Un modèle choisi ou changé : la lettre s'ouvre par le haut.
  const defile = useRef(null);
  useEffect(() => { defile.current?.scrollTo({ top: 0 }); }, [modele]);
  const statut = modifier.isPending ? "Enregistrement…" : data && !modele ? "Choisissez un modèle" : data?.manquants?.length ? `${data.manquants.length} information${data.manquants.length > 1 ? "s" : ""} manquante${data.manquants.length > 1 ? "s" : ""}` : "Vos retouches sont gardées";

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-fond">
      <div className="k-barre-apercu flex h-14 flex-none items-center justify-between gap-3 border-b border-trait px-5">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="truncate text-[14.5px] text-encre">Lettre d'intention</span>
          <span className="truncate text-[12.5px] text-ardoise">{statut}</span>
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {modele && (
            <button type="button" onClick={() => modifier.mutate({ modele: null })} disabled={modifier.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ardoise hover:bg-relief hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
              <LayoutTemplate className="h-3.5 w-3.5" />Changer de modèle
            </button>
          )}
          {["docx", "pdf"].map((f) => (
            <button key={f} type="button" onClick={() => telecharger(f)} disabled={!data || !modele || !!telechargement}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
              {telechargement === f ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}{f === "docx" ? "Word" : "PDF"}
            </button>
          ))}
          {onFermer && (
            <button type="button" onClick={onFermer} aria-label="Fermer la lettre" title="Fermer"
              className="ml-1 grid h-9 w-9 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div ref={defile} className="min-h-0 flex-1 overflow-y-auto">
        {maj && data ? (
          <MiseAJourDocument surtitre="Mise à jour de la lettre" titre="La LOI s'adapte" etapes={travail?.etapes || []} enCours={enCours} />
        ) : isLoading ? (
          <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        ) : error || !data ? (
          <p className="m-0 p-10 text-center text-[14px] text-brume">{error?.message || "Lettre introuvable."}</p>
        ) : !modele && data.versions ? (
          <ChoixModele d={data} enCours={modifier.isPending ? modifier.variables?.modele : null} onChoisir={(m) => modifier.mutate({ modele: m })}
            onChamp={(k, v) => modifier.mutate({ champs: { [k]: v } })} onTexte={(k, v) => modifier.mutate({ textes: { [k]: v } })} />
        ) : (
          <div key={modele} className="px-6 py-8 animate-in fade-in duration-500">
            <Lettre d={data} modele={modele} onChamp={(k, v) => modifier.mutate({ champs: { [k]: v } })} onTexte={(k, v) => modifier.mutate({ textes: { [k]: v } })} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Un texte qui se retouche sur place ; gardé quand on en sort. */
function Editable({ valeur, onGarde, className = "", gras = true, as: Balise = "p", lecture = false }) {
  const ref = useRef(null);
  const sortir = () => {
    const el = ref.current;
    if (!el) return;
    const t = gras ? versTexte(el) : el.textContent.replace(/\s+/g, " ").trim();
    if (t !== String(valeur ?? "").trim()) onGarde(t);
  };
  return (
    <Balise ref={ref} className={`${lecture ? "" : "loi-editable "}${className}`} contentEditable={!lecture} suppressContentEditableWarning spellCheck
      onBlur={sortir}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.blur(); } if (e.key === "Escape") { e.currentTarget.innerHTML = gras ? versHtml(valeur) : echapper(valeur); e.currentTarget.blur(); } }}
      dangerouslySetInnerHTML={{ __html: gras ? versHtml(valeur) : echapper(valeur) }} />
  );
}

const MODELES = [["classique", "Classique", "Encart gris, titres numérotés I à III"], ["menthe", "Menthe", "Logo K en tête, sections 00 à 03, bande menthe"]];

/**
 * Les deux modèles côte à côte, remplis : on choisit, et la lettre se
 * construit sur lui. Chacun se retouche déjà sur place : le texte et les
 * champs sont communs, une retouche dans l'un vaut pour l'autre.
 */
function ChoixModele({ d, enCours, onChoisir, onChamp, onTexte }) {
  return (
    <div className="px-6 py-7 animate-in fade-in duration-500">
      <p className="m-0 text-center text-[17px] text-encre">Choisissez le modèle de la lettre</p>
      <p className="m-0 mt-1 text-center text-[13.5px] text-ardoise">Le texte est le même et se modifie dans l'un comme dans l'autre ; vous pourrez changer de modèle plus tard.</p>
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {MODELES.map(([m, nom, detail]) => (
          <div key={m} className="flex flex-col items-center gap-3 rounded-[16px] border border-trait p-4 transition-colors hover:border-bord-vif">
            <span className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-[15px] text-encre">{nom}</span>
                <span className="block truncate text-[12.5px] text-ardoise">{detail}</span>
              </span>
              <button type="button" onClick={() => onChoisir(m)} disabled={!!enCours}
                className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
                {enCours === m ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Choisir
              </button>
            </span>
            <span className="loi-apercu block w-full">
              <Lettre d={{ ...d, ...d.versions[m] }} modele={m} onChamp={onChamp} onTexte={onTexte} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Les noms au-dessus des signatures : chacun est un champ de la lettre.
const SIGNE_GAUCHE = ["acquereur_nom", "acquereur_societe"];
const SIGNE_DROITE = ["vendeur_societe"];
/** Une ligne de signature : modifiable quand elle porte un champ (« Bon pour accord » reste fixe). */
function LigneSignature({ texte, champ, i, onChamp, lecture }) {
  if (!champ) return <p className={i === 0 ? "loi-nom" : "loi-sous"}>{texte}</p>;
  return <Editable key={`${champ}:${texte}`} valeur={texte} gras={false} lecture={lecture} className={i === 0 ? "loi-nom" : "loi-sous"} onGarde={(t) => onChamp(champ, t)} />;
}

function Lettre(props) {
  return props.modele === "menthe" ? <LettreMenthe {...props} /> : <LettreClassique {...props} />;
}

/** Le K de Klocka (public/logo-k-klocka.png) : le fût et la barre en noir, le jambage arrondi en menthe. */
function LogoK() {
  return (
    <svg className="loi-logo-k" viewBox="104 68 417 487" role="img" aria-label="Klocka">
      <rect className="loi-logo-k-noir" x="104" y="68" width="82" height="487" />
      <polygon className="loi-logo-k-noir" points="480,68 505,68 255,293 232,293" />
      <path className="loi-logo-k-menthe" d="M208,318 H318 C345,318 362,328 375,345 L520,555 H425 L280,350 C272,338 265,335 252,335 H208 Z" />
    </svg>
  );
}

/** Le modèle menthe : le K de Klocka en tête, titre et adresse, sections 00 à 03, lignes de signature, bande menthe. */
function LettreMenthe({ d, onChamp, onTexte, apercu = false }) {
  const { parties, cadre, blocs } = d;
  const par = (b) => ({ valeur: b.texte, onGarde: (t) => onTexte(b.cle, t), lecture: apercu });
  const date = blocs.find((b) => b.type === "date");
  // Les sections : chaque titre numéroté ouvre la sienne ; les salutations et les signatures restent dehors.
  const sections = [];
  const apres = [];
  for (const b of blocs) {
    if (["date", "objet"].includes(b.type)) continue;
    if (b.cle === "salutations" || b.type === "signatures") { apres.push(b); continue; }
    if (b.type === "h2") sections.push({ titre: b, contenu: [] });
    else sections.at(-1)?.contenu.push(b);
  }
  const ligne = (cleChamp, v, i, liste) => (
    <Editable key={`${cleChamp}:${v}`} valeur={v} gras={false} lecture={apercu}
      className={i === 0 ? "loi-nom" : i === liste.length - 1 && /adresse/.test(cleChamp) ? "loi-adresse" : ""}
      onGarde={(t) => onChamp(cleChamp, cleChamp === "vendeur_representant" ? t.replace(/^représentée? par\s+/i, "") : t)} />
  );
  return (
    <article className="loi-papier loi-menthe" aria-label="Lettre d'intention d'achat">
      <div className="loi-corps">
        <div className="loi-m-tete">
          <LogoK />
          {date && <Editable key={`date:${date.texte}`} {...par(date)} gras={false} className="loi-date" />}
        </div>
        <div className="loi-parties">
          <div>{parties.acquereur.map(([k, v], i, l) => ligne(k, v, i, l))}</div>
          <div>
            <p className="loi-m-attention">À l'attention de</p>
            {parties.vendeur.map(([k, v], i, l) => ligne(k, v, i, l))}
          </div>
        </div>
        <p className="loi-m-titre">Lettre d'intention d'achat</p>
        <Editable key={`adresse:${cadre.adresse_courte}`} valeur={cadre.adresse_courte} gras={false} lecture={apercu} className="loi-m-adresse" onGarde={(t) => onChamp("adresse_bien", t)} />
        {sections.map((s) => (
          <section key={s.titre.cle} className="loi-m-section">
            <span className="loi-m-num">{s.titre.num}</span>
            <div>
              <Editable key={`${s.titre.cle}:${s.titre.texte}`} {...par(s.titre)} gras={false} as="h2" className="loi-h2" />
              {s.contenu.map((b) => (b.type === "h3"
                ? <Editable key={`${b.cle}:${b.texte}`} {...par(b)} gras={false} className="loi-h3" />
                : <Paragraphe key={`${b.cle}:${b.texte}`} b={b} {...par(b)} onTexte={onTexte} apercu={apercu} />))}
            </div>
          </section>
        ))}
        {apres.map((b) => (b.type === "signatures" ? (
          <div key={b.cle} className="loi-signatures">
            {[[b.gauche, SIGNE_GAUCHE], [b.droite, SIGNE_DROITE]].map(([lignes, champs], n) => (
              <div key={n}>
                {lignes.map((l, i) => <LigneSignature key={l} texte={l} champ={champs[i]} i={i} onChamp={onChamp} lecture={apercu} />)}
                <div className="loi-m-ligne" />
                <p className="loi-m-sous">Signature</p>
              </div>
            ))}
          </div>
        ) : (
          <div key={`${b.cle}:${b.texte}`} className="loi-m-salut"><Paragraphe b={b} {...par(b)} onTexte={onTexte} apercu={apercu} /></div>
        )))}
      </div>
      <footer className="loi-pied"><span>{cadre.pied_gauche}</span><span>{cadre.pied_droite}</span></footer>
      <div className="loi-m-bande" />
    </article>
  );
}

/** Un paragraphe du corps, avec sa marque de retouche et le retour au modèle. */
function Paragraphe({ b, onTexte, apercu, ...par }) {
  return (
    <div className={b.retouche ? "loi-retouche" : ""}>
      {b.retouche && !apercu && (
        <button type="button" title="Revenir au texte du modèle" aria-label="Revenir au texte du modèle" onClick={() => onTexte(b.cle, "")}
          className="float-right -mr-9 mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[#7fa898] opacity-60 hover:opacity-100" style={{ background: "transparent" }}>
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
      <Editable {...par} className="loi-p" />
    </div>
  );
}

function LettreClassique({ d, onChamp, onTexte, apercu = false }) {
  const { parties, cadre, blocs } = d;
  const ligne = (cleChamp, v, i, liste) => {
    const repr = cleChamp === "vendeur_representant";
    const nom = i === 0;
    const adresse = i === liste.length - 1 && /adresse/.test(cleChamp);
    return (
      <Editable key={`${cleChamp}:${v}`} valeur={v} gras={false} className={nom ? "loi-nom" : adresse ? "loi-adresse" : ""}
        onGarde={(t) => onChamp(cleChamp, repr ? t.replace(/^représentée? par\s+/i, "") : t)} />
    );
  };
  return (
    <article className="loi-papier" aria-label="Lettre d'intention d'achat">
      <header className="loi-entete">
        <span className="flex min-w-0 items-center"><LogoK /><span className="truncate">{cadre.titre}</span></span>
        <span className="loi-date-haut">{cadre.date}</span>
      </header>
      <div className="loi-corps">
        <div className="loi-parties">
          <div>
            <p className="loi-label">Acquéreur</p>
            {parties.acquereur.map(([k, v], i, l) => ligne(k, v, i, l))}
          </div>
          <div className="loi-attention">
            <p className="loi-label">À l'attention de</p>
            {parties.vendeur.map(([k, v], i, l) => ligne(k, v, i, l))}
          </div>
        </div>
        {blocs.map((b) => {
          const k = `${b.cle}:${b.texte}`;
          const commun = { valeur: b.texte, onGarde: (t) => onTexte(b.cle, t) };
          const retour = b.retouche ? (
            <button type="button" title="Revenir au texte du modèle" aria-label="Revenir au texte du modèle" onClick={() => onTexte(b.cle, "")}
              className="float-right -mr-9 mt-0.5 grid h-6 w-6 place-items-center rounded-full text-[#7fa898] opacity-60 hover:opacity-100" style={{ background: "transparent" }}>
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null;
          if (b.type === "date") return <Editable key={k} {...commun} gras={false} className="loi-date" />;
          if (b.type === "objet") return <Editable key={k} {...commun} gras={false} className="loi-objet" />;
          if (b.type === "h2") {
            return (
              <h2 key={b.cle} className={`loi-h2 ${b.num ? "" : "loi-conseil"}`}>
                {b.num && <span className="loi-num">{b.num}</span>}
                <Editable key={k} {...commun} as="span" gras={false} />
              </h2>
            );
          }
          if (b.type === "h3") return <Editable key={k} {...commun} gras={false} className="loi-h3" />;
          if (b.type === "signatures") {
            return (
              <div key={b.cle} className="loi-signatures">
                {[[b.gauche, "Signature", SIGNE_GAUCHE], [b.droite, "Date et signature", SIGNE_DROITE]].map(([lignes, sous, champs]) => (
                  <div key={sous}>
                    {lignes.map((l, i) => <LigneSignature key={l} texte={l} champ={champs[i]} i={i} onChamp={onChamp} />)}
                    <div className="loi-cadre"><span>{sous.toUpperCase()}</span></div>
                  </div>
                ))}
              </div>
            );
          }
          return (
            <div key={b.cle} className={b.retouche ? "loi-retouche" : ""}>
              {retour}
              <Editable key={k} {...commun} className="loi-p" />
            </div>
          );
        })}
      </div>
      <footer className="loi-pied"><span>{cadre.pied_gauche}</span><span>{cadre.pied_droite}</span></footer>
    </article>
  );
}
