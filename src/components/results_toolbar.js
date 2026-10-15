import { HStack, IconButton, NumberInput, NumberInputField, Select, Text, Tooltip } from "@chakra-ui/react";
import { useState } from "react";
import { TbWand } from "react-icons/tb";
import utils from "../utils";

const DISPLACEMENTS = ["displacement_sum", "displacement_x", "displacement_y", "displacement_z"];
const FORCES = ["moment_x", "moment_y", "moment_z", "shear_y", "shear_z", "axial"];

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
 * Card of the renderer to pick the result drawn on the structure (a deformed shape or a force diagram), when there are results
 * @param {object} props
 * @param {import("../js/types").ParamEleResults} props.results
 * @param {import("../js/types").ParamEleResultsView} props.view
 * @param {function(Partial<import("../js/types").ParamEleResultsView>): void} props.onChange
 */
function ResultsToolbar({ results, view, onChange }) {
  const [scale_draft, setScaleDraft] = useState(null);
  const { load_cases, load_case, displacements, forces } = results;
  const isAvailable = (result) => (DISPLACEMENTS.includes(result) ? Boolean(displacements) : Boolean(forces && forces.results.includes(result)));
  const is_shown = view.result !== "none" && isAvailable(view.result);
  const is_force = is_shown && FORCES.includes(view.result);
  // Displacements have a scale of their own, diagrams one relative to their automatic scale
  const scale = is_force ? view.diagram_scale : view.scale ?? displacements?.auto_scale ?? 1;
  const is_auto_scale = is_force ? view.diagram_scale === 1 : view.scale === null;
  const setScale = (value) => onChange(is_force ? { diagram_scale: value ?? 1 } : { scale: value });

  return (
    <div className="results-toolbar" onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <Text className="results-toolbar-title">{localGetCopy("results")}</Text>
      <Select
        size="xs"
        aria-label={localGetCopy("results")}
        value={is_shown ? view.result : "none"}
        onChange={(event) => onChange({ result: event.target.value })}
        onKeyDown={stopKeys}
      >
        <option value="none">{localGetCopy("result_none")}</option>
        {[
          ["displacements", DISPLACEMENTS],
          ["forces", FORCES],
        ].map(([group, group_results]) => (
          <optgroup key={group} label={localGetCopy(`results_group_${group}`)}>
            {group_results.map((result) => (
              <option key={result} value={result} disabled={!isAvailable(result)}>
                {localGetCopy(`result_${result}`)}
              </option>
            ))}
          </optgroup>
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
              if (text.trim() !== "" && Number.isFinite(number) && number > 0) setScale(number);
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
              aria-pressed={is_auto_scale}
              color={is_auto_scale ? "brand.600" : "gray.500"}
              icon={<TbWand size={14} />}
              onClick={() => {
                setScaleDraft(null);
                setScale(null);
              }}
            />
          </Tooltip>
        </HStack>
      )}
      {is_shown && !is_force && (
        <Text className="drawing-toolbar-label">
          {localGetCopy("max")} {formatNumber(displacements.extremes[view.result.replace("displacement_", "")])} {displacements.display_unit}
        </Text>
      )}
      {is_force && (
        <Text className="drawing-toolbar-label">
          {localGetCopy("max")} {formatNumber(forces.extremes[view.result].max)} · {localGetCopy("min")}{" "}
          {formatNumber(forces.extremes[view.result].min)} {forces.units[view.result]}
        </Text>
      )}
      {is_force && ["axial", "moment_y", "moment_z"].includes(view.result) && (
        <Text className="drawing-toolbar-hint">{localGetCopy(view.result === "axial" ? "axial_convention" : "moment_convention")}</Text>
      )}
    </div>
  );
}

export default ResultsToolbar;
