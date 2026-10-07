import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./flowNodes.css";
import { ChakraProvider } from "@chakra-ui/react";
import NavBar from "./components/navbar";
import state, { setInitialState, updateStateFromFlow } from "./state";
import CommandsBar from "./components/commands_bar";
import getState from "./getState";
import ResizeBorder from "./components/resize_border";
import PropertiesPanel from "./components/properties_panel";
import theme from "./theme";
import SelectionBox from "./components/selection_box";
import Navigator from "./components/navigator";
import GlobalSettings from "./components/global_settings";
import Authentication from "./components/authentication";
import FileManager from "./components/file_manager";
import { LoadingDimmer } from "./components/loading_dimmer";
import utils from "./utils";
import VisualEditor, { deselectAllNodesAndHandles, fitView, screenCoordsToReactFlow } from "./components/VisualEditor";
import createNodesLibrary from "./flow-nodes/handler";
import Renderer from "./components/Renderer";
import VersionManager from "./components/version_manager";
import Firebase from "./js/firebase";
import { ConfirmationDialog } from "./components/confirmation_dialog";
import file from "./js/file";
import { notify } from "./components/notification";
import { getInitialState } from "./initial_state";
import { AppModeContext, GlobalLoadingProvider, UserDataContext } from "./Context";
import SharingManager from "./components/sharing_manager";
import StatusBar from "./components/status_bar";
import ViewSwitch from "./components/view_switch";
import boxes from "./js/boxes";
import { onCompactLayoutChange } from "./js/breakpoints";

setInitialState();
const library = createNodesLibrary();
const nodes_library = library.nodes;
window.ParamEle.updateStateFromFlow = updateStateFromFlow;
window.ParamEle.nodesLibrary = library;

class ParamEle extends React.Component {
  constructor(props) {
    super(props);
    this.state = getInitialState();
    this.changeGeneralSettingValue = this.changeGeneralSettingValue.bind(this);
    window.ParamEle.changeGeneralSettingValue = this.changeGeneralSettingValue.bind(this);
    this.setViewMode = this.setViewMode.bind(this);
    this.togglePropertiesPanel = this.togglePropertiesPanel.bind(this);
    this.changeAppMode = this.changeAppMode.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.getStateUpdateFromClickEvent = this.getStateUpdateFromClickEvent.bind(this);
    this.handleMouseClick = this.handleMouseClick.bind(this);
    this.handleKeyPress = this.handleKeyPress.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.updateComponentsWidth = this.updateComponentsWidth.bind(this);
    this.updateNodesFromLocalState = this.updateNodesFromLocalState.bind(this);
    window.ParamEle.updateNodesFromLocalState = this.updateNodesFromLocalState.bind(this);
    this.getUser = this.getUser.bind(this);
    window.ParamEle.getUser = this.getUser.bind(this);
    this.setUser = this.setUser.bind(this);
    window.ParamEle.setUser = this.setUser.bind(this);
    this.setFileData = this.setFileData.bind(this);
    this.getFileData = this.getFileData.bind(this);
    this.setModelLock = this.setModelLock.bind(this);
    this.openVersionManager = this.openVersionManager.bind(this);
    this.closeVersionManager = this.closeVersionManager.bind(this);
    this.openConfirmationDialog = this.openConfirmationDialog.bind(this);
    this.closeConfirmationDialog = this.closeConfirmationDialog.bind(this);
    this.openAuthenticationForm = this.openAuthenticationForm.bind(this);
    this.closeAuthenticationForm = this.closeAuthenticationForm.bind(this);
    this.setActiveTabAuthenticationForm = this.setActiveTabAuthenticationForm.bind(this);
    this.openFileManager = this.openFileManager.bind(this);
    this.closeFileManager = this.closeFileManager.bind(this);
    this.openSharingManager = this.openSharingManager.bind(this);
    this.closeSharingManager = this.closeSharingManager.bind(this);
    this.setNodes = this.setNodes.bind(this);
    this.setEdges = this.setEdges.bind(this);
    this.getContactInformation = this.getContactInformation.bind(this);

    // Manage auth state changes - This is the last thing that loads
    Firebase.attachToAuthChangeFirebaseEvent((user) => {
      let params_object = file.getURLParams();
      let { path, name } = params_object;
      let is_params_available = path !== null && name !== null;
      if (user) {
        utils.setUser(user);
      } else {
        utils.setUser(null);
      }
      utils.hideLoadingDimmer();
      if (is_params_available) {
        let file_path = path.split(",");
        file.getFileDataAndOpenModel(file_path, name, this.setFileData, this.setModelLock, () => {
          notify("warning", "file_does_not_exist", undefined, true);
        });
      }
    });
  }
  componentDidMount() {
    utils.showLoadingDimmer();
    // The editor changes its width, so fit the graph to it again once React Flow has measured it (on the next frame)
    this.removeCompactLayoutListener = onCompactLayoutChange((is_compact) =>
      this.setState({ is_compact, compact_panel_open: false }, () => requestAnimationFrame(() => requestAnimationFrame(fitView)))
    );
  }
  componentWillUnmount() {
    this.removeCompactLayoutListener();
  }
  changeGeneralSettingValue(key, value) {
    let curr_settings = this.state.settings;
    curr_settings.general[key] = value;
    this.setState({ settings: curr_settings }, () => {
      if (key === "show_properties_panel") {
        this.updateComponentsWidth({ panel_width: value ? 20 : 0 });
      } else if (key === "side_by_side") {
        this.updateComponentsWidth({ panel_width: curr_settings.general.show_properties_panel ? curr_settings.layout.panel_width : 0 });
      }
    });
  }
  /**
   * Shows only the nodes editor, both editor and renderer side by side, or only the renderer
   * @param {"nodes"|"split"|"renderer"} mode
   */
  setViewMode(mode) {
    let curr_settings = this.state.settings;
    // The compact layout never splits, so only switch the visible view and keep the split preference for wider screens
    if (this.state.is_compact) {
      curr_settings.general.show_nodes = mode === "nodes";
      this.setState({ settings: curr_settings });
      return;
    }
    curr_settings.general.side_by_side = mode === "split";
    if (mode !== "split") curr_settings.general.show_nodes = mode === "nodes";
    this.setState({ settings: curr_settings }, () => {
      this.updateComponentsWidth({ panel_width: curr_settings.general.show_properties_panel ? curr_settings.layout.panel_width : 0 });
    });
  }
  togglePropertiesPanel() {
    // On compact screens the panel floats over the views, so it does not change the stored layout
    if (this.state.is_compact) {
      this.setState({ compact_panel_open: !this.state.compact_panel_open });
      return;
    }
    this.changeGeneralSettingValue("show_properties_panel", !this.state.settings.general.show_properties_panel);
  }
  updateNodesFromLocalState() {
    let local_state = getState();
    this.setState({ model: local_state.model });
  }
  /**
   *
   * @param {*} update_function Function that receives the original nodes and applies some update to them
   */
  setNodes(update_function) {
    let nodes = update_function(this.state.nodes);
    this.setState({ nodes });
  }
  /**
   *
   * @param {*} update_function Function that receives the original edges and applies some update to them
   */
  setEdges(update_function) {
    let edges = update_function(this.state.edges);
    this.setState({ edges });
  }
  changeAppMode(mode) {
    this.setState({ mode });
  }
  getUser() {
    return this.state.user;
  }
  setUser(user) {
    this.setState({ user });
  }
  /**
   * Sets the file data to the state
   * @param {import("./js/types").ParamEleFileData} file_data
   */
  setFileData(file_data) {
    this.setState(file_data);
  }
  /**
   * Get the file data from the state
   * @returns {import("./js/types").ParamEleFileData}
   */
  getFileData() {
    return {
      file_name: this.state.file_name,
      is_saved: this.state.is_saved,
      last_saved: this.state.last_saved,
      model_id: this.state.model_id,
      file_path: this.state.file_path,
      current_version: this.state.current_version,
      file_owner_path: this.state.file_owner_path,
      file_shared_with_me: this.state.file_shared_with_me,
      file_history: this.state.file_history,
      file_shared_data: this.state.file_shared_data,
    };
  }
  setModelLock(model_locked) {
    if (!model_locked) state.setState({}, "results");
    this.setState({ model_locked });
  }
  openVersionManager() {
    if (this.state.is_saved && this.state.user) {
      Firebase.getProjectData(this.state.file_path, this.state.file_name, (full_file_data) => {
        this.setState({ file_history: full_file_data.history }, () => {
          this.setState({ is_version_manager_open: true });
        });
      });
    } else {
      notify("warning", "save_to_view_history", undefined, true);
    }
  }
  closeVersionManager() {
    this.setState({ is_version_manager_open: false });
  }
  openSharingManager() {
    if (this.state.is_saved && this.state.user) {
      this.setState({ is_sharing_manager_open: true });
    } else {
      notify("warning", "save_to_share", undefined, true);
    }
  }
  closeSharingManager() {
    this.setState({ is_sharing_manager_open: false });
  }
  /**
   * Opens a generic confirmation dialog before executing an action
   * @param {string} message A copy key from confirmation_dialog group
   * @param {{run: Function, copy: string, color: string}[]} callbacks Object with the keys for the action buttons and the associated callback function. Copies from the confirmation_dialog group
   * - Each callback.run function receives as an argument the dialog close function to be called anywhere in the callback
   * @param {boolean} show_cancel Whether or not to show the cancel button with no action
   */
  openConfirmationDialog(message, callbacks, show_cancel) {
    if (show_cancel) {
      callbacks.push({
        run: () => {},
        copy: "cancel",
        color: "gray",
        action: "close",
      });
    }
    this.setState({ is_confirmation_open: true, confirmation_msg: message, confirmation_callbacks: callbacks });
  }
  closeConfirmationDialog() {
    this.setState({ is_confirmation_open: false });
  }
  openAuthenticationForm(active_tab_auth_form) {
    this.setState({ is_auth_form_open: true, active_tab_auth_form: active_tab_auth_form || "sign_up" });
  }
  closeAuthenticationForm() {
    this.setState({ is_auth_form_open: false });
  }
  setActiveTabAuthenticationForm(active_tab_auth_form) {
    this.setState({ active_tab_auth_form });
  }
  openFileManager(mode) {
    if (this.state.user == null && mode == "save") {
      this.openAuthenticationForm("log_in");
      notify("warning", "log_in_to_save", undefined, true);
    } else {
      this.setState({ is_file_manager_open: true, file_manager_mode: mode });
    }
  }
  closeFileManager() {
    this.setState({ is_file_manager_open: false });
  }
  /**
   * @type {import("./js/state_types").ParamEleStateGetContactInformation}
   */
  getContactInformation(query, mode = "uid", callback) {
    if (mode == "uid") {
      if (this.state.local_people_directory[query]) {
        callback(this.state.local_people_directory[query]);
      } else {
        Firebase.getContactInformationFromDataBase(query, mode, (process_response) => {
          if (process_response.success) {
            let local_people_directory = { ...this.state.local_people_directory, [query]: process_response.data };
            callback(local_people_directory[query]);
            this.setState({ local_people_directory });
          } else {
            notify("error", process_response.msg, undefined, true);
          }
        });
      }
    }
  }
  /**
   * Gets the role of the authenticated user in the current model
   * @returns {import("./js/types").ParamEleUserRole}
   */
  getUserRole() {
    if (!this.state.user) return "guest";
    if (!this.state.file_shared_with_me && !this.state.file_shared_data?.[this.state.user.uid]) return "owner";
    return this.state.file_shared_data[this.state.user.uid].role;
  }
  /**
   *
   * @param {MouseEvent} event
   */
  handleMouseMove(event) {
    switch (this.state.mode) {
      case "resizing_modules":
        event.preventDefault();
        let current_resizer = state.getGlobalVariable("current_resizer");
        let relative_location;
        switch (current_resizer) {
          case "renderer_editor":
            relative_location = (event.clientX / window.innerWidth) * 100;
            this.updateComponentsWidth({ relative_pos_resize_2: relative_location });
            break;
          case "properties_panel":
            relative_location = (event.clientX / window.innerWidth) * 100;
            this.updateComponentsWidth({ relative_pos_resize_1: relative_location });
            break;
          default:
            break;
        }
        break;
      case "selecting_nodes":
        event.preventDefault();
        this.setState({ mouse_x: event.clientX, mouse_y: event.clientY });
        break;
      default:
        break;
    }
  }
  updateComponentsWidth(required_update) {
    let general = this.state.settings.general;
    let layout = this.state.settings.layout;
    let renderer_width = required_update.renderer_width;
    let renderer_right = required_update.renderer_right;
    let editor_width = required_update.editor_width;
    let panel_width = required_update.panel_width;
    let relative_pos_resize_1 = required_update.relative_pos_resize_1;
    let relative_pos_resize_2 = required_update.relative_pos_resize_2;
    let available_width;
    if (typeof relative_pos_resize_1 !== "undefined") {
      available_width = 100 - relative_pos_resize_1;
      if (general.side_by_side) {
        renderer_width = layout.renderer_width;
        editor_width = available_width - renderer_width;
        renderer_right = editor_width;
      } else {
        renderer_width = available_width;
        editor_width = available_width;
        renderer_right = 0;
      }
      this.setState({
        settings: {
          ...this.state.settings,
          layout: { panel_width: relative_pos_resize_1, renderer_width, editor_width, renderer_right },
        },
      });
    } else if (typeof relative_pos_resize_2 !== "undefined") {
      if (general.show_properties_panel) {
        panel_width = layout.panel_width;
        available_width = 100 - panel_width;
      } else {
        panel_width = 0;
        available_width = 100;
      }
      renderer_width = relative_pos_resize_2 - panel_width;
      editor_width = available_width - renderer_width;
      renderer_right = editor_width;
      this.setState({
        settings: {
          ...this.state.settings,
          layout: { panel_width, renderer_width, editor_width, renderer_right },
        },
      });
    } else if (typeof panel_width !== "undefined") {
      available_width = 100 - panel_width;
      if (general.side_by_side) {
        editor_width = 0.5 * available_width;
        renderer_width = available_width - editor_width;
        renderer_right = editor_width;
      } else {
        editor_width = available_width;
        renderer_width = available_width;
        renderer_right = 0;
      }
      this.setState({
        settings: {
          ...this.state.settings,
          layout: { panel_width, renderer_width, editor_width, renderer_right },
        },
      });
    }
  }
  getStateUpdateFromClickEvent(event, next_mode, store_rf_coords) {
    let bounding_rect = event.target.getBoundingClientRect();
    let mouse_x = event.clientX;
    let mouse_y = event.clientY;
    let height = 50;
    let width = 0;
    if (mouse_y > 50 && mouse_y < window.innerHeight - height && mouse_x > 0 && mouse_x < window.innerWidth - width) {
      let state_update = {
        mode: next_mode,
        mouse_x: event.clientX,
        mouse_y: event.clientY,
        rel_orig_x: bounding_rect.left,
        rel_orig_y: bounding_rect.top,
      };
      if (store_rf_coords) {
        let rf_coords = screenCoordsToReactFlow({ x: mouse_x, y: mouse_y });
        Object.assign(state_update, { rf_mouse_x: rf_coords.x, rf_mouse_y: rf_coords.y });
      }
      return state_update;
    }
  }
  handleKeyPress(event) {
    switch (event.key) {
      case "Escape":
        this.setState({ mode: "wait_action" });
        deselectAllNodesAndHandles();
        break;
      case "Enter":
        state.setGlobalVariable("user_interaction_step", "done");
        break;
      default:
        break;
    }
  }
  handleMouseClick(event) {
    // Clicking anywhere outside the commands bar dismisses it, as Escape does
    let is_commands_bar_open = this.state.mode === "add_node" || this.state.mode === "change_node_type";
    if (is_commands_bar_open && !event.target.closest(".commands-bar")) {
      this.changeAppMode("wait_action");
      return;
    }
    if (event.target.className === "react-flow__pane") {
      if (!event.ctrlKey) {
        switch (this.state.mode) {
          case "wait_action":
            deselectAllNodesAndHandles();
            this.setState(this.getStateUpdateFromClickEvent(event, "add_node"));
            break;
          case "duplicate_point_1":
            this.setState(this.getStateUpdateFromClickEvent(event, "duplicate_point_2", true));
            break;
          case "duplicate_point_2":
            let state_update = this.getStateUpdateFromClickEvent(event, "wait_action", true);
            boxes.duplicateNodes({ x: this.state.rf_mouse_x, y: this.state.rf_mouse_y }, { x: state_update.rf_mouse_x, y: state_update.rf_mouse_y });
            this.setState(state_update);
            break;
        }
      }
    }
  }
  handleMouseUp(event) {
    if (this.state.mode === "selecting_nodes") {
      state.highlightSelectedNodes(
        this.state.selection_left,
        this.state.selection_top,
        this.state.mouse_x,
        this.state.mouse_y,
        this.state.rel_orig_x,
        this.state.rel_orig_y
      );
      this.changeAppMode("wait_action");
    }
  }
  /**
   *
   * @param {MouseEvent} event
   */
  handleMouseDown(event) {
    if (event.target.className === "react-flow__pane" && event.ctrlKey) {
      let bounding_rect = event.target.getBoundingClientRect();
      this.changeAppMode("selecting_nodes");
      this.setState({ selection_top: event.clientY, selection_left: event.clientX, rel_orig_x: bounding_rect.left, rel_orig_y: bounding_rect.top });
    }
  }
  render() {
    let commands_bar;
    if (this.state.mode === "add_node" || this.state.mode === "change_node_type") {
      commands_bar = (
        <CommandsBar
          x={this.state.mouse_x}
          y={this.state.mouse_y}
          rel_orig_x={this.state.rel_orig_x}
          rel_orig_y={this.state.rel_orig_y}
          changeAppMode={this.changeAppMode}
          app_mode={this.state.mode}
        ></CommandsBar>
      );
    }
    let { general, layout } = this.state.settings;
    let is_compact = this.state.is_compact;
    let show_properties_panel = general.show_properties_panel;
    if (is_compact) {
      // Only one full width view at a time, the properties panel floats over it
      general = { ...general, side_by_side: false };
      layout = { panel_width: 0, editor_width: 100, renderer_width: 100, renderer_right: 0 };
      show_properties_panel = this.state.compact_panel_open;
    }
    let panel_plus_renderer = Number(layout.renderer_width);
    if (show_properties_panel) panel_plus_renderer += Number(layout.panel_width);
    return (
      <UserDataContext.Provider value={{ role: this.getUserRole() }}>
        <AppModeContext.Provider value={this.state.mode}>
          <GlobalLoadingProvider>
            <ChakraProvider theme={theme}>
              <div
                className="app-cont"
                tabIndex={0}
                onKeyDown={this.handleKeyPress}
                onMouseMove={this.handleMouseMove}
                onClick={this.handleMouseClick}
                onMouseDown={this.handleMouseDown}
                onMouseUp={this.handleMouseUp}
              >
                <LoadingDimmer />
                <ConfirmationDialog
                  isDialogOpen={this.state.is_confirmation_open}
                  closeDialog={this.closeConfirmationDialog}
                  callbacks={this.state.confirmation_callbacks}
                  message_copy={this.state.confirmation_msg}
                ></ConfirmationDialog>
                <NavBar
                  user={this.state.user}
                  file_data={this.getFileData()}
                  setFileData={this.setFileData}
                  model_locked={this.state.model_locked}
                  setModelLock={this.setModelLock}
                  openVersionManager={this.openVersionManager}
                  openAuthenticationForm={this.openAuthenticationForm}
                  openFileManager={this.openFileManager}
                  changeAppMode={this.changeAppMode}
                  openConfirmationDialog={this.openConfirmationDialog}
                  openSharingManager={this.openSharingManager}
                  show_properties_panel={show_properties_panel}
                  togglePropertiesPanel={this.togglePropertiesPanel}
                ></NavBar>
                <StatusBar app_mode={this.state.mode} changeAppMode={this.changeAppMode}></StatusBar>
                <ViewSwitch settings={general} setViewMode={this.setViewMode} is_compact={is_compact}></ViewSwitch>
                {commands_bar}
                {is_compact && show_properties_panel && <div className="panel-backdrop" onClick={this.togglePropertiesPanel}></div>}
                <PropertiesPanel
                  visible={show_properties_panel}
                  width={layout.panel_width}
                  is_floating={is_compact}
                  data={this.state.model}
                ></PropertiesPanel>
                <ResizeBorder
                  id="properties_panel"
                  visible={show_properties_panel && !is_compact}
                  position={layout.panel_width}
                  changeAppMode={this.changeAppMode}
                ></ResizeBorder>
                <VisualEditor
                  nodes={this.state.nodes}
                  setNodes={this.setNodes}
                  edges={this.state.edges}
                  setEdges={this.setEdges}
                  width={layout.editor_width}
                  nodes_library={nodes_library}
                  is_model_locked={this.state.model_locked}
                  app_mode={this.state.mode}
                ></VisualEditor>
                {(general.side_by_side || general.show_nodes) && <Navigator layout={layout}></Navigator>}
                <ResizeBorder
                  id="renderer_editor"
                  visible={general.side_by_side}
                  position={panel_plus_renderer}
                  changeAppMode={this.changeAppMode}
                ></ResizeBorder>
                <Renderer visible={!general.show_nodes} width={layout.renderer_width} settings={general} layout={layout}></Renderer>
                <SelectionBox
                  visible={this.state.mode === "selecting_nodes"}
                  x={this.state.selection_left}
                  y={this.state.selection_top}
                  mouse_x={this.state.mouse_x}
                  mouse_y={this.state.mouse_y}
                ></SelectionBox>
                <GlobalSettings user={this.state.user}></GlobalSettings>
                <Authentication
                  user={this.state.user}
                  is_auth_form_open={this.state.is_auth_form_open}
                  closeAuthenticationForm={this.closeAuthenticationForm}
                  active_tab_auth_form={this.state.active_tab_auth_form}
                  setActiveTabAuthenticationForm={this.setActiveTabAuthenticationForm}
                ></Authentication>
                <FileManager
                  user={this.state.user}
                  is_file_manager_open={this.state.is_file_manager_open}
                  closeFileManager={this.closeFileManager}
                  file_manager_mode={this.state.file_manager_mode}
                  setFileData={this.setFileData}
                  setModelLock={this.setModelLock}
                ></FileManager>
                <SharingManager
                  is_sharing_manager_open={this.state.is_sharing_manager_open}
                  closeSharingManager={this.closeSharingManager}
                  getContactInformation={this.getContactInformation}
                  file_data={this.getFileData()}
                  setFileData={this.setFileData}
                  user={this.state.user}
                ></SharingManager>
                <VersionManager
                  isOpen={this.state.is_version_manager_open}
                  onClose={this.closeVersionManager}
                  file_history={this.state.file_history}
                  setFileData={this.setFileData}
                  getFileData={this.getFileData}
                  setModelLock={this.setModelLock}
                  openConfirmationDialog={this.openConfirmationDialog}
                  getContactInformation={this.getContactInformation}
                  user={this.state.user}
                ></VersionManager>
              </div>
            </ChakraProvider>
          </GlobalLoadingProvider>
        </AppModeContext.Provider>
      </UserDataContext.Provider>
    );
  }
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<ParamEle />);
