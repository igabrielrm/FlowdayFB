import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, CardContent, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { api } from '../api/client';
import ActivityForm, { detailToFormValues } from '../components/ActivityForm';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import type { ActividadDetail } from '../types/activity';

export default function ActivityEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const activityId = id ?? '';
  const [detail, setDetail] = useState<ActividadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    if (!activityId) {
      setError('Actividad no válida');
      setLoading(false);
      return;
    }
    api.activities.get(activityId).then((res) => {
      if (!res.ok || !res.data) {
        setError(res.error || 'No se pudo cargar la actividad');
      } else if (!res.data.puedeEditar) {
        setError('No tienes permiso para editar esta actividad');
      } else {
        setDetail(res.data);
      }
      setLoading(false);
    });
  }, [activityId]);

  if (loading) {
    return (
      <Stack alignItems="center" py={6}>
        <CircularProgress />
      </Stack>
    );
  }

  if (error || !detail) {
    return (
      <PageStack>
        <Alert severity="error">{error || 'Actividad no encontrada'}</Alert>
        <Button component={RouterLink} to="/activities">
          Volver
        </Button>
      </PageStack>
    );
  }

  return (
    <PageStack>
      <PageHeader
        title="Editar actividad"
        subtitle="Actualiza los datos y compañeros vinculados."
        actions={
          <Button component={RouterLink} to="/activities">
            Cancelar
          </Button>
        }
      />

      <ActivityForm
        initial={detailToFormValues(detail)}
        submitLabel="Guardar cambios"
        onCancelTo="/activities"
        onSubmit={async (payload) => {
          const res = await api.activities.update(activityId, payload);
          if (!res.ok) return res.error || 'No se pudo actualizar';
          navigate('/activities');
          return null;
        }}
      />

      {detail.esPropietario && (
        <Card sx={{ borderColor: 'error.light', borderWidth: 1, borderStyle: 'solid' }}>
          <CardContent>
            <Typography variant="h6" color="error" gutterBottom>
              Zona de peligro
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={2}>
              Eliminar esta actividad de forma permanente. Esta acción no se puede deshacer.
            </Typography>
            <Button
              color="error"
              variant="outlined"
              disabled={deleting}
              onClick={() => setDeleteOpen(true)}
            >
              {deleting ? 'Eliminando…' : 'Eliminar actividad'}
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)}>
        <DialogTitle>¿Eliminar actividad?</DialogTitle>
        <DialogContent>
          <Typography>
            Esta acción es permanente y no se puede deshacer. ¿Estás seguro de eliminar esta actividad?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={deleting} onClick={() => setDeleteOpen(false)}>
            Cancelar
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              const res = await api.activities.remove(activityId);
              if (!res.ok) {
                setError(res.error || 'No se pudo eliminar');
                setDeleting(false);
                setDeleteOpen(false);
                return;
              }
              navigate('/activities');
            }}
          >
            {deleting ? 'Eliminando…' : 'Sí, eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageStack>
  );
}
