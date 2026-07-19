package com.uce.servidorproyecto.api.dto;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.ActividadService;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public record ActividadDto(
        Long id,
        Long version,
        String titulo,
        String descripcion,
        String tipo,
        String estado,
        LocalDate fechaInicio,
        LocalTime horaInicio,
        Integer duracionMinutos,
        String materia,
        String prioridad,
        LocalDate fechaEntrega,
        String color,
        boolean esPropietario,
        boolean puedeEditar,
        List<Long> companerosIds,
        java.time.LocalDateTime updatedAt
) {
    public static ActividadDto from(Actividad a, Usuario viewer, ActividadService service, List<Long> companerosIds) {
        if (a == null) return null;
        boolean puedeEditar = false;
        boolean esPropietario = false;
        String estado = a.getEstado();
        try {
            puedeEditar = viewer != null && service != null && service.puedeEditar(viewer, a);
            esPropietario = puedeEditar;
            if (viewer != null && service != null && !puedeEditar) {
                Object mapped = service.toListaMap(a, viewer).get("estado");
                if (mapped != null) estado = String.valueOf(mapped);
            }
        } catch (Exception ignored) {
            esPropietario = viewer != null && a.getUsuario() != null
                    && viewer.getId().equals(a.getUsuario().getId());
            puedeEditar = esPropietario;
        }
        return new ActividadDto(
                a.getId(),
                a.getVersion() != null ? a.getVersion() : 0L,
                a.getTitulo(),
                a.getDescripcion(),
                a.getTipo(),
                estado,
                a.getFechaInicio(),
                a.getHoraInicio(),
                a.getDuracionMinutos(),
                a.getMateria(),
                a.getPrioridad(),
                a.getFechaEntrega(),
                a.getColor(),
                esPropietario,
                puedeEditar,
                companerosIds != null ? companerosIds : List.of(),
                a.getUpdatedAt()
        );
    }
}
