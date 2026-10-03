import SearchableDropdown from "./searchable_dropdown";
import utils from "../utils";
import { addNodeToTheEditor } from "./VisualEditor";
import boxes from "../js/boxes";

// Minimum room the bar needs to fit on screen, matches its min width in index.css and leaves space for the options list
const BAR_MIN_WIDTH = 240;
const BAR_ROOM_BELOW = 200;
const SCREEN_MARGIN = 8;

function CommandsBar({ app_mode, x, y, rel_orig_x, rel_orig_y, changeAppMode }) {
  const available_nodes_mapping = utils.getNodesLibrary()["mapping"];
  let is_active = app_mode === "add_node" || app_mode === "change_node_type";
  let onChangeCallback = () => {};
  if (app_mode === "add_node") {
    onChangeCallback = (node_class) => {
      addNodeToTheEditor(node_class, { x: x - rel_orig_x, y: y - rel_orig_y });
      changeAppMode("wait_action");
    };
  } else if (app_mode === "change_node_type") {
    onChangeCallback = (node_class) => {
      boxes.changeNodesType(node_class);
      changeAppMode("wait_action");
    };
  }
  return (
    <SearchableDropdown
      options_map={available_nodes_mapping}
      coincidences_to_match={3}
      onChange={onChangeCallback}
      className="commands-bar"
      style={{
        top: clamp(y, window.innerHeight - BAR_ROOM_BELOW) + "px",
        left: clamp(x, window.innerWidth - BAR_MIN_WIDTH - SCREEN_MARGIN) + "px",
        display: is_active ? "block" : "none",
      }}
      placeholder={utils.getDisplayCopy("commands_bar", "placeholder")}
      is_regular_dropdown={false}
    ></SearchableDropdown>
  );
}

/**
 * Keeps the bar inside the screen when the click is close to its right or bottom edges, as on small screens
 * @param {number} position Click position
 * @param {number} max_position Last position where the bar still fits
 */
function clamp(position, max_position) {
  return Math.max(SCREEN_MARGIN, Math.min(position, max_position));
}

export default CommandsBar;
