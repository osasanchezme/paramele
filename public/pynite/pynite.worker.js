/* PyNite solver running in the browser through Pyodide (CPython compiled to WebAssembly).
 *
 * Module Web Worker (Pyodide >= 314 no longer supports classic workers), served as a static file next to:
 *   model_solver.py, section_properties.py   (copied from src/pynite/)
 *   wheels/*.whl      (PyNiteFEA and prettytable, pure-Python wheels)
 * Use scripts/build_browser_bundle.sh to produce that folder.
 *
 * Protocol:
 *   in:  { id, type: "init" }            -> out: { id, ok, timings }
 *   in:  { id, type: "solve", model }    -> out: { id, ok, results, timings } | { id, ok: false, error }
 */

const PYODIDE_VERSION = "314.0.7";
const PYODIDE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PY_MODULES = ["section_properties.py", "model_solver.py"];
const WHEELS = ["pynitefea-3.2.0-py3-none-any.whl", "prettytable-3.18.0-py3-none-any.whl"];
// The dense numpy solver needs (6 * nodes)^2 doubles; above this size, load scipy (~13 MB) and solve sparse.
const DENSE_MAX_NODES = 400;

const BASE_URL = new URL(".", self.location.href).href;

// PyNite imports matplotlib (plots) and scipy (sparse solver) at module level, but the dense
// linear analysis never uses them. Stub them so we don't download ~25 MB of unused packages.
const STUBS_PY = `
import sys, types

def _stub(name):
    module = types.ModuleType(name)
    def __getattr__(attr):
        def unavailable(*args, **kwargs):
            raise ImportError(f"{name}.{attr} is not available in the browser build of the PyNite solver")
        return unavailable
    module.__getattr__ = __getattr__
    sys.modules[name] = module

for _name in ["matplotlib", "matplotlib.pyplot", "matplotlib.patches", "scipy"]:
    _stub(_name)
`;

const USE_REAL_SCIPY_PY = `
import sys
del sys.modules["scipy"]
import scipy, scipy.sparse, scipy.sparse.linalg
import Pynite.FEModel3D
Pynite.FEModel3D.sp = scipy
`;

let pyodideReady = null;
let scipyReady = null;

async function initPyodide() {
  const t0 = performance.now();
  const { loadPyodide } = await import(`${PYODIDE_URL}pyodide.mjs`);
  const pyodide = await loadPyodide({ indexURL: PYODIDE_URL });
  await pyodide.loadPackage(["numpy", "wcwidth", "micropip"]);
  pyodide.runPython(STUBS_PY);
  const micropip = pyodide.pyimport("micropip");
  await micropip.install(
    WHEELS.map((whl) => `${BASE_URL}wheels/${whl}`),
    { deps: false }
  );
  for (const file of PY_MODULES) {
    const src = await (await fetch(`${BASE_URL}${file}`)).text();
    pyodide.FS.writeFile(`/home/pyodide/${file}`, src);
  }
  pyodide.runPython("import json, model_solver");
  return { pyodide, init_ms: performance.now() - t0 };
}

function getPyodide() {
  if (!pyodideReady) pyodideReady = initPyodide();
  return pyodideReady;
}

async function ensureScipy(pyodide) {
  if (!scipyReady) {
    scipyReady = pyodide.loadPackage("scipy").then(() => pyodide.runPython(USE_REAL_SCIPY_PY));
  }
  return scipyReady;
}

async function solve(model) {
  const { pyodide } = await getPyodide();
  const sparse = Object.keys(model.nodes || {}).length > DENSE_MAX_NODES;
  if (sparse) await ensureScipy(pyodide);
  const t0 = performance.now();
  pyodide.globals.set("model_json", JSON.stringify(model));
  const results_json = pyodide.runPython(
    `json.dumps(model_solver.solve(json.loads(model_json), sparse=${sparse ? "True" : "False"}))`
  );
  pyodide.globals.delete("model_json");
  return { results: JSON.parse(results_json), solve_ms: performance.now() - t0, sparse };
}

self.onmessage = async (event) => {
  const { id, type, model } = event.data;
  try {
    if (type === "init") {
      const { init_ms } = await getPyodide();
      self.postMessage({ id, ok: true, timings: { init_ms } });
    } else if (type === "solve") {
      const { init_ms } = await getPyodide();
      const { results, solve_ms, sparse } = await solve(model);
      self.postMessage({ id, ok: true, results, timings: { init_ms, solve_ms, sparse } });
    } else {
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({ id, ok: false, error: String(error && error.message ? error.message : error) });
  }
};
