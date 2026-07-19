package com.flowday.flowday.service;

import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.UsuarioRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ActiveProfiles("test")
@ExtendWith(MockitoExtension.class)
class UsuarioServiceTest {

    @Mock
    private UsuarioRepository usuarioRepository;

    @InjectMocks
    private UsuarioService usuarioService;

    private Usuario usuarioPrueba;

    @BeforeEach
    void setUp() {
        usuarioPrueba = new Usuario();
        usuarioPrueba.setId(1L);
        usuarioPrueba.setNombre("Juan Pérez");
        usuarioPrueba.setCorreo("juan@uce.edu.ec");
        usuarioPrueba.setContrasena("password123");
        usuarioPrueba.setRol("ESTUDIANTE");
        usuarioPrueba.setEstado("ACTIVO");
        usuarioPrueba.setFechaRegistro(LocalDateTime.now());
    }

    @Test
    void testCorreoValido() {
        // Correos válidos
        assertThat(usuarioService.correoValido("juan@uce.edu.ec")).isTrue();
        assertThat(usuarioService.correoValido("maria@uce.edu.ec")).isTrue();
        assertThat(usuarioService.correoValido("juan@gmail.com")).isTrue();

        // Correos inválidos
        assertThat(usuarioService.correoValido("juan@uce")).isFalse();
        assertThat(usuarioService.correoValido(null)).isFalse();
    }

    @Test
    void testCorreoExiste() {
        when(usuarioRepository.findByCorreo("juan@uce.edu.ec"))
                .thenReturn(Optional.of(usuarioPrueba));

        assertThat(usuarioService.correoExiste("juan@uce.edu.ec")).isTrue();
        assertThat(usuarioService.correoExiste("noexiste@uce.edu.ec")).isFalse();
    }

    @Test
    void testRegistrar() {
        when(usuarioRepository.save(any(Usuario.class))).thenReturn(usuarioPrueba);

        Usuario registrado = usuarioService.registrar(usuarioPrueba);

        assertThat(registrado).isNotNull();
        assertThat(registrado.getId()).isEqualTo(1L);
        assertThat(registrado.getRol()).isEqualTo("USER");
        assertThat(registrado.getEstado()).isEqualTo("ACTIVO");

        // Verificar que la contraseña fue encriptada
        assertThat(registrado.getContrasena()).isNotEqualTo("password123");

        verify(usuarioRepository, times(1)).save(any(Usuario.class));
    }

    @Test
    void testAutenticarExitoso() {
        when(usuarioRepository.findByCorreo("juan@uce.edu.ec"))
                .thenReturn(Optional.of(usuarioPrueba));

        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        usuarioPrueba.setContrasena(encoder.encode("password123"));

        Optional<Usuario> autenticado = usuarioService.autenticar("juan@uce.edu.ec", "password123");

        assertThat(autenticado).isPresent();
        assertThat(autenticado.get().getCorreo()).isEqualTo("juan@uce.edu.ec");
        verify(usuarioRepository, times(1)).save(any(Usuario.class));
    }

    @Test
    void testAutenticarFallido() {
        when(usuarioRepository.findByCorreo("juan@uce.edu.ec"))
                .thenReturn(Optional.empty());

        Optional<Usuario> autenticado = usuarioService.autenticar("juan@uce.edu.ec", "password123");

        assertThat(autenticado).isEmpty();
    }

    @Test
    void testBuscarPorId() {
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuarioPrueba));

        Optional<Usuario> encontrado = usuarioService.buscarPorId(1L);

        assertThat(encontrado).isPresent();
        assertThat(encontrado.get().getNombre()).isEqualTo("Juan Pérez");
    }

    @Test
    void testEliminar() {
        doNothing().when(usuarioRepository).deleteById(1L);

        usuarioService.eliminar(1L);

        verify(usuarioRepository, times(1)).deleteById(1L);
    }

    @Test
    void testCambiarRol() {
        when(usuarioRepository.findById(1L)).thenReturn(Optional.of(usuarioPrueba));
        when(usuarioRepository.save(any(Usuario.class))).thenReturn(usuarioPrueba);

        usuarioService.cambiarRol(1L);

        assertThat(usuarioPrueba.getRol()).isEqualTo("ADMIN");
        verify(usuarioRepository, times(1)).save(any(Usuario.class));
    }
}
