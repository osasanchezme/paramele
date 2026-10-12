import generateInputFile from "./submodules/paramele-parsers/structural/csi/generateInputFile";
import { parseDxf } from "./submodules/paramele-parsers/structural/dxf/generateS3DModel";
import { csi2s3d } from "./submodules/paramele-parsers/structural/csi/csi2s3d";

const parsers = {
  csi: {
    getSAP2000Model: (s3d_model, version) => generateInputFile(s3d_model, "SAP2000", version),
    getS3DModel: (csi_string) => csi2s3d(csi_string),
  },
  dxf: {
    /** @returns {import("./submodules/paramele-parsers/structural/dxf/generateS3DModel").dxf_import_result} */
    parse: (dxf_string) => parseDxf(dxf_string),
  },
};
export { parsers };
