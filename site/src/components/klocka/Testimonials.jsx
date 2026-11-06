import { Star } from "lucide-react";

const ITEMS = [
  ["Amandine & Guillaume", "Nous avons disposé d’un accompagnement de A à Z ! Avec l’offre clé en main de Klocka nous avons gagné beaucoup de temps avec désormais un investissement qui est rentable et sécurisé."],
  ["Grégory", "Très satisfait de l’accompagnement, les équipes ont sourcé une super opération que je n’aurais jamais pu piloter seul en immobilier commercial"],
  ["Pierre", "Sans cet accompagnement je ne serais jamais passé à l’action en immobilier commercial. Encore merci à Klocka pour la qualité des conseils et du sourcing !"],
];

export default function Testimonials() {
  return (
    <section className="k-wrap k-section !pb-0">
      <h2 className="k-h2 text-center">Témoignages</h2>
      <div className="mt-14 grid gap-6 md:grid-cols-3 max-w-[1240px] mx-auto">
        {ITEMS.map(([name, text]) => (
          <div key={name} className="rounded-[24px] bg-k-card border border-white/[0.08] p-8">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[14px] uppercase tracking-[0.14em] text-white font-medium">{name}</span>
              <div className="flex gap-1">
                {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="w-4 h-4 fill-k-sage text-k-sage" />)}
              </div>
            </div>
            <p className="mt-6 k-body text-white">« {text} »</p>
          </div>
        ))}
      </div>
    </section>
  );
}
