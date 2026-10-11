// Dimensions of the member or plate being drawn, drawn over the plot in pixels of the renderer

// Distance between an edge and its dimension line
const DIMENSION_OFFSET = 22;
// Gap between the edge and the start of the extension lines
const EXTENSION_GAP = 4;
const TICK_SIZE = 5;
// Shorter edges on screen only get the tag, the dimension line would not fit
const MIN_DIMENSION_PIXELS = 48;
// Monospaced text of the tags, the detail line is smaller
const CHARACTER_WIDTH = 6.7;
const DETAIL_SCALE = 10 / 11;
const TAG_LINE_HEIGHT = 14;
const TAG_PADDING = 7;
const AXES = ["x", "y", "z"];

function formatLength(value) {
  return String(Number(value.toFixed(3)));
}

function getDistance(point_a, point_b) {
  return Math.sqrt(AXES.reduce((total, axis) => total + (point_b[axis] - point_a[axis]) ** 2, 0));
}

/**
 * Area of a flat polygon in 3D: half the length of the sum of the cross products of its corners
 * @param {import("../js/types").ParamEleDrawingPoint[]} points
 */
function getPolygonArea(points) {
  let sum = { x: 0, y: 0, z: 0 };
  points.forEach((point_a, index) => {
    let point_b = points[(index + 1) % points.length];
    sum.x += point_a.y * point_b.z - point_a.z * point_b.y;
    sum.y += point_a.z * point_b.x - point_a.x * point_b.z;
    sum.z += point_a.x * point_b.y - point_a.y * point_b.x;
  });
  return Math.sqrt(sum.x ** 2 + sum.y ** 2 + sum.z ** 2) / 2;
}

/**
 * Projections along the axes of a diagonal edge, e.g. "Δx 3  Δz 4"
 */
function getComponentsText(point_a, point_b) {
  let components = AXES.map((axis) => ({ axis, delta: Math.abs(point_b[axis] - point_a[axis]) })).filter(({ delta }) => delta > 1e-9);
  if (components.length < 2) return "";
  return components.map(({ axis, delta }) => `Δ${axis} ${formatLength(delta)}`).join(" · ");
}

/**
 * Dimensions of the edges being drawn, in pixels of the renderer
 * @param {object} params
 * @param {string} params.tool
 * @param {import("../js/types").ParamEleDrawingPoint[]} params.points Points picked so far
 * @param {import("../js/types").ParamEleDrawingPoint} params.hover_point Point under the cursor, the next corner
 * @param {function(object): {x: number, y: number}|null} params.project
 * @param {string} params.unit Length unit of the structure
 * @returns {{dimensions: object[], area: object|null}}
 */
function getDrawingDimensions({ tool, points, hover_point, project, unit }) {
  let unit_suffix = unit ? ` ${unit}` : "";
  let corners = [...points, hover_point];
  let screen_corners = corners.map(project);
  if (screen_corners.some((corner) => !corner)) return { dimensions: [], area: null };
  // Dimension lines go outside the plate, away from its middle on screen
  let center = {
    x: screen_corners.reduce((total, { x }) => total + x, 0) / screen_corners.length,
    y: screen_corners.reduce((total, { y }) => total + y, 0) / screen_corners.length,
  };
  const getDimension = (index_a, index_b, is_active) => {
    let length = getDistance(corners[index_a], corners[index_b]);
    if (length < 1e-9) return null;
    return {
      key: `${index_a}-${index_b}`,
      a: screen_corners[index_a],
      b: screen_corners[index_b],
      text: `${formatLength(length)}${unit_suffix}`,
      detail: is_active ? getComponentsText(corners[index_a], corners[index_b]) : "",
      is_active,
      center: tool === "plate" && corners.length >= 3 ? center : null,
    };
  };
  let last = corners.length - 1;
  let dimensions = [];
  if (tool === "plate") {
    // The edges already drawn are only tagged, the edges that move with the cursor get the full dimension
    for (let index = 0; index < last - 1; index++) dimensions.push(getDimension(index, index + 1, false));
    dimensions.push(getDimension(last - 1, last, true));
    if (corners.length >= 3) dimensions.push(getDimension(last, 0, true));
  } else {
    dimensions.push(getDimension(last - 1, last, true));
  }
  let area = null;
  if (tool === "plate" && corners.length >= 3) {
    let value = getPolygonArea(corners);
    if (value > 1e-9) area = { ...center, text: `A = ${formatLength(value)}${unit ? ` ${unit}²` : ""}` };
  }
  return { dimensions: dimensions.filter(Boolean), area };
}

/**
 * Size of a tag in pixels, the text is monospaced so it can be measured without the DOM
 */
function getTagSize(text, detail) {
  let characters = Math.max(text.length, detail ? detail.length * DETAIL_SCALE : 0);
  return { width: characters * CHARACTER_WIDTH + 2 * TAG_PADDING, height: detail ? 2 * TAG_LINE_HEIGHT + 4 : TAG_LINE_HEIGHT + 4 };
}

/**
 * Rounded label with a white background, so it reads over the grid and the structure. Always horizontal, text along
 * edges in perspective is hard to read
 */
function Tag({ x, y, text, detail, is_muted, color }) {
  let { width, height } = getTagSize(text, detail);
  return (
    <g transform={`translate(${x} ${y})`} className={`drawing-dimension-tag${is_muted ? " muted" : ""}`}>
      <rect x={-width / 2} y={-height / 2} width={width} height={height} rx={Math.min(height / 2, 9)} stroke={is_muted ? undefined : color} />
      <text textAnchor="middle" dominantBaseline="central">
        <tspan className="drawing-dimension-value" x={0} y={detail ? -TAG_LINE_HEIGHT / 2 : 0.5}>
          {text}
        </tspan>
        {detail && (
          <tspan className="drawing-dimension-detail" x={0} y={TAG_LINE_HEIGHT / 2 + 1}>
            {detail}
          </tspan>
        )}
      </text>
    </g>
  );
}

/**
 * Dimension of an edge: extension lines, a dimension line with ticks and the length, or only the length on short edges
 */
function Dimension({ dimension, color }) {
  let { a, b, text, detail, is_active, center } = dimension;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let pixels = Math.hypot(dx, dy);
  let middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  if (pixels < 1) return <Tag x={middle.x} y={middle.y} text={text} is_muted={!is_active} color={color} />;
  let unit_x = dx / pixels;
  let unit_y = dy / pixels;
  let normal = { x: -unit_y, y: unit_x };
  // Outside the plate, or above a member
  let is_flipped = center ? normal.x * (middle.x - center.x) + normal.y * (middle.y - center.y) < 0 : normal.y > 0;
  if (is_flipped) normal = { x: -normal.x, y: -normal.y };
  const along = (point, distance) => ({ x: point.x + normal.x * distance, y: point.y + normal.y * distance });
  let shown_detail = is_active && pixels >= MIN_DIMENSION_PIXELS ? detail : "";
  // Far enough from the edge that the tag does not cover it
  let { width, height } = getTagSize(text, shown_detail);
  let clearance = (Math.abs(normal.x) * width) / 2 + (Math.abs(normal.y) * height) / 2 + EXTENSION_GAP;
  if (!is_active || pixels < MIN_DIMENSION_PIXELS) {
    // Too short for the dimension line, or an edge that is already drawn
    let label_position = along(middle, clearance);
    return <Tag x={label_position.x} y={label_position.y} text={text} is_muted={!is_active} color={color} />;
  }
  let start = along(a, DIMENSION_OFFSET);
  let end = along(b, DIMENSION_OFFSET);
  // Architectural ticks: short slashes at 45 degrees across the dimension line
  let tick = { x: (unit_x + normal.x) * TICK_SIZE * Math.SQRT1_2, y: (unit_y + normal.y) * TICK_SIZE * Math.SQRT1_2 };
  let label_position = along(middle, Math.max(DIMENSION_OFFSET, clearance));
  return (
    <g className="drawing-dimension">
      {[a, b].map((corner, index) => {
        let from = along(corner, EXTENSION_GAP);
        let to = along(corner, DIMENSION_OFFSET + EXTENSION_GAP);
        return <line key={index} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
      })}
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      {[start, end].map((corner, index) => (
        <line
          key={index}
          className="drawing-dimension-tick"
          x1={corner.x - tick.x}
          y1={corner.y - tick.y}
          x2={corner.x + tick.x}
          y2={corner.y + tick.y}
        />
      ))}
      <Tag x={label_position.x} y={label_position.y} text={text} detail={shown_detail} color={color} />
    </g>
  );
}

/**
 * @param {{dimensions: object[], area: object|null, color: string}} props
 */
function DrawingDimensions({ dimensions, area, color }) {
  return (
    <g>
      {dimensions.map((dimension) => (
        <Dimension key={dimension.key} dimension={dimension} color={color} />
      ))}
      {area && <Tag x={area.x} y={area.y} text={area.text} is_muted color={color} />}
    </g>
  );
}

const drawingDimensions = { getDrawingDimensions, DrawingDimensions };

export default drawingDimensions;
