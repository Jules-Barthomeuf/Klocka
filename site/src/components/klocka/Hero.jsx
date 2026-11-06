import { motion } from "framer-motion";
import Btn from "./Btn";
import BrushHighlight from "./BrushHighlight";

export default function Hero() {
  return (
    <section className="relative z-10 text-center px-[6vw] pt-[200px] md:pt-[212px]">
      <motion.h1
        className="k-h1 [word-spacing:0.08em] !font-extralight"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
      >
        L’immobilier <BrushHighlight>commercial</BrushHighlight>
        <br />
        clé en main
      </motion.h1>
      <motion.div
        className="mt-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <Btn>Investir →</Btn>
      </motion.div>
    </section>
  );
}
