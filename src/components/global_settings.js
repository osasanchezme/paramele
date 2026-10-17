import React, { useEffect } from "react";
import {
  FormControl,
  FormLabel,
  FormErrorMessage,
  FormHelperText,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Input,
  Link,
  Icon,
  Select,
  Checkbox,
  SimpleGrid,
  Text,
} from "@chakra-ui/react";
import { useDisclosure } from "@chakra-ui/react";
import utils from "../utils";
import getState from "../getState";
import { useState } from "react";
import state from "../state";
import { MdOpenInNew } from "react-icons/md";
import settings_template from "../settings_template.json";
import logic_runner from "../js/globalLogicRunner";
import solverCredentials from "../js/solverCredentials";
import Firebase from "../js/firebase";
import { notify } from "./notification";
import units from "../js/units";
import modelUnits from "../js/modelUnits";

function localGetDisplayCopy(copy_key) {
  return utils.getDisplayCopy("settings", copy_key);
}

/**
 * Model settings plus the user scoped settings (SkyCiv credentials), which are kept in the user's account (see solverCredentials.js)
 */
function getSettingsToEdit() {
  return { ...getState("settings")["global"], ...solverCredentials.getCredentials() };
}

/**
 * Unit system of the model and the unit of each quantity, only from that system
 * @param {object} props
 * @param {object} props.model_units
 * @param {function(object): void} props.onChange
 */
function UnitsForm({ model_units, onChange }) {
  return (
    <>
      <FormControl mb={3}>
        <FormLabel>{utils.getDisplayCopy("units", "system")}</FormLabel>
        <Select value={model_units.system} onChange={(event) => onChange({ ...units.SYSTEM_DEFAULTS[event.target.value] })}>
          {units.SYSTEMS.map((system) => (
            <option value={system} key={system}>
              {utils.getDisplayCopy("units", `system_${system}`)}
            </option>
          ))}
        </Select>
        <FormHelperText>{utils.getDisplayCopy("units", "system_help")}</FormHelperText>
      </FormControl>
      <SimpleGrid columns={2} spacingX={4} spacingY={2}>
        {Object.keys(units.SETTING_QUANTITIES).map((quantity) => (
          <FormControl key={quantity}>
            <FormLabel fontSize="sm" mb={1}>
              {utils.getDisplayCopy("units", quantity)}
            </FormLabel>
            <Select size="sm" value={model_units[quantity]} onChange={(event) => onChange({ ...model_units, [quantity]: event.target.value })}>
              {units.getUnitOptions(quantity, model_units.system).map((unit_key) => (
                <option value={unit_key} key={unit_key}>
                  {units.getUnitLabel(quantity, unit_key)}
                </option>
              ))}
            </Select>
          </FormControl>
        ))}
      </SimpleGrid>
      <Text mt={3} fontSize="sm" color="gray.600">
        {utils.getDisplayCopy("units", "conversion_help")}
      </Text>
    </>
  );
}

function GlobalSettings({ user }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  window.ParamEle.openGlobalSettings = onOpen;
  let [localSettings, setLocalSettings] = useState(getSettingsToEdit);
  let [localUnits, setLocalUnits] = useState(modelUnits.getModelUnits);
  let [isSaving, setIsSaving] = useState(false);
  // Text fields stay read only until focused so the browser does not autofill the account credentials into them
  let [focusedFields, setFocusedFields] = useState({});
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(getSettingsToEdit());
      setLocalUnits(modelUnits.getModelUnits());
      setFocusedFields({});
    }
  }, [isOpen]);
  function handleChange(event, id, type) {
    let new_value;
    switch (type) {
      case "check":
        new_value = event.target.checked;
        break;
      default:
        new_value = event.target.value;
        break;
    }
    setLocalSettings((currentSettings) => ({ ...currentSettings, [id]: new_value }));
  }
  function saveSettings() {
    let model_settings = {};
    let credentials = {};
    Object.entries(localSettings).forEach(([setting_name, value]) => {
      if (solverCredentials.isUserScoped(setting_name)) credentials[setting_name] = value;
      else model_settings[setting_name] = value;
    });
    let original_settings = getState("settings");
    original_settings["global"] = model_settings;
    state.setState(original_settings, "settings");
    // The values of the boxes are converted to the new units, so the structure stays the same
    let converted_boxes = modelUnits.changeModelUnits(localUnits);
    if (converted_boxes > 0) notify("info", "units_converted", null, true);
    let stored_credentials = solverCredentials.getCredentials();
    let credentials_changed = Object.keys(credentials).some((setting_name) => credentials[setting_name] !== stored_credentials[setting_name]);
    if (!user || !credentials_changed) {
      onClose();
      logic_runner.run();
      return;
    }
    setIsSaving(true);
    Firebase.saveSolverCredentials(credentials, (process_response) => {
      setIsSaving(false);
      if (!process_response.success) {
        notify("error", "generic_unhandled_issue", process_response.msg, true);
        return;
      }
      onClose();
      logic_runner.run();
    });
  }
  const global_settings = settings_template["global"];
  const settings_tabs = { units_tab: [] };
  Object.entries(global_settings).forEach(([setting_name, setting_options], index) => {
    if (!settings_tabs.hasOwnProperty(setting_options["tab"])) settings_tabs[setting_options["tab"]] = [];
    settings_tabs[setting_options["tab"]].push({ name: setting_name, type: setting_options.type, data: setting_options.data });
  });
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{localGetDisplayCopy("modal_title")}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Tabs>
            <TabList>
              {Object.keys(settings_tabs).map((tab_name) => (
                <Tab key={tab_name}>{localGetDisplayCopy(tab_name)}</Tab>
              ))}
            </TabList>
            <TabPanels>
              {Object.entries(settings_tabs).map(([tab_name, tab_settings], index) => (
                <TabPanel key={tab_name}>
                  {tab_name === "units_tab" && <UnitsForm model_units={localUnits} onChange={setLocalUnits} />}
                  {tab_settings.some((setting) => solverCredentials.isUserScoped(setting.name)) && (
                    <FormControl>
                      <FormHelperText mt={0} mb={2}>
                        {localGetDisplayCopy(user ? "solver_credentials_note" : "log_in_to_save_credentials")}
                      </FormHelperText>
                    </FormControl>
                  )}
                  {tab_settings.map((setting) => {
                    let setting_block = null;
                    switch (setting.type) {
                      case "text":
                      case "password":
                        setting_block = (
                          <FormControl key={setting.name} isDisabled={!user && solverCredentials.isUserScoped(setting.name)}>
                            <FormLabel>
                              {localGetDisplayCopy(setting.name)}
                              {global_settings[setting.name].quantity &&
                                ` (${units.formatUnit(units.getQuantityUnit(global_settings[setting.name].quantity), localUnits)})`}
                            </FormLabel>
                            <Input
                              type={setting.type}
                              name={`paramele_setting_${setting.name}`}
                              autoComplete={setting.type === "password" ? "new-password" : "off"}
                              data-1p-ignore
                              data-lpignore="true"
                              data-bwignore
                              data-form-type="other"
                              readOnly={!focusedFields[setting.name]}
                              onFocus={() => setFocusedFields((current) => ({ ...current, [setting.name]: true }))}
                              value={localSettings[setting.name] ?? ""}
                              onChange={(event) => {
                                handleChange(event, setting.name);
                              }}
                            />
                          </FormControl>
                        );
                        break;
                      case "check":
                        setting_block = (
                          <FormControl key={setting.name}>
                            <Checkbox
                              isChecked={localSettings[setting.name]}
                              onChange={(event) => {
                                handleChange(event, setting.name, setting.type);
                              }}
                            >
                              {localGetDisplayCopy(setting.name)}
                            </Checkbox>
                          </FormControl>
                        );
                        break;
                      case "link":
                        setting_block = (
                          <p style={{ textAlign: "right" }} key={setting.name}>
                            <Link href={setting.data} color="brand.600" isExternal>
                              {localGetDisplayCopy(setting.name)} <Icon as={MdOpenInNew} mx="2px" />
                            </Link>
                          </p>
                        );
                        break;
                      case "dropdown":
                        setting_block = (
                          <FormControl key={setting.name}>
                            <FormLabel>{localGetDisplayCopy(setting.name)}</FormLabel>
                            <Select
                              onChange={(event) => {
                                handleChange(event, setting.name);
                              }}
                              value={localSettings[setting.name] ?? ""}
                            >
                              {setting.data.map((option) => (
                                <option value={option} key={option}>
                                  {localGetDisplayCopy(option)}
                                </option>
                              ))}
                            </Select>
                          </FormControl>
                        );
                        break;
                      default:
                        break;
                    }
                    return setting_block;
                  })}
                </TabPanel>
              ))}
            </TabPanels>
          </Tabs>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="brand" mr={3} onClick={saveSettings} isLoading={isSaving}>
            {localGetDisplayCopy("save_changes")}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {localGetDisplayCopy("close_modal")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export default GlobalSettings;
