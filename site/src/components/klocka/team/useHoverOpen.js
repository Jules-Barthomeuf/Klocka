import { useEffect, useRef, useState } from "react";

// Opens on mouse hover, toggles on touch tap, closes on outside tap.
export default function useHoverOpen() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, [open]);

  const handlers = {
    onPointerEnter: (e) => { if (e.pointerType === "mouse") { clearTimeout(timer.current); setOpen(true); } },
    onPointerLeave: (e) => { if (e.pointerType === "mouse") timer.current = setTimeout(() => setOpen(false), 120); },
    onPointerUp: (e) => { if (e.pointerType !== "mouse") setOpen((o) => !o); },
  };

  return { open, ref, handlers };
}
