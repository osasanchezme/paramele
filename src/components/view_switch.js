import { ButtonGroup, IconButton, Tooltip } from "@chakra-ui/react";
import { TbBox, TbLayoutColumns, TbSchema } from "react-icons/tb";
import utils from "../utils";

const VIEW_MODES = [
  { mode: "nodes", icon: TbSchema },
  { mode: "split", icon: TbLayoutColumns },
  { mode: "renderer", icon: TbBox },
];

/**
 * Gets the current view mode from the general settings
 * @param {{side_by_side: boolean, show_nodes: boolean}} general_settings
 * @returns {"nodes"|"split"|"renderer"}
 */
function getViewMode({ side_by_side, show_nodes }) {
  if (side_by_side) return "split";
  return show_nodes ? "nodes" : "renderer";
}

/**
 * Switches between showing only the nodes editor, both editor and renderer side by side, or only the renderer.
 * Compact screens are never split, so there it only toggles between the editor and the renderer.
 */
function ViewSwitch({ settings, setViewMode, is_compact }) {
  const current_mode = getViewMode(settings);
  const view_modes = is_compact ? VIEW_MODES.filter(({ mode }) => mode !== "split") : VIEW_MODES;
  return (
    <ButtonGroup className="view-switch" size={is_compact ? "md" : "sm"} isAttached variant="outline">
      {view_modes.map(({ mode, icon: ModeIcon }) => {
        const label = utils.getDisplayCopy("settings", `view_${mode}`);
        const is_active = mode === current_mode;
        return (
          <Tooltip key={mode} label={label} placement="bottom" openDelay={300}>
            <IconButton
              aria-label={label}
              aria-pressed={is_active}
              icon={<ModeIcon size={18} />}
              bg={is_active ? "gray.200" : "white"}
              // Touch screens keep the hover style on the last tapped button, so it is left out there
              _hover={is_compact ? undefined : { bg: is_active ? "gray.200" : "gray.100" }}
              onClick={() => setViewMode(mode)}
            />
          </Tooltip>
        );
      })}
    </ButtonGroup>
  );
}

export default ViewSwitch;
