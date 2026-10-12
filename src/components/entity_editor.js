import { Button, ButtonGroup, HStack, IconButton, Input, Text, Tooltip } from "@chakra-ui/react";
import { useState } from "react";
import { TbLink, TbLinkOff, TbX } from "react-icons/tb";
import utils from "../utils";

const RESTRAINTS = [
  { code: "FFFFFF", copy: "fixed" },
  { code: "FFFFFR", copy: "pinned" },
];
// Plain names of the structural boxes, the box names are more technical (e.g. "Generic Support")
const TYPE_COPIES = {
  structuralNode: "nodes",
  structuralMember: "members",
  structuralPlate: "plates",
  structuralPointLoad: "point_loads",
  structuralMoment: "moments",
  structuralDistributedLoad: "distributed_loads",
  structuralGenericSupport: "supports",
  structuralFixedSupport: "supports",
  structuralPinSupport: "supports",
};
// Distance between the clicked element and the card
const CARD_OFFSET = 14;

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("drawing", copy_key);
}

function formatNumber(value) {
  let number = Number(value);
  return Number.isFinite(number) ? String(Number(number.toPrecision(10))) : String(value);
}

function isValidNumberText(text) {
  return String(text).trim() !== "" && Number.isFinite(Number(text));
}

/**
 * Number that is applied on Enter or when the input loses the focus, so the model is not evaluated on every keystroke
 */
function CommitNumberInput({ value, label, isDisabled, onCommit }) {
  const [draft, setDraft] = useState(null);
  function commit() {
    if (draft !== null && isValidNumberText(draft) && Number(draft) !== Number(value)) onCommit(Number(draft));
    setDraft(null);
  }
  return (
    <Input
      size="xs"
      className="entity-editor-input"
      inputMode="decimal"
      value={draft === null ? formatNumber(value) : draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          setDraft(null);
          // Blurring before the draft is cleared would apply it
          setTimeout(() => event.target.blur());
        }
        // The app uses Escape and Enter for its own shortcuts
        event.stopPropagation();
      }}
      isDisabled={isDisabled}
      autoComplete="off"
      aria-label={label}
    />
  );
}

function getTypeLabel(type) {
  return TYPE_COPIES[type] ? localGetCopy(TYPE_COPIES[type]) : utils.getDisplayCopy("nodes", type);
}

function getFieldLabel(field) {
  return field.label || localGetCopy(field.label_copy);
}

/**
 * Parameter box behind a field, and what else changes with it
 * @param {{field: import("../js/types").ParamEleDrawingEntityField, onDetach: Function, isDisabled: boolean}} props
 */
function FieldSource({ field, onDetach, isDisabled }) {
  let { source } = field;
  let label = getFieldLabel(field);
  if (!source.editable)
    return (
      <div className="entity-editor-source">
        <Text>
          <b>{label}</b> {localGetCopy("editor_computed")} <span className="entity-editor-param">{source.label}</span>
        </Text>
      </div>
    );
  let shared_count = source.shared_with.reduce((total, { count }) => total + count, 0);
  let shared_list = source.shared_with.map(({ type, count }) => `${count} × ${getTypeLabel(type)}`).join(", ");
  return (
    <div className={`entity-editor-source${shared_count > 0 ? " shared" : ""}`}>
      <HStack spacing={1}>
        {shared_count > 0 ? <TbLink className="entity-editor-source-icon" /> : null}
        <Text flex="1">
          <b>{label}</b> ← <span className="entity-editor-param">{source.label}</span>
          {shared_count === 0 && <span className="entity-editor-muted"> {localGetCopy("editor_not_shared")}</span>}
        </Text>
        {shared_count > 0 && (
          <Tooltip label={localGetCopy("editor_detach_tooltip")} placement="top" openDelay={300}>
            <Button size="xs" variant="link" colorScheme="blue" leftIcon={<TbLinkOff />} onClick={onDetach} isDisabled={isDisabled}>
              {localGetCopy("editor_detach")}
            </Button>
          </Tooltip>
        )}
      </HStack>
      {shared_count > 0 && (
        <Text className="entity-editor-shared">
          {localGetCopy("editor_shared")} {shared_list}
        </Text>
      )}
    </div>
  );
}

/**
 * Card next to an element clicked in the renderer, to change its inputs in place
 * @param {object} props
 * @param {import("../js/types").ParamEleDrawingEntity} props.entity
 * @param {{x: number, y: number}} props.position Pixels of the clicked element in the renderer
 * @param {{width: number, height: number}} props.container_size Size of the renderer
 * @param {boolean} props.model_locked
 * @param {function(string, number|string): void} props.onChange
 * @param {function(string): void} props.onDetach
 * @param {Function} props.onClose
 */
function EntityEditor({ entity, position, container_size, model_locked, onChange, onDetach, onClose }) {
  let title = `${getTypeLabel(entity.type)} ${entity.element_id ?? ""}`;
  // The card opens towards the side of the renderer with more room
  let is_right = position.x > container_size.width / 2;
  let is_bottom = position.y > container_size.height / 2;
  let style = {
    left: position.x + (is_right ? -CARD_OFFSET : CARD_OFFSET),
    top: position.y + (is_bottom ? -CARD_OFFSET : CARD_OFFSET),
    transform: `translate(${is_right ? "-100%" : "0"}, ${is_bottom ? "-100%" : "0"})`,
  };
  let linked_fields = entity.fields.filter(({ source }) => source);
  let unlinked_labels = entity.fields.filter(({ source }) => !source).map(getFieldLabel);
  return (
    <div className="entity-editor" style={style} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <HStack className="entity-editor-header" spacing={1}>
        <Text flex="1" noOfLines={1}>
          {title}
        </Text>
        <IconButton className="small-ghost-button" variant="ghost" aria-label={localGetCopy("editor_close")} icon={<TbX />} onClick={onClose} />
      </HStack>
      <div className="entity-editor-body">
        {entity.fields.length === 0 && <Text className="entity-editor-muted">{localGetCopy("editor_no_fields")}</Text>}
        <HStack spacing={2} className="entity-editor-values">
          {entity.fields.map((field) => {
            let label = getFieldLabel(field);
            let is_disabled = model_locked || (field.source && !field.source.editable);
            if (field.kind === "restraint")
              return (
                <HStack key={field.key} spacing={1} flex="1">
                  <Text className="entity-editor-label">{label}</Text>
                  <ButtonGroup size="xs" isAttached variant="outline" flex="1">
                    {RESTRAINTS.map(({ code, copy }) => (
                      <Button
                        key={code}
                        flex="1"
                        aria-pressed={field.value === code}
                        bg={field.value === code ? "blue.50" : "white"}
                        color={field.value === code ? "blue.600" : "gray.700"}
                        isDisabled={is_disabled}
                        onClick={() => field.value !== code && onChange(field.key, code)}
                      >
                        {localGetCopy(copy)}
                      </Button>
                    ))}
                  </ButtonGroup>
                </HStack>
              );
            return (
              <HStack key={field.key} spacing={1} flex="1" minWidth={0}>
                <Text className="entity-editor-label">{label}</Text>
                <CommitNumberInput value={field.value} label={label} isDisabled={is_disabled} onCommit={(value) => onChange(field.key, value)} />
              </HStack>
            );
          })}
        </HStack>
        {linked_fields.map((field) => (
          <FieldSource key={field.key} field={field} onDetach={() => onDetach(field.key)} isDisabled={model_locked} />
        ))}
        {unlinked_labels.length > 0 && (
          <Text className="entity-editor-muted">
            <b>{unlinked_labels.join(", ")}</b> {localGetCopy(unlinked_labels.length === 1 ? "editor_unlinked_one" : "editor_unlinked_many")}
          </Text>
        )}
      </div>
    </div>
  );
}

export default EntityEditor;
