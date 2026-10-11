import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  Button,
  IconButton,
  Text,
  Tag,
  TagLabel,
  TagLeftIcon,
  Icon,
  Textarea,
  Box,
  Spinner,
  Flex,
  HStack,
  Tooltip,
  Avatar,
  Skeleton,
} from "@chakra-ui/react";

import { MdCancel, MdCheckCircle, MdDelete, MdEdit, MdSave, MdAccountTree, MdOpenInBrowser } from "react-icons/md";

import utils from "../utils";
import Firebase from "../js/firebase";
import file from "../js/file";
import { useState, useRef, useEffect } from "react";
import { useUserAllowed } from "../js/userRoles";

function localGetDisplayCopy(key) {
  return utils.getDisplayCopy("version_history", key);
}

function VersionManager({
  isOpen,
  onClose,
  file_history,
  setFileData,
  getFileData,
  setModelLock,
  openConfirmationDialog,
  getContactInformation,
  user,
}) {
  let versions_list = [];
  let userAllowedManageVersions = useUserAllowed("manage_versions");
  if (file_history) {
    // Version keys are their creation timestamps: newest first
    let sorted_versions = Object.entries(file_history).sort(([key_a], [key_b]) => Number(key_b) - Number(key_a));
    let current_version = isOpen ? String(getFileData().current_version) : undefined;
    versions_list = sorted_versions.map(([version_key, version_data], index) => (
      <VersionItem
        version_data={version_data}
        version_key={version_key}
        key={version_key}
        is_current={version_key === current_version}
        is_last={index === sorted_versions.length - 1}
        setFileData={setFileData}
        getFileData={getFileData}
        setModelLock={setModelLock}
        closeVersionManager={onClose}
        openConfirmationDialog={openConfirmationDialog}
        getContactInformation={getContactInformation}
        user={user}
        allowed_to_manage_versions={userAllowedManageVersions}
      ></VersionItem>
    ));
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} scrollBehavior="inside" size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          {localGetDisplayCopy("title")}
          <Text fontSize="sm" fontWeight="normal" color="gray.500">
            {versions_list.length} {localGetDisplayCopy(versions_list.length === 1 ? "version" : "versions")}
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody paddingBottom="6">{versions_list}</ModalBody>
      </ModalContent>
    </Modal>
  );
}
/**
 *
 * @param {Object} param0
 * @param {import("../js/types").ParamEleFileVersionItem} param0.version_data
 * @param {boolean} param0.is_current The version is the one currently open
 * @param {boolean} param0.is_last The version is the last one of the timeline
 * @param {import("../js/types").ParamEleSetFileDataCallback} param0.setFileData
 * @param {import("../js/types").ParamEleGetFileDataCallback} param0.getFileData
 * @param {import("../js/state_types").ParamEleStateGetContactInformation} param0.getContactInformation
 * @returns
 */
function VersionItem({
  version_key,
  version_data,
  is_current,
  is_last,
  setFileData,
  getFileData,
  setModelLock,
  closeVersionManager,
  openConfirmationDialog,
  getContactInformation,
  user,
  allowed_to_manage_versions,
}) {
  const [commitMsgActive, setCommitMsgActive] = useState(false);
  const [commitMsg, setCommitMsg] = useState(version_data.commit_msg);
  const [isButtonLoading, setIsButtonLoading] = useState(false);
  /** @type {[import("../js/types").ParamEleContact, any]} */
  const [authorData, setAuthorData] = useState(null);
  const text_area_ref = useRef(null);
  function handleClickEditCommitMessage() {
    if (commitMsgActive) {
      setIsButtonLoading(true);
      let local_file_data = getFileData();
      Firebase.updateCommitMsgForUser(local_file_data, version_key, commitMsg, (data) => {
        setIsButtonLoading(false);
        setCommitMsgActive(false);
      });
    } else {
      setCommitMsgActive(true);
    }
  }
  useEffect(() => {
    if (commitMsgActive) text_area_ref.current.focus();
  }, [commitMsgActive]);
  useEffect(() => {
    if (version_data.author) {
      getContactInformation(version_data.author, "uid", (contact_data) => {
        setAuthorData(contact_data);
      });
    } else {
      // The version was not saved by a known author
      setAuthorData(undefined);
    }
  }, []);
  function handleOnChangeTextArea(event) {
    setCommitMsg(event.target.value);
  }
  function handleClickOnLoadButton() {
    let local_file_data = { ...getFileData(), current_version: version_key };
    file.downloadAndOpenModel(local_file_data, setFileData, setModelLock);
    closeVersionManager();
  }
  function handleClickOnDeleteButton() {
    let dialog_callbacks = [
      {
        run: (close_dialog_callback) => {
          Firebase.deleteFileVersionFromCloud(getFileData(), version_data.results_available, version_key, () => {
            close_dialog_callback();
            closeVersionManager();
          });
        },
        copy: "ok",
        color: "red",
      },
    ];
    openConfirmationDialog("delete_version", dialog_callbacks, true);
  }
  function getPermissionLabel(copy_key) {
    return allowed_to_manage_versions ? localGetDisplayCopy(copy_key) : utils.getDisplayCopy("tooltips", "no_permissions");
  }
  function getAuthor() {
    if (authorData == null && typeof authorData == "object") {
      return (
        <HStack spacing="2">
          <Avatar size="xs" />
          <Skeleton height="10px" width="80px" />
        </HStack>
      );
    }
    let is_user_author = version_data.author == user.uid;
    return (
      <HStack spacing="2" minWidth="0">
        <Avatar size="xs" name={is_user_author ? null : authorData ? authorData.username : "?"} />
        <Text fontSize="sm" fontWeight="semibold" whiteSpace="nowrap">
          {is_user_author ? localGetDisplayCopy("you") : authorData ? authorData.username : localGetDisplayCopy("unknown")}
        </Text>
        {authorData ? (
          <Text fontSize="xs" color="gray.500" noOfLines={1}>
            {authorData.email}
          </Text>
        ) : null}
      </HStack>
    );
  }
  function getCommitMessage() {
    if (commitMsgActive) {
      return (
        <Textarea
          defaultValue={commitMsg}
          onChange={handleOnChangeTextArea}
          resize="vertical"
          size="sm"
          rows={2}
          borderRadius="md"
          placeholder={localGetDisplayCopy("commit_msg")}
          ref={text_area_ref}
        ></Textarea>
      );
    }
    return commitMsg ? (
      <Text fontSize="sm" color="gray.700" whiteSpace="pre-wrap" wordBreak="break-word">
        {commitMsg}
      </Text>
    ) : (
      <Text fontSize="sm" color="gray.400" fontStyle="italic">
        {localGetDisplayCopy("no_commit_msg")}
      </Text>
    );
  }
  return (
    <Flex>
      {/* Timeline marker */}
      <Flex direction="column" alignItems="center" width="4" flexShrink={0} marginRight="3">
        <Box
          width="3"
          height="3"
          marginTop="1.5"
          borderRadius="full"
          borderWidth="2px"
          borderColor={is_current ? "blue.500" : "gray.300"}
          backgroundColor={is_current ? "blue.500" : "white"}
          boxShadow={is_current ? "0 0 0 3px var(--chakra-colors-blue-100)" : "none"}
        />
        {is_last ? null : <Box width="2px" flex="1" backgroundColor="gray.200" marginTop="1" />}
      </Flex>
      <Box flex="1" minWidth="0" paddingBottom={is_last ? "0" : "5"}>
        <Flex alignItems="center" gap="2">
          <Text fontWeight="semibold" fontSize="sm">
            {utils.getFormattedDate(Number(version_key))}
          </Text>
          {is_current ? (
            <Tag size="sm" colorScheme="blue" borderRadius="full">
              {localGetDisplayCopy("current")}
            </Tag>
          ) : null}
        </Flex>
        <Box
          marginTop="2"
          padding="3"
          borderWidth="1px"
          borderColor={is_current ? "blue.100" : "gray.200"}
          backgroundColor={is_current ? "blue.50" : "gray.50"}
          borderRadius="lg"
        >
          <Flex alignItems="center" gap="2">
            <Box flex="1" minWidth="0">
              {getAuthor()}
            </Box>
            <Button size="xs" colorScheme="blue" leftIcon={<Icon as={MdOpenInBrowser} />} onClick={handleClickOnLoadButton}>
              {localGetDisplayCopy("load")}
            </Button>
            <Tooltip label={getPermissionLabel("delete")}>
              <IconButton
                size="xs"
                variant="ghost"
                colorScheme="red"
                icon={<Icon as={MdDelete} boxSize="4" />}
                aria-label={localGetDisplayCopy("delete")}
                onClick={handleClickOnDeleteButton}
                isDisabled={!allowed_to_manage_versions}
              />
            </Tooltip>
          </Flex>
          <Flex marginTop="2" alignItems="flex-start" gap="2">
            <Box flex="1" minWidth="0">
              {getCommitMessage()}
            </Box>
            {commitMsgActive ? (
              <Tooltip label={getPermissionLabel("save")}>
                <IconButton
                  size="xs"
                  colorScheme="blue"
                  icon={isButtonLoading ? <Spinner size="xs" speed="0.7s" /> : <Icon as={MdSave} boxSize="4" />}
                  aria-label={localGetDisplayCopy("save")}
                  onClick={handleClickEditCommitMessage}
                />
              </Tooltip>
            ) : (
              <Tooltip label={getPermissionLabel("edit")}>
                <IconButton
                  size="xs"
                  variant="ghost"
                  color="gray.500"
                  icon={<Icon as={MdEdit} boxSize="4" />}
                  aria-label={localGetDisplayCopy("edit")}
                  cursor={allowed_to_manage_versions ? "pointer" : "not-allowed"}
                  onClick={allowed_to_manage_versions ? handleClickEditCommitMessage : () => {}}
                />
              </Tooltip>
            )}
          </Flex>
          <HStack spacing="2" marginTop="2">
            {typeof version_data.num_nodes == "number" ? (
              <Tag size="sm" variant="subtle" colorScheme="gray" borderRadius="full">
                <TagLeftIcon as={MdAccountTree} />
                <TagLabel>
                  {version_data.num_nodes} {localGetDisplayCopy("nodes")}
                </TagLabel>
              </Tag>
            ) : null}
            {typeof version_data.results_available == "boolean" ? (
              <Tag size="sm" variant="subtle" colorScheme={version_data.results_available ? "green" : "gray"} borderRadius="full">
                <TagLeftIcon as={version_data.results_available ? MdCheckCircle : MdCancel} />
                <TagLabel>{localGetDisplayCopy(version_data.results_available ? "results_available" : "no_results")}</TagLabel>
              </Tag>
            ) : null}
          </HStack>
        </Box>
      </Box>
    </Flex>
  );
}

export default VersionManager;
