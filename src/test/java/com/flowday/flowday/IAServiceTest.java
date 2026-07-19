package com.flowday.flowday.service;

import com.flowday.flowday.model.Actividad;
import com.flowday.flowday.model.Usuario;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import org.springframework.test.context.ActiveProfiles;

@ActiveProfiles("test")
@ExtendWith(MockitoExtension.class)
class IAServiceTest {

    @InjectMocks
    private IAService iaService;

    private Usuario usuario;
    private List<Actividad> actividades;

    @BeforeEach
    void setUp() {
        usuario = new Usuario();
        usuario.setId(1L);
        usuario.setNombre("Juan Pérez");

        Actividad alta = new Actividad();
        alta.setId(1L);
        alta.setTitulo("Proyecto Final");
        alta.setPrioridad("ALTA");
        alta.setDuracionMinutos(120);
        alta.setFechaInicio(LocalDate.now());
        alta.setEstado("PENDIENTE");

        Actividad media = new Actividad();
        media.setId(2L);
        media.setTitulo("Tarea de Redes");
        media.setPrioridad("MEDIA");
        media.setDuracionMinutos(60);
        media.setFechaInicio(LocalDate.now());
        media.setEstado("PENDIENTE");

        Actividad baja = new Actividad();
        baja.setId(3L);
        baja.setTitulo("Lectura recomendada");
        baja.setPrioridad("BAJA");
        baja.setDuracionMinutos(30);
        baja.setFechaInicio(LocalDate.now());
        baja.setEstado("PENDIENTE");

        actividades = Arrays.asList(alta, media, baja);
    }

    @Test
    void testOptimizarHorario() {
        Map<String, Object> resultado = iaService.optimizarHorario(actividades, usuario);

        assertThat(resultado).containsKey("usuario");
        assertThat(resultado).containsKey("fecha");
        assertThat(resultado).containsKey("totalActividades");
        assertThat(resultado).containsKey("totalMinutos");
        assertThat(resultado).containsKey("horas");
        assertThat(resultado).containsKey("planOptimizado");
        assertThat(resultado).containsKey("recomendacion");

        assertThat(resultado.get("usuario")).isEqualTo("Juan Pérez");
        assertThat(resultado.get("totalActividades")).isEqualTo(3);

        // Verificar que planOptimizado sea una lista y tenga el tamaño esperado
        Object planObj = resultado.get("planOptimizado");
        assertThat(planObj).isInstanceOf(List.class);
        List<?> plan = (List<?>) planObj;
        assertThat(plan).hasSize(3);
        // Opcional: verificar que el primer elemento sea de ALTA prioridad
        Map<String, String> first = (Map<String, String>) plan.get(0);
        assertThat(first.get("prioridad")).isIn("ALTA", "🔴 ALTA");
    }

    @Test
    void testGenerarRecursosEstudioMatematicas() {
        Map<String, Object> recursos = iaService.generarRecursosEstudio("matematicas", "5");

        assertThat(recursos).containsKey("tema");
        assertThat(recursos).containsKey("recursos");
        assertThat(recursos.get("tema")).isEqualTo("matematicas");

        List<Map<String, String>> items = (List<Map<String, String>>) recursos.get("recursos");
        assertThat(items).isNotEmpty();
    }

    @Test
    void testGenerarRecursosEstudioProgramacion() {
        Map<String, Object> recursos = iaService.generarRecursosEstudio("programacion", "3");

        assertThat(recursos).containsKey("tema");
        assertThat(recursos.get("tema")).isEqualTo("programacion");

        List<Map<String, String>> items = (List<Map<String, String>>) recursos.get("recursos");
        assertThat(items).isNotEmpty();
    }

    @Test
    void testGenerarRecursosEstudioDefault() {
        Map<String, Object> recursos = iaService.generarRecursosEstudio("cualquiercosa", null);

        assertThat(recursos).containsKey("tema");
        assertThat(recursos.get("tema")).isEqualTo("cualquiercosa");
        assertThat(recursos).containsKey("recursos");

        List<Map<String, String>> items = (List<Map<String, String>>) recursos.get("recursos");
        assertThat(items).isNotEmpty();
    }

    @Test
    void testSugerirPausaActiva() {
        Map<String, String> pausa = iaService.sugerirPausaActiva();

        assertThat(pausa).containsKey("tipo");
        assertThat(pausa).containsKey("descripcion");
        assertThat(pausa).containsKey("duracion");

        assertThat(pausa.get("duracion")).isEqualTo("5 minutos");
    }

    @Test
    void testDetectarBloqueoAlto() {
        // Pocas actividades completadas
        List<Actividad> recientes = Arrays.asList(
            crearActividad("Tarea 1", "PENDIENTE"),
            crearActividad("Tarea 2", "PENDIENTE")
        );

        Map<String, Object> resultado = iaService.detectarBloqueo(recientes);

        assertThat(resultado.get("bloqueo")).isEqualTo(true);
        assertThat(resultado.get("nivel")).isEqualTo("ALTO");
        assertThat(resultado).containsKey("mensaje");
        assertThat(resultado).containsKey("sugerencia");
        assertThat(resultado).containsKey("recursos");
    }

    @Test
    void testDetectarBloqueoMedio() {
        List<Actividad> recientes = Arrays.asList(
            crearActividad("Tarea 1", "COMPLETADA"),
            crearActividad("Tarea 2", "COMPLETADA"),
            crearActividad("Tarea 3", "COMPLETADA"),
            crearActividad("Tarea 4", "PENDIENTE")
        );

        Map<String, Object> resultado = iaService.detectarBloqueo(recientes);

        assertThat(resultado.get("bloqueo")).isEqualTo(true);
        assertThat(resultado.get("nivel")).isEqualTo("MEDIO");
    }

    @Test
    void testDetectarBloqueoBajo() {
        List<Actividad> recientes = Arrays.asList(
            crearActividad("Tarea 1", "COMPLETADA"),
            crearActividad("Tarea 2", "COMPLETADA"),
            crearActividad("Tarea 3", "COMPLETADA"),
            crearActividad("Tarea 4", "COMPLETADA"),
            crearActividad("Tarea 5", "COMPLETADA"),
            crearActividad("Tarea 6", "COMPLETADA")
        );

        Map<String, Object> resultado = iaService.detectarBloqueo(recientes);

        assertThat(resultado.get("bloqueo")).isEqualTo(false);
        assertThat(resultado.get("nivel")).isEqualTo("BAJO");
    }

    private Actividad crearActividad(String titulo, String estado) {
        Actividad a = new Actividad();
        a.setTitulo(titulo);
        a.setEstado(estado);
        a.setFechaInicio(LocalDate.now().minusDays(1));
        return a;
    }
}
