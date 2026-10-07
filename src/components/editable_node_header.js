import React, { useState, useRef, useEffect, useContext } from "react";
import { HStack, Text, IconButton, Input, Tooltip, Kbd, Box, Icon } from "@chakra-ui/react";
import { MdCheck, MdClose, MdEdit, MdStar, MdStarBorder } from "react-icons/md";
import state from "../state";
import utils from "../utils";
import favorites from "../js/favorites";
import { FavoritesContext } from "../Context";

function EditableNodeHeader({ node_label, id, identifier_icon, node_type }) {
  const { favorite_node_ids, toggleFavorite } = useContext(FavoritesContext);
  const [edit_visible, setEditVisible] = useState(false);
  const [is_editing, setIsEditing] = useState(false);
  const label_input_ref = useRef(null);
  function handleMouseOver(e) {
    setEditVisible(true);
  }
  function handleMouseLeave(e) {
    setEditVisible(false);
  }
  function handleClickOnEdit(e) {
    setIsEditing(true);
  }
  function handleClickOnSave(e) {
    let custom_label = label_input_ref.current.value;
    state.updateNodeData(id, { custom_label });
    setIsEditing(false);
  }
  function handleClickOnCancel(e) {
    setIsEditing(false);
  }
  function handleKeyUp(e) {
    let last_key = e.key;
    if (last_key === "Enter") {
      handleClickOnSave();
    } else if (last_key === "Escape") {
      handleClickOnCancel();
    }
  }
  useEffect(() => {
    if (is_editing) label_input_ref.current.focus();
  });
  let edit_button =
    edit_visible && !is_editing ? (
      <Tooltip className="clear-tooltip" label={utils.getDisplayCopy("tooltips", "edit")}>
        <IconButton className="node-label-edit-button" onClick={handleClickOnEdit} variant="ghost" aria-label="Edit Node Label" icon={<MdEdit />} />
      </Tooltip>
    ) : (
      ""
    );
  // The star shows on hover, and stays visible once the parameter is a favorite
  let is_favorite = favorite_node_ids.has(id);
  let favorite_button =
    favorites.getFavoritableParameter(node_type) && !is_editing && (edit_visible || is_favorite) ? (
      <Tooltip className="clear-tooltip" label={utils.getDisplayCopy("tooltips", is_favorite ? "remove_favorite" : "add_favorite")}>
        <IconButton
          className={`node-label-edit-button node-favorite-button${is_favorite ? " active" : ""}`}
          onClick={() => toggleFavorite(id)}
          variant="ghost"
          aria-label={utils.getDisplayCopy("tooltips", is_favorite ? "remove_favorite" : "add_favorite")}
          aria-pressed={is_favorite}
          icon={is_favorite ? <MdStar /> : <MdStarBorder />}
        />
      </Tooltip>
    ) : (
      ""
    );
  let label_obj = <Text paddingTop="1px">{node_label}</Text>;
  let save_button = "";
  let cancel_button = "";
  if (is_editing) {
    label_obj = (
      <Input
        ref={label_input_ref}
        onKeyUp={handleKeyUp}
        className="editable-node-label"
        variant="unstyled"
        size="xs"
        defaultValue={node_label}
        placeholder={node_label}
      />
    );
    if (edit_visible) {
      save_button = (
        <Tooltip
          className="clear-tooltip"
          label={
            <HStack>
              <Text>{utils.getDisplayCopy("tooltips", "save")}</Text>
              <Kbd>enter</Kbd>
            </HStack>
          }
        >
          <IconButton className="node-label-edit-button" onClick={handleClickOnSave} variant="ghost" aria-label="Save Label" icon={<MdCheck />} />
        </Tooltip>
      );
      cancel_button = (
        <Tooltip
          className="clear-tooltip"
          label={
            <HStack>
              <Text>{utils.getDisplayCopy("tooltips", "discard")}</Text>
              <Kbd>esc</Kbd>
            </HStack>
          }
        >
          <IconButton
            className="node-label-edit-button"
            onClick={handleClickOnCancel}
            variant="ghost"
            aria-label="Discard Label"
            icon={<MdClose />}
          />
        </Tooltip>
      );
    }
  }
  return (
    <div className="node-header">
      <HStack onMouseOver={handleMouseOver} onMouseLeave={handleMouseLeave}>
        {label_obj}
        {edit_button}
        {save_button}
        {cancel_button}
        {favorite_button}
      </HStack>
      {identifier_icon ? (
        <Tooltip label={utils.getDisplayCopy("tooltips", "iterating_box")}>
          <Box position="absolute" top="5px" right="3px">
            <Icon boxSize={4} color="blue.500" as={identifier_icon} />
          </Box>
        </Tooltip>
      ) : (
        ""
      )}
    </div>
  );
}

export default EditableNodeHeader;
