import React from "react";
import { ArrowDown, ArrowUp, Check, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useUser } from "@/components/providers/UserProvider";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, OPTIONS, POLICES, accentHex, themeEffectif } from "@/lib/personnalisation";
import { ENTREES_ADMIN, ENTREES_AUTRE, ENTREES_CLIENT, PAGES_OUVERTURE_ADMIN, PAGES_OUVERTURE_CLIENT, ordonner } from "@/lib/menu";

// La page Personnalisation : chacun règle l'application pour lui. Tout
// s'applique à l'instant, sur la page elle-même : c'est l'aperçu. Les
// réglages suivent le compte (PersonnalisationProvider), pas l'appareil.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";

/** Une ligne de réglage : le nom et sa note à gauche, les choix à droite. */
function Reglage({ titre, note, children }) {
  return (
    <div className="grid gap-3 border-t border-trait py-5 first:border-t-0 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
      <div>
        <p className="m-0 text-[14px] font-medium text-encre">{titre}</p>
        {note && <p className="m-0 mt-1 text-[12.5px] leading-[1.5] text-ardoise">{note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/** Des pilules à choix unique. `rendre` habille un libellé (une police, une forme). */
function Pilules({ valeur, options, onChoisir, rendre }) {
  return options.map(([v, mot]) => {
    const actif = v === valeur;
    return (
      <button
        key={String(v)}
        type="button"
        onClick={() => onChoisir(v)}
        aria-pressed={actif}
        className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/10 text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: actif ? undefined : "transparent" }}
      >
        {rendre ? rendre(v, mot) : mot}
      </button>
    );
  });
}

/** Les pastilles d'accent : la couleur elle-même, dans le thème affiché. */
function Accents({ valeur, theme, onChoisir }) {
  return OPTIONS.accent.map(([cle, nom]) => {
    const actif = cle === valeur;
    const couleur = accentHex(cle, theme);
    return (
      <button
        key={cle}
        type="button"
        onClick={() => onChoisir(cle)}
        aria-pressed={actif}
        title={nom}
        className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-[13px] transition-colors ${actif ? "border-menthe text-encre" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`}
        style={{ background: "transparent" }}
      >
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: couleur }}>
          {actif && <Check className="h-3.5 w-3.5" style={{ color: theme === CLAIR ? "rgb(255 255 255)" : "rgb(0 0 0 / .7)" }} strokeWidth={3} />}
        </span>
        {nom}
      </button>
    );
  });
}

/** Les entrées d'un groupe du menu : visibles ou non, et dans quel ordre. */
function Entrees({ groupe, titre, prefs, changer, toutes }) {
  const ordre = ordonner(groupe, prefs.menu_ordre, []);
  const bouger = (i, sens) => {
    const j = i + sens;
    if (j < 0 || j >= ordre.length) return;
    const suite = [...ordre];
    [suite[i], suite[j]] = [suite[j], suite[i]];
    // L'ordre enregistré porte toutes les entrées, groupe par groupe : celui
    // qu'on bouge remplace le sien, les autres groupes gardent le leur.
    const autres = toutes.filter((g) => g !== groupe).flatMap((g) => ordonner(g, prefs.menu_ordre, []).map((e) => e.cle));
    changer({ menu_ordre: [...autres.filter((c) => toutes.indexOf(groupe) > toutes.findIndex((g) => g.some((e) => e.cle === c))), ...suite.map((e) => e.cle), ...autres.filter((c) => toutes.indexOf(groupe) < toutes.findIndex((g) => g.some((e) => e.cle === c)))] });
  };
  const basculer = (cle) => {
    const masques = prefs.menu_masques.includes(cle) ? prefs.menu_masques.filter((c) => c !== cle) : [...prefs.menu_masques, cle];
    changer({ menu_masques: masques });
  };
  return (
    <div className="w-full">
      {titre && <p className={`${etiq} mb-2`}>{titre}</p>}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {ordre.map((e, i) => {
          const masquee = prefs.menu_masques.includes(e.cle);
          return (
            <li key={e.cle} className={`flex items-center gap-2 rounded-[10px] border border-trait px-3 py-1.5 ${masquee ? "opacity-60" : ""}`}>
              <button type="button" onClick={() => basculer(e.cle)} aria-label={masquee ? `Montrer ${e.label}` : `Masquer ${e.label}`} title={masquee ? "Masquée : cliquer pour la montrer" : "Visible : cliquer pour la masquer"} className="grid h-7 w-7 place-items-center rounded-full text-craie hover:text-encre" style={{ background: "transparent" }}>
                {masquee ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <span className={`flex-1 text-[13.5px] ${masquee ? "text-brume line-through" : "text-encre"}`}>{e.label}</span>
              <button type="button" onClick={() => bouger(i, -1)} disabled={i === 0} aria-label={`Monter ${e.label}`} className="grid h-7 w-7 place-items-center rounded-full text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowUp className="h-4 w-4" /></button>
              <button type="button" onClick={() => bouger(i, 1)} disabled={i === ordre.length - 1} aria-label={`Descendre ${e.label}`} className="grid h-7 w-7 place-items-center rounded-full text-craie hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}><ArrowDown className="h-4 w-4" /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function Personnalisation() {
  const user = useUser();
  const { prefs, changer, reinitialiser, etat, connecte } = usePersonnalisation();
  const admin = user?.role === "admin";
  const theme = themeEffectif(prefs);
  const groupes = admin ? [ENTREES_ADMIN, ENTREES_AUTRE] : [ENTREES_CLIENT];
  const etatMot = !connecte ? "Sur cet appareil seulement" : etat === "enregistrement" ? "Enregistrement…" : etat === "erreur" ? "Pas enregistré : le serveur n'a pas répondu" : "Enregistré sur votre compte";

  return (
    <div className="mx-auto w-full max-w-[980px] px-4 py-8 md:px-6 md:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[34px] font-normal leading-[1.05] tracking-[-0.02em] text-encre max-md:text-[26px]">Personnalisation</h1>
          <p className="m-0 mt-2 max-w-[62ch] text-[14px] leading-[1.6] text-craie">Ces réglages sont à vous. Ils s'appliquent tout de suite, et vous suivent d'un appareil à l'autre.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-[12.5px] ${etat === "erreur" ? "text-alerte" : "text-brume"}`}>{etatMot}</span>
          <button type="button" onClick={reinitialiser} className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" />Réglages d'origine
          </button>
        </div>
      </header>

      <section className="rounded-[16px] border border-trait bg-surface px-5 py-2 md:px-6">
        <p className={`${etiq} pt-4`}>Apparence</p>
        <Reglage titre="Mode" note="Sombre, clair, ou celui de l'appareil, qui change avec lui.">
          <Pilules valeur={prefs.mode} options={OPTIONS.mode} onChoisir={(v) => changer({ mode: v })} />
        </Reglage>
        <Reglage titre="Couleur d'accent" note="Boutons, liens, états actifs et pastilles. En clair, la teinte descend d'un cran pour rester lisible.">
          <Accents valeur={prefs.accent} theme={theme} onChoisir={(v) => changer({ accent: v })} />
        </Reglage>
        <Reglage titre="Fond" note="Le fond de l'application, pour chacun des deux modes.">
          <span className="w-full text-[12px] text-brume">En sombre</span>
          <Pilules valeur={prefs.fond_sombre} options={OPTIONS.fond_sombre} onChoisir={(v) => changer({ fond_sombre: v })} />
          <span className="mt-1 w-full text-[12px] text-brume">En clair</span>
          <Pilules valeur={prefs.fond_clair} options={OPTIONS.fond_clair} onChoisir={(v) => changer({ fond_clair: v })} />
        </Reglage>
        <Reglage titre="Halo" note="Les nappes de couleur derrière les pages, en sombre. Le clair n'en a jamais.">
          <Pilules valeur={prefs.halo} options={OPTIONS.halo} onChoisir={(v) => changer({ halo: v })} />
        </Reglage>
        <Reglage titre="Surfaces" note="Les blocs et les cartes : du verre qui laisse voir le fond, ou des aplats.">
          <Pilules valeur={prefs.surfaces} options={OPTIONS.surfaces} onChoisir={(v) => changer({ surfaces: v })} />
        </Reglage>
        <Reglage titre="Police" note="Partout, ALX compris.">
          <Pilules valeur={prefs.police} options={OPTIONS.police} onChoisir={(v) => changer({ police: v })} rendre={(v, mot) => <span style={{ fontFamily: POLICES[v] }}>{mot}</span>} />
        </Reglage>
        <Reglage titre="Forme des boutons" note="Les pilules sont la forme de l'action chez Klocka. Les autres formes valent pour tous les boutons.">
          <Pilules valeur={prefs.boutons} options={OPTIONS.boutons} onChoisir={(v) => changer({ boutons: v })} rendre={(v, mot) => (
            <span className="inline-flex items-center gap-2"><span className="inline-block h-3.5 w-6 border border-current" style={{ borderRadius: v === "pilule" ? 999 : v === "arrondi" ? 5 : 1 }} />{mot}</span>
          )} />
        </Reglage>
        <Reglage titre="Taille de l'interface" note="Tout grossit ou rétrécit d'un bloc, texte et espacements.">
          <Pilules valeur={prefs.taille} options={OPTIONS.taille} onChoisir={(v) => changer({ taille: v })} />
        </Reglage>
        <Reglage titre="Animations" note="Réduites : les transitions et les mouvements s'effacent.">
          <Pilules valeur={prefs.animations} options={OPTIONS.animations} onChoisir={(v) => changer({ animations: v })} />
        </Reglage>
      </section>

      <section className="mt-5 rounded-[16px] border border-trait bg-surface px-5 py-2 md:px-6">
        <p className={`${etiq} pt-4`}>Navigation</p>
        <Reglage titre="Page d'ouverture" note="La page qui s'ouvre quand vous arrivez sur Klocka.">
          <Pilules valeur={prefs.accueil} options={admin ? PAGES_OUVERTURE_ADMIN : PAGES_OUVERTURE_CLIENT} onChoisir={(v) => changer({ accueil: v })} />
        </Reglage>
        <Reglage titre="Barre latérale" note="Au démarrage. Le chevron la replie ou la déplie ensuite, comme avant.">
          <Pilules valeur={prefs.barre} options={OPTIONS.barre} onChoisir={(v) => changer({ barre: v })} />
        </Reglage>
        <Reglage titre="Entrées du menu" note="L'œil masque une entrée, les flèches la déplacent. Personnalisation reste toujours dans « Autre ».">
          <div className="flex w-full flex-col gap-4">
            {groupes.map((g, i) => <Entrees key={i} groupe={g} titre={admin ? (i === 0 ? "Principal" : "Autre") : null} prefs={prefs} changer={changer} toutes={groupes} />)}
          </div>
        </Reglage>
        <Reglage titre="Bulle de l'assistant" note="La pilule qui ouvre AK sur les pages de travail.">
          <Pilules valeur={prefs.assistant} options={OPTIONS.assistant} onChoisir={(v) => changer({ assistant: v })} />
        </Reglage>
      </section>
    </div>
  );
}
