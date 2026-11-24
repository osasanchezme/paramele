// Verification models of the thesis (chapter 3), in its order
import simplySupportedBeam from "./01-simply-supported-beam.mjs";
import cantileverColumn from "./02-cantilever-column.mjs";
import multiSpanFrame from "./03-multi-span-frame.mjs";
import rectangularPlate from "./04-rectangular-plate.mjs";
import skewedBoxCulvert from "./05-skewed-box-culvert.mjs";
import retainingWallOnPiles from "./06-retaining-wall-on-piles.mjs";
import building from "./07-building.mjs";
import thinAndThickPlates from "./08-thin-and-thick-plates.mjs";

const VERIFICATION_SAMPLES = [
  simplySupportedBeam,
  cantileverColumn,
  multiSpanFrame,
  rectangularPlate,
  skewedBoxCulvert,
  retainingWallOnPiles,
  building,
  thinAndThickPlates,
];

export default VERIFICATION_SAMPLES;
