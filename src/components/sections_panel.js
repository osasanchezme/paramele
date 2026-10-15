import { Box, Button, HStack, IconButton, Input, Text, Tooltip } from "@chakra-ui/react";
import { useState } from "react";
import { TbPaint, TbPlus, TbSchema } from "react-icons/tb";
import drawing from "../js/drawing";
import modelLinks from "../js/modelLinks";
import sectionsLibrary from "../js/sectionsLibrary";
import utils from "../utils";
import dockPanel from "./dock_panel";
import { CommitNumberInput } from "./entity_editor";
import sectionPicker from "./section_picker";

const STORAGE_KEY = "paramele_sections_panel_open";
// Swatches shown on the closed panel
const MAX_SWATCHES = 8;
// How the units of the model are written
const UNIT_LABELS = { mpa: "MPa", kpa: "kPa", gpa: "GPa", "kg/m3": "kg/m³", psi: "psi", ksi: "ksi", "lb/ft3": "lb/ft³" };

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("sections", copy_key);
}

function getUnitLabel(unit) {
  return UNIT_LABELS[unit] || unit || "";
}

function formatNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(6))) : String(value);
}

function SmallIconButton({ label, icon, onClick, isDisabled, is_active }) {
  return (
    <Tooltip label={label} placement="top" openDelay={300}>
      <IconButton
        className="small-ghost-button"
        variant="ghost"
        aria-label={label}
        aria-pressed={is_active}
        color={is_active ? "brand.600" : "gray.600"}
        bg={is_active ? "brand.50" : undefined}
        icon={icon}
        onClick={(event) => {
          event.stopPropagation();
          onClick();
        }}
        isDisabled={isDisabled}
      />
    </Tooltip>
  );
}

/**
 * Name of a box, changed when the input loses the focus
 */
function NameInput({ node_id, label, isDisabled }) {
  const [draft, setDraft] = useState(null);
  return (
    <Input
      size="xs"
      value={draft === null ? label : draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== null && draft.trim() && draft !== label) sectionsLibrary.renameBox(node_id, draft);
        setDraft(null);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") setDraft(null);
        event.stopPropagation();
      }}
      isDisabled={isDisabled}
      aria-label={localGetCopy("name")}
      autoComplete="off"
    />
  );
}

/**
 * Inputs of a section or material box, through their parameter boxes as in the card of the renderer
 * @param {{node_id: string, units: Object<string, string>, isDisabled: boolean}} props
 */
function BoxFields({ node_id, units, isDisabled }) {
  let entity = drawing.getEntity(node_id);
  if (!entity) return null;
  return (
    <HStack spacing={2} rowGap={1.5} flexWrap="wrap">
      {entity.fields.map((field) => {
        let label = field.label || localGetCopy(field.label_copy);
        let unit = units[field.key];
        let is_computed = field.source && !field.source.editable;
        let shared_count = field.source ? field.source.shared_with.reduce((total, { count }) => total + count, 0) : 0;
        let hint = is_computed
          ? `${localGetCopy("computed_in")} ${field.source.label}`
          : shared_count > 0
          ? localGetCopy("shared_parameter").replace("{box}", field.source.label).replace("{count}", shared_count)
          : null;
        return (
          <Tooltip key={field.key} label={hint} isDisabled={!hint} placement="top" openDelay={300}>
            <HStack spacing={1} flex="1" minWidth="90px">
              <Text className={`library-label${shared_count > 0 ? " shared" : ""}`}>{label}</Text>
              <CommitNumberInput
                value={field.value}
                label={label}
                isDisabled={isDisabled || is_computed}
                onCommit={(value) => drawing.updateEntityField(node_id, field.key, value)}
              />
              {unit && <Text className="library-muted">{unit}</Text>}
            </HStack>
          </Tooltip>
        );
      })}
    </HStack>
  );
}

function SectionRow({ section, is_expanded, is_highlighted, is_painting, onToggle, onPaint, model_locked }) {
  const units = { base: "", height: "", diameter: "" };
  const section_unit = getUnitLabel(sectionsLibrary.getUnits().section_length);
  Object.keys(units).forEach((key) => (units[key] = section_unit));
  const count = section.member_ids.length;
  return (
    <div className={`library-row${is_highlighted ? " highlighted" : ""}`}>
      <HStack spacing={1.5} className="library-row-header" onClick={onToggle} role="button" aria-expanded={is_expanded}>
        <sectionPicker.Swatch color={section.color} size={12} />
        <Box flex="1" minWidth={0}>
          <Text noOfLines={1} fontWeight={600}>
            {section.label}
          </Text>
          <Text noOfLines={1} className="library-muted">
            {[section.description, section.material?.label].filter(Boolean).join(" · ")}
          </Text>
        </Box>
        <Tooltip label={localGetCopy(count === 1 ? "one_member" : "members_count").replace("{count}", count)} placement="top" openDelay={300}>
          <Text className="library-count">{count}</Text>
        </Tooltip>
        {section.editable && (
          <SmallIconButton
            label={localGetCopy("paint_section")}
            icon={<TbPaint />}
            onClick={onPaint}
            isDisabled={model_locked}
            is_active={is_painting}
          />
        )}
      </HStack>
      {is_expanded && (
        <div className="library-row-body">
          {section.editable ? (
            <>
              <HStack spacing={1}>
                <NameInput node_id={section.node_id} label={section.label} isDisabled={model_locked} />
                <SmallIconButton label={localGetCopy("show_box")} icon={<TbSchema />} onClick={() => modelLinks.focusBox(section.node_id)} />
              </HStack>
              <BoxFields node_id={section.node_id} units={units} isDisabled={model_locked} />
              <HStack spacing={1}>
                <Text className="library-label">{localGetCopy("material")}</Text>
                <sectionPicker.LibraryPicker
                  kind="material"
                  value={section.material?.node_id || null}
                  onChange={(value) => drawing.linkBoxes([section.node_id], "material", value)}
                  onCreate={(spec) => sectionsLibrary.createMaterial(spec, [section.node_id])}
                  isDisabled={model_locked}
                />
              </HStack>
            </>
          ) : (
            <HStack spacing={1}>
              <Text flex="1" className="library-muted">
                {localGetCopy(section.is_default ? "default_section_help" : "group_section_help")}
              </Text>
              {section.node_id && (
                <SmallIconButton label={localGetCopy("show_box")} icon={<TbSchema />} onClick={() => modelLinks.focusBox(section.node_id)} />
              )}
            </HStack>
          )}
        </div>
      )}
    </div>
  );
}

function MaterialRow({ material, is_expanded, is_highlighted, is_painting, onToggle, onPaint, model_locked }) {
  const model_units = sectionsLibrary.getUnits();
  const units = { elasticity_modulus: getUnitLabel(model_units.material_strength), poissons_ratio: "", density: getUnitLabel(model_units.density) };
  const elasticity = material.fields.find(({ key }) => key === "elasticity_modulus");
  const uses = [
    material.section_node_ids.length > 0 &&
      localGetCopy(material.section_node_ids.length === 1 ? "one_section" : "sections_count").replace("{count}", material.section_node_ids.length),
    material.plate_ids.length > 0 &&
      localGetCopy(material.plate_ids.length === 1 ? "one_plate" : "plates_count").replace("{count}", material.plate_ids.length),
  ].filter(Boolean);
  return (
    <div className={`library-row${is_highlighted ? " highlighted" : ""}`}>
      <HStack spacing={1.5} className="library-row-header" onClick={onToggle} role="button" aria-expanded={is_expanded}>
        <Box flex="1" minWidth={0}>
          <Text noOfLines={1} fontWeight={600}>
            {material.label}
          </Text>
          <Text noOfLines={1} className="library-muted">
            {[elasticity && `E = ${formatNumber(elasticity.value)} ${units.elasticity_modulus}`, ...uses].filter(Boolean).join(" · ")}
          </Text>
        </Box>
        <SmallIconButton
          label={localGetCopy("paint_material")}
          icon={<TbPaint />}
          onClick={onPaint}
          isDisabled={model_locked}
          is_active={is_painting}
        />
      </HStack>
      {is_expanded && (
        <div className="library-row-body">
          <HStack spacing={1}>
            <NameInput node_id={material.node_id} label={material.label} isDisabled={model_locked} />
            <SmallIconButton label={localGetCopy("show_box")} icon={<TbSchema />} onClick={() => modelLinks.focusBox(material.node_id)} />
          </HStack>
          <BoxFields node_id={material.node_id} units={units} isDisabled={model_locked} />
        </div>
      )}
    </div>
  );
}

/**
 * Sections and materials of the model in the renderer: the legend of the member colors, and where they are edited, created and
 * picked to paint them on the elements
 * @param {object} props
 * @param {boolean} props.model_locked
 * @param {import("../js/types").ParamEleDrawingState} props.drawing_state
 * @param {function(Partial<import("../js/types").ParamEleDrawingState>): void} props.setDrawingState
 * @param {{kind: "section"|"material", key: string}|null} props.highlighted
 * @param {function({kind: "section"|"material", key: string}|null): void} props.onHighlight
 */
function SectionsPanel({ model_locked, drawing_state, setDrawingState, highlighted, onHighlight }) {
  const library = sectionPicker.useLibrary();
  const [is_open, setIsOpen] = dockPanel.useStoredOpen(STORAGE_KEY);
  const [tab, setTab] = useState("sections");
  const [expanded, setExpanded] = useState(null);
  const [is_creating, setIsCreating] = useState(false);

  const open = (value) => {
    setIsOpen(value);
    if (!value) onHighlight(null);
  };
  const toggle = (kind, key) => {
    // The highlight may have been cleared from the renderer (Escape, a click on nothing), then the open row shows it again
    if (expanded === key && highlighted?.key !== key) return onHighlight({ kind, key });
    let is_expanding = expanded !== key;
    setExpanded(is_expanding ? key : null);
    onHighlight(is_expanding ? { kind, key } : null);
  };
  const paint = (mode, node_id) => {
    let active_key = mode === "section" ? "active_section" : "active_material";
    setDrawingState({ tool: "assign", assign_mode: mode, [active_key]: node_id });
  };
  const isPainting = (mode, node_id) =>
    drawing_state.tool === "assign" &&
    drawing_state.assign_mode === mode &&
    drawing_state[mode === "section" ? "active_section" : "active_material"] === node_id;
  const create = (spec) => {
    let node_id = tab === "sections" ? sectionsLibrary.createSection(spec) : sectionsLibrary.createMaterial(spec);
    setIsCreating(false);
    setExpanded(node_id);
    return node_id;
  };

  const swatches = library.sections.filter(({ member_ids }) => member_ids.length > 0).slice(0, MAX_SWATCHES);
  const summary = (
    <>
      <Text>{localGetCopy("panel_title")}</Text>
      {swatches.map(({ key, color }) => (
        <sectionPicker.Swatch key={key} color={color} />
      ))}
    </>
  );
  const header = ["sections", "materials"].map((tab_key) => (
    <Button
      key={tab_key}
      size="xs"
      variant="ghost"
      aria-pressed={tab === tab_key}
      color={tab === tab_key ? "brand.600" : "gray.600"}
      bg={tab === tab_key ? "brand.50" : undefined}
      onClick={() => {
        setTab(tab_key);
        setExpanded(null);
        setIsCreating(false);
        onHighlight(null);
      }}
    >
      {localGetCopy(tab_key)} ({tab_key === "sections" ? library.sections.filter(({ editable }) => editable).length : library.materials.length})
    </Button>
  ));
  const footer = is_creating ? (
    tab === "sections" ? (
      <sectionPicker.NewSectionForm materials={library.materials} onCreate={create} onCancel={() => setIsCreating(false)} />
    ) : (
      <sectionPicker.NewMaterialForm onCreate={create} onCancel={() => setIsCreating(false)} />
    )
  ) : (
    <Button size="xs" variant="ghost" colorScheme="brand" leftIcon={<TbPlus />} onClick={() => setIsCreating(true)} isDisabled={model_locked}>
      {localGetCopy(tab === "sections" ? "new_section" : "new_material")}
    </Button>
  );
  const items = tab === "sections" ? library.sections : library.materials;
  return (
    <dockPanel.DockPanel
      className="sections-panel"
      is_open={is_open}
      onOpen={() => open(true)}
      onClose={() => open(false)}
      summary={summary}
      header={header}
      close_label={localGetCopy("close_panel")}
      footer={footer}
    >
      {items.length === 0 && <Text className="library-muted library-note">{localGetCopy(tab === "sections" ? "no_sections" : "no_materials")}</Text>}
      {tab === "sections"
        ? library.sections.map((section) => (
            <SectionRow
              key={section.key}
              section={section}
              is_expanded={expanded === section.key}
              is_highlighted={highlighted?.kind === "section" && highlighted.key === section.key}
              is_painting={isPainting("section", section.node_id)}
              onToggle={() => toggle("section", section.key)}
              onPaint={() => paint("section", section.node_id)}
              model_locked={model_locked}
            />
          ))
        : library.materials.map((material) => (
            <MaterialRow
              key={material.key}
              material={material}
              is_expanded={expanded === material.key}
              is_highlighted={highlighted?.kind === "material" && highlighted.key === material.key}
              is_painting={isPainting("material", material.node_id)}
              onToggle={() => toggle("material", material.key)}
              onPaint={() => paint("material", material.node_id)}
              model_locked={model_locked}
            />
          ))}
    </dockPanel.DockPanel>
  );
}

export default SectionsPanel;
