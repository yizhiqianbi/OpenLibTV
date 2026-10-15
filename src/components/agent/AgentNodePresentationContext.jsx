import { createContext, useContext } from 'react';

const AgentNodePresentationContext = createContext(undefined);

/** Canvas owns live document access; shared input/message views only consume this capability. */
export function AgentNodePresentationProvider({ value, children }) {
  return (
    <AgentNodePresentationContext.Provider value={value}>
      {children}
    </AgentNodePresentationContext.Provider>
  );
}

export function useAgentNodePresentationContext() {
  return useContext(AgentNodePresentationContext);
}
