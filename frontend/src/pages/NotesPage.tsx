import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  Fab,
  Grid,
  IconButton,
  InputBase,
  Paper,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import { api } from '../api/client';
import { OFFLINE_QUEUE_EVENT } from '../events';
import { readApiGet } from '../offline/cache';
import type { Note } from '../types/note';
import { NOTE_COLORS } from '../types/note';
import { FormControl, InputLabel, MenuItem, Select, Stack, TextField, Checkbox, FormControlLabel } from '@mui/material';
import type { RecurrenceConfig, RecurrenceKind } from '../utils/recurrence';

// ─── NoteCard ────────────────────────────────────────────────────────────────

function NoteCard({ note, onClick }: { note: Note; onClick: (n: Note) => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const colorDef = NOTE_COLORS.find((c) => c.value === note.color);
  const bg = isDark ? (colorDef?.bgDark ?? '#1e293b') : (colorDef?.bgLight ?? '#f8fafc');
  const textColor = isDark ? '#f1f5f9' : '#0f172a';
  const isWhite = note.color === '#ffffff';

  return (
    <Paper
      elevation={0}
      onClick={() => onClick(note)}
      sx={{
        p: 2,
        borderRadius: 3,
        cursor: 'pointer',
        bgcolor: bg,
        border: '1.5px solid',
        borderColor: isWhite ? (isDark ? '#334155' : '#e2e8f0') : 'transparent',
        transition: 'all 0.18s ease',
        minHeight: 100,
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: isDark ? '0 8px 24px rgba(0,0,0,0.30)' : '0 8px 24px rgba(0,0,0,0.10)',
          borderColor: 'primary.main',
        },
      }}
    >
      {note.pinned && (
        <PushPinIcon
          sx={{
            position: 'absolute',
            top: 8,
            right: 8,
            fontSize: 18,
            color: textColor,
            opacity: 0.6,
            transform: 'rotate(45deg)',
          }}
        />
      )}
      {note.titulo && (
        <Typography
          variant="subtitle2"
          fontWeight={700}
          sx={{ mb: 0.5, pr: note.pinned ? 3 : 0, lineHeight: 1.4, color: textColor }}
        >
          {note.titulo}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{
          color: textColor,
          opacity: 0.8,
          display: '-webkit-box',
          WebkitLineClamp: 6,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          lineHeight: 1.6,
          fontSize: '0.82rem',
        }}
      >
        {note.contenido || <em style={{ opacity: 0.5 }}>Nota vacía</em>}
      </Typography>
    </Paper>
  );
}

// ─── ColorPicker ──────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Box sx={{ display: 'flex', flexWrap: 'nowrap', gap: 1, p: 1, overflowX: 'auto' }}>
      {NOTE_COLORS.map((c) => (
        <Box
          key={c.value}
          onClick={() => onChange(c.value)}
          sx={{
            minWidth: 28,
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: isDark ? c.bgDark : c.bgLight,
            border: '2.5px solid',
            borderColor: c.value === value ? 'primary.main' : (isDark ? '#475569' : '#cbd5e1'),
            cursor: 'pointer',
            transition: 'transform 0.12s, border-color 0.12s',
            flexShrink: 0,
            '&:hover': { transform: 'scale(1.15)' },
          }}
        />
      ))}
    </Box>
  );
}

// ─── NoteEditorDialog ─────────────────────────────────────────────────────────

function NoteEditorDialog({
  note,
  onClose,
  onSave,
  onDelete,
}: {
  note: Note | null;
  onClose: () => void;
  onSave: (patch: Partial<Note>) => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [titulo, setTitulo] = useState(note?.titulo ?? '');
  const [contenido, setContenido] = useState(note?.contenido ?? '');
  const [color, setColor] = useState(note?.color ?? '#ffffff');
  const [pinned, setPinned] = useState(note?.pinned ?? false);
  const [showPalette, setShowPalette] = useState(false);
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(Boolean(note?.recurrence?.enabled));
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>(note?.recurrence?.kind ?? 'daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(note?.recurrence?.interval ?? 1));
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(note?.recurrence?.endDate ?? '');
  const dirty = useRef(false);

  const colorDef = NOTE_COLORS.find((c) => c.value === color);
  const bg = isDark ? (colorDef?.bgDark ?? '#1e293b') : (colorDef?.bgLight ?? '#f8fafc');

  useEffect(() => {
    dirty.current = false;
    setTitulo(note?.titulo ?? '');
    setContenido(note?.contenido ?? '');
    setColor(note?.color ?? '#ffffff');
    setPinned(note?.pinned ?? false);
    setRecurrenceEnabled(Boolean(note?.recurrence?.enabled));
    setRecurrenceKind(note?.recurrence?.kind ?? 'daily');
    setRecurrenceInterval(String(note?.recurrence?.interval ?? 1));
    setRecurrenceEndDate(note?.recurrence?.endDate ?? '');
  }, [note?.id]);

  const handleChange = (field: string, value: unknown) => {
    dirty.current = true;
    if (field === 'titulo') setTitulo(value as string);
    if (field === 'contenido') setContenido(value as string);
    if (field === 'color') setColor(value as string);
    if (field === 'pinned') setPinned(value as boolean);
  };

  const handleClose = () => {
    if (dirty.current) {
      const recurrence = recurrenceEnabled
        ? {
            enabled: true,
            kind: recurrenceKind,
            interval: Number(recurrenceInterval) || 1,
            endDate: recurrenceEndDate || undefined,
          } satisfies RecurrenceConfig
        : undefined;
      onSave({ titulo, contenido, color, pinned, recurrence });
    }
    onClose();
  };

  if (!note) return null;

  return (
    <Dialog
      open
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 4,
          bgcolor: bg,
          border: '1.5px solid',
          borderColor: 'divider',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        },
      }}
    >
      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Title row */}
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2, pt: 2 }}>
          <InputBase
            value={titulo}
            onChange={(e) => handleChange('titulo', e.target.value)}
            placeholder="Título"
            fullWidth
            inputProps={{ 'aria-label': 'Título de la nota' }}
            sx={{ fontSize: '1.05rem', fontWeight: 700, flex: 1 }}
          />
          <Tooltip title={pinned ? 'Desanclar' : 'Anclar'}>
            <IconButton size="small" onClick={() => handleChange('pinned', !pinned)}>
              {pinned ? (
                <PushPinIcon sx={{ fontSize: 20, transform: 'rotate(45deg)' }} />
              ) : (
                <PushPinOutlinedIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>
        </Box>

        {/* Content */}
        <InputBase
          value={contenido}
          onChange={(e) => handleChange('contenido', e.target.value)}
          placeholder="Escribe algo aquí..."
          multiline
          minRows={4}
          maxRows={16}
          fullWidth
          inputProps={{ 'aria-label': 'Contenido de la nota' }}
          sx={{ px: 2, pt: 1, pb: 2, fontSize: '0.9rem', lineHeight: 1.7 }}
        />

        <Box sx={{ px: 2, pb: 1.5 }}>
          <FormControlLabel
            control={<Checkbox checked={recurrenceEnabled} onChange={(_, checked) => setRecurrenceEnabled(checked)} />}
            label="Repetir esta nota"
          />
          {recurrenceEnabled && (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <FormControl fullWidth size="small">
                  <InputLabel>Frecuencia</InputLabel>
                  <Select label="Frecuencia" value={recurrenceKind} onChange={(e) => setRecurrenceKind(e.target.value as RecurrenceKind)}>
                    <MenuItem value="daily">Diaria</MenuItem>
                    <MenuItem value="weekly">Semanal</MenuItem>
                    <MenuItem value="monthly">Mensual</MenuItem>
                    <MenuItem value="annual">Anual</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Cada"
                  type="number"
                  size="small"
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(e.target.value)}
                  inputProps={{ min: 1, max: 12 }}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField
                  label="Hasta"
                  type="date"
                  size="small"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  fullWidth
                />
              </Stack>
            </Stack>
          )}
        </Box>

        {/* Toolbar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 1,
            py: 0.5,
            borderTop: '1px solid',
            borderColor: 'divider',
          }}
        >
          <Box sx={{ position: 'relative' }}>
            <Tooltip title="Color">
              <IconButton size="small" onClick={() => setShowPalette((p) => !p)}>
                <PaletteOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {showPalette && (
              <Paper
                elevation={4}
                sx={{
                  position: 'absolute',
                  bottom: '110%',
                  left: 0,
                  borderRadius: 2,
                  zIndex: 10,
                }}
              >
                <ColorPicker
                  value={color}
                  onChange={(c) => {
                    handleChange('color', c);
                    setShowPalette(false);
                  }}
                />
              </Paper>
            )}
          </Box>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Eliminar nota">
            <IconButton
              size="small"
              onClick={() => {
                dirty.current = false;
                onDelete();
                onClose();
              }}
              color="error"
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Guardar y cerrar">
            <IconButton size="small" onClick={handleClose} sx={{ ml: 0.5 }}>
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

// ─── NotesPage ────────────────────────────────────────────────────────────────

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editNote, setEditNote] = useState<Note | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // First try to load from cache for instant UI
    const cached = readApiGet<Note[]>('/api/v1/notas');
    if (cached) {
      setNotes(cached);
      setLoading(false);
    }
    // Then fetch from server (will update cache automatically)
    const res = await api.notes.list();
    if (res.ok && res.data) {
      setNotes(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onQueue = () => load();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    };
  }, [load]);

  const handleCreate = async () => {
    const res = await api.notes.create('', '', '#ffffff', false);
    if (res.ok && res.data) {
      setNotes((prev) => [res.data!, ...prev]);
      setEditNote(res.data!);
      if (res.meta?.offline) {
        setSyncNotice('Nota guardada localmente. Se sincronizará al reconectar.');
        setTimeout(() => setSyncNotice(null), 3000);
      }
    }
  };

  const handleSave = async (id: string, patch: Partial<Note>) => {
    const res = await api.notes.update(id, patch);
    if (res.ok && res.data) {
      setNotes((prev) => prev.map((n) => (n.id === id ? res.data! : n)));
      if (res.meta?.offline) {
        setSyncNotice('Cambios guardados localmente. Se sincronizarán al reconectar.');
        setTimeout(() => setSyncNotice(null), 3000);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const res = await api.notes.remove(id);
    if (res.ok) {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (res.meta?.offline) {
        setSyncNotice('Nota eliminada localmente. Se sincronizará al reconectar.');
        setTimeout(() => setSyncNotice(null), 3000);
      }
    }
  };

  const filtered = notes.filter((n) => {
    const q = search.toLowerCase();
    return (
      n.titulo.toLowerCase().includes(q) ||
      n.contenido.toLowerCase().includes(q)
    );
  });

  const pinned = filtered.filter((n) => n.pinned);
  const others = filtered.filter((n) => !n.pinned);

  return (
    <Box sx={{ width: '100%' }}>
      {/* Sync Notice */}
      {syncNotice && (
        <Box
          sx={{
            mb: 2,
            p: 1.5,
            borderRadius: 2,
            bgcolor: 'info.main',
            color: 'info.contrastText',
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography variant="body2">{syncNotice}</Typography>
        </Box>
      )}

      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          mb: 3,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Notas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {notes.length} {notes.length === 1 ? 'nota' : 'notas'} · tus apuntes rápidos
          </Typography>
        </Box>

        {/* Search */}
        <Paper
          elevation={0}
          sx={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 99,
            border: '1.5px solid',
            borderColor: 'divider',
            px: 1.5,
            py: 0.5,
            ml: 'auto',
            minWidth: 220,
            maxWidth: 340,
            flex: 1,
          }}
        >
          <SearchIcon sx={{ fontSize: 18, color: 'text.secondary', mr: 1 }} />
          <InputBase
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar notas..."
            fullWidth
            inputProps={{ 'aria-label': 'Buscar notas' }}
            sx={{ fontSize: '0.875rem' }}
          />
          {search && (
            <IconButton size="small" onClick={() => setSearch('')}>
              <CloseIcon sx={{ fontSize: 16 }} />
            </IconButton>
          )}
        </Paper>
      </Box>

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Empty state */}
      {!loading && notes.length === 0 && (
        <Box
          sx={{
            textAlign: 'center',
            mt: 10,
            opacity: 0.6,
            userSelect: 'none',
          }}
        >
          <Typography variant="h1" sx={{ fontSize: '4rem', mb: 1 }}>
            📝
          </Typography>
          <Typography variant="h6" fontWeight={600}>
            Sin notas todavía
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Pulsa el botón "+" para crear tu primera nota
          </Typography>
        </Box>
      )}

      {/* Pinned section */}
      {pinned.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Chip
              label="Ancladas"
              size="small"
              icon={<PushPinIcon sx={{ fontSize: '14px !important' }} />}
              sx={{ fontWeight: 600, fontSize: '0.72rem' }}
            />
          </Box>
          <Grid container spacing={1.5}>
            {pinned.map((n) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={n.id}>
                <NoteCard note={n} onClick={setEditNote} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Others section */}
      {others.length > 0 && (
        <Box>
          {pinned.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Chip label="Otras notas" size="small" sx={{ fontWeight: 600, fontSize: '0.72rem' }} />
            </Box>
          )}
          <Grid container spacing={1.5}>
            {others.map((n) => (
              <Grid size={{ xs: 12, sm: 6, md: 4, lg: 3 }} key={n.id}>
                <NoteCard note={n} onClick={setEditNote} />
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* No search results */}
      {!loading && notes.length > 0 && filtered.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 8, opacity: 0.6 }}>
          <Typography variant="body1">No hay notas que coincidan con "{search}"</Typography>
        </Box>
      )}

      {/* FAB */}
      <Fab
        color="primary"
        aria-label="Nueva nota"
        onClick={handleCreate}
        sx={{
          position: 'fixed',
          bottom: { xs: 'calc(72px + env(safe-area-inset-bottom))', md: 32 },
          right: { xs: 20, md: 36 },
          boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          transition: 'transform 0.18s ease, box-shadow 0.18s ease',
          '&:hover': {
            transform: 'scale(1.08)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
          },
        }}
      >
        <AddIcon />
      </Fab>

      {/* Editor dialog */}
      {editNote && (
        <NoteEditorDialog
          note={editNote}
          onClose={() => setEditNote(null)}
          onSave={(patch) => handleSave(editNote.id, patch)}
          onDelete={() => handleDelete(editNote.id)}
        />
      )}
    </Box>
  );
}
