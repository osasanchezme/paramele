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

function localGetDisplayCopy(copy_key) {
  return utils.getDisplayCopy("settings", copy_key);
}

/**
 * Model settings plus the user scoped settings (SkyCiv credentials), which are kept in the user's account (see solverCredentials.js)
 */
function getSettingsToEdit() {
  return { ...getState("settings")["global"], ...solverCredentials.getCredentials() };
}

function GlobalSettings({ user }) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  window.ParamEle.openGlobalSettings = onOpen;
  let [localSettings, setLocalSettings] = useState(getSettingsToEdit);
  let [isSaving, setIsSaving] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(getSettingsToEdit());
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
  const settings_tabs = {};
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
                            <FormLabel>{localGetDisplayCopy(setting.name)}</FormLabel>
                            <Input
                              type={setting.type}
                              autoComplete="off"
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
                            <Link href={setting.data} color="blue" isExternal>
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
          <Button colorScheme="blue" mr={3} onClick={saveSettings} isLoading={isSaving}>
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
