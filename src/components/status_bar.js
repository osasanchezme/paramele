import utils from "../utils";
import { VersionBadge } from "./whats_new";

const localGetCopy = (copy_key) => utils.getDisplayCopy("status_bar", copy_key);

function StatusBar({ app_mode, changeAppMode }) {
  return (
    <div className="status-bar">
      <span className="status-bar-hint">{localGetCopy(app_mode)}</span>
      <VersionBadge />
    </div>
  );
}

export default StatusBar;
