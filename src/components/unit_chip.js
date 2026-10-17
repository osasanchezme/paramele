import { Menu, MenuButton, MenuItemOption, MenuList, MenuOptionGroup, MenuDivider, Portal, Tag, Tooltip } from "@chakra-ui/react";
import utils from "../utils";
import getState from "../getState";
import units from "../js/units";
import unitInference from "../js/unitInference";
import state from "../state";

const ADAPT_OPTION = "__adapt__";

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("units", copy_key);
}

function getModelUnits() {
  return units.repairUnits(getState("settings").units);
}

/**
 * Unit of a handle of the model in the editor, from the last evaluation (see unitInference)
 * @param {string} node_id
 * @param {string} handle_id
 * @returns {{unit: import("../js/types").ParamEleUnit|undefined, status: "pinned"|"inferred"|"free"|undefined, label: string}}
 */
function getHandleUnit(node_id, handle_id) {
  const inference = state.getGlobalVariable("unit_inference");
  const key = unitInference.handleKey(node_id, handle_id);
  const unit = inference?.handles[key];
  return { unit, status: inference?.adaptive[key], label: unit ? units.formatUnit(unit, getModelUnits()) : "" };
}

/**
 * Name of a quantity with its unit in the model, e.g. "Length (m)"
 * @param {string} quantity
 * @param {object} [model_units]
 */
function getQuantityLabel(quantity, model_units = getModelUnits()) {
  const unit_label = units.formatUnit(units.getQuantityUnit(quantity), model_units);
  return unit_label ? `${localGetCopy(quantity)} (${unit_label})` : localGetCopy(quantity);
}

/**
 * Unit of a number or slider box. It adapts to its links (faded) until the user gives it one (solid)
 * @param {object} props
 * @param {string} props.node_id
 * @param {string} props.handle_id Adaptive handle of the box (see the unit declarations of the boxes)
 * @param {string} [props.pinned] Quantity the user gave it (node data `unit`)
 * @param {boolean} [props.isDisabled]
 * @param {function(string): void} props.onChange Called with the quantity, or "" to adapt to the links
 */
function UnitChip({ node_id, handle_id, pinned, isDisabled, onChange }) {
  const { label, status } = getHandleUnit(node_id, handle_id);
  const model_units = getModelUnits();
  const is_pinned = Boolean(pinned && units.QUANTITIES[pinned]);
  const text = label || "—";
  let tooltip;
  if (is_pinned) tooltip = `${getQuantityLabel(pinned, model_units)} · ${localGetCopy("chip_pinned")}`;
  else if (status === "inferred" && label) tooltip = `${localGetCopy("chip_inferred")} (${label})`;
  else tooltip = localGetCopy("chip_free");
  return (
    <Menu isLazy placement="bottom-end">
      <Tooltip label={tooltip} placement="top" openDelay={300}>
        <MenuButton
          as={Tag}
          size="sm"
          className={`unit-chip ${is_pinned ? "unit-chip-pinned" : "unit-chip-adaptive"}`}
          variant={is_pinned ? "solid" : "outline"}
          colorScheme={is_pinned ? "brand" : "gray"}
          cursor={isDisabled ? "default" : "pointer"}
          pointerEvents={isDisabled ? "none" : "auto"}
          onClick={(event) => event.stopPropagation()}
          aria-label={localGetCopy("chip_label")}
        >
          {text}
        </MenuButton>
      </Tooltip>
      <Portal>
        <MenuList fontSize="sm" zIndex={2000} className="nodrag nowheel">
          <MenuOptionGroup type="radio" value={is_pinned ? pinned : ADAPT_OPTION} onChange={(value) => onChange(value === ADAPT_OPTION ? "" : value)}>
            <MenuItemOption value={ADAPT_OPTION}>{localGetCopy("adapt")}</MenuItemOption>
            <MenuDivider />
            {units.PICKABLE_QUANTITIES.map((quantity) => (
              <MenuItemOption key={quantity} value={quantity}>
                {getQuantityLabel(quantity, model_units)}
              </MenuItemOption>
            ))}
          </MenuOptionGroup>
        </MenuList>
      </Portal>
    </Menu>
  );
}

export { getHandleUnit, getQuantityLabel };
export default UnitChip;
