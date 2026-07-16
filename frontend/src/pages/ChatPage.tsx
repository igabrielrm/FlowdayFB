import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Card,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { api, UsuarioDto } from '../api/client';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassSurface } from '../theme/glass';
import type { ChatMessage, Conversation } from '../types/chat';
import { userInitials } from '../types/community';
import { notifyChatUnreadChanged } from '../events';
import { websocketUrl } from '../platform';
import { nativeAuthHeaders } from '../auth/nativeAuth';

function formatMessageTime(fecha?: string | null) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = Number(searchParams.get('user')) || null;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingFrom, setTypingFrom] = useState<number | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedIdRef = useRef(selectedId);
  const stompRef = useRef<Client | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  selectedIdRef.current = selectedId;

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await api.chat.conversations();
    if (res.ok && res.data) setConversations(res.data);
  }, []);

  useEffect(() => {
    loadConversations().finally(() => setLoading(false));
  }, [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    setError(null);
    api.chat.messages(selectedId).then((res) => {
      if (!res.ok) {
        setError(res.error || 'No se pudo cargar la conversación');
        setMessages([]);
        return;
      }
      if (res.data) setMessages(res.data);
    });
    api.chat.markRead(selectedId).then(() => {
      loadConversations();
      notifyChatUnreadChanged();
    });
  }, [loadConversations, selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(websocketUrl('/ws')) as unknown as WebSocket,
      reconnectDelay: 5000,
      debug: () => {},
      beforeConnect: async () => {
        client.connectHeaders = await nativeAuthHeaders();
      },
      onConnect: () => {
        client.subscribe('/user/queue/chat', (message: IMessage) => {
          try {
            const payload = JSON.parse(message.body) as ChatMessage;
            const activeId = selectedIdRef.current;
            if (activeId) {
              const involvesActive =
                payload.remitenteId === activeId || payload.destinatarioId === activeId;
              if (involvesActive) {
                appendMessage({
                  ...payload,
                  propio: payload.remitenteId !== activeId,
                });
                api.chat.markRead(activeId);
              }
            }
            loadConversations();
            notifyChatUnreadChanged();
          } catch {
            /* ignore */
          }
        });
        client.subscribe('/user/queue/chat-typing', (message: IMessage) => {
          try {
            const payload = JSON.parse(message.body) as { fromUserId: number; typing: boolean };
            if (payload.fromUserId === selectedIdRef.current) {
              setTypingFrom(payload.typing ? payload.fromUserId : null);
            }
          } catch {
            /* ignore */
          }
        });
      },
    });
    stompRef.current = client;
    client.activate();
    return () => {
      client.deactivate();
      stompRef.current = null;
    };
  }, [appendMessage, loadConversations]);

  const selectedUser: UsuarioDto | undefined = conversations.find(
    (c) => c.user.id === selectedId,
  )?.user;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !text.trim()) return;
    setSending(true);
    setError(null);
    const res = await api.chat.send(selectedId, text.trim());
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudo enviar');
    } else {
      appendMessage(res.data!);
      setText('');
      loadConversations();
    }
    setSending(false);
  }

  function onTextChange(value: string) {
    setText(value);
    if (!selectedId || !stompRef.current?.connected) return;
    stompRef.current.publish({
      destination: '/app/chat/typing',
      body: JSON.stringify({ destinatarioId: selectedId, typing: value.length > 0 }),
    });
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      stompRef.current?.publish({
        destination: '/app/chat/typing',
        body: JSON.stringify({ destinatarioId: selectedId, typing: false }),
      });
    }, 1200);
  }

  async function deleteConversation() {
    if (!selectedId) return;
    setMenuAnchor(null);
    const res = await api.chat.deleteConversation(selectedId);
    if (!res.ok) {
      setError(res.error || 'No se pudo eliminar el chat');
      return;
    }
    setMessages([]);
    setSearchParams({});
    await loadConversations();
    notifyChatUnreadChanged();
  }

  const showSidebar = !isMobile || !selectedId;
  const showPanel = !isMobile || !!selectedId;

  return (
    <PageStack sx={{ flex: 1, minHeight: 0 }}>
      <PageHeader title="Mensajes" subtitle={isMobile ? undefined : 'Chat en tiempo real con tus conexiones'} />

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={2}
        sx={{ flex: 1, minHeight: { xs: 0, md: 560 }, maxHeight: { md: 'calc(100dvh - 220px)' } }}
      >
        {showSidebar && (
          <Card
            sx={{
              width: { xs: '100%', md: 300 },
              flexShrink: 0,
              flex: { xs: showPanel ? 0 : 1, md: 'none' },
              height: { xs: showPanel ? 'auto' : '100%', md: '100%' },
              minHeight: { xs: showPanel ? 0 : 280, md: 0 },
              maxHeight: { xs: showPanel ? 0 : '100%', md: 'none' },
              display: 'flex',
              flexDirection: 'column',
              ...glassSurface(theme, { strong: true }),
            }}
          >
            <Box px={2.5} py={2}>
              <Typography variant="subtitle1" fontWeight={700}>
                Conversaciones
              </Typography>
            </Box>
            <Divider />
            <Box sx={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <Stack alignItems="center" py={4}>
                  <CircularProgress size={28} />
                </Stack>
              ) : conversations.length === 0 ? (
                <Typography variant="body2" color="text.secondary" p={2.5}>
                  Conecta con compañeros en Comunidad para chatear.
                </Typography>
              ) : (
                <List disablePadding>
                  {conversations.map((c) => (
                    <ListItemButton
                      key={c.user.id}
                      selected={selectedId === c.user.id}
                      onClick={() => setSearchParams({ user: String(c.user.id) })}
                      sx={{ py: 1.5, px: 2.5 }}
                    >
                      <Badge badgeContent={c.noLeidos || undefined} color="error" sx={{ mr: 1.5 }}>
                        <Avatar sx={{ width: 40, height: 40, fontSize: 14, bgcolor: 'primary.main' }}>
                          {userInitials(c.user.nombre)}
                        </Avatar>
                      </Badge>
                      <ListItemText
                        primary={<Typography fontWeight={600}>{c.user.nombre}</Typography>}
                        secondary={c.ultimoMensaje || 'Sin mensajes aún'}
                        slotProps={{ secondary: { noWrap: true } }}
                      />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </Box>
          </Card>
        )}

        {showPanel && (
          <Card
            sx={{
              flex: 1,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              ...glassSurface(theme, { strong: true }),
            }}
          >
            {!selectedId || !selectedUser ? (
              <Stack alignItems="center" justifyContent="center" flex={1} p={4}>
                <Typography color="text.secondary" textAlign="center">
                  Selecciona una conversación para empezar a chatear.
                </Typography>
              </Stack>
            ) : (
              <>
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                  px={2}
                  sx={{
                    flexShrink: 0,
                    borderBottom: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    pt: { xs: 1.25, md: 1.5 },
                    pb: 1.5,
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5} minWidth={0}>
                    {isMobile && (
                      <IconButton
                        onClick={() => setSearchParams({})}
                        sx={{
                          width: 42,
                          height: 42,
                          border: 1,
                          borderColor: 'divider',
                          bgcolor: 'action.hover',
                        }}
                      >
                        <ArrowBackIcon fontSize="small" />
                      </IconButton>
                    )}
                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main' }}>
                      {userInitials(selectedUser.nombre)}
                    </Avatar>
                    <Box minWidth={0}>
                      <Typography fontWeight={700} noWrap>
                        {selectedUser.nombre}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {typingFrom === selectedId ? 'Escribiendo…' : selectedUser.correo}
                      </Typography>
                    </Box>
                  </Stack>
                  <IconButton
                    onClick={(e) => setMenuAnchor(e.currentTarget)}
                    sx={{
                      width: 42,
                      height: 42,
                      border: 1,
                      borderColor: 'divider',
                      bgcolor: 'action.hover',
                    }}
                  >
                    <MoreVertIcon fontSize="small" />
                  </IconButton>
                </Stack>

                <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                  <MenuItem onClick={deleteConversation}>
                    <DeleteOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
                    Eliminar conversación
                  </MenuItem>
                </Menu>

                <Box
                  sx={{
                    flex: 1,
                    overflow: 'auto',
                    px: 2,
                    py: 2,
                    bgcolor: theme.palette.mode === 'light' ? '#f8fafc' : '#0f172a',
                  }}
                >
                  {messages.map((m) => (
                    <Box
                      key={m.id}
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: m.propio ? 'flex-end' : 'flex-start',
                        mb: 1.75,
                      }}
                    >
                      <Box
                        sx={{
                          px: 1.75,
                          py: 1.25,
                          borderRadius: m.propio ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          maxWidth: '78%',
                          bgcolor: m.propio ? 'primary.main' : 'background.paper',
                          color: m.propio ? 'primary.contrastText' : 'text.primary',
                          boxShadow: 1,
                          border: m.propio ? 'none' : 1,
                          borderColor: 'divider',
                        }}
                      >
                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                          {m.contenido}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary" mt={0.5} px={0.5}>
                        {formatMessageTime(m.fecha)}
                      </Typography>
                    </Box>
                  ))}
                  <div ref={bottomRef} />
                </Box>

                {error && (
                  <Alert severity="error" sx={{ mx: 2, mb: 1, flexShrink: 0 }} onClose={() => setError(null)}>
                    {error}
                  </Alert>
                )}

                <Box
                  component="form"
                  onSubmit={send}
                  px={2}
                  py={1.5}
                  sx={{
                    flexShrink: 0,
                    borderTop: 1,
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    pb: { xs: 'max(12px, env(safe-area-inset-bottom))', md: 1.5 },
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="flex-end">
                    <TextField
                      value={text}
                      onChange={(e) => onTextChange(e.target.value)}
                      placeholder="Escribe un mensaje…"
                      fullWidth
                      size="small"
                      multiline
                      maxRows={3}
                      inputProps={{ maxLength: 2000 }}
                    />
                    <IconButton
                      type="submit"
                      color="primary"
                      disabled={sending || !text.trim()}
                      sx={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        bgcolor: 'primary.main',
                        color: 'primary.contrastText',
                        '&:hover': { bgcolor: 'primary.dark' },
                        '&.Mui-disabled': { bgcolor: 'action.disabledBackground' },
                      }}
                    >
                      <SendRoundedIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Box>
              </>
            )}
          </Card>
        )}
      </Stack>
    </PageStack>
  );
}
