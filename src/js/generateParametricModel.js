import { addEdgesArrayToTheEditor, addNodesArrayToTheEditor, addNodeToTheEditor, fitView, getEdgeObject, getZoom } from "../components/VisualEditor";
import utils from "../utils";
import { getProcessResponseObject } from "./processResponse";
import pressuresUtils from "./pressures";

class ParameleInterface {
  constructor(x_orig, y_orig, master_spacing) {
    this.x_orig = x_orig;
    this.y_orig = y_orig;
    this.master_spacing = master_spacing;
    this.number_nodes = 0;
    /** @type {Object.<string, {coords: {x: number, y: number}, nodes_list: object[], maps: Object.<string, number>}>} */
    this.nodes = {
      parameters: { coords: { x: this.x_orig, y: this.y_orig }, nodes_list: [], maps: {} },
      materials: { coords: { x: this.x_orig + 3 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      sections: { coords: { x: this.x_orig + 6 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      nodes: { coords: { x: this.x_orig + 9 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      members: { coords: { x: this.x_orig + 12 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      plates: { coords: { x: this.x_orig + 15 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      supports: { coords: { x: this.x_orig + 18 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      distributed_loads: { coords: { x: this.x_orig + 21 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      point_loads: { coords: { x: this.x_orig + 24 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      moments: { coords: { x: this.x_orig + 27 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
      pressures: { coords: { x: this.x_orig + 30 * this.master_spacing, y: this.y_orig }, nodes_list: [], maps: {} },
    };
  }
  edges = [];
  log = {};
  addInputNode = (custom_label, value) => {
    this.addNode("parameters", "inputNumber", custom_label, { "value-value": value });
  };
  addStringNode = (custom_label, value) => {
    this.addNode("parameters", "inputString", custom_label, { "value-string": value });
  };
  spaceNodesGroup = (group_name, spacing_multiplier = 1) => {
    this.nodes[group_name].coords.y += this.master_spacing * spacing_multiplier;
  };
  /**
   *
   * @param {{group_name: string, map_key: string}} source
   * @param {string} sourceHandle
   * @param {{group_name: string, map_key: string}} target
   * @param {string} targetHandle
   */
  addEdge = (source, sourceHandle, target, targetHandle) => {
    if (typeof source == "object") {
      let { group_name, map_key } = source;
      source = this.nodes[group_name].maps[map_key];
    }
    if (typeof target == "object") {
      let { group_name, map_key } = target;
      target = this.nodes[group_name].maps[map_key];
    }
    this.edges.push(getEdgeObject(source, sourceHandle, target, targetHandle));
  };
  /**
   *
   * @param {string} group_name
   * @param {import("./types").ParamEleNodesTypes} type
   * @param {number|string} element_id
   * @param {object} additional_data
   * @param {number|undefined} spacing_multiplier
   */
  addNode = (group_name, type, element_id, additional_data, spacing_multiplier = 1) => {
    this.number_nodes += 1;
    this.spaceNodesGroup(group_name, spacing_multiplier);
    let custom_label = isNaN(element_id) ? element_id : `${utils.getDisplayCopy("nodes", type)} ${element_id}`;
    let data = { custom_label };
    if (additional_data) Object.assign(data, additional_data);
    this.nodes[group_name].nodes_list.push(
      addNodeToTheEditor(type, { x: this.nodes[group_name].coords.x, y: this.nodes[group_name].coords.y }, data, false, false, this.number_nodes)
    );
    let new_node_id = utils.getNodeFullID(this.number_nodes);
    if (this.nodes[group_name].maps[element_id] != undefined) throw new Error(`Element id ${element_id} under ${group_name} already taken!`);
    this.nodes[group_name].maps[element_id] = new_node_id;
  };
  /**
   *
   * @param {*} elements_collection
   * @param {Object.<string, {type: "value"|"string", target_handle: string, data: Object.<string, string[]>}>} parameters
   * @param {*} dependencies
   * @param {{elements_group_name: string, elements_node_type: import("./types").ParamEleNodesTypes, elements_node_spacing: number}} param3
   */
  addNodesAndEdgesFromParameters = (
    elements_collection,
    parameters,
    dependencies,
    { elements_group_name, elements_node_type, elements_node_spacing }
  ) => {
    Object.entries(parameters).forEach(([parameter_name, parameter_object], parameter_index) => {
      if (!parameter_object.data) return; // Skip processing the parameter if there is no data
      Object.entries(parameter_object.data).forEach(([parameter_value, element_ids], sub_parameter_index) => {
        // Define the nodes with the parameters (number or string)
        let sub_parameter_id = `${utils.getDisplayCopy("tags", parameter_name).toUpperCase()}-${sub_parameter_index + 1} (${utils
          .getDisplayCopy("nodes", elements_node_type)
          .toUpperCase()})`;
        switch (parameter_object.type) {
          case "string":
            this.addStringNode(sub_parameter_id, parameter_value);
            break;
          case "value":
            this.addInputNode(sub_parameter_id, parameter_value);
            break;
          default:
            throw new Error(`Unknown parameter type ${parameter_object.type} for parameter ${parameter_name}`);
        }

        // Define the structural nodes
        if (parameter_index == 0) {
          element_ids.forEach((element_id) => {
            this.addNode(elements_group_name, elements_node_type, element_id, undefined, elements_node_spacing);

            // Connect the dependencies with the recently added structural nodes
            dependencies.forEach(({ key, group_name, target_handle, source_handle, multi_source_function }) => {
              let sources_list =
                multi_source_function == undefined
                  ? [elements_collection[element_id][key]]
                  : multi_source_function(elements_collection[element_id][key]);

              sources_list.forEach((source_id) => {
                this.addEdge(
                  { group_name, map_key: source_id },
                  source_handle,
                  { group_name: elements_group_name, map_key: element_id },
                  target_handle
                );
              });
            });
          });
          this.spaceNodesGroup(elements_group_name);
        }

        // Connect the parameters with the structural node
        element_ids.forEach((element_id) => {
          this.addEdge(
            { group_name: "parameters", map_key: sub_parameter_id },
            `value-${parameter_object.type}`,
            { group_name: elements_group_name, map_key: element_id },
            parameter_object.target_handle
          );
        });
      });
      this.spaceNodesGroup("parameters");
    });
  };
  getAllNodes = () => {
    let all_nodes = [];
    Object.values(this.nodes).forEach(({ nodes_list }) => {
      all_nodes.push(...nodes_list);
    });
    return all_nodes;
  };
  getAllEdges = () => {
    return this.edges;
  };
  appendToLog = (group_name, element_id, reason) => {
    if (!this.log[group_name]) this.log[group_name] = [];
    this.log[group_name].push({
      element_id,
      reason,
    });
  };
  /**
   *  Groups items of an object by shared keys
   * @param {{[string]: {[string]: number}}} source_obj - Any object with multiple keys of the same kind which are groupable by some second level keys
   * @param {Object.<string, {type: "value"|"string", target_handle: string, data: Object.<string, string[]>}>} parameters_obj - Object in which to store the parameters, Each key in the object will be populated by the shared parameters
   * @param {function} filter_function
   * @param {string} group_name
   */
  findParameters = (source_obj, parameters_obj, filter_function, group_name) => {
    Object.entries(source_obj).forEach(([element_id, element_data]) => {
      if (filter_function && !filter_function(element_data)) {
        this.appendToLog(group_name, element_id, "not_supported_by_filter");
        return;
      }
      Object.keys(parameters_obj).forEach((parameter_name) => {
        let parameter_value = element_data[parameter_name];
        if (parameters_obj[parameter_name].location != undefined) {
          parameter_value = getValueByPath(element_data, parameters_obj[parameter_name].location);
        }
        if (parameters_obj[parameter_name].type == undefined) parameters_obj[parameter_name].type = "value";
        // If undefined fill the target handle with the predefined name-type
        if (parameters_obj[parameter_name].target_handle == undefined)
          parameters_obj[parameter_name].target_handle = `${parameter_name}-${parameters_obj[parameter_name].type}`;
        if (parameters_obj[parameter_name].data == undefined) parameters_obj[parameter_name].data = {};
        if (!parameters_obj[parameter_name].data[parameter_value]) {
          parameters_obj[parameter_name].data[parameter_value] = [];
        }
        parameters_obj[parameter_name].data[parameter_value].push(element_id);
      });
    });
    return parameters_obj;
  };
}

/**
 * Generates a parametric model in the reactflow editor starting from an S3D model
 * @param {import("../submodules/paramele-parsers/types").s3d_model} s3d_model
 * @param {import("./types").ParamEleProcessResponseHandlerCallback} callback
 * @returns
 */
const generateParametricModel = (s3d_model, callback) => {
  let zoom = getZoom();
  let x_orig = -3500;
  let y_orig = -3500;
  let master_spacing = 50 * (zoom / 0.5); // Normalize the spacing so it is independent of the zoom level

  let paramele_interface = new ParameleInterface(x_orig, y_orig, master_spacing);

  let { nodes, members, plates, supports, distributed_loads, point_loads, moments, sections, materials, pressures = {} } = s3d_model;
  // Process the nodes by faces
  let nodes_faces = paramele_interface.findParameters(nodes, { x: {}, y: {}, z: {} });
  let nodes_dependencies = [];
  paramele_interface.addNodesAndEdgesFromParameters(nodes, nodes_faces, nodes_dependencies, {
    elements_group_name: "nodes",
    elements_node_type: "structuralNode",
    elements_node_spacing: 1.5,
  });

  // Process the materials by properties
  paramele_interface.spaceNodesGroup("parameters");
  let materials_properties = paramele_interface.findParameters(materials, {
    density: {},
    elasticity_modulus: { target_handle: "elasticity_modulus-value-20000" },
    poissons_ratio: { target_handle: "poissons_ratio-value-0.3" },
    name: { type: "string", target_handle: "name-name-Concrete" },
    class: { type: "string", target_handle: "class-name-concrete" },
  });
  let materials_dependencies = [];
  paramele_interface.addNodesAndEdgesFromParameters(materials, materials_properties, materials_dependencies, {
    elements_group_name: "materials",
    elements_node_type: "structuralMaterial",
    elements_node_spacing: 1.5,
  });

  // Process the rectangular sections by dimensions
  paramele_interface.spaceNodesGroup("parameters");
  let sections_dimensions = paramele_interface.findParameters(
    sections,
    {
      base: { location: ["aux", "polygons", "0", "dimensions", "b", "value"], target_handle: "base-value-1" },
      height: { location: ["aux", "polygons", "0", "dimensions", "h", "value"], target_handle: "height-value-1" },
    },
    (section) => section.aux && section.aux.polygons[0].shape == "rectangle",
    "sections"
  );
  let sections_dependencies = [{ key: "material_id", group_name: "materials", target_handle: "material_id-id-1", source_handle: "material_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(sections, sections_dimensions, sections_dependencies, {
    elements_group_name: "sections",
    elements_node_type: "structuralRectangleSection",
    elements_node_spacing: 1.5,
  });

  // Process the other sections by properties
  paramele_interface.spaceNodesGroup("parameters");
  let sections_properties = paramele_interface.findParameters(
    sections,
    {
      area: { target_handle: "area-value-1" },
      Iz: { target_handle: "Iz-value-1" },
      Iy: { target_handle: "Iy-value-1" },
      J: { target_handle: "J-value-1" },
    },
    (section) => !section.aux || section.aux.polygons[0].shape != "rectangle",
    "sections"
  );
  let sections_gen_dependencies = [
    { key: "material_id", group_name: "materials", target_handle: "material_id-id-1", source_handle: "material_out-id" },
  ];
  paramele_interface.addNodesAndEdgesFromParameters(sections, sections_properties, sections_gen_dependencies, {
    elements_group_name: "sections",
    elements_node_type: "structuralGenericSection",
    elements_node_spacing: 1.5,
  });

  // Add the members
  Object.entries(members).forEach(([member_id, { node_A, node_B, section_id }]) => {
    paramele_interface.addNode("members", "structuralMember", member_id, undefined, 1.5);
    // Add the edge to node_A
    paramele_interface.addEdge({ group_name: "nodes", map_key: node_A }, "node_out-id", { group_name: "members", map_key: member_id }, "node_A-id");
    // Add the edges to node_B
    paramele_interface.addEdge({ group_name: "nodes", map_key: node_B }, "node_out-id", { group_name: "members", map_key: member_id }, "node_B-id");
    // Add the edges to section_id if the section id is defined
    if (section_id != undefined) {
      paramele_interface.addEdge(
        { group_name: "sections", map_key: section_id },
        "section_out-id",
        { group_name: "members", map_key: member_id },
        "section_id-id-1"
      );
    }
  });

  // Process the plates by thickness
  let plates_thicknesses = paramele_interface.findParameters(plates, { thickness: {} });
  let plates_dependencies = [
    {
      key: "nodes",
      group_name: "nodes",
      target_handle: "nodes-ids",
      source_handle: "node_out-id",
      multi_source_function: (element_data) => {
        let plate_nodes_as_array = Array.isArray(element_data) ? element_data : element_data.split(",");
        return plate_nodes_as_array;
      },
    },
  ];
  paramele_interface.addNodesAndEdgesFromParameters(plates, plates_thicknesses, plates_dependencies, {
    elements_group_name: "plates",
    elements_node_type: "structuralPlate",
    elements_node_spacing: 1.5,
  });

  // Process the supports by fixity code
  let supports_restraints = paramele_interface.findParameters(supports, {
    restraint_code: { type: "string", target_handle: "restraint_code-string-FFFFFF" },
  });
  let supports_dependencies = [{ key: "node", group_name: "nodes", target_handle: "node-id", source_handle: "node_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(supports, supports_restraints, supports_dependencies, {
    elements_group_name: "supports",
    elements_node_type: "structuralGenericSupport",
    elements_node_spacing: 1.5,
  });

  // Process the distributed loads by magnitude
  paramele_interface.spaceNodesGroup("parameters");
  let dl_magnitudes = paramele_interface.findParameters(distributed_loads, {
    x_mag_A: {},
    y_mag_A: {},
    z_mag_A: {},
    x_mag_B: {},
    y_mag_B: {},
    z_mag_B: {},
  });
  let dl_dependencies = [{ key: "member", group_name: "members", target_handle: "member-id", source_handle: "member_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(distributed_loads, dl_magnitudes, dl_dependencies, {
    elements_group_name: "distributed_loads",
    elements_node_type: "structuralDistributedLoad",
    elements_node_spacing: 2,
  });

  // Process the point loads by magnitude
  paramele_interface.spaceNodesGroup("parameters");
  let pl_magnitudes = paramele_interface.findParameters(point_loads, {
    x_mag: {},
    y_mag: {},
    z_mag: {},
  });
  let pl_dependencies = [{ key: "node", group_name: "nodes", target_handle: "node-id", source_handle: "node_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(point_loads, pl_magnitudes, pl_dependencies, {
    elements_group_name: "point_loads",
    elements_node_type: "structuralPointLoad",
    elements_node_spacing: 1.5,
  });

  // Process the moments by magnitude
  paramele_interface.spaceNodesGroup("parameters");
  let moments_magnitudes = paramele_interface.findParameters(moments, {
    x_mag: {},
    y_mag: {},
    z_mag: {},
  });
  let moments_dependencies = [{ key: "node", group_name: "nodes", target_handle: "node-id", source_handle: "node_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(moments, moments_magnitudes, moments_dependencies, {
    elements_group_name: "moments",
    elements_node_type: "structuralMoment",
    elements_node_spacing: 1.5,
  });

  // Process the pressures by magnitude and axes
  paramele_interface.spaceNodesGroup("parameters");
  let pressures_with_axes = Object.entries(pressures).map(([pressure_id, pressure]) => [
    pressure_id,
    { ...pressure, axes: pressure.axes || "global" },
  ]);
  let uniform_pressures = Object.fromEntries(pressures_with_axes.filter(([, pressure]) => !pressuresUtils.isLinear(pressure)));
  let linear_pressures = Object.fromEntries(pressures_with_axes.filter(([, pressure]) => pressuresUtils.isLinear(pressure)));
  let pressures_magnitudes = paramele_interface.findParameters(uniform_pressures, {
    x_mag: {},
    y_mag: {},
    z_mag: {},
    axes: { type: "string", target_handle: "axes-string-global" },
  });
  let pressures_dependencies = [{ key: "plate_id", group_name: "plates", target_handle: "plate_id-id", source_handle: "plate_out-id" }];
  paramele_interface.addNodesAndEdgesFromParameters(uniform_pressures, pressures_magnitudes, pressures_dependencies, {
    elements_group_name: "pressures",
    elements_node_type: "structuralPressure",
    elements_node_spacing: 2,
  });
  paramele_interface.spaceNodesGroup("parameters");
  // The boxes are made with the first parameter, which every linear pressure has
  let linear_parameters = paramele_interface.findParameters(linear_pressures, {
    load_direction: { type: "string", target_handle: "load_direction-string-Z" },
    p1_magnitude: {},
    p2_magnitude: {},
    p3_magnitude: {},
    axes: { type: "string", target_handle: "axes-string-global" },
  });
  let linear_dependencies = [
    ...pressures_dependencies,
    ...pressuresUtils.POINT_KEYS.map((point) => ({
      key: `${point}_point_id`,
      group_name: "nodes",
      target_handle: `${point}_point_id-id`,
      source_handle: "node_out-id",
    })),
  ];
  paramele_interface.addNodesAndEdgesFromParameters(linear_pressures, linear_parameters, linear_dependencies, {
    elements_group_name: "pressures",
    elements_node_type: "structuralTrapezoidalPressure",
    elements_node_spacing: 3,
  });

  console.log(paramele_interface.log);

  // Add everything to the editor
  addNodesArrayToTheEditor(paramele_interface.getAllNodes());
  addEdgesArrayToTheEditor(paramele_interface.getAllEdges());
  // TODO - Improve this temporal fix to ensure the Visual Editor doesn't break
  // TODO - Get the log back to the user so they know what happened (summarize what was imported)
  setTimeout(() => {
    fitView();
    callback(getProcessResponseObject("success", "", paramele_interface.log));
  }, 1000);
};

const getValueByPath = (obj, path) => {
  let current = obj;

  for (let key of path) {
    if (current && key in current) {
      current = current[key];
    } else {
      return undefined;
    }
  }

  return current;
};

export default generateParametricModel;
