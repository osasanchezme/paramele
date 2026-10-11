import { Modal, ModalOverlay, ModalContent, ModalBody, Spinner, Center, VStack, Box } from "@chakra-ui/react";
import { useGlobalLoading } from "../Context";
import utils from "../utils";

function localGetDisplayCopy(copy_key) {
  return utils.getDisplayCopy("waiting_dimmer", copy_key);
}

function LoadingDimmer() {
  const { globalLoadingContent, globalLoadingVisible, hideGlobalLoading, showGlobalLoading, setGlobalLoadingMsg } = useGlobalLoading();
  window.ParamEle.showLoadingDimmer = (msg) => {
    showGlobalLoading(msg);
  };
  window.ParamEle.hideLoadingDimmer = () => {
    hideGlobalLoading();
  };
  window.ParamEle.setLoadingDimmerMsg = (msg) => {
    setGlobalLoadingMsg(msg);
  };
  return (
    <Modal isOpen={globalLoadingVisible} closeOnOverlayClick={false} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalBody>
          <Center h="200px">
            <VStack>
              <Box maxW="sm">
                <Spinner size="xl" speed="0.8s" />
              </Box>
              <Box>{localGetDisplayCopy(globalLoadingContent)}...</Box>
            </VStack>
          </Center>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export { LoadingDimmer };
