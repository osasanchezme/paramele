import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Box,
  Button,
  Flex,
  HStack,
  Icon,
  Image,
  Link,
  SimpleGrid,
  Skeleton,
  Tag,
  Text,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { MdCheckCircle, MdInfoOutline, MdOpenInNew } from "react-icons/md";
import utils from "../utils";
import samples from "../js/samples";

function localGetCopy(key) {
  return utils.getDisplayCopy("samples", key);
}

/**
 * Gallery of sample models: the user picks one and opens it in place of the current model.
 * The catalog and the thumbnails are downloaded when the gallery opens, the model when it is opened
 */
function SampleGallery({ isOpen, onClose, setFileData, setModelLock }) {
  const [catalog, setCatalog] = useState(null);
  const [has_error, setHasError] = useState(false);
  const [selected_id, setSelectedId] = useState(null);

  const loadCatalog = () => {
    setHasError(false);
    samples
      .getCatalog()
      .then(setCatalog)
      .catch(() => setHasError(true));
  };
  // The catalog is downloaded the first time the gallery opens, the selection is cleared when it closes
  useEffect(() => {
    if (isOpen && !catalog) loadCatalog();
    if (!isOpen) setSelectedId(null);
  }, [isOpen, catalog]);

  const openSample = (sample_id) => {
    onClose();
    samples.openSample(sample_id, setFileData, setModelLock);
  };

  let body;
  if (has_error) {
    body = (
      <Flex direction="column" align="center" gap={3} paddingY={10}>
        <Text color="gray.600">{localGetCopy("load_error")}</Text>
        <Button size="sm" onClick={loadCatalog}>
          {localGetCopy("retry")}
        </Button>
      </Flex>
    );
  } else if (!catalog) {
    body = (
      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4} aria-busy="true" aria-label={localGetCopy("loading")}>
        {[0, 1, 2].map((index) => (
          <Box key={index} borderWidth="1px" borderColor="gray.200" borderRadius="lg" overflow="hidden">
            <Skeleton sx={{ aspectRatio: "16 / 10" }} />
            <Box padding={3}>
              <Skeleton height="18px" width="70%" marginBottom={2} />
              <Skeleton height="12px" marginBottom={1} />
              <Skeleton height="12px" width="85%" />
            </Box>
          </Box>
        ))}
      </SimpleGrid>
    );
  } else {
    body = (
      <SimpleGrid columns={{ base: 1, sm: 2, md: 3 }} spacing={4} role="listbox" aria-label={localGetCopy("title")}>
        {catalog.samples.map((sample) => (
          <SampleCard
            key={sample.id}
            sample={sample}
            is_selected={sample.id === selected_id}
            onSelect={() => setSelectedId(sample.id)}
            onOpen={() => openSample(sample.id)}
          />
        ))}
      </SimpleGrid>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent marginX={4}>
        <ModalHeader paddingBottom={1}>
          {localGetCopy("title")}
          <Text fontSize="sm" fontWeight="normal" color="gray.600">
            {localGetCopy("subtitle")}
          </Text>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody paddingY={4}>{body}</ModalBody>
        <ModalFooter gap={3} flexWrap="wrap" borderTopWidth="1px" borderColor="gray.200">
          <HStack spacing={2} color="gray.600" fontSize="sm" flex="1" minWidth="220px">
            <Icon as={MdInfoOutline} boxSize={4} flexShrink={0} />
            <Text>{localGetCopy("replace_warning")}</Text>
          </HStack>
          <Button variant="ghost" onClick={onClose}>
            {localGetCopy("cancel")}
          </Button>
          <Button colorScheme="brand" isDisabled={!selected_id} onClick={() => openSample(selected_id)}>
            {localGetCopy("open")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

/**
 * A sample in the gallery: a click selects it, a double click (or Enter once selected) opens it
 */
function SampleCard({ sample, is_selected, onSelect, onOpen }) {
  const tutorial_url = sample.tutorial && samples.getLocalized(sample.tutorial);
  return (
    <Box
      as="div"
      role="option"
      tabIndex={0}
      aria-selected={is_selected}
      position="relative"
      display="flex"
      flexDirection="column"
      borderWidth="2px"
      borderColor={is_selected ? "brand.500" : "gray.200"}
      borderRadius="lg"
      overflow="hidden"
      cursor="pointer"
      background="white"
      transition="border-color 0.15s, box-shadow 0.15s, transform 0.15s"
      _hover={{ borderColor: is_selected ? "brand.500" : "gray.300", boxShadow: "md" }}
      _focusVisible={{ outline: "none", boxShadow: "outline" }}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") is_selected ? onOpen() : onSelect();
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <Box background="gray.50" borderBottomWidth="1px" borderColor="gray.200" sx={{ aspectRatio: "16 / 10" }}>
        <Image
          src={samples.getThumbnailURL(sample)}
          alt=""
          width="100%"
          height="100%"
          objectFit="cover"
          fallback={<Skeleton width="100%" height="100%" />}
        />
      </Box>
      {is_selected && (
        <Flex
          position="absolute"
          top={2}
          right={2}
          align="center"
          gap={1}
          paddingX={2}
          paddingY={0.5}
          borderRadius="full"
          background="brand.500"
          color="brand.ink"
          fontSize="xs"
          fontWeight="semibold"
        >
          <Icon as={MdCheckCircle} />
          {localGetCopy("selected")}
        </Flex>
      )}
      <Flex direction="column" gap={1.5} padding={3} flex="1">
        <Text fontWeight="semibold" lineHeight="short">
          {samples.getLocalized(sample.title)}
        </Text>
        <Text fontSize="sm" color="gray.600" flex="1">
          {samples.getLocalized(sample.description)}
        </Text>
        <Flex gap={1.5} flexWrap="wrap" marginTop={1}>
          {samples.getLocalized(sample.tags).map((tag) => (
            <Tag key={tag} size="sm" variant="subtle">
              {tag}
            </Tag>
          ))}
        </Flex>
        <Flex align="center" justify="space-between" gap={2} marginTop={1}>
          <Text fontSize="xs" color="gray.600">
            {sample.boxes} {localGetCopy("boxes")}
          </Text>
          {tutorial_url && (
            <Link
              href={tutorial_url}
              isExternal
              fontSize="sm"
              color="brand.600"
              _hover={{ color: "brand.700" }}
              display="inline-flex"
              alignItems="center"
              gap={1}
              onClick={(event) => event.stopPropagation()}
            >
              {localGetCopy("tutorial")}
              <Icon as={MdOpenInNew} boxSize={3.5} />
            </Link>
          )}
        </Flex>
      </Flex>
    </Box>
  );
}

export default SampleGallery;
