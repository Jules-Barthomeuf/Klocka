import React from "react";
import { ArrowUp, ChevronDown, Mic, Square } from "lucide-react";
import { J, alpha } from "@/design/jetons";
import BordureEcoute from "@/components/BordureEcoute";

// La barre de chat de Klocka : une pilule, la même partout.
//
// À gauche une vignette qui ouvre ce que l'écran propose (les modes du
// dashboard, le répertoire de questions du marché, la profondeur du dossier).
// Au milieu ce qu'on tape. À droite les gestes en ronds, la voix, et l'envoi
// en menthe. Une note collée sur plusieurs lignes arrondit la pilule au lieu
// de la faire déborder.
//
// Ce qui change d'un chat à l'autre tient dans `menu` et `actions` ; le reste
// est identique, et c'est le but : trois composeurs dessinés différemment
// pour le même geste, c'était trois occasions de se tromper.

// Le gris de la barre et celui des ronds posés dessus : deux jetons, les
// mêmes que la barre du dashboard, pour que les chats soient un seul objet.
// Opaques : le menu qui descend de la vignette ne laisse rien passer.
const OPAQUE = { backgroundColor: J["barre"] };
const ROND = J["barre-relief"];
// Un filet, pas un cadre : sur un fond noir et derrière un halo, la pilule se
// confondait avec la page. Assez pour dire où elle commence, pas assez pour
// qu'on le remarque.
const FILET = `1px solid ${alpha("craie", 0.11)}`;

/** Un rond de la barre : une icône, un titre, un état actif. */
export function RondChat({ icone: Icone, onClick, titre, actif = false, disabled = false, teinte = null }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={actif || undefined}
      aria-label={titre}
      title={titre}
      className="grid h-9 w-9 flex-none place-items-center rounded-full transition-colors disabled:opacity-40"
      style={{ background: actif ? alpha("menthe", 0.2) : ROND, color: actif ? J["menthe"] : teinte || J["ardoise"] }}
    >
      <Icone className="h-4 w-4" />
    </button>
  );
}

export default function BarreChat({
  valeur,
  onChange,
  onEnvoyer,
  onArreter = null,
  placeholder,
  enCours = false,
  disabled = false,
  peutEnvoyer = null,
  // La vignette de gauche : { icone, ouvert, onBasculer, titre, actif, contenu }
  menu = null,
  // Les ronds entre le texte et la voix : [{ icone, onClick, titre, actif, disabled }]
  actions = [],
  // La voix : { supporte, ecoute, onBasculer }
  voix = null,
  className = "",
  ...reste
}) {
  const multiligne = String(valeur || "").includes("\n") || String(valeur || "").length > 90;
  const envoyable = peutEnvoyer != null ? peutEnvoyer : !!String(valeur || "").trim();
  const IconeMenu = menu?.icone;

  return (
    <div className={`relative ${className}`} {...reste}>
      <BordureEcoute actif={!!voix?.ecoute} radius={multiligne ? "30px" : "9999px"}>
      <div
        className={`flex items-center gap-3 py-3 pl-5 pr-3 transition-colors ${multiligne ? "items-end rounded-[30px]" : "rounded-full"}`}
        style={{ ...OPAQUE, border: FILET }}
      >
        {menu && (
          <div className="relative flex-none">
            <button
              type="button"
              onClick={menu.onBasculer}
              aria-expanded={menu.ouvert}
              aria-haspopup="menu"
              aria-label={menu.titre}
              title={menu.titre}
              className="flex items-center gap-1.5 rounded-full px-3 py-2 transition-colors"
              style={{ background: menu.actif ? alpha("menthe", 0.16) : ROND }}
            >
              <IconeMenu className="h-4 w-4" style={{ color: menu.actif ? J["menthe"] : J["ardoise"] }} />
              <ChevronDown className={`h-2.5 w-2.5 text-ardoise transition-transform ${menu.ouvert ? "rotate-180" : ""}`} />
            </button>
            {menu.ouvert && menu.contenu}
          </div>
        )}

        <textarea
          rows={multiligne ? Math.min(6, Math.max(2, String(valeur || "").split("\n").length)) : 1}
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && envoyable && !enCours) { e.preventDefault(); onEnvoyer(); } }}
          placeholder={placeholder}
          disabled={disabled || enCours}
          className="min-w-0 flex-1 resize-none border-0 bg-transparent py-1 text-[15px] leading-[1.5] text-encre outline-none placeholder:text-brume disabled:opacity-50"
        />

        {actions.map((a) => <RondChat key={a.titre} {...a} icone={a.icone} />)}

        {voix && (
          <RondChat
            icone={Mic}
            onClick={voix.onBasculer}
            disabled={enCours}
            actif={voix.ecoute}
            titre={voix.ecoute ? "Arrêter la voix" : "Dicter"}
          />
        )}

        <button
          type="button"
          onClick={() => (enCours && onArreter ? onArreter() : onEnvoyer())}
          disabled={!enCours && !envoyable}
          aria-label={enCours && onArreter ? "Interrompre la requête en cours" : "Envoyer"}
          title={enCours && onArreter ? "Interrompre la requête en cours" : "Envoyer"}
          className="grid h-11 w-11 flex-none place-items-center rounded-full transition-opacity disabled:opacity-45"
          style={{ background: J["menthe"], color: J["sur-menthe"] }}
        >
          {enCours && onArreter ? <Square className="h-3.5 w-3.5" fill="currentColor" /> : <ArrowUp className="h-[17px] w-[17px]" strokeWidth={2} />}
        </button>
      </div>
      </BordureEcoute>
    </div>
  );
}

/**
 * Ce qu'il y a autour de la barre : de l'air, et un halo menthe bord à bord.
 *
 * Le chat est le geste principal de chaque écran ; il lui faut de la place
 * pour se voir, et une couleur derrière pour ne pas flotter sur du noir. Mais
 * le dossier en avait pris deux fois trop — un écran de creux avant les
 * onglets — pendant que le marché n'en avait presque pas. Un seul espacement,
 * celui du marché, partout : quarante pixels au-dessus, quarante-quatre en
 * dessous.
 *
 * Le dashboard garde le sien, bien plus large : là-bas le chat EST la page.
 */
export function ZoneChat({ children, largeur = 880, className = "", espacement = "40px 0 44px" }) {
  return (
    <div className={`relative flex justify-center ${className}`} style={{ padding: espacement }}>
      <div
        aria-hidden
        className="pointer-events-none absolute -left-6 -right-6 top-1/2 h-[150px] -translate-y-1/2"
        style={{
          background: `linear-gradient(90deg, ${alpha("menthe-clair", 0)} 0%, ${alpha("menthe-clair", 0.08)} 28%, ${alpha("menthe-clair", 0.13)} 50%, ${alpha("menthe-clair", 0.08)} 72%, ${alpha("menthe-clair", 0)} 100%)`,
          filter: "blur(34px)",
        }}
      />
      <div className="relative w-full" style={{ maxWidth: largeur }}>{children}</div>
    </div>
  );
}

/** Le menu qui descend d'une vignette : le registre de l'application. */
export function MenuChat({ children, largeur = 340 }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={(e) => e.stopPropagation()} />
      <div
        role="menu"
        className="absolute left-0 top-full z-20 mt-3 overflow-hidden rounded-bloc text-left shadow-[0_20px_50px_rgba(0,0,0,.6)]"
        style={{ width: largeur, ...OPAQUE }}
      >
        {children}
      </div>
    </>
  );
}

/** Un intitulé de section dans le menu. */
export function TitreMenu({ children, premier = false }) {
  return (
    <div className={`px-4 pb-2.5 pt-3.5 ${premier ? "border-b" : "border-y"} border-bord`}>
      <span className="font-pill text-[11px] font-medium uppercase tracking-[.16em] text-ardoise">{children}</span>
    </div>
  );
}
