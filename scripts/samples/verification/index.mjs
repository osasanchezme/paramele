// Verification models of the thesis (chapter 3), in its order. Models 2, 5, 6 and 7 need features the app does not have yet.
import simplySupportedBeam from "./01-simply-supported-beam.mjs";
import multiSpanFrame from "./03-multi-span-frame.mjs";
import rectangularPlate from "./04-rectangular-plate.mjs";

const VERIFICATION_SAMPLES = [simplySupportedBeam, multiSpanFrame, rectangularPlate];

export default VERIFICATION_SAMPLES;
