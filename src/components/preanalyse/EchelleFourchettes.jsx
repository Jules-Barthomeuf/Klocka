import React from "react";
import { J } from "@/design/jetons";

/**
 * Des fourchettes posées sur une même échelle, et un repère en travers.
 *
 * Les lectures de marché rendaient trois lignes de chiffres alignées à
 * droite : « 640 – 960 € », « 272 – 408 € », « 369 – 553 € ». Il fallait les
 * comparer de tête, et surtout situer le loyer du bail au milieu. Sur une
 * échelle commune, la réponse se voit sans lire : la barre de la rue est à
 * droite du trait, celle du quartier à cheval dessus.
 *
 * Trois tons, trois rôles :
 *   primaire   la fourchette de référence, celle sur laquelle porte le verdict
 *   dedans     celle qui contient le repère — teinte ambre, c'est le fait saillant
 *   ordinaire  les autres, présentes pour le contexte
 *
 * Les trois colonnes (libellé, piste, valeur) sont déclarées une fois en
 * variables CSS : le trait du repère et l'axe s'y calent tout seuls, et
 * personne n'a à répéter une largeur en trois endroits.
 */

/**
 * Des bornes rondes qui englobent tout. Un axe qui commencerait à 272 et
 * finirait à 960 ne se lit pas ; 200 à 1 000 se lit d'un coup d'œil.
 */
export function bornesNettes(min, max) {
  if (!isFinite(min) || !isFinite(max)) return [0, 1];
  if (min === max) return [min * 0.9, max * 1.1 || 1];
  const etendue = max - min;
  let pas = Math.pow(10, Math.floor(Math.log10(etendue)));
  // Moins de trois graduations : l'axe serait plus grossier que les données.
  if (etendue / pas < 3) pas /= 2;
  return [Math.floor(min / pas) * pas, Math.ceil(max / pas) * pas];
}

const TONS = {
  primaire: { barre: J["menthe"], texte: "text-encre" },
  dedans: { barre: J["ambre"], texte: "text-ambre" },
  ordinaire: { barre: "rgba(90,103,98,0.85)", texte: "text-craie" },
};

const COLONNES = {
  "--lib": "150px",
  "--val": "116px",
  "--ecart": "18px",
};
const PISTE = { left: "calc(var(--lib) + var(--ecart))", right: "calc(var(--val) + var(--ecart))" };

const nombre = (n) => Math.round(n).toLocaleString("fr-FR");

/**
 * @param {object} props
 * @param {Array<{cle: string, libelle: string, basse: number|null, haute: number|null, pointe?: number|null, primaire?: boolean}>} props.lignes
 * @param {{valeur: number}|null} [props.repere] - le trait en travers (le loyer du bail)
 * @param {string} [props.unite] - suffixe des fourchettes, posé une seule fois : « 640 – 960 € »
 * @param {(n: number) => string} [props.format] - par défaut, un nombre à la française
 * @param {string} [props.legende] - sous l'axe, à gauche : ce qui a été relevé
 */
export default function EchelleFourchettes({
  lignes = [],
  repere = null,
  unite = "€",
  format = nombre,
  legende = null,
}) {
  const presentes = lignes.filter((l) => l.basse != null || l.haute != null);
  if (!presentes.length) return null;

  const valeurs = presentes.flatMap((l) => [l.basse, l.haute, l.pointe]).filter((n) => n != null);
  if (repere?.valeur != null) valeurs.push(repere.valeur);
  const [bas, haut] = bornesNettes(Math.min(...valeurs), Math.max(...valeurs));
  const span = haut - bas || 1;
  const pct = (n) => ((n - bas) / span) * 100;

  const contient = (l) =>
    repere?.valeur != null && l.basse != null && l.haute != null && repere.valeur >= l.basse && repere.valeur <= l.haute;

  const posRepere = repere?.valeur != null ? pct(repere.valeur) : null;

  return (
    <div className="relative mt-5" style={COLONNES}>
      {/* Le trait du repère traverse les trois lignes d'un seul tenant et
          descend jusqu'à son chiffre sur l'axe : sinon l'œil ne les relie pas.
          Il s'arrête 20 px avant le bas, juste au-dessus du chiffre. */}
      {posRepere != null && (
        <div
          aria-hidden="true"
          className="absolute top-0 bottom-[20px] pointer-events-none"
          style={PISTE}
        >
          <div
            className="absolute top-0 bottom-0 w-[2px]"
            style={{ left: `${posRepere}%`, background: J["ambre"], boxShadow: "0 0 18px rgba(224,164,94,0.45)" }}
          />
        </div>
      )}

      <div>
        {lignes.map((l) => {
          const absente = l.basse == null && l.haute == null;
          const ton = absente
            ? TONS.ordinaire
            : contient(l)
              ? TONS.dedans
              : l.primaire
                ? TONS.primaire
                : TONS.ordinaire;
          const debut = l.basse != null ? pct(l.basse) : null;
          const fin = l.haute != null ? pct(l.haute) : null;

          return (
            <div key={l.cle} className="flex items-center py-3" style={{ gap: "var(--ecart)" }}>
              <p
                className="alx-mont m-0 flex-none text-[11px] font-medium uppercase tracking-[.14em] text-ardoise"
                style={{ width: "var(--lib)" }}
              >
                {l.libelle}
              </p>

              <div className="relative flex-1 min-w-0 h-[10px]">
                <div className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,0.06)" }} />
                {!absente && (
                  <div
                    className="absolute top-0 bottom-0 rounded-full"
                    style={{
                      left: `${Math.max(0, debut ?? 0)}%`,
                      width: `${Math.max(1.5, (fin ?? debut ?? 0) - (debut ?? 0))}%`,
                      background: ton.barre,
                      transition: "left .5s ease, width .5s ease",
                    }}
                  />
                )}
                {/* La moyenne, quand la source en donne une : une encoche dans
                    la barre, pas une quatrième ligne. */}
                {!absente && l.pointe != null && (
                  <div
                    className="absolute top-[-3px] bottom-[-3px] w-px bg-fond"
                    style={{ left: `${pct(l.pointe)}%` }}
                    title="moyenne"
                  />
                )}
              </div>

              {/* L'unité une fois, à la fin : « 640 – 960 € » et non deux euros. */}
              <p
                className={`m-0 flex-none text-right text-[13.5px] tabular-nums whitespace-nowrap ${
                  absente ? "text-brume" : ton.texte
                }`}
                style={{ width: "var(--val)" }}
              >
                {absente ? (
                  "—"
                ) : (
                  <>
                    {format(l.basse)} <span className="text-bord-vif">–</span> {format(l.haute)}
                    {unite ? ` ${unite}` : ""}
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {/* L'axe : les deux bornes nues, et le repère à sa place exacte. */}
      <div className="relative mt-1 min-h-[34px]">
        {legende && (
          <p
            className="absolute left-0 top-0 m-0 text-[11px] leading-[1.45] text-ardoise"
            style={{ width: "var(--lib)" }}
          >
            {legende}
          </p>
        )}
        <div className="absolute top-0 border-t text-[11px] tabular-nums text-craie" style={{ ...PISTE, borderColor: "rgba(255,255,255,0.32)", paddingTop: 8 }}>
          {/* Une borne trop près du repère s'efface : deux chiffres l'un sur l'autre ne se lisent pas. */}
          {!(posRepere != null && posRepere < 7) && <span className="absolute left-0" style={{ top: 8 }}>{format(bas)}</span>}
          {posRepere != null && (
            <span className="absolute -translate-x-1/2 text-ambre" style={{ left: `${posRepere}%`, top: 8 }}>
              {format(repere.valeur)}
            </span>
          )}
          {!(posRepere != null && posRepere > 93) && <span className="absolute right-0" style={{ top: 8 }}>{format(haut)}</span>}
        </div>
      </div>
    </div>
  );
}
