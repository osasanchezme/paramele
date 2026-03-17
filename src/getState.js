function getState(key) {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const raw_state = window.ParamEle.state;

  if (typeof key === "undefined") return clone(raw_state);

  if (key === "model") {
    let model = raw_state;
    let model_path = raw_state.model_path;
    for (let i = 0; i < model_path.length; i++) {
      model = model[model_path[i]];
    }
    return clone(model);
  }

  return clone(raw_state[key]);
}

export default getState;
