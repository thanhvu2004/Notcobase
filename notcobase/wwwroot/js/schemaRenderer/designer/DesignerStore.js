(function (window, React) {
  window.Notcobase = window.Notcobase || {};

  const createStore = window.zustandVanilla?.createStore;

  function createFallbackStore(initializer) {
    let state;
    const listeners = new Set();
    const api = {
      setState(partial) {
        const nextState = typeof partial === "function" ? partial(state) : partial;
        state = { ...state, ...nextState };
        listeners.forEach((listener) => listener());
      },
      getState() {
        return state;
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };

    state = initializer(api.setState, api.getState, api);
    return api;
  }

  const designerStore = (createStore || createFallbackStore)((set) => ({
    selectedNodeId: null,
    hoveredNodeId: null,
    draggingNodeId: null,
    setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
    setHoveredNodeId: (hoveredNodeId) => set({ hoveredNodeId }),
    setDraggingNodeId: (draggingNodeId) => set({ draggingNodeId }),
    clearInteractionState: () => set({ hoveredNodeId: null, draggingNodeId: null }),
  }));

  function useDesignerStore(selector) {
    const select = selector || ((state) => state);
    return React.useSyncExternalStore(
      designerStore.subscribe,
      () => select(designerStore.getState()),
      () => select(designerStore.getState()),
    );
  }

  window.Notcobase.DesignerStore = designerStore;
  window.Notcobase.useDesignerStore = useDesignerStore;
})(window, React);
