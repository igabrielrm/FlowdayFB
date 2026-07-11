import { useSearchParams } from 'react-router-dom';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { Button } from '@mui/material';
import { api } from '../api/client';
import ActivityForm from '../components/ActivityForm';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';

export default function ActivityNewPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fechaParam = searchParams.get('fecha') ?? undefined;

  return (
    <PageStack>
      <PageHeader
        title="Nueva actividad"
        subtitle="Se validará contra choques de horario en el servidor."
        actions={
          <Button component={RouterLink} to="/activities">
            Cancelar
          </Button>
        }
      />

      <ActivityForm
        initial={fechaParam ? { fechaInicio: fechaParam } : undefined}
        submitLabel="Crear actividad"
        onCancelTo="/activities"
        onSubmit={async (payload) => {
          const { estado: _estado, ...createPayload } = payload;
          const res = await api.activities.create(createPayload);
          if (!res.ok) return res.error || 'No se pudo crear la actividad';
          if (res.meta?.queued) {
            navigate('/activities', { state: { draftSaved: true } });
            return null;
          }
          navigate('/activities');
          return null;
        }}
      />
    </PageStack>
  );
}
