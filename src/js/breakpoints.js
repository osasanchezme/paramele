/**
 * Below this width the editor and the renderer are not split anymore, only one of them is shown at a time
 * and the properties panel floats over them
 */
const COMPACT_LAYOUT_QUERY = "(max-width: 767px)";

/**
 * Below this width the top bar menus do not fit, so they are collapsed into a single menu
 */
const COMPACT_NAV_BAR_QUERY = "(max-width: 1279px)";

function isCompactLayout() {
  return window.matchMedia(COMPACT_LAYOUT_QUERY).matches;
}

/**
 * Calls back whenever the compact layout turns on or off
 * @param {(is_compact: boolean) => void} callback
 * @returns {() => void} Unsubscribe function
 */
function onCompactLayoutChange(callback) {
  const media_query = window.matchMedia(COMPACT_LAYOUT_QUERY);
  const listener = (event) => callback(event.matches);
  media_query.addEventListener("change", listener);
  return () => media_query.removeEventListener("change", listener);
}

export { COMPACT_LAYOUT_QUERY, COMPACT_NAV_BAR_QUERY, isCompactLayout, onCompactLayoutChange };
