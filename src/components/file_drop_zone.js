import {
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  Tag,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { MdCheckCircle, MdError, MdFileUpload, MdInsertDriveFile, MdRadioButtonUnchecked } from "react-icons/md";
import importer from "../js/importer";
import utils from "../utils";
import { notify } from "./notification";

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("import", copy_key);
}

/** Time the status stays open after a successful import */
const SUCCESS_CLOSE_DELAY = 2500;

/** @type {import("../js/types").ParamEleFileData} */
const EMPTY_FILE_DATA = {
  file_name: null,
  is_saved: false,
  last_saved: null,
  model_id: null,
  file_path: null,
  current_version: null,
  file_owner_path: null,
  file_shared_with_me: null,
  file_shared_data: null,
};

/**
 * @param {DragEvent} event
 * @returns {boolean} Whether the drag carries files from outside the page
 */
const hasFiles = (event) => event.dataTransfer != null && Array.from(event.dataTransfer.types).includes("Files");

/**
 * @param {{step: string, state: "done"|"running"|"error"|"pending"}} props
 */
function ImportStep({ step, state }) {
  let icon = { done: <Icon as={MdCheckCircle} color="green.500" boxSize="5" />, error: <Icon as={MdError} color="red.500" boxSize="5" /> }[state];
  if (state === "running") icon = <Spinner size="sm" speed="0.8s" color="blue.500" mx="2px" />;
  if (state === "pending") icon = <Icon as={MdRadioButtonUnchecked} color="gray.300" boxSize="5" />;
  return (
    <HStack spacing="3">
      <Flex w="5" justify="center">
        {icon}
      </Flex>
      <Text fontSize="sm" color={state === "pending" ? "gray.400" : "gray.800"} fontWeight={state === "running" ? "semibold" : "normal"}>
        {localGetCopy(`step_${step}`)}
      </Text>
    </HStack>
  );
}

/**
 * Imports the files dropped anywhere on the app, routing each format to its importer, and shows the progress of the import
 */
function FileDropZone({ openConfirmationDialog, setFileData, setModelLock }) {
  const [is_dragging, setDragging] = useState(false);
  /** @type {[{status: import("../js/types").ParamEleImportStatus, result: import("../js/types").ParamEleProcessResponse|null}|null, Function]} */
  const [import_state, setImportState] = useState(null);
  const drag_depth = useRef(0);
  const is_importing = useRef(false);
  const close_timer = useRef(null);
  // The window listeners are attached once, they read the latest props from here
  const props_ref = useRef();
  props_ref.current = { openConfirmationDialog, setFileData, setModelLock };

  const closeStatus = () => {
    clearTimeout(close_timer.current);
    setImportState(null);
  };

  useEffect(() => {
    const startImport = async (user_file) => {
      is_importing.current = true;
      clearTimeout(close_timer.current);
      let response = await importer.importFile(
        user_file,
        (status) => setImportState({ status, result: null }),
        () => {
          props_ref.current.setFileData(EMPTY_FILE_DATA);
          props_ref.current.setModelLock(false);
        }
      );
      is_importing.current = false;
      setImportState((current) => ({ ...current, result: response }));
      // The status stays open when entities were left out, so the user can read which ones
      let has_skipped = response.data && response.data.skipped && response.data.skipped.length > 0;
      if (response.success && !has_skipped) close_timer.current = setTimeout(() => setImportState(null), SUCCESS_CLOSE_DELAY);
    };

    const onDragEnter = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      drag_depth.current += 1;
      if (!is_importing.current) setDragging(true);
    };
    const onDragOver = (event) => {
      if (!hasFiles(event)) return;
      // Without this the browser opens the file instead of dropping it
      event.preventDefault();
      event.dataTransfer.dropEffect = is_importing.current ? "none" : "copy";
    };
    const onDragLeave = (event) => {
      if (!hasFiles(event)) return;
      drag_depth.current = Math.max(0, drag_depth.current - 1);
      if (drag_depth.current === 0) setDragging(false);
    };
    const onDrop = (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      drag_depth.current = 0;
      setDragging(false);
      if (is_importing.current) return;
      let user_file = event.dataTransfer.files[0];
      if (!user_file) return;
      if (!importer.isSupportedFileName(user_file.name)) {
        notify("warning", localGetCopy("unsupported_drop_title"), localGetCopy("unsupported_drop_desc"));
        return;
      }
      props_ref.current.openConfirmationDialog(
        "upload_file",
        [
          {
            run: (close_dialog_callback) => {
              close_dialog_callback();
              startImport(user_file);
            },
            copy: "ok",
            color: "blue",
          },
        ],
        true
      );
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      clearTimeout(close_timer.current);
    };
  }, []);

  let status_content = null;
  if (import_state) {
    let { status, result } = import_state;
    let current_index = status.steps.indexOf(status.step);
    const getStepState = (index) => {
      if (index < current_index || (result && result.success)) return "done";
      if (index > current_index) return "pending";
      if (result) return "error";
      return "running";
    };
    let title_key = result == null ? "title_running" : result.success ? "title_success" : "title_error";
    let summary = result && result.success ? Object.entries(result.data.summary) : [];
    let skipped = (result && result.data && result.data.skipped) || [];
    status_content = (
      <>
        <ModalHeader>{localGetCopy(title_key)}</ModalHeader>
        <ModalBody>
          <VStack align="stretch" spacing="4">
            <HStack spacing="3" p="3" borderWidth="1px" borderRadius="md" bg="gray.50">
              <Icon as={MdInsertDriveFile} boxSize="6" color="gray.500" flexShrink="0" />
              <Box minW="0" flex="1">
                <Text fontSize="sm" fontWeight="semibold" noOfLines={1} title={status.file_name}>
                  {status.file_name}
                </Text>
                {status.type ? (
                  <Tag size="sm" colorScheme="blue" mt="1">
                    {localGetCopy(`type_${status.type}`)}
                  </Tag>
                ) : (
                  <Tag size="sm" colorScheme="gray" mt="1">
                    {localGetCopy("detecting_type")}
                  </Tag>
                )}
              </Box>
            </HStack>
            <VStack align="stretch" spacing="2">
              {status.steps.map((step, index) => (
                <ImportStep key={step} step={step} state={getStepState(index)} />
              ))}
            </VStack>
            {summary.length > 0 && (
              <Flex wrap="wrap" gap="2">
                {summary.map(([key, count]) => (
                  <Tag key={key} size="sm" variant="subtle" colorScheme="green">
                    {count} {localGetCopy(`summary_${key}`)}
                  </Tag>
                ))}
              </Flex>
            )}
            {skipped.length > 0 && (
              <Box p="3" borderRadius="md" bg="orange.50" color="orange.800" fontSize="sm">
                <Text fontWeight="semibold">{localGetCopy("skipped_title")}</Text>
                {skipped.map(({ type, reason, count }) => (
                  <Text key={`${type}-${reason}`}>
                    {count} {type}: {localGetCopy(`skipped_${reason}`)}
                  </Text>
                ))}
              </Box>
            )}
            {result && !result.success && (
              <Box p="3" borderRadius="md" bg="red.50" color="red.700" fontSize="sm">
                <Text fontWeight="semibold">{utils.getDisplayCopy("notifications", `${result.msg}_title`)}</Text>
                <Text>{utils.getDisplayCopy("notifications", `${result.msg}_desc`)}</Text>
              </Box>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          {result && (
            <Button size="sm" onClick={closeStatus}>
              {localGetCopy("close")}
            </Button>
          )}
        </ModalFooter>
      </>
    );
  }

  return (
    <>
      {is_dragging && (
        <Flex position="fixed" inset="0" zIndex="modal" pointerEvents="none" bg="blackAlpha.400" align="center" justify="center" p="4">
          <VStack
            spacing="3"
            bg="white"
            borderWidth="2px"
            borderStyle="dashed"
            borderColor="blue.400"
            borderRadius="lg"
            px="10"
            py="8"
            maxW="lg"
            textAlign="center"
            boxShadow="lg"
          >
            <Icon as={MdFileUpload} boxSize="12" color="blue.500" />
            <Text fontSize="lg" fontWeight="semibold">
              {localGetCopy("drop_title")}
            </Text>
            <Text fontSize="sm" color="gray.600">
              {localGetCopy("drop_formats")}
            </Text>
          </VStack>
        </Flex>
      )}
      <Modal
        isOpen={import_state != null}
        onClose={closeStatus}
        closeOnOverlayClick={false}
        closeOnEsc={import_state != null && import_state.result != null}
        isCentered
      >
        <ModalOverlay />
        <ModalContent mx="4">{status_content}</ModalContent>
      </Modal>
    </>
  );
}

export default FileDropZone;
