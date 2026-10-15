import { Box, Button, Checkbox, HStack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { TbEye, TbSettings } from "react-icons/tb";
import getState from "../getState";
import state from "../state";
import utils from "../utils";
import settings_template from "../settings_template.json";
import renderer from "../js/renderer";
import dockPanel from "./dock_panel";
import { CommitNumberInput } from "./entity_editor";

const STORAGE_KEY = "paramele_visibility_panel_open";
// The settings of the View tab of the settings modal: they only change how the structure is drawn
const VIEW_SETTINGS = Object.keys(settings_template.global).filter((name) => settings_template.global[name].tab === "view_tab");

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("settings", copy_key);
}

function getGlobalSettings() {
  return getState("settings")["global"];
}

/**
 * Changes a view setting as the settings modal saves it, so both show the same. Only the renderer is updated, the model is not
 * evaluated again
 * @param {string} key
 * @param {*} value
 */
function changeSetting(key, value) {
  let settings = getState("settings");
  settings.global[key] = value;
  state.setState(settings, "settings");
  utils.updateRenderer();
}

function SettingField({ name, value, isDisabled }) {
  let { type } = settings_template.global[name];
  let label = localGetCopy(name);
  if (type === "check") {
    return (
      <Checkbox size="sm" isChecked={Boolean(value)} isDisabled={isDisabled} onChange={(event) => changeSetting(name, event.target.checked)}>
        <Text fontSize="xs">{label}</Text>
      </Checkbox>
    );
  }
  // The text settings of the panel are numbers
  return (
    <HStack spacing={2}>
      <Text flex="1" className="visibility-panel-label">
        {label}
      </Text>
      <Box className="visibility-panel-number">
        <CommitNumberInput value={value} label={label} isDisabled={isDisabled} onCommit={(number) => changeSetting(name, number)} />
      </Box>
    </HStack>
  );
}

/**
 * Panel of the dock with the settings of what the renderer draws, at hand. They are the global settings of the View tab of the
 * settings modal
 * @param {object} props
 * @param {boolean} props.is_showing_result A result is drawn on the structure, which does not draw some of them
 */
function VisibilityPanel({ is_showing_result }) {
  const [is_open, setIsOpen] = dockPanel.useStoredOpen(STORAGE_KEY);
  const [settings, setSettings] = useState(getGlobalSettings);
  useEffect(() => state.onSettingsChange(() => setSettings(getGlobalSettings())), []);
  const title = (
    <>
      <TbEye />
      <Text fontWeight={is_open ? 600 : undefined}>{localGetCopy("visibility_panel")}</Text>
    </>
  );
  return (
    <dockPanel.DockPanel
      className="visibility-panel"
      is_open={is_open}
      onOpen={() => setIsOpen(true)}
      onClose={() => setIsOpen(false)}
      summary={title}
      header={title}
      close_label={localGetCopy("close_visibility_panel")}
      footer={
        <Button size="xs" variant="ghost" colorScheme="brand" leftIcon={<TbSettings />} onClick={utils.openGlobalSettings}>
          {localGetCopy("visibility_more")}
        </Button>
      }
    >
      <div className="visibility-panel-body">
        {VIEW_SETTINGS.map((name) => (
          <SettingField
            key={name}
            name={name}
            value={settings[name]}
            isDisabled={is_showing_result && renderer.SETTINGS_HIDDEN_BY_RESULTS.includes(name)}
          />
        ))}
        {is_showing_result && <Text className="visibility-panel-note">{localGetCopy("visibility_hidden_by_results")}</Text>}
      </div>
    </dockPanel.DockPanel>
  );
}

export default VisibilityPanel;
