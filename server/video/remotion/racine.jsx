// Point d'entrée Remotion : une seule composition, la présentation client.
import React from "react";
import { registerRoot, Composition } from "remotion";
import { VideoDeal, propsExemple, dureeTotale, FPS } from "./VideoDeal.jsx";

function Racine() {
  return (
    <Composition
      id="presentation-deal"
      component={VideoDeal}
      durationInFrames={dureeTotale(propsExemple)}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={propsExemple}
      // La durée suit le montage : les scènes absentes ne laissent pas de vide.
      calculateMetadata={({ props }) => ({ durationInFrames: dureeTotale(props) })}
    />
  );
}

registerRoot(Racine);
