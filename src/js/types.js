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
 */

/**
 * @typedef {Object} ParamEleFormValidationObject
 * @property {"equal_key"|"no"|"contains"|"custom_function"} type
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
 * @typedef {'view'|'make_copy'|'edit'|'delete'|'save'|'share'|'transfer'} ParamElePermissions
 */

/**
 * @typedef {'inputNumber'|'variableRange'|'sumNumbers'|'multiplyNumbers'|'divideNumbers'|'roundNumber'|'powerNumber'|'rootNumber'|'sin'|'cos'|'tan'|'asin'|'acos'|'atan'|'deg2rad'|'structuralNode'|'structuralMember'|'structuralFixedSupport'|'structuralPinSupport'|'structuralGenericSupport'|'structuralPointLoad'|'structuralDistributedLoad'|'structuralPlate'|'structuralMoment'|'structuralMaterial'|'structuralRectangleSection'|'structuralGenericSupport'|'nodesWrapper'|'structuralMemberResult'|'structuralNodeResult'|'dataDisplay2DPlot'} ParamEleNodesTypes
 */

/**
 * @typedef {Object.<string, ParamEleFormField>} ParamEleFormStateObject
 */

/**
 * @typedef {Object.<string, ParamEleDefaultFormField>} ParamEleFormDefaultStateObject
 */

exports.unused = {};
