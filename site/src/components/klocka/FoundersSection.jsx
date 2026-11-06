import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Btn from "./Btn";

import FounderCard from "./team/FounderCard";
import { FOUNDERS } from "./team/teamData";
const WORDS = ["passionnés.", "experts.", "associés."];

export default function FoundersSection() {
  const [w, setW] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setW((i) => (i + 1) % WORDS.length), 4000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="k-wrap k-section">
      <div className="grid md:grid-cols-[0.85fr_1.15fr] gap-12 lg:gap-20 items-center">
        <div>
          <h2 className="k-h2">
            Paul & Matthieu, deux{" "}
            <AnimatePresence mode="wait">
              <motion.em
                key={WORDS[w]}
                className="k-serif inline-block"
                initial={{ opacity: 0, y: 12, filter: "blur(10px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -10, filter: "blur(10px)" }}
                transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
              >
                {WORDS[w]}
              </motion.em>
            </AnimatePresence>
          </h2>
          <p className="k-body mt-8 text-k-t2 max-w-[46ch]">
            Klocka, c'est la rencontre d'experts immobiliers et financiers avec plus de 10 ans d'expérience, unis par une même conviction : l'immobilier commercial est la meilleure classe d'actifs pour construire un patrimoine durable.
          </p>
          <Btn to="/equipe" variant="secondary" className="mt-10">Découvrir toute l'équipe →</Btn>
        </div>
        <div className="grid grid-cols-2 gap-5 md:gap-6">
          {FOUNDERS.map((p) => <FounderCard key={p.name} p={p} />)}
        </div>
      </div>
    </section>
  );
}
