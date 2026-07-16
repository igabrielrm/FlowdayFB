package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.dto.ConflictoEvento;
import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.BloqueRecurrente;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.ActividadRepository;
import com.uce.servidorproyecto.repository.BloqueRecurrenteRepository;
import com.uce.servidorproyecto.repository.UsuarioActividadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ConflictDetectionService {

    public static final LocalTime HORA_MIN = LocalTime.of(7, 0);
    public static final LocalTime HORA_MAX = LocalTime.of(22, 0);

    @Autowired
    private ActividadRepository actividadRepository;

    @Autowired
    private BloqueRecurrenteRepository bloqueRecurrenteRepository;

    @Autowired
    private UsuarioActividadRepository usuarioActividadRepository;

    @Autowired
    private PrioridadActividadService prioridadActividadService;

    public boolean haySuperposicion(LocalTime inicioA, LocalTime finA, LocalTime inicioB, LocalTime finB) {
        return inicioA.isBefore(finB) && inicioB.isBefore(finA);
    }

    public boolean tieneConflictos(Usuario usuario, LocalDate fecha, LocalTime horaInicio,
                                   Integer duracionMin, Long idExcluir) {
        return !detectarConflictos(usuario, fecha, horaInicio, duracionMin, idExcluir, null, null).isEmpty();
    }

    public List<ConflictoEvento> detectarConflictos(Usuario usuario, LocalDate fecha,
                                                    LocalTime horaInicio, Integer duracionMin,
                                                    Long idExcluir) {
        return detectarConflictos(usuario, fecha, horaInicio, duracionMin, idExcluir, null, null);
    }

    /**
     * Detecta conflictos. Un EXAMEN de la misma materia que un bloque de horario
     * no cuenta como choque (p. ej. examen durante la clase de esa materia).
     */
    public List<ConflictoEvento> detectarConflictos(Usuario usuario, LocalDate fecha,
                                                    LocalTime horaInicio, Integer duracionMin,
                                                    Long idExcluir, String tipoEntrante,
                                                    String materiaEntrante) {
        List<ConflictoEvento> conflictos = new ArrayList<>();
        if (usuario == null || fecha == null || horaInicio == null || duracionMin == null || duracionMin <= 0) {
            return conflictos;
        }

        LocalTime horaFin = horaInicio.plusMinutes(duracionMin);
        if (!horaFin.isAfter(horaInicio)) {
            return conflictos;
        }

        for (Actividad actividad : obtenerActividadesDelDia(usuario, fecha)) {
            if (idExcluir != null && idExcluir.equals(actividad.getId())) continue;
            if (actividad.getHoraInicio() == null || actividad.getDuracionMinutos() == null) continue;

            LocalTime finExistente = actividad.getHoraInicio().plusMinutes(actividad.getDuracionMinutos());
            if (haySuperposicion(actividad.getHoraInicio(), finExistente, horaInicio, horaFin)) {
                conflictos.add(toConflictoActividad(actividad, actividad.getHoraInicio(), finExistente));
            }
        }

        int diaSemana = fecha.getDayOfWeek().getValue();
        for (BloqueRecurrente bloque : bloqueRecurrenteRepository.findByUsuarioAndDiaSemana(usuario, diaSemana)) {
            if (bloque.getHoraInicio() == null || bloque.getHoraFin() == null) continue;
            if (!haySuperposicion(bloque.getHoraInicio(), bloque.getHoraFin(), horaInicio, horaFin)) continue;
            if (esExamenCompatibleConClase(tipoEntrante, materiaEntrante, bloque)) continue;
            conflictos.add(toConflictoBloque(bloque));
        }

        return conflictos;
    }

    private boolean esExamenCompatibleConClase(String tipo, String materia, BloqueRecurrente bloque) {
        if (tipo == null || !"EXAMEN".equalsIgnoreCase(tipo.trim())) return false;
        if (materia == null || materia.isBlank() || bloque.getMateria() == null || bloque.getMateria().isBlank()) {
            return false;
        }
        return materia.trim().equalsIgnoreCase(bloque.getMateria().trim());
    }

    public List<Actividad> obtenerActividadesDelDia(Usuario usuario, LocalDate fecha) {
        Map<Long, Actividad> unicas = new LinkedHashMap<>();

        for (Actividad propia : actividadRepository.findByUsuarioAndFechaInicio(usuario, fecha)) {
            unicas.put(propia.getId(), propia);
        }
        for (Actividad compartida : usuarioActividadRepository.findActividadesCompartidasConUsuario(usuario)) {
            if (fecha.equals(compartida.getFechaInicio())) {
                unicas.putIfAbsent(compartida.getId(), compartida);
            }
        }
        return new ArrayList<>(unicas.values());
    }

    public boolean slotEstaLibre(Usuario usuario, LocalDate fecha, LocalTime horaInicio,
                                 int duracionMin, Long idExcluir) {
        return detectarConflictos(usuario, fecha, horaInicio, duracionMin, idExcluir).isEmpty();
    }

    private ConflictoEvento toConflictoActividad(Actividad actividad, LocalTime inicio, LocalTime fin) {
        int peso = actividad.getPesoPrioridad() != null
                ? actividad.getPesoPrioridad()
                : prioridadActividadService.calcularPeso(actividad);

        ConflictoEvento c = new ConflictoEvento();
        c.setOrigen(ConflictoEvento.Origen.ACTIVIDAD);
        c.setActividadId(actividad.getId());
        c.setTitulo(actividad.getTitulo());
        c.setTipo(actividad.getTipo());
        c.setPeso(peso);
        c.setHoraInicio(inicio);
        c.setHoraFin(fin);
        c.setInamovible(prioridadActividadService.esInamovible(peso));
        return c;
    }

    private ConflictoEvento toConflictoBloque(BloqueRecurrente bloque) {
        ConflictoEvento c = new ConflictoEvento();
        c.setOrigen(ConflictoEvento.Origen.HORARIO_CLASE);
        c.setHorarioClaseId(bloque.getId());
        c.setTitulo(bloque.getMateria());
        c.setTipo("CLASE");
        c.setPeso(PrioridadActividadService.PESO_CLASE_HORARIO);
        c.setHoraInicio(bloque.getHoraInicio());
        c.setHoraFin(bloque.getHoraFin());
        c.setInamovible(true);
        return c;
    }
}
