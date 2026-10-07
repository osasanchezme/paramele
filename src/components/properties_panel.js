import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionIcon,
  Box,
  AccordionPanel,
  Tag,
  Tooltip,
  IconButton,
  Text,
  HStack,
  Grid,
  GridItem,
} from "@chakra-ui/react";
import { MdCopyAll, MdStar, MdStarBorder, MdUnfoldLess } from "react-icons/md";
import utils from "../utils";
import state from "../state";
import { memo, useContext, useState } from "react";
import ObjectInspector from "./object_inspector";
import favorites from "../js/favorites";
import { FavoritesContext } from "../Context";

// Collapsed panels are kept mounted by default, which renders every node of the model even when nothing is expanded
const UNMOUNT_ON_EXIT = { unmountOnExit: true };

function PropertiesPanel({ visible, width, is_floating, data }) {
  const [expanded_index, setExpandedIndex] = useState([]);
  const { favorite_node_ids, toggleFavorite } = useContext(FavoritesContext);
  if (!visible) return "";
  let top_keys = [];
  let grouped_nodes = {};
  data.nodes.forEach((node) => {
    if (!grouped_nodes.hasOwnProperty(node.type)) grouped_nodes[node.type] = [];
    grouped_nodes[node.type].push(node);
  });
  function handleClickOnTag(e, node_position) {
    state.zoomToCoordinate(Number(node_position.x), Number(node_position.y));
  }
  function handleClickOnCopy(e) {
    state.copyStructureToClipboard();
  }
  function handleClickOnCollapse(e) {
    setExpandedIndex([]);
  }
  function handleClickOnAccordionButton(e, i) {
    let index_of_clicked = expanded_index.indexOf(i);
    if (index_of_clicked < 0) {
      setExpandedIndex([...expanded_index, i]);
    } else {
      setExpandedIndex([...expanded_index.slice(0, index_of_clicked), ...expanded_index.slice(index_of_clicked + 1, expanded_index.length)]);
    }
  }
  Object.entries(grouped_nodes).forEach(([key, val], i) => {
    top_keys.push(
      <AccordionItem key={key}>
        <AccordionButton onClick={(event) => handleClickOnAccordionButton(event, i)}>
          <Box as="span" flex="1" textAlign="left">
            {utils.getDisplayCopy("nodes", key)}
          </Box>
          <AccordionIcon />
        </AccordionButton>
        <AccordionPanel motionProps={UNMOUNT_ON_EXIT}>
          <Accordion variant={"child"} allowMultiple>
            {val.map((node) => (
              <AccordionItem key={node.id}>
                <HStack spacing={0}>
                  <AccordionButton>
                    <Box as="span" flex="1" textAlign="left" style={{ textTransform: "uppercase" }}>
                      {node.data.custom_label ? node.data.custom_label : node.id}
                    </Box>
                    <AccordionIcon />
                  </AccordionButton>
                  {favorites.getFavoritableParameter(node.type) ? (
                    <FavoriteToggle is_favorite={favorite_node_ids.has(node.id)} onToggle={() => toggleFavorite(node.id)} />
                  ) : null}
                </HStack>
                <AccordionPanel pb={1} motionProps={UNMOUNT_ON_EXIT}>
                  {node.data.input
                    ? Object.entries(node.data.input).map(([data_key, data_value]) => {
                        let display_copy = utils.getDisplayCopy("tags", utils.splitArgName(data_key, "target").name);
                        return (
                          <Box width="100%" key={data_key} marginBottom={"2px"}>
                            <Tag variant={"targetBig"} onClick={(event) => handleClickOnTag(event, node.position)}>
                              <HStack>
                                <Text>{display_copy} : </Text>
                                {typeof data_value == "object" ? ObjectInspector({ object: data_value }) : <Text>{data_value}</Text>}
                              </HStack>
                            </Tag>
                          </Box>
                        );
                      })
                    : []}
                  {Object.entries(node.data).map(([data_key, data_value]) => {
                    let display_copy = utils.getDisplayCopy("tags", utils.splitArgName(data_key, "source").name);
                    return data_key !== "input" && data_key !== "custom_label" ? (
                      <Box width="100%" key={data_key} marginBottom={"2px"}>
                        <Tag variant={"sourceBig"} onClick={(event) => handleClickOnTag(event, node.position)}>
                          {display_copy} : {typeof data_value == "object" ? ObjectInspector({ object: data_value }) : String(data_value)}
                        </Tag>
                      </Box>
                    ) : null;
                  })}
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        </AccordionPanel>
      </AccordionItem>
    );
  });
  return (
    <div className={`properties-panel${is_floating ? " floating" : ""}`} style={is_floating ? undefined : { width: width + "%" }}>
      <div className="panel-top-bar">
        <Grid templateColumns="repeat(15, 1fr)" gap={2}>
          <GridItem colSpan={9}>{utils.getDisplayCopy("properties_panel", "title")}</GridItem>
          <GridItem colStart={14} colEnd={14}>
            <Tooltip
              className="clear-tooltip"
              label={
                <HStack>
                  <Text>{utils.getDisplayCopy("properties_panel", "collapse_all")}</Text>
                </HStack>
              }
            >
              <IconButton
                className="small-ghost-button"
                onClick={handleClickOnCollapse}
                variant="ghost"
                aria-label="Collapse"
                icon={<MdUnfoldLess />}
              />
            </Tooltip>
          </GridItem>
          <GridItem colStart={15} colEnd={15}>
            <Tooltip
              className="clear-tooltip"
              label={
                <HStack>
                  <Text>{utils.getDisplayCopy("properties_panel", "copy_json")}</Text>
                </HStack>
              }
            >
              <IconButton
                className="small-ghost-button"
                onClick={handleClickOnCopy}
                variant="ghost"
                aria-label="Copy structure"
                icon={<MdCopyAll />}
              />
            </Tooltip>
          </GridItem>
        </Grid>
      </div>
      <Accordion allowMultiple variant={"parent"} index={expanded_index}>
        {top_keys}
      </Accordion>
    </div>
  );
}

function FavoriteToggle({ is_favorite, onToggle }) {
  const label = utils.getDisplayCopy("tooltips", is_favorite ? "remove_favorite" : "add_favorite");
  return (
    <Tooltip className="clear-tooltip" label={label}>
      <IconButton
        className={`small-ghost-button favorite-toggle${is_favorite ? " active" : ""}`}
        onClick={onToggle}
        variant="ghost"
        aria-label={label}
        aria-pressed={is_favorite}
        icon={is_favorite ? <MdStar /> : <MdStarBorder />}
      />
    </Tooltip>
  );
}

// Skip re-rendering when the parent updates for unrelated reasons (e.g. dragging nodes in the editor)
export default memo(PropertiesPanel);
