import React, { useEffect, useState } from "react";
import {
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
  SimpleGrid,
  Link,
  useMediaQuery,
} from "@chakra-ui/react";
import utils from "../utils";
import Firebase from "../js/firebase";
import { auth_form_fields, log_in_form_fields } from "../js/form_fileds";
import ParamEleForm from "./form";
import { notify } from "./notification";
import { COMPACT_LAYOUT_QUERY } from "../js/breakpoints";
const { FormComponent, getDefaultState, validateInputData } = ParamEleForm;

function localGetDisplayCopy(copy_key) {
  return utils.getDisplayCopy("auth", copy_key);
}

function Authentication({ user, is_auth_form_open, closeAuthenticationForm, active_tab_auth_form, setActiveTabAuthenticationForm }) {
  let [authFormState, setAuthFormState] = useState(getDefaultState(auth_form_fields));
  let [logInFormState, setLogInFormState] = useState(getDefaultState(log_in_form_fields));
  // Small screens get a full screen form with a single column of fields
  const [is_compact] = useMediaQuery(COMPACT_LAYOUT_QUERY);
  useEffect(() => {
    setAuthFormState(getDefaultState(auth_form_fields));
    setLogInFormState(getDefaultState(log_in_form_fields));
  }, []);
  function createUser() {
    let { valid_data, new_state } = validateInputData(authFormState, auth_form_fields);
    setAuthFormState(new_state);
    if (valid_data) {
      Firebase.createUserWithEmail(authFormState);
      closeAuthenticationForm();
    }
  }
  function logInUsingEmailPassword() {
    let { valid_data, new_state } = validateInputData(logInFormState, log_in_form_fields);
    setLogInFormState(new_state);
    if (valid_data) {
      utils.showLoadingDimmer("logging_in");
      Firebase.logInUserWithEmail(logInFormState, (process_response) => {
        if (process_response.success) {
          closeAuthenticationForm();
          utils.hideLoadingDimmer();
        } else {
          utils.hideLoadingDimmer();
          switch (process_response.msg) {
            case "auth/wrong-password":
            case "auth/too-many-requests":
              logInFormState.password.error_msg = process_response.msg;
              logInFormState.password.valid = false;
              setLogInFormState(logInFormState);
              break;
            default:
              console.log(`Issue when authenticating: ${process_response.msg}`);
              break;
          }
        }
      });
    }
  }
  function resetPassword() {
    let { valid_data, new_state } = validateInputData(logInFormState, log_in_form_fields, ["password"]);
    setLogInFormState(new_state);
    if (valid_data) {
      Firebase.sendEmailToResetPassword(new_state, (process_response) => {
        if (process_response.success) {
          notify("success", "reset_password_email_sent", undefined, true);
        } else {
          switch (process_response.msg) {
            case "auth/user-not-found":
              logInFormState.email.error_msg = process_response.msg;
              logInFormState.email.valid = false;
              setLogInFormState(logInFormState);
              break;
            default:
              notify("error", "generic_unhandled_issue", process_response.msg, true);
              break;
          }
        }
      });
    }
  }
  const tab_keys = ["sign_up", "log_in"];
  function handleTabsChange(index) {
    setActiveTabAuthenticationForm(tab_keys[index]);
  }
  if (user == null) {
    return (
      <Modal isOpen={is_auth_form_open} onClose={closeAuthenticationForm} size={is_compact ? "full" : "5xl"} scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>{localGetDisplayCopy("title")}</ModalHeader>
          <ModalCloseButton />
          <ModalBody paddingX={is_compact ? 2 : undefined}>
            <Tabs onChange={handleTabsChange} defaultIndex={tab_keys.indexOf(active_tab_auth_form)} isFitted={is_compact}>
              <TabList>
                {tab_keys.map((tab_name) => (
                  <Tab key={tab_name}>{localGetDisplayCopy(tab_name)}</Tab>
                ))}
              </TabList>
              <TabPanels>
                <TabPanel key={"sign_up"}>
                  <SimpleGrid columns={is_compact ? 1 : 2} spacing={4}>
                    <FormComponent
                      fields={auth_form_fields}
                      formState={authFormState}
                      setFormState={setAuthFormState}
                      copies_key="auth"
                    ></FormComponent>
                  </SimpleGrid>
                </TabPanel>
                <TabPanel key={"log_in"}>
                  <SimpleGrid columns={1} spacing={4}>
                    <FormComponent
                      fields={log_in_form_fields}
                      formState={logInFormState}
                      setFormState={setLogInFormState}
                      copies_key="auth"
                    ></FormComponent>
                  </SimpleGrid>
                  <Link
                    onClick={resetPassword}
                    marginTop={is_compact ? 4 : undefined}
                    display={is_compact ? "inline-block" : undefined}
                    color={is_compact ? "blue.500" : undefined}
                  >
                    {localGetDisplayCopy("reset_password")}
                  </Link>
                </TabPanel>
              </TabPanels>
            </Tabs>
          </ModalBody>
          <ModalFooter borderTopWidth={is_compact ? "1px" : undefined}>
            <Button variant="ghost" mr={3} onClick={closeAuthenticationForm}>
              {localGetDisplayCopy("close_modal")}
            </Button>
            {active_tab_auth_form === "sign_up" ? (
              <Button colorScheme="blue" onClick={createUser}>
                {localGetDisplayCopy("sign_up")}
              </Button>
            ) : (
              ""
            )}
            {active_tab_auth_form === "log_in" ? (
              <Button colorScheme="blue" onClick={logInUsingEmailPassword}>
                {localGetDisplayCopy("log_in")}
              </Button>
            ) : (
              ""
            )}
          </ModalFooter>
        </ModalContent>
      </Modal>
    );
  }
}

export default Authentication;
