import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import SpaOutlinedIcon from '@mui/icons-material/SpaOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ChatOutlinedIcon from '@mui/icons-material/ChatOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import NoteAltOutlinedIcon from '@mui/icons-material/NoteAltOutlined';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import NotificationsBell from './NotificationsBell';
import OfflineBanner from './OfflineBanner';
import ToastStack from './ToastStack';
import MobileBottomNav from './MobileBottomNav';
import VirtualCompanion from './VirtualCompanion';
import { CHAT_UNREAD_EVENT } from '../events';
import { profileInitials } from '../types/profile';

const DRAWER_WIDTH = 260;

const NAV = [
  { to: '/', label: 'Inicio', end: true, icon: <HomeOutlinedIcon /> },
  { to: '/activities', label: 'Actividades', end: false, icon: <TaskAltOutlinedIcon /> },
  { to: '/calendar', label: 'Calendario', end: false, icon: <CalendarMonthOutlinedIcon /> },
  { to: '/schedule', label: 'Horario', end: false, icon: <ScheduleOutlinedIcon /> },
  { to: '/notes', label: 'Notas', end: false, icon: <NoteAltOutlinedIcon /> },
  { to: '/wellbeing', label: 'Bienestar', end: false, icon: <SpaOutlinedIcon /> },
  { to: '/community', label: 'Comunidad', end: false, icon: <GroupsOutlinedIcon /> },
  { to: '/chat', label: 'Chat', end: false, icon: <ChatOutlinedIcon /> },
  { to: '/profile', label: 'Perfil', end: false, icon: <PersonOutlineOutlinedIcon /> },
];

export default function AppLayout() {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));
  const location = useLocation();
  const { user, logout } = useAuth();
  const [chatUnread, setChatUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  const refreshChatUnread = useCallback(() => {
    api.chat.unreadCount().then((res) => {
      if (res.ok && res.data) setChatUnread(res.data.count);
    });
  }, []);

  useEffect(() => {
    refreshChatUnread();
    const onChatUnread = () => refreshChatUnread();
    window.addEventListener(CHAT_UNREAD_EVENT, onChatUnread);
    const id = window.setInterval(refreshChatUnread, 60000);
    return () => {
      window.removeEventListener(CHAT_UNREAD_EVENT, onChatUnread);
      window.clearInterval(id);
    };
  }, [refreshChatUnread]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const drawer = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Typography variant="h6" color="primary.main" fontWeight={800}>
          Flowday
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Plan your day, own your flow.
        </Typography>
      </Box>
      <Divider />
      <List sx={{ flex: 1, px: 1, py: 1 }}>
        {NAV.map((item) => (
          <ListItemButton
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.end}
            sx={{
              borderRadius: 2,
              mb: 0.5,
              '&.active': {
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                '& .MuiListItemIcon-root': { color: 'primary.contrastText' },
                '&:hover': { bgcolor: 'primary.dark' },
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 40, color: 'text.secondary' }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
            {item.to === '/chat' && chatUnread > 0 && (
              <Badge badgeContent={chatUnread > 99 ? '99+' : chatUnread} color="error" />
            )}
          </ListItemButton>
        ))}
      </List>
      <Divider />
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Avatar sx={{ bgcolor: 'primary.main', width: 36, height: 36, fontSize: 14 }}>
            {profileInitials(user?.nombre || 'U')}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" fontWeight={600} noWrap>
              {user?.nombre}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap display="block">
              {user?.correo}
            </Typography>
          </Box>
        </Box>
        <Button
          fullWidth
          variant="outlined"
          color="inherit"
          startIcon={<LogoutOutlinedIcon />}
          onClick={() => logout()}
        >
          Salir
        </Button>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', width: '100%' }}>
      <ToastStack />
      <OfflineBanner />

      <Drawer
        variant={isDesktop ? 'permanent' : 'temporary'}
        open={isDesktop ? true : mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          width: { xs: 0, md: DRAWER_WIDTH },
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            pt: { xs: 'env(safe-area-inset-top)', md: 0 },
          },
        }}
      >
        {drawer}
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - ${DRAWER_WIDTH}px)` },
          minWidth: 0,
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          pb: { xs: 'calc(56px + env(safe-area-inset-bottom))', md: 0 },
        }}
      >
        <AppBar
          position="sticky"
          color="transparent"
          elevation={0}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            pt: 'env(safe-area-inset-top)',
          }}
        >
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56, sm: 64 } }}>
            {!isDesktop && (
              <IconButton
                edge="start"
                onClick={() => setMobileOpen(true)}
                aria-label="Abrir menú"
                sx={{ width: 44, height: 44 }}
              >
                <MenuIcon />
              </IconButton>
            )}
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ flexGrow: 1, display: { xs: 'none', sm: 'block' } }}
            >
              Plan your day, own your flow.
            </Typography>
            <NotificationsBell />
          </Toolbar>
        </AppBar>

        <Box
          component="section"
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            maxWidth: 1200,
            mx: 'auto',
            px: { xs: 2, sm: 3, md: 4 },
            py: { xs: 2, sm: 3, md: 4 },
          }}
        >
          <Outlet />
        </Box>
      </Box>

      <MobileBottomNav />
      <VirtualCompanion fabOnTop={location.pathname === '/chat'} />
    </Box>
  );
}
