package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.dto.ConflictoEvento;
import com.uce.servidorproyecto.dto.ResultadoReagendamiento;
import com.uce.servidorproyecto.dto.SlotDisponible;
import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.ReagendamientoLog;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.ActividadRepository;
import com.uce.servidorproyecto.repository.UsuarioActividadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

@Service
public class ReagendamientoAutomaticoService {

    @Autowired
    private ConflictDetectionService conflictDetectionService;

    @Autowired
    private SlotFinderService slotFinderService;

    @Autowired
    private PrioridadActividadService prioridadActividadService;

    @Autowired
    private ActividadRepository actividadRepository;

    @Autowired
    private TransaccionAisladaService transaccionAisladaService;

    @Autowired
    private UsuarioActividadRepository usuarioActividadRepository;

    /**
     * Resuelve conflictos antes de persistir una actividad nueva o actualizada.
     */
    @Transactional
    public ResultadoReagendamiento resolverAlGuardar(Usuario usuario, Actividad actividad, Long idExcluir) {
        ResultadoReagendamiento resultado = new ResultadoReagendamiento();

        if (actividad.getHoraInicio() == null || actividad.getDuracionMinutos() == null
                || actividad.getDuracionMinutos() <= 0) {
            prioridadActividadService.aplicarPeso(actividad);
            resultado.setExito(true);
            resultado.setGuardado(true);
            return resultado;
        }

        prioridadActividadService.aplicarPeso(actividad);
        int pesoEntrante = actividad.getPesoPrioridad();

        List<ConflictoEvento> conflictos = conflictDetectionService.detectarConflictos(
                usuario,
                actividad.getFechaInicio(),
                actividad.getHoraInicio(),
                actividad.getDuracionMinutos(),
                idExcluir,
                actividad.getTipo(),
                actividad.getMateria()
        );

        if (conflictos.isEmpty()) {
            resultado.setExito(true);
            resultado.setGuardado(true);
            return resultado;
        }

        boolean conflictoInamovibleEntrante = conflictos.stream().anyMatch(ConflictoEvento::isInamovible)
                && prioridadActividadService.esInamovible(pesoEntrante);

        if (conflictoInamovibleEntrante) {
            resultado.setExito(false);
            resultado.setError("Conflicto entre eventos de prioridad máxima (clases, exámenes o citas médicas). "
                    + "No se puede resolver automáticamente.");
            return resultado;
        }

        int desplazamientos = 0;

        for (ConflictoEvento conflicto : conflictos.stream()
                .sorted(Comparator.comparingInt(ConflictoEvento::getPeso))
                .toList()) {

            if (conflicto.getOrigen() == ConflictoEvento.Origen.HORARIO_CLASE) {
                if (prioridadActividadService.esInamovible(pesoEntrante)) {
                    resultado.setExito(false);
                    resultado.setError("El horario choca con una clase obligatoria ("
                            + conflicto.getTitulo() + "). Elige otro horario.");
                    return resultado;
                }
                Optional<SlotDisponible> slotNuevo = slotFinderService.buscarPrimerSlotLibre(
                        usuario, actividad.getDuracionMinutos(), actividad.getFechaInicio(), idExcluir);
                if (slotNuevo.isEmpty()) {
                    resultado.setExito(false);
                    resultado.setError("No hay huecos disponibles entre 07:00 y 22:00 en los próximos "
                            + SlotFinderService.MAX_DIAS_BUSQUEDA + " días.");
                    registrarFallo(actividad, usuario, "Sin slot libre por conflicto con clase", null, "CLASE");
                    return resultado;
                }
                aplicarSlot(actividad, slotNuevo.get());
                resultado.agregarMensaje("Tu actividad se movió a "
                        + slotNuevo.get().getFecha() + " " + slotNuevo.get().getHoraInicio()
                        + " por conflicto con la clase " + conflicto.getTitulo() + ".");
                registrarExito(actividad, usuario, actividad.getFechaInicio(), actividad.getHoraInicio(),
                        "Reubicado por conflicto con clase obligatoria", null, "CLASE");
                resultado.setExito(true);
                resultado.setGuardado(true);
                return resultado;
            }

            if (pesoEntrante > conflicto.getPeso()) {
                boolean ok = desplazarActividadExistente(usuario, actividad, conflicto, resultado);
                if (!ok) {
                    resultado.setExito(false);
                    return resultado;
                }
                desplazamientos++;
            } else if (pesoEntrante < conflicto.getPeso()) {
                Optional<SlotDisponible> slot = slotFinderService.buscarPrimerSlotLibre(
                        usuario, actividad.getDuracionMinutos(), actividad.getFechaInicio(), idExcluir);
                if (slot.isEmpty()) {
                    resultado.setExito(false);
                    resultado.setError("No hay huecos disponibles. El evento existente tiene mayor prioridad.");
                    registrarFallo(actividad, usuario, "Sin slot para actividad de menor prioridad",
                            conflicto.getActividadId(), conflicto.getTipo());
                    return resultado;
                }
                LocalDate fechaAnt = actividad.getFechaInicio();
                LocalTime horaAnt = actividad.getHoraInicio();
                aplicarSlot(actividad, slot.get());
                resultado.agregarMensaje("Actividad reubicada a " + slot.get().getFecha()
                        + " " + slot.get().getHoraInicio() + " por prioridad inferior.");
                registrarExito(actividad, usuario, fechaAnt, horaAnt,
                        "Reubicado por prioridad inferior frente a " + conflicto.getTitulo(),
                        conflicto.getActividadId(), conflicto.getTipo());
            } else {
                Optional<SlotDisponible> slot = slotFinderService.buscarPrimerSlotLibre(
                        usuario, actividad.getDuracionMinutos(), actividad.getFechaInicio(), idExcluir);
                if (slot.isEmpty()) {
                    resultado.setExito(false);
                    resultado.setError("Conflicto de igual prioridad sin huecos disponibles.");
                    return resultado;
                }
                aplicarSlot(actividad, slot.get());
                resultado.agregarMensaje("Actividad reubicada por empate de prioridad.");
            }
        }

        resultado.setDesplazamientosRealizados(desplazamientos);
        resultado.setExito(true);
        resultado.setGuardado(true);
        return resultado;
    }

    private boolean desplazarActividadExistente(Usuario usuario, Actividad actividadEntrante,
                                                ConflictoEvento conflicto,
                                                ResultadoReagendamiento resultado) {
        Actividad existente = actividadRepository.findById(conflicto.getActividadId()).orElse(null);
        if (existente == null) return true;

        if (prioridadActividadService.esInamovible(conflicto.getPeso())) {
            Optional<SlotDisponible> slotEntrante = slotFinderService.buscarPrimerSlotLibre(
                    usuario, actividadEntrante.getDuracionMinutos(),
                    actividadEntrante.getFechaInicio(), actividadEntrante.getId());
            if (slotEntrante.isEmpty()) {
                resultado.setExito(false);
                resultado.setError("No se puede desplazar un evento de prioridad máxima.");
                return false;
            }
            aplicarSlot(actividadEntrante, slotEntrante.get());
            resultado.agregarMensaje("Tu actividad se reubicó por conflicto con evento prioritario.");
            return true;
        }

        int duracion = existente.getDuracionMinutos() != null ? existente.getDuracionMinutos() : 60;
        Optional<SlotDisponible> slot;

        if ("REUNION_GRUPAL".equals(existente.getTipo()) || "TRABAJO_GRUPO".equals(existente.getTipo())) {
            slot = slotFinderService.buscarSlotGrupal(existente, duracion, existente.getFechaInicio());
        } else {
            slot = slotFinderService.buscarPrimerSlotLibre(
                    existente.getUsuario(), duracion, existente.getFechaInicio(), existente.getId());
        }

        if (slot.isEmpty()) {
            resultado.setExito(false);
            resultado.setError("No se encontró hueco para reagendar: " + existente.getTitulo());
            registrarFallo(existente, existente.getUsuario(),
                    "Sin slot grupal/individual", actividadEntrante.getId(), actividadEntrante.getTipo());
            return false;
        }

        LocalDate fechaAnt = existente.getFechaInicio();
        LocalTime horaAnt = existente.getHoraInicio();
        aplicarSlot(existente, slot.get());
        existente.setEstado("REAGENDADA");
        actividadRepository.save(existente);

        String motivo = "Desplazado automáticamente por " + actividadEntrante.getTitulo()
                + " (" + prioridadActividadService.etiquetaTipo(actividadEntrante.getTipo()) + ")";
        registrarExito(existente, existente.getUsuario(), fechaAnt, horaAnt, motivo,
                actividadEntrante.getId(), actividadEntrante.getTipo());

        notificarReagendamiento(existente, fechaAnt, horaAnt, slot.get(), motivo);
        notificarParticipantesGrupo(existente, fechaAnt, horaAnt, slot.get(), motivo);

        resultado.agregarMensaje("Se reagendó automáticamente «" + existente.getTitulo() + "» a "
                + slot.get().getFecha() + " " + slot.get().getHoraInicio() + ".");
        return true;
    }

    private void aplicarSlot(Actividad actividad, SlotDisponible slot) {
        actividad.setFechaInicio(slot.getFecha());
        actividad.setHoraInicio(slot.getHoraInicio());
        if (!"COMPLETADA".equals(actividad.getEstado()) && !"REAGENDADA".equals(actividad.getEstado())) {
            // mantener estado salvo reagendamientos explícitos de terceros
        }
    }

    private void notificarReagendamiento(Actividad actividad, LocalDate fechaAnt, LocalTime horaAnt,
                                         SlotDisponible nuevo, String motivo) {
        Usuario dest = actividad.getUsuario();
        String msg = String.format("%s. Antes: %s %s → Ahora: %s %s",
                motivo, fechaAnt, horaAnt, nuevo.getFecha(), nuevo.getHoraInicio());
        transaccionAisladaService.crearNotificacion(dest, "REAGENDAMIENTO_AUTO",
                "Actividad reagendada automáticamente", msg, "/actividades/editar/" + actividad.getId());
    }

    private void notificarParticipantesGrupo(Actividad actividad, LocalDate fechaAnt, LocalTime horaAnt,
                                             SlotDisponible nuevo, String motivo) {
        if (!"REUNION_GRUPAL".equals(actividad.getTipo()) && !"TRABAJO_GRUPO".equals(actividad.getTipo())) {
            return;
        }
        for (Usuario invitado : usuarioActividadRepository.findCompanerosInvitados(actividad)) {
            String msg = String.format("La reunión «%s» cambió de horario. %s. Nuevo: %s %s",
                    actividad.getTitulo(), motivo, nuevo.getFecha(), nuevo.getHoraInicio());
            transaccionAisladaService.crearNotificacion(invitado, "REAGENDAMIENTO_AUTO",
                    "Reunión grupal reagendada", msg, "/actividades");
        }
    }

    private void registrarExito(Actividad actividad, Usuario usuario, LocalDate fechaAnt, LocalTime horaAnt,
                                String motivo, Long conflictoId, String conflictoTipo) {
        try {
            ReagendamientoLog log = new ReagendamientoLog();
            log.setActividad(actividad);
            log.setUsuarioAfectado(usuario);
            log.setFechaAnterior(fechaAnt);
            log.setHoraAnterior(horaAnt);
            log.setFechaNueva(actividad.getFechaInicio());
            log.setHoraNueva(actividad.getHoraInicio());
            log.setMotivo(motivo);
            log.setMensajeAsistente(motivo != null ? motivo : "Reagendamiento automático exitoso");
            log.setConflictoConId(conflictoId);
            log.setConflictoConTipo(conflictoTipo);
            log.setExitoso(true);
            log.setAutomatico(true);
            transaccionAisladaService.guardarReagendamientoLog(log);
        } catch (Exception ignored) {
            // Transacción aislada: no afecta el reagendamiento principal
        }
    }

    private void registrarFallo(Actividad actividad, Usuario usuario, String motivo,
                                Long conflictoId, String conflictoTipo) {
        try {
            ReagendamientoLog log = new ReagendamientoLog();
            log.setActividad(actividad);
            log.setUsuarioAfectado(usuario);
            log.setFechaAnterior(actividad.getFechaInicio());
            log.setHoraAnterior(actividad.getHoraInicio());
            log.setMotivo(motivo);
            log.setMensajeAsistente(motivo != null ? motivo : "Reagendamiento automático fallido");
            log.setConflictoConId(conflictoId);
            log.setConflictoConTipo(conflictoTipo);
            log.setExitoso(false);
            log.setAutomatico(true);
            transaccionAisladaService.guardarReagendamientoLog(log);
        } catch (Exception ignored) {
            // Transacción aislada
        }
    }
}
