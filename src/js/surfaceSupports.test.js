import mesher from "./mesher";
import surfaceSupports from "./surfaceSupports";

// A 4 x 2 slab on the ground and a wall on its edge y = 0
function slabAndWall() {
  const nodes = [
    [0, 0, 0],
    [4, 0, 0],
    [4, 2, 0],
    [0, 2, 0],
    [4, 0, 1],
    [0, 0, 1],
  ];
  return {
    nodes: Object.fromEntries(nodes.map(([x, y, z], i) => [String(i + 1), { x, y, z }])),
    plates: {
      1: { nodes: [1, 2, 3, 4], thickness: 300, material_id: 1, rotZ: 0 },
      2: { nodes: [1, 2, 5, 6], thickness: 300, material_id: 1, rotZ: 0 },
    },
    meshed_plates: {},
  };
}

function meshOf(structure, plate_ids, mesh_size) {
  const meshing = mesher.meshStructure(structure, { mesh_size, plate_ids });
  return { structure: meshing.structure, mesh: surfaceSupports.describeMesh(meshing.structure, plate_ids, mesh_size, meshing.skipped) };
}

test("a mesh gives its nodes and the area they take of the plates facing each axis", () => {
  const { mesh } = meshOf(slabAndWall(), ["1", "2"], 0.5);
  expect(mesh.plate_ids).toEqual(["1", "2"]);
  expect(mesh.element_count).toBe(8 * 4 + 8 * 2);
  // 9 x 5 nodes in the slab, 2 more rows in the wall
  expect(mesh.node_ids.length).toBe(9 * 5 + 9 * 2);
  const sum = (areas) => Object.values(areas).reduce((total, area) => total + area, 0);
  expect(sum(mesh.areas.z)).toBeCloseTo(8, 9);
  expect(sum(mesh.areas.y)).toBeCloseTo(4, 9);
  expect(sum(mesh.areas.x)).toBe(0);
  expect(mesh.skewed_plate_ids).toEqual([]);
});

test("a slab on soil gets a spring ks · A on each node, adding up to ks times its area", () => {
  const { mesh } = meshOf(slabAndWall(), ["1"], 0.5);
  const ks = 20000;
  const { supports, error } = surfaceSupports.getSurfaceSupports(mesh, ks, "rrsrrr");
  expect(error).toBe(null);
  expect(supports.length).toBe(9 * 5);
  expect(supports.reduce((total, { tz }) => total + tz, 0)).toBeCloseTo(ks * 8, 6);
  supports.forEach((support) => {
    expect(support.restraint_code).toBe("RRSRRR");
    expect(support.tx).toBe(0);
    expect(support.type).toBe("node");
  });
  // Corner, edge and inner nodes of the 0.5 grid
  const tz = supports.map(({ tz }) => tz).sort((a, b) => a - b);
  expect(tz[0]).toBeCloseTo(ks * 0.0625, 9);
  expect(tz[tz.length - 1]).toBeCloseTo(ks * 0.25, 9);
});

test("each direction with an S takes the plates that face it, nodes on other plates are left free", () => {
  const { mesh } = meshOf(slabAndWall(), ["1", "2"], 0.5);
  const { supports, error } = surfaceSupports.getSurfaceSupports(mesh, 1000, "FSSRRR");
  expect(error).toBe(null);
  // Every node is on the slab (Z) or the wall (Y)
  expect(supports.length).toBe(mesh.node_ids.length);
  const byCode = (code) => supports.filter(({ restraint_code }) => restraint_code === code);
  // The bottom edge of the wall is on both
  expect(byCode("FSSRRR").length).toBe(9);
  expect(byCode("FRSRRR").length).toBe(9 * 4);
  expect(byCode("FSRRRR").length).toBe(9 * 2);
  expect(supports.reduce((total, { ty }) => total + ty, 0)).toBeCloseTo(1000 * 4, 6);
  // Only Z: the wall nodes off the slab get nothing
  expect(surfaceSupports.getSurfaceSupports(mesh, 1000, "RRSRRR").supports.length).toBe(9 * 5);
});

test("a surface support needs a mesh, a positive ks, a valid code and plates facing its directions", () => {
  const { mesh } = meshOf(slabAndWall(), ["1"], 1);
  expect(surfaceSupports.getSurfaceSupports(null, 1000, "RRSRRR").error).toBe("surface_support_no_mesh");
  expect(surfaceSupports.getSurfaceSupports(mesh, 0, "RRSRRR").error).toBe("surface_support_ks");
  expect(surfaceSupports.getSurfaceSupports(mesh, 1000, "RRSRR").error).toBe("surface_support_code");
  expect(surfaceSupports.getSurfaceSupports(mesh, 1000, "RRSRRS").error).toBe("surface_support_code");
  expect(surfaceSupports.getSurfaceSupports(mesh, 1000, "FFFRRR").error).toBe("surface_support_code");
  expect(surfaceSupports.getSurfaceSupports(mesh, 1000, "SRRRRR").error).toBe("surface_support_not_facing");
  // A sloped plate faces no axis
  const sloped = slabAndWall();
  sloped.nodes["3"].z = 1;
  sloped.nodes["4"].z = 1;
  expect(surfaceSupports.getSurfaceSupports(meshOf(sloped, ["1"], 1).mesh, 1000, "RRSRRR").error).toBe("surface_support_skewed");
});

test("plate IDs come as one ID or nested lists", () => {
  expect(surfaceSupports.getPlateIds(3)).toEqual(["3"]);
  expect(surfaceSupports.getPlateIds([1, [2, 1], null, "x"])).toEqual(["1", "2"]);
  expect(surfaceSupports.getPlateIds(undefined)).toEqual([]);
});
