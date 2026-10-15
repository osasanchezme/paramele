import { Box, Button, ButtonGroup, HStack, Input, Menu, MenuButton, MenuDivider, MenuItem, MenuList, Text } from "@chakra-ui/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { TbChevronDown, TbPlus } from "react-icons/tb";
import modelLinks from "../js/modelLinks";
import sectionsLibrary from "../js/sectionsLibrary";
import utils from "../utils";

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("sections", copy_key);
}

// The app uses Escape and Enter for its own shortcuts
function stopKeys(event) {
  event.stopPropagation();
}

/**
 * Sections and materials of the main model, read again every time the model is evaluated
 * @returns {{sections: import("../js/types").ParamEleLibrarySection[], materials: import("../js/types").ParamEleLibraryMaterial[]}}
 */
function useLibrary() {
  const version = useSyncExternalStore(modelLinks.onElementsChange, modelLinks.getElementsVersion);
  return useMemo(
    () => ({ sections: sectionsLibrary.getSections(), materials: sectionsLibrary.getMaterials() }),
    [version] // eslint-disable-line react-hooks/exhaustive-deps
  );
}

function Swatch({ color, size = 10 }) {
  return (
    <Box className="library-swatch" bg={color || "transparent"} width={`${size}px`} height={`${size}px`} borderColor={color ? color : "gray.400"} />
  );
}

/**
 * Options of a picker: the section or material boxes, and the default one
 * @param {"section"|"material"} kind
 * @param {{sections: object[], materials: object[]}} library
 */
function getOptions(kind, library) {
  if (kind === "section")
    return library.sections
      .filter(({ editable }) => editable)
      .map(({ node_id, label, description, color }) => ({ value: node_id, label, detail: description, color }));
  return library.materials.map(({ node_id, label }) => ({ value: node_id, label }));
}

/**
 * Menu to pick a section or material box, and to create a new one
 * @param {object} props
 * @param {"section"|"material"} props.kind
 * @param {string|null} props.value Box ID, "default" (or null) for the default one, "auto" for the extra option
 * @param {function(string|null): void} props.onChange
 * @param {{value: string, label: string}} [props.extra_option] Option listed first, e.g. the section of the last drawn member
 * @param {boolean} [props.allow_new] Offers to create a new one, with the form under the menu
 * @param {function(object): string} [props.onCreate] Creates the box from the form and returns its ID, by default a new box is just picked
 * @param {boolean} [props.isDisabled]
 */
function LibraryPicker({ kind, value, onChange, extra_option, allow_new = true, onCreate, isDisabled }) {
  const library = useLibrary();
  const [is_creating, setIsCreating] = useState(false);
  const options = getOptions(kind, library);
  const default_option = {
    value: "default",
    label: localGetCopy(kind === "section" ? "default_section" : "default_material"),
    color: kind === "section" ? sectionsLibrary.DEFAULT_SECTION_COLOR : null,
  };
  const all_options = [...(extra_option ? [extra_option] : []), ...options, default_option];
  const selected = all_options.find((option) => option.value === (value ?? "default")) || default_option;
  const has_swatches = kind === "section";

  const create = (spec) => {
    let node_id = onCreate ? onCreate(spec) : kind === "section" ? sectionsLibrary.createSection(spec) : sectionsLibrary.createMaterial(spec);
    setIsCreating(false);
    if (!onCreate && node_id) onChange(node_id);
  };

  return (
    <Box className="library-picker" flex="1" minWidth={0}>
      <Menu isLazy placement="bottom-start" matchWidth>
        <MenuButton
          as={Button}
          size="xs"
          variant="outline"
          bg="white"
          width="100%"
          fontWeight="normal"
          textAlign="left"
          rightIcon={<TbChevronDown />}
          isDisabled={isDisabled}
          onKeyDown={stopKeys}
        >
          <HStack spacing={1.5} minWidth={0}>
            {has_swatches && <Swatch color={selected.color} />}
            {/* The dimensions are in the list, the button is often narrow */}
            <Text noOfLines={1}>{selected.label}</Text>
          </HStack>
        </MenuButton>
        <MenuList fontSize="xs" zIndex="popover" minWidth="200px" maxHeight="300px" overflowY="auto" onKeyDown={stopKeys}>
          {all_options.map((option) => (
            <MenuItem
              key={option.value}
              onClick={() => option.value !== selected.value && onChange(option.value === "default" ? null : option.value)}
            >
              <HStack spacing={1.5} minWidth={0} fontWeight={option.value === selected.value ? 600 : "normal"}>
                {has_swatches && <Swatch color={option.color} />}
                <Text noOfLines={1}>{option.label}</Text>
                {option.detail && (
                  <Text className="library-muted" noOfLines={1}>
                    {option.detail}
                  </Text>
                )}
              </HStack>
            </MenuItem>
          ))}
          {allow_new && (
            <>
              <MenuDivider />
              <MenuItem icon={<TbPlus />} onClick={() => setIsCreating(true)}>
                {localGetCopy(kind === "section" ? "new_section" : "new_material")}
              </MenuItem>
            </>
          )}
        </MenuList>
      </Menu>
      {is_creating &&
        (kind === "section" ? (
          <NewSectionForm materials={library.materials} onCreate={create} onCancel={() => setIsCreating(false)} />
        ) : (
          <NewMaterialForm onCreate={create} onCancel={() => setIsCreating(false)} />
        ))}
    </Box>
  );
}

/**
 * Number typed in a form, kept as text until it is a valid positive number
 */
function FormNumber({ label, unit, value, onChange }) {
  return (
    <HStack spacing={1} flex="1" minWidth={0}>
      <Text className="library-label">{label}</Text>
      <Input
        size="xs"
        className="library-number"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={stopKeys}
        aria-label={label}
        autoComplete="off"
      />
      {unit && <Text className="library-muted">{unit}</Text>}
    </HStack>
  );
}

function isPositiveNumber(text) {
  return String(text).trim() !== "" && Number(text) > 0;
}

function ToggleButtons({ options, value, onChange }) {
  return (
    <ButtonGroup size="xs" isAttached variant="outline" width="100%">
      {options.map((option) => (
        <Button
          key={option.value}
          flex="1"
          aria-pressed={value === option.value}
          bg={value === option.value ? "brand.50" : "white"}
          color={value === option.value ? "brand.600" : "gray.700"}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}

/**
 * Form for a new rectangular or circular section
 * @param {object} props
 * @param {import("../js/types").ParamEleLibraryMaterial[]} props.materials
 * @param {function({shape: string, dimensions: object, material_node_id: string|null, label: string}): void} props.onCreate
 * @param {Function} props.onCancel
 */
function NewSectionForm({ materials, onCreate, onCancel }) {
  const [shape, setShape] = useState("rectangle");
  const [dimensions, setDimensions] = useState(() =>
    Object.fromEntries(
      Object.entries(sectionsLibrary.SHAPE_DEFAULTS).flatMap(([, values]) => Object.entries(values).map(([key, number]) => [key, String(number)]))
    )
  );
  const [material_node_id, setMaterialNodeId] = useState(materials[0]?.node_id || null);
  const [label, setLabel] = useState("");
  const unit = sectionsLibrary.getUnits().section_length || "";
  const keys = Object.keys(sectionsLibrary.SHAPE_DEFAULTS[shape]);
  const is_valid = keys.every((key) => isPositiveNumber(dimensions[key]));
  const labels = { base: "b", height: "h", diameter: "D" };

  return (
    <Box className="library-form" onKeyDown={stopKeys}>
      <ToggleButtons
        options={[
          { value: "rectangle", label: localGetCopy("rectangle") },
          { value: "circle", label: localGetCopy("circle") },
        ]}
        value={shape}
        onChange={setShape}
      />
      <HStack spacing={2}>
        {keys.map((key) => (
          <FormNumber
            key={key}
            label={labels[key]}
            unit={unit}
            value={dimensions[key]}
            onChange={(text) => setDimensions({ ...dimensions, [key]: text })}
          />
        ))}
      </HStack>
      <HStack spacing={1}>
        <Text className="library-label">{localGetCopy("material")}</Text>
        <MaterialMenu materials={materials} value={material_node_id} onChange={setMaterialNodeId} />
      </HStack>
      <Input
        size="xs"
        placeholder={localGetCopy("name_optional")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        autoComplete="off"
      />
      <HStack spacing={1} justifyContent="flex-end">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          {localGetCopy("cancel")}
        </Button>
        <Button
          size="xs"
          colorScheme="brand"
          isDisabled={!is_valid}
          onClick={() =>
            onCreate({ shape, dimensions: Object.fromEntries(keys.map((key) => [key, Number(dimensions[key])])), material_node_id, label })
          }
        >
          {localGetCopy("create")}
        </Button>
      </HStack>
    </Box>
  );
}

/**
 * Plain menu of the material boxes, for the section form (a picker there would offer to create materials inside the form)
 */
function MaterialMenu({ materials, value, onChange }) {
  const selected = materials.find(({ node_id }) => node_id === value);
  return (
    <Menu isLazy placement="bottom-start" matchWidth>
      <MenuButton as={Button} size="xs" variant="outline" bg="white" flex="1" fontWeight="normal" textAlign="left" rightIcon={<TbChevronDown />}>
        <Text noOfLines={1}>{selected ? selected.label : localGetCopy("default_material")}</Text>
      </MenuButton>
      <MenuList fontSize="xs" zIndex="popover" minWidth="160px">
        {materials.map(({ node_id, label }) => (
          <MenuItem key={node_id} onClick={() => onChange(node_id)}>
            {label}
          </MenuItem>
        ))}
        <MenuItem onClick={() => onChange(null)}>{localGetCopy("default_material")}</MenuItem>
      </MenuList>
    </Menu>
  );
}

/**
 * Form for a new material from a preset
 * @param {{onCreate: function({preset: string, label: string}): void, onCancel: Function}} props
 */
function NewMaterialForm({ onCreate, onCancel }) {
  const [preset, setPreset] = useState("concrete");
  const [label, setLabel] = useState("");
  return (
    <Box className="library-form" onKeyDown={stopKeys}>
      <ToggleButtons
        options={[
          { value: "concrete", label: localGetCopy("concrete") },
          { value: "steel", label: localGetCopy("steel") },
        ]}
        value={preset}
        onChange={setPreset}
      />
      <Input
        size="xs"
        placeholder={localGetCopy("name_optional")}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        autoComplete="off"
      />
      <HStack spacing={1} justifyContent="flex-end">
        <Button size="xs" variant="ghost" onClick={onCancel}>
          {localGetCopy("cancel")}
        </Button>
        <Button size="xs" colorScheme="brand" onClick={() => onCreate({ preset, label })}>
          {localGetCopy("create")}
        </Button>
      </HStack>
    </Box>
  );
}

const sectionPicker = { LibraryPicker, NewSectionForm, NewMaterialForm, Swatch, useLibrary };

export default sectionPicker;
