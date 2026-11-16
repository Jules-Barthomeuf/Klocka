import React, { useId } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, LabelList, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { Check } from "lucide-react";
import { J, alpha } from "@/design/jetons";

// La santé financière du locataire en graphiques (16 nov. 2026, Jules : « je veux de beaux graphiques, pas tous les
// mêmes ») : deux chiffres en tête (chiffre d'affaires et résultat du dernier exercice, avec leur évolution), puis trois
// dessins différents. Le chiffre d'affaires en courbe remplie d'un dégradé ; le résultat en barres de part et d'autre de
// zéro, l'accent pour un bénéfice, l'alerte pour une perte ; les annonces BODACC sur une frise de cinq ans, un point par
// annonce à sa couleur. Sans chiffre, le dessin reste là, en gris pointillé, et dit pourquoi.

export const enMillions = (n) => (n == null ? "—" : Math.abs(n) >= 1e9 ? `${String(Math.round(n / 1e8) / 10).replace(".", ",")} Md€` : Math.abs(n) >= 1e6 ? `${String(Math.round(n / 1e5) / 10).replace(".", ",")} M€` : Math.abs(n) >= 1e3 ? `${Math.round(n / 1e3).toLocaleString("fr-FR")} k€` : `${Math.round(n)} €`);
const pct = (a, b) => (a != null && b ? Math.round(((a - b) / Math.abs(b)) * 1000) / 10 : null);
const TICK = { fill: J["brume"], fontSize: 11.5 };

/** Un chiffre en tête : libellé, valeur, et l'évolution sur l'exercice d'avant en pastille. */
function Chiffre({ libelle, valeur, annee, evolution = null, perte = false, vide = false }) {
  const hausse = evolution != null && evolution >= 0;
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[12px] border border-trait bg-encre/[0.025] px-3.5 py-3">
      <span className="text-[12px] text-ardoise">{libelle}{annee ? ` ${annee}` : ""}</span>
      <span className={`text-[22px] leading-none tabular-nums ${vide ? "text-brume" : perte ? "text-alerte" : "text-encre"}`}>{valeur}</span>
      {evolution != null
        ? <span className={`mt-0.5 self-start rounded-full px-2 py-0.5 text-[11.5px] tabular-nums ${hausse ? "bg-menthe/15 text-menthe" : "bg-alerte/15 text-alerte"}`}>{hausse ? "+" : "−"}{String(Math.abs(evolution)).replace(".", ",")} % sur un an</span>
        : <span className="mt-0.5 text-[11.5px] text-brume">{vide ? "non publié" : "un seul exercice"}</span>}
    </div>
  );
}

const Titre = ({ children, note = null }) => (
  <p className="m-0 flex items-baseline justify-between gap-3 text-[12.5px] text-ardoise"><span>{children}</span>{note && <span className="text-[11.5px] text-brume">{note}</span>}</p>
);

/** Le chiffre d'affaires en courbe remplie ; sans chiffre, une ligne grise pointillée à mi-hauteur. */
function CourbeCa({ lignes }) {
  const id = useId().replace(/:/g, "");
  const vide = !lignes.some((x) => x.ca != null);
  const donnees = vide ? lignes.map((x) => ({ ...x, ca: 1 })) : lignes;
  return (
    <div className="relative h-[132px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={donnees} margin={{ top: 22, right: 30, bottom: 0, left: 30 }}>
          <defs>
            <linearGradient id={`ca-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={J["menthe"]} stopOpacity={0.45} />
              <stop offset="100%" stopColor={J["menthe"]} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="annee" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis hide domain={vide ? [0, 2] : [(min) => Math.max(0, min * 0.85), (max) => max * 1.05]} />
          <Area type="monotone" dataKey="ca" connectNulls isAnimationActive={false}
            stroke={vide ? alpha("encre", 0.18) : J["menthe"]} strokeWidth={vide ? 1.5 : 2} strokeDasharray={vide ? "4 5" : undefined}
            fill={vide ? "transparent" : `url(#ca-${id})`}
            dot={vide ? false : { r: 3, fill: J["menthe"], stroke: J["menthe"] }}>
            {!vide && <LabelList dataKey="ca" position="top" offset={8} formatter={(v) => (v == null ? "" : enMillions(v))} style={{ fill: J["craie"], fontSize: 11.5 }} />}
          </Area>
        </AreaChart>
      </ResponsiveContainer>
      {vide && <span className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-[12px] text-brume">Chiffre d'affaires non publié</span>}
    </div>
  );
}

/** Le résultat en barres autour de zéro ; sans chiffre, des barres fantômes grises. */
function BarresResultat({ lignes }) {
  const vide = !lignes.some((x) => x.res != null);
  // Une année sans chiffre garde sa place : une barre fantôme grise, au quart de la plus grande.
  const max = Math.max(...lignes.map((x) => Math.abs(x.res || 0)), 0);
  const donnees = lignes.map((x, i) => (vide ? { ...x, res: null, fantome: [0.5, 0.8, 0.6, 0.9, 0.7][i % 5] } : { ...x, fantome: x.res == null ? max * 0.25 : null }));
  return (
    <div className="relative h-[150px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={donnees} margin={{ top: 20, right: 18, bottom: 0, left: 18 }} barCategoryGap="34%">
          <XAxis dataKey="annee" tick={TICK} axisLine={false} tickLine={false} interval={0} />
          <YAxis hide domain={vide ? [0, 1] : [(min) => Math.min(0, min * 1.25), (haut) => Math.max(0, haut * 1.25)]} />
          <ReferenceLine y={0} stroke={alpha("encre", 0.22)} strokeDasharray="3 4" />
          <Bar dataKey="fantome" stackId="r" radius={[6, 6, 6, 6]} fill={alpha("encre", 0.07)} isAnimationActive={false} />
          <Bar dataKey="res" stackId="r" radius={[6, 6, 6, 6]} isAnimationActive={false}>
            {donnees.map((x) => <Cell key={x.annee} fill={x.res != null && x.res < 0 ? J["alerte"] : J["menthe"]} />)}
            {!vide && <LabelList dataKey="res" position="top" content={({ x, y, width, height, value }) => {
              if (value == null) return null;
              const perte = value < 0;
              // Recharts donne une hauteur négative pour une barre sous zéro : le bas de la barre est le plus grand des deux.
              const ty = perte ? Math.max(y, y + height) + 14 : Math.min(y, y + height) - 6;
              return <text x={x + width / 2} y={ty} textAnchor="middle" fontSize={11.5} fill={perte ? J["alerte"] : J["craie"]}>{`${perte ? "−" : ""}${enMillions(Math.abs(value))}`}</text>;
            }} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {vide && <span className="pointer-events-none absolute inset-x-0 top-[34%] text-center text-[12px] text-brume">Résultat non publié</span>}
    </div>
  );
}

const COULEUR_FAMILLE = { procedures: "bg-alerte", cessions: "bg-menthe", courantes: "bg-ardoise" };

/** Les annonces BODACC sur une frise de cinq ans : un point par annonce, à la couleur de sa famille. */
function FriseBodacc({ parAnnee }) {
  const lu = !!parAnnee;
  const ans = parAnnee || [];
  const total = ans.reduce((n, x) => n + x.procedures + x.cessions + x.courantes, 0);
  const procedures = ans.reduce((n, x) => n + x.procedures, 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <div className="absolute inset-x-0 top-[13px] h-px bg-trait" />
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${Math.max(ans.length, 5)}, minmax(0, 1fr))` }}>
          {(lu ? ans : [0, 1, 2, 3, 4].map((i) => ({ annee: new Date().getFullYear() - 4 + i, procedures: 0, cessions: 0, courantes: 0 }))).map((x) => {
            const points = [...Array(x.procedures).fill("procedures"), ...Array(x.cessions).fill("cessions"), ...Array(x.courantes).fill("courantes")];
            return (
              <div key={x.annee} className="flex flex-col items-center gap-2">
                <div className="flex h-[26px] items-center gap-1">
                  {points.length
                    ? points.slice(0, 6).map((f, k) => <span key={k} className={`h-2.5 w-2.5 rounded-full ring-2 ring-fond ${COULEUR_FAMILLE[f]}`} />)
                    : <span className={`h-2 w-2 rounded-full ${lu ? "bg-encre/20" : "border border-dashed border-encre/25"}`} />}
                  {points.length > 6 && <span className="text-[11px] text-ardoise">+{points.length - 6}</span>}
                </div>
                <span className="text-[11.5px] tabular-nums text-brume">{x.annee}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!lu ? <p className="m-0 text-[12px] text-brume">BODACC non lu.</p>
        : procedures === 0
          ? <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-menthe/15 px-2.5 py-1 text-[12px] text-menthe"><Check className="h-3.5 w-3.5" />Aucune procédure collective en 5 ans{total ? ` · ${total} annonce${total > 1 ? "s" : ""} de vie courante ou de cession` : ""}</span>
          : <span className="inline-flex items-center gap-1.5 self-start rounded-full bg-alerte/15 px-2.5 py-1 text-[12px] text-alerte">{procedures} procédure{procedures > 1 ? "s" : ""} collective{procedures > 1 ? "s" : ""} ou radiation en 5 ans</span>}
    </div>
  );
}

/**
 * La colonne de droite de la santé du locataire.
 * @param {{ historique: Array<{exercice, chiffre_affaires, resultat_net}>, parAnnee: Array|null, note: string|null, lienBodacc: string|null, alerteProcedure: string|null }} props
 */
export default function GraphesSante({ historique = [], parAnnee = null, note = null, lienBodacc = null, alerteProcedure = null, groupeCite = null }) {
  const h = historique || [];
  const fin = h.length ? Math.max(...h.map((x) => x.exercice)) : new Date().getFullYear() - 1;
  const lignes = Array.from({ length: 5 }, (_, i) => fin - 4 + i).map((a) => {
    const x = h.find((y) => y.exercice === a);
    return { annee: a, ca: x?.chiffre_affaires ?? null, res: x?.resultat_net ?? null, caGroupe: !!x?.ca_groupe, resGroupe: !!x?.res_groupe };
  });
  const avecCa = lignes.filter((x) => x.ca != null);
  const avecRes = lignes.filter((x) => x.res != null);
  const caD = avecCa[avecCa.length - 1];
  const caA = avecCa[avecCa.length - 2];
  const resD = avecRes[avecRes.length - 1];
  const resA = avecRes[avecRes.length - 2];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2.5">
        <Chiffre libelle={caD?.caGroupe ? "Chiffre d'affaires du groupe" : "Chiffre d'affaires"} annee={caD?.annee} valeur={caD ? enMillions(caD.ca) : "—"} evolution={caD && caA ? pct(caD.ca, caA.ca) : null} vide={!caD} />
        <Chiffre libelle={resD?.resGroupe ? "Résultat net du groupe" : "Résultat net"} annee={resD?.annee} valeur={resD ? `${resD.res < 0 ? "−" : ""}${enMillions(Math.abs(resD.res))}` : "—"} evolution={resD && resA ? pct(resD.res, resA.res) : null} perte={resD?.res < 0} vide={!resD} />
      </div>
      {/* Le groupe cité à gauche n'est pas la société (16 nov. 2026, Jules : « à gauche 3,4 Md, à droite 836 M ») : on le dit. */}
      {groupeCite?.chiffre_affaires && (!caD || Math.abs(groupeCite.chiffre_affaires - caD.ca) > caD.ca * 0.1) && (
        <p className="m-0 text-[12px] leading-[1.45] text-ardoise">Chiffres de la société seule. Son groupe, cité dans la réponse à gauche : {enMillions(groupeCite.chiffre_affaires)} de chiffre d'affaires en {groupeCite.exercice}.</p>
      )}
      {/* Des comptes qui s'arrêtent (16 nov. 2026) : on dit qu'il n'y a rien de publié depuis, plutôt que des années vides. */}
      {h.length > 0 && fin < new Date().getFullYear() - 2 && (
        <p className="m-0 rounded-[10px] bg-encre/[0.04] px-3 py-2 text-[12.5px] leading-[1.45] text-craie">Aucun compte publié après {fin} : comptes confidentiels ou non déposés depuis. Les cinq derniers exercices publiés sont montrés.</p>
      )}
      <div className="flex flex-col gap-1">
        <Titre note={note}>{lignes.some((x) => x.caGroupe) ? "Chiffre d'affaires (du groupe quand la société seule n'est pas publiée)" : "Chiffre d'affaires"}</Titre>
        <CourbeCa lignes={lignes} />
      </div>
      <div className="flex flex-col gap-1">
        <Titre note={note}>Résultat net</Titre>
        <BarresResultat lignes={lignes} />
      </div>
      <div className="flex flex-col gap-2.5 border-t border-trait pt-4">
        <Titre note={lienBodacc ? <a href={lienBodacc} target="_blank" rel="noreferrer" className="text-menthe hover:underline">BODACC</a> : null}>Annonces légales</Titre>
        <FriseBodacc parAnnee={parAnnee} />
        {alerteProcedure && <p className="m-0 text-[13px] text-alerte">{alerteProcedure}</p>}
        <p className="m-0 flex flex-wrap gap-x-4 text-[11.5px] text-ardoise">
          {[["bg-alerte", "procédure, radiation"], ["bg-menthe", "cession"], ["bg-ardoise", "vie courante"]].map(([c, m]) => <span key={m} className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${c}`} />{m}</span>)}
        </p>
      </div>
    </div>
  );
}
