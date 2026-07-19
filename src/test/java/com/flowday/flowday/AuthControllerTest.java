package com.flowday.flowday.controller;

import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.security.SecurityUtils;
import com.flowday.flowday.service.UsuarioService;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.context.ActiveProfiles;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ActiveProfiles("test")
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private UsuarioService usuarioService;

    @Mock
    private HttpSession session;

    @InjectMocks
    private AuthController authController;

    private Usuario usuario;

    @BeforeEach
    void setUp() {
        usuario = new Usuario();
        usuario.setId(1L);
        usuario.setNombre("Juan Pérez");
        usuario.setCorreo("juan@example.com");
        usuario.setContrasena("password123");
        usuario.setRol("USER");
    }

    @Test
    void testLoginGet() {
        assertThat(authController.login()).isEqualTo("redirect:/app/login");
    }

    @Test
    void testProcesarLoginExitosoUsuario() {
        when(usuarioService.autenticar("juan@example.com", "password123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "juan@example.com", "password123", session);

        assertThat(resultado).isEqualTo("redirect:/app/");
        verify(session, atLeastOnce()).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarLoginRechazaAdmin() {
        usuario.setRol("ADMIN");
        when(usuarioService.autenticar("admin@example.com", "admin123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "admin@example.com", "admin123", session);

        assertThat(resultado).isEqualTo("redirect:/internal/login?error=admin");
        verify(session, never()).setAttribute(eq(SecurityUtils.SESSION_USUARIO), any());
    }

    @Test
    void testProcesarLoginFallido() {
        when(usuarioService.autenticar("juan@example.com", "wrong"))
                .thenReturn(Optional.empty());

        String resultado = authController.procesarLogin(
                "juan@example.com", "wrong", session);

        assertThat(resultado).isEqualTo("redirect:/app/login?error=1");
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testRegistroGet() {
        assertThat(authController.registro()).isEqualTo("redirect:/app/register");
    }

    @Test
    void testLogout() {
        String resultado = authController.logout(session);
        assertThat(resultado).isEqualTo("redirect:/app/login");
        verify(session, times(1)).invalidate();
    }
}
