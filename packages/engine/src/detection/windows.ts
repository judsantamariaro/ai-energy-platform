import { hoursBetween, type Point } from '../series.js';

export interface FlaggedWindow {
  /** Índices en la serie, inclusivos: la ventana va de la primera a la última lectura marcada. */
  startIndex: number;
  endIndex: number;
  flaggedCount: number;
}

/**
 * Agrupa las lecturas marcadas en ventanas. Dos marcas pertenecen a la misma ventana si entre
 * ellas faltan como mucho `maxGapHours` horas; una ventana cuenta si tiene `minFlagged` marcas.
 */
export function groupFlagged(
  points: Point[],
  isFlagged: (point: Point, index: number) => boolean,
  maxGapHours: number,
  minFlagged: number,
): FlaggedWindow[] {
  const windows: FlaggedWindow[] = [];
  let current: FlaggedWindow | null = null;

  const close = () => {
    if (current && current.flaggedCount >= minFlagged) windows.push(current);
    current = null;
  };

  points.forEach((point, index) => {
    if (!isFlagged(point, index)) return;
    if (current && hoursBetween(points[current.endIndex]!, point) - 1 <= maxGapHours) {
      current.endIndex = index;
      current.flaggedCount++;
    } else {
      close();
      current = { startIndex: index, endIndex: index, flaggedCount: 1 };
    }
  });
  close();

  return windows;
}

/** La ventana sigue activa si no hay una recuperación más larga que la tolerancia antes del final. */
export function isOngoing(points: Point[], window: FlaggedWindow, maxGapHours: number): boolean {
  const last = points.at(-1);
  return last !== undefined && hoursBetween(points[window.endIndex]!, last) <= maxGapHours;
}

export function durationHours(points: Point[], window: FlaggedWindow): number {
  return hoursBetween(points[window.startIndex]!, points[window.endIndex]!) + 1;
}
