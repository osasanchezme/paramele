# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ParamEle is an open-source node-based visual programming editor (Create React App, React 18, Chakra UI, ReactFlow, Plotly.js, Firebase project `paramele-prod`: Auth, Firestore, Storage, Hosting) focused on parametric structural models. The user wires nodes in a ReactFlow graph, the graph is evaluated into a structural model (SkyCiv S3D JSON format), rendered in 3D with Plotly, and can be solved remotely.

## Commands

- `npm start`: dev server at http://localhost:3000 (browser does not auto-open)
- `npm run build`: production build into `build/`
- `npm test`: Jest via react-scripts (watch mode). Single test: `npm test -- path/to/file.test.js` (add `--watchAll=false` for a single run). The only existing tests are in the submodule (`src/submodules/paramele-parsers/utils/units_converter.test.js`).
- `npm run deploy`: builds and publishes to Firebase Hosting site `paramele-app` (https://paramele-app.web.app, custom domain https://app.paramele.com) (needs the `firebase` CLI, logged in). `npm run deploy:rules` deploys `firestore.rules` and `storage.rules`. `npm run deploy:cors` applies `cors.json` to the Storage bucket (needs `gcloud`, logged in); model files are read with `getBlob`, which fails without it.
- `npm run theme`: regenerates Chakra theme typings from `src/theme.js`
- Formatting: Prettier (`.prettierrc`: 2 spaces, printWidth 150). No separate lint script; ESLint runs through react-scripts (`react-app` config).
- Submodule: `src/submodules/paramele-parsers` is a git submodule (SSH URL). Run `git submodule update --init` after cloning.

## Architecture

### Three places app data lives
1. **React state of the root `ParamEle` component** (`src/index.js`, initial values in `src/initial_state.js`): UI and state-driven behavior (modals open/closed, user, file metadata, app mode, `model_locked`, and the lifted `nodes`/`edges` that feed `VisualEditor`).
2. **Global mutable state on `window.ParamEle.state`** (created in `src/state.js#setInitialState`): `model` (ReactFlow nodes/edges), `settings`, `structure` (generated S3D model), `results`, `globals` (scratch variables used during evaluation), `language`/`words_map`, and `model_path`. `settings` and `model` are what gets exported to files.
   - Read it with `getState(key)` (`src/getState.js`), which returns a **deep clone**; `getState("model")` follows `model_path` (used to edit the inner model of a wrapper node).
   - Write it with `state.setState(value, key)` (also deep-clones) and `state.setGlobalVariable/getGlobalVariable`.
3. **ReactFlow instance** (`window.ParamEle.rfInstance`, via `state.getRfInstance()`).

Many functions are also attached to `window.ParamEle` (e.g. `updateNodesFromLocalState`, `changeGeneralSettingValue`, `getUser`, `nodesLibrary`) so non-React modules can reach into the root component. `TODO.md` tracks the ongoing refactor away from `window.ParamEle.state`/`getRfInstance` toward the Context API (`src/Context.js`); prefer not to add new global usages.

### Evaluation flow
`updateStateFromFlow` (state.js) copies ReactFlow nodes/edges into the global model when `auto_update` is on, then calls `logic_runner.run()` (`src/js/globalLogicRunner.js`):
- Resets `structure`, runs `calculateModel`, pushes updated nodes back to ReactFlow, then refreshes the Plotly renderer and properties panel.
- `calculateModel` builds the target→sources map from edges, expands `variableRange` (slider) nodes into combinations (when `sliders_mode === "sliders_all"`, each combination is offset in Z by `spacing_between_combinations`), then executes each connected node's `Exec` and writes outputs into `node.data[handle_id]`.
- Output handle names determine how results are handled: `node`, `member`, `support`, `point_load`, `distributed_load`, `plate`, `moment`, `section`, `material` outputs are added to `structure[<type>s]` with an auto-allocated numeric ID; `result` outputs store `.value`; `member_list`/`node_list` accumulate IDs.
- `nodesWrapper` recursively calls `logic_runner.calculateModel` on its inner model.

### Nodes (`src/flow-nodes/`)
- Each node type has a `Node` React component (usually `GenericInOutNode` from `generics/genericInOut.js`) and an `Exec(args, data)` function, exported as `{ Node, Exec }` and registered in `handler.js` (`createNodesLibrary` → `nodes`, `execution`, `mapping`).
- **Handle ID convention**: `name-type[-default]`, e.g. `x-value`, `section_id-id-1`, `node_out-id`. Types include `value`, `id`, `ids`, `name`, `string`. Source handles use the `_out` suffix, which is stripped by `utils.splitArgName`. `utils.convertNodeToStructuralArgs(args, target_ids)` parses inputs into typed values with defaults.
- Adding a structural node (from README): create the renderer component, create the Exec function, handle it in the global logic runner (add its type to `STRUCTURAL_RESULT_TYPES` if needed), register it in `handler.js`, add rendering support in `src/js/renderer.js` (Plotly), and add its display copy to both language files.

### Other key modules
- `src/js/structure.js`: solving. `skyciv` posts to `https://api.skyciv.com/v3`; `pynite` posts to a local server at `http://127.0.0.1:5013/solve`. Also exports input files (e.g. SAP2000) through the parsers.
- `src/js/repair.js`: normalizes loaded models, settings (against `src/settings_template.json`), and structural models before solving/exporting.
- `src/js/firebase.js` + `src/js/file.js`: auth, file save/open, versions, sharing. Firestore data model: `users/{uid}` (private profile) with `folders/{folder_id}`, `profiles/{uid}` (public username/email), `email_index/{email}` (uid lookup to share by email), and `projects/{model_id}` (owner, name, folder `path`, `history`, `shared` + `shared_with` kept in sync). Model/results JSON files are in Storage at `projects/{model_id}/{version}/{model|results}.json`, guarded by `storage.rules` through the project document. `getUserProjects` rebuilds the nested folder tree the file manager expects, including the virtual `_default_shared_with_me_` folder (keys `<name>__<model_id>`). Change `firestore.rules` together with any change to these documents. Files can be opened from URL params `path` and `name`. Permissions per role are in `src/js/userRoles.js`. Async helpers return `getProcessResponseObject` (`src/js/processResponse.js`): `{ status, msg, data, success }`.
- `src/state.js` imports a template JSON from `src/data/` as the initial model; swap the commented import to change the startup template.
- Types are JSDoc typedefs in `src/js/types.js` and `src/js/state_types.js` (no TypeScript). Add typedefs for new object types.

### i18n
All UI strings go through `utils.getDisplayCopy(group, key)`, which looks up `src/data/languages/{es,en}.json` (it falls back to the key itself). Language comes from the `?lang=` URL param and defaults to `es`. `notify(type, copy_key, ...)` also takes copy keys.

### Submodules
Code from `src/submodules/*` should not be imported directly across the app. Expose it through `src/submodulesAPI.js` and import from there.
