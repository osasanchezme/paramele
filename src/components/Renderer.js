import Plot from "react-plotly.js";
import renderer from "../js/renderer";
import React from "react";

class Renderer extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      data: renderer.getData(),
      layout: renderer.getLayout(),
      frames: [],
      config: renderer.getConfig(),
      miniPlotCamera: null,
    };
    this.updateRenderer = this.updateRenderer.bind(this);
    this.handleMainPlotRelayout = this.handleMainPlotRelayout.bind(this);
    window.ParamEle.updateRenderer = this.updateRenderer.bind(this);
  }
  updateRenderer() {
    this.setState({ data: renderer.getData() });
  }
  handleMainPlotRelayout(eventData) {
    // Extract camera eye from the relayout event
    const mainCamera = eventData["scene.camera"];
    const eyeX = mainCamera.eye.x;
    const eyeY = mainCamera.eye.y;
    const eyeZ = mainCamera.eye.z;

    if (eyeX !== undefined && eyeY !== undefined && eyeZ !== undefined) {
      // Normalize the eye vector to keep direction but remove zoom
      const dist = Math.sqrt(eyeX * eyeX + eyeY * eyeY + eyeZ * eyeZ);
      const fixedDist = 3; // fixed distance for the mini plot
      const scale = fixedDist / dist;
      const camera = {
        eye: { x: eyeX * scale, y: eyeY * scale, z: eyeZ * scale },
      };

      this.setState({ miniPlotCamera: camera });
    }
  }
  componentDidUpdate(prevProps) {
    if (prevProps.settings.side_by_side !== this.props.settings.side_by_side || prevProps.width !== this.props.width) {
      this.updateRenderer();
    }
  }
  render() {
    let global_style = { zIndex: this.props.visible ? 4 : 2, width: String(this.props.width) + "%", right: this.props.layout.renderer_right + "%" };

    const miniPlotData = [
      {
        x: [1, 0],
        y: [0, 0],
        z: [0, 0],
        mode: "lines+text",
        line: { width: 5, color: "red" },
        type: "scatter3d",
        hoverinfo: "none",
        text: ["x", ""],
      },
      {
        x: [0, 0],
        y: [0, 1],
        z: [0, 0],
        mode: "lines+text",
        line: { width: 5, color: "green" },
        type: "scatter3d",
        hoverinfo: "none",
        text: ["", "y"],
      },
      {
        x: [0, 0],
        y: [0, 0],
        z: [0, 1],
        mode: "lines+text",
        line: { width: 5, color: "blue" },
        type: "scatter3d",
        hoverinfo: "none",
        text: ["", "z"],
      },
    ];

    const miniPlotLayout = {
      showlegend: false,
      width: 120,
      height: 120,
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(255,255,255,0.1)",
      plot_bgcolor: "rgba(255,255,255,0.1)",
      scene: {
        aspectmode: "data",
        xaxis: {
          ticks: "",
          showticklabels: false,
          zeroline: false,
          title: "",
          gridwidth: 0,
          spikesides: false,
          spikethickness: 0,
          range: [0, 1.5],
        },
        yaxis: {
          ticks: "",
          showticklabels: false,
          zeroline: false,
          title: "",
          gridwidth: 0,
          spikesides: false,
          spikethickness: 0,
          range: [0, 1.5],
        },
        zaxis: {
          ticks: "",
          showticklabels: false,
          zeroline: false,
          title: "",
          gridwidth: 0,
          spikesides: false,
          spikethickness: 0,
          range: [0, 1.5],
        },
      },
    };

    // Merge synced camera into the mini plot layout
    if (this.state.miniPlotCamera) {
      miniPlotLayout.scene.camera = this.state.miniPlotCamera;
    }

    const miniPlotConfig = {
      displayModeBar: false,
      scrollZoom: false,
      displaylogo: false,
    };

    return (
      <div className={"renderer-container"} style={global_style}>
        <Plot
          data={this.state.data}
          layout={this.state.layout}
          frames={this.state.frames}
          config={this.state.config}
          onInitialized={(figure) => this.setState(figure)}
          onUpdate={(figure) => this.setState(figure)}
          onRelayout={this.handleMainPlotRelayout}
          divId={"renderer-container"}
        />
        <div className="axis-indicator">
          <Plot data={miniPlotData} layout={miniPlotLayout} config={miniPlotConfig} />
        </div>
      </div>
    );
  }
}

export default Renderer;
