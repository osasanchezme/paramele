import React from "react";

const SIZE = 80;
const AXIS_LENGTH = 26;
const LABEL_RADIUS = 7;
const AXES = [
  { key: "x", label: "X", color: "#E53E3E", vector: [1, 0, 0] },
  { key: "y", label: "Y", color: "#38A169", vector: [0, 1, 0] },
  { key: "z", label: "Z", color: "#3182CE", vector: [0, 0, 1] },
];
// Plotly's default camera, until the renderer reports its own
const DEFAULT_CAMERA = { eye: { x: 1.25, y: 1.25, z: 1.25 }, center: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 1 } };

const toArray = (point, fallback) => (point ? [point.x, point.y, point.z] : fallback);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function normalize(v) {
  let length = Math.hypot(...v);
  return length > 1e-9 ? v.map((value) => value / length) : null;
}

/**
 * Direction of each axis on the screen for a Plotly scene camera. Only the rotation matters, zoom and panning are ignored
 * @param {{eye: object, center?: object, up?: object}} camera
 * @returns {{key: string, label: string, color: string, x: number, y: number, depth: number}[]|null}
 */
function getAxisProjections(camera) {
  let eye = toArray(camera?.eye, null);
  if (!eye) return null;
  let center = toArray(camera.center, [0, 0, 0]);
  let up = toArray(camera.up, [0, 0, 1]);
  let forward = normalize(center.map((value, index) => value - eye[index]));
  let right = forward && normalize(cross(forward, up));
  if (!right) return null;
  let screen_up = cross(right, forward);
  // Screen y goes down. Depth is positive towards the viewer
  return AXES.map((axis) => ({ ...axis, x: dot(axis.vector, right), y: -dot(axis.vector, screen_up), depth: -dot(axis.vector, forward) }));
}

/**
 * Axes of the renderer following its camera. It is updated on every camera move, so it writes to the SVG directly
 * instead of re-rendering
 */
class AxisIndicator extends React.Component {
  constructor(props) {
    super(props);
    this.svg = React.createRef();
    this.groups = {};
  }
  componentDidMount() {
    this.setCamera(DEFAULT_CAMERA);
  }
  shouldComponentUpdate() {
    return false;
  }
  /**
   * @param {{eye: object, center?: object, up?: object}} camera Plotly scene camera
   */
  setCamera(camera) {
    let projections = getAxisProjections(camera);
    if (!projections || !this.svg.current) return;
    let half = SIZE / 2;
    projections.forEach(({ key, x, y, depth }) => {
      let [line, circle, text] = this.groups[key].children;
      let tip_x = half + x * AXIS_LENGTH;
      let tip_y = half + y * AXIS_LENGTH;
      line.setAttribute("x2", tip_x);
      line.setAttribute("y2", tip_y);
      circle.setAttribute("cx", tip_x);
      circle.setAttribute("cy", tip_y);
      text.setAttribute("x", tip_x);
      text.setAttribute("y", tip_y);
      // Axes pointing away from the viewer fade and go behind the others
      this.groups[key].setAttribute("opacity", depth < 0 ? 1 + depth * 0.6 : 1);
    });
    projections.sort((a, b) => a.depth - b.depth).forEach(({ key }) => this.svg.current.appendChild(this.groups[key]));
  }
  render() {
    let half = SIZE / 2;
    return (
      <svg ref={this.svg} className="axis-indicator" width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <circle cx={half} cy={half} r={half - 1} className="axis-indicator-background" />
        {AXES.map(({ key, label, color }) => (
          <g key={key} ref={(element) => (this.groups[key] = element)}>
            <line x1={half} y1={half} x2={half} y2={half} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
            <circle r={LABEL_RADIUS} fill={color} />
            <text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={9} fontWeight="bold">
              {label}
            </text>
          </g>
        ))}
      </svg>
    );
  }
}

export default AxisIndicator;
