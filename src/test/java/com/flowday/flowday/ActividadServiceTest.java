package com.flowday.flowday.service;

import com.flowday.flowday.model.Actividad;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.ActividadRepository;
import com.flowday.flowday.repository.UsuarioActividadRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ActiveProfiles("test")
@ExtendWith(MockitoExtension.class)
class ActividadServiceTest {

    @Mock
    private ActividadRepository actividadRepository;

    @Mock
    private UsuarioActividadRepository usuarioActividadRepository;

    @Mock
    private ConflictDetectionService conflictDetectionService;

    @Mock
    private PrioridadActividadService prioridadActividadService;

    @InjectMocks
    private ActividadService actividadService;

    private Usuario usuario;
    private Actividad actividad;

    @BeforeEach
    void setUp() {
        usuario = new Usuario();
        usuario.setId(1L);
        usuario.setNombre("Juan Pérez");
        usuario.setCorreo("juan@uce.edu.ec");

        actividad = new Actividad();
        actividad.setId(1L);
        actividad.setTitulo("Proyecto Final");
        actividad.setDescripcion("Entregar proyecto de programación");
        actividad.setMateria("Programación");
        actividad.setTipo("DEBER");
        actividad.setFechaInicio(LocalDate.now());
        actividad.setHoraInicio(LocalTime.of(10, 0));
        actividad.setDuracionMinutos(90);
        actividad.setPrioridad("ALTA");
        actividad.setEstado("PENDIENTE");
        actividad.setUsuario(usuario);
    }

    @Test
    void testListarPorUsuario() {
        when(actividadRepository.findByUsuario(usuario))
                .thenReturn(Arrays.asList(actividad));

        List<Actividad> actividades = actividadService.listarPorUsuario(usuario);

        assertThat(actividades).isNotEmpty();
        assertThat(actividades.get(0).getTitulo()).isEqualTo("Proyecto Final");
        verify(actividadRepository, times(1)).findByUsuario(usuario);
    }

    @Test
    void testListarHoy() {
        when(actividadRepository.findByUsuarioAndFechaInicioOrderByHoraInicio(
                any(Usuario.class), any(LocalDate.class)))
                .thenReturn(Arrays.asList(actividad));

        List<Actividad> actividades = actividadService.listarHoy(usuario);

        assertThat(actividades).isNotEmpty();
        verify(actividadRepository, times(1))
                .findByUsuarioAndFechaInicioOrderByHoraInicio(any(Usuario.class), any(LocalDate.class));
    }

    @Test
    void testGuardar() {
        when(actividadRepository.save(any(Actividad.class))).thenReturn(actividad);

        actividadService.guardar(actividad);

        verify(actividadRepository, times(1)).save(actividad);
    }

    @Test
    void testBuscarPorId() {
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));

        Actividad encontrada = actividadService.buscarPorId(1L);

        assertThat(encontrada).isNotNull();
        assertThat(encontrada.getTitulo()).isEqualTo("Proyecto Final");
    }

    @Test
    void testBuscarPorIdNoEncontrado() {
        when(actividadRepository.findById(999L)).thenReturn(Optional.empty());

        Actividad encontrada = actividadService.buscarPorId(999L);

        assertThat(encontrada).isNull();
    }

    @Test
    void testEliminar() {
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));
        doNothing().when(usuarioActividadRepository).deleteByActividad(actividad);
        doNothing().when(actividadRepository).delete(actividad);

        actividadService.eliminar(1L, usuario);

        verify(usuarioActividadRepository, times(1)).deleteByActividad(actividad);
        verify(actividadRepository, times(1)).delete(actividad);
    }

    @Test
    void testReagendarActividad() {
        actividad.setTipo("REUNION_GRUPAL");
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));
        when(conflictDetectionService.tieneConflictos(any(), any(), any(), any(), any())).thenReturn(false);
        when(actividadRepository.save(any(Actividad.class))).thenReturn(actividad);

        LocalDate nuevaFecha = LocalDate.now().plusDays(2);
        LocalTime nuevaHora = LocalTime.of(14, 0);

        Actividad reagendada = actividadService.reagendarActividad(usuario, 1L, nuevaFecha, nuevaHora);

        assertThat(reagendada.getFechaInicio()).isEqualTo(nuevaFecha);
        assertThat(reagendada.getHoraInicio()).isEqualTo(nuevaHora);
        assertThat(reagendada.getEstado()).isEqualTo("REAGENDADA");
        verify(actividadRepository, times(1)).save(any(Actividad.class));
    }

    @Test
    void testCompletarActividadConValidacion() {
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));
        when(actividadRepository.save(any(Actividad.class))).thenReturn(actividad);

        Actividad completada = actividadService.completarActividadConValidacion(1L);

        assertThat(completada.getEstado()).isEqualTo("COMPLETADA");
        assertThat(completada.getFechaEntrega()).isEqualTo(LocalDate.now());
    }

    @Test
    void testCompletarActividadConValidacionYaCompletada() {
        actividad.setEstado("COMPLETADA");
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));

        assertThatThrownBy(() -> actividadService.completarActividadConValidacion(1L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("La actividad ya está completada");
    }

    @Test
    void testCompletarActividadConValidacionSinDuracion() {
        actividad.setDuracionMinutos(null);
        when(actividadRepository.findById(1L)).thenReturn(Optional.of(actividad));

        assertThatThrownBy(() -> actividadService.completarActividadConValidacion(1L))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("La actividad debe tener una duración válida");
    }

    @Test
    void testDiaEstasSaturado() {
        when(actividadRepository.sumarMinutosDia(any(Usuario.class), any(LocalDate.class)))
                .thenReturn(400); // Más de 360 minutos = saturado

        boolean saturado = actividadService.diaEstasSaturado(usuario);

        assertThat(saturado).isTrue();
    }

    @Test
    void testDiaNoSaturado() {
        when(actividadRepository.sumarMinutosDia(any(Usuario.class), any(LocalDate.class)))
                .thenReturn(200); // Menos de 360 minutos

        boolean saturado = actividadService.diaEstasSaturado(usuario);

        assertThat(saturado).isFalse();
    }
}
