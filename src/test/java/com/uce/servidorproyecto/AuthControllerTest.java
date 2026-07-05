package com.uce.servidorproyecto.controller;

import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.UsuarioService;
import jakarta.servlet.http.HttpSession;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.ui.Model;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ActiveProfiles("test")
@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    @Mock
    private UsuarioService usuarioService;

    @Mock
    private HttpSession session;

    @Mock
    private Model model;

    @InjectMocks
    private AuthController authController;

    private Usuario usuario;

    @BeforeEach
    void setUp() {
        usuario = new Usuario();
        usuario.setId(1L);
        usuario.setNombre("Juan Pérez");
        usuario.setCorreo("juan@uce.edu.ec");
        usuario.setContrasena("password123");
        usuario.setRol("ESTUDIANTE");
    }

    @Test
    void testLoginGet() {
        String vista = authController.login(null, model);
        assertThat(vista).isEqualTo("login");
        verify(model).addAttribute("modoAdmin", false);
    }

    @Test
    void testLoginGetModoAdmin() {
        String vista = authController.login(true, model);
        assertThat(vista).isEqualTo("login");
        verify(model).addAttribute("modoAdmin", true);
    }

    @Test
    void testProcesarLoginExitosoEstudiante() {
        when(usuarioService.autenticar("juan@uce.edu.ec", "password123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "juan@uce.edu.ec", "password123", null, session, model);

        assertThat(resultado).isEqualTo("redirect:/dashboard");
        verify(session, times(1)).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarLoginExitosoAdmin() {
        usuario.setRol("ADMIN");
        when(usuarioService.autenticar("admin@uce.edu.ec", "admin123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "admin@uce.edu.ec", "admin123", "true", session, model);

        assertThat(resultado).isEqualTo("redirect:/admin/dashboard");
        verify(session, times(1)).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarLoginFallido() {
        when(usuarioService.autenticar("juan@uce.edu.ec", "wrong"))
                .thenReturn(Optional.empty());

        String resultado = authController.procesarLogin(
                "juan@uce.edu.ec", "wrong", null, session, model);

        assertThat(resultado).isEqualTo("login");
        verify(model, times(1)).addAttribute(eq("error"), anyString());
        verify(model, times(1)).addAttribute("modoAdmin", false);
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarLoginAdminSinModoAdmin() {
        usuario.setRol("ADMIN");
        when(usuarioService.autenticar("admin@uce.edu.ec", "admin123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "admin@uce.edu.ec", "admin123", null, session, model);

        assertThat(resultado).isEqualTo("login");
        verify(model).addAttribute(eq("error"), anyString());
        verify(model).addAttribute("modoAdmin", false);
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarLoginEstudianteEnModoAdmin() {
        when(usuarioService.autenticar("juan@uce.edu.ec", "password123"))
                .thenReturn(Optional.of(usuario));

        String resultado = authController.procesarLogin(
                "juan@uce.edu.ec", "password123", "true", session, model);

        assertThat(resultado).isEqualTo("login");
        verify(model).addAttribute(eq("error"), anyString());
        verify(model).addAttribute("modoAdmin", true);
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testRegistroPaso1() {
        String vista = authController.registro(model);
        assertThat(vista).isEqualTo("registro-paso1");
        verify(model, times(1)).addAttribute(eq("usuario"), any(Usuario.class));
    }

    @Test
    void testProcesarPaso1CorreoValido() {
        when(usuarioService.correoValido("juan@uce.edu.ec")).thenReturn(true);
        when(usuarioService.correoExiste("juan@uce.edu.ec")).thenReturn(false);

        String resultado = authController.procesarPaso1(
                "Juan Pérez", "juan@uce.edu.ec", "password123", session, model);

        assertThat(resultado).isEqualTo("redirect:/registro/paso2");
        verify(session, times(1)).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarPaso1CorreoInvalido() {
        when(usuarioService.correoValido("juan@gmail.com")).thenReturn(false);

        String resultado = authController.procesarPaso1(
                "Juan Pérez", "juan@gmail.com", "password123", session, model);

        assertThat(resultado).isEqualTo("registro-paso1");
        verify(model, times(1)).addAttribute(eq("error"), anyString());
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testProcesarPaso1CorreoYaExiste() {
        when(usuarioService.correoValido("juan@uce.edu.ec")).thenReturn(true);
        when(usuarioService.correoExiste("juan@uce.edu.ec")).thenReturn(true);

        String resultado = authController.procesarPaso1(
                "Juan Pérez", "juan@uce.edu.ec", "password123", session, model);

        assertThat(resultado).isEqualTo("registro-paso1");
        verify(model, times(1)).addAttribute(eq("error"), anyString());
        verify(session, never()).setAttribute(anyString(), any());
    }

    @Test
    void testLogout() {
        String resultado = authController.logout(session);
        assertThat(resultado).isEqualTo("redirect:/login");
        verify(session, times(1)).invalidate();
    }
}