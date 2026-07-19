package com.uce.servidorproyecto.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.NullNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.uce.servidorproyecto.api.dto.*;
import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.BloqueRecurrente;
import com.uce.servidorproyecto.model.Nota;
import com.uce.servidorproyecto.model.Notificacion;
import com.uce.servidorproyecto.model.RegistroBienestar;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.ActividadRepository;
import com.uce.servidorproyecto.repository.BloqueRecurrenteRepository;
import com.uce.servidorproyecto.repository.NotaRepository;
import com.uce.servidorproyecto.repository.NotificacionRepository;
import com.uce.servidorproyecto.repository.UsuarioRepository;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

@Service
public class SyncDomainService {

    public record Outcome(String status, JsonNode data, String error, Long serverVersion) {
        public static Outcome applied(JsonNode data, Long version) {
            return new Outcome("APPLIED", data, null, version);
        }
        public static Outcome conflict(JsonNode data, Long version) {
            return new Outcome("CONFLICT", data, "La versión del servidor cambió", version);
        }
    }

    private final ObjectMapper mapper;
    private final ActividadRepository actividadRepository;
    private final BloqueRecurrenteRepository bloqueRepository;
    private final UsuarioRepository usuarioRepository;
    private final NotificacionRepository notificacionRepository;
    private final NotaRepository notaRepository;
    private final ActividadService actividadService;
    private final ActividadCompartidaService actividadCompartidaService;
    private final HorarioService horarioService;
    private final UsuarioService usuarioService;
    private final BienestarService bienestarService;
    private final ConexionService conexionService;
    private final ChatService chatService;
    private final NotificacionService notificacionService;

    public SyncDomainService(ObjectMapper mapper,
                             ActividadRepository actividadRepository,
                             BloqueRecurrenteRepository bloqueRepository,
                             UsuarioRepository usuarioRepository,
                             NotificacionRepository notificacionRepository,
                             NotaRepository notaRepository,
                             ActividadService actividadService,
                             ActividadCompartidaService actividadCompartidaService,
                             HorarioService horarioService,
                             UsuarioService usuarioService,
                             BienestarService bienestarService,
                             ConexionService conexionService,
                             ChatService chatService,
                             NotificacionService notificacionService) {
        this.mapper = mapper;
        this.actividadRepository = actividadRepository;
        this.bloqueRepository = bloqueRepository;
        this.usuarioRepository = usuarioRepository;
        this.notificacionRepository = notificacionRepository;
        this.notaRepository = notaRepository;
        this.actividadService = actividadService;
        this.actividadCompartidaService = actividadCompartidaService;
        this.horarioService = horarioService;
        this.usuarioService = usuarioService;
        this.bienestarService = bienestarService;
        this.conexionService = conexionService;
        this.chatService = chatService;
        this.notificacionService = notificacionService;
    }

    public Outcome apply(Usuario authenticatedUser, SyncOperationRequest operation) {
        Usuario user = usuarioRepository.findById(authenticatedUser.getId())
                .orElseThrow(() -> new IllegalArgumentException("Usuario no encontrado"));
        JsonNode payload = operation.payload() == null ? mapper.createObjectNode() : operation.payload();

        return switch (operation.kind()) {
            case "activity.create" -> createActivity(user, payload);
            case "activity.update" -> updateActivity(user, payload, operation.expectedVersion());
            case "activity.status" -> updateActivityStatus(user, payload, operation.expectedVersion());
            case "activity.reschedule" -> rescheduleActivity(user, payload, operation.expectedVersion());
            case "activity.delete" -> deleteActivity(user, payload, operation.expectedVersion());
            case "schedule.create" -> createSchedule(user, payload);
            case "schedule.update" -> updateSchedule(user, payload, operation.expectedVersion());
            case "schedule.delete" -> deleteSchedule(user, payload, operation.expectedVersion());
            case "note.create" -> createNote(user, payload);
            case "note.update" -> updateNote(user, payload);
            case "note.delete" -> deleteNote(user, payload);
            case "profile.update" -> updateProfile(user, payload);
            case "profile.theme" -> updateTheme(user, payload);
            case "wellbeing.pomodoro" -> savePomodoro(user, payload);
            case "wellbeing.pause" -> savePause(user, payload);
            case "community.connect" -> communityConnect(user, payload);
            case "community.accept" -> communityAccept(user, payload);
            case "community.reject" -> communityReject(user, payload);
            case "community.remove" -> communityRemove(user, payload);
            case "chat.send" -> chatSend(user, payload);
            case "chat.read" -> chatRead(user, payload);
            case "chat.delete" -> chatDelete(user, payload);
            case "notification.read", "notifications.read" -> notificationRead(user, payload);
            case "notification.readAll", "notifications.readAll" -> notificationReadAll(user);
            case "notification.delete", "notifications.delete" -> notificationDelete(user, payload);
            default -> throw new IllegalArgumentException("Kind no soportado: " + operation.kind());
        };
    }

    private LocalDateTime parseUpdatedAt(JsonNode payload) {
        if (payload.hasNonNull("updatedAt")) {
            try {
                String val = payload.get("updatedAt").asText();
                if (val.contains("Z")) {
                    return java.time.Instant.parse(val).atZone(java.time.ZoneId.systemDefault()).toLocalDateTime();
                }
                return LocalDateTime.parse(val);
            } catch (Exception ex) {
                return LocalDateTime.now();
            }
        }
        return LocalDateTime.now();
    }

    private Outcome createActivity(Usuario user, JsonNode payload) {
        CreateActividadRequest body = convert(payload, CreateActividadRequest.class);
        require(body.titulo(), "El título es obligatorio");
        require(body.tipo(), "El tipo es obligatorio");
        if (body.fechaInicio() == null) throw new IllegalArgumentException("La fecha de inicio es obligatoria");

        Actividad a = new Actividad();
        a.setUsuario(user);
        copyActivity(a, body.titulo(), body.tipo(), body.fechaInicio(), body.horaInicio(),
                body.duracionMinutos(), body.materia(), body.prioridad(), body.fechaEntrega(),
                body.descripcion(), null, body.color());
        a.setUpdatedAt(parseUpdatedAt(payload));
        validateActivity(a);
        actividadService.guardar(a);
        actividadRepository.flush();
        actividadCompartidaService.registrarPropietario(a, user);
        if (isGroup(a.getTipo())) {
            actividadCompartidaService.vincularCompaneros(a, user, body.companerosIds());
        }
        return Outcome.applied(activityData(a, user), a.getVersion());
    }

    private Outcome updateActivity(Usuario user, JsonNode payload, Long expectedVersion) {
        Actividad a = ownedActivity(user, entityId(payload));
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (a.getUpdatedAt() != null && a.getUpdatedAt().isAfter(clientUpdatedAt)) {
            // El servidor tiene cambios más recientes, ignorar cambios y devolver estado del servidor
            return Outcome.applied(activityData(a, user), a.getVersion());
        }

        UpdateActividadRequest body = convert(payload, UpdateActividadRequest.class);
        require(body.titulo(), "El título es obligatorio");
        require(body.tipo(), "El tipo es obligatorio");
        if (body.fechaInicio() == null) throw new IllegalArgumentException("La fecha de inicio es obligatoria");
        copyActivity(a, body.titulo(), body.tipo(), body.fechaInicio(), body.horaInicio(),
                body.duracionMinutos(), body.materia(), body.prioridad(), body.fechaEntrega(),
                body.descripcion(), body.estado(), body.color());
        a.setUpdatedAt(clientUpdatedAt);
        validateActivity(a);
        actividadService.guardar(a);
        actividadRepository.flush();
        if (isGroup(a.getTipo())) {
            actividadCompartidaService.actualizarCompaneros(a, user, body.companerosIds());
        }
        return Outcome.applied(activityData(a, user), a.getVersion());
    }

    private Outcome updateActivityStatus(Usuario user, JsonNode payload, Long expectedVersion) {
        Actividad a = activity(entityId(payload));
        if (!actividadService.puedeAcceder(user, a)) throw new IllegalArgumentException("No tienes permiso");
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (a.getUpdatedAt() != null && a.getUpdatedAt().isAfter(clientUpdatedAt)) {
            return Outcome.applied(activityData(a, user), a.getVersion());
        }

        String estado = text(payload, "estado");
        require(estado, "El estado es obligatorio");
        actividadService.cambiarEstado(user, a.getId(), estado);
        
        Actividad current = activity(a.getId());
        current.setUpdatedAt(clientUpdatedAt);
        actividadService.guardar(current);
        actividadRepository.flush();
        return Outcome.applied(activityData(current, user), current.getVersion());
    }

    private Outcome rescheduleActivity(Usuario user, JsonNode payload, Long expectedVersion) {
        Actividad a = ownedActivity(user, entityId(payload));
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (a.getUpdatedAt() != null && a.getUpdatedAt().isAfter(clientUpdatedAt)) {
            return Outcome.applied(activityData(a, user), a.getVersion());
        }

        LocalDate date = value(payload, "fecha", LocalDate.class);
        LocalTime time = value(payload, "hora", LocalTime.class);
        if (date == null) throw new IllegalArgumentException("La fecha es obligatoria");
        Actividad updated = actividadService.reagendarActividad(user, a.getId(), date, time);
        
        updated.setUpdatedAt(clientUpdatedAt);
        actividadService.guardar(updated);
        actividadRepository.flush();
        return Outcome.applied(activityData(updated, user), updated.getVersion());
    }

    private Outcome deleteActivity(Usuario user, JsonNode payload, Long expectedVersion) {
        Long id = entityId(payload);
        Actividad a = actividadRepository.findById(id).orElse(null);
        if (a == null) return Outcome.applied(deletedData(id), null);
        if (!actividadService.puedeEditar(user, a)) throw new IllegalArgumentException("No tienes permiso");
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (a.getUpdatedAt() != null && a.getUpdatedAt().isAfter(clientUpdatedAt)) {
            // El servidor tiene cambios más recientes, el borrado se ignora
            return Outcome.applied(activityData(a, user), a.getVersion());
        }
        
        actividadService.eliminar(id, user);
        return Outcome.applied(deletedData(id), null);
    }

    private Outcome createSchedule(Usuario user, JsonNode payload) {
        BloqueRecurrente saved = horarioService.guardar(user, schedulePayload(payload));
        saved.setUpdatedAt(parseUpdatedAt(payload));
        bloqueRepository.save(saved);
        bloqueRepository.flush();
        return Outcome.applied(scheduleData(saved), saved.getVersion());
    }

    private Outcome updateSchedule(Usuario user, JsonNode payload, Long expectedVersion) {
        BloqueRecurrente current = ownedSchedule(user, entityId(payload));
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (current.getUpdatedAt() != null && current.getUpdatedAt().isAfter(clientUpdatedAt)) {
            return Outcome.applied(scheduleData(current), current.getVersion());
        }

        BloqueRecurrente saved = horarioService.actualizar(user, current.getId(), schedulePayload(payload));
        saved.setUpdatedAt(clientUpdatedAt);
        bloqueRepository.save(saved);
        bloqueRepository.flush();
        return Outcome.applied(scheduleData(saved), saved.getVersion());
    }

    private Outcome deleteSchedule(Usuario user, JsonNode payload, Long expectedVersion) {
        Long id = entityId(payload);
        BloqueRecurrente current = bloqueRepository.findById(id).orElse(null);
        if (current == null) return Outcome.applied(deletedData(id), null);
        if (!current.getUsuario().getId().equals(user.getId())) throw new IllegalArgumentException("No tienes permiso");
        
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (current.getUpdatedAt() != null && current.getUpdatedAt().isAfter(clientUpdatedAt)) {
            return Outcome.applied(scheduleData(current), current.getVersion());
        }

        horarioService.eliminar(user, id);
        return Outcome.applied(deletedData(id), null);
    }

    private Outcome createNote(Usuario user, JsonNode payload) {
        String id = text(payload, "id");
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id es obligatorio");

        Nota nota = notaRepository.findById(id).orElse(null);
        if (nota != null) {
            // LWW
            LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
            if (nota.getUpdatedAt() != null && nota.getUpdatedAt().isAfter(clientUpdatedAt)) {
                return Outcome.applied(mapper.valueToTree(NotaDto.from(nota)), nota.getVersion());
            }
        } else {
            nota = new Nota();
            nota.setId(id);
            nota.setUsuario(user);
            LocalDateTime clientCreatedAt = value(payload, "createdAt", LocalDateTime.class);
            nota.setCreatedAt(clientCreatedAt != null ? clientCreatedAt : LocalDateTime.now());
        }

        nota.setTitulo(text(payload, "titulo"));
        nota.setContenido(text(payload, "contenido"));
        nota.setPinned(payload.hasNonNull("pinned") && payload.get("pinned").asBoolean());
        nota.setColor(text(payload, "color"));
        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        nota.setUpdatedAt(clientUpdatedAt != null ? clientUpdatedAt : LocalDateTime.now());

        notaRepository.save(nota);
        notaRepository.flush();

        return Outcome.applied(mapper.valueToTree(NotaDto.from(nota)), nota.getVersion());
    }

    private Outcome updateNote(Usuario user, JsonNode payload) {
        String id = text(payload, "id");
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id es obligatorio");

        Nota nota = notaRepository.findById(id).orElse(null);
        if (nota == null) {
            return createNote(user, payload);
        }

        if (!nota.getUsuario().getId().equals(user.getId())) {
            throw new IllegalArgumentException("No autorizado");
        }

        LocalDateTime clientUpdatedAt = parseUpdatedAt(payload);
        if (nota.getUpdatedAt() != null && nota.getUpdatedAt().isAfter(clientUpdatedAt)) {
            return Outcome.applied(mapper.valueToTree(NotaDto.from(nota)), nota.getVersion());
        }

        nota.setTitulo(text(payload, "titulo"));
        nota.setContenido(text(payload, "contenido"));
        nota.setPinned(payload.hasNonNull("pinned") && payload.get("pinned").asBoolean());
        nota.setColor(text(payload, "color"));
        nota.setUpdatedAt(clientUpdatedAt != null ? clientUpdatedAt : LocalDateTime.now());

        notaRepository.save(nota);
        notaRepository.flush();

        return Outcome.applied(mapper.valueToTree(NotaDto.from(nota)), nota.getVersion());
    }

    private Outcome deleteNote(Usuario user, JsonNode payload) {
        String id = text(payload, "id");
        if (id == null || id.isBlank()) throw new IllegalArgumentException("id es obligatorio");

        Nota nota = notaRepository.findById(id).orElse(null);
        if (nota != null) {
            if (!nota.getUsuario().getId().equals(user.getId())) {
                throw new IllegalArgumentException("No autorizado");
            }
            notaRepository.delete(nota);
        }

        return Outcome.applied(mapper.valueToTree(Map.of("id", id, "deleted", true)), null);
    }

    private Outcome updateProfile(Usuario user, JsonNode payload) {
        UpdateProfileRequest body = convert(payload, UpdateProfileRequest.class);
        require(body.nombre(), "El nombre es obligatorio");
        validatePhone(body.telefono(), "El teléfono debe tener exactamente 10 dígitos numéricos");
        validatePhone(body.telefonoEmergencia(), "El teléfono de emergencia debe tener 10 dígitos numéricos");
        user.setNombre(body.nombre().trim());
        user.setTelefono(blankToNull(body.telefono()));
        user.setFechaNacimiento(body.fechaNacimiento());
        user.setGenero(body.genero());
        user.setNombreEmergencia(blankToNull(body.nombreEmergencia()));
        user.setTelefonoEmergencia(blankToNull(body.telefonoEmergencia()));
        user.setRelacionEmergencia(body.relacionEmergencia());
        usuarioRepository.saveAndFlush(user);
        return Outcome.applied(mapper.valueToTree(ProfileDto.from(user)), null);
    }

    private Outcome updateTheme(Usuario user, JsonNode payload) {
        String theme = payload.hasNonNull("tema") ? payload.get("tema").asText() : text(payload, "theme");
        if (!"dark".equals(theme) && !"light".equals(theme)) {
            throw new IllegalArgumentException("Tema no válido. Usa dark o light");
        }
        user.setTema(theme);
        usuarioRepository.saveAndFlush(user);
        return Outcome.applied(mapper.valueToTree(ProfileDto.from(user)), null);
    }

    private Outcome savePomodoro(Usuario user, JsonNode payload) {
        int duration = integer(payload, "duracion", integer(payload, "duration", 25));
        if (duration <= 0 || duration > 1440) throw new IllegalArgumentException("Duración inválida");
        RegistroBienestar r = bienestarService.guardarPomodoro(user, duration);
        return Outcome.applied(wellbeingData(r), null);
    }

    private Outcome savePause(Usuario user, JsonNode payload) {
        String type = payload.hasNonNull("tipoPausa") ? payload.get("tipoPausa").asText() : text(payload, "tipo");
        require(type, "El tipo de pausa es obligatorio");
        int duration = integer(payload, "duracion", integer(payload, "duration", 5));
        if (duration <= 0 || duration > 1440) throw new IllegalArgumentException("Duración inválida");
        RegistroBienestar r = bienestarService.guardarPausaActiva(user, type, duration);
        return Outcome.applied(wellbeingData(r), null);
    }

    private Outcome communityConnect(Usuario user, JsonNode payload) {
        var c = conexionService.solicitarConexion(user, requiredLong(payload, "userId"));
        return Outcome.applied(mapper.valueToTree(Map.of("connectionId", c.getId())), null);
    }

    private Outcome communityAccept(Usuario user, JsonNode payload) {
        Long id = connectionId(payload);
        conexionService.aceptarSolicitud(user, id);
        return Outcome.applied(mapper.valueToTree(Map.of("connectionId", id)), null);
    }

    private Outcome communityReject(Usuario user, JsonNode payload) {
        Long id = connectionId(payload);
        conexionService.rechazarSolicitud(user, id);
        return Outcome.applied(mapper.valueToTree(Map.of("connectionId", id)), null);
    }

    private Outcome communityRemove(Usuario user, JsonNode payload) {
        Long id = connectionId(payload);
        ConexionService.RelacionInfo relation;
        try {
            relation = conexionService.obtenerRelacionPorId(user, id);
        } catch (IllegalArgumentException ex) {
            if ("Solicitud no encontrada".equals(ex.getMessage())) {
                return Outcome.applied(deletedData(id), null);
            }
            throw ex;
        }
        if ("SOLICITUD_ENVIADA".equals(relation.estadoRelacion())) {
            conexionService.cancelarSolicitud(user, id);
        } else if ("CONECTADO".equals(relation.estadoRelacion())) {
            conexionService.desconectar(user, id);
        } else {
            throw new IllegalArgumentException("No puedes eliminar esta relación");
        }
        return Outcome.applied(deletedData(id), null);
    }

    private Outcome chatSend(Usuario user, JsonNode payload) {
        ChatMessageDto message = chatService.enviar(
                user, requiredLong(payload, "destinatarioId"), text(payload, "contenido"));
        return Outcome.applied(mapper.valueToTree(message), null);
    }

    private Outcome chatRead(Usuario user, JsonNode payload) {
        int count = chatService.marcarLeidos(user, chatUserId(payload));
        return Outcome.applied(mapper.valueToTree(Map.of("updated", count)), null);
    }

    private Outcome chatDelete(Usuario user, JsonNode payload) {
        int count = chatService.eliminarConversacion(user, chatUserId(payload));
        return Outcome.applied(mapper.valueToTree(Map.of("deleted", count)), null);
    }

    private Outcome notificationRead(Usuario user, JsonNode payload) {
        Long id = entityId(payload);
        Notificacion notification = notificacionRepository.findById(id).orElse(null);
        if (notification != null && !notification.getUsuario().getId().equals(user.getId())) {
            throw new IllegalArgumentException("No tienes permiso");
        }
        boolean updated = notification != null && notificacionService.marcarLeida(id, user);
        return Outcome.applied(mapper.valueToTree(Map.of(
                "ok", true, "updated", updated, "count", notificacionService.contarNoLeidas(user))), null);
    }

    private Outcome notificationReadAll(Usuario user) {
        int count = notificacionService.marcarTodasLeidas(user);
        return Outcome.applied(mapper.valueToTree(Map.of("ok", true, "updated", count)), null);
    }

    private Outcome notificationDelete(Usuario user, JsonNode payload) {
        Long id = entityId(payload);
        Notificacion notification = notificacionRepository.findById(id).orElse(null);
        if (notification == null) return Outcome.applied(deletedData(id), null);
        if (!notification.getUsuario().getId().equals(user.getId())) {
            throw new IllegalArgumentException("No tienes permiso");
        }
        notificacionService.eliminar(id, user);
        return Outcome.applied(deletedData(id), null);
    }

    private Actividad ownedActivity(Usuario user, Long id) {
        Actividad a = activity(id);
        if (!actividadService.puedeEditar(user, a)) throw new IllegalArgumentException("No tienes permiso");
        return a;
    }

    private Actividad activity(Long id) {
        return actividadRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Actividad no encontrada"));
    }

    private BloqueRecurrente ownedSchedule(Usuario user, Long id) {
        BloqueRecurrente block = bloqueRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Bloque no encontrado"));
        if (!block.getUsuario().getId().equals(user.getId())) throw new IllegalArgumentException("No tienes permiso");
        return block;
    }

    private void copyActivity(Actividad a, String title, String type, LocalDate date, LocalTime time,
                              Integer duration, String subject, String priority, LocalDate due,
                              String description, String status, String color) {
        a.setTitulo(title.trim());
        a.setTipo(type);
        a.setFechaInicio(date);
        a.setHoraInicio(time);
        a.setDuracionMinutos(duration != null ? duration : 60);
        a.setMateria(subject);
        a.setPrioridad(priority != null && !priority.isBlank() ? priority : "MEDIA");
        a.setFechaEntrega(due);
        a.setDescripcion(description);
        if (status != null && !status.isBlank()) a.setEstado(status);
        a.setEsAcademico(!List.of("CITA_MEDICA", "CITA_LABORAL", "OTRO").contains(type));
        if (color != null && !color.isBlank()) a.setColor(color);
    }

    private void validateActivity(Actividad a) {
        List<String> errors = actividadService.validarActividad(a);
        if (!errors.isEmpty()) throw new IllegalArgumentException(String.join(". ", errors));
    }

    private BloqueRecurrente schedulePayload(JsonNode payload) {
        CreateScheduleBlockRequest body = convert(payload, CreateScheduleBlockRequest.class);
        BloqueRecurrente b = new BloqueRecurrente();
        b.setMateria(body.materia());
        b.setDiaSemana(body.diaSemana());
        b.setHoraInicio(body.horaInicio());
        b.setHoraFin(body.horaFin());
        b.setAula(body.aula());
        b.setProfesor(body.profesor());
        b.setColor(body.color());
        return b;
    }

    private JsonNode activityData(Actividad a, Usuario user) {
        ObjectNode data = mapper.valueToTree(ActividadDto.from(a, user, actividadService,
                actividadCompartidaService.obtenerIdsCompanerosVinculados(a)));
        return data;
    }

    private JsonNode scheduleData(BloqueRecurrente block) {
        return mapper.valueToTree(horarioService.toMap(block));
    }

    private JsonNode wellbeingData(RegistroBienestar r) {
        return mapper.valueToTree(Map.of(
                "id", r.getId(), "tipo", r.getTipo(), "duracion", r.getValor(),
                "fecha", r.getFecha().toString()));
    }

    private JsonNode deletedData(Long id) {
        return mapper.valueToTree(Map.of("id", id, "deleted", true));
    }

    private Outcome versionConflict(Long actual, Long expected, JsonNode data) {
        if (expected != null && !expected.equals(actual)) return Outcome.conflict(data, actual);
        return null;
    }

    private Long entityId(JsonNode payload) {
        if (payload.hasNonNull("id")) return payload.get("id").longValue();
        if (payload.hasNonNull("entityId")) return payload.get("entityId").longValue();
        throw new IllegalArgumentException("id es obligatorio");
    }

    private Long connectionId(JsonNode payload) {
        if (payload.hasNonNull("connectionId")) return payload.get("connectionId").longValue();
        return entityId(payload);
    }

    private Long chatUserId(JsonNode payload) {
        if (payload.hasNonNull("userId")) return payload.get("userId").longValue();
        return requiredLong(payload, "otroUsuarioId");
    }

    private Long requiredLong(JsonNode payload, String field) {
        if (!payload.hasNonNull(field) || !payload.get(field).canConvertToLong()) {
            throw new IllegalArgumentException(field + " es obligatorio");
        }
        return payload.get(field).longValue();
    }

    private String text(JsonNode payload, String field) {
        return payload.hasNonNull(field) ? payload.get(field).asText() : null;
    }

    private int integer(JsonNode payload, String field, int fallback) {
        return payload.hasNonNull(field) ? payload.get(field).asInt() : fallback;
    }

    private <T> T value(JsonNode payload, String field, Class<T> type) {
        if (!payload.hasNonNull(field)) return null;
        return mapper.convertValue(payload.get(field), type);
    }

    private <T> T convert(JsonNode payload, Class<T> type) {
        try {
            return mapper.treeToValue(payload, type);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Payload inválido: " + ex.getMessage());
        }
    }

    private void validatePhone(String phone, String message) {
        if (phone != null && !phone.isBlank() && !usuarioService.telefonoValido(phone)) {
            throw new IllegalArgumentException(message);
        }
    }

    private static void require(String value, String message) {
        if (value == null || value.isBlank()) throw new IllegalArgumentException(message);
    }

    private static String blankToNull(String value) {
        return value != null && !value.isBlank() ? value.trim() : null;
    }

    private static boolean isGroup(String type) {
        return "REUNION_GRUPAL".equals(type) || "TRABAJO_GRUPO".equals(type);
    }
}
