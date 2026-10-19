import utils from "../utils";
import GenericInOutNode from "./generics/genericInOut";
import surfaceSupports from "../js/surfaceSupports";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("nodes", node_name);
}

// Node
const node_target_ids = ["x-value", "y-value", "z-value"];
function StructuralNode({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralNode")}
      data={data}
      id={id}
      target_ids={node_target_ids}
      source_ids={["node_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralNodeExec(args) {
  let full_args = node_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "node_out-id": {
      ...structural_args,
    },
    "node_list_out-ids": [],
  };
}

// Member
const member_target_ids = ["node_A-id", "node_B-id", "section_id-id-1"];
function StructuralMember({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralMember")}
      data={data}
      id={id}
      target_ids={member_target_ids}
      source_ids={["member_out-id", "member_list_out-ids"]}
    ></GenericInOutNode>
  );
}

function StructuralMemberExec(args) {
  let full_args = member_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "member_out-id": {
      ...structural_args,
      type: "normal_continuous",
      cable_length: null,
      rotation_angle: 0,
      fixity_A: "FFFFFF",
      fixity_B: "FFFFFF",
      offset_Ax: "0",
      offset_Ay: "0",
      offset_Az: "0",
      offset_Bx: "0",
      offset_By: "0",
      offset_Bz: "0",
      stiffness_A_Ry: 0,
      stiffness_A_Rz: 0,
      stiffness_B_Ry: 0,
      stiffness_B_Rz: 0,
    },
    "member_list_out-ids": [],
  };
}

// Fixed support
function StructuralFixedSupport({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralFixedSupport")}
      data={data}
      id={id}
      target_ids={["node-id"]}
      source_ids={["support_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralFixedSupportExec(args) {
  let node = args["node-id"];
  return {
    "support_out-id": {
      direction_code: "BBBBBB",
      tx: 0,
      ty: 0,
      tz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      type: "node",
      node,
      restraint_code: "FFFFFF",
    },
  };
}

// Pinned support
function StructuralPinSupport({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralPinSupport")}
      data={data}
      id={id}
      target_ids={["node-id"]}
      source_ids={["support_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralPinSupportExec(args) {
  let node = args["node-id"];
  return {
    "support_out-id": {
      direction_code: "BBBBBB",
      tx: 0,
      ty: 0,
      tz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      type: "node",
      node,
      restraint_code: "FFFFRR",
    },
  };
}

// Generic support
const gen_support_target_ids = ["node-id", "restraint_code-string-FFFFFF", "direction_code-string-BBBBBB"];
function StructuralGenericSupport({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralGenericSupport")}
      data={data}
      id={id}
      target_ids={gen_support_target_ids}
      source_ids={["support_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralGenericSupportExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, gen_support_target_ids);
  return {
    "support_out-id": {
      ...structural_args,
      tx: 0,
      ty: 0,
      tz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      type: "node",
    },
  };
}

// Spring support: restraint code as SkyCiv's (F fixed, R released, S spring) and the stiffness of each spring, by unit of
// translation (tx, ty, tz) or by radian of rotation (rx, ry, rz). Stiffnesses of degrees of freedom that are not S are left out
const spring_support_target_ids = ["node-id", "restraint_code-string-SSSSSS", "tx-value", "ty-value", "tz-value", "rx-value", "ry-value", "rz-value"];
function StructuralSpringSupport({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralSpringSupport")}
      data={data}
      id={id}
      target_ids={spring_support_target_ids}
      source_ids={["support_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralSpringSupportExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, spring_support_target_ids);
  let restraint_code = String(structural_args.restraint_code).trim().toUpperCase();
  let stiffness = {};
  ["tx", "ty", "tz", "rx", "ry", "rz"].forEach((key, i) => {
    let value = Number(structural_args[key]);
    stiffness[key] = restraint_code[i] === "S" && Number.isFinite(value) ? value : 0;
  });
  return {
    "support_out-id": {
      node: structural_args.node,
      restraint_code,
      direction_code: "BBBBBB",
      ...stiffness,
      type: "node",
    },
  };
}

// Mesh: its plates are meshed with its own size, whatever Structure > Mesh plates is. The logic runner meshes them once
// the boxes that do not depend on a mesh have run (so the nodes they put on the plates are mesh nodes), and writes the
// mesh (ParamEleMesh) and the list of its nodes into the outputs
const mesh_target_ids = ["plates-ids", "mesh_size-value"];
function StructuralMesh({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralMesh")}
      data={data}
      id={id}
      target_ids={mesh_target_ids}
      source_ids={["mesh_out-mesh", "node_list_out-ids"]}
    ></GenericInOutNode>
  );
}

function StructuralMeshExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, mesh_target_ids);
  let plate_ids = surfaceSupports.getPlateIds(structural_args.plates);
  let mesh_size = Number(structural_args.mesh_size);
  let box_error = null;
  if (plate_ids.length === 0) box_error = "mesh_no_plates";
  else if (!(mesh_size > 0)) box_error = "mesh_size";
  return { "mesh_out-mesh": { plate_ids: box_error ? [] : plate_ids, mesh_size }, box_error };
}

// Surface support (plate on soil, Winkler foundation): a spring support on every node of the mesh, k = ks · A along the
// directions with an S in the restraint code (global axes, the plates must face them), see surfaceSupports.js. FFSRRR by
// default, SkyCiv's vertical spring (FSFRRR with Y up): the soil also holds the plate in its plane
const surface_support_target_ids = ["mesh-mesh", "ks-value", "restraint_code-string-FFSRRR"];
function StructuralSurfaceSupport({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralSurfaceSupport")}
      data={data}
      id={id}
      target_ids={surface_support_target_ids}
      source_ids={["supports_out-ids"]}
      handle_help={{ "ks-value": utils.getDisplayCopy("handle_help", "subgrade_modulus") }}
    ></GenericInOutNode>
  );
}

function StructuralSurfaceSupportExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, surface_support_target_ids);
  let { supports, plate_ids, error } = surfaceSupports.getSurfaceSupports(structural_args.mesh, structural_args.ks, structural_args.restraint_code);
  return { "supports_out-ids": { supports, plate_ids }, box_error: error };
}

// Point load
function StructuralPointLoad({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralPointLoad")}
      data={data}
      id={id}
      target_ids={["node-id", "x_mag-value", "y_mag-value", "z_mag-value"]}
      source_ids={["point_load_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralPointLoadExec(args) {
  let node = args["node-id"];
  let x_mag = Number(args["x_mag-value"]);
  let y_mag = Number(args["y_mag-value"]);
  let z_mag = Number(args["z_mag-value"]);
  if (isNaN(x_mag)) x_mag = 0;
  if (isNaN(y_mag)) y_mag = 0;
  if (isNaN(z_mag)) z_mag = 0;
  return {
    "point_load_out-id": {
      x_mag,
      y_mag,
      z_mag,
      load_group: "LG",
      type: "N",
      node,
    },
  };
}

// Distributed load
const dl_target_ids = [
  "member-id",
  "x_mag_A-value",
  "y_mag_A-value",
  "z_mag_A-value",
  "x_mag_B-value",
  "y_mag_B-value",
  "z_mag_B-value",
  "position_A-value",
  "position_B-value-100",
  "load_group-name-LG",
];
function StructuralDistributedLoad({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralDistributedLoad")}
      data={data}
      id={id}
      target_ids={dl_target_ids}
      source_ids={["distributed_load_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralDistributedLoadExec(args) {
  let full_args = dl_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "distributed_load_out-id": {
      ...structural_args,
      axes: "global",
    },
  };
}

// Pressure on a plate (uniform, by unit area). axes: "global", "local" (the plate's axes) or "global_projected"
const pressure_target_ids = ["plate_id-id", "x_mag-value", "y_mag-value", "z_mag-value", "axes-string-global", "load_group-name-LG"];
function StructuralPressure({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralPressure")}
      data={data}
      id={id}
      target_ids={pressure_target_ids}
      source_ids={["pressure_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralPressureExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, pressure_target_ids);
  return {
    "pressure_out-id": {
      ...structural_args,
    },
  };
}

// Trapezoidal pressure on a plate, as SkyCiv's linear pressures: one component along load_direction ("X", "Y" or "Z" of the
// axes) that varies linearly over the plate, through the magnitudes at three points (node IDs, e.g. two at the water level
// with 0 and one at the bottom of a wall for a hydrostatic pressure)
const trapezoidal_pressure_target_ids = [
  "plate_id-id",
  "load_direction-string-Z",
  "p1_point_id-id",
  "p1_magnitude-value",
  "p2_point_id-id",
  "p2_magnitude-value",
  "p3_point_id-id",
  "p3_magnitude-value",
  "axes-string-global",
  "load_group-name-LG",
];
function StructuralTrapezoidalPressure({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralTrapezoidalPressure")}
      data={data}
      id={id}
      target_ids={trapezoidal_pressure_target_ids}
      source_ids={["pressure_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralTrapezoidalPressureExec(args) {
  let structural_args = utils.convertNodeToStructuralArgs(args, trapezoidal_pressure_target_ids);
  let load_direction = String(structural_args.load_direction).trim().toUpperCase();
  return {
    "pressure_out-id": {
      ...structural_args,
      x_mag: 0,
      y_mag: 0,
      z_mag: 0,
      load_distribution: "linear",
      load_direction: ["X", "Y", "Z"].includes(load_direction) ? load_direction : "Z",
    },
  };
}

// Plate
const plate_target_ids = ["nodes-ids", "thickness-value", "material_id-id-1"];
function StructuralPlate({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralPlate")}
      data={data}
      id={id}
      target_ids={plate_target_ids}
      source_ids={["plate_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralPlateExec(args) {
  let full_args = plate_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "plate_out-id": {
      ...structural_args,
      rotZ: 0,
      type: "auto",
      offset: 0,
      diaphragm: "no",
      membrane_thickness: structural_args["thickness"],
      shear_thickness: structural_args["thickness"],
      bending_thickness: structural_args["thickness"],
      state: "stress",
      // The mesher (Structure > Mesh plates) meshes it
      isMeshed: false,
    },
  };
}

// Point moment
const moment_target_ids = ["node-id", "x_mag-value", "y_mag-value", "z_mag-value"];
function StructuralMoment({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralMoment")}
      data={data}
      id={id}
      target_ids={moment_target_ids}
      source_ids={["moment_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralMomentExec(args) {
  let full_args = moment_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "moment_out-id": {
      ...structural_args,
      type: "N",
      load_group: "DL",
    },
  };
}

// Material
const material_target_ids = [
  "name-name-Concrete",
  "density-value",
  "elasticity_modulus-value-20000",
  "poissons_ratio-value-0.3",
  "class-name-concrete",
];
function StructuralMaterial({ data, id }) {
  return (
    <GenericInOutNode
      node_label={localGetCopy("structuralMaterial")}
      data={data}
      id={id}
      target_ids={material_target_ids}
      source_ids={["material_out-id"]}
    ></GenericInOutNode>
  );
}

function StructuralMaterialExec(args) {
  let full_args = material_target_ids;
  let structural_args = utils.convertNodeToStructuralArgs(args, full_args);
  return {
    "material_out-id": {
      ...structural_args,
    },
  };
}

const BasicStructuralNodes = {
  StructuralNodeNode: {
    Node: StructuralNode,
    Exec: StructuralNodeExec,
    units: { handles: { "x-value": "length", "y-value": "length", "z-value": "length" } },
  },
  StructuralMemberNode: { Node: StructuralMember, Exec: StructuralMemberExec },
  StructuralFixedSupportNode: { Node: StructuralFixedSupport, Exec: StructuralFixedSupportExec },
  StructuralPinSupportNode: { Node: StructuralPinSupport, Exec: StructuralPinSupportExec },
  StructuralGenericSupportNode: { Node: StructuralGenericSupport, Exec: StructuralGenericSupportExec },
  StructuralSpringSupportNode: {
    Node: StructuralSpringSupport,
    Exec: StructuralSpringSupportExec,
    units: {
      handles: {
        "tx-value": "translational_stiffness",
        "ty-value": "translational_stiffness",
        "tz-value": "translational_stiffness",
        "rx-value": "rotational_stiffness",
        "ry-value": "rotational_stiffness",
        "rz-value": "rotational_stiffness",
      },
    },
  },
  StructuralMeshNode: { Node: StructuralMesh, Exec: StructuralMeshExec, units: { handles: { "mesh_size-value": "length" } } },
  StructuralSurfaceSupportNode: {
    Node: StructuralSurfaceSupport,
    Exec: StructuralSurfaceSupportExec,
    units: { handles: { "ks-value": "subgrade_modulus" } },
  },
  StructuralPointLoadNode: {
    Node: StructuralPointLoad,
    Exec: StructuralPointLoadExec,
    units: { handles: { "x_mag-value": "force", "y_mag-value": "force", "z_mag-value": "force" } },
  },
  StructuralDistributedLoadNode: {
    Node: StructuralDistributedLoad,
    Exec: StructuralDistributedLoadExec,
    units: {
      handles: {
        "x_mag_A-value": "distributed_force",
        "y_mag_A-value": "distributed_force",
        "z_mag_A-value": "distributed_force",
        "x_mag_B-value": "distributed_force",
        "y_mag_B-value": "distributed_force",
        "z_mag_B-value": "distributed_force",
        "position_A-value": "unit:percent",
        "position_B-value-100": "unit:percent",
      },
    },
  },
  StructuralPlateNode: { Node: StructuralPlate, Exec: StructuralPlateExec, units: { handles: { "thickness-value": "section_length" } } },
  StructuralMomentNode: {
    Node: StructuralMoment,
    Exec: StructuralMomentExec,
    units: { handles: { "x_mag-value": "moment", "y_mag-value": "moment", "z_mag-value": "moment" } },
  },
  StructuralPressureNode: {
    Node: StructuralPressure,
    Exec: StructuralPressureExec,
    units: { handles: { "x_mag-value": "pressure", "y_mag-value": "pressure", "z_mag-value": "pressure" } },
  },
  StructuralTrapezoidalPressureNode: {
    Node: StructuralTrapezoidalPressure,
    Exec: StructuralTrapezoidalPressureExec,
    units: { handles: { "p1_magnitude-value": "pressure", "p2_magnitude-value": "pressure", "p3_magnitude-value": "pressure" } },
  },
  StructuralMaterialNode: {
    Node: StructuralMaterial,
    Exec: StructuralMaterialExec,
    units: {
      handles: { "density-value": "density", "elasticity_modulus-value-20000": "material_strength", "poissons_ratio-value-0.3": "dimensionless" },
    },
  },
};

export default BasicStructuralNodes;
