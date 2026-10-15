import { Box, Button, HStack, IconButton, Tooltip } from "@chakra-ui/react";
import { useState } from "react";
import { TbChevronUp, TbX } from "react-icons/tb";

function readIsOpen(storage_key, default_open) {
  try {
    let stored = window.localStorage.getItem(storage_key);
    return stored === null ? default_open : stored === "true";
  } catch (error) {
    return default_open;
  }
}

/**
 * Open state of a dock panel remembered in the browser
 * @param {string} storage_key
 * @param {boolean} [default_open]
 * @returns {[boolean, function(boolean): void]}
 */
function useStoredOpen(storage_key, default_open = false) {
  const [is_open, setIsOpen] = useState(() => readIsOpen(storage_key, default_open));
  const setOpen = (value) => {
    setIsOpen(value);
    try {
      window.localStorage.setItem(storage_key, String(value));
    } catch (error) {
      // Only a convenience, the panel starts with its default
    }
  };
  return [is_open, setOpen];
}

/**
 * Panel pinned in the dock at the bottom right of the view. Closed, it is a button with a summary of its content that opens it
 * @param {object} props
 * @param {string} props.className Extra class of the panel
 * @param {boolean} props.is_open
 * @param {function(): void} props.onOpen
 * @param {function(): void} props.onClose
 * @param {import("react").ReactNode} props.summary Content of the button of the closed panel
 * @param {import("react").ReactNode} props.header Left of the close button of the open panel
 * @param {string} props.close_label
 * @param {import("react").ReactNode} [props.toolbar] Under the header, it does not scroll with the body
 * @param {import("react").ReactNode} [props.footer]
 * @param {import("react").ReactNode} props.children Body of the open panel
 */
function DockPanel({ className, is_open, onOpen, onClose, summary, header, close_label, toolbar, footer, children }) {
  // The panels float over the renderer and the editor, which must not react to what happens on them
  const stop = (event) => event.stopPropagation();
  if (!is_open) {
    return (
      <div className={`dock-panel closed ${className}`} onClick={stop} onPointerDown={stop}>
        <Button size="xs" variant="ghost" onClick={onOpen} rightIcon={<TbChevronUp />}>
          <HStack spacing={1}>{summary}</HStack>
        </Button>
      </div>
    );
  }
  return (
    <div className={`dock-panel ${className}`} onClick={stop} onPointerDown={stop}>
      <HStack className="dock-panel-header" spacing={1}>
        {header}
        <Box flex="1" />
        <Tooltip label={close_label} placement="top" openDelay={300}>
          <IconButton className="small-ghost-button" variant="ghost" color="gray.600" aria-label={close_label} icon={<TbX />} onClick={onClose} />
        </Tooltip>
      </HStack>
      {toolbar && <div className="dock-panel-toolbar">{toolbar}</div>}
      <div className="dock-panel-body">{children}</div>
      {footer && <div className="dock-panel-footer">{footer}</div>}
    </div>
  );
}

const dockPanel = { DockPanel, useStoredOpen };
export default dockPanel;
