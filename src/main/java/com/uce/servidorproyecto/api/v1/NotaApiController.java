package com.uce.servidorproyecto.api.v1;

import com.uce.servidorproyecto.api.ApiAuthHelper;
import com.uce.servidorproyecto.api.dto.ApiResponse;
import com.uce.servidorproyecto.api.dto.NotaDto;
import com.uce.servidorproyecto.model.Nota;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.NotaRepository;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/notas")
@Tag(name = "Notes", description = "Gestión de notas rápidas")
public class NotaApiController {

    @Autowired
    private NotaRepository notaRepository;

    @GetMapping
    @Operation(summary = "Listar notas del usuario")
    public ApiResponse<List<NotaDto>> list(WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");
        
        List<NotaDto> items = notaRepository.findByUsuarioOrderByPinnedDescUpdatedAtDesc(usuario).stream()
                .map(NotaDto::from)
                .toList();
        return ApiResponse.success(items, Map.of("total", items.size()));
    }

    @PostMapping
    @Operation(summary = "Crear o actualizar nota con Last-Write-Wins")
    public ApiResponse<NotaDto> saveOrUpdate(@RequestBody NotaDto dto, WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");

        if (dto.id() == null || dto.id().isBlank()) {
            return ApiResponse.failure("El ID de la nota es obligatorio");
        }

        Nota nota = notaRepository.findById(dto.id()).orElse(null);
        if (nota == null) {
            nota = new Nota();
            nota.setId(dto.id());
            nota.setUsuario(usuario);
            nota.setCreatedAt(dto.createdAt() != null ? dto.createdAt() : LocalDateTime.now());
        } else {
            // Verificar pertenencia
            if (!nota.getUsuario().getId().equals(usuario.getId())) {
                return ApiResponse.failure("No autorizado");
            }
            // Resolver conflictos: Last-Write-Wins
            if (dto.updatedAt() != null && nota.getUpdatedAt() != null && nota.getUpdatedAt().isAfter(dto.updatedAt())) {
                // El servidor tiene una versión más nueva, ignoramos los cambios y devolvemos la versión del servidor
                return ApiResponse.success(NotaDto.from(nota));
            }
        }

        nota.setTitulo(dto.titulo());
        nota.setContenido(dto.contenido());
        nota.setPinned(dto.pinned());
        nota.setColor(dto.color());
        nota.setUpdatedAt(dto.updatedAt() != null ? dto.updatedAt() : LocalDateTime.now());

        notaRepository.save(nota);
        return ApiResponse.success(NotaDto.from(nota));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Eliminar nota")
    public ApiResponse<Map<String, Object>> delete(@PathVariable String id, WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return ApiResponse.failure("No autenticado");

        Nota nota = notaRepository.findById(id).orElse(null);
        if (nota != null) {
            if (!nota.getUsuario().getId().equals(usuario.getId())) {
                return ApiResponse.failure("No autorizado");
            }
            notaRepository.delete(nota);
        }
        return ApiResponse.success(Map.of("id", id, "deleted", true));
    }
}
