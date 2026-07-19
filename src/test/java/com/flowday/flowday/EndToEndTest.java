package com.flowday.flowday;

import com.flowday.flowday.model.Actividad;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.ActividadRepository;
import com.flowday.flowday.repository.UsuarioRepository;
import com.flowday.flowday.service.ActividadService;
import com.flowday.flowday.service.IAService;
import com.flowday.flowday.service.UsuarioService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class EndToEndTest {

    @Autowired
    private UsuarioService usuarioService;

    @Autowired
    private ActividadService actividadService;

    @Autowired
    private IAService iaService;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private ActividadRepository actividadRepository;

    private Usuario usuarioPrueba;
    private Actividad actividadPrueba;

    @BeforeEach
    void setUp() {
        usuarioRepository.deleteAll();

        usuarioPrueba = new Usuario();
        usuarioPrueba.setNombre("Prueba EndToEnd");
        usuarioPrueba.setCorreo("e2e@test.flowday.app");
        usuarioPrueba.setContrasena("password1234");
        usuarioPrueba.setRol("USER");
        usuarioService.registrar(usuarioPrueba);

        actividadPrueba = new Actividad();
        actividadPrueba.setTitulo("Proyecto E2E");
        actividadPrueba.setDescripcion("Prueba de extremo a extremo");
        actividadPrueba.setMateria("Pruebas");
        actividadPrueba.setTipo("DEBER");
        actividadPrueba.setFechaInicio(LocalDate.now());
        actividadPrueba.setHoraInicio(LocalTime.of(10, 0));
        actividadPrueba.setDuracionMinutos(60);
        actividadPrueba.setPrioridad("ALTA");
        actividadPrueba.setEstado("PENDIENTE");
        actividadPrueba.setUsuario(usuarioPrueba);
        actividadService.guardar(actividadPrueba);
    }

    @Test
    void testFlujoCompleto() {
        // 1. AUTENTICACIÓN
        Optional<Usuario> autenticado = usuarioService.autenticar(
                "e2e@test.flowday.app", "password1234");
        assertThat(autenticado).isPresent();
        Usuario usuario = autenticado.get();
        assertThat(usuario.getNombre()).isEqualTo("Prueba EndToEnd");

        // 2. VERIFICAR ACTIVIDAD CREADA
        List<Actividad> actividades = actividadService.listarPorUsuario(usuario);
        assertThat(actividades).isNotEmpty();
        assertThat(actividades.get(0).getTitulo()).isEqualTo("Proyecto E2E");

        // 3. CREAR NUEVA ACTIVIDAD
        Actividad nueva = new Actividad();
        nueva.setTitulo("Tarea Extra");
        nueva.setDescripcion("Tarea adicional de prueba");
        nueva.setMateria("Pruebas");
        nueva.setTipo("DEBER");
        nueva.setFechaInicio(LocalDate.now().plusDays(1));
        nueva.setHoraInicio(LocalTime.of(14, 0));
        nueva.setDuracionMinutos(45);
        nueva.setPrioridad("MEDIA");
        nueva.setEstado("PENDIENTE");
        nueva.setUsuario(usuario);
        actividadService.guardar(nueva);
        assertThat(nueva.getId()).isNotNull();

        // 4. COMPLETAR ACTIVIDAD
        actividadPrueba.setEstado("COMPLETADA");
        actividadService.guardar(actividadPrueba);

        Actividad completada = actividadService.buscarPorId(actividadPrueba.getId());
        assertThat(completada.getEstado()).isEqualTo("COMPLETADA");

        // 5. IA - REAGENDAR
        List<Actividad> pendientes = actividadService.listarPorUsuario(usuario).stream()
                .filter(a -> !"COMPLETADA".equals(a.getEstado()))
                .toList();

        Map<String, Object> plan = iaService.optimizarHorario(pendientes, usuario);
        assertThat(plan).containsKey("planOptimizado");
        assertThat(plan).containsKey("recomendacion");

        // 6. IA - RECURSOS DE ESTUDIO
        Map<String, Object> recursos = iaService.generarRecursosEstudio("programacion", "3");
        assertThat(recursos).containsKey("recursos");
        assertThat(recursos.get("tema")).isEqualTo("programacion");

        // 7. ELIMINAR ACTIVIDAD EXTRA
        actividadService.eliminar(nueva.getId(), usuarioPrueba);
        Actividad eliminada = actividadService.buscarPorId(nueva.getId());
        assertThat(eliminada).isNull();
    }

    @Test
    void testValidacionChoqueHorario() {
        // Intentar crear actividad en el mismo horario
        Actividad conflicto = new Actividad();
        conflicto.setTitulo("Actividad en conflicto");
        conflicto.setMateria("Pruebas");
        conflicto.setTipo("DEBER");
        conflicto.setFechaInicio(LocalDate.now());
        conflicto.setHoraInicio(LocalTime.of(10, 0));
        conflicto.setDuracionMinutos(30);
        conflicto.setPrioridad("MEDIA");
        conflicto.setEstado("PENDIENTE");
        conflicto.setUsuario(usuarioPrueba);

        boolean hayChoque = actividadService.hayChoque(
                usuarioPrueba,
                LocalDate.now(),
                LocalTime.of(10, 0),
                30,
                null
        );

        assertThat(hayChoque).isTrue();
    }

    @Test
    void testActualizarPerfil() {
        usuarioService.actualizarPerfil(
                usuarioPrueba.getId(),
                "Nombre Actualizado",
                "0987654321",
                LocalDate.of(2000, 1, 1),
                "Masculino"
        );

        Optional<Usuario> actualizado = usuarioService.buscarPorId(usuarioPrueba.getId());
        assertThat(actualizado).isPresent();
        assertThat(actualizado.get().getNombre()).isEqualTo("Nombre Actualizado");
        assertThat(actualizado.get().getTelefono()).isEqualTo("0987654321");
    }

    @Test
    void testDiaSaturado() {
        // Agregar múltiples actividades para saturar el día
        for (int i = 0; i < 4; i++) {
            Actividad a = new Actividad();
            a.setTitulo("Tarea " + i);
            a.setMateria("Pruebas");
            a.setTipo("DEBER");
            a.setFechaInicio(LocalDate.now());
            a.setHoraInicio(LocalTime.of(8 + i * 2, 0));
            a.setDuracionMinutos(90);
            a.setPrioridad("ALTA");
            a.setEstado("PENDIENTE");
            a.setUsuario(usuarioPrueba);
            actividadService.guardar(a);
        }

        boolean saturado = actividadService.diaEstasSaturado(usuarioPrueba);
        assertThat(saturado).isTrue(); // Más de 360 minutos
    }
}
