import { createContext, useContext } from 'react';

export interface AnalysisPanelState {
  open: () => void;
  /** Lanza el análisis (o sigue el que está en curso) y abre el panel. */
  run: () => void;
}

export const AnalysisPanelContext = createContext<AnalysisPanelState | null>(null);

export function useAnalysisPanel() {
  const ctx = useContext(AnalysisPanelContext);
  if (!ctx) throw new Error('useAnalysisPanel debe usarse dentro de AnalysisPanelProvider');
  return ctx;
}
