import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useAuth } from '../auth/AuthContext';
import { userInitials } from '../types/community';
import { assetUrl } from '../platform';
import {
  searchUsers,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
  subscribeToFriendRequests,
  subscribeToFriends,
  type FriendUser,
} from '../firebase/community';
import type { Unsubscribe } from 'firebase/firestore';

function RelationActions({
  item,
  busyId,
  onAction,
}: {
  item: FriendUser;
  busyId: string | null;
  onAction: (action: string, userId: string, conexionId?: string | null) => void;
}) {
  const { uid, status, conexionId } = item as any;
  const itemId = (item as any).id ?? uid;

  if (status === 'accepted') {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip label="Conectado" color="success" size="small" />
      </Stack>
    );
  }
  if (status === 'pending_sent') {
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Chip label="Solicitud enviada" color="info" size="small" />
        {conexionId && (
          <Button
            size="small"
            disabled={busyId === itemId}
            onClick={() => onAction('cancel', itemId, conexionId)}
          >
            Cancelar
          </Button>
        )}
      </Stack>
    );
  }
  if (status === 'pending_received' && conexionId) {
    return (
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Button
          size="small"
          variant="contained"
          disabled={busyId === itemId}
          onClick={() => onAction('accept', itemId, conexionId)}
        >
          Aceptar
        </Button>
        <Button
          size="small"
          disabled={busyId === itemId}
          onClick={() => onAction('reject', itemId, conexionId)}
        >
          Rechazar
        </Button>
      </Stack>
    );
  }
  return (
    <Button
      size="small"
      variant="contained"
      disabled={busyId === itemId}
      onClick={() => onAction('request', itemId)}
    >
      {busyId === itemId ? 'Enviando…' : 'Solicitar amistad'}
    </Button>
  );
}

function UserRow({
  item,
  busyId,
  onAction,
}: {
  item: FriendUser;
  busyId: string | null;
  onAction: (action: string, userId: string, conexionId?: string | null) => void;
}) {
  const { nombre, correo, foto } = item;
  const uid = String(item.id ?? (item as any).uid ?? '');

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
          {foto ? (
            <Avatar src={assetUrl(foto)} alt="" sx={{ width: 48, height: 48 }} />
          ) : (
            <Avatar sx={{ width: 48, height: 48 }}>{userInitials(nombre)}</Avatar>
          )}
          <Box flex={1} minWidth={0}>
            <Typography fontWeight={700} color="text.primary" noWrap>
              {nombre}
            </Typography>
            <Typography variant="body2" color="text.secondary" noWrap>
              {correo}
            </Typography>
          </Box>
          <Box>
            <RelationActions item={item} busyId={busyId} onAction={onAction} />
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function CommunityPage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<FriendUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendUser[]>([]);

  // Vista para usuarios no autenticados o invitados
  if (!authLoading && (!user || user.isAnonymous)) {
    return (
      <PageStack>
        <PageHeader title="Comunidad" subtitle="Conecta con otros estudiantes" />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" gutterBottom variant="h6">
            Inicia sesión para acceder a la Comunidad y conectar con otros estudiantes.
          </Typography>
          <Button onClick={() => navigate('/login')} variant="contained" sx={{ mt: 2, borderRadius: 2 }}>
            Iniciar Sesión / Registrarse
          </Button>
        </Box>
      </PageStack>
    );
  }
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Real-time subscription for pending requests
  useEffect(() => {
    const unsub = subscribeToFriendRequests(
      (requests) => setPendingRequests(requests),
      (err) => setError('Error al cargar solicitudes: ' + err.message),
    );
    return () => unsub();
  }, []);

  // Real-time subscription for friends list
  useEffect(() => {
    const unsubs = subscribeToFriends(
      (friendList) => {
        setFriends(friendList);
        setLoading(false);
      },
      (err) => {
        setError('Error al cargar amigos: ' + err.message);
        setLoading(false);
      },
    );
    return () => unsubs.forEach((u) => u());
  }, []);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    setError(null);
    try {
      const results = await searchUsers(q || '');
      setUsers(results);
    } catch (err) {
      setError('No se pudieron cargar los usuarios');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(debouncedQuery.trim() || undefined);
  }, [debouncedQuery, load]);

  // Merge friends into the users list for display
  const mergedUsers = useMemo(() => {
    if (!query.trim()) return [];
    return users.map((u) => {
      const itemId = String(u.id);
      const friend = friends.find((f) => String(f.id) === itemId);
      const pending = pendingRequests.find((p) => String(p.id) === itemId);
      if (friend) return { ...u, status: friend.status, conexionId: friend.conexionId };
      if (pending) return { ...u, status: pending.status, conexionId: pending.conexionId };
      return u;
    });
  }, [users, friends, pendingRequests, query]);

  async function handleAction(action: string, userId: string, conexionId?: string | null) {
    setBusyId(userId);
    setError(null);
    let res: string | null;
    try {
      if (action === 'request') res = await sendFriendRequest(userId);
      else if (action === 'accept' && conexionId) res = await acceptFriendRequest(conexionId);
      else if (action === 'reject' && conexionId) res = await rejectFriendRequest(conexionId);
      else if (action === 'cancel' && conexionId) res = await cancelFriendRequest(conexionId);
      else res = 'Acción no válida';

      if (res) setError(res);
      else if (debouncedQuery.trim()) await load(debouncedQuery.trim() || undefined);
    } catch (err) {
      setError('No se pudo completar la acción');
    }
    setBusyId(null);
  }

  return (
    <PageStack>
      <PageHeader
        title="Comunidad"
        subtitle="Envía solicitudes de amistad y chatea con tus conexiones"
      />

      {error && <Alert severity="error">{error}</Alert>}

      {pendingRequests.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Solicitudes pendientes ({pendingRequests.length})
            </Typography>
            <Stack spacing={2}>
              {pendingRequests.map((item) => (
                <UserRow key={String(item.id)} item={item} busyId={busyId} onAction={handleAction} />
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Buscar compañeros
          </Typography>
          <TextField
            placeholder="Buscar por nombre o correo…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            size="small"
            sx={{ mb: 2 }}
          />

          {loading ? (
            <Stack alignItems="center" py={3}>
              <CircularProgress size={28} />
            </Stack>
          ) : mergedUsers.length === 0 && query.trim() ? (
            <Typography color="text.secondary">No se encontraron usuarios.</Typography>
          ) : query.trim() ? (
            <Stack spacing={2}>
              {mergedUsers.map((item) => (
                <UserRow key={String(item.id)} item={item} busyId={busyId} onAction={handleAction} />
              ))}
            </Stack>
          ) : null}
        </CardContent>
      </Card>
    </PageStack>
  );
}