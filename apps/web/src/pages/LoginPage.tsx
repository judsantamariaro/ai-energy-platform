import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { BrainCircuit, Gauge, ListChecks, Loader2, Zap } from 'lucide-react';
import { BRAND } from '@/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLogin, useMe } from '@/hooks/api';

/** Credenciales del usuario de demostración que crea la API al arrancar (F4-d). */
const DEMO = { email: 'demo@bia.energy', password: 'energia2026' };

const FEATURES = [
  {
    icon: Gauge,
    text: 'Consumo, voltaje, corriente y factor de potencia de cada medidor, hora a hora.',
  },
  {
    icon: BrainCircuit,
    text: 'Detecta anomalías y distingue las reales de las explicables y de los errores de datos.',
  },
  { icon: ListChecks, text: 'Explica cada hallazgo con evidencia y dice qué revisar primero.' },
];

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (user) return <Navigate to={from} replace />;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate(from, { replace: true }) });
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Zap className="size-5" />
          </div>
          <span className="text-lg font-semibold text-white">{BRAND.name}</span>
        </div>
        <div className="max-w-md space-y-8">
          <h1 className="text-3xl leading-tight font-semibold text-white">
            Sepa qué medidor requiere atención, y por qué.
          </h1>
          <ul className="space-y-4">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-sidebar-primary" />
                <span className="text-sidebar-foreground/85">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-sidebar-foreground/50">{BRAND.tagline}</p>
      </section>

      <section className="flex items-center justify-center p-6">
        <form onSubmit={submit} className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Iniciar sesión</h2>
            <p className="text-sm text-muted-foreground">Accede al panel de gestión energética.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Correo</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {login.error && (
              <p role="alert" className="text-sm text-critical">
                {login.error.message}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={login.isPending}>
              {login.isPending && <Loader2 className="size-4 animate-spin" />}
              Entrar
            </Button>
          </div>

          <div className="space-y-2 rounded-xl border bg-muted/50 p-4 text-sm">
            <p className="font-medium">Usuario de demostración</p>
            <p className="text-muted-foreground">
              {DEMO.email} · {DEMO.password}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEmail(DEMO.email);
                setPassword(DEMO.password);
              }}
            >
              Usar credenciales de demo
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
