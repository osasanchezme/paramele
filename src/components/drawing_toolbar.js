import {
  Box,
  Button,
  ButtonGroup,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { useEffect, useState } from "react";
import {
  TbArrowBackUp,
  TbArrowBigDownLines,
  TbArrowDown,
  TbArrowsDown,
  TbChevronDown,
  TbEraser,
  TbLine,
  TbPaint,
  TbPointer,
  TbPolygon,
  TbRotateClockwise,
  TbTriangle,
} from "react-icons/tb";
import utils from "../utils";
import drawingLayer from "../js/drawingLayer";
import sectionPicker from "./section_picker";

const TOOLS = [
  { tool: "none", icon: TbPointer, shortcut: "Esc" },
  { tool: "member", icon: TbLine, shortcut: "M" },
  { tool: "plate", icon: TbPolygon, shortcut: "P" },
  { tool: "support", icon: TbTriangle, shortcut: "S" },
  { tool: "point_load", icon: TbArrowDown, shortcut: "L" },
  { tool: "distributed_load", icon: TbArrowsDown, shortcut: "D" },
  { tool: "pressure", icon: TbArrowBigDownLines, shortcut: "A" },
  { tool: "moment", icon: TbRotateClockwise, shortcut: "O" },
  { tool: "assign", icon: TbPaint, shortcut: "T" },
  { tool: "delete", icon: TbEraser, shortcut: "E" },
];
const LOAD_TOOLS = {
  point_load: { key: "force", prefix: "F" },
  distributed_load: { key: "distributed", prefix: "w" },
  pressure: { key: "pressure", prefix: "p" },
  moment: { key: "moment", prefix: "M" },
};
const PLANES = ["xy", "xz", "yz"];
const PRESSURE_AXES = ["global", "local"];
const ASSIGN_MODES = ["section", "material"];
const RESTRAINTS = [
  { code: "FFFFFF", copy: "fixed" },
  { code: "FFFFFR", copy: "pinned" },
];
const MAX_LEVELS = 12;

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("drawing", copy_key);
}

// The app uses Escape and Enter for its own shortcuts
function stopKeys(event) {
  if (event.key === "Enter") event.currentTarget.blur();
  event.stopPropagation();
}

/**
 * Number input that keeps what is typed until it is a valid number
 */
function ValueInput({ label, value, step, onChange, min, width = "64px" }) {
  const [draft, setDraft] = useState(null);
  return (
    <HStack spacing={1}>
      <Text className="drawing-toolbar-label">{label}</Text>
      <NumberInput
        size="xs"
        width={width}
        step={step}
        min={min}
        value={draft === null ? value : draft}
        onChange={(text, number) => {
          setDraft(text);
          if (text.trim() !== "" && Number.isFinite(number) && (min === undefined || number >= min)) onChange(number);
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={stopKeys}
      >
        <NumberInputField aria-label={label} paddingInlineEnd={step ? 5 : 2} />
        {step && (
          <NumberInputStepper>
            <NumberIncrementStepper />
            <NumberDecrementStepper />
          </NumberInputStepper>
        )}
      </NumberInput>
    </HStack>
  );
}

function getHint(drawing_state, model_locked) {
  if (model_locked) return localGetCopy("hint_locked");
  let { tool, points } = drawing_state;
  if (tool === "member") return localGetCopy(points.length === 0 ? "hint_member_start" : "hint_member_next");
  if (tool === "plate") return localGetCopy(points.length < 3 ? "hint_plate_next" : "hint_plate_close");
  if (tool === "assign") return localGetCopy(`hint_assign_${drawing_state.assign_mode}`);
  return localGetCopy(`hint_${tool}`);
}

/**
 * Floating toolbar of the renderer to draw the structure. What is drawn becomes boxes and links in the editor
 * @param {object} props
 * @param {import("../js/types").ParamEleDrawingState} props.drawing_state
 * @param {function(Partial<import("../js/types").ParamEleDrawingState>): void} props.setDrawingState
 * @param {number[]} props.levels Coordinates of the structure along the axis normal to the work plane
 * @param {boolean} props.can_undo
 * @param {Function} props.undo
 * @param {boolean} props.model_locked
 */
function DrawingToolbar({ drawing_state, setDrawingState, levels, can_undo, undo, model_locked }) {
  const { tool, plane, offset, spacing } = drawing_state;
  const [is_collapsed, setIsCollapsed] = useState(false);
  useEffect(() => {
    if (model_locked && tool !== "none") setDrawingState({ tool: "none" });
  }, [model_locked, tool, setDrawingState]);
  const { normal } = drawingLayer.getPlaneAxes(plane);
  const load_tool = LOAD_TOOLS[tool];
  const shown_levels = levels.slice(0, MAX_LEVELS);
  const is_active = tool !== "none";

  return (
    <div className="drawing-toolbar" onClick={(event) => event.stopPropagation()}>
      <HStack spacing={1} className="drawing-toolbar-row">
        <ButtonGroup size="sm" isAttached variant="outline">
          {TOOLS.map(({ tool: tool_key, icon: ToolIcon, shortcut }) => {
            const label = `${localGetCopy(tool_key)} (${shortcut})`;
            const is_selected = tool === tool_key;
            return (
              <Tooltip key={tool_key} label={label} placement="bottom" openDelay={300}>
                <IconButton
                  aria-label={label}
                  aria-pressed={is_selected}
                  icon={<ToolIcon size={17} />}
                  bg={is_selected ? "brand.50" : "white"}
                  color={is_selected ? "brand.600" : "gray.700"}
                  isDisabled={model_locked && tool_key !== "none"}
                  onClick={() => setDrawingState({ tool: tool_key })}
                />
              </Tooltip>
            );
          })}
        </ButtonGroup>
        <Tooltip label={`${localGetCopy("undo")} (Ctrl+Z)`} placement="bottom" openDelay={300}>
          <IconButton
            size="sm"
            variant="outline"
            bg="white"
            aria-label={localGetCopy("undo")}
            icon={<TbArrowBackUp size={17} />}
            isDisabled={!can_undo || model_locked}
            onClick={undo}
          />
        </Tooltip>
        {is_active && (
          <Tooltip label={localGetCopy(is_collapsed ? "show_options" : "hide_options")} placement="bottom" openDelay={300}>
            <IconButton
              size="sm"
              variant="ghost"
              aria-label={localGetCopy(is_collapsed ? "show_options" : "hide_options")}
              icon={<TbChevronDown size={16} style={{ transform: is_collapsed ? "none" : "rotate(180deg)" }} />}
              onClick={() => setIsCollapsed(!is_collapsed)}
            />
          </Tooltip>
        )}
      </HStack>
      {is_active && !is_collapsed && (
        <Box className="drawing-toolbar-options">
          {drawingLayer.isPointTool(tool) && (
            <HStack spacing={2} wrap="wrap" rowGap={1}>
              <ButtonGroup size="xs" isAttached variant="outline">
                {PLANES.map((plane_key) => (
                  <Tooltip key={plane_key} label={localGetCopy(`plane_${plane_key}`)} placement="bottom" openDelay={300}>
                    <Button
                      aria-pressed={plane === plane_key}
                      bg={plane === plane_key ? "brand.50" : "white"}
                      color={plane === plane_key ? "brand.600" : "gray.700"}
                      onClick={() => setDrawingState({ plane: plane_key })}
                    >
                      {plane_key.toUpperCase()}
                    </Button>
                  </Tooltip>
                ))}
              </ButtonGroup>
              <HStack spacing={0}>
                <ValueInput
                  label={`${normal.toUpperCase()} =`}
                  value={offset}
                  step={spacing}
                  onChange={(value) => setDrawingState({ offset: value })}
                />
                {shown_levels.length > 0 && (
                  <Menu isLazy placement="bottom-start">
                    <Tooltip label={localGetCopy("levels")} placement="bottom" openDelay={300}>
                      <MenuButton as={IconButton} size="xs" variant="ghost" aria-label={localGetCopy("levels")} icon={<TbChevronDown />} />
                    </Tooltip>
                    <MenuList minWidth="100px" fontSize="xs" zIndex="popover">
                      {shown_levels.map((level) => (
                        <MenuItem key={level} onClick={() => setDrawingState({ offset: level })}>
                          {`${normal.toUpperCase()} = ${level}`}
                        </MenuItem>
                      ))}
                    </MenuList>
                  </Menu>
                )}
              </HStack>
              <ValueInput
                label={localGetCopy("spacing")}
                value={spacing}
                min={0.001}
                onChange={(value) => value > 0 && setDrawingState({ spacing: value })}
                width="52px"
              />
              {tool === "plate" && (
                <ValueInput
                  label={localGetCopy("thickness")}
                  value={drawing_state.thickness}
                  min={0.001}
                  onChange={(value) => value > 0 && setDrawingState({ thickness: value })}
                  width="52px"
                />
              )}
            </HStack>
          )}
          {tool === "member" && (
            <HStack spacing={1} minWidth="240px">
              <Text className="drawing-toolbar-label">{utils.getDisplayCopy("sections", "section")}</Text>
              <sectionPicker.LibraryPicker
                kind="section"
                value={drawing_state.active_section ?? "auto"}
                extra_option={{ value: "auto", label: localGetCopy("section_auto") }}
                onChange={(value) => setDrawingState({ active_section: value === "auto" ? null : value ?? "default" })}
              />
            </HStack>
          )}
          {tool === "assign" && (
            <HStack spacing={2} minWidth="300px">
              <ButtonGroup size="xs" isAttached variant="outline">
                {ASSIGN_MODES.map((mode) => (
                  <Button
                    key={mode}
                    aria-pressed={drawing_state.assign_mode === mode}
                    bg={drawing_state.assign_mode === mode ? "brand.50" : "white"}
                    color={drawing_state.assign_mode === mode ? "brand.600" : "gray.700"}
                    onClick={() => setDrawingState({ assign_mode: mode })}
                  >
                    {localGetCopy(`assign_${mode}`)}
                  </Button>
                ))}
              </ButtonGroup>
              {drawing_state.assign_mode === "section" ? (
                <sectionPicker.LibraryPicker
                  key="section"
                  kind="section"
                  value={drawing_state.active_section}
                  onChange={(value) => setDrawingState({ active_section: value ?? "default" })}
                />
              ) : (
                <sectionPicker.LibraryPicker
                  key="material"
                  kind="material"
                  value={drawing_state.active_material}
                  onChange={(value) => setDrawingState({ active_material: value ?? "default" })}
                />
              )}
            </HStack>
          )}
          {load_tool && (
            <HStack spacing={2} wrap="wrap" rowGap={1}>
              {["x", "y", "z"].map((axis) => (
                <ValueInput
                  key={axis}
                  label={`${load_tool.prefix}${axis}`}
                  value={drawing_state[load_tool.key][axis]}
                  onChange={(value) => setDrawingState({ [load_tool.key]: { ...drawing_state[load_tool.key], [axis]: value } })}
                  width="56px"
                />
              ))}
              {tool === "pressure" && (
                <ButtonGroup size="xs" isAttached variant="outline">
                  {PRESSURE_AXES.map((axes) => (
                    <Tooltip key={axes} label={localGetCopy(`axes_${axes}_tooltip`)} placement="bottom" openDelay={300}>
                      <Button
                        aria-pressed={drawing_state.pressure_axes === axes}
                        bg={drawing_state.pressure_axes === axes ? "brand.50" : "white"}
                        color={drawing_state.pressure_axes === axes ? "brand.600" : "gray.700"}
                        onClick={() => setDrawingState({ pressure_axes: axes })}
                      >
                        {localGetCopy(`axes_${axes}`)}
                      </Button>
                    </Tooltip>
                  ))}
                </ButtonGroup>
              )}
            </HStack>
          )}
          {tool === "support" && (
            <ButtonGroup size="xs" isAttached variant="outline">
              {RESTRAINTS.map(({ code, copy }) => (
                <Button
                  key={code}
                  aria-pressed={drawing_state.restraint_code === code}
                  bg={drawing_state.restraint_code === code ? "brand.50" : "white"}
                  color={drawing_state.restraint_code === code ? "brand.600" : "gray.700"}
                  onClick={() => setDrawingState({ restraint_code: code })}
                >
                  {localGetCopy(copy)}
                </Button>
              ))}
            </ButtonGroup>
          )}
          <Text className="drawing-toolbar-hint">{getHint(drawing_state, model_locked)}</Text>
        </Box>
      )}
    </div>
  );
}

export default DrawingToolbar;
