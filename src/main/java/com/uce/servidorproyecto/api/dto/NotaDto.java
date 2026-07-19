package com.uce.servidorproyecto.api.dto;

import com.uce.servidorproyecto.model.Nota;
import java.time.LocalDateTime;

public record NotaDto(
        String id,
        Long version,
        String titulo,
        String contenido,
        boolean pinned,
        String color,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
    public static NotaDto from(Nota nota) {
        if (nota == null) return null;
        return new NotaDto(
                nota.getId(),
                nota.getVersion() != null ? nota.getVersion() : 0L,
                nota.getTitulo(),
                nota.getContenido(),
                nota.isPinned(),
                nota.getColor(),
                nota.getCreatedAt(),
                nota.getUpdatedAt()
        );
    }
}
