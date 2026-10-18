import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FolderInput, LoaderCircle, Minimize2, Shrink } from "lucide-react";
import { toast } from "@/components/ui/avis";
import { choixPour, extensionDe, secteurSous, typeDe } from "@/lib/conversions";
import { convertir, telecharger } from "@/lib/convertir-fichier";

// La roue de conversion de la Data Room (18 oct. 2026, Jules, d'après Tangerine) :
// on glisse un fichier en tenant Maj, une roue s'ouvre sous le curseur, et on
// le lâche sur un secteur pour le convertir. Les formats et les actions
// dépendent du type du fichier (src/lib/conversions.js). Au centre, le format
// d'origine : y lâcher le fichier le range tel quel dans la Data Room.
// Tout se fait dans le navigateur ; le fichier converti part dans les
// téléchargements, et un avis propose de le ranger aussi dans la Data Room.

const RAYON = 170;
const MOYEU = 62;
const TAILLE = RAYON * 2 + 24;
const ICONES = { "image-compresser": Minimize2, "image-reduire": Shrink };

/**
 * Le tracé d'un secteur de couronne, de `a0` à `a1` degrés (0 en haut, sens des aiguilles), écarté de ses voisins
 * d'une bande de largeur constante `ecart` (en px) : l'angle retiré grandit vers le centre, comme sur Tangerine.
 */
function secteur(a0, a1, r0, r1, ecart) {
  const p = (a, r) => {
    const t = ((a - 90) * Math.PI) / 180;
    return `${(TAILLE / 2 + r * Math.cos(t)).toFixed(2)} ${(TAILLE / 2 + r * Math.sin(t)).toFixed(2)}`;
  };
  const d = (r) => (Math.asin(Math.min(1, ecart / 2 / r)) * 180) / Math.PI;
  const grand = a1 - a0 > 180 ? 1 : 0;
  return `M ${p(a0 + d(r1), r1)} A ${r1} ${r1} 0 ${grand} 1 ${p(a1 - d(r1), r1)} L ${p(a1 - d(r0), r0)} A ${r0} ${r0} 0 ${grand} 0 ${p(a0 + d(r0), r0)} Z`;
}

/** Le centre d'un secteur, pour y poser son libellé. */
function centreDe(i, n) {
  const a = ((i * 360) / n - 90) * (Math.PI / 180);
  const r = (RAYON + MOYEU) / 2 + 4;
  return { left: TAILLE / 2 + r * Math.cos(a), top: TAILLE / 2 + r * Math.sin(a) };
}

/**
 * La roue elle-même, sous le curseur.
 * @param fichier   le File à convertir quand il est déjà là (bouton, menu d'une pièce) ; sinon il arrive au lâcher
 * @param nom, mime le nom et le type, connus dès le survol (le contenu d'un glisser ne se lit qu'au lâcher)
 * @param onAjouter (File) => Promise : range un fichier dans la Data Room ; sans lui, pas de moyeu « Data Room »
 */
export function Roue({ x, y, nom, mime = "", fichier = null, onAjouter = null, onFermer }) {
  const choix = choixPour(nom, mime);
  const n = choix.length;
  const [survol, setSurvol] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const boite = useRef(null);
  // La roue tient dans l'écran, même lâchée près d'un bord.
  const cx = Math.min(Math.max(x, TAILLE / 2 + 8), window.innerWidth - TAILLE / 2 - 8);
  const cy = Math.min(Math.max(y, TAILLE / 2 + 8), window.innerHeight - TAILLE / 2 - 8);
  const sous = (e) => secteurSous(e.clientX - cx, e.clientY - cy, n, { rayon: RAYON, moyeu: MOYEU });

  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape" && !enCours) onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [enCours, onFermer]);

  const agir = async (cible, f) => {
    if (cible == null || !f) { onFermer(); return; }
    if (cible === -1) {
      if (!onAjouter) { onFermer(); return; }
      setEnCours("Data Room");
      try { await onAjouter(f); } catch (e) { toast.error(e?.message || "Import impossible"); }
      onFermer();
      return;
    }
    const c = choix[cible];
    setEnCours(c.libelle);
    try {
      const r = await convertir(f, c);
      telecharger(r.fichier);
      toast.success(`${r.nom} est prêt`, {
        description: "Dans vos téléchargements. Rien n'a quitté votre ordinateur.",
        ...(onAjouter ? { action: { mot: "Ranger dans la Data Room", faire: () => onAjouter(r.fichier).catch((e) => toast.error(e?.message || "Import impossible")) } } : {}),
      });
    } catch (e) {
      toast.error("Conversion impossible", { description: e?.message || String(e) });
    }
    onFermer();
  };

  const lacher = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (enCours) return;
    agir(sous(e), e.dataTransfer?.files?.[0] || fichier);
  };

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-label={`Convertir ${nom}`}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (!enCours) setSurvol(sous(e)); e.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(e) => { if (!e.relatedTarget) onFermer(); }}
      onDrop={lacher}
      onMouseMove={(e) => { if (!enCours) setSurvol(sous(e)); }}
      onClick={(e) => { if (!enCours) agir(sous(e), fichier); }}>
      <div ref={boite} className="absolute duration-200 animate-in fade-in-0 zoom-in-95"
        style={{ left: cx - TAILLE / 2, top: cy - TAILLE / 2, width: TAILLE, height: TAILLE }}>
        <div className="absolute inset-0 rounded-full border border-trait bg-fond/55 shadow-[0_18px_40px_rgb(0_0_0/0.18)] backdrop-blur-xl" />
        <svg width={TAILLE} height={TAILLE} className="absolute inset-0" aria-hidden>
          {choix.map((c, i) => {
            const part = 360 / n;
            const actif = survol === i;
            // Un trait épais de la couleur du secteur, à bouts ronds, arrondit ses coins ; l'écart de 16 px en laisse 6 visibles.
            return (
              <path key={c.cle} d={secteur(i * part - part / 2, (i + 1) * part - part / 2, MOYEU + 15, RAYON - 7, 16)}
                style={{ fill: actif ? "rgb(var(--k-menthe-rgb))" : "rgb(var(--k-barre-relief-rgb))", stroke: actif ? "rgb(var(--k-menthe-rgb))" : "rgb(var(--k-barre-relief-rgb))", transition: "fill .15s, stroke .15s" }}
                strokeWidth={10} strokeLinejoin="round" />
            );
          })}
        </svg>
        {choix.map((c, i) => {
          const Icone = ICONES[c.cle];
          const actif = survol === i;
          return (
            <span key={c.cle} className={`pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 text-[12px] font-semibold uppercase tracking-[.08em] ${actif ? "text-sur-menthe" : "text-encre"}`}
              style={centreDe(i, n)}>
              {Icone && <Icone className="h-4 w-4" />}
              {c.libelle}
            </span>
          );
        })}
        {/* Le moyeu : le format d'origine, et la Data Room si on y lâche le fichier. */}
        <div className={`pointer-events-none absolute left-1/2 top-1/2 grid h-[96px] w-[96px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-center transition-colors ${survol === -1 && onAjouter ? "border-menthe bg-menthe text-sur-menthe" : "border-trait bg-rail text-encre"}`}>
          {enCours ? (
            <span className="flex flex-col items-center gap-1 text-[11.5px]"><LoaderCircle className="h-4 w-4 animate-spin" />{enCours}</span>
          ) : (
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[13px] font-semibold uppercase tracking-[.08em]">{extensionDe(nom) || "Fichier"}</span>
              {onAjouter && <span className="flex items-center gap-1 text-[10.5px] opacity-80"><FolderInput className="h-3 w-3" />Data Room</span>}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * La zone qui ouvre la roue : un fichier glissé dessus en tenant Maj (sans Maj, le glisser garde son effet habituel).
 * Maj se lit sur l'événement de glisser, et à défaut sur la touche tenue juste avant (certains navigateurs ne la transmettent pas pendant un glisser).
 */
export function ZoneConversion({ onAjouter = null, children, className = "" }) {
  const [roue, setRoue] = useState(null);
  const majTenue = useRef(false);
  useEffect(() => {
    const bas = (e) => { if (e.key === "Shift") majTenue.current = true; };
    const haut = (e) => { if (e.key === "Shift") majTenue.current = false; };
    const perdu = () => { majTenue.current = false; };
    window.addEventListener("keydown", bas);
    window.addEventListener("keyup", haut);
    window.addEventListener("blur", perdu);
    return () => { window.removeEventListener("keydown", bas); window.removeEventListener("keyup", haut); window.removeEventListener("blur", perdu); };
  }, []);
  const survoler = (e) => {
    if (roue || !e.dataTransfer?.types?.includes("Files") || !(e.shiftKey || majTenue.current)) return;
    // Le nom n'est lisible qu'au lâcher ; le type, souvent dès le survol.
    const item = [...(e.dataTransfer.items || [])].find((x) => x.kind === "file");
    const mime = item?.type || "";
    e.preventDefault();
    e.stopPropagation();
    setRoue({ x: e.clientX, y: e.clientY, mime, nom: mime ? `fichier.${{ "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/plain": "txt" }[mime] || ""}` : "" });
  };
  return (
    <div className={className} onDragOverCapture={survoler}>
      {children}
      {roue && <RoueAuLacher {...roue} onAjouter={onAjouter} onFermer={() => setRoue(null)} />}
    </div>
  );
}

/**
 * Pendant un glisser, le navigateur ne donne que le type du fichier, pas son nom : la roue se dessine sur ce type
 * (un .docx glissé n'a souvent pas de type lisible, il prend alors la roue d'un document texte au lâcher).
 */
function RoueAuLacher({ x, y, nom, mime, onAjouter, onFermer }) {
  if (!typeDe(nom, mime)) {
    // Type inconnu pendant le survol : la roue attend le lâcher pour lire le nom.
    return <RoueInconnue x={x} y={y} onAjouter={onAjouter} onFermer={onFermer} />;
  }
  return <Roue x={x} y={y} nom={nom} mime={mime} onAjouter={onAjouter} onFermer={onFermer} />;
}

/** Un fichier dont le type ne se lit pas au survol (souvent un .docx) : on le lâche au centre, puis la roue de son type s'ouvre au même endroit. */
function RoueInconnue({ x, y, onAjouter, onFermer }) {
  const [fichier, setFichier] = useState(null);
  if (fichier) {
    if (!typeDe(fichier.name, fichier.type)) {
      toast.warning("Ce format ne se convertit pas ici", { description: "PDF, images, Word et texte se convertissent. Le fichier peut être rangé tel quel." });
      onFermer();
      return null;
    }
    return <Roue x={x} y={y} nom={fichier.name} mime={fichier.type} fichier={fichier} onAjouter={onAjouter} onFermer={onFermer} />;
  }
  return createPortal(
    <div className="fixed inset-0 z-[90]" onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDragLeave={(e) => { if (!e.relatedTarget) onFermer(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer?.files?.[0]; if (f) setFichier(f); else onFermer(); }}>
      <div className="absolute grid h-[150px] w-[150px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-trait bg-fond/55 text-center text-[12.5px] text-craie shadow-[0_18px_40px_rgb(0_0_0/0.18)] backdrop-blur-xl duration-200 animate-in fade-in-0 zoom-in-95"
        style={{ left: x, top: y }}>
        <span className="px-5">Lâchez pour voir les conversions</span>
      </div>
    </div>,
    document.body,
  );
}
