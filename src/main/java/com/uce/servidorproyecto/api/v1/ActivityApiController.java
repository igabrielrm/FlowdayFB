package com.uce.servidorproyecto.api.v1;

import com.uce.servidorproyecto.api.ApiAuthHelper;
import com.uce.servidorproyecto.api.dto.ActividadDto;
import com.uce.servidorproyecto.api.dto.ActividadListItemDto;
import com.uce.servidorproyecto.api.dto.ApiResponse;
import com.uce.servidorproyecto.api.dto.CreateActividadRequest;
import com.uce.servidorproyecto.api.dto.PriorityAlertDto;
import com.uce.servidorproyecto.api.dto.RescheduleActivityRequest;
import com.uce.servidorproyecto.api.dto.UpdateActividadRequest;
import com.uce.servidorproyecto.dto.ResultadoReagendamiento;
import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.ActividadCompartidaService;
import com.uce.servidorproyecto.service.ActividadService;
import com.uce.servidorproyecto.service.ReagendamientoAutomaticoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/activities")
@Tag(name = "Activities", description = "Gestión de actividades")
public class ActivityApiController {

    @Autowired
    private ActividadService actividadService;

    @Autowired
    private ActividadCompartidaService actividadCompartidaService;

    @Autowired
    private ReagendamientoAutomaticoService reagendamientoAutomaticoService;

    private ActividadDto toDto(Actividad actividad, Usuario usuario) {
        try {
            List<Long> companeros = actividadCompartidaService.obtenerIdsCompanerosVinculados(actividad);
            return ActividadDto.from(actividad, usuario, actividadService, companeros);
        } catch (Exception ex) {
            // Evita 500 después de persistir (lazy session / mapping).
            return new ActividadDto(
                    actividad.getId(),
                    actividad.getVersion() != null ? actividad.getVersion() : 0L,
                    actividad.getTitulo(),
                    actividad.getDescripcion(),
                    actividad.getTipo(),
                    actividad.getEstado(),
                    actividad.getFechaInicio(),
                    actividad.getHoraInicio(),
                    actividad.getDuracionMinutos(),
                    actividad.getMateria(),
                    actividad.getPrioridad(),
                    actividad.getFechaEntrega(),
                    actividad.getColor(),
                    true,
                    true,
                    List.of(),
                    actividad.getUpdatedAt()
            );
        }
    }

    private static boolean esTipoGrupal(String tipo) {
        return "REUNION_GRUPAL".equals(tipo) || "TRABAJO_GRUPO".equals(tipo);
    }

    private static int normalizeDuracion(Integer duracionMinutos) {
        if (duracionMinutos == null || duracionMinutos <= 0) {
            return 60;
        }
        return duracionMinutos;
    }

    @GetMapping
    @Operation(summary = "Listar actividades del usuario")
    public ApiResponse<List<ActividadListItemDto>> list(WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        List<ActividadListItemDto> items = actividadService.listarPorUsuario(usuario).stream()
                .map(a -> ActividadListItemDto.from(a, usuario, actividadService))
                .toList();
        return ApiResponse.success(items, Map.of("total", items.size()));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Detalle de actividad")
    public ApiResponse<ActividadDto> get(@PathVariable Long id, WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        Actividad actividad = actividadService.buscarPorId(id);
        if (actividad == null || !actividadService.puedeAcceder(usuario, actividad)) {
            return ApiResponse.failure("Actividad no encontrada");
        }
        return ApiResponse.success(toDto(actividad, usuario));
    }

    @GetMapping("/by-date")
    @Operation(summary = "Actividades por fecha")
    public ApiResponse<List<ActividadListItemDto>> byDate(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha,
            WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        List<ActividadListItemDto> items = actividadService.listarPorFecha(usuario, fecha).stream()
                .map(a -> ActividadListItemDto.from(a, usuario, actividadService))
                .toList();
        return ApiResponse.success(items);
    }

    @GetMapping("/by-month")
    @Operation(summary = "Actividades por mes")
    public ApiResponse<List<ActividadListItemDto>> byMonth(
            @RequestParam int year,
            @RequestParam int month,
            WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        if (month < 1 || month > 12) {
            return ApiResponse.failure("Mes inválido");
        }
        List<ActividadListItemDto> items = actividadService.listarPorMes(usuario, year, month).stream()
                .map(a -> ActividadListItemDto.from(a, usuario, actividadService))
                .toList();
        return ApiResponse.success(items, Map.of("year", year, "month", month, "total", items.size()));
    }

    @PostMapping
    @Transactional
    @Operation(summary = "Crear actividad")
    public ApiResponse<ActividadDto> create(@Valid @RequestBody CreateActividadRequest body,
                                            WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");

        Actividad actividad = new Actividad();
        actividad.setUsuario(usuario);
        actividad.setTitulo(body.titulo().trim());
        actividad.setTipo(body.tipo());
        actividad.setFechaInicio(body.fechaInicio());
        actividad.setHoraInicio(body.horaInicio());
        actividad.setDuracionMinutos(normalizeDuracion(body.duracionMinutos()));
        actividad.setMateria(body.materia());
        actividad.setPrioridad(body.prioridad() != null && !body.prioridad().isBlank()
                ? body.prioridad() : "MEDIA");
        actividad.setFechaEntrega(body.fechaEntrega());
        actividad.setDescripcion(body.descripcion());
        actividad.setEsAcademico(!List.of("CITA_MEDICA", "CITA_LABORAL", "OTRO").contains(body.tipo()));
        if (body.color() != null && !body.color().isBlank()) {
            actividad.setColor(body.color());
        }

        List<String> errores = actividadService.validarActividad(actividad);
        if (!errores.isEmpty()) {
            return ApiResponse.failure(String.join(". ", errores));
        }

        // Persistir primero (IDENTITY) para que UsuarioActividad y logs tengan actividad con ID.
        actividad = actividadService.guardar(actividad);

        if (actividad.getFechaInicio() != null && actividad.getHoraInicio() != null
                && actividad.getDuracionMinutos() != null) {
            ResultadoReagendamiento res = reagendamientoAutomaticoService.resolverAlGuardar(
                    usuario, actividad, actividad.getId());
            if (!res.isExito()) {
                return ApiResponse.failure(res.getError());
            }
            actividad = actividadService.guardar(actividad);
        }

        actividadCompartidaService.registrarPropietario(actividad, usuario);
        if (esTipoGrupal(body.tipo())) {
            actividadCompartidaService.vincularCompaneros(actividad, usuario, body.companerosIds());
        }
        return ApiResponse.success(toDto(actividad, usuario));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualizar actividad")
    public ApiResponse<ActividadDto> update(@PathVariable Long id,
                                            @Valid @RequestBody UpdateActividadRequest body,
                                            WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");

        Actividad existente = actividadService.buscarPorId(id);
        if (existente == null || !actividadService.puedeEditar(usuario, existente)) {
            return ApiResponse.failure("No tienes permiso para editar esta actividad");
        }

        Actividad draft = new Actividad();
        draft.setTitulo(body.titulo().trim());
        draft.setTipo(body.tipo());
        draft.setFechaInicio(body.fechaInicio());
        draft.setHoraInicio(body.horaInicio());
        draft.setDuracionMinutos(normalizeDuracion(body.duracionMinutos()));
        draft.setMateria(body.materia());
        draft.setPrioridad(body.prioridad());
        draft.setFechaEntrega(body.fechaEntrega());
        draft.setDescripcion(body.descripcion());
        draft.setEstado(body.estado() != null && !body.estado().isBlank() ? body.estado() : existente.getEstado());
        draft.setEsAcademico(!List.of("CITA_MEDICA", "CITA_LABORAL", "OTRO").contains(body.tipo()));

        List<String> errores = actividadService.validarActividad(draft);
        if (!errores.isEmpty()) {
            return ApiResponse.failure(String.join(". ", errores));
        }

        existente.setTitulo(draft.getTitulo());
        existente.setDescripcion(draft.getDescripcion());
        existente.setMateria(draft.getMateria());
        existente.setTipo(draft.getTipo());
        existente.setFechaInicio(draft.getFechaInicio());
        existente.setHoraInicio(draft.getHoraInicio());
        existente.setDuracionMinutos(draft.getDuracionMinutos());
        existente.setFechaEntrega(draft.getFechaEntrega());
        existente.setEstado(draft.getEstado());
        existente.setEsAcademico(draft.isEsAcademico());
        if (body.color() != null && !body.color().isBlank()) {
            existente.setColor(body.color());
        }

        if (body.fechaEntrega() != null) {
            existente.setPrioridad(actividadService.calcularPrioridadAutomatica(draft));
        } else if (body.prioridad() != null && !body.prioridad().isBlank()) {
            existente.setPrioridad(body.prioridad());
        }

        if (existente.getFechaInicio() != null && existente.getHoraInicio() != null
                && existente.getDuracionMinutos() != null) {
            ResultadoReagendamiento res = reagendamientoAutomaticoService.resolverAlGuardar(
                    usuario, existente, id);
            if (!res.isExito()) {
                return ApiResponse.failure(res.getError());
            }
        }

        actividadService.guardar(existente);
        if (esTipoGrupal(existente.getTipo())) {
            actividadCompartidaService.actualizarCompaneros(existente, usuario, body.companerosIds());
        }
        return ApiResponse.success(toDto(existente, usuario));
    }

    @GetMapping("/priority-alerts")
    @Operation(summary = "Alertas de prioridad alta o vencimiento próximo")
    public ApiResponse<List<PriorityAlertDto>> priorityAlerts(WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        List<PriorityAlertDto> items = actividadService.obtenerAlertasPrioridad(usuario).stream()
                .map(m -> PriorityAlertDto.from(
                        (Actividad) m.get("actividad"),
                        String.valueOf(m.get("motivo"))))
                .toList();
        return ApiResponse.success(items);
    }

    @GetMapping("/reschedulable")
    @Operation(summary = "Actividades reagendables (reuniones y citas)")
    public ApiResponse<List<Map<String, Object>>> reschedulable(WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        List<Map<String, Object>> items = actividadService.listarReagendables(usuario).stream()
                .map(actividadService::toReagendarMap)
                .toList();
        return ApiResponse.success(items);
    }

    @PostMapping("/{id}/reschedule")
    @Operation(summary = "Reagendar actividad")
    public ApiResponse<ActividadDto> reschedule(@PathVariable Long id,
                                                @Valid @RequestBody RescheduleActivityRequest body,
                                                WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        if (body.fecha().isBefore(LocalDate.now())) {
            return ApiResponse.failure("No puedes reagendar para una fecha pasada");
        }
        try {
            Actividad actualizada = actividadService.reagendarActividad(
                    usuario, id, body.fecha(), body.hora());
            return ApiResponse.success(toDto(actualizada, usuario));
        } catch (IllegalArgumentException ex) {
            return ApiResponse.failure(ex.getMessage());
        }
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Cambiar estado de actividad")
    public ApiResponse<ActividadDto> updateStatus(@PathVariable Long id,
                                                  @RequestBody Map<String, String> body,
                                                  WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        String estado = body.get("estado");
        if (estado == null || estado.isBlank()) {
            return ApiResponse.failure("El estado es obligatorio");
        }
        try {
            actividadService.cambiarEstado(usuario, id, estado);
            Actividad actividad = actividadService.buscarPorId(id);
            return ApiResponse.success(toDto(actividad, usuario));
        } catch (IllegalArgumentException ex) {
            return ApiResponse.failure(ex.getMessage());
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Eliminar actividad")
    public ApiResponse<Void> delete(@PathVariable Long id, WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        try {
            actividadService.eliminar(id, usuario);
            return ApiResponse.success(null);
        } catch (IllegalArgumentException ex) {
            return ApiResponse.failure(ex.getMessage());
        }
    }
}
