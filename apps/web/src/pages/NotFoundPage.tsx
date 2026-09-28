import { Link } from 'react-router';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Página no encontrada"
      description="La dirección no existe o el recurso ya no está disponible."
      action={
        <Button asChild variant="outline">
          <Link to="/">Ir al dashboard</Link>
        </Button>
      }
    />
  );
}
