import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  Fab,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import { api, type AssistantProposal } from '../api/client';
import { modalSlotProps } from '../theme/modal';
import { ASSISTANT_ACTION_EVENT } from '../events';

type Msg = {
  rol: 'user' | 'assistant';
  contenido: string;
  proposal?: AssistantProposal | null;
};

const STORAGE_KEY = 'flowday-ia-chat';

function proposalSummary(proposal: AssistantProposal) {
  if (proposal.summary) return proposal.summary;
  const payload = proposal.payload ?? {};
  const title = String(payload.title ?? payload.activityTitle ?? 'Actividad');
  const date = payload.date ? ` · ${String(payload.date)}` : '';
  const time = payload.time ? ` a las ${String(payload.time).slice(0, 5)}` : '';
  return proposal.type === 'CREATE_ACTIVITY'
    ? `Crear “${title}”${date}${time}`
    : `Reagendar “${title}”${date}${time}`;
}

function loadStoredMessages(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Msg[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

type Props = {
  /** En chat, el FAB va arriba a la derecha para no tapar el enviar. */
  fabOnTop?: boolean;
};

export default function VirtualCompanion({ fabOnTop = false }: Props) {
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>(() => loadStoredMessages());
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [iaReady, setIaReady] = useState<boolean | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const persistMessages = useCallback((next: Msg[]) => {
    setMessages(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore quota */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    api.ia.status().then((res) => {
      if (res.ok && res.data) setIaReady(res.data.ready);
      else setIaReady(false);
    });
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  function clearChat() {
    persistMessages([]);
  }

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const userMsg = text.trim();
    setText('');
    const next = [...messages, { rol: 'user' as const, contenido: userMsg }];
    persistMessages(next);
    setSending(true);
    const res = await api.assistant.message(
      userMsg,
      messages.map((m) => ({ rol: m.rol, contenido: m.contenido })),
    );
    if (res.ok && res.data?.respuesta) {
      const note = res.data.fallback ? ' (modo sin IA — revisa Groq en el servidor)' : '';
      persistMessages([
        ...next,
        {
          rol: 'assistant',
          contenido: res.data.respuesta + note,
          proposal: res.data.proposal,
        },
      ]);
    } else {
      persistMessages([
        ...next,
        {
          rol: 'assistant',
          contenido:
            res.error ||
            'No pude responder. Verifica que GROQ_API_KEY esté en .env y reinicia el backend.',
        },
      ]);
    }
    setSending(false);
  }

  async function resolveProposal(proposal: AssistantProposal, action: 'confirm' | 'cancel') {
    if (!navigator.onLine) return;
    setActionBusy(proposal.id);
    const res =
      action === 'confirm'
        ? await api.assistant.confirm(proposal.id)
        : await api.assistant.cancel(proposal.id);

    if (res.ok) {
      const status = action === 'confirm' ? 'CONFIRMED' : 'CANCELLED';
      const updated = messages.map((message) =>
        message.proposal?.id === proposal.id
          ? { ...message, proposal: { ...message.proposal, status } as AssistantProposal }
          : message,
      );
      const responseMessage =
        action === 'confirm'
          ? 'Listo, apliqué el cambio y actualicé tu planificación.'
          : 'De acuerdo, cancelé la propuesta.';
      persistMessages([...updated, { rol: 'assistant', contenido: responseMessage }]);
      window.dispatchEvent(new CustomEvent(ASSISTANT_ACTION_EVENT));
    } else {
      persistMessages([
        ...messages,
        {
          rol: 'assistant',
          contenido: res.error || 'No pude aplicar esa propuesta. Intenta consultarla nuevamente.',
        },
      ]);
    }
    setActionBusy(null);
  }

  return (
    <>
      <Fab
        color="primary"
        aria-label="Compañero virtual"
        onClick={() => setOpen(true)}
        size={fabOnTop ? 'medium' : 'large'}
        sx={{
          position: 'fixed',
          right: 16,
          zIndex: (t) => t.zIndex.speedDial,
          ...(fabOnTop
            ? { top: { xs: 72, md: 80 } }
            : { bottom: { xs: 'calc(64px + env(safe-area-inset-bottom))', md: 24 } }),
        }}
      >
        <SmartToyOutlinedIcon />
      </Fab>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullScreen={fullScreen}
        fullWidth
        maxWidth="sm"
        slotProps={{
          paper: {
            sx: {
              ...modalSlotProps(theme).paper.sx,
              height: { xs: '100dvh', sm: 520 },
              display: 'flex',
              flexDirection: 'column',
            },
          },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{
            flexShrink: 0,
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            pt: { xs: 'calc(12px + env(safe-area-inset-top))', sm: 1.75 },
            pb: 1.5,
            bgcolor: 'background.paper',
          }}
        >
          <Box>
            <Typography variant="h6" fontWeight={700} lineHeight={1.2}>
              Compañero virtual
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Planifica y confirma cambios contigo
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            {messages.length > 0 && (
              <Tooltip title="Limpiar conversación">
                <IconButton
                  onClick={clearChat}
                  aria-label="Limpiar chat"
                  sx={{
                    width: 42,
                    height: 42,
                    border: 1,
                    borderColor: 'divider',
                    bgcolor: 'action.hover',
                    '&:hover': { bgcolor: 'action.selected' },
                  }}
                >
                  <DeleteOutlinedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <IconButton
              onClick={() => setOpen(false)}
              aria-label="Cerrar"
              sx={{
                width: 42,
                height: 42,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
                '&:hover': { bgcolor: 'action.selected' },
              }}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Stack>

        {iaReady === false && (
          <Alert severity="warning" sx={{ mx: 2.5, mt: 1.5, flexShrink: 0 }}>
            Groq no está configurado. Añade GROQ_API_KEY al archivo .env en la raíz del proyecto y reinicia el backend.
          </Alert>
        )}

        <Box sx={{ flex: 1, overflow: 'auto', px: 2.5, py: 2, bgcolor: 'background.paper' }}>
          <Stack spacing={1.5}>
            {messages.length === 0 && (
              <Typography variant="body2" color="text.secondary">
                Puedo consultar tus actividades y horario, ayudarte a planificar y proponerte crear o reagendar
                actividades. Siempre te pediré confirmación antes de cambiar algo.
              </Typography>
            )}
            {messages.map((m, i) => (
              <Stack
                key={i}
                spacing={1}
                sx={{
                  alignSelf: m.rol === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: { xs: '94%', sm: '85%' },
                }}
              >
                <Box
                  sx={{
                    px: 1.5,
                    py: 1.25,
                    borderRadius: m.rol === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                    bgcolor: m.rol === 'user' ? 'primary.main' : 'action.hover',
                    color: m.rol === 'user' ? 'primary.contrastText' : 'text.primary',
                  }}
                >
                  <Typography variant="body2" sx={{ lineHeight: 1.5 }}>
                    {m.contenido}
                  </Typography>
                </Box>

                {m.proposal && (
                  <Card variant="outlined" sx={{ bgcolor: 'background.paper' }}>
                    <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                      <Stack spacing={1.25}>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
                          <Typography variant="subtitle2" fontWeight={700}>
                            Cambio propuesto
                          </Typography>
                          <Chip
                            size="small"
                            label={
                              m.proposal.status === 'CONFIRMED'
                                ? 'Aplicado'
                                : m.proposal.status === 'CANCELLED'
                                  ? 'Cancelado'
                                  : m.proposal.status === 'EXPIRED'
                                    ? 'Expirado'
                                    : 'Pendiente'
                            }
                            color={m.proposal.status === 'CONFIRMED' ? 'success' : 'default'}
                          />
                        </Stack>
                        <Typography variant="body2">{proposalSummary(m.proposal)}</Typography>
                        {!!m.proposal.conflicts?.length && (
                          <Alert severity="warning">
                            {m.proposal.conflicts.join(' · ')}
                          </Alert>
                        )}
                        {(m.proposal.status == null || m.proposal.status === 'PENDING') && (
                          <Stack direction="row" spacing={1}>
                            <Button
                              size="small"
                              variant="contained"
                              disabled={!!actionBusy || !navigator.onLine}
                              onClick={() => resolveProposal(m.proposal!, 'confirm')}
                            >
                              {actionBusy === m.proposal.id ? (
                                <CircularProgress size={18} color="inherit" />
                              ) : (
                                'Confirmar'
                              )}
                            </Button>
                            <Button
                              size="small"
                              disabled={!!actionBusy || !navigator.onLine}
                              onClick={() => resolveProposal(m.proposal!, 'cancel')}
                            >
                              Cancelar
                            </Button>
                          </Stack>
                        )}
                      </Stack>
                    </CardContent>
                  </Card>
                )}
              </Stack>
            ))}
            <div ref={bottomRef} />
          </Stack>
        </Box>

        <Box
          component="form"
          onSubmit={send}
          sx={{
            flexShrink: 0,
            px: 2.5,
            py: 1.75,
            borderTop: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" spacing={1} alignItems="flex-end">
            <TextField
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escribe tu mensaje…"
              slotProps={{ htmlInput: { maxLength: 500 } }}
              size="small"
              fullWidth
              disabled={sending}
            />
            <IconButton
              type="submit"
              disabled={sending || !text.trim()}
              sx={{
                width: 44,
                height: 44,
                flexShrink: 0,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '&:hover': { bgcolor: 'primary.dark' },
              }}
            >
              <SendRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </Box>
      </Dialog>
    </>
  );
}
