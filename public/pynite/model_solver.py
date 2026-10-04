"""Pure PyNite solving logic, shared by the CLI (solver.py) and the browser (Pyodide).

This module must only depend on numpy and Pynite (which needs numpy and scipy), so that it
can run inside Pyodide. No file IO here; section properties come from section_properties.py.
"""

import re
import numpy as np
from Pynite import FEModel3D
from section_properties import rectangleProperties


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
