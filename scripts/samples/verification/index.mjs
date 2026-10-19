// Verification models of the thesis (chapter 3), in its order. Models 5 and 7 need features the app does not have yet.
import simplySupportedBeam from "./01-simply-supported-beam.mjs";
import cantileverColumn from "./02-cantilever-column.mjs";
import multiSpanFrame from "./03-multi-span-frame.mjs";
import rectangularPlate from "./04-rectangular-plate.mjs";
import retainingWallOnPiles from "./06-retaining-wall-on-piles.mjs";

const VERIFICATION_SAMPLES = [simplySupportedBeam, cantileverColumn, multiSpanFrame, rectangularPlate, retainingWallOnPiles];

export default VERIFICATION_SAMPLES;
