package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.model.UsuarioActividad;
import com.uce.servidorproyecto.repository.ActividadRepository;
import com.uce.servidorproyecto.repository.UsuarioActividadRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class ActividadService {

    @Autowired
    private ActividadRepository actividadRepository;

    @Autowired
    private UsuarioActividadRepository usuarioActividadRepository;

    // ===== LISTAR =====
    public List<Actividad> listarPorUsuario(Usuario usuario) {
        List<Actividad> propias = actividadRepository.findByUsuario(usuario);
        List<Actividad> compartidas = usuarioActividadRepository.findActividadesCompartidasConUsuario(usuario);

        java.util.LinkedHashMap<Long, Actividad> unicas = new java.util.LinkedHashMap<>();
        for (Actividad a : propias) unicas.put(a.getId(), a);
        for (Actividad a : compartidas) unicas.putIfAbsent(a.getId(), a);
        return new ArrayList<>(unicas.values());
    }

    public List<Actividad> listarHoy(Usuario usuario) {
        return actividadRepository
            .findByUsuarioAndFechaInicioOrderByHoraInicio(usuario, LocalDate.now());
    }

    // ===== CRUD =====
    public void guardar(Actividad actividad) {
        actividadRepository.save(actividad);
    }

    public Actividad buscarPorId(Long id) {
        return actividadRepository.findById(id).orElse(null);
    }

    @Transactional(rollbackFor = Exception.class)
    public void eliminar(Long id, Usuario usuario) {
        Actividad actividad = actividadRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("Actividad no encontrada"));
        if (!puedeEditar(usuario, actividad)) {
            throw new IllegalArgumentException("No tienes permiso para eliminar esta actividad");
        }
        usuarioActividadRepository.deleteByActividad(actividad);
        actividadRepository.delete(actividad);
    }

    // ===== DETECCIÓN DE CHOQUES - FILTRADO EN JAVA (COMPATIBLE CON TODAS LAS BASES DE DATOS) =====
    public boolean hayChoque(Usuario usuario, LocalDate fecha,
                              LocalTime horaInicio, Integer duracionMin, Long idExcluir) {
        if (horaInicio == null || duracionMin == null) return false;

        // Calcular hora de fin
        LocalTime horaFin = horaInicio.plusMinutes(duracionMin);

        // Obtener todas las actividades del usuario en esa fecha
        List<Actividad> actividadesDelDia = actividadRepository
                .findByUsuarioAndFechaInicio(usuario, fecha);

        // Filtrar en Java para detectar choques
        for (Actividad a : actividadesDelDia) {
            // Saltar la actividad que se está editando (si tiene ID)
            if (idExcluir != null && a.getId().equals(idExcluir)) {
                continue;
            }

            // Si la actividad no tiene hora o duración, no se considera
            if (a.getHoraInicio() == null || a.getDuracionMinutos() == null) {
                continue;
            }

            LocalTime inicioExistente = a.getHoraInicio();
            LocalTime finExistente = inicioExistente.plusMinutes(a.getDuracionMinutos());

            // Detectar superposición: (inicioExistente < horaFin && finExistente > horaInicio)
            if (inicioExistente.isBefore(horaFin) && finExistente.isAfter(horaInicio)) {
                return true; // Hay choque
            }
        }
        return false; // No hay choque
    }

    // ===== BIENESTAR =====
    public boolean diaEstasSaturado(Usuario usuario) {
        LocalDate hoy = LocalDate.now();
        Integer minutos = actividadRepository.sumarMinutosDia(usuario, hoy);
        long prioritarias = actividadRepository.contarPrioritariasPendientes(usuario, hoy);
        return (minutos != null && minutos > 360) || prioritarias > 3;
    }

    // ===== REAGENDAR =====
    public List<Actividad> listarReagendables(Usuario usuario) {
        return actividadRepository.findReagendables(usuario);
    }

    public boolean esReagendable(Actividad actividad) {
        if (actividad == null || "COMPLETADA".equals(actividad.getEstado())) return false;
        String tipo = actividad.getTipo();
        return "REUNION_GRUPAL".equals(tipo) || "CITA_MEDICA".equals(tipo)
                || "CITA_LABORAL".equals(tipo) || "TRABAJO_GRUPO".equals(tipo);
    }

    /** Recursos IA solo para tareas (DEBER) y exámenes (EXAMEN). */
    public boolean aplicaRecursosIa(Actividad actividad) {
        if (actividad == null || actividad.getTipo() == null) return false;
        String tipo = actividad.getTipo();
        return "DEBER".equals(tipo) || "EXAMEN".equals(tipo);
    }

    public Map<String, Object> toReagendarMap(Actividad a) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", a.getId());
        m.put("titulo", a.getTitulo());
        m.put("tipo", a.getTipo());
        m.put("fechaInicio", a.getFechaInicio() != null ? a.getFechaInicio().toString() : null);
        m.put("horaInicio", a.getHoraInicio() != null ? a.getHoraInicio().toString() : null);
        m.put("etiqueta", formatearEtiquetaReagendar(a));
        return m;
    }

    private String formatearEtiquetaReagendar(Actividad a) {
        String icono = switch (a.getTipo() != null ? a.getTipo() : "") {
            case "REUNION_GRUPAL" -> "👥";
            case "CITA_MEDICA" -> "🏥";
            case "CITA_LABORAL" -> "💼";
            case "TRABAJO_GRUPO" -> "🤝";
            default -> "📅";
        };
        String fecha = a.getFechaInicio() != null ? a.getFechaInicio().toString() : "sin fecha";
        String hora = a.getHoraInicio() != null ? a.getHoraInicio().toString() : "sin hora";
        return icono + " " + a.getTitulo() + " — " + fecha + " " + hora;
    }

    @Transactional
    public Actividad reagendarActividad(Usuario usuario, Long id, LocalDate nuevaFecha, LocalTime nuevaHora) {
        Actividad actividad = actividadRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Actividad no encontrada"));

        if (!actividad.getUsuario().getId().equals(usuario.getId())) {
            throw new RuntimeException("No tienes permiso para reagendar esta actividad");
        }
        if (!esReagendable(actividad)) {
            throw new RuntimeException("Este tipo de actividad no se puede reagendar desde aquí");
        }
        if (nuevaFecha.isBefore(LocalDate.now())) {
            throw new RuntimeException("No puedes reagendar para una fecha pasada");
        }
        if (nuevaHora == null) {
            nuevaHora = actividad.getHoraInicio();
        }
        if (nuevaHora == null) {
            nuevaHora = LocalTime.of(9, 0);
        }

        if (hayChoque(actividad.getUsuario(), nuevaFecha, nuevaHora,
                      actividad.getDuracionMinutos(), id)) {
            throw new RuntimeException("Conflicto de horario con otra actividad");
        }

        actividad.setFechaInicio(nuevaFecha);
        actividad.setHoraInicio(nuevaHora);
        actividad.setEstado("REAGENDADA");

        return actividadRepository.save(actividad);
    }

    // ===== TRANSACCIONES =====
    @Transactional(rollbackFor = Exception.class)
    public Actividad completarActividadConValidacion(Long id) {
        Actividad a = actividadRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Actividad no encontrada"));

        if ("COMPLETADA".equals(a.getEstado())) {
            throw new RuntimeException("La actividad ya está completada");
        }

        if (a.getDuracionMinutos() == null || a.getDuracionMinutos() <= 0) {
            throw new RuntimeException("La actividad debe tener una duración válida");
        }

        a.setEstado("COMPLETADA");
        a.setFechaEntrega(LocalDate.now());
        return actividadRepository.save(a);
    }

    @Transactional(rollbackFor = Exception.class)
    public void eliminarActividadesDeUsuario(Long usuarioId) {
        Usuario usuario = new Usuario();
        usuario.setId(usuarioId);
        List<Actividad> actividades = actividadRepository.findByUsuario(usuario);

        if (actividades.isEmpty()) {
            throw new RuntimeException("No hay actividades para eliminar");
        }

        actividadRepository.deleteAll(actividades);
    }
    
    // ===== CÁLCULO DE PRIORIDAD AUTOMÁTICA (Punto 6) =====
    public String calcularPrioridadAutomatica(Actividad actividad) {
        if (actividad.getFechaEntrega() == null) {
            return "MEDIA"; // Si no tiene fecha de entrega, media por defecto
        }
        long dias = java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(), actividad.getFechaEntrega());
        if (dias <= 1) return "ALTA";
        if (dias <= 3) return "MEDIA";
        return "BAJA";
    }

    // ===== VALIDACIÓN: NO AGENDAR EN PASADO (Punto 16) =====
    public boolean esFechaValida(LocalDate fecha) {
        return !fecha.isBefore(LocalDate.now());
    }

    // ===== OBTENER ACTIVIDADES FUTURAS (Para Línea de Tiempo, Punto 11) =====
    public List<Actividad> obtenerActividadesFuturas(Usuario usuario) {
        return actividadRepository.findByUsuarioAndFechaInicioAfterOrderByFechaInicioAsc(usuario, LocalDate.now().minusDays(1));
    }

    // ===== GENERAR ALERTAS (Punto 7) - Próximas a vencer + prioridad ALTA =====
    public List<Map<String, Object>> obtenerAlertasPrioridad(Usuario usuario) {
        LocalDate hoy = LocalDate.now();
        LocalDate limite = hoy.plusDays(2);

        List<Actividad> altaPrioridad = actividadRepository.findAlertasAltaPrioridad(usuario);
        List<Actividad> proximas = actividadRepository.findAlertasProximasAVencer(usuario, hoy, limite);

        Map<Long, Map<String, Object>> alertas = new java.util.LinkedHashMap<>();

        for (Actividad a : altaPrioridad) {
            Map<String, Object> entry = new HashMap<>();
            entry.put("actividad", a);
            entry.put("motivo", "ALTA");
            alertas.put(a.getId(), entry);
        }

        for (Actividad a : proximas) {
            if (alertas.containsKey(a.getId())) {
                alertas.get(a.getId()).put("motivo", "AMBOS");
            } else {
                Map<String, Object> entry = new HashMap<>();
                entry.put("actividad", a);
                entry.put("motivo", "VENCE_PRONTO");
                alertas.put(a.getId(), entry);
            }
        }

        List<Map<String, Object>> resultado = new ArrayList<>(alertas.values());
        resultado.sort((x, y) -> {
            Actividad ax = (Actividad) x.get("actividad");
            Actividad ay = (Actividad) y.get("actividad");
            if (ax.getFechaEntrega() == null && ay.getFechaEntrega() == null) return 0;
            if (ax.getFechaEntrega() == null) return 1;
            if (ay.getFechaEntrega() == null) return -1;
            return ax.getFechaEntrega().compareTo(ay.getFechaEntrega());
        });
        return resultado;
    }

    // ===== ACCESO Y DETALLE (API / MODALES) =====
    public boolean puedeAcceder(Usuario usuario, Actividad actividad) {
        if (usuario == null || actividad == null) return false;
        if (actividad.getUsuario().getId().equals(usuario.getId())) return true;
        return usuarioActividadRepository.findByActividadAndUsuario(actividad, usuario)
                .filter(UsuarioActividad::isActivo)
                .isPresent();
    }

    public boolean puedeEditar(Usuario usuario, Actividad actividad) {
        return actividad != null && usuario != null
                && actividad.getUsuario().getId().equals(usuario.getId());
    }

    public List<Actividad> listarPorFecha(Usuario usuario, LocalDate fecha) {
        return listarPorUsuario(usuario).stream()
                .filter(a -> fecha.equals(a.getFechaInicio()))
                .sorted((a, b) -> {
                    if (a.getHoraInicio() == null && b.getHoraInicio() == null) return 0;
                    if (a.getHoraInicio() == null) return 1;
                    if (b.getHoraInicio() == null) return -1;
                    return a.getHoraInicio().compareTo(b.getHoraInicio());
                })
                .toList();
    }

    public Map<String, Object> toDetalleMap(Actividad actividad, Usuario usuario) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", actividad.getId());
        map.put("titulo", actividad.getTitulo());
        map.put("descripcion", actividad.getDescripcion());
        map.put("materia", actividad.getMateria());
        map.put("tipo", actividad.getTipo());
        map.put("fechaInicio", actividad.getFechaInicio() != null ? actividad.getFechaInicio().toString() : null);
        map.put("horaInicio", actividad.getHoraInicio() != null ? actividad.getHoraInicio().toString() : null);
        map.put("fechaEntrega", actividad.getFechaEntrega() != null ? actividad.getFechaEntrega().toString() : null);
        map.put("duracionMinutos", actividad.getDuracionMinutos() != null ? actividad.getDuracionMinutos() : 25);
        map.put("prioridad", actividad.getPrioridad());
        map.put("color", actividad.getColor());
        map.put("esAcademico", actividad.isEsAcademico());
        map.put("aplicaRecursosIa", aplicaRecursosIa(actividad));
        map.put("puedeEditar", puedeEditar(usuario, actividad));
        map.put("esCompartida", !puedeEditar(usuario, actividad));

        String estado = actividad.getEstado();
        if (!puedeEditar(usuario, actividad)) {
            estado = usuarioActividadRepository.findByActividadAndUsuario(actividad, usuario)
                    .map(UsuarioActividad::getEstadoProgreso)
                    .orElse(estado);
        }
        map.put("estado", estado);
        return map;
    }

    public Map<String, Object> toListaMap(Actividad actividad, Usuario usuario) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", actividad.getId());
        map.put("titulo", actividad.getTitulo());
        map.put("materia", actividad.getMateria());
        map.put("tipo", actividad.getTipo());
        map.put("fechaInicio", actividad.getFechaInicio() != null ? actividad.getFechaInicio().toString() : null);
        map.put("horaInicio", actividad.getHoraInicio() != null ? actividad.getHoraInicio().toString() : null);
        map.put("prioridad", actividad.getPrioridad());
        map.put("color", actividad.getColor());
        map.put("duracionMinutos", actividad.getDuracionMinutos());
        map.put("esPropietario", puedeEditar(usuario, actividad));
        map.put("esCompartida", !puedeEditar(usuario, actividad));

        String estado = actividad.getEstado();
        if (!puedeEditar(usuario, actividad)) {
            estado = usuarioActividadRepository.findByActividadAndUsuario(actividad, usuario)
                    .map(UsuarioActividad::getEstadoProgreso)
                    .orElse(estado);
        }
        map.put("estado", estado);
        return map;
    }

    public Map<String, Object> toResumenMap(Actividad actividad) {
        Map<String, Object> map = new HashMap<>();
        map.put("id", actividad.getId());
        map.put("titulo", actividad.getTitulo());
        map.put("estado", actividad.getEstado());
        map.put("prioridad", actividad.getPrioridad());
        map.put("horaInicio", actividad.getHoraInicio() != null ? actividad.getHoraInicio().toString() : null);
        map.put("duracionMinutos", actividad.getDuracionMinutos());
        map.put("color", actividad.getColor());
        return map;
    }

    @Transactional
    public void cambiarEstado(Usuario usuario, Long actividadId, String nuevoEstado) {
        if (nuevoEstado == null || nuevoEstado.isBlank()) {
            throw new IllegalArgumentException("El estado es obligatorio");
        }
        Actividad actividad = buscarPorId(actividadId);
        if (actividad == null) {
            throw new IllegalArgumentException("Actividad no encontrada");
        }
        if (!puedeAcceder(usuario, actividad)) {
            throw new IllegalArgumentException("No tienes permiso para modificar esta actividad");
        }

        if (puedeEditar(usuario, actividad)) {
            actividad.setEstado(nuevoEstado);
            actividadRepository.save(actividad);
        } else {
            UsuarioActividad ua = usuarioActividadRepository.findByActividadAndUsuario(actividad, usuario)
                    .orElseThrow(() -> new IllegalArgumentException("No tienes permiso"));
            ua.setEstadoProgreso(nuevoEstado);
            usuarioActividadRepository.save(ua);
        }
    }

    public List<String> validarActividad(Actividad actividad) {
        List<String> errores = new ArrayList<>();
        if (actividad.getTitulo() == null || actividad.getTitulo().isBlank()) {
            errores.add("El título es obligatorio");
        } else if (actividad.getTitulo().length() > 200) {
            errores.add("El título no puede superar 200 caracteres");
        }
        if (actividad.getTipo() == null || actividad.getTipo().isBlank()) {
            errores.add("Selecciona un tipo de actividad");
        }
        if (actividad.getFechaInicio() == null) {
            errores.add("La fecha de inicio es obligatoria");
        } else if (actividad.getFechaInicio().isBefore(LocalDate.now())) {
            errores.add("La fecha de inicio no puede ser anterior a hoy");
        }
        if (actividad.getFechaEntrega() != null && actividad.getFechaInicio() != null
                && actividad.getFechaEntrega().isBefore(actividad.getFechaInicio())) {
            errores.add("La fecha de entrega no puede ser anterior a la fecha de inicio");
        }
        if (actividad.getDuracionMinutos() != null && actividad.getDuracionMinutos() <= 0) {
            errores.add("La duración debe ser mayor a 0 minutos");
        }
        return errores;
    }
}