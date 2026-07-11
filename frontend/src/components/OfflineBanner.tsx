import { Alert, Button, Snackbar, Stack } from '@mui/material';
import { useOfflineSync } from '../offline/useOfflineSync';

export default function OfflineBanner() {
  const { online, pending, syncing, lastError, syncNow } = useOfflineSync();

  const showOffline = !online;
  const showPending = online && pending > 0;
  const open = showOffline || showPending || !!lastError;

  let message = '';
  let severity: 'warning' | 'info' | 'error' = 'warning';

  if (showOffline) {
    message =
      pending > 0
        ? `Sin conexión — ${pending} borrador${pending === 1 ? '' : 'es'} pendiente${pending === 1 ? '' : 's'} de sincronizar.`
        : 'Sin conexión — puedes crear borradores; se sincronizarán al reconectar.';
    severity = 'warning';
  } else if (syncing) {
    message = `Sincronizando ${pending} borrador${pending === 1 ? '' : 'es'}…`;
    severity = 'info';
  } else if (lastError) {
    message = lastError;
    severity = 'error';
  } else if (showPending) {
    message = `${pending} borrador${pending === 1 ? '' : 'es'} pendiente${pending === 1 ? '' : 's'} de sincronizar.`;
    severity = 'info';
  }

  return (
    <Snackbar
      open={open}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      sx={{ top: { xs: 56, sm: 64 } }}
    >
      <Alert
        severity={severity}
        variant="filled"
        sx={{ width: '100%' }}
        action={
          online && pending > 0 && !syncing ? (
            <Button color="inherit" size="small" onClick={() => syncNow()}>
              Sincronizar
            </Button>
          ) : undefined
        }
      >
        <Stack spacing={0.25}>{message}</Stack>
      </Alert>
    </Snackbar>
  );
}
