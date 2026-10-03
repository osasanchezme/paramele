import React from "react";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink } from "@chakra-ui/react";
import getState from "../getState";
import state from "../state";
import utils from "../utils";

class Navigator extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      path: getState("model_path_print"),
    };
    this.updateNavigator = this.updateNavigator.bind(this);
    this.handleClick = this.handleClick.bind(this);
    window.ParamEle.updateNavigator = this.updateNavigator.bind(this);
  }
  updateNavigator() {
    this.setState({ path: getState("model_path_print") });
  }
  handleClick(event, index) {
    let model_path_print = getState("model_path_print");
    let model_path = getState("model_path");
    if (index === 0){
      model_path_print = [model_path_print[0]];
      model_path = [model_path[0]];
    } else {
      model_path_print = model_path_print.slice(0, index + 1);
      model_path = model_path.slice(0, (index - 1) * 4 + 5);
    }
    state.setState(model_path, "model_path");
    state.setState(model_path_print, "model_path_print");
    // Update the nodes editor
    state.setModelToEditor(getState("model"));
    state.resetView();
    this.updateNavigator();
  }
  render() {
    let { layout } = this.props;
    // The editor is anchored to the right edge, so its left edge is what remains of the width
    let porcentual_width = 100 - layout.editor_width + "%";
    let model_path = this.state.path;
    return (
      <Breadcrumb position={"absolute"} top={55} zIndex={6} left={`calc(${porcentual_width} + 10px)`}>
        {model_path.map((path, index) => {
          if (index === 0) path = utils.getDisplayCopy("navigator", path);
          return (
            <BreadcrumbItem key={index}>
              <BreadcrumbLink onClick={event => this.handleClick(event, index)}>{path}</BreadcrumbLink>
            </BreadcrumbItem>
          );
        })}
      </Breadcrumb>
    );
  }
}

export default Navigator;
