import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { J } from "@/design/jetons";

// ALX sur le tableau de bord : ce qu'il y a à faire cette semaine, en un
// regard, dans le registre des autres blocs. Rien si ALX n'a pas encore de
// ville : un bloc vide n'apprend rien.
export default function TuileAlx() {
  const { data } = useQuery({ queryKey: ["alx-etat"], queryFn: () => base44.request("GET", "/api/alx/etat"), staleTime: 60000 });
  const a = data?.a_faire;
  if (!a || !a.villes) return null;
  const items = [
    ["à appeler", a.a_appeler, J["alerte"]],
    ["à écrire", a.a_ecrire, J["ambre"]],
    ["relances dues", a.relances_dues, J["menthe"]],
    ["réponses cette semaine", a.reponses, J["craie"]],
  ];
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
        <p className="m-0 text-[13.5px] text-brume">
          ALX · off-market <span className="text-bord-vif">· {a.villes} ville{a.villes > 1 ? "s" : ""}</span>
        </p>
        <Link to="/ALX" className="text-[12.5px] text-ardoise hover:text-menthe">Ouvrir</Link>
      </div>
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        {items.map(([mot, n, teinte]) => (
          <div key={mot}>
            <div className="text-[24px] font-light tabular-nums" style={{ color: n ? teinte : J["bord-vif"] }}>{n}</div>
            <div className="text-[12.5px] text-ardoise mt-0.5">{mot}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
