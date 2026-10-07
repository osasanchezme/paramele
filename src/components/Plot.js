import createPlotlyComponent from "react-plotly.js/factory";
import Plotly from "plotly.js-gl3d-dist-min";

// Partial Plotly bundle with the traces the app uses (scatter, scatter3d and mesh3d). The full plotly.js ships map traces
// (maplibre-gl) that are not needed and are much larger
const Plot = createPlotlyComponent(Plotly);

export default Plot;
