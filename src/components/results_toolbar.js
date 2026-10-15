import { HStack, IconButton, NumberInput, NumberInputField, Select, Text, Tooltip } from "@chakra-ui/react";
import { useState } from "react";
import { TbWand } from "react-icons/tb";
import utils from "../utils";

const COMPONENTS = ["none", "sum", "x", "y", "z"];

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("renderer", copy_key);
}

// The app uses Escape and Enter for its own shortcuts
function stopKeys(event) {
  if (event.key === "Enter") event.currentTarget.blur();
  event.stopPropagation();
}

function formatNumber(value) {
  return String(Number(value.toPrecision(4)));
}

/**
 * Card of the renderer to pick the displacement drawn as the deformed shape, when there are results
 * @param {object} props
 * @param {import("../js/types").ParamEleDisplacementResults} props.results
 * @param {import("../js/types").ParamEleResultsView} props.view
 * @param {function(Partial<import("../js/types").ParamEleResultsView>): void} props.onChange
 */
function ResultsToolbar({ results, view, onChange }) {
  const [scale_draft, setScaleDraft] = useState(null);
  const { load_cases, load_case, display_unit, extremes, auto_scale } = results;
  const scale = view.scale ?? auto_scale;
  const is_shown = view.component !== "none";

  return (
    <div className="results-toolbar" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <Text className="results-toolbar-title">{localGetCopy("deformed_shape")}</Text>
      <Select
        size="xs"
        aria-label={localGetCopy("deformed_shape")}
        value={view.component}
        onChange={(event) => onChange({ component: event.target.value })}
        onKeyDown={stopKeys}
      >
        {COMPONENTS.map((component) => (
          <option key={component} value={component}>
            {localGetCopy(`deformed_${component}`)}
          </option>
        ))}
      </Select>
      {load_cases.length > 1 && (
        <Select
          size="xs"
          aria-label={localGetCopy("load_case")}
          title={localGetCopy("load_case")}
          value={load_case}
          onChange={(event) => onChange({ load_case: event.target.value })}
          onKeyDown={stopKeys}
        >
          {load_cases.map(({ key, name }) => (
            <option key={key} value={key}>
              {name}
            </option>
          ))}
        </Select>
      )}
      {is_shown && (
        <HStack spacing={1}>
          <Text className="drawing-toolbar-label">{localGetCopy("deformation_scale")} ×</Text>
          <NumberInput
            size="xs"
            width="72px"
            min={0}
            value={scale_draft === null ? formatNumber(scale) : scale_draft}
            onChange={(text, number) => {
              setScaleDraft(text);
              if (text.trim() !== "" && Number.isFinite(number) && number > 0) onChange({ scale: number });
            }}
            onBlur={() => setScaleDraft(null)}
            onKeyDown={stopKeys}
          >
            <NumberInputField aria-label={localGetCopy("deformation_scale")} paddingInlineEnd={2} />
          </NumberInput>
          <Tooltip label={localGetCopy("deformation_scale_auto")} placement="top" openDelay={300}>
            <IconButton
              size="xs"
              variant="ghost"
              aria-label={localGetCopy("deformation_scale_auto")}
              aria-pressed={view.scale === null}
              color={view.scale === null ? "brand.600" : "gray.500"}
              icon={<TbWand size={14} />}
              onClick={() => {
                setScaleDraft(null);
                onChange({ scale: null });
              }}
            />
          </Tooltip>
        </HStack>
      )}
      {is_shown && (
        <Text className="drawing-toolbar-label">
          {localGetCopy("max_displacement")} {formatNumber(extremes[view.component])} {display_unit}
        </Text>
      )}
    </div>
  );
}

export default ResultsToolbar;
