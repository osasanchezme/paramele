import generateInputFile from "./submodules/paramele-parsers/structural/csi/generateInputFile";
import { dxf2s3d } from "./submodules/paramele-parsers/structural/dxf/generateS3DModel";
import { csi2s3d } from "./submodules/paramele-parsers/structural/csi/csi2s3d";

const parsers = {
  csi: {
    getSAP2000Model: (s3d_model, version) => generateInputFile(s3d_model, "SAP2000", version),
    getS3DModel: (csi_string) => csi2s3d(csi_string),
  },
  dxf: {
    getS3DModel: (dxf_string) => dxf2s3d(dxf_string),
  },
};
export { parsers };
