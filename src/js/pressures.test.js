import pressures from "./pressures";

// A wall 4 m wide along X and 3 m high along Z, and its sloped twin (rising 1 m along Y)
const NODES = {
  1: { x: 0, y: 0, z: 0 },
  2: { x: 4, y: 0, z: 0 },
  3: { x: 4, y: 0, z: 3 },
  4: { x: 0, y: 0, z: 3 },
  5: { x: 0, y: 1, z: 3 },
};

// SkyCiv's linear pressure: a hydrostatic pressure, 0 at the top corners and 30 at a bottom one
const hydrostatic = {
  plate_id: 1,
  axes: "global",
  x_mag: 0,
  y_mag: 0,
  z_mag: -5,
  load_group: "LG",
  load_distribution: "linear",
  load_direction: "Y",
  p1_point_id: 4,
  p1_magnitude: 0,
  p2_point_id: 3,
  p2_magnitude: 0,
  p3_point_id: 1,
  p3_magnitude: 30,
};

test("a linear pressure is on the plane through the magnitudes at its three points, along its direction", () => {
  let field = pressures.getPressureField(hydrostatic, NODES);
  expect(field({ x: 2, y: 0, z: 0 })).toEqual({ x: 0, y: 30, z: 0 });
  expect(field({ x: 4, y: 0, z: 0 })).toEqual({ x: 0, y: 30, z: 0 });
  expect(field({ x: 1, y: 0, z: 1 }).y).toBeCloseTo(20, 12);
  expect(field({ x: 3, y: 0, z: 3 }).y).toBeCloseTo(0, 12);
  // x_mag, y_mag and z_mag are not used
  expect(field({ x: 1, y: 0, z: 1 }).z).toBe(0);
  expect(pressures.getMaxMagnitude(hydrostatic)).toBe(30);
});

test("the plane is measured in the plane of the points, so a sloped plate is loaded along its slope", () => {
  // From 0 at z = 0 to 10 at z = 3 along the sloped plate 1-2-5, whose top is 1 m away in Y
  let pressure = { ...hydrostatic, p1_point_id: 1, p1_magnitude: 0, p2_point_id: 2, p2_magnitude: 0, p3_point_id: 5, p3_magnitude: 10 };
  let field = pressures.getPressureField(pressure, NODES);
  expect(field({ x: 2, y: 0.5, z: 1.5 }).y).toBeCloseTo(5, 12);
});

test("uniform pressures keep their components, and a missing point leaves no pressure", () => {
  let uniform = { plate_id: 1, axes: "local", x_mag: 1, y_mag: 0, z_mag: -2, load_group: "LG" };
  expect(pressures.getPressureField(uniform, NODES)({ x: 9, y: 9, z: 9 })).toEqual({ x: 1, y: 0, z: -2 });
  expect(pressures.getMaxMagnitude(uniform)).toBeCloseTo(Math.sqrt(5), 12);
  let missing = { ...hydrostatic, p2_point_id: 99 };
  expect(pressures.getPressureField(missing, NODES)({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 });
});

test("three points in a line give the first magnitude everywhere", () => {
  let pressure = { ...hydrostatic, p1_point_id: 1, p1_magnitude: 7, p2_point_id: 2, p2_magnitude: 1, p3_point_id: 1, p3_magnitude: 3 };
  expect(pressures.getPressureField(pressure, NODES)({ x: 2, y: 0, z: 2 }).y).toBe(7);
});
