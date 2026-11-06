import { useEffect, useState } from "react";

export default function useCounter(target, start, duration = 1400, delay = 0) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!start) return;
    let raf;
    const t0 = performance.now() + delay;
    const frame = (now) => {
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      setValue(Math.round(target * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [start]);

  return value;
}
