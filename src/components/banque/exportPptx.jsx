import PptxGenJS from "pptxgenjs";
import html2canvas from "html2canvas";

/**
 * Export slides as a PPTX file where each slide is a full-bleed screenshot.
 * The caller must provide a ref to the slide container DOM element,
 * and a function to change the current slide index (so we can render each slide and screenshot it).
 */
export default async function exportPptx(slides, title, slideRef, setCurrent) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches (16:9)
  pptx.author = "Klocka";
  pptx.title = title || "Présentation Bancaire";

  for (let i = 0; i < slides.length; i++) {
    // Navigate to the slide
    setCurrent(i);
    // Wait for render
    await new Promise((r) => setTimeout(r, 400));

    if (!slideRef.current) continue;

    // Capture at 2x for quality
    const canvas = await html2canvas(slideRef.current, {
      scale: 2,
      backgroundColor: "#2D2D2D",
      useCORS: true,
      allowTaint: true,
    });

    const imgData = canvas.toDataURL("image/png");

    const slide = pptx.addSlide();
    slide.background = { color: "2D2D2D" };
    // Full bleed image covering the entire slide
    slide.addImage({
      data: imgData,
      x: 0,
      y: 0,
      w: "100%",
      h: "100%",
    });
  }

  await pptx.writeFile({ fileName: `${title || "presentation"}_bancaire.pptx` });
}