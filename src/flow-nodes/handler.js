import BasicInputNodes from "./basicInput";
import TrigonometricNodes from "./trigoMath";
import BasicMathNodes from "./basicMath";
import BasicStructuralNodes from "./basicStructural";
import StructuralSectionNodes from "./structuralSections";
import NodesWrapperNode from "./nodesWrapper";
import StructuralResultsNodes from "./structuralResults";
import DataDisplayNodes from "./dataDisplay";
import utils from "../utils";

function createNodesLibrary() {
  function localGetCopy(node_name) {
    return utils.getDisplayCopy("nodes", node_name);
  }
  const global_library_wrapper = {
    inputNumber: { node_component: BasicInputNodes.InputNumberNode, label: localGetCopy("inputNumber") },
    inputString: { node_component: BasicInputNodes.InputStringNode, label: localGetCopy("inputString") },
    variableRange: { node_component: BasicInputNodes.VariableRangeNode, label: localGetCopy("variableRange") },
    // Basic math
    sumNumbers: { node_component: BasicMathNodes.MathSumNode, label: localGetCopy("sumNumbers") },
    multiplyNumbers: { node_component: BasicMathNodes.MathMultiplyNode, label: localGetCopy("multiplyNumbers") },
    divideNumbers: { node_component: BasicMathNodes.MathDivideNode, label: localGetCopy("divideNumbers") },
    roundNumber: { node_component: BasicMathNodes.MathRoundNode, label: localGetCopy("roundNumber") },
    powerNumber: { node_component: BasicMathNodes.MathPowerNode, label: localGetCopy("powerNumber") },
    rootNumber: { node_component: BasicMathNodes.MathRootNode, label: localGetCopy("rootNumber") },
    // Trigonometric math
    sin: { node_component: TrigonometricNodes.MathSinNode, label: localGetCopy("sin") },
    cos: { node_component: TrigonometricNodes.MathCosNode, label: localGetCopy("cos") },
    tan: { node_component: TrigonometricNodes.MathTanNode, label: localGetCopy("tan") },
    asin: { node_component: TrigonometricNodes.MathAsinNode, label: localGetCopy("asin") },
    acos: { node_component: TrigonometricNodes.MathAcosNode, label: localGetCopy("acos") },
    atan: { node_component: TrigonometricNodes.MathAtanNode, label: localGetCopy("atan") },
    deg2rad: { node_component: TrigonometricNodes.MathDeg2RadNode, label: localGetCopy("deg2rad") },
    // Basic structural
    structuralNode: { node_component: BasicStructuralNodes.StructuralNodeNode, label: localGetCopy("structuralNode") },
    structuralMember: { node_component: BasicStructuralNodes.StructuralMemberNode, label: localGetCopy("structuralMember") },
    structuralFixedSupport: { node_component: BasicStructuralNodes.StructuralFixedSupportNode, label: localGetCopy("structuralFixedSupport") },
    structuralPinSupport: { node_component: BasicStructuralNodes.StructuralPinSupportNode, label: localGetCopy("structuralPinSupport") },
    structuralGenericSupport: { node_component: BasicStructuralNodes.StructuralGenericSupportNode, label: localGetCopy("structuralGenericSupport") },
    structuralPointLoad: { node_component: BasicStructuralNodes.StructuralPointLoadNode, label: localGetCopy("structuralPointLoad") },
    structuralDistributedLoad: {
      node_component: BasicStructuralNodes.StructuralDistributedLoadNode,
      label: localGetCopy("structuralDistributedLoad"),
    },
    structuralPlate: { node_component: BasicStructuralNodes.StructuralPlateNode, label: localGetCopy("structuralPlate") },
    structuralMoment: { node_component: BasicStructuralNodes.StructuralMomentNode, label: localGetCopy("structuralMoment") },
    structuralPressure: { node_component: BasicStructuralNodes.StructuralPressureNode, label: localGetCopy("structuralPressure") },
    structuralMaterial: { node_component: BasicStructuralNodes.StructuralMaterialNode, label: localGetCopy("structuralMaterial") },
    // Section shapes
    structuralRectangleSection: { node_component: StructuralSectionNodes.RectangleNode, label: localGetCopy("structuralRectangleSection") },
    structuralCircularSection: { node_component: StructuralSectionNodes.CircularNode, label: localGetCopy("structuralCircularSection") },
    structuralGenericSection: { node_component: StructuralSectionNodes.GenericNode, label: localGetCopy("structuralGenericSection") },
    // Nodes Wrapper
    nodesWrapper: { node_component: NodesWrapperNode, label: localGetCopy("nodesWrapper") },
    // Structural results
    structuralMemberResult: { node_component: StructuralResultsNodes.MemberResultNode, label: localGetCopy("structuralMemberResult") },
    structuralNodeResult: { node_component: StructuralResultsNodes.NodeResultNode, label: localGetCopy("structuralNodeResult") },
    // Data display
    dataDisplay2DPlot: { node_component: DataDisplayNodes.Display2DPlotNode, label: localGetCopy("dataDisplay2DPlot") },
    dataDisplayTable: { node_component: DataDisplayNodes.DisplayTableNode, label: localGetCopy("dataDisplayTable") },
  };

  let nodes = {};
  let execution = {};
  let mapping = {};

  Object.entries(global_library_wrapper).forEach(([key, value]) => {
    nodes[key] = value.node_component.Node;
    execution[key] = value.node_component.Exec;
    mapping[value.label] = key;
  });

  return { nodes, execution, mapping };
}

export default createNodesLibrary;
