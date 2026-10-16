/**
 * @typedef {object} ParamEleProcessResponse
 * @property {ParamEleProcessStatus} status
 * @property {string} msg Message itself of a key to look in the copies
 * @property {any} data
 * @property {boolean} success
 */

/**
 * @typedef {'success'|'error'|'running'|'warning'} ParamEleProcessStatus
 */

/**
 * @callback ParamEleProcessResponseHandlerCallback
 * @param {ParamEleProcessResponse} response_object
 */

/**
 * @typedef {object} ParamEleFormField
 * @property {string} value
 * @property {boolean} valid
 * @property {error_msg} string
 */

/**
 * @typedef {object} ParamEleDefaultFormField Object with the needed data to create a proper ParamEleForm and use it to validate and everything
 * @property {String} default Default value
 * @property {"text"|"email"|"dropdown"|"password"} type Type of the field
 * @property {Array.<ParamEleFormValidationObject>} validation
 * @property {Boolean} is_first_field
 * @property {string} [autocomplete] Autocomplete token of the input (e.g. "username", "current-password"), "off" when missing
 */

/**
 * @typedef {Object} ParamEleFormValidationObject
 * @property {"equal_key"|"no"|"contains"|"min_length"|"custom_function"} type
 * @property {string} criteria String against which to apply the validation type
 * @property {string} msg Key of the message in the copies to display
 */

/**
 * @typedef {Object} ParamEleFileData
 * @property {string} file_name,
 * @property {boolean} is_saved,
 * @property {number} last_saved,
 * @property {string} model_id,
 * @property {string[]} file_path File path including "home" in the first position,
 * @property {number} current_version
 * @property {string} file_owner_path
 * @property {boolean} file_shared_with_me
 * @property {ParamEleFileHistory} file_history
 * @property {ParamEleFileSharedData} file_shared_data
 */

/**
 * @callback ParamEleSetFileDataCallback
 * @param {ParamEleFileData} file_data
 */

/**
 * @callback ParamEleGetFileDataCallback
 * @returns {ParamEleFileData}
 */

/**
 * @typedef {Object} ParamEleFireBaseProjectData
 * @property {number} created
 * @property {number} current_version
 * @property {ParamEleFileHistory} history
 * @property {string} id Model ID
 * @property {ParamEleUserRole} role
 * @property {ParamEleFileSharedData} shared
 */

/**
 * @description Document in the projects collection of Firestore (one per model, its ID is the model ID)
 * @typedef {Object} ParamEleFireBaseProjectDoc
 * @property {string} id Model ID
 * @property {string} owner User ID of the file owner
 * @property {string} name File name in the owner file manager
 * @property {string[]} path Folder of the file in the owner file manager, including "home" in the first position
 * @property {number} created
 * @property {number} current_version
 * @property {number} last_modified
 * @property {ParamEleFileHistory} history
 * @property {ParamEleFileSharedData} shared
 * @property {string[]} shared_with User IDs in shared, kept in sync to query the files shared with a user
 */

/**
 * @typedef {Object} ParamEleFireBaseCompleteSharedProjectData
 * @property {number} created
 * @property {number} current_version
 * @property {ParamEleFileHistory} history
 * @property {string} id Model ID
 * @property {ParamEleUserRole} role
 * @property {ParamEleFileSharedData} shared
 * @property {string} owner User ID of the file owner
 * @property {string} path Model ID of the shared project (stored as file_owner_path)
 * @property {boolean} is_shared_with_me Whether or not this file is shared with me
 */

/**
 * @typedef {Object.<number, ParamEleFileVersionItem>} ParamEleFileHistory
 */

/**
 * @typedef {{commit_msg: string, num_nodes: number, results_available: boolean, author: string}} ParamEleFileVersionItem
 */

/**
 * @description Basic object with contact information
 * @typedef {{email: string, username: string}} ParamEleContact
 */

/**
 * @description Object with the data for all the contacts with the model shared
 * @typedef {Object.<string,ParamEleFileSharedSubData>} ParamEleFileSharedData
 */

/**
 * @description Object with the sharing data for one contact
 * @typedef {{date: number, role: ParamEleUserRole}} ParamEleFileSharedSubData
 */

/**
 * @description SkyCiv credentials of the signed-in user, stored in users/{uid}.solver (see solverCredentials.js)
 * @typedef {{solver_username: string, solver_key: string}} ParamEleSolverCredentials
 */

/**
 * @callback ParamEleContactHandlerCallback
 * @param {ParamEleContact} contact
 */

/**
 * @callback ParamEleFireBaseProjectDataCallback
 * @param {ParamEleFireBaseCompleteSharedProjectData} project_data
 */

/**
 * @typedef {'owner'|'admin'|'editor'|'guest'} ParamEleUserRole
 */

/**
 * @typedef {'view'|'make_copy'|'edit'|'delete'|'save'|'share'|'transfer'|'manage_versions'} ParamElePermissions
 */

/**
 * @typedef {'inputNumber'|'variableRange'|'sumNumbers'|'multiplyNumbers'|'divideNumbers'|'roundNumber'|'powerNumber'|'rootNumber'|'sin'|'cos'|'tan'|'asin'|'acos'|'atan'|'deg2rad'|'structuralNode'|'structuralMember'|'structuralFixedSupport'|'structuralPinSupport'|'structuralGenericSupport'|'structuralPointLoad'|'structuralDistributedLoad'|'structuralPlate'|'structuralMoment'|'structuralPressure'|'structuralTrapezoidalPressure'|'structuralMaterial'|'structuralRectangleSection'|'structuralGenericSupport'|'nodesWrapper'|'structuralMemberResult'|'structuralNodeResult'|'dataDisplay2DPlot'} ParamEleNodesTypes
 */

/**
 * @typedef {Object.<string, ParamEleFormField>} ParamEleFormStateObject
 */

/**
 * @typedef {Object.<string, ParamEleDefaultFormField>} ParamEleFormDefaultStateObject
 */

/**
 * @typedef {object} ParamEleFavoriteParameter A parameter pinned to the parameters panel, stored in model.favorites
 * @property {string} node_id Node that holds the parameter
 * @property {string} data_key Key under node.data with the value (e.g. "value-value")
 * @property {number} [min] Lower limit of the slider (only for inputNumber nodes)
 * @property {number} [max] Upper limit of the slider (only for inputNumber nodes)
 * @property {number} [step] Step of the slider (only for inputNumber nodes)
 */

/**
 * @typedef {"number"|"string"|"range"} ParamEleFavoriteKind How a favorite parameter is edited: free number, text, or a variableRange slider
 */

/**
 * One possibility calculated when sliders_mode is "sliders_all", stored in the "structure_combinations" global variable
 * @typedef {object} ParamEleStructureCombination
 * @property {string} node_label Label of the variableRange node that is iterated
 * @property {number} value Value that the iterated node takes in this possibility
 * @property {string[]} node_ids Structural nodes created by this possibility
 */

exports.unused = {};

/**
 * @typedef {"paramele"|"skyciv"|"dxf"|"csi"} ParamEleImportFileType Formats that can be imported (dropped or picked) into the editor
 */

/**
 * @typedef {"reading"|"detecting"|"converting"|"generating_parametric_model"|"loading_model"} ParamEleImportStep
 */

/**
 * @typedef {object} ParamEleImportStatus Progress of a file import
 * @property {string} file_name
 * @property {ParamEleImportFileType|null} type Null until the format is detected
 * @property {ParamEleImportStep[]} steps Steps of the process for this type of file
 * @property {ParamEleImportStep} step Step that is running
 * @property {Object.<string, number>|null} summary Number of elements per S3D group found in a structural file
 * @property {ParamEleImportSkipped[]} skipped Entities of the file that were left out of the model
 */

/**
 * @typedef {object} ParamEleImportSkipped Entities of the same type that an importer left out for the same reason
 * @property {string} type Entity type in the source format, e.g. CIRCLE in a DXF
 * @property {"unsupported"|"invalid"|"paper_space"|"zero_length"|"duplicate"|"mesh"} reason
 * @property {number} count
 */

/**
 * A point picked in the renderer while drawing
 * @typedef {Object} ParamEleDrawingPoint
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {number} [structural_id] Structural node that was clicked, if any
 * @property {string} [node_id] Structural node box already resolved for this point
 */

/**
 * @typedef {"none"|"member"|"plate"|"point_load"|"distributed_load"|"pressure"|"moment"|"support"|"delete"|"assign"} ParamEleDrawingTool
 */

/**
 * State of the drawing tools in the renderer
 * @typedef {Object} ParamEleDrawingState
 * @property {ParamEleDrawingTool} tool
 * @property {"xy"|"xz"|"yz"} plane Work plane: xy is horizontal at z = offset, xz is at y = offset, yz is at x = offset
 * @property {number} offset
 * @property {number} spacing Grid spacing
 * @property {ParamEleDrawingPoint[]} points Points picked for the member or plate being drawn
 * @property {ParamEleDrawingPoint|null} hover_point Grid point or node under the cursor, for the member and plate tools
 * @property {{kind: string, id: string, x: number, y: number, z: number}|null} hover_target Element under the cursor, for the other tools
 * @property {{kind: string, id: string, x: number, y: number, z: number}|null} selected_target Element being edited in place
 * @property {{structure_key: string, element_id: string}[]} highlight Elements of the boxes highlighted from the editor or the explorer
 * @property {{x: number, y: number, z: number}} force Point load components
 * @property {{x: number, y: number, z: number}} distributed Distributed load components
 * @property {{x: number, y: number, z: number}} moment Moment components
 * @property {{x: number, y: number, z: number}} pressure Pressure components (on plates)
 * @property {"global"|"local"} pressure_axes Axes of the pressure components: global, or the plate's local axes
 * @property {number} thickness Plate thickness
 * @property {"FFFFFF"|"FFFFRR"} restraint_code Support type
 * @property {"section"|"material"} assign_mode What the assign tool paints: sections on members or materials on plates
 * @property {string|null} active_section Section box of new members and of the assign tool, "default" for none,
 * or null for the section of the last drawn member
 * @property {string|null} active_material Material box the assign tool paints on plates, "default" for none
 */

/**
 * An element clicked in the renderer to edit its inputs
 * @typedef {Object} ParamEleDrawingEntity
 * @property {string} node_id Box behind the element
 * @property {string} type Type of the box
 * @property {string} structure_key e.g. "point_loads"
 * @property {string|undefined} element_id Structural ID of the element
 * @property {ParamEleDrawingEntityField[]} fields
 * @property {ParamEleDrawingEntityLink[]} [links] Inputs that take a section or material box
 * @property {{node_id: string, label: string}} [group] Group box the element comes from, then it is not editable here
 */

/**
 * @typedef {Object} ParamEleDrawingEntityField
 * @property {string} key
 * @property {string} [label] Label of the field, or label_copy to translate it
 * @property {string} [label_copy]
 * @property {"restraint"|"axes"} [kind] Fields that are not numbers, picked from `options`
 * @property {{value: string, copy: string}[]} [options] Values to pick from, with the copy key of their label
 * @property {number|string} [default] Value shown when the element has none
 * @property {string[]} handles Inputs of the box that take this value
 * @property {number|string} value
 * @property {{node_id: string, label: string, editable: boolean, shared_with: {type: string, count: number}[]}|null} source
 *  Box that feeds the input: editable when it is a parameter box, shared_with lists the other boxes it feeds
 */

/**
 * Mesh of the plates made in the last run of the logic (see globalLogicRunner.meshPlates)
 * @typedef {Object} ParamEleStructureMesh
 * @property {number} mesh_size
 * @property {number[]} node_ids Nodes created by the mesher
 * @property {number} element_count Quads in meshed_plates
 * @property {number} plate_count Plates meshed
 * @property {{plate_id: string, reason: "invalid_nodes"|"degenerate"|"not_flat"|"self_intersecting"|"mesh_failed"}[]} skipped Plates that could not be meshed
 */

/**
 * @typedef {Object} ParamEleMeshResult
 * @property {import("../submodules/paramele-parsers/types").s3d_model} structure The meshed copy of the structure
 * @property {number[]} node_ids Nodes created by the mesher
 * @property {number} element_count
 * @property {string[]} meshed_plate_ids
 * @property {{plate_id: string, reason: string}[]} skipped
 */

/**
 * Sample model served by the hosting (public/samples, built by scripts/build_samples.mjs). Its file is <id>.<language>.json
 * @typedef {Object} ParamEleSample
 * @property {string} id
 * @property {{es: string, en: string}} title
 * @property {{es: string, en: string}} description
 * @property {{es: string[], en: string[]}} tags
 * @property {number} boxes Number of boxes in the model
 * @property {string} thumbnail File name of its picture, next to the model files
 * @property {{es: string, en: string}} [tutorial] URL of the tutorial that builds it
 */

/**
 * @typedef {Object} ParamEleSampleCatalog
 * @property {ParamEleSample[]} samples
 */

/**
 * Results of a load case on the current structure (see resultsLayer.getResults)
 * @typedef {Object} ParamEleResults
 * @property {{key: string, name: string}[]} load_cases Load cases with results
 * @property {string} load_case Key of the load case of the results
 * @property {ParamEleDisplacementResults|null} displacements
 * @property {ParamEleForceResults|null} forces
 */

/**
 * Displacements of the results on the current structure, in the units of the results
 * @typedef {Object} ParamEleDisplacementResults
 * @property {Object<string, {t: number, d: {x: number, y: number, z: number}}[]>} members Displacements along each member (t from 0 at node A to 1), at the points of the results
 * @property {Object<string, {node_id: number, d: {x: number, y: number, z: number}}[]>} quads Displacements at the corners of each meshed plate
 * @property {number} to_length Factor from the units of the results to the length units of the model
 * @property {number} to_display Factor from the units of the results to display_unit
 * @property {string} display_unit Unit the displacements are shown in (the translation units of the model)
 * @property {number} max_displacement Largest displacement, in display_unit
 * @property {{sum: number, x: number, y: number, z: number}} extremes Largest value of each component (with its sign), in display_unit
 * @property {number} auto_scale Scale that draws the largest displacement at a visible size
 */

/**
 * Internal forces of the results along the members of the current structure, in the units of the results
 * @typedef {Object} ParamEleForceResults
 * @property {Object<string, {t: number, f: Object<string, number>}[]>} members Forces along each member (t from 0 at node A to 1) by result
 *  (moment_x, moment_y, moment_z, shear_y, shear_z, axial)
 * @property {string[]} results Results the members have
 * @property {Object<string, string>} units Unit each result is shown in
 * @property {Object<string, {min: number, max: number}>} extremes Smallest and largest value of each result (0 included)
 * @property {Object<string, number>} auto_scale Length each unit of a result is drawn at by default
 */

/**
 * What the 3D view draws from the results
 * @typedef {Object} ParamEleResultsView
 * @property {"none"|"displacement_sum"|"displacement_x"|"displacement_y"|"displacement_z"|"moment_x"|"moment_y"|"moment_z"|"shear_y"|"shear_z"|"axial"} result
 *  The deformed shape or force diagram drawn
 * @property {number|null} scale Scale of the displacements, null for the automatic one
 * @property {number} diagram_scale Scale of the force diagrams relative to their automatic one
 * @property {string|null} load_case Key of the load case in the results, null for the first one
 */

/**
 * An input of a box that takes a section or material box
 * @typedef {Object} ParamEleDrawingEntityLink
 * @property {"section"|"material"} key
 * @property {"section"|"material"} kind
 * @property {string|null} value Section or material box connected to it, null when there is none
 * @property {{node_id: string, label: string}|null} other_source Another kind of box that feeds the input (e.g. a number)
 */

/**
 * A section as the renderer lists it: a section box, the sections of a group box, or the default section
 * @typedef {Object} ParamEleLibrarySection
 * @property {string} key Section box ID, "group:<box ID>:<shape>" or "default"
 * @property {string|null} node_id Section box or group box
 * @property {string} [type] Type of the section box
 * @property {string} label
 * @property {string} description e.g. "300 × 500 mm"
 * @property {string} color Color of its members in the renderer
 * @property {{node_id: string, label: string}|null} material
 * @property {string[]} member_ids Structural members that use it
 * @property {boolean} editable Only section boxes can be edited and assigned
 * @property {boolean} [is_default]
 */

/**
 * A material box as the renderer lists it
 * @typedef {Object} ParamEleLibraryMaterial
 * @property {string} key
 * @property {string} node_id
 * @property {string} label
 * @property {ParamEleDrawingEntityField[]} fields E, Poisson's ratio and density
 * @property {string[]} section_node_ids Section boxes that use it
 * @property {string[]} plate_ids Structural plates that use it
 */
