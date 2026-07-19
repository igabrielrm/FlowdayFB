import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BottomNavigation,
  BottomNavigationAction,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Paper,
} from '@mui/material';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';

const PRIMARY = [
  { value: '/', label: 'Inicio', icon: <HomeOutlinedIcon /> },
  { value: '/activities', label: 'Tareas', icon: <TaskAltOutlinedIcon /> },
  { value: '/schedule', label: 'Horario', icon: <ScheduleOutlinedIcon /> },
  { value: '/chat', label: 'Chat', icon: <ChatOutlinedIcon /> },
] as const;

const MORE = [
  { value: '/calendar', label: 'Calendario', icon: <CalendarMonthOutlinedIcon fontSize="small" /> },
  { value: '/notes', label: 'Notas', icon: <NoteAltOutlinedIcon fontSize="small" /> },
  { value: '/wellbeing', label: 'Bienestar', icon: <SpaOutlinedIcon fontSize="small" /> },
  { value: '/community', label: 'Comunidad', icon: <GroupsOutlinedIcon fontSize="small" /> },
  { value: '/profile', label: 'Perfil', icon: <PersonOutlineOutlinedIcon fontSize="small" /> },
] as const;

function matchPath(pathname: string, base: string) {
  return base === '/' ? pathname === '/' : pathname === base || pathname.startsWith(`${base}/`);
}

export default function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [moreAnchor, setMoreAnchor] = useState<null | HTMLElement>(null);

  const current = useMemo(() => {
    const more = MORE.find((item) => matchPath(location.pathname, item.value));
    if (more) return 'more';
    const primary = PRIMARY.find((item) => matchPath(location.pathname, item.value));
    return primary?.value ?? '/';
  }, [location.pathname]);

  return (
    <>
      <Paper
        elevation={0}
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: (t) => t.zIndex.appBar,
          borderTop: 1,
          borderColor: 'divider',
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        <BottomNavigation
          showLabels
          value={current}
          onChange={(_, value) => {
            if (value === 'more') return;
            navigate(value);
          }}
          sx={{ height: 56 }}
        >
          {PRIMARY.map((item) => (
            <BottomNavigationAction
              key={item.value}
              value={item.value}
              label={item.label}
              icon={item.icon}
            />
          ))}
          <BottomNavigationAction
            value="more"
            label="Más"
            icon={<MoreHorizIcon />}
            onClick={(e) => setMoreAnchor(e.currentTarget)}
          />
        </BottomNavigation>
      </Paper>

      <Menu
        anchorEl={moreAnchor}
        open={!!moreAnchor}
        onClose={() => setMoreAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        slotProps={{
          paper: {
            sx: {
              width: 'min(280px, calc(100vw - 32px))',
              mb: 1,
            },
          },
        }}
      >
        {MORE.map((item) => (
          <MenuItem
            key={item.value}
            selected={matchPath(location.pathname, item.value)}
            onClick={() => {
              setMoreAnchor(null);
              navigate(item.value);
            }}
            sx={{ minHeight: 48 }}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
