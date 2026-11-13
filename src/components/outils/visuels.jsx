import React from "react";

// Les visuels du Marché (12 nov. 2026, Jules : « plus visuel », « juste les trucs graphiques à la place des tableaux ») :
// une jauge à zones, des fourchettes sur une échelle commune, des valeurs en points sur un axe, une frise, des événements
// en calendrier (années × mois), le ruban d'une rue, des barres couchées. En jetons seulement, comme les graphiques du design
// system : une série prend la menthe, « non lu » prend `brume`, l'alerte ne dit qu'un état, « à voir » prend l'accent atténué (plus d'ambre, 12 nov. 2026, Jules : « trop de couleurs ») ; chaque visuel
// porte sa légende en 11,5 px `brume`.

const MARQUE = { ok: "bg-menthe", a_voir: "bg-menthe/55", alerte: "bg-alerte", vide: "bg-brume" };
const ZONE = { ok: "bg-menthe/15", a_voir: "bg-menthe/35", alerte: "bg-alerte/20" };
const borne = (x) => Math.max(0, Math.min(100, x));
const nombre = (n) => (n == null ? "—" : Number(n).toLocaleString("fr-FR"));
const jour = (d) => (d ? String(d).slice(0, 10).split("-").reverse().join("/") : "—");
const annee = (d) => (d ? Number(String(d).slice(0, 4)) : null);

export const Legende = ({ items }) => <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-brume">{items.map(([classe, mot]) => <span key={mot} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${classe}`} />{mot}</span>)}</p>;

/** Une jauge : des zones colorées de `min` à `max`, des repères posés dessus avec leur mot, des graduations dessous. */
export function Jauge({ min, max, zones = [], marques = [], graduations = [], unite = (v) => String(v) }) {
  const pos = (v) => borne(((v - min) / (max - min || 1)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-9">
        <div className="absolute inset-x-0 top-5 h-2 overflow-hidden rounded-full bg-relief">
          {zones.map((z, i) => <div key={i} className={`absolute inset-y-0 ${ZONE[z.statut]}`} style={{ left: `${pos(z.de)}%`, width: `${Math.max(0, pos(z.a) - pos(z.de))}%` }} />)}
        </div>
        {marques.map((m, i) => (
          <div key={i} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pos(m.valeur)}%` }}>
            <span className={`whitespace-nowrap text-[11.5px] tabular-nums ${m.sourd ? "text-ardoise" : "text-encre"}`}>{m.texte ?? unite(m.valeur)}</span>
            <span className={`mt-0.5 h-4 w-[2px] rounded-full ${m.sourd ? "bg-ardoise" : MARQUE[m.statut] || "bg-encre"}`} />
          </div>
        ))}
      </div>
      {graduations.length > 0 && <div className="relative h-4 text-[11px] text-brume">{graduations.map((g) => <span key={g} className="absolute -translate-x-1/2 whitespace-nowrap tabular-nums" style={{ left: `${pos(g)}%` }}>{unite(g)}</span>)}</div>}
    </div>
  );
}

/** Des fourchettes sur une échelle commune : une ligne par échelle (bas à haut), la moyenne en tiret menthe, le bien en trait. */
export function Fourchettes({ lignes, bien = null, unite = (v) => String(v) }) {
  const valeurs = lignes.flatMap((l) => [l.bas, l.haut, l.moyenne]).concat(bien ?? []).filter((v) => Number.isFinite(v));
  if (!valeurs.length) return null;
  const max = Math.max(...valeurs) * 1.12;
  const pos = (v) => borne((v / max) * 100);
  return (
    <div className="flex flex-col gap-2">
      {lignes.map((l) => (
        <div key={l.nom} className="grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 text-[12.5px] max-md:grid-cols-[80px_minmax(0,1fr)_56px]">
          <span className="truncate text-ardoise">{l.nom}</span>
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-[9px] h-1.5 rounded-full bg-relief" />
            {Number.isFinite(l.bas) && Number.isFinite(l.haut) && <div className="absolute top-[9px] h-1.5 rounded-full bg-menthe/35" style={{ left: `${pos(l.bas)}%`, width: `${Math.max(0.8, pos(l.haut) - pos(l.bas))}%` }} />}
            {Number.isFinite(l.moyenne) && <span className="absolute top-[5px] h-[14px] w-[2px] -translate-x-1/2 rounded-full bg-menthe" style={{ left: `${pos(l.moyenne)}%` }} />}
            {Number.isFinite(bien) && <span className="absolute top-0 h-6 w-[2px] -translate-x-1/2 bg-encre" style={{ left: `${pos(bien)}%` }} />}
          </div>
          <span className="text-right tabular-nums text-craie">{Number.isFinite(l.moyenne) ? unite(l.moyenne) : "—"}</span>
        </div>
      ))}
      <Legende items={[["bg-menthe/35", "de bas à haut"], ["bg-menthe", "moyenne"], ...(Number.isFinite(bien) ? [["bg-encre", `le bien, ${unite(bien)}`]] : [])]} />
    </div>
  );
}

/** Des valeurs en points sur un axe : la boîte du milieu (du premier au troisième quart), la médiane, le bien. */
export function PointsSurAxe({ points, boite = null, bien = null, unite = (v) => String(v) }) {
  const tout = points.concat(bien ?? []).filter((v) => Number.isFinite(v));
  if (!tout.length) return null;
  const min = Math.min(...tout) * 0.9;
  const max = Math.max(...tout) * 1.08;
  const pos = (v) => borne(((v - min) / (max - min || 1)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-14">
        {boite && Number.isFinite(boite.bas) && Number.isFinite(boite.haut) && <div className="absolute top-6 h-6 rounded-[4px] bg-menthe/15" style={{ left: `${pos(boite.bas)}%`, width: `${Math.max(0.8, pos(boite.haut) - pos(boite.bas))}%` }} />}
        {boite && Number.isFinite(boite.median) && <span className="absolute top-5 h-8 w-[2px] -translate-x-1/2 rounded-full bg-menthe" style={{ left: `${pos(boite.median)}%` }} />}
        <div className="absolute inset-x-0 top-[38px] h-px bg-trait" />
        {points.map((v, i) => <span key={i} className="absolute h-2 w-2 -translate-x-1/2 rounded-full bg-craie/80" style={{ left: `${pos(v)}%`, top: `${32 + ((i * 7) % 3) * 4}px` }} title={unite(v)} />)}
        {Number.isFinite(bien) && (
          <div className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${pos(bien)}%` }}>
            <span className="whitespace-nowrap text-[11.5px] tabular-nums text-encre">le bien, {unite(bien)}</span>
            <span className="mt-0.5 h-9 w-[2px] bg-encre" />
          </div>
        )}
      </div>
      <div className="flex justify-between text-[11px] tabular-nums text-brume"><span>{unite(Math.round(min))}</span><span>{unite(Math.round(max))}</span></div>
      <Legende items={[["bg-craie/80", "une vente"], ["bg-menthe/40", "la moitié du milieu"], ["bg-menthe", boite?.median != null ? `médiane ${unite(boite.median)}` : "médiane"]]} />
    </div>
  );
}

/**
 * Une frise : une barre par ligne, de `de` à `a` (aujourd'hui si ouverte), sur une fenêtre d'années (12 nov. 2026, Jules,
 * sur une image) : les années en haut avec leurs filets, le nom en 12,5 px (`encre` ouvert, `brume` fermé), l'ouvert en
 * barre pleine d'accent, le fermé en contour `brume`.
 */
export function Frise({ lignes, annees = 10 }) {
  const fin = new Date();
  const debut = new Date(fin.getFullYear() - annees, fin.getMonth(), 1);
  const t = (d) => (d ? new Date(d).getTime() : fin.getTime());
  const pos = (ms) => borne(((ms - debut.getTime()) / (fin.getTime() - debut.getTime())) * 100);
  // Les années entières dans la fenêtre : la première, entamée, ne se grave pas (son chiffre se collait au suivant).
  const reperes = Array.from({ length: Math.floor(annees / 2) + 1 }, (_, i) => fin.getFullYear() - annees + i * 2).filter((a) => new Date(a, 0, 1) >= debut);
  const colonnes = "grid grid-cols-[minmax(0,42%)_minmax(0,1fr)] items-center max-md:grid-cols-[minmax(0,38%)_minmax(0,1fr)]";
  return (
    <div className="flex flex-col">
      <div className={colonnes}><span /><div className="relative h-5 text-[11px] text-brume">{reperes.map((a) => <span key={a} className="absolute -translate-x-1/2 tabular-nums" style={{ left: `${pos(new Date(a, 0, 1).getTime())}%` }}>{a}</span>)}</div></div>
      {lignes.map((l, i) => {
        const de = pos(t(l.de));
        const a = pos(t(l.a));
        return (
          <div key={i} className={colonnes}>
            <span className={`truncate pr-3 text-[12.5px] uppercase ${l.actif ? "text-encre" : "text-brume"}`} title={l.nom}>{l.nom}</span>
            <div className="relative h-[30px]">
              {reperes.map((an) => <span key={an} className="absolute inset-y-0 w-px bg-trait" style={{ left: `${pos(new Date(an, 0, 1).getTime())}%` }} />)}
              <span className={`absolute top-[11px] h-2 rounded-full ${l.actif ? "bg-menthe" : "border border-brume"}`} style={{ left: `${de}%`, width: `${Math.max(1.5, a - de)}%` }} title={`${annee(l.de) ?? "?"} → ${l.a ? annee(l.a) : "aujourd'hui"}`} />
            </div>
          </div>
        );
      })}
      <p className="m-0 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-brume">
        <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-full bg-menthe" />ouvert aujourd'hui</span>
        <span className="inline-flex items-center gap-2"><span className="h-2 w-5 rounded-full border border-brume" />fermé</span>
      </p>
    </div>
  );
}

const FAMILLE_COULEUR = (e) => (e.famille === "collective" || /liquidation|redressement|sauvegarde/i.test(e.type || "") ? "bg-alerte" : e.famille === "radiation" ? "bg-alerte" : e.famille === "vente" || /vente|cession/i.test(e.type || "") ? "bg-menthe" : "bg-brume");
const GRAVITE = { "bg-alerte": 3, "bg-menthe": 2, "bg-brume": 1 };
const MOIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
/**
 * Des événements en calendrier (12 nov. 2026, Jules, sur une image) : une rangée par année sur cinq ans, une case par
 * mois ; un mois qui a un avis prend la couleur du plus grave, son détail au survol. Les mois à venir s'estompent.
 */
export function Calendrier({ evenements, annees = 5 }) {
  const maintenant = new Date();
  const fin = maintenant.getFullYear();
  const liste = Array.from({ length: annees }, (_, i) => fin - annees + 1 + i);
  const parMois = {};
  for (const e of evenements) {
    const d = String(e.date || "").slice(0, 7);
    if (!d) continue;
    (parMois[d] ||= []).push(e);
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[40px_repeat(12,minmax(0,1fr))] gap-[3px] text-[11.5px] tabular-nums text-brume">
        <span />
        {MOIS.map((m, i) => <span key={i} className="text-center">{m}</span>)}
        {liste.map((a) => (
          <React.Fragment key={a}>
            <span className="leading-[18px]">{a}</span>
            {MOIS.map((_, m) => {
              const evs = parMois[`${a}-${String(m + 1).padStart(2, "0")}`] || [];
              const couleur = evs.map(FAMILLE_COULEUR).sort((x, y) => GRAVITE[y] - GRAVITE[x])[0];
              const avenir = a === fin && m > maintenant.getMonth();
              return <span key={m} className={`h-[18px] rounded-[4px] ${couleur || "bg-relief"} ${avenir ? "opacity-40" : ""}`} title={evs.length ? evs.map((e) => `${jour(e.date)} · ${e.type}`).join("\n") : undefined} />;
            })}
          </React.Fragment>
        ))}
      </div>
      <Legende items={[["bg-alerte", "procédure, radiation"], ["bg-menthe", "cession"], ["bg-brume", "vie courante"]]} />
    </div>
  );
}

/** Le ruban d'une rue : une case par cellule, un trottoir par parité ; vide en alerte, le local en menthe. */
export function Ruban({ cellules, cleLocal }) {
  const cote = (pair) => [...cellules].filter((c) => (Number(c.numero) % 2 === 0) === pair).sort((a, b) => a.numero - b.numero);
  const rangee = (liste, nom) => (
    <div className="flex items-center gap-2">
      <span className="w-20 flex-none text-[11.5px] text-brume max-md:w-14">{nom}</span>
      <div className="flex min-w-0 flex-wrap gap-1">
        {liste.map((c) => (
          <span key={c.cle} title={`${c.cle} · ${c.etat === "vacant" ? `vide depuis ${annee(c.dernier?.ferme_le) ?? "?"} (${c.dernier?.nom || "?"})` : (c.occupants || []).map((o) => o.nom).join(", ")}${c.enseigne_nationale ? " · enseigne nationale" : ""}`}
            className={`grid h-4 w-4 place-items-center rounded-[4px] ${c.cle === cleLocal ? "bg-menthe ring-2 ring-menthe/40" : c.etat === "vacant" ? "bg-alerte/80" : c.enseigne_nationale ? "bg-craie/70" : "bg-brume/45"}`}>
            {c.cle === cleLocal && <span className="h-1.5 w-1.5 rounded-full bg-sur-menthe" />}
          </span>
        ))}
      </div>
      <span className="flex-none text-[11px] tabular-nums text-brume">{liste.length ? `${liste[0].numero} à ${liste[liste.length - 1].numero}` : ""}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      {rangee(cote(false), "Côté impair")}
      {rangee(cote(true), "Côté pair")}
      <Legende items={[["bg-menthe", "le local"], ["bg-brume/45", "commerce ouvert"], ["bg-craie/70", "enseigne nationale"], ["bg-alerte/80", "vide au registre"]]} />
    </div>
  );
}

/**
 * Des barres couchées : un libellé, une barre proportionnelle au plus grand, la valeur (12 nov. 2026, Jules, sur une
 * image) : lu, le libellé en `encre` et la barre d'accent sans piste ; « non lu », le libellé en `brume` et un pointillé.
 */
export function Barres({ lignes, max = null, format = (v) => nombre(v), largeurLibelle = "150px" }) {
  const plafond = max ?? Math.max(...lignes.map((l) => l.valeur || 0), 1);
  return (
    <div className="flex flex-col">
      {lignes.map((l) => (
        <div key={l.nom} className="grid h-8 items-center gap-4 text-[12.5px]" style={{ gridTemplateColumns: `${largeurLibelle} minmax(0,1fr) 64px` }}>
          <span className={`truncate ${l.valeur == null ? "text-brume" : "text-encre"}`} title={l.nom}>{l.nom}</span>
          {l.valeur == null
            ? <div className="border-t border-dotted border-brume/60" />
            : <div className="relative h-2"><div className={`absolute inset-y-0 left-0 rounded-full ${l.couleur || "bg-menthe"}`} style={{ width: `${Math.max(2, borne((l.valeur / plafond) * 100))}%` }} /></div>}
          <span className={`text-right tabular-nums ${l.valeur == null ? "text-brume" : "text-encre"}`}>{l.valeur == null ? "non lu" : format(l.valeur, l)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Une jauge fine (12 nov. 2026, Jules, sur une image) : une bande de 4 px, ses zones teintées sans légende, la valeur en
 * trait `encre` de 22 px, les seuils dessous en 11 px `brume`.
 */
const ZONE_FINE = { ok: "bg-relief", a_voir: "bg-menthe/45", alerte: "bg-alerte/55" };
export function JaugeFine({ min, max, valeur, zones = [], graduations = [], unite = (v) => String(v) }) {
  const pos = (v) => borne(((v - min) / (max - min || 1)) * 100);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-[10px] h-1 overflow-hidden rounded-full bg-relief">
          {zones.map((z, i) => <div key={i} className={`absolute inset-y-0 ${ZONE_FINE[z.statut]}`} style={{ left: `${pos(z.de)}%`, width: `${Math.max(0, pos(z.a) - pos(z.de))}%` }} />)}
        </div>
        {Number.isFinite(valeur) && <span className="absolute top-0 h-[22px] w-[2px] -translate-x-1/2 rounded-full bg-encre" style={{ left: `${pos(valeur)}%` }} />}
      </div>
      {graduations.length > 0 && (
        <div className="relative h-4 text-[11px] tabular-nums text-brume">
          {graduations.map((g, i) => <span key={g} className={`absolute whitespace-nowrap ${i === 0 ? "" : i === graduations.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${pos(g)}%` }}>{unite(g)}</span>)}
        </div>
      )}
    </div>
  );
}

/** Un anneau (12 nov. 2026, Jules, sur une image) : la part en accent, le reste en `brume`, le chiffre au centre. */
export function Anneau({ part, taille = 128, epaisseur = 12, texte = null }) {
  const r = (taille - epaisseur) / 2;
  const tour = 2 * Math.PI * r;
  const plein = (borne(part) / 100) * tour;
  return (
    <div className="relative flex-none" style={{ width: taille, height: taille }}>
      <svg width={taille} height={taille} viewBox={`0 0 ${taille} ${taille}`} className="-rotate-90" aria-hidden>
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth={epaisseur} className="stroke-brume/50" />
        <circle cx={taille / 2} cy={taille / 2} r={r} fill="none" strokeWidth={epaisseur} strokeDasharray={`${plein} ${tour}`} className="stroke-menthe" />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[20px] tabular-nums text-encre">{texte ?? `${Math.round(part)} %`}</span>
    </div>
  );
}
