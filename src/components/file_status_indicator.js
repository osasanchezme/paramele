import { Icon, Tag, TagLabel } from "@chakra-ui/react";
import utils from "../utils";
import PopoverForm from "./popover_form";
import { useRef } from "react";
import Firebase from "../js/firebase";
import file from "../js/file";
import { MdLock, MdLockOpen } from "react-icons/md";
import { notify } from "./notification";

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("nav_bar", copy_key);
}
/**
 *
 * @param {Object} param0
 * @param {import("../js/types").ParamEleFileData} param0.file_data
 * @returns
 */
function FileStatusIndicator({ file_data, setFileData, model_locked, setModelLock, openFileManager, openAuthenticationForm, user, is_compact }) {
  function localOpenFileManager() {
    if (file_name === null) {
      openFileManager("save");
    }
  }
  function simulateClick() {
    if (file_name !== null) {
      tag_ref.current.click();
    }
  }
  function saveModelVersion(form_state) {
    if (user) {
      utils.showLoadingDimmer("saving_new_version");
      let commit_msg = form_state.commit_msg.value;
      let model_blob = file.getModelBlob();
      let version_id = Date.now();
      let local_updated_file_data = { ...file_data, current_version: version_id, last_saved: version_id, is_saved: true };
      Firebase.saveFileToCloud(
        model_blob,
        local_updated_file_data,
        (new_file) => {
          // Update the file data in the app state
          setFileData(local_updated_file_data);
          // Save the results to the cloud
          let results_blob = file.getResultsBlob();
          if (results_blob !== false) {
            utils.setLoadingDimmerMsg("saving_results");
            Firebase.saveFileToCloud(
              results_blob,
              local_updated_file_data,
              (new_file) => {
                utils.hideLoadingDimmer();
              },
              true,
              commit_msg,
              "results"
            );
          } else {
            utils.hideLoadingDimmer();
          }
        },
        true,
        commit_msg
      );
    } else {
      // Show notification and open the auth form to log in
      notify("warning", "log_in_to_save", undefined, true);
      openAuthenticationForm("log_in");
    }
  }
  function toggleModelLock() {
    if (model_locked) {
      setModelLock(false);
    } else {
      setModelLock(true);
    }
  }
  let { file_name, is_saved, last_saved, file_shared_with_me } = file_data;
  let tag_ref = useRef(null);
  let tag_element = (
    <Tag
      height="30px"
      marginTop="10px"
      marginRight={is_compact ? "6px" : "10px"}
      maxWidth={is_compact ? "110px" : "250px"}
      cursor="pointer"
      ref={tag_ref}
      onMouseOver={simulateClick}
      onClick={localOpenFileManager}
    >
      <TagLabel>
        {file_name !== null ? (file_shared_with_me ? utils.decodeUniqueIDToName(file_name) : file_name) : localGetCopy("file_not_saved")}
      </TagLabel>
      {is_saved ? "" : "\u00a0*"}
    </Tag>
  );
  let tag_lock_element = (
    <Tag height="30px" marginTop="10px" marginRight={is_compact ? "6px" : "10px"} cursor="pointer" onClick={toggleModelLock}>
      {model_locked ? <Icon as={MdLock} /> : <Icon as={MdLockOpen} />}
    </Tag>
  );
  let current_time = Date.now();
  let difference = current_time - last_saved;
  let seconds = difference / 1000;
  let minutes = seconds / 60;
  let hours = minutes / 60;
  let days = hours / 24;
  let formatted_time = "";
  if (minutes < 1) {
    formatted_time = String(seconds.toFixed(0)) + " " + localGetCopy("seconds");
  } else if (hours < 1) {
    formatted_time = String(minutes.toFixed(0)) + " " + localGetCopy("minutes");
  } else if (days < 1) {
    formatted_time = String(hours.toFixed(0)) + " " + localGetCopy("hours");
  } else {
    let last_saved_date = new Date(last_saved);
    formatted_time = `${last_saved_date.toDateString()}, ${last_saved_date.toLocaleTimeString()}`;
  }
  formatted_time = `${localGetCopy("last_saved")}: ${formatted_time}`;
  if (file_name === null) {
    return (
      <>
        {tag_lock_element}
        {tag_element}
      </>
    );
  } else {
    return (
      <>
        {tag_lock_element}
        <PopoverForm
          action_button_text={localGetCopy("save")}
          copies_key={"nav_bar"}
          action_function={saveModelVersion}
          fields={{
            commit_msg: {
              default: "",
              type: "text",
              validation: [],
              is_first_field: true,
              helper_text: formatted_time,
            },
          }}
          options={{ placement: "bottom" }}
        >
          {tag_element}
        </PopoverForm>
      </>
    );
  }
}

export default FileStatusIndicator;
