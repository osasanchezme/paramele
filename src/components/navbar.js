import {
  Button,
  List,
  ListIcon,
  ListItem,
  Icon,
  IconButton,
  Flex,
  Spacer,
  Tooltip,
  Box,
  Menu,
  MenuButton,
  MenuList,
  MenuGroup,
  MenuItem,
  MenuDivider,
  useMediaQuery,
} from "@chakra-ui/react";
import React, { useRef, useState } from "react";
import * as MaterialDesign from "react-icons/md";
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand } from "react-icons/tb";
import boxes from "../js/boxes";
import file from "../js/file";
import structure from "../js/structure";
import utils from "../utils";
import FileStatusIndicator from "./file_status_indicator";
import SolverStatusIndicator from "./solver_status_indicator";
import Firebase from "../js/firebase";
import { useGlobalLoading } from "../Context";
import { notify } from "./notification";
import { COMPACT_LAYOUT_QUERY, COMPACT_NAV_BAR_QUERY } from "../js/breakpoints";

function localGetCopy(node_name) {
  return utils.getDisplayCopy("nav_bar", node_name);
}

function NavBar({
  user,
  file_data,
  setFileData,
  model_locked,
  setModelLock,
  openVersionManager,
  openAuthenticationForm,
  openFileManager,
  changeAppMode,
  openConfirmationDialog,
  openSharingManager,
  show_properties_panel,
  togglePropertiesPanel,
}) {
  let [dropdownState, setDropdownState] = useState({ dropdown_visible: false, mouse_on_menu: false });
  let [currentMenu, setCurrentMenu] = useState("file");
  let [currentMenuIndex, setCurrentMenuIndex] = useState(0);
  let [activeGroup, setActiveGroup] = useState("left");
  const { showGlobalLoading, hideGlobalLoading } = useGlobalLoading();
  const [is_compact_nav_bar, is_compact_layout] = useMediaQuery([COMPACT_NAV_BAR_QUERY, COMPACT_LAYOUT_QUERY]);

  const navbar_options = useRef(null);
  if (navbar_options.current == null) {
    navbar_options.current = {
      file: {
        icon: "MdInsertDriveFile",
        options: [
          {
            name: localGetCopy("new"),
            icon: "MdInsertDriveFile",
            callback: () => {
              openConfirmationDialog(
                "blank_file",
                [
                  {
                    run: (close_dialog_callback) => {
                      setFileData({
                        file_name: null,
                        is_saved: false,
                        last_saved: null,
                        model_id: null,
                        file_path: null,
                        current_version: null,
                        file_owner_path: null,
                        file_shared_with_me: null,
                        file_shared_data: null,
                      });
                      file.newFile();
                      close_dialog_callback();
                    },
                    copy: "ok",
                    color: "blue",
                  },
                ],
                true
              );
            },
          },
          {
            name: localGetCopy("open"),
            icon: "MdFolderOpen",
            callback: () => {
              openFileManager("open");
            },
          },
          {
            name: localGetCopy("save"),
            icon: "MdSave",
            callback: () => {
              openFileManager("save");
            },
          },
          {
            name: localGetCopy("share"),
            icon: "MdShare",
            callback: () => {
              openSharingManager();
            },
          },
          { name: localGetCopy("version_history"), icon: "MdOutlineHistory", callback: openVersionManager },
          { name: localGetCopy("export_json"), icon: "MdFileDownload", callback: file.downloadJSONFile },
          {
            name: localGetCopy("import_json"),
            icon: "MdFileUpload",
            callback: () => {
              openConfirmationDialog(
                "upload_file",
                [
                  {
                    run: (close_dialog_callback) => {
                      setFileData({
                        file_name: null,
                        is_saved: false,
                        last_saved: null,
                        model_id: null,
                        file_path: null,
                        current_version: null,
                        file_owner_path: null,
                        file_shared_with_me: null,
                        file_shared_data: null,
                      });
                      file.uploadJSONFile();
                      close_dialog_callback();
                    },
                    copy: "ok",
                    color: "blue",
                  },
                ],
                true
              );
            },
          },
        ],
      },
      boxes: {
        icon: "MdCropSquare",
        options: [
          {
            name: localGetCopy("group"),
            icon: "MdGroupWork",
            callback: () => {
              changeAppMode("selecting_handles");
              boxes.groupBoxes((success) => {
                if (success) {
                  changeAppMode("wait_action");
                }
              });
            },
          },
          { name: localGetCopy("edit_logic"), icon: "MdEdit", callback: boxes.editInternalLogic },
          { name: localGetCopy("delete"), icon: "MdDelete", callback: boxes.deleteBoxes },
          {
            name: localGetCopy("change_type"),
            icon: "MdSwapHoriz",
            callback: () => {
              changeAppMode("change_node_type"); // This change will trigger the commands bar for the user to select the type and the bar will handle the update
            },
          },
          {
            name: localGetCopy("duplicate"),
            icon: "MdContentCopy",
            callback: () => {
              changeAppMode("duplicate_point_1");
            },
          },
        ],
      },
      structure: {
        icon: "MdFoundation",
        options: [
          {
            name: localGetCopy("solve"),
            icon: "MdPlayCircle",
            callback: () => {
              setModelLock(true);
              structure.solveStructure();
            },
          },
          {
            name: localGetCopy("export_sap"),
            icon: "MdFileDownload",
            callback: () => {
              structure.downloadInputTextFile("SAP2000");
            },
          },
          {
            name: localGetCopy("import"),
            icon: "MdFileUpload",
            callback: () => {
              showGlobalLoading("generating_parametric_model");
              structure.importStructureModel((process_response) => {
                hideGlobalLoading();
                if (!process_response.success) {
                  if (process_response.msg === "parametricGenerator/generic_fail") {
                    notify("error", "generic_unhandled_issue", process_response.msg, true);
                  } else {
                    notify("error", process_response.msg, undefined, true);
                  }
                }
              });
            },
          },
        ],
      },
      settings: {
        icon: "MdSettings",
        callback: utils.openGlobalSettings,
      },
    };
  }
  const right_navbar_options = useRef(null);
  if (right_navbar_options.current == null) {
    right_navbar_options.current = {
      account: {
        icon: "MdAccountCircle",
        callback: openAuthenticationForm,
        auth_behavior: {
          auth: { visible: false },
          no_auth: { visible: true },
        },
      },
      user: {
        icon: "MdAccountCircle",
        callback: openAuthenticationForm,
        auth_behavior: {
          auth: { visible: true },
          no_auth: { visible: false },
        },
        options: [{ name: localGetCopy("log_out"), icon: "MdExitToApp", callback: Firebase.signOutUser }],
      },
    };
  }
  const status_indicators = (
    <>
      <SolverStatusIndicator is_compact={is_compact_layout} />
      <FileStatusIndicator
        file_data={file_data}
        setFileData={setFileData}
        model_locked={model_locked}
        setModelLock={setModelLock}
        openFileManager={openFileManager}
        openAuthenticationForm={openAuthenticationForm}
        user={user}
        is_compact={is_compact_layout}
      />
    </>
  );
  if (is_compact_nav_bar) {
    return (
      <div className="nav-bar">
        <Flex direction="row" className="nav-bar-button-group">
          <Box className="nav-bar-left-corner">
            <PanelToggle visible={show_properties_panel} onToggle={togglePropertiesPanel} />
            <CompactMenu options={navbar_options.current} />
          </Box>
          <Spacer></Spacer>
          {status_indicators}
          <Box className="nav-bar-right-corner">
            <AccountMenu user={user} openAuthenticationForm={openAuthenticationForm} />
          </Box>
        </Flex>
      </div>
    );
  }
  const handleChange = (dropdown_visible, mouse_on_menu) => {
    setDropdownState({ dropdown_visible, mouse_on_menu });
  };
  let current_options = [];
  let right_style = "";
  let left_style = "";
  let right_index = 0;
  if (activeGroup === "left") {
    current_options = navbar_options.current[currentMenu]["options"];
    left_style = String(150 * currentMenuIndex) + "px";
  } else if (activeGroup === "right") {
    current_options = right_navbar_options.current[currentMenu]["options"];
    right_style = String(150 * currentMenuIndex) + "px";
  }
  if (!current_options) current_options = [];
  return (
    <div className="nav-bar">
      <Flex direction="row" spacing={0} className="nav-bar-button-group">
        <Box width="150px" className="nav-bar-left-corner">
          <PanelToggle visible={show_properties_panel} onToggle={togglePropertiesPanel} />
        </Box>
        {Object.entries(navbar_options.current).map(([nav_menu_key, nav_menu_options], index) => (
          <Button
            key={`${nav_menu_key}-nav-bar-btn`}
            width="150px"
            className="nav-bar-button"
            leftIcon={<Icon as={MaterialDesign[nav_menu_options.icon]} />}
            rightIcon={nav_menu_options.options ? <MaterialDesign.MdKeyboardArrowDown /> : ""}
            colorScheme="gray"
            variant="ghost"
            onMouseEnter={() => {
              handleChange(true, false);
              setCurrentMenu(nav_menu_key);
              setCurrentMenuIndex(index + 1);
              setActiveGroup("left");
            }}
            onMouseLeave={() => {
              if (!dropdownState.mouse_on_menu) {
                handleChange(false, false);
              }
            }}
            onClick={() => {
              if (!nav_menu_options.options) {
                nav_menu_options.callback();
              }
            }}
          >
            {localGetCopy(nav_menu_key)}
          </Button>
        ))}
        <Spacer></Spacer>
        {status_indicators}
        {Object.entries(right_navbar_options.current).map(([nav_menu_key, nav_menu_options], index) => {
          let display_copy = localGetCopy(nav_menu_key);
          if (nav_menu_key === "user" && user) display_copy = user.displayName || display_copy;
          if ((user === null && nav_menu_options.auth_behavior.no_auth.visible) || (user !== null && nav_menu_options.auth_behavior.auth.visible)) {
            right_index++;
            return (
              <Button
                key={`${nav_menu_key}-nav-bar-btn`}
                width="150px"
                className="nav-bar-button"
                leftIcon={<Icon as={MaterialDesign[nav_menu_options.icon]} />}
                rightIcon={nav_menu_options.options ? <MaterialDesign.MdKeyboardArrowDown /> : ""}
                // colorScheme="gray"
                // variant="ghost"
                onMouseEnter={() => {
                  handleChange(true, false);
                  setCurrentMenu(nav_menu_key);
                  setCurrentMenuIndex(right_index - 1);
                  setActiveGroup("right");
                }}
                onMouseLeave={() => {
                  if (!dropdownState.mouse_on_menu) {
                    handleChange(false, false);
                  }
                }}
                onClick={() => {
                  if (!nav_menu_options.options) {
                    nav_menu_options.callback();
                  }
                }}
              >
                {display_copy}
              </Button>
            );
          }
        })}
      </Flex>
      <NavMenu
        left={left_style}
        right={right_style}
        options={current_options}
        visibility={dropdownState.dropdown_visible ? "visible" : "hidden"}
        handleChange={handleChange}
      ></NavMenu>
    </div>
  );
}

function PanelToggle({ visible, onToggle }) {
  const label = localGetCopy(visible ? "hide_panel" : "show_panel");
  return (
    <Tooltip label={label} placement="bottom-start" openDelay={300}>
      <IconButton
        aria-label={label}
        aria-pressed={visible}
        icon={<Icon as={visible ? TbLayoutSidebarLeftCollapse : TbLayoutSidebarLeftExpand} boxSize={5} />}
        variant="ghost"
        onClick={onToggle}
      />
    </Tooltip>
  );
}

/**
 * All the top bar menus in a single one, for screens where they do not fit side by side
 */
function CompactMenu({ options }) {
  const label = localGetCopy("menu");
  return (
    <Menu placement="bottom-start" isLazy>
      <MenuButton as={IconButton} aria-label={label} icon={<Icon as={MaterialDesign.MdMenu} boxSize={6} />} variant="ghost" />
      <MenuList className="nav-bar-compact-menu" zIndex={12}>
        {Object.entries(options).map(([nav_menu_key, nav_menu_options], index) => (
          <React.Fragment key={nav_menu_key}>
            {index > 0 && <MenuDivider />}
            {nav_menu_options.options ? (
              <MenuGroup title={localGetCopy(nav_menu_key)}>
                {nav_menu_options.options.map((option) => (
                  <MenuItem key={option.name} icon={<Icon as={MaterialDesign[option.icon]} boxSize={4} />} onClick={() => option.callback()}>
                    {option.name}
                  </MenuItem>
                ))}
              </MenuGroup>
            ) : (
              <MenuItem icon={<Icon as={MaterialDesign[nav_menu_options.icon]} boxSize={4} />} onClick={() => nav_menu_options.callback()}>
                {localGetCopy(nav_menu_key)}
              </MenuItem>
            )}
          </React.Fragment>
        ))}
      </MenuList>
    </Menu>
  );
}

/**
 * Account button for compact screens, it opens the authentication form or the user menu when logged in
 */
function AccountMenu({ user, openAuthenticationForm }) {
  const account_icon = <Icon as={MaterialDesign.MdAccountCircle} boxSize={6} />;
  if (user === null) {
    const label = localGetCopy("account");
    return <IconButton aria-label={label} icon={account_icon} variant="ghost" onClick={() => openAuthenticationForm()} />;
  }
  const user_name = user.displayName || localGetCopy("user");
  return (
    <Menu placement="bottom-end" isLazy>
      <MenuButton as={IconButton} aria-label={user_name} icon={account_icon} variant="ghost" />
      <MenuList zIndex={12}>
        <MenuGroup title={user_name}>
          <MenuItem icon={<Icon as={MaterialDesign.MdExitToApp} boxSize={4} />} onClick={Firebase.signOutUser}>
            {localGetCopy("log_out")}
          </MenuItem>
        </MenuGroup>
      </MenuList>
    </Menu>
  );
}

function NavMenu({ left, right, options, visibility, handleChange }) {
  const options_list = options.map((option) => {
    return (
      <ListItem
        height="40px"
        paddingTop="7px"
        paddingLeft="7px"
        _hover={{ background: "whitesmoke" }}
        cursor="pointer"
        key={option.name}
        onClick={() => option.callback()}
      >
        <ListIcon as={MaterialDesign[option.icon]} />
        {option.name}
      </ListItem>
    );
  });

  return (
    <List
      position="absolute"
      left={left}
      right={right}
      spacing={0}
      border="2px"
      borderBottomRadius="md"
      borderColor="whitesmoke"
      backgroundColor="white"
      width="150px"
      visibility={visibility}
      onMouseLeave={() => {
        handleChange(false, false);
      }}
      onMouseEnter={() => handleChange(true, true)}
    >
      {options_list}
    </List>
  );
}

export default NavBar;
