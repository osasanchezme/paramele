import data from "./data/template-results-gather.json";
import utils from "./utils";
import repair from "./js/repair";
import { isCompactLayout } from "./js/breakpoints";

function getInitialState() {
    // Get language from URL
  let url_params = new URLSearchParams(window.location.search);
  let language = url_params.get("lang");
  if (language === null) language = "es";
  let model = repair.repairModel(data.model);
  let nodes = JSON.parse(JSON.stringify(model.nodes));
  let edges = JSON.parse(JSON.stringify(model.edges));
  return {
    model,
    nodes,
    edges,
    settings: repair.repairSettings(data.settings),
    structure: utils.getEmptyStructuralModel(),
    results: {},
    globals: {
      last_node_id_created: "",
      last_structural_node: "",
      last_structural_member: "",
      current_resizer: "",
      selected_handles: [],
      user_interaction_step: "none", // Can be "none", "wait", "done"
      structure_nodes_shift: 0,
      iterating_node_data: {},
    },
    section_colors: [null, "#505050", "#42810A", "#DB7093", "#F4A53A", "#843D80", "#2A56CD", "#D26A34"],
    language,
    words_map: {},
    model_path: ["model"], // Path to the current editable model in the state
    model_path_print: ["model"], // Path to the current editable model in the state
    mouse_x: 0,
    mouse_y: 0,
    rf_mouse_x: 0,
    rf_mouse_y: 0,
    mode: "wait_action",
    rel_orig_x: 0,
    rel_orig_y: 0,
    selection_top: 0,
    selection_left: 0,
    user: null,
    file_name: null,
    is_saved: false,
    last_saved: null,
    model_id: null,
    file_path: null,
    file_history: null,
    file_owner_path: null,
    file_shared_with_me: null,
    file_shared_data: null,
    model_locked: false,
    is_compact: isCompactLayout(),
    compact_panel_open: false,
    current_version: null,
    is_version_manager_open: false,
    is_confirmation_open: false,
    confirmation_msg: false,
    confirmation_callbacks: false,
    is_auth_form_open: false,
    active_tab_auth_form: "sign_up",
    is_file_manager_open: false,
    file_manager_mode: "open",
    is_sharing_manager_open: false,
    local_people_directory: {}
  };
}

export { getInitialState };
