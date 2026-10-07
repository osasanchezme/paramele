import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputLeftElement,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Slider,
  SliderFilledTrack,
  SliderThumb,
  SliderTrack,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { MdDragIndicator, MdRemove, MdSearch, MdSettings, MdStar } from "react-icons/md";
import throttle from "lodash/throttle";
import utils from "../utils";
import state from "../state";
import favorites from "../js/favorites";
import { FavoritesContext } from "../Context";

const POSITION_STORAGE_KEY = "paramele.parameters_panel.position";
const MINIMIZED_STORAGE_KEY = "paramele.parameters_panel.minimized";
const DRAG_THRESHOLD = 4;
// Evaluating the model on every slider tick is too slow on large models
const SLIDER_COMMIT_INTERVAL = 150;
const STATUS_BAR_HEIGHT = 25;
const NAV_BAR_HEIGHT = 50;

function localGetCopy(copy_key) {
  return utils.getDisplayCopy("parameters_panel", copy_key);
}

function readStoredItem(key) {
  try {
    return JSON.parse(window.localStorage.getItem(key));
  } catch (error) {
    return null;
  }
}

function storeItem(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {}
}

// Keeps the panel inside the window when it shrinks or the panel was dragged too far
function clampPosition({ left, bottom }, panel_width, panel_height) {
  let max_left = Math.max(0, window.innerWidth - panel_width);
  let max_bottom = Math.max(STATUS_BAR_HEIGHT, window.innerHeight - NAV_BAR_HEIGHT - panel_height);
  return { left: Math.min(Math.max(0, left), max_left), bottom: Math.min(Math.max(STATUS_BAR_HEIGHT, bottom), max_bottom) };
}

function formatNumber(value) {
  let number = Number(value);
  if (!Number.isFinite(number)) return "";
  return String(Number(number.toPrecision(10)));
}

function isValidNumberText(text) {
  return text.trim() !== "" && Number.isFinite(Number(text));
}

/**
 * Floating panel with the favorite parameters of the current model, to change them without looking for their nodes.
 * It can be minimized into a small pill that stays where the panel was.
 * @param {object} props
 * @param {boolean} props.visible
 * @param {import("../js/types").ParamEleFavoriteParameter[]} props.favorite_list Favorites stored in the current model
 * @param {object[]} props.nodes ReactFlow nodes of the current model
 * @param {boolean} props.model_locked
 * @param {boolean} props.is_compact On compact screens the panel is docked at the bottom and cannot be dragged
 * @param {string} props.default_left CSS left of the panel until the user drags it
 */
function ParametersPanel({ visible, favorite_list, nodes, model_locked, is_compact, default_left }) {
  const [position, setPosition] = useState(() => readStoredItem(POSITION_STORAGE_KEY));
  const [is_minimized, setIsMinimized] = useState(() => readStoredItem(MINIMIZED_STORAGE_KEY) === true);
  const [rendered_size, setRenderedSize] = useState(null);
  const panel_ref = useRef(null);
  const drag_ref = useRef(null);
  // The panel is kept inside the window with its rendered size, e.g. when the pill expands near an edge.
  // Only the rendered position moves, so the pill goes back to where the user left it when minimized again
  useLayoutEffect(() => {
    if (!visible || !panel_ref.current) return;
    let { width, height } = panel_ref.current.getBoundingClientRect();
    if (!rendered_size || rendered_size.width !== width || rendered_size.height !== height) setRenderedSize({ width, height });
  });
  if (!visible) return null;

  const rows = favorites.getFavoritesWithNodes(favorite_list, nodes);

  function setMinimized(minimized) {
    setIsMinimized(minimized);
    storeItem(MINIMIZED_STORAGE_KEY, minimized);
  }
  function handlePointerDown(event) {
    if (event.button !== 0 || (event.target.closest("button") && !event.target.closest(".parameters-panel-pill"))) return;
    let rect = panel_ref.current.getBoundingClientRect();
    drag_ref.current = {
      start_x: event.clientX,
      start_y: event.clientY,
      start_left: rect.left,
      start_bottom: window.innerHeight - rect.bottom,
      width: rect.width,
      height: rect.height,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handlePointerMove(event) {
    let drag = drag_ref.current;
    if (!drag || is_compact) return;
    let delta_x = event.clientX - drag.start_x;
    let delta_y = event.clientY - drag.start_y;
    // A few pixels of jitter still count as a click on the pill
    if (!drag.moved && Math.hypot(delta_x, delta_y) < DRAG_THRESHOLD) return;
    drag.moved = true;
    setPosition(clampPosition({ left: drag.start_left + delta_x, bottom: drag.start_bottom - delta_y }, drag.width, drag.height));
  }
  function handlePointerUp(event) {
    let drag = drag_ref.current;
    if (!drag) return;
    drag_ref.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      if (position) storeItem(POSITION_STORAGE_KEY, position);
    } else if (is_minimized) {
      setMinimized(false);
    }
  }
  const drag_handlers = { onPointerDown: handlePointerDown, onPointerMove: handlePointerMove, onPointerUp: handlePointerUp };

  let style;
  if (!is_compact) {
    style = position
      ? clampPosition(position, rendered_size?.width || 0, rendered_size?.height || 0)
      : { left: default_left, bottom: STATUS_BAR_HEIGHT + 12 };
  }
  if (is_minimized) {
    return (
      <div ref={panel_ref} className={`parameters-panel minimized${is_compact ? " compact" : ""}`} style={style}>
        <Tooltip className="clear-tooltip" label={localGetCopy("expand")} openDelay={400}>
          <button
            type="button"
            className={`parameters-panel-pill${is_compact ? "" : " draggable"}`}
            aria-label={localGetCopy("expand")}
            // Keyboard users expand it with Enter or Space; pointer clicks are handled with the drag
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setMinimized(false);
              }
              event.stopPropagation();
            }}
            {...drag_handlers}
          >
            <MdStar className="parameters-panel-pill-star" />
            <span>{localGetCopy("pill_label")}</span>
            <span className="parameters-panel-count">{rows.length}</span>
          </button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div ref={panel_ref} className={`parameters-panel${is_compact ? " compact" : ""}`} style={style}>
      <div className={`parameters-panel-header${is_compact ? "" : " draggable"}`} {...drag_handlers}>
        <HStack spacing={1}>
          {!is_compact && <MdDragIndicator className="parameters-panel-drag-icon" />}
          <Text flex="1" noOfLines={1}>
            {localGetCopy("title")}
          </Text>
          <Text className="parameters-panel-count">{rows.length}</Text>
          <Tooltip className="clear-tooltip" label={localGetCopy("minimize")}>
            <IconButton
              className="small-ghost-button"
              variant="ghost"
              aria-label={localGetCopy("minimize")}
              icon={<MdRemove />}
              onClick={() => setMinimized(true)}
            />
          </Tooltip>
        </HStack>
      </div>
      <div className="parameters-panel-body">
        <ParameterSearch favorite_list={favorite_list} nodes={nodes} />
        {rows.length === 0 ? (
          <Text className="parameters-panel-empty">{localGetCopy("empty")}</Text>
        ) : (
          <VStack spacing={0} align="stretch" className="parameters-panel-list">
            {rows.map(({ favorite, node, kind }) => (
              <FavoriteRow key={favorite.node_id} favorite={favorite} node={node} kind={kind} model_locked={model_locked} />
            ))}
          </VStack>
        )}
      </div>
    </div>
  );
}

function ParameterSearch({ favorite_list, nodes }) {
  const { toggleFavorite } = useContext(FavoritesContext);
  const [query, setQuery] = useState("");
  const [is_open, setIsOpen] = useState(false);
  const candidates = favorites.getFavoriteCandidates(favorite_list, nodes);
  const normalized_query = query.trim().toLowerCase();
  const matches = candidates.filter((node) => {
    if (normalized_query === "") return true;
    let searchable = `${favorites.getNodeLabel(node)} ${node.id} ${utils.getDisplayCopy("nodes", node.type)}`.toLowerCase();
    return searchable.includes(normalized_query);
  });
  function addFavorite(node) {
    toggleFavorite(node.id);
    setQuery("");
  }
  function handleKeyDown(event) {
    if (event.key === "Enter" && matches.length > 0) addFavorite(matches[0]);
    if (event.key === "Escape") event.currentTarget.blur();
    // The app uses Escape and Enter for its own shortcuts
    event.stopPropagation();
  }
  return (
    <Box className="parameters-search">
      <InputGroup size="xs">
        <InputLeftElement pointerEvents="none">
          <MdSearch />
        </InputLeftElement>
        <Input
          placeholder={localGetCopy("search_placeholder")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setIsOpen(false)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
      </InputGroup>
      {is_open && (
        <div className="parameters-search-results" role="listbox">
          {matches.length === 0 ? (
            <Text className="parameters-search-empty">{localGetCopy(candidates.length === 0 ? "no_candidates" : "no_matches")}</Text>
          ) : (
            matches.map((node) => {
              let { data_key } = favorites.getFavoritableParameter(node.type);
              return (
                <div
                  key={node.id}
                  role="option"
                  aria-selected={false}
                  className="parameters-search-result"
                  // Keeps the focus in the input, which would otherwise close the list before the click lands
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => addFavorite(node)}
                >
                  <Text flex="1" noOfLines={1}>
                    {favorites.getNodeLabel(node)}
                  </Text>
                  <Text className="parameters-search-value" noOfLines={1}>
                    {node.data[data_key] === undefined ? "" : String(node.data[data_key])}
                  </Text>
                </div>
              );
            })
          )}
        </div>
      )}
    </Box>
  );
}

/**
 * @param {object} props
 * @param {import("../js/types").ParamEleFavoriteParameter} props.favorite
 * @param {object} props.node
 * @param {import("../js/types").ParamEleFavoriteKind} props.kind
 * @param {boolean} props.model_locked
 */
function FavoriteRow({ favorite, node, kind, model_locked }) {
  const { toggleFavorite } = useContext(FavoritesContext);
  const { node_id, data_key } = favorite;
  const value = node.data[data_key];
  const label = favorites.getNodeLabel(node);
  return (
    <div className="parameters-panel-row">
      <HStack spacing={1}>
        <Tooltip className="clear-tooltip" label={localGetCopy("go_to_node")} openDelay={400}>
          <Text
            className="parameters-panel-label"
            noOfLines={1}
            onClick={() => state.zoomToCoordinate(Number(node.position.x), Number(node.position.y))}
          >
            {label}
          </Text>
        </Tooltip>
        {kind === "number" && <RangeSettings favorite={favorite} />}
        <Tooltip className="clear-tooltip" label={utils.getDisplayCopy("tooltips", "remove_favorite")}>
          <IconButton
            className="small-ghost-button favorite-toggle active"
            variant="ghost"
            aria-label={utils.getDisplayCopy("tooltips", "remove_favorite")}
            icon={<MdStar />}
            onClick={() => toggleFavorite(node_id)}
          />
        </Tooltip>
      </HStack>
      {kind === "string" ? (
        <Input
          size="xs"
          value={value === undefined ? "" : value}
          onChange={(event) => favorites.setParameterValue(node_id, data_key, event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
          isDisabled={model_locked}
          autoComplete="off"
          aria-label={label}
        />
      ) : (
        <NumberControl favorite={favorite} node={node} kind={kind} value={value} label={label} model_locked={model_locked} />
      )}
    </div>
  );
}

function NumberControl({ favorite, node, kind, value, label, model_locked }) {
  const { node_id, data_key } = favorite;
  const [slider_draft, setSliderDraft] = useState(null);
  const [text_draft, setTextDraft] = useState(null);
  const commitValue = useMemo(
    () => throttle((new_value) => favorites.setParameterValue(node_id, data_key, new_value), SLIDER_COMMIT_INTERVAL, { leading: true }),
    [node_id, data_key]
  );
  useEffect(() => () => commitValue.cancel(), [commitValue]);

  let min, max, step;
  if (kind === "range") {
    // A variableRange node is limited by its own start, end and step
    min = Number(node.data["start-value"]) || 0;
    max = Number(node.data["end-value"]) || 1;
    step = Number(node.data["step-value"]) || 0.1;
  } else {
    ({ min, max, step } = { ...favorites.getDefaultRange(value), ...favorite });
  }
  let number_value = value === undefined ? (kind === "range" ? Math.floor((min + max) / 2 / step) * step : 0) : Number(value);
  let slider_value = slider_draft === null ? Math.min(Math.max(number_value, min), max) : slider_draft;
  // The node that sliders_all iterates takes every value of its range, so a single value cannot be picked
  let is_iterating = kind === "range" && node.data.iterating;

  function handleSliderChange(new_value) {
    setSliderDraft(new_value);
    commitValue(new_value);
  }
  function handleSliderChangeEnd(new_value) {
    commitValue.cancel();
    favorites.setParameterValue(node_id, data_key, new_value);
    setSliderDraft(null);
  }
  function handleTextChange(event) {
    let text = event.target.value;
    setTextDraft(text);
    if (isValidNumberText(text)) favorites.setParameterValue(node_id, data_key, Number(text));
  }
  function handleTextBlur() {
    if (text_draft !== null && isValidNumberText(text_draft) && kind === "number") {
      // Typing a value outside the slider limits widens them
      let typed_value = Number(text_draft);
      if (typed_value < min || typed_value > max)
        favorites.updateFavoriteRange(node_id, { min: Math.min(min, typed_value), max: Math.max(max, typed_value) });
    }
    setTextDraft(null);
  }
  function handleTextKeyDown(event) {
    if (event.key === "Enter" || event.key === "Escape") event.currentTarget.blur();
    event.stopPropagation();
  }
  let is_disabled = model_locked || is_iterating;
  return (
    <>
      <HStack spacing={3}>
        <Slider
          flex="1"
          size="sm"
          colorScheme="blue"
          min={min}
          max={max}
          step={step}
          value={slider_value}
          onChange={handleSliderChange}
          onChangeEnd={handleSliderChangeEnd}
          isDisabled={is_disabled}
          focusThumbOnChange={false}
          aria-label={label}
        >
          <SliderTrack>
            <SliderFilledTrack />
          </SliderTrack>
          <SliderThumb boxSize={3} />
        </Slider>
        <Input
          className="parameters-panel-number"
          size="xs"
          inputMode="decimal"
          value={text_draft === null ? formatNumber(slider_draft === null ? number_value : slider_draft) : text_draft}
          onChange={handleTextChange}
          onBlur={handleTextBlur}
          onKeyDown={handleTextKeyDown}
          isDisabled={is_disabled}
          autoComplete="off"
          aria-label={label}
        />
      </HStack>
      {is_iterating && <Text className="parameters-panel-note">{localGetCopy("iterating")}</Text>}
    </>
  );
}

function RangeSettings({ favorite }) {
  const { min, max, step } = favorite;
  const fields = { min, max, step };
  function isValidField(field_key, number) {
    if (field_key === "step") return number > 0;
    if (field_key === "min") return number < max;
    return number > min;
  }
  function commitField(field_key, input) {
    let number = Number(input.value);
    if (isValidNumberText(input.value) && isValidField(field_key, number)) {
      favorites.updateFavoriteRange(favorite.node_id, { [field_key]: number });
    } else {
      // Invalid entries are discarded
      input.value = formatNumber(fields[field_key]);
    }
  }
  return (
    // Fixed, because the panel itself is fixed: the popover is positioned and kept inside the viewport, not the page
    <Popover placement="top-end" strategy="fixed" isLazy>
      <Tooltip className="clear-tooltip" label={localGetCopy("slider_limits")}>
        <Box display="inline-flex">
          <PopoverTrigger>
            <IconButton className="small-ghost-button" variant="ghost" aria-label={localGetCopy("slider_limits")} icon={<MdSettings />} />
          </PopoverTrigger>
        </Box>
      </Tooltip>
      <Portal>
        {/* The theme puts popovers at z-index 10, under the panel (11) */}
        <PopoverContent width="200px" className="parameters-range-popover" rootProps={{ zIndex: "popover" }}>
          <PopoverArrow />
          <PopoverBody>
            <VStack spacing={1} align="stretch">
              {Object.entries(fields).map(([field_key, field_value]) => (
                <HStack key={field_key} spacing={2}>
                  <Text fontSize="xs" width="50px">
                    {localGetCopy(field_key)}
                  </Text>
                  <Input
                    size="xs"
                    inputMode="decimal"
                    // Remounts when the stored value changes
                    key={`${field_key}-${field_value}`}
                    defaultValue={formatNumber(field_value)}
                    onBlur={(event) => commitField(field_key, event.target)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                      event.stopPropagation();
                    }}
                    autoComplete="off"
                    aria-label={localGetCopy(field_key)}
                  />
                </HStack>
              ))}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

export default ParametersPanel;
