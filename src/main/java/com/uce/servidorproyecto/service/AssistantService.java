package com.uce.servidorproyecto.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.uce.servidorproyecto.api.dto.*;
import com.uce.servidorproyecto.dto.ConflictoEvento;
import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.AssistantAction;
import com.uce.servidorproyecto.model.BloqueRecurrente;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.AssistantActionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.*;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class AssistantService {

    private static final Duration ACTION_TTL = Duration.ofMinutes(15);
    private static final Set<String> TYPES = Set.of(
            "CLASE", "DEBER", "EXAMEN", "REUNION_GRUPAL", "TRABAJO_GRUPO",
            "CITA_MEDICA", "CITA_LABORAL", "OTRO");
    private static final Set<String> PRIORITIES = Set.of("ALTA", "MEDIA", "BAJA");
    private static final Pattern TIME_PATTERN = Pattern.compile(
            "(?iu)(?:a\\s+las?\\s+)(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?"
                    + "|\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b"
                    + "|\\b(\\d{1,2})\\s*(am|pm)\\b");
    private static final Pattern ID_PATTERN = Pattern.compile(
            "(?iu)(?:actividad\\s*(?:#|id\\s*)?|#)(\\d+)");

    private final ActividadService actividadService;
    private final ActividadCompartidaService actividadCompartidaService;
    private final HorarioService horarioService;
    private final IAProviderService iaProviderService;
    private final ConflictDetectionService conflictDetectionService;
    private final AssistantActionRepository actionRepository;
    private final ObjectMapper objectMapper;

    public AssistantService(ActividadService actividadService,
                            ActividadCompartidaService actividadCompartidaService,
                            HorarioService horarioService,
                            IAProviderService iaProviderService,
                            ConflictDetectionService conflictDetectionService,
                            AssistantActionRepository actionRepository,
                            ObjectMapper objectMapper) {
        this.actividadService = actividadService;
        this.actividadCompartidaService = actividadCompartidaService;
        this.horarioService = horarioService;
        this.iaProviderService = iaProviderService;
        this.conflictDetectionService = conflictDetectionService;
        this.actionRepository = actionRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public AssistantMessageResponse message(Usuario usuario, AssistantMessageRequest request) {
        String mensaje = request.mensaje().trim();
        Context context = loadContext(usuario);
        String key = idempotencyKey(request.idempotencyKey(), mensaje);

        Optional<AssistantAction> existing = actionRepository.findByUsuarioAndIdempotencyKey(usuario, key);
        if (existing.isPresent()) {
            return new AssistantMessageResponse("Esta propuesta ya fue registrada.", toDto(existing.get()), false);
        }

        Optional<ProposalCandidate> fallbackProposal = deterministicProposal(mensaje, context);
        if (fallbackProposal.isPresent()) {
            AssistantAction action = persist(usuario, fallbackProposal.get(), key);
            return new AssistantMessageResponse(proposalText(action), toDto(action), false);
        }

        Optional<String> deterministicAnswer = deterministicAnswer(mensaje, context);
        if (deterministicAnswer.isPresent()) {
            return new AssistantMessageResponse(deterministicAnswer.get(), null, false);
        }

        try {
            JsonNode model = parseModelJson(iaProviderService.consultar(buildPrompt(usuario, mensaje, request.historial(), context)));
            ProposalCandidate candidate = validateModelProposal(model.path("proposal"), mensaje, context).orElse(null);
            AssistantAction action = candidate == null ? null : persist(usuario, candidate, key);
            String answer = cleanAnswer(model.path("respuesta").asText(""));
            if (answer.isBlank()) answer = action != null ? proposalText(action) : genericFallback();
            return new AssistantMessageResponse(answer, action != null ? toDto(action) : null, true);
        } catch (Exception ignored) {
            return new AssistantMessageResponse(genericFallback(), null, false);
        }
    }

    @Transactional(noRollbackFor = IllegalStateException.class)
    public AssistantProposalDto confirm(Usuario usuario, UUID id) {
        AssistantAction action = ownedForUpdate(usuario, id);
        if (action.getEstado() == AssistantAction.Status.CONFIRMED) return toDto(action);
        requirePendingAndUnexpired(action);

        JsonNode payload = readPayload(action);
        List<String> conflicts = proposalConflicts(action, payload);
        if (!conflicts.isEmpty()) {
            throw new IllegalStateException(
                    "La propuesta tiene conflictos de horario: " + String.join(", ", conflicts));
        }
        Actividad result;
        if (action.getTipo() == AssistantAction.Type.CREATE_ACTIVITY) {
            result = createActivity(usuario, payload);
        } else {
            long activityId = requiredLong(payload, "activityId");
            Actividad current = actividadService.buscarPorId(activityId);
            if (current == null || !actividadService.puedeEditar(usuario, current)) {
                throw new IllegalArgumentException("La actividad ya no existe o no te pertenece");
            }
            result = actividadService.reagendarActividad(
                    usuario, activityId,
                    requiredDate(payload, "date"),
                    optionalTime(payload, "time"));
        }

        action.setEstado(AssistantAction.Status.CONFIRMED);
        action.setResueltoEn(Instant.now());
        action.setActividadResultadoId(result.getId());
        return toDto(actionRepository.save(action));
    }

    @Transactional(noRollbackFor = IllegalStateException.class)
    public AssistantProposalDto cancel(Usuario usuario, UUID id) {
        AssistantAction action = ownedForUpdate(usuario, id);
        if (action.getEstado() == AssistantAction.Status.CANCELLED) return toDto(action);
        requirePendingAndUnexpired(action);
        action.setEstado(AssistantAction.Status.CANCELLED);
        action.setResueltoEn(Instant.now());
        return toDto(actionRepository.save(action));
    }

    private AssistantAction ownedForUpdate(Usuario usuario, UUID id) {
        return actionRepository.findOwnedForUpdate(id, usuario.getId())
                .orElseThrow(() -> new IllegalArgumentException("Propuesta no encontrada"));
    }

    private void requirePendingAndUnexpired(AssistantAction action) {
        if (action.getEstado() != AssistantAction.Status.PENDING) {
            throw new IllegalStateException("La propuesta ya fue resuelta");
        }
        if (!action.getExpiraEn().isAfter(Instant.now())) {
            action.setEstado(AssistantAction.Status.EXPIRED);
            action.setResueltoEn(Instant.now());
            actionRepository.save(action);
            throw new IllegalStateException("La propuesta expiró");
        }
    }

    private Actividad createActivity(Usuario usuario, JsonNode payload) {
        Actividad activity = new Actividad();
        activity.setUsuario(usuario);
        activity.setTitulo(requiredText(payload, "title", 200));
        activity.setTipo(requiredType(payload.path("type").asText()));
        activity.setFechaInicio(requiredDate(payload, "date"));
        activity.setHoraInicio(optionalTime(payload, "time"));
        int duration = payload.path("durationMinutes").asInt(60);
        activity.setDuracionMinutos(Math.max(1, Math.min(duration, 1440)));
        activity.setMateria(optionalText(payload, "subject", 200));
        activity.setDescripcion(optionalText(payload, "description", 1000));
        activity.setPrioridad(requiredPriority(payload.path("priority").asText("MEDIA")));
        activity.setEsAcademico(!Set.of("CITA_MEDICA", "CITA_LABORAL", "OTRO").contains(activity.getTipo()));
        List<String> errors = actividadService.validarActividad(activity);
        if (!errors.isEmpty()) throw new IllegalArgumentException(String.join(". ", errors));
        actividadService.guardar(activity);
        actividadCompartidaService.registrarPropietario(activity, usuario);
        return activity;
    }

    private AssistantAction persist(Usuario usuario, ProposalCandidate candidate, String key) {
        AssistantAction action = new AssistantAction();
        action.setUsuario(usuario);
        action.setTipo(candidate.type());
        action.setPayloadJson(writeJson(candidate.payload()));
        action.setEstado(AssistantAction.Status.PENDING);
        action.setExpiraEn(Instant.now().plus(ACTION_TTL));
        action.setIdempotencyKey(key);
        return actionRepository.save(action);
    }

    private Optional<ProposalCandidate> validateModelProposal(JsonNode proposal, String message, Context context) {
        if (!proposal.isObject() || !hasActionIntent(message)) return Optional.empty();
        String type = proposal.path("type").asText("");
        JsonNode payload = proposal.path("payload");
        try {
            if ("CREATE_ACTIVITY".equals(type) && hasCreateIntent(message)) {
                ObjectNode clean = cleanCreatePayload(payload);
                if (!containsMeaningfulTitle(message, clean.path("title").asText())) return Optional.empty();
                return Optional.of(new ProposalCandidate(AssistantAction.Type.CREATE_ACTIVITY, clean));
            }
            if ("RESCHEDULE_ACTIVITY".equals(type) && hasRescheduleIntent(message)) {
                ObjectNode clean = cleanReschedulePayload(payload, context);
                return Optional.of(new ProposalCandidate(AssistantAction.Type.RESCHEDULE_ACTIVITY, clean));
            }
        } catch (RuntimeException ignored) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    private ObjectNode cleanCreatePayload(JsonNode payload) {
        ObjectNode clean = objectMapper.createObjectNode();
        clean.put("title", requiredText(payload, "title", 200));
        clean.put("type", requiredType(payload.path("type").asText("OTRO")));
        LocalDate date = requiredDate(payload, "date");
        if (date.isBefore(LocalDate.now())) throw new IllegalArgumentException("Fecha pasada");
        clean.put("date", date.toString());
        LocalTime time = optionalTime(payload, "time");
        if (time != null) clean.put("time", time.toString());
        clean.put("durationMinutes", Math.max(1, Math.min(payload.path("durationMinutes").asInt(60), 1440)));
        clean.put("priority", requiredPriority(payload.path("priority").asText("MEDIA")));
        copyOptional(payload, clean, "subject", 200);
        copyOptional(payload, clean, "description", 1000);
        return clean;
    }

    private ObjectNode cleanReschedulePayload(JsonNode payload, Context context) {
        long id = requiredLong(payload, "activityId");
        Actividad activity = context.activities().stream()
                .filter(a -> Objects.equals(a.getId(), id) && context.userId().equals(a.getUsuario().getId()))
                .findFirst().orElseThrow(() -> new IllegalArgumentException("Actividad ajena"));
        if (!actividadService.esReagendable(activity)) throw new IllegalArgumentException("No reagendable");
        LocalDate date = requiredDate(payload, "date");
        if (date.isBefore(LocalDate.now())) throw new IllegalArgumentException("Fecha pasada");
        ObjectNode clean = objectMapper.createObjectNode();
        clean.put("activityId", id);
        clean.put("activityTitle", activity.getTitulo());
        clean.put("date", date.toString());
        LocalTime time = optionalTime(payload, "time");
        if (time != null) clean.put("time", time.toString());
        return clean;
    }

    private Optional<ProposalCandidate> deterministicProposal(String message, Context context) {
        if (hasRescheduleIntent(message)) {
            Actividad activity = resolveActivity(message, context).orElse(null);
            LocalDate date = extractDate(message);
            if (activity != null && actividadService.esReagendable(activity) && date != null) {
                ObjectNode payload = objectMapper.createObjectNode();
                payload.put("activityId", activity.getId());
                payload.put("activityTitle", activity.getTitulo());
                payload.put("date", date.toString());
                LocalTime time = extractTime(message);
                if (time != null) payload.put("time", time.toString());
                return Optional.of(new ProposalCandidate(AssistantAction.Type.RESCHEDULE_ACTIVITY, payload));
            }
        }
        if (hasCreateIntent(message)) {
            String title = extractTitle(message);
            LocalDate date = extractDate(message);
            if (title != null && date != null) {
                ObjectNode payload = objectMapper.createObjectNode();
                payload.put("title", title);
                payload.put("type", inferType(message));
                payload.put("date", date.toString());
                LocalTime time = extractTime(message);
                if (time != null) payload.put("time", time.toString());
                payload.put("durationMinutes", extractDuration(message));
                payload.put("priority", inferPriority(message));
                return Optional.of(new ProposalCandidate(AssistantAction.Type.CREATE_ACTIVITY, payload));
            }
        }
        return Optional.empty();
    }

    private Optional<String> deterministicAnswer(String message, Context context) {
        String normalized = normalize(message);
        if (normalized.matches(".*\\b(hoy|actividades de hoy|que tengo hoy)\\b.*")) {
            return Optional.of(answerForDate("Hoy", LocalDate.now(), context));
        }
        if (normalized.matches(".*\\b(manana|actividades de manana|que tengo manana)\\b.*")) {
            return Optional.of(answerForDate("Mañana", LocalDate.now().plusDays(1), context));
        }
        if (normalized.matches(".*\\b(horario|clases|clase)\\b.*")) {
            List<BloqueRecurrente> today = context.schedule().stream()
                    .filter(b -> b.getDiaSemana() == LocalDate.now().getDayOfWeek().getValue()).toList();
            if (today.isEmpty()) return Optional.of("No tienes bloques recurrentes en tu horario de hoy.");
            return Optional.of("Tu horario de hoy: " + joinSchedule(today) + ".");
        }
        if (normalized.matches(".*\\b(pendientes|pendiente)\\b.*")) {
            List<Actividad> pending = context.activities().stream().filter(this::isPending).toList();
            return Optional.of(pending.isEmpty() ? "No tienes actividades pendientes."
                    : "Tienes " + pending.size() + " pendiente(s): " + joinActivities(pending) + ".");
        }
        return Optional.empty();
    }

    private String answerForDate(String label, LocalDate date, Context context) {
        List<Actividad> activities = byDate(context.activities(), date);
        List<BloqueRecurrente> blocks = context.schedule().stream()
                .filter(b -> b.getDiaSemana() == date.getDayOfWeek().getValue()).toList();
        if (activities.isEmpty() && blocks.isEmpty()) {
            return "No tienes actividades ni bloques de horario registrados para " + label.toLowerCase(Locale.ROOT) + ".";
        }
        List<String> parts = new ArrayList<>();
        if (!activities.isEmpty()) parts.add("actividades: " + joinActivities(activities));
        if (!blocks.isEmpty()) parts.add("horario: " + joinSchedule(blocks));
        return label + " tienes " + String.join(". ", parts) + ".";
    }

    private Context loadContext(Usuario user) {
        return new Context(user.getId(), actividadService.listarPorUsuario(user), horarioService.listarPorUsuario(user));
    }

    private String buildPrompt(Usuario user, String message, List<AssistantHistoryMessage> history, Context context) {
        StringBuilder out = new StringBuilder("""
                Eres el asistente contextual de Flowday. Usa únicamente los datos suministrados.
                Nunca inventes actividades ni IDs y nunca elijas ni devuelvas usuarioId.
                Devuelve SOLO JSON: {"respuesta":"texto en español","proposal":null}
                o {"respuesta":"texto","proposal":{"type":"CREATE_ACTIVITY|RESCHEDULE_ACTIVITY","payload":{...}}}.
                Solo propón acciones si el último mensaje las pide explícitamente. CREATE payload:
                title,type,date(ISO),time(HH:mm opcional),durationMinutes,priority,subject/description opcionales.
                RESCHEDULE payload: activityId,date(ISO),time(HH:mm opcional). Usa solo IDs del contexto.
                Roles válidos del historial: user y assistant.
                """);
        out.append("Fecha actual: ").append(LocalDate.now()).append('\n');
        out.append("Nombre: ").append(user.getNombre()).append('\n');
        out.append("Contexto real:\n").append(contextText(context));
        if (history != null) {
            out.append("Historial:\n");
            history.stream().filter(Objects::nonNull).skip(Math.max(0, history.size() - 12L)).forEach(h -> {
                String role = normalizeRole(h.role());
                if (role != null && h.text() != null && !h.text().isBlank()) {
                    out.append(role).append(": ").append(limit(h.text(), 400)).append('\n');
                }
            });
        }
        out.append("Último mensaje: ").append(message);
        return out.toString();
    }

    private String contextText(Context context) {
        StringBuilder out = new StringBuilder();
        List<Actividad> activities = context.activities();
        appendGroup(out, "Hoy", byDate(activities, LocalDate.now()));
        appendGroup(out, "Mañana", byDate(activities, LocalDate.now().plusDays(1)));
        appendGroup(out, "Próximas 7 días", activities.stream()
                .filter(a -> a.getFechaInicio() != null && a.getFechaInicio().isAfter(LocalDate.now().plusDays(1))
                        && !a.getFechaInicio().isAfter(LocalDate.now().plusDays(7))).toList());
        appendGroup(out, "Pendientes", activities.stream().filter(this::isPending).toList());
        out.append("Horario recurrente: ").append(context.schedule().isEmpty()
                ? "sin bloques" : context.schedule().stream()
                .map(b -> HorarioService.nombreDia(b.getDiaSemana()) + " " + b.getHoraInicio() + "-"
                        + b.getHoraFin() + " " + b.getMateria()).reduce((a, b) -> a + "; " + b).orElse("")).append('\n');
        return out.toString();
    }

    private void appendGroup(StringBuilder out, String label, List<Actividad> values) {
        out.append(label).append(": ");
        if (values.isEmpty()) out.append("ninguna");
        else out.append(values.stream().map(this::activityContext).reduce((a, b) -> a + "; " + b).orElse(""));
        out.append('\n');
    }

    private String activityContext(Actividad a) {
        return "[id=" + a.getId() + ", título=" + a.getTitulo() + ", fecha=" + a.getFechaInicio()
                + ", hora=" + a.getHoraInicio() + ", estado=" + a.getEstado() + ", tipo=" + a.getTipo() + "]";
    }

    private JsonNode parseModelJson(String raw) throws Exception {
        if (raw == null) throw new IllegalArgumentException("Respuesta vacía");
        int start = raw.indexOf('{');
        int end = raw.lastIndexOf('}');
        if (start < 0 || end <= start) throw new IllegalArgumentException("JSON ausente");
        JsonNode node = objectMapper.readTree(raw.substring(start, end + 1));
        if (!node.isObject() || !node.has("respuesta")) throw new IllegalArgumentException("JSON inválido");
        return node;
    }

    private AssistantProposalDto toDto(AssistantAction action) {
        JsonNode payload = readPayload(action);
        return new AssistantProposalDto(action.getId(), action.getTipo().name(), action.getEstado().name(),
                proposalSummary(action.getTipo(), payload), proposalConflicts(action, payload),
                payload, action.getExpiraEn(), action.getActividadResultadoId());
    }

    private String proposalSummary(AssistantAction.Type type, JsonNode payload) {
        String title = type == AssistantAction.Type.CREATE_ACTIVITY
                ? payload.path("title").asText("Actividad")
                : payload.path("activityTitle").asText("Actividad");
        String date = payload.path("date").asText("");
        String time = payload.path("time").asText("");
        return (type == AssistantAction.Type.CREATE_ACTIVITY ? "Crear \"" : "Reagendar \"")
                + title + "\" para " + date + (time.isBlank() ? "" : " a las " + time);
    }

    private List<String> proposalConflicts(AssistantAction action, JsonNode payload) {
        LocalTime time = optionalTime(payload, "time");
        if (time == null) return List.of();
        LocalDate date = requiredDate(payload, "date");
        Long excludeId = action.getActividadResultadoId();
        int duration = Math.max(1, payload.path("durationMinutes").asInt(60));
        String tipo = payload.path("type").asText(null);
        if (tipo == null || tipo.isBlank()) {
            tipo = payload.path("tipo").asText(null);
        }
        String materia = payload.path("subject").asText(null);
        if (materia == null || materia.isBlank()) {
            materia = payload.path("materia").asText(null);
        }
        if (action.getTipo() == AssistantAction.Type.RESCHEDULE_ACTIVITY) {
            excludeId = requiredLong(payload, "activityId");
            Actividad current = actividadService.buscarPorId(excludeId);
            if (current != null && current.getDuracionMinutos() != null) {
                duration = current.getDuracionMinutos();
            }
            if (current != null) {
                if (tipo == null || tipo.isBlank()) tipo = current.getTipo();
                if (materia == null || materia.isBlank()) materia = current.getMateria();
            }
        }
        return conflictDetectionService
                .detectarConflictos(action.getUsuario(), date, time, duration, excludeId, tipo, materia)
                .stream()
                .map(this::conflictText)
                .toList();
    }

    private String conflictText(ConflictoEvento conflict) {
        return conflict.getTitulo() + " (" + conflict.getHoraInicio() + "-"
                + conflict.getHoraFin() + ")";
    }

    private JsonNode readPayload(AssistantAction action) {
        try {
            return objectMapper.readTree(action.getPayloadJson());
        } catch (Exception e) {
            throw new IllegalStateException("Payload de propuesta inválido", e);
        }
    }

    private String writeJson(JsonNode node) {
        try {
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalArgumentException("No se pudo guardar la propuesta", e);
        }
    }

    private Optional<Actividad> resolveActivity(String message, Context context) {
        Matcher idMatcher = ID_PATTERN.matcher(message);
        if (idMatcher.find()) {
            long id = Long.parseLong(idMatcher.group(1));
            return context.activities().stream()
                    .filter(a -> Objects.equals(a.getId(), id) && context.userId().equals(a.getUsuario().getId()))
                    .findFirst();
        }
        String normalized = normalize(message);
        List<Actividad> matches = context.activities().stream()
                .filter(a -> context.userId().equals(a.getUsuario().getId()))
                .filter(a -> a.getTitulo() != null && normalized.contains(normalize(a.getTitulo())))
                .toList();
        return matches.size() == 1 ? Optional.of(matches.get(0)) : Optional.empty();
    }

    private String extractTitle(String message) {
        Matcher quoted = Pattern.compile("[\"“']([^\"”']{2,200})[\"”']").matcher(message);
        if (quoted.find()) return quoted.group(1).trim();
        Matcher matcher = Pattern.compile(
                "(?iu)\\b(?:crea|crear|agenda|agendar|programa|programar)\\b\\s+(?:una?\\s+)?(?:actividad|tarea|cita|reunion|reunión|examen)?\\s*(?:llamad[ao]|titulad[ao])?\\s*(.+)")
                .matcher(message);
        if (!matcher.find()) return null;
        String title = matcher.group(1).trim()
                .replaceFirst("(?iu)\\s+(?:(?:para|el)\\s+)?(?:hoy|mañana|manana|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4}).*$", "")
                .replaceFirst("(?iu)\\s+a\\s+las?\\s+\\d{1,2}(?::\\d{2})?.*$", "")
                .trim();
        return title.length() >= 2 && title.length() <= 200 ? title : null;
    }

    private LocalDate extractDate(String text) {
        String normalized = normalize(text);
        if (normalized.matches(".*\\bmanana\\b.*")) return LocalDate.now().plusDays(1);
        if (normalized.matches(".*\\bhoy\\b.*")) return LocalDate.now();
        Matcher iso = Pattern.compile("\\b(\\d{4}-\\d{2}-\\d{2})\\b").matcher(text);
        if (iso.find()) return parseDate(iso.group(1));
        Matcher latin = Pattern.compile("\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b").matcher(text);
        if (latin.find()) {
            try {
                return LocalDate.of(Integer.parseInt(latin.group(3)), Integer.parseInt(latin.group(2)),
                        Integer.parseInt(latin.group(1)));
            } catch (DateTimeException ignored) { return null; }
        }
        return null;
    }

    private LocalTime extractTime(String text) {
        Matcher matcher = TIME_PATTERN.matcher(text);
        if (!matcher.find()) return null;
        String hourText = firstNonNull(matcher.group(1), matcher.group(4), matcher.group(7));
        String minuteText = firstNonNull(matcher.group(2), matcher.group(5));
        String ampm = firstNonNull(matcher.group(3), matcher.group(6), matcher.group(8));
        int hour = Integer.parseInt(hourText);
        int minute = minuteText == null ? 0 : Integer.parseInt(minuteText);
        if (ampm != null) {
            if ("pm".equalsIgnoreCase(ampm) && hour < 12) hour += 12;
            if ("am".equalsIgnoreCase(ampm) && hour == 12) hour = 0;
        }
        if (hour < 24 && minute < 60) return LocalTime.of(hour, minute);
        return null;
    }

    private int extractDuration(String message) {
        Matcher hours = Pattern.compile("(?iu)(\\d{1,2})\\s*horas?").matcher(message);
        if (hours.find()) return Math.min(Integer.parseInt(hours.group(1)) * 60, 1440);
        Matcher minutes = Pattern.compile("(?iu)(\\d{1,4})\\s*(?:min|minutos?)").matcher(message);
        return minutes.find() ? Math.max(1, Math.min(Integer.parseInt(minutes.group(1)), 1440)) : 60;
    }

    private String inferType(String message) {
        String n = normalize(message);
        if (n.contains("examen")) return "EXAMEN";
        if (n.contains("tarea") || n.contains("deber")) return "DEBER";
        if (n.contains("reunion")) return "REUNION_GRUPAL";
        if (n.contains("cita medica")) return "CITA_MEDICA";
        if (n.contains("cita laboral")) return "CITA_LABORAL";
        if (n.contains("clase")) return "CLASE";
        return "OTRO";
    }

    private String inferPriority(String message) {
        String n = normalize(message);
        if (n.contains("prioridad alta") || n.contains("urgente")) return "ALTA";
        if (n.contains("prioridad baja")) return "BAJA";
        return "MEDIA";
    }

    private boolean hasActionIntent(String message) { return hasCreateIntent(message) || hasRescheduleIntent(message); }
    private boolean hasCreateIntent(String message) {
        return normalize(message).matches(".*\\b(crea|crear|agenda|agendar|programa|programar)\\b.*");
    }
    private boolean hasRescheduleIntent(String message) {
        return normalize(message).matches(".*\\b(reagenda|reagendar|mueve|mover|cambia|cambiar)\\b.*");
    }

    private boolean containsMeaningfulTitle(String message, String title) {
        return title != null && title.length() >= 2 && normalize(message).contains(normalize(title));
    }

    private List<Actividad> byDate(List<Actividad> activities, LocalDate date) {
        return activities.stream().filter(a -> date.equals(a.getFechaInicio()))
                .sorted(Comparator.comparing(Actividad::getHoraInicio,
                        Comparator.nullsLast(Comparator.naturalOrder()))).toList();
    }

    private boolean isPending(Actividad a) {
        return !"COMPLETADA".equals(a.getEstado()) && !"CANCELADA".equals(a.getEstado());
    }

    private String joinActivities(List<Actividad> activities) {
        return activities.stream().limit(10)
                .map(a -> a.getTitulo() + (a.getHoraInicio() == null ? "" : " a las " + a.getHoraInicio()))
                .reduce((a, b) -> a + "; " + b).orElse("");
    }

    private String joinSchedule(List<BloqueRecurrente> blocks) {
        return blocks.stream().map(b -> b.getMateria() + " de " + b.getHoraInicio() + " a " + b.getHoraFin())
                .reduce((a, b) -> a + "; " + b).orElse("");
    }

    private String normalizeRole(String role) {
        if (role == null) return null;
        return switch (role.toLowerCase(Locale.ROOT)) {
            case "user" -> "user";
            case "assistant", "bot" -> "assistant";
            default -> null;
        };
    }

    private String requiredText(JsonNode node, String field, int max) {
        String value = node.path(field).asText("").trim();
        if (value.isBlank() || value.length() > max) throw new IllegalArgumentException(field + " inválido");
        return value;
    }

    private String optionalText(JsonNode node, String field, int max) {
        String value = node.path(field).asText("").trim();
        return value.isBlank() ? null : limit(value, max);
    }

    private void copyOptional(JsonNode source, ObjectNode target, String field, int max) {
        String value = optionalText(source, field, max);
        if (value != null) target.put(field, value);
    }

    private long requiredLong(JsonNode node, String field) {
        if (!node.has(field) || !node.path(field).canConvertToLong()) throw new IllegalArgumentException(field + " inválido");
        return node.path(field).asLong();
    }

    private LocalDate requiredDate(JsonNode node, String field) {
        LocalDate value = parseDate(node.path(field).asText(""));
        if (value == null) throw new IllegalArgumentException(field + " inválido");
        return value;
    }

    private LocalDate parseDate(String value) {
        try { return LocalDate.parse(value); }
        catch (DateTimeParseException ignored) { return null; }
    }

    private LocalTime optionalTime(JsonNode node, String field) {
        String value = node.path(field).asText("").trim();
        if (value.isBlank()) return null;
        try { return LocalTime.parse(value, DateTimeFormatter.ofPattern("H:mm")); }
        catch (DateTimeParseException ignored) { throw new IllegalArgumentException(field + " inválido"); }
    }

    private String requiredType(String type) {
        String value = type == null ? "" : type.toUpperCase(Locale.ROOT);
        if (!TYPES.contains(value)) throw new IllegalArgumentException("Tipo inválido");
        return value;
    }

    private String requiredPriority(String priority) {
        String value = priority == null ? "" : priority.toUpperCase(Locale.ROOT);
        if (!PRIORITIES.contains(value)) throw new IllegalArgumentException("Prioridad inválida");
        return value;
    }

    private String idempotencyKey(String supplied, String message) {
        String source = supplied == null || supplied.isBlank() ? normalize(message) : supplied.trim();
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(source.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("No se pudo generar idempotencia", e);
        }
    }

    private String proposalText(AssistantAction action) {
        return action.getTipo() == AssistantAction.Type.CREATE_ACTIVITY
                ? "Preparé una propuesta para crear la actividad. Revísala y confírmala."
                : "Preparé una propuesta para reagendar la actividad. Revísala y confírmala.";
    }

    private String cleanAnswer(String answer) { return limit(answer.replaceAll("\\s+", " ").trim(), 1000); }
    private String genericFallback() {
        return "Puedo consultar tus actividades de hoy o mañana, tu horario y pendientes, o preparar una propuesta para crear o reagendar una actividad.";
    }
    private String limit(String value, int max) { return value.length() <= max ? value : value.substring(0, max); }
    private String normalize(String value) {
        if (value == null) return "";
        String decomposed = java.text.Normalizer.normalize(value, java.text.Normalizer.Form.NFD);
        return decomposed.replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    private String firstNonNull(String... values) {
        for (String value : values) if (value != null) return value;
        return null;
    }

    private record ProposalCandidate(AssistantAction.Type type, ObjectNode payload) {}
    private record Context(Long userId, List<Actividad> activities, List<BloqueRecurrente> schedule) {}
}
