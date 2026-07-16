package com.uce.servidorproyecto.controller;

import com.uce.servidorproyecto.api.ApiAuthHelper;
import com.uce.servidorproyecto.model.RegistroBienestar;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.BienestarService;
import com.uce.servidorproyecto.service.EstresService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;

import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.Map;

@RestController
@RequestMapping("/api/bienestar")
public class BienestarController {

    @Autowired
    private BienestarService bienestarService;

    @Autowired
    private EstresService estresService;
    
    // ===== GUARDAR SESIÓN POMODORO =====
    @PostMapping("/pomodoro")
    public Map<String, Object> guardarPomodoro(@RequestBody Map<String, Object> datos,
                                               WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) {
            return Map.of("error", "Usuario no autenticado");
        }

        Integer duracion = datos.get("duracion") != null ?
                Integer.parseInt(datos.get("duracion").toString()) : 25;

        RegistroBienestar registro = bienestarService.guardarPomodoro(usuario, duracion);
        return Map.of(
            "mensaje", "✅ Sesión Pomodoro guardada",
            "id", registro.getId(),
            "duracion", registro.getValor()
        );
    }

    // ===== GUARDAR PAUSA ACTIVA =====
    @PostMapping("/pausa")
    public Map<String, Object> guardarPausa(@RequestBody Map<String, Object> datos,
                                            WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) {
            return Map.of("error", "Usuario no autenticado");
        }

        String tipoPausa = datos.get("tipo") != null ? datos.get("tipo").toString() : "GENERAL";
        Integer duracion = datos.get("duracion") != null ?
                Integer.parseInt(datos.get("duracion").toString()) : 5;

        RegistroBienestar registro = bienestarService.guardarPausaActiva(usuario, tipoPausa, duracion);
        return Map.of(
            "mensaje", "✅ Pausa activa guardada",
            "id", registro.getId(),
            "tipo", registro.getTipo()
        );
    }

    // ===== OBTENER ESTADÍSTICAS =====
    @GetMapping("/estadisticas")
    public Map<String, Object> getEstadisticas(WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) {
            return Map.of("error", "Usuario no autenticado");
        }

        return bienestarService.getEstadisticasBienestar(usuario);
    }
    
    @GetMapping("/estres")
    public Map<String, Object> getEstres(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha,
                                         WebRequest request) {
        Usuario usuario = ApiAuthHelper.requireUser(request);
        if (usuario == null) return Map.of("error", "No autenticado");
        if (fecha == null) fecha = LocalDate.now();
        return estresService.calcularEstres(usuario, fecha);
    }
}
