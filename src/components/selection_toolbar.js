import { Box, Button, ButtonGroup, Text, Tooltip } from "@chakra-ui/react";
import { Fragment, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { NodeToolbar, getNodesBounds, useStore } from "reactflow";
import { Tb3DCubeSphere, TbArrowsExchange, TbCopy, TbEdit, TbPackage, TbTrash } from "react-icons/tb";
import boxes from "../js/boxes";
import modelLinks from "../js/modelLinks";
import utils from "../utils";

// Gap between the toolbar and the selection
const TOOLBAR_OFFSET = 12;
// Minimum distance from the toolbar to the edges of the editor
const EDGE_MARGIN = 8;
// The top of the editor has the model path and the view switch
const TOP_MARGIN = 56;

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("selection_toolbar", copy_key);
}

function navBarCopy(copy_key) {
  return utils.getDisplayCopy("nav_bar", copy_key);
}

/**
 * Ids and types of the selected boxes, as a string so the toolbar only re-renders when the selection changes
 * @param {Object} rf_state React Flow store
 */
const selectionSelector = (rf_state) =>
  rf_state
    .getNodes()
    .filter(({ selected }) => selected)
    .map(({ id, type }) => `${id}\n${type}`)
    .join("\t");

/**
 * Position of the toolbar in the editor, centered above the selection, or below it when there is no room above.
 * It is kept inside the editor so its buttons can always be reached
 * @param {string[]} node_ids
 * @param {{width: number, height: number}} size Size of the toolbar
 * @returns {string} CSS transform
 */
function useToolbarTransform(node_ids, { width, height }) {
  const selector = useCallback(
    (rf_state) => {
      let nodes = node_ids.map((id) => rf_state.nodeInternals.get(id)).filter((node) => node?.positionAbsolute);
      if (nodes.length === 0) return "";
      let bounds = getNodesBounds(nodes, rf_state.nodeOrigin);
      let [x, y, zoom] = rf_state.transform;
      let left = bounds.x * zoom + x;
      let top = bounds.y * zoom + y;
      let bottom = top + bounds.height * zoom;
      let toolbar_x = left + (bounds.width * zoom - width) / 2;
      let toolbar_y = top - TOOLBAR_OFFSET - height;
      if (toolbar_y < TOP_MARGIN) toolbar_y = bottom + TOOLBAR_OFFSET;
      toolbar_x = clamp(toolbar_x, EDGE_MARGIN, rf_state.width - width - EDGE_MARGIN);
      toolbar_y = clamp(toolbar_y, TOP_MARGIN, rf_state.height - height - EDGE_MARGIN);
      return `translate(${Math.round(toolbar_x)}px, ${Math.round(toolbar_y)}px)`;
    },
    [node_ids.join(","), width, height] // eslint-disable-line react-hooks/exhaustive-deps
  );
  return useStore(selector);
}

/**
 * Size of an element, kept up to date while it is mounted. Its width changes with the actions available for the selection
 * @returns {[{width: number, height: number}, (element: HTMLElement | null) => void]} The size and the ref for the element
 */
function useElementSize() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const observer = useRef(null);
  const ref = useCallback((element) => {
    observer.current?.disconnect();
    if (!element) return;
    observer.current = new ResizeObserver(() => setSize({ width: element.offsetWidth, height: element.offsetHeight }));
    observer.current.observe(element);
  }, []);
  return [size, ref];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

/**
 * Floating toolbar over the selected boxes, with the actions of the boxes menu of the top bar that apply to them
 */
function SelectionToolbar({ app_mode, changeAppMode, is_model_locked }) {
  const selection = useStore(selectionSelector);
  const selected = selection ? selection.split("\t").map((entry) => entry.split("\n")) : [];
  const node_ids = selected.map(([id]) => id);
  const types = new Set(selected.map(([, type]) => type));
  const [size, content_ref] = useElementSize();
  const transform = useToolbarTransform(node_ids, size);
  // The elements of the boxes are known after the model is evaluated, which does not change the selection
  useSyncExternalStore(modelLinks.onElementsChange, modelLinks.getElementsVersion);
  // Hidden while the selection box is drawn and while another action is in progress
  if (selected.length === 0 || app_mode !== "wait_action") return null;

  const [single_type] = types.size === 1 ? types : [];
  const is_wrapper = selected.length === 1 && single_type === "nodesWrapper";
  const has_ranges = types.has("variableRange");
  // The renderer only shows the elements of the main model
  const boxes_with_elements = modelLinks.isEditingMainModel() ? node_ids.filter(modelLinks.hasElements) : [];
  const target_types = boxes.CHANGEABLE_TYPES.includes(single_type) ? boxes.CHANGEABLE_TYPES.filter((type) => type !== single_type) : [];

  const group = () => {
    changeAppMode("selecting_handles");
    let is_grouping = boxes.groupBoxes((success) => {
      if (success) changeAppMode("wait_action");
    });
    if (!is_grouping) changeAppMode("wait_action");
  };
  // While the model is locked only the actions that do not edit it are available
  const locked_hint = is_model_locked ? localGetCopy("model_locked") : null;
  const actions = [
    boxes_with_elements.length > 0 && {
      key: "highlight",
      icon: Tb3DCubeSphere,
      label: localGetCopy("highlight"),
      onClick: () => modelLinks.highlightBoxes(boxes_with_elements),
    },
    {
      key: "group",
      icon: TbPackage,
      label: navBarCopy("group"),
      hint: locked_hint || (has_ranges ? localGetCopy("group_no_ranges") : null),
      isDisabled: is_model_locked || has_ranges,
      onClick: group,
    },
    is_wrapper && { key: "edit_logic", icon: TbEdit, label: navBarCopy("edit_logic"), onClick: boxes.editInternalLogic },
    {
      key: "duplicate",
      icon: TbCopy,
      label: navBarCopy("duplicate"),
      hint: locked_hint,
      isDisabled: is_model_locked,
      onClick: () => changeAppMode("duplicate_point_1"),
    },
    // Each type the selection can change into is a button of its own, there are only a few
    ...target_types.map((type) => ({
      key: `change_to_${type}`,
      icon: TbArrowsExchange,
      label: localGetCopy("change_to").replace("{type}", utils.getDisplayCopy("nodes", type)),
      hint: locked_hint,
      isDisabled: is_model_locked,
      onClick: () => boxes.changeNodesType(type),
    })),
    {
      key: "delete",
      icon: TbTrash,
      label: navBarCopy("delete"),
      hint: locked_hint,
      isDisabled: is_model_locked,
      onClick: boxes.deleteBoxes,
      is_destructive: true,
    },
  ].filter(Boolean);

  return (
    <NodeToolbar
      nodeId={node_ids}
      isVisible
      className="selection-toolbar-wrapper nodrag nopan nowheel"
      // Hidden until measured, so it does not show up in the wrong place first
      style={{ transform, top: 0, left: 0, visibility: size.width ? "visible" : "hidden" }}
    >
      <div ref={content_ref} className="selection-toolbar">
        <Text className="selection-toolbar-count">
          {localGetCopy(selected.length === 1 ? "one_box" : "boxes").replace("{count}", selected.length)}
        </Text>
        <ButtonGroup
          size="sm"
          variant="ghost"
          spacing={0}
          color="gray.700"
          sx={{ "& button": { fontWeight: "normal", fontSize: "13px", height: "30px" } }}
        >
          {actions.map(({ key, icon: ActionIcon, label, hint, isDisabled, onClick, is_destructive }) => (
            <Fragment key={key}>
              {is_destructive && <Box className="selection-toolbar-divider" />}
              <Tooltip label={hint} isDisabled={!hint} placement="top" openDelay={300}>
                {/* The wrapper keeps the tooltip working on disabled buttons */}
                <Box as="span" display="inline-flex">
                  <Button
                    leftIcon={<ActionIcon size={16} />}
                    iconSpacing={1.5}
                    px={2}
                    color={is_destructive ? "red.600" : undefined}
                    _hover={is_destructive ? { bg: "red.50" } : undefined}
                    isDisabled={isDisabled}
                    onClick={onClick}
                  >
                    {label}
                  </Button>
                </Box>
              </Tooltip>
            </Fragment>
          ))}
        </ButtonGroup>
      </div>
    </NodeToolbar>
  );
}

export default SelectionToolbar;
