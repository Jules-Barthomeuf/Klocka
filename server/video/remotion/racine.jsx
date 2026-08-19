// Point d'entrée Remotion : une seule composition, la présentation client.
import React from "react";
import { registerRoot, Composition } from "remotion";
import { VideoDeal, propsExemple, DUREE_FRAMES, DUREE_CARTE, FPS } from "./VideoDeal.jsx";

function Racine() {
  return (
    <Composition
      id="presentation-deal"
      component={VideoDeal}
      durationInFrames={DUREE_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={propsExemple}
      // La plongée cartographique allonge la vidéo quand le bien est géolocalisé.
      calculateMetadata={({ props }) => ({
        durationInFrames: DUREE_FRAMES + (props.carte ? DUREE_CARTE : 0),
      })}
    />
  );
}

registerRoot(Racine);
