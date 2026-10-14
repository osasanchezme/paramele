"""Pure PyNite solving logic, shared by the CLI (solver.py) and the browser (Pyodide).

This module must only depend on numpy and Pynite (which needs numpy and scipy), so that it
can run inside Pyodide. No file IO here; section properties come from section_properties.py.
"""

import re
import numpy as np
from Pynite import FEModel3D, Analysis
from section_properties import rectangleProperties

SUPPORT_KEYS = ["support_DX", "support_DY", "support_DZ", "support_RX", "support_RY", "support_RZ"]
DOF_NAMES = ["translation X", "translation Y", "translation Z", "rotation X", "rotation Y", "rotation Z"]


def checkNodalStability(model, K):
    """Same check as Pynite.Analysis._check_stability (no stiffness on the diagonal for a degree of freedom that is
    not supported), vectorized. PyNite's loop looks up the node of every degree of freedom among all the nodes, which
    takes minutes for meshed plates in the browser (and crashes some browser tabs)."""
    diagonal = np.asarray(K.diagonal()).ravel()
    nodes_by_id = {node.ID: node for node in model.nodes.values()}
    unstable = []
    for i in np.flatnonzero(diagonal == 0):
        node = nodes_by_id[int(i) // 6]
        if not getattr(node, SUPPORT_KEYS[int(i) % 6]):
            unstable.append(f"{getIndex(node.name)} ({DOF_NAMES[int(i) % 6]})")
    if unstable:
        raise Exception(f"Unstable nodes, nothing stiffens them in: {', '.join(unstable[:10])}{'...' if len(unstable) > 10 else ''}")


Analysis._check_stability = checkNodalStability


def getIndex(pynite_id):
    match = re.search(r"\d+", pynite_id)
    if match:
        return int(match.group())
    return None


def nodeRestrained(node_data):
    restrained_keys = [
        "support_DX",
        "support_DY",
        "support_DZ",
        "support_RX",
        "support_RY",
        "support_RZ",
    ]
    return any(getattr(node_data, key) for key in restrained_keys)


def getObjResultsFromArray(array_results, member_length, factor=1):
    results_obj = {}
    x_i = 0
    for x in array_results[0]:
        results_obj[str(x / member_length * 100)] = factor * array_results[1][x_i]
        x_i += 1
    return results_obj


def processDisplacements(member, eval_points, load_combo):
    local_dx = member.deflection_array("dx", eval_points, load_combo)
    local_dy = member.deflection_array("dy", eval_points, load_combo)
    local_dz = member.deflection_array("dz", eval_points, load_combo)

    x_values = local_dx[0]
    dir_cos = member.T()[0:3, 0:3]

    global_dx = []
    global_dy = []
    global_dz = []
    global_sum = []
    local_sum = []

    for i in range(len(x_values)):
        local_vector = np.array([local_dx[1][i], local_dy[1][i], local_dz[1][i]])
        global_vector = dir_cos.T @ local_vector

        global_dx.append(global_vector[0])
        global_dy.append(global_vector[1])
        global_dz.append(global_vector[2])
        global_sum.append(np.linalg.norm(global_vector))
        local_sum.append(np.linalg.norm(local_vector))

    return {
        "global_x": [x_values, np.array(global_dx)],
        "global_y": [x_values, np.array(global_dy)],
        "global_z": [x_values, np.array(global_dz)],
        "global_sum": [x_values, np.array(global_sum)],
        "local_x": local_dx,
        "local_y": local_dy,
        "local_z": local_dz,
        "local_sum": [x_values, np.array(local_sum)],
    }


# Natural coordinates (xi, eta) of the corners of a PyNite quad, in the order of its nodes (i, j, m, n = A, B, C, D)
QUAD_CORNERS = [(-1, -1), (1, -1), (1, 1), (-1, 1)]


def nodeVector(node):
    return np.array([node.X, node.Y, node.Z])


def quadAxes(quad):
    """Local axes of a quad as PyNite defines them: x from node i to node j, z = x cross (n - i)."""
    i, j, n = nodeVector(quad.i_node), nodeVector(quad.j_node), nodeVector(quad.n_node)
    x = (j - i) / np.linalg.norm(j - i)
    z = np.cross(x, n - i)
    z = z / np.linalg.norm(z)
    return x, np.cross(z, x), z


def parentAxes(quad, rot_z):
    """Local axes of the parent plate: the quad axes turned rot_z degrees about the quad normal (SkyCiv's rotZ)."""
    x, y, z = quadAxes(quad)
    angle = np.radians(rot_z)
    parent_x = np.cos(angle) * x + np.sin(angle) * y
    return parent_x, np.cross(z, parent_x), z


def rotateTensor(sx, sy, sxy, rot_z):
    """Components of a 2D symmetric tensor (stresses, moments) in axes turned rot_z degrees."""
    c, s = np.cos(np.radians(rot_z)), np.sin(np.radians(rot_z))
    return (
        sx * c * c + sy * s * s + 2 * sxy * c * s,
        sx * s * s + sy * c * c - 2 * sxy * c * s,
        (sy - sx) * c * s + sxy * (c * c - s * s),
    )


def rotateVector(vx, vy, rot_z):
    c, s = np.cos(np.radians(rot_z)), np.sin(np.radians(rot_z))
    return vx * c + vy * s, -vx * s + vy * c


def quadNodalWeights(quad):
    """Area of the quad that goes to each node for a uniform pressure (consistent loads, 2x2 Gauss integration),
    and the quad's area vector (normal times area)."""
    corners = [nodeVector(node) for node in (quad.i_node, quad.j_node, quad.m_node, quad.n_node)]
    weights = np.zeros(4)
    area_vector = np.zeros(3)
    gp = 1 / 3**0.5
    for xi in (-gp, gp):
        for eta in (-gp, gp):
            shape = [(1 + cxi * xi) * (1 + ceta * eta) / 4 for cxi, ceta in QUAD_CORNERS]
            d_xi = sum((cxi * (1 + ceta * eta) / 4) * corner for (cxi, ceta), corner in zip(QUAD_CORNERS, corners))
            d_eta = sum((ceta * (1 + cxi * xi) / 4) * corner for (cxi, ceta), corner in zip(QUAD_CORNERS, corners))
            jacobian = np.cross(d_xi, d_eta)
            weights += np.array(shape) * np.linalg.norm(jacobian)
            area_vector += jacobian
    return weights, area_vector


def addPlates(model, model_data, used_load_cases):
    """Adds the meshed plates (SkyCiv meshed_plates) as PyNite quads and their pressures as nodal loads.
    Returns the rotZ of each quad, to report the results in the axes of its parent plate."""
    plates = model_data.get("plates", {}) or {}
    meshed_plates = model_data.get("meshed_plates", {}) or {}
    quads_by_plate = {}
    for quad_id, quad_data in meshed_plates.items():
        quads_by_plate.setdefault(str(quad_data["parent_plate"]), []).append(quad_id)
    for plate_id in plates:
        if str(plate_id) not in quads_by_plate:
            raise Exception(f"Plate {plate_id} is not meshed, PyNite needs the plates meshed into quads")

    quads_rot_z = {}
    for quad_id, quad_data in meshed_plates.items():
        plate_data = plates.get(str(quad_data["parent_plate"]))
        if plate_data is None:
            raise Exception(f"The parent plate of meshed plate {quad_id} does not exist")
        if quad_data.get("node_D") in (None, ""):
            raise Exception(f"Meshed plate {quad_id} is a triangle, PyNite only supports quads")
        model.add_quad(
            f"Q{quad_id}",
            *[f"N{quad_data[key]}" for key in ("node_A", "node_B", "node_C", "node_D")],
            t=float(plate_data["thickness"]),
            material_name=f"Mat{plate_data['material_id']}",
        )
        quads_rot_z[quad_id] = float(quad_data.get("rotZ") or 0)

    pressures = model_data.get("pressures", {}) or {}
    for pressure_id, pressure_data in pressures.items():
        plate_id = str(pressure_data["plate_id"])
        if plate_id not in quads_by_plate:
            raise Exception(f"Pressure {pressure_id} is on plate {plate_id}, which does not exist")
        axes = pressure_data.get("axes", "global")
        magnitudes = np.array([float(pressure_data.get(f"{axis}_mag") or 0) for axis in "xyz"])
        load_case = pressure_data["load_group"]
        if load_case not in used_load_cases:
            used_load_cases.append(load_case)
        for quad_id in quads_by_plate[plate_id]:
            quad = model.quads[f"Q{quad_id}"]
            weights, area_vector = quadNodalWeights(quad)
            if axes == "local":
                parent_x, parent_y, normal = parentAxes(quad, quads_rot_z[quad_id])
                force = (magnitudes[0] * parent_x + magnitudes[1] * parent_y + magnitudes[2] * normal) * weights.sum()
                node_forces = [force * weight / weights.sum() for weight in weights]
            elif axes == "global_projected":
                # Each component acts on the area projected on the plane perpendicular to it
                node_forces = [magnitudes * np.abs(area_vector) * weight / weights.sum() for weight in weights]
            elif axes == "global":
                node_forces = [magnitudes * weight for weight in weights]
            else:
                raise Exception(f"Pressure axes {axes} are not supported")
            for node, node_force in zip((quad.i_node, quad.j_node, quad.m_node, quad.n_node), node_forces):
                for direction, value in zip(("FX", "FY", "FZ"), node_force):
                    if value != 0:
                        model.add_node_load(node.name, direction, float(value), load_case)
    return quads_rot_z


def getPlateResults(model, quads_rot_z, lc_id):
    """Displacements (global) and forces per unit length (in the axes of the parent plate, with SkyCiv's names and
    signs) at the corners of each quad, keyed like SkyCiv: plate_displacements[displacement_x][quad_id] = [A, B, C, D]."""
    displacements = {key: {} for key in ("displacement_x", "displacement_y", "displacement_z", "displacement_sum")}
    forces = {key: {} for key in ("force_x", "force_y", "force_xy", "force_xz", "force_yz", "moment_x", "moment_y", "moment_xy")}
    for quad_id, rot_z in quads_rot_z.items():
        quad = model.quads[f"Q{quad_id}"]
        nodes = (quad.i_node, quad.j_node, quad.m_node, quad.n_node)
        dx = [node.DX[lc_id] for node in nodes]
        dy = [node.DY[lc_id] for node in nodes]
        dz = [node.DZ[lc_id] for node in nodes]
        displacements["displacement_x"][quad_id] = dx
        displacements["displacement_y"][quad_id] = dy
        displacements["displacement_z"][quad_id] = dz
        displacements["displacement_sum"][quad_id] = [float(np.linalg.norm(d)) for d in zip(dx, dy, dz)]
        for key in forces:
            forces[key][quad_id] = []
        for xi, eta in QUAD_CORNERS:
            sx, sy, sxy = rotateTensor(*[float(v[0]) for v in quad.membrane(xi, eta, True, lc_id)], rot_z)
            mx, my, mxy = rotateTensor(*[float(v[0]) for v in quad.moment(xi, eta, True, lc_id)], rot_z)
            qx, qy = rotateVector(*[float(v[0]) for v in quad.shear(xi, eta, True, lc_id)], rot_z)
            # SkyCiv's conventions (checked against its results): moments are named by the axis they turn about and
            # sagging is positive, the shears follow the moments, and membrane forces are positive in compression
            skyciv = {
                "force_x": -sx * quad.t,
                "force_y": -sy * quad.t,
                "force_xy": sxy * quad.t,
                "force_xz": qy,
                "force_yz": qx,
                "moment_x": -my,
                "moment_y": -mx,
                "moment_xy": -mxy,
            }
            for key in forces:
                forces[key][quad_id].append(skyciv[key])
    return displacements, forces


def solve(model_data, sparse=True):
    """Build, analyze and post-process a PyNite model from the UI's JSON model.

    `sparse=False` uses numpy's dense solver, so scipy is not needed (lighter browser build).
    Returns the results dict keyed by load combo index.
    """
    model = FEModel3D()

    # Add nodes to the model
    nodes = model_data.get("nodes", {})
    for node_id, coordinates in nodes.items():
        x = coordinates["x"]
        y = coordinates["y"]
        z = coordinates["z"]
        model.add_node(f"N{node_id}", x, y, z)

    # Add sections to the model
    sections = model_data.get("sections", {})
    for section_id, section_data in sections.items():
        shape = section_data["info"]["shape"]
        if shape == "rectangle":
            h = section_data["info"]["dimensions"]["h"]
            b = section_data["info"]["dimensions"]["b"]
            props = rectangleProperties(b, h)
            # Iy/Iz are swapped on purpose, see "Axis convention gotchas" in CLAUDE.md
            model.add_section(
                f"Sec{section_id}",
                A=props["A"],
                Iz=props["iyy"],
                Iy=props["ixx"],
                J=props["J"],
            )

    # Add materials to the model
    materials = model_data.get("materials", {})
    for material_id, material_data in materials.items():
        E = material_data["elasticity_modulus"]
        nu = material_data["poissons_ratio"]
        model.add_material(
            name=f"Mat{material_id}",
            E=E,
            G=E / (2 * (1 + nu)),
            nu=nu,
            rho=material_data["density"],
        )

    # Add members to the model
    members = model_data.get("members", {})
    for member_id, member_data in members.items():
        node_A = member_data["node_A"]
        node_B = member_data["node_B"]
        material_id = sections[str(member_data["section_id"])]["material_id"]
        section_id = member_data["section_id"]
        model.add_member(
            name=f"M{member_id}",
            i_node=f"N{node_A}",
            j_node=f"N{node_B}",
            section_name=f"Sec{section_id}",
            material_name=f"Mat{material_id}",
        )

    supports = model_data.get("supports", {})
    for support_id, support_data in supports.items():
        node_id = support_data["node"]
        model.def_support(
            node_name=f"N{node_id}",
            support_DX=support_data["restraint_code"][0] == "F",
            support_DY=support_data["restraint_code"][1] == "F",
            support_DZ=support_data["restraint_code"][2] == "F",
            support_RX=support_data["restraint_code"][3] == "F",
            support_RY=support_data["restraint_code"][4] == "F",
            support_RZ=support_data["restraint_code"][5] == "F",
        )

    used_load_cases = []

    distributed_loads = model_data.get("distributed_loads", {})
    for dl_id, dl_data in distributed_loads.items():
        load_z_A = dl_data["z_mag_A"]
        load_z_B = dl_data["z_mag_B"]
        load_y_A = dl_data["y_mag_A"]
        load_y_B = dl_data["y_mag_B"]
        load_x_A = dl_data["x_mag_A"]
        load_x_B = dl_data["x_mag_B"]
        member_id = dl_data["member"]
        load_case = dl_data["load_group"]
        if not load_case in used_load_cases:
            used_load_cases.append(load_case)
        if load_z_A != 0 or load_z_B != 0:
            model.add_member_dist_load(
                member_name=f"M{member_id}",
                case=load_case,
                direction="FZ",
                w1=load_z_A,
                w2=load_z_B,
            )
        if load_x_A != 0 or load_x_B != 0 or load_y_A != 0 or load_y_B != 0:
            raise Exception(f"Distributed loads in X and Y are not supported yet")

    point_loads = model_data.get("point_loads", {})
    for pl_id, pl_data in point_loads.items():
        load_z = pl_data["z_mag"]
        load_y = pl_data["y_mag"]
        load_x = pl_data["x_mag"]
        node_id = pl_data["node"]
        type = pl_data["type"]
        if type != "N":
            raise Exception(f"Point load of type {type} is not supported yet")
        load_case = pl_data["load_group"]
        if not load_case in used_load_cases:
            used_load_cases.append(load_case)
        if load_z != 0:
            model.add_node_load(f"N{node_id}", "FZ", load_z, load_case)
        if load_y != 0:
            model.add_node_load(f"N{node_id}", "FY", load_y, load_case)
        if load_x != 0:
            model.add_node_load(f"N{node_id}", "FX", load_x, load_case)

    quads_rot_z = addPlates(model, model_data, used_load_cases)

    # Add a default load combo with all the cases
    default_combo_factors = {}
    for used_load_case in used_load_cases:
        default_combo_factors[used_load_case] = 1.0
    model.add_load_combo("Default", default_combo_factors)

    model.analyze_linear(log=False, sparse=sparse)

    results = {}

    # Handle the results
    eval_points = 50
    lc_index = 0
    for lc_id, lc_data in model.load_combos.items():
        results[lc_index] = {
            "name": lc_id,
            "type": "load_group",
            "reactions": {},
            "member_displacements": {
                "displacement_x": {},
                "displacement_y": {},
                "displacement_z": {},
                "displacement_sum": {},
                "displacement_local_x": {},
                "displacement_local_y": {},
                "displacement_local_z": {},
                "displacement_local_sum": {},
                "rotation_x": {},
                "rotation_y": {},
                "rotation_z": {},
                "rotation_local_x": {},
                "rotation_local_y": {},
                "rotation_local_z": {},
            },
            "member_forces": {
                "axial_force": {},
                "shear_force_y": {},
                "shear_force_z": {},
                "bending_moment_y": {},
                "bending_moment_z": {},
                "torsion": {},
            },
        }
        if quads_rot_z:
            plate_displacements, plate_forces = getPlateResults(model, quads_rot_z, lc_id)
            results[lc_index]["plate_displacements"] = plate_displacements
            results[lc_index]["plate_forces"] = plate_forces
        for node_id, node_data in model.nodes.items():
            if nodeRestrained(node_data):
                results[lc_index]["reactions"][getIndex(node_id)] = {
                    "Fx": node_data.RxnFX[lc_id],
                    "Fy": node_data.RxnFY[lc_id],
                    "Fz": node_data.RxnFZ[lc_id],
                    "Mx": node_data.RxnMX[lc_id],
                    "My": node_data.RxnMY[lc_id],
                    "Mz": node_data.RxnMZ[lc_id],
                }
        for member_id, member_data in model.members.items():
            displacement_arrays = processDisplacements(member_data, eval_points, lc_id)

            results[lc_index]["member_displacements"]["displacement_x"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["global_x"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_y"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["global_y"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_z"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["global_z"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_sum"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["global_sum"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_local_x"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["local_x"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_local_y"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["local_z"], member_data.L())
            results[lc_index]["member_displacements"]["displacement_local_z"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["local_y"], member_data.L(), -1)
            results[lc_index]["member_displacements"]["displacement_local_sum"][
                getIndex(member_id)
            ] = getObjResultsFromArray(displacement_arrays["local_sum"], member_data.L())

            results[lc_index]["member_forces"]["axial_force"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.axial_array(eval_points, lc_id), member_data.L()
                )
            )
            results[lc_index]["member_forces"]["shear_force_y"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.shear_array("Fz", eval_points, lc_id), member_data.L()
                )
            )
            results[lc_index]["member_forces"]["shear_force_z"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.shear_array("Fy", eval_points, lc_id), member_data.L(), -1
                )
            )
            results[lc_index]["member_forces"]["bending_moment_y"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.moment_array("Mz", eval_points, lc_id), member_data.L()
                )
            )
            results[lc_index]["member_forces"]["bending_moment_z"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.moment_array("My", eval_points, lc_id), member_data.L(), -1
                )
            )
            results[lc_index]["member_forces"]["torsion"][getIndex(member_id)] = (
                getObjResultsFromArray(
                    member_data.torque_array(eval_points, lc_id), member_data.L()
                )
            )
        lc_index += 1

    return results
