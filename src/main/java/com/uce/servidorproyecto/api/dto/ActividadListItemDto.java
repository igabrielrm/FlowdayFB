package com.uce.servidorproyecto.api.dto;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.ActividadService;

public record ActividadListItemDto(
        Long id,
        Long version,
        String titulo,
        String tipo,
        String estado,
        String materia,
        String fechaInicio,
        String horaInicio,
        String prioridad,
        Integer duracionMinutos,
        String color,
        boolean esPropietario,
        boolean esCompartida,
        String updatedAt
) {
    public static ActividadListItemDto from(Actividad actividad, Usuario usuario, ActividadService service) {
        var map = service.toListaMap(actividad, usuario);
        return new ActividadListItemDto(
                actividad.getId(),
                actividad.getVersion(),
                actividad.getTitulo(),
                actividad.getTipo(),
                String.valueOf(map.get("estado")),
                actividad.getMateria(),
                actividad.getFechaInicio() != null ? actividad.getFechaInicio().toString() : null,
                actividad.getHoraInicio() != null ? actividad.getHoraInicio().toString() : null,
                actividad.getPrioridad(),
                actividad.getDuracionMinutos(),
                actividad.getColor(),
                Boolean.TRUE.equals(map.get("esPropietario")),
                Boolean.TRUE.equals(map.get("esCompartida")),
                actividad.getUpdatedAt() != null ? actividad.getUpdatedAt().toString() : null
        );
    }
}
