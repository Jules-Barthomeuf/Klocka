import React from "react";

// Les loyers sur une même règle, en €/m²/an.
//
// Une bande « Marché » pour la source de tête (Equimmox), une ligne ambrée
// pour le loyer en place, et une barre par source avec sa fourchette. On lit
// d'un coup d'œil si le locataire paie dans le marché, au-dessus, ou en
// dessous, et si les sources se recouvrent.

const fmt = (n) => (n == null ? "—" : Math.round(n).toLocaleString("fr-FR"));
const MONT = { fontFamily: "Montserrat, 'Instrument Sans', system-ui, sans-serif", fontVariantNumeric: "tabular-nums" };

/** L'échelle : de quarante en quarante, avec de l'air aux deux bouts. Pure. */
export function echelleDe(valeurs, pas = 40) {
  const v = valeurs.filter((x) => Number.isFinite(x));
  if (!v.length) return null;
  const min = Math.floor((Math.min(...v) - pas / 4) / pas) * pas;
  const max = Math.ceil((Math.max(...v) + pas / 4) / pas) * pas;
  const n = Math.max(1, Math.round((max - min) / pas));
  return { min, max: max > min ? max : min + pas, graduations: Array.from({ length: n + 1 }, (_, i) => min + i * pas) };
}

export default function GraphiqueLoyers({ lectures = [], enPlace = null }) {
  const utiles = lectures.filter((l) => l.bas != null && l.haut != null);
  if (!utiles.length && enPlace == null) return null;
  const echelle = echelleDe([...utiles.flatMap((l) => [l.bas, l.haut]), enPlace]);
  if (!echelle) return null;
  const x = (v) => `${Math.min(100, Math.max(0, ((v - echelle.min) / (echelle.max - echelle.min)) * 100))}%`;
  const largeur = (a, b) => `${Math.max(0.6, ((b - a) / (echelle.max - echelle.min)) * 100)}%`;
  const tete = utiles.find((l) => l.principale) || utiles[0] || null;
  const grille = { backgroundImage: "linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)", backgroundSize: `${100 / (echelle.graduations.length - 1)}% 100%` };

  return (
    <div className="mt-[62px] grid items-center gap-x-[22px]" style={{ gridTemplateColumns: "196px minmax(0,1fr)" }}>
      <div />
      <div className="relative h-[92px]" style={grille}>
        <div className="absolute inset-x-0 bottom-0 h-px" style={{ background: "rgba(255,255,255,0.14)" }} />
        {tete && (
          <>
            <div className="absolute bottom-0 top-[38px]" style={{ left: x(tete.bas), width: largeur(tete.bas, tete.haut), background: "linear-gradient(180deg,rgba(150,192,184,0.03),rgba(150,192,184,0.28))", borderLeft: "1px solid rgba(150,192,184,0.5)", borderRight: "1px solid rgba(150,192,184,0.5)", boxShadow: "0 0 44px rgba(150,192,184,0.18)" }} />
            <div className="absolute top-[14px] text-center" style={{ left: x(tete.bas), width: largeur(tete.bas, tete.haut) }}>
              <span className="text-[11px] uppercase tracking-[.12em] text-[#96c0b8]" style={MONT}>Marché</span>
            </div>
            {tete.median != null && <div className="absolute bottom-0 top-[38px] w-px" style={{ left: x(tete.median), background: "rgba(150,192,184,0.6)" }} />}
          </>
        )}
        {enPlace != null && (
          <>
            <div className="absolute bottom-0 top-[22px] w-[2px]" style={{ left: x(enPlace), background: "#e0a45e", boxShadow: "0 0 22px rgba(224,164,94,0.55)" }} />
            <div className="absolute -top-[30px] flex -translate-x-1/2 items-center gap-[9px] whitespace-nowrap rounded-full px-[15px] py-[7px]" style={{ left: x(enPlace), background: "rgba(224,164,94,0.1)", border: "1px solid rgba(224,164,94,0.45)" }}>
              <span className="text-[9.5px] font-medium uppercase tracking-[.14em] text-[#e0a45e]" style={MONT}>En place</span>
              <span className="text-[15px] text-[#F3F7F5]" style={MONT}>{fmt(enPlace)}</span>
            </div>
          </>
        )}
      </div>

      {utiles.map((l, i) => {
        const principale = l === tete;
        const finHaut = ((l.haut - echelle.min) / (echelle.max - echelle.min)) * 100;
        const texteADroite = finHaut < 78;
        return (
          <React.Fragment key={`${l.service}-${i}`}>
            <div className="py-4 text-right">
              <div className="text-[14.5px]" style={{ color: principale ? "#F3F7F5" : "#C3CBC7" }}>{l.service}</div>
              {l.sous && <div className="mt-[3px] text-[12px] text-[#8B938F]">{l.sous}</div>}
            </div>
            <div className="relative h-[30px]" style={{ ...grille, backgroundImage: "linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)" }}>
              <div className="absolute top-[11px] h-[8px] rounded-full" style={{ left: x(l.bas), width: largeur(l.bas, l.haut), background: principale ? "#96c0b8" : "rgba(90,103,98,0.85)" }} />
              <span className="absolute top-[6px] whitespace-nowrap text-[12.5px]" style={{ ...MONT, color: principale ? "#C3CBC7" : "#8B938F", ...(texteADroite ? { left: `calc(${x(l.haut)} + 12px)` } : { right: `calc(100% - ${x(l.bas)} + 12px)` }) }}>
                {fmt(l.bas)} – {fmt(l.haut)}
              </span>
            </div>
          </React.Fragment>
        );
      })}

      <div />
      <div className="relative mt-1 h-[26px] text-[10.5px] text-[#8B938F]" style={MONT}>
        {echelle.graduations.map((g, i) => {
          const premier = i === 0;
          const dernier = i === echelle.graduations.length - 1;
          return (
            <span key={g} className="absolute top-[6px]" style={premier ? { left: 0 } : dernier ? { right: 0 } : { left: x(g), transform: "translateX(-50%)" }}>
              {fmt(g)}
            </span>
          );
        })}
      </div>
    </div>
  );
}
