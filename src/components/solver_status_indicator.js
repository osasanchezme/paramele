import { Box, Button, Flex, Popover, PopoverArrow, PopoverBody, PopoverContent, PopoverHeader, PopoverTrigger, Tag, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import utils from "../utils";
import getState from "../getState";
import state from "../state";
import structure from "../js/structure";
import pyniteWasm from "../js/pyniteWasm";
import solverCredentials from "../js/solverCredentials";

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("solver_status", copy_key);
}

const STATUS_COLORS = {
  ready: "green.400",
  checking: "yellow.400",
  loading: "yellow.400",
  idle: "gray.400",
  not_ready: "red.400",
  error: "red.400",
};

function getGlobalSettings() {
  return getState("settings")["global"];
}

/**
 * Shows the selected solver and whether it is ready to solve. Hover it to see the details.
 * On compact screens only the status dot is shown.
 */
function SolverStatusIndicator({ is_compact }) {
  const [global_settings, setGlobalSettings] = useState(getGlobalSettings);
  const [server_running, setServerRunning] = useState(null);
  const [wasm_state, setWasmState] = useState(pyniteWasm.getLoadState);
  const [credentials, setCredentials] = useState(solverCredentials.getCredentials);
  const { solver_engine } = global_settings;
  const { solver_username, solver_key } = credentials;

  useEffect(() => state.onSettingsChange(() => setGlobalSettings(getGlobalSettings())), []);
  useEffect(() => solverCredentials.subscribe(setCredentials), []);
  useEffect(() => pyniteWasm.subscribe(setWasmState), []);

  const checkServer = useCallback(() => {
    setServerRunning(null);
    structure.isPyniteServerRunning().then(setServerRunning);
  }, []);

  useEffect(() => {
    if (solver_engine === "pynite") checkServer();
    // Errors are shown in the indicator, the retry button calls preload again
    if (solver_engine === "pynite_wasm") pyniteWasm.preload().catch(() => {});
  }, [solver_engine, checkServer]);

  let status;
  let details;
  let action = null;
  switch (solver_engine) {
    case "pynite":
      status = server_running === null ? "checking" : server_running ? "ready" : "not_ready";
      details = localGetCopy(`server_${status}`);
      break;
    case "pynite_wasm":
      status = wasm_state.status;
      details = localGetCopy(`wasm_${status}`);
      if (status === "error") {
        action = (
          <Button size="sm" variant="outline" onClick={() => pyniteWasm.preload().catch(() => {})}>
            {localGetCopy("retry")}
          </Button>
        );
      }
      break;
    case "skyciv":
      status = solver_username?.trim() && solver_key?.trim() ? "ready" : "not_ready";
      details = localGetCopy(`credentials_${status}`);
      if (status === "not_ready") {
        action = (
          <Button size="sm" variant="outline" onClick={utils.openGlobalSettings}>
            {localGetCopy("open_settings")}
          </Button>
        );
      }
      break;
    default:
      status = "not_ready";
      details = localGetCopy("unknown_solver");
      break;
  }
  const solver_name = utils.getDisplayCopy("settings", solver_engine);

  return (
    <Popover trigger="hover" placement="bottom" isLazy onOpen={solver_engine === "pynite" ? checkServer : undefined}>
      <PopoverTrigger>
        <Tag
          height="30px"
          marginTop="10px"
          marginRight={is_compact ? "6px" : "10px"}
          cursor="pointer"
          aria-label={solver_name}
          onClick={utils.openGlobalSettings}
        >
          <Box
            width="8px"
            height="8px"
            borderRadius="50%"
            marginRight={is_compact ? 0 : "6px"}
            flexShrink={0}
            backgroundColor={STATUS_COLORS[status]}
          />
          {!is_compact && solver_name}
        </Tag>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverHeader fontWeight="semibold">{solver_name}</PopoverHeader>
        <PopoverBody>
          <Text fontSize="sm">{details}</Text>
          {status === "error" && wasm_state.error && (
            <Text fontSize="xs" color="red.500" marginTop="1" noOfLines={3}>
              {wasm_state.error}
            </Text>
          )}
          {action && (
            <Flex justify="right" marginTop="2">
              {action}
            </Flex>
          )}
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

export default SolverStatusIndicator;
