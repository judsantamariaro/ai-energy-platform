import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AnomalyStatusBadge, AnomalyTypeBadge, Confidence, MeterStatusBadge } from './status';

describe('insignias', () => {
  it('muestran los estados en español', () => {
    render(
      <>
        <MeterStatusBadge status="CRITICAL" />
        <AnomalyTypeBadge type="DATA_QUALITY" />
        <AnomalyStatusBadge status="IN_PROGRESS" />
      </>,
    );
    expect(screen.getByText('Crítico')).toBeInTheDocument();
    expect(screen.getByText('Calidad de datos')).toHaveAttribute(
      'title',
      expect.stringContaining('incoherentes'),
    );
    expect(screen.getByText('En investigación')).toBeInTheDocument();
  });

  it('la confianza se lee como en el enunciado: nivel y porcentaje', () => {
    render(<Confidence value={0.97} />);
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('· 97 %')).toBeInTheDocument();
  });
});
