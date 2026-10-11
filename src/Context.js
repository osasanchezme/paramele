import { createContext, useState, useContext } from "react";

export const AppModeContext = createContext(null);
export const UserDataContext = createContext({ role: null });
/**
 * Favorite parameters of the current model
 * @type {React.Context<{favorite_node_ids: Set<string>, toggleFavorite: function(string): void}>}
 */
export const FavoritesContext = createContext({ favorite_node_ids: new Set(), toggleFavorite: () => {} });

const GlobalLoadingContext = createContext();
export const GlobalLoadingProvider = ({ children }) => {
  const [globalLoadingVisible, setGlobalLoadingVisible] = useState(false);
  const [globalLoadingContent, setGlobalLoadingContent] = useState("loading");

  const showGlobalLoading = (content = "loading") => {
    setGlobalLoadingContent(content);
    setGlobalLoadingVisible(true);
  };

  const hideGlobalLoading = () => {
    setGlobalLoadingVisible(false);
    setGlobalLoadingContent("loading");
  };

  // Only changes the message, it does not open the dimmer if it is hidden
  const setGlobalLoadingMsg = (content) => {
    setGlobalLoadingContent(content);
  };

  return (
    <GlobalLoadingContext.Provider value={{ globalLoadingVisible, globalLoadingContent, showGlobalLoading, hideGlobalLoading, setGlobalLoadingMsg }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
};
/**
 *
 * @returns {{globalLoadingVisible: boolean, globalLoadingContent: string, showGlobalLoading: function(content), hideGlobalLoading: function(), setGlobalLoadingMsg: function(content)}}
 */
export const useGlobalLoading = () => useContext(GlobalLoadingContext);
