package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.ActividadRepository;
import com.uce.servidorproyecto.repository.AnuncioRepository;
import com.uce.servidorproyecto.repository.ConexionRepository;
import com.uce.servidorproyecto.repository.RegistroBienestarRepository;
import com.uce.servidorproyecto.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.WeekFields;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AdminService {

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private ActividadRepository actividadRepository;

    @Autowired
    private AnuncioRepository anuncioRepository;

    @Autowired
    private RegistroBienestarRepository registroBienestarRepository;

    @Autowired
    private ConexionRepository conexionRepository;

    @Autowired
    private EstresService estresService;

    // ===== ESTADÍSTICAS GENERALES =====
    public Map<String, Object> getEstadisticasGenerales() {
        Map<String, Object> stats = new HashMap<>();

        // Usuarios
        stats.put("totalUsuarios", usuarioRepository.count());
        stats.put("usuariosActivos", usuarioRepository.count());
        stats.put("totalEstudiantes", usuarioRepository.countEstudiantes());
        stats.put("totalAdmins", usuarioRepository.countAdmins());

        // Actividades
        stats.put("totalActividades", actividadRepository.count());

        // Actividades por estado
        List<Actividad> todas = actividadRepository.findAll();
        stats.put("actividadesPendientes", todas.stream()
                .filter(a -> "PENDIENTE".equals(a.getEstado()) || "EN_PROCESO".equals(a.getEstado()))
                .count());
        stats.put("actividadesCompletadas", todas.stream()
                .filter(a -> "COMPLETADA".equals(a.getEstado()))
                .count());

        // Anuncios
        stats.put("totalAnuncios", anuncioRepository.count());
        stats.put("anunciosActivos", anuncioRepository.countActivos());

        // Promedio de actividades por usuario
        long totalUsuarios = usuarioRepository.count();
        stats.put("promedioActividadesPorUsuario",
                totalUsuarios > 0 ?
                (double) actividadRepository.count() / totalUsuarios : 0);

        LocalDateTime semana = LocalDateTime.now().minusDays(7);
        stats.put("totalPausasSemana", registroBienestarRepository.countAllPausasAfter(semana));
        stats.put("totalPomodorosSemana", registroBienestarRepository.countAllByTipoAndFechaAfter("POMODORO", semana));
        stats.put("totalConexiones", conexionRepository.countAceptadas());
        stats.put("actividadesPorMateria", getActividadesPorMateria());
        stats.put("actividadesPorDia", getActividadesPorDia());

        return stats;
    }

    // ===== TOP USUARIOS =====
    public List<Map<String, Object>> getTopUsuarios(int limite) {
        List<Usuario> usuarios = usuarioRepository.findAll();
        return usuarios.stream()
                .map(u -> {
                    Map<String, Object> entry = new HashMap<>();
                    entry.put("id", u.getId());
                    entry.put("nombre", u.getNombre());
                    entry.put("correo", u.getCorreo());
                    entry.put("rol", u.getRol());
                    entry.put("carrera", u.getCarrera() != null ? u.getCarrera() : "");
                    entry.put("totalActividades", actividadRepository.findByUsuario(u).size());
                    long completadas = actividadRepository.findByUsuario(u).stream()
                            .filter(a -> "COMPLETADA".equals(a.getEstado()))
                            .count();
                    entry.put("completadas", completadas);
                    return entry;
                })
                .sorted((a, b) -> ((Integer) b.get("totalActividades")).compareTo((Integer) a.get("totalActividades")))
                .limit(limite)
                .collect(Collectors.toList());
    }

    // ===== ESTADÍSTICAS POR DÍA (ÚLTIMA SEMANA) =====
    public Map<String, Long> getActividadesPorDia() {
        Map<String, Long> resultado = new HashMap<>();
        LocalDate hoy = LocalDate.now();

        for (int i = 6; i >= 0; i--) {
            LocalDate fecha = hoy.minusDays(i);
            String dia = fecha.toString();
            long count = actividadRepository.findAll().stream()
                    .filter(a -> a.getFechaInicio() != null &&
                                a.getFechaInicio().equals(fecha))
                    .count();
            resultado.put(dia, count);
        }

        return resultado;
    }

    // ===== ESTADÍSTICAS POR MATERIA =====
    public Map<String, Long> getActividadesPorMateria() {
        return actividadRepository.findAll().stream()
                .filter(a -> a.getMateria() != null && !a.getMateria().isEmpty())
                .collect(Collectors.groupingBy(
                    Actividad::getMateria,
                    Collectors.counting()
                ));
    }

    /** Monitoreo de bienestar agregado para el panel admin. */
    public Map<String, Object> getMonitoreoBienestar() {
        Map<String, Object> out = new HashMap<>();
        LocalDateTime semana = LocalDateTime.now().minusDays(7);

        out.put("totalPomodorosSemana", registroBienestarRepository.countAllByTipoAndFechaAfter("POMODORO", semana));
        out.put("totalPausasSemana", registroBienestarRepository.countAllPausasAfter(semana));

        Map<String, Map<String, Object>> carreras = new LinkedHashMap<>();
        for (Usuario u : usuarioRepository.findEstudiantesActivos()) {
            String carrera = (u.getCarrera() != null && !u.getCarrera().isBlank()) ? u.getCarrera() : "Sin carrera";
            Map<String, Object> agg = carreras.computeIfAbsent(carrera, k -> {
                Map<String, Object> m = new HashMap<>();
                m.put("carrera", carrera);
                m.put("estudiantes", 0);
                m.put("estresTotal", 0);
                m.put("estresMax", 0);
                m.put("pomodoros", 0L);
                m.put("pausas", 0L);
                return m;
            });
            agg.put("estudiantes", (Integer) agg.get("estudiantes") + 1);

            Map<String, Object> estres = estresService.calcularEstres(u);
            int nivel = estres.get("nivel") != null ? ((Number) estres.get("nivel")).intValue() : 0;
            agg.put("estresTotal", (Integer) agg.get("estresTotal") + nivel);
            agg.put("estresMax", Math.max((Integer) agg.get("estresMax"), nivel));

            long pom = registroBienestarRepository.countByUsuarioAndTipoAndFechaAfter(u, "POMODORO", semana);
            long pausas = registroBienestarRepository.findByUsuarioOrderByFechaDesc(u).stream()
                    .filter(r -> r.getTipo() != null && r.getTipo().startsWith("PAUSA_"))
                    .filter(r -> r.getFecha() != null && r.getFecha().isAfter(semana))
                    .count();
            agg.put("pomodoros", (Long) agg.get("pomodoros") + pom);
            agg.put("pausas", (Long) agg.get("pausas") + pausas);
        }

        List<Map<String, Object>> cargaPorCarrera = carreras.values().stream()
                .peek(m -> {
                    int est = (Integer) m.get("estudiantes");
                    m.put("estresPromedio", est > 0 ? Math.round((Integer) m.get("estresTotal") / (double) est) : 0);
                    int max = (Integer) m.get("estresMax");
                    m.put("nivelAlerta", max >= 70 ? "ALTO" : max >= 40 ? "MEDIO" : "BAJO");
                    m.put("sugerencia", max >= 70
                            ? "Evitar programar exámenes masivos esta semana"
                            : max >= 40 ? "Monitorear carga académica" : "Carga estable");
                })
                .sorted((a, b) -> Integer.compare((Integer) b.get("estresMax"), (Integer) a.get("estresMax")))
                .collect(Collectors.toList());

        out.put("cargaPorCarrera", cargaPorCarrera);
        out.put("semanasCriticas", detectarSemanasCriticas());
        return out;
    }

    private List<Map<String, Object>> detectarSemanasCriticas() {
        LocalDate hoy = LocalDate.now();
        WeekFields wf = WeekFields.ISO;
        Map<String, Long> porSemana = new HashMap<>();

        for (Actividad a : actividadRepository.findAll()) {
            if (a.getFechaInicio() == null || "COMPLETADA".equals(a.getEstado())) continue;
            if (a.getFechaInicio().isBefore(hoy) || a.getFechaInicio().isAfter(hoy.plusWeeks(6))) continue;
            int sem = a.getFechaInicio().get(wf.weekOfWeekBasedYear());
            int anio = a.getFechaInicio().get(wf.weekBasedYear());
            String clave = anio + "-S" + sem;
            porSemana.merge(clave, 1L, Long::sum);
        }

        return porSemana.entrySet().stream()
                .filter(e -> e.getValue() >= 15)
                .sorted((a, b) -> Long.compare(b.getValue(), a.getValue()))
                .limit(5)
                .map(e -> {
                    Map<String, Object> m = new HashMap<>();
                    m.put("semana", e.getKey());
                    m.put("actividades", e.getValue());
                    m.put("alerta", e.getValue() >= 25 ? "Crítica" : "Alta");
                    return m;
                })
                .collect(Collectors.toList());
    }
}