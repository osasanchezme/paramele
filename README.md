# ParamEle

An open-source node based editor for graphical programming.

## Aspects for the docs

- [ ] Three places where app-related data is stored    
    - [ ] The native state of the ParamEle component -- Used to control and handle state-based behaviors of the app.
    - [ ] The local independent state of the app that syncs with the ReactFlow editor nodes and edges and the settings, also the structure and the globals (`ParamEle.state`) -- Some keys here go to the file exported by the user (settings and model).

- [ ] For adding a new structural node
    - [ ] Create the node renderer itself
    - [ ] Create the execution function for the node
    - [ ] Handle how it is added to the global structural model in the global Logic Runner
    - [ ] Declare the quantity of its value handles (`units` next to `Node` and `Exec`, see `src/js/unitInference.js`)
    - [ ] Add it to the handler of nodes
    - [ ] Add support for it in the renderer itself (Plotly.js)

- [ ] Create types for each new object type that will be used in the app

- [ ] Protocol to add a new modal

- [ ] Protocol to add a form

## Submodules

In the `submodules` folder will be all the submodules that are used in the application. When possible and not too cumbersome, the functions in the submodules shouldn't be imported/used directly in any part of the code, the function should be added to the `submodulesAPI` file, exported and used from there.