import { Box, Tag, Tooltip, Icon } from "@chakra-ui/react";
import { MdDataObject } from "react-icons/md";

function ObjectInspector({ object }) {
  return (
    <Tooltip className="clear-tooltip" shouldWrapChildren={true} label={getPrintableJSON(object)} placement="right">
      <Icon as={MdDataObject} fontSize="16px" paddingTop="2px"></Icon>
    </Tooltip>
  );
}

function getPrintableJSON(object) {
  let printable = "";
  if (object) {
    if (object.length) {
      printable = String(object);
    } else {
      printable = [];
      let tag_str;
      Object.entries(object).forEach(([key, val]) => {
        tag_str = key + " : ";
        let child_tags = [];
        // null is an object too, it is printed as a value
        if (typeof val === "object" && val !== null) {
          let child_str;
          Object.entries(val).forEach(([key_1, val_1]) => {
            child_str = key_1 + " : ";
            if (typeof val_1 === "object" && val_1 !== null) {
              child_str += " object";
            } else {
              child_str += String(val_1);
            }
            child_tags.push(
              <Box style={{ paddingLeft: "40px", width: "100%", marginTop: "1px" }} key={child_str}>
                {" "}
                <Tag variant="targetBig">{child_str}</Tag>
              </Box>
            );
          });
        } else {
          tag_str += String(val) + "\n";
        }
        printable.push(
          <Box style={{ width: "100%", marginTop: "2px" }} key={tag_str}>
            {" "}
            <Tag variant="sourceBig">{tag_str}</Tag>
          </Box>
        );
        printable.push(...child_tags);
      });
    }
  } else {
    printable = String(object);
  }
  return printable;
}

export default ObjectInspector;
