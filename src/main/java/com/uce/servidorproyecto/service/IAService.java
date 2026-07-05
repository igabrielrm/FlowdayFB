package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class IAService {

    @Autowired
    private IAProviderService iaProvider;

    // ===== OPTIMIZAR HORARIO CON IA (CLAUDE) =====
    public Map<String, Object> optimizarHorario(List<Actividad> actividades, Usuario usuario) {
        Map<String, Object> resultado = new LinkedHashMap<>();

        // Calcular métricas comunes
        int totalActividades = actividades.size();
        int totalMinutos = actividades.stream()
                .filter(a -> a.getDuracionMinutos() != null)
                .mapToInt(Actividad::getDuracionMinutos)
                .sum();
        String horas = totalMinutos / 60 + "h " + totalMinutos % 60 + "min";

        // 1. Construir prompt detallado
        StringBuilder prompt = new StringBuilder(
            "Eres un asistente académico experto en productividad. Organiza estas tareas en un horario óptimo para hoy, considerando prioridad (ALTA > MEDIA > BAJA) y duración. Devuelve SOLO una lista con hora de inicio, título y prioridad.\n\n"
        );
        for (Actividad a : actividades) {
            prompt.append("- ").append(a.getTitulo())
                  .append(" (").append(a.getDuracionMinutos()).append(" min, prioridad ").append(a.getPrioridad()).append(")\n");
        }
        prompt.append("\nFormato de ejemplo:\n8:00 - Proyecto Final (ALTA)\n10:00 - Tarea Redes (MEDIA)");

        try {
            // 2. Llamar a Claude
            String respuesta = iaProvider.consultar(prompt.toString());

            // 3. Guardar respuesta
            resultado.put("usuario", usuario.getNombre());
            resultado.put("fecha", LocalDate.now().toString());
            resultado.put("totalActividades", totalActividades);
            resultado.put("totalMinutos", totalMinutos);
            resultado.put("horas", horas);

            // 4. Parsear respuesta de Claude a lista de mapas
            List<Map<String, String>> plan = parsearRespuestaClaude(respuesta);
            if (plan.isEmpty()) {
                plan = generarPlanFallback(actividades);
            }
            resultado.put("planOptimizado", plan);
            resultado.put("recomendacion", "✅ Plan generado con IA basado en tus prioridades.");

        } catch (Exception e) {
            // Fallback al orden tradicional
            resultado.put("error", "Falló la IA, usando orden tradicional.");
            resultado.put("usuario", usuario.getNombre());
            resultado.put("fecha", LocalDate.now().toString());
            resultado.put("totalActividades", totalActividades);
            resultado.put("totalMinutos", totalMinutos);
            resultado.put("horas", horas);
            resultado.put("recomendacion", "⚠️ Usando ordenamiento tradicional por prioridad.");
            resultado.put("planOptimizado", generarPlanFallback(actividades));
        }
        return resultado;
    }

    // ===== MÉTODOS AUXILIARES =====

    // Método auxiliar para parsear respuesta de Claude
    private List<Map<String, String>> parsearRespuestaClaude(String respuesta) {
        List<Map<String, String>> plan = new ArrayList<>();
        String[] lineas = respuesta.split("\n");
        for (String linea : lineas) {
            if (linea.trim().isEmpty()) continue;
            // Formato esperado: "8:00 - Proyecto Final (ALTA)"
            String[] partes = linea.split(" - ");
            if (partes.length == 2) {
                Map<String, String> item = new LinkedHashMap<>();
                item.put("hora", partes[0].trim());
                String resto = partes[1].trim();
                if (resto.contains("(") && resto.contains(")")) {
                    int idx1 = resto.indexOf("(");
                    int idx2 = resto.indexOf(")");
                    String prioridad = resto.substring(idx1 + 1, idx2);
                    String titulo = resto.substring(0, idx1).trim();
                    item.put("titulo", titulo);
                    item.put("prioridad", prioridad);
                } else {
                    item.put("titulo", resto);
                    item.put("prioridad", "MEDIA");
                }
                plan.add(item);
            }
        }
        return plan;
    }

    // Método auxiliar para generar plan de fallback
    private List<Map<String, String>> generarPlanFallback(List<Actividad> actividades) {
        List<Actividad> ordenadas = actividades.stream()
                .sorted((a, b) -> {
                    int pa = prioridadValor(a.getPrioridad());
                    int pb = prioridadValor(b.getPrioridad());
                    return Integer.compare(pb, pa); // descendente
                })
                .collect(Collectors.toList());

        List<Map<String, String>> plan = new ArrayList<>();
        LocalTime hora = LocalTime.of(8, 0);
        for (Actividad a : ordenadas) {
            Map<String, String> item = new LinkedHashMap<>();
            item.put("hora", hora.toString());
            item.put("titulo", a.getTitulo());
            item.put("prioridad", a.getPrioridad());
            if (a.getDuracionMinutos() != null) {
                item.put("duracion", a.getDuracionMinutos() + " min");
                hora = hora.plusMinutes(a.getDuracionMinutos() + 5);
            }
            plan.add(item);
        }
        return plan;
    }

    private int prioridadValor(String prioridad) {
        if ("ALTA".equals(prioridad)) return 3;
        if ("MEDIA".equals(prioridad)) return 2;
        return 1; // BAJA
    }

    // ===== APLICAR OPTIMIZACIÓN =====
    public void aplicarOptimizacion(List<Actividad> actividades, Map<String, Object> plan) {
        // Reservado: persistir el plan optimizado en actividades si se requiere en el futuro
    }

    // ===== GENERAR RECURSOS DE ESTUDIO =====
    public Map<String, Object> generarRecursosEstudio(String tema, String tipo) {
        Map<String, Object> recursos = new LinkedHashMap<>();
        recursos.put("tema", tema);
        recursos.put("tipo", tipo != null ? tipo : "general");

        List<Map<String, String>> items = new ArrayList<>();
        switch (tema.toLowerCase()) {
            case "matemáticas":
            case "matematicas":
                items.add(Map.of("titulo", "📚 Guía de Álgebra Lineal", "url", "https://www.khanacademy.org/math/algebra"));
                items.add(Map.of("titulo", "🎥 Video: Derivadas e Integrales", "url", "https://www.youtube.com/playlist?list=PL..."));
                items.add(Map.of("titulo", "📝 Ejercicios prácticos de cálculo", "url", "#"));
                items.add(Map.of("titulo", "📱 App: Wolfram Alpha para resolver problemas", "url", "https://www.wolframalpha.com/"));
                break;
            case "programación":
            case "programacion":
                items.add(Map.of("titulo", "📚 Guía de Java para principiantes", "url", "https://www.w3schools.com/java/"));
                items.add(Map.of("titulo", "🎥 Curso completo de Spring Boot", "url", "https://www.youtube.com/playlist?list=PL..."));
                items.add(Map.of("titulo", "💻 Ejercicios de práctica en LeetCode", "url", "https://leetcode.com/"));
                items.add(Map.of("titulo", "🤝 Grupo de estudio de programación", "url", "#"));
                break;
            case "física":
            case "fisica":
                items.add(Map.of("titulo", "📚 Física para universitarios", "url", "#"));
                items.add(Map.of("titulo", "🎥 Demostraciones de física", "url", "https://www.youtube.com/results?search_query=fisica"));
                items.add(Map.of("titulo", "📝 Problemas resueltos de mecánica", "url", "#"));
                break;
            case "motivación":
            case "motivacion":
                items.add(Map.of("titulo", "🔥 5 tips para mantener la motivación", "url", "#"));
                items.add(Map.of("titulo", "🧘 Meditación guiada para estudiantes", "url", "https://www.youtube.com/results?search_query=meditacion+estudiantes"));
                items.add(Map.of("titulo", "📚 Cómo estudiar de manera efectiva", "url", "#"));
                break;
            case "inglés":
            case "ingles":
                items.add(Map.of("titulo", "📚 Gramática básica de inglés", "url", "https://www.duolingo.com/"));
                items.add(Map.of("titulo", "🎥 Videos para aprender inglés", "url", "https://www.youtube.com/results?search_query=aprender+ingles"));
                items.add(Map.of("titulo", "📝 Ejercicios de vocabulario", "url", "#"));
                break;
            default:
                items.add(Map.of("titulo", "📚 Recursos generales de estudio", "url", "#"));
                items.add(Map.of("titulo", "🎥 Videos educativos recomendados", "url", "https://www.youtube.com/edu"));
                items.add(Map.of("titulo", "📝 Técnicas de estudio efectivas", "url", "#"));
                items.add(Map.of("titulo", "🧠 Ejercicios para mejorar la concentración", "url", "#"));
        }
        recursos.put("recursos", items);
        recursos.put("mensaje", "📌 Recursos recomendados para el tema: " + tema);
        return recursos;
    }

    // ===== SUGERIR PAUSA ACTIVA =====
    public Map<String, String> sugerirPausaActiva() {
        Map<String, String> pausas = new LinkedHashMap<>();
        String[] tipos = {"respiración", "estiramientos", "meditación", "ejercicio", "música"};
        String[] descripciones = {
            "🌬️ Respiración profunda: Inhala 4s, mantén 4s, exhala 4s. Repite 4 veces.",
            "🤸 Estiramientos: Gira el cuello, estira brazos y espalda por 5 minutos.",
            "🧘 Meditación: Cierra los ojos, enfócate en tu respiración por 5 minutos.",
            "🏃 Ejercicio: Haz 10 sentadillas o camina 5 minutos.",
            "🎵 Música: Escucha tu canción favorita y relájate."
        };
        int idx = new Random().nextInt(tipos.length);
        pausas.put("tipo", tipos[idx]);
        pausas.put("descripcion", descripciones[idx]);
        pausas.put("duracion", "5 minutos");
        return pausas;
    }

    // ===== DETECTAR BLOQUEO CREATIVO =====
    public Map<String, Object> detectarBloqueo(List<Actividad> actividadesRecientes) {
        Map<String, Object> resultado = new LinkedHashMap<>();

        long completadas = actividadesRecientes.stream()
                .filter(a -> "COMPLETADA".equals(a.getEstado()))
                .count();

        if (completadas < 3) {
            resultado.put("bloqueo", true);
            resultado.put("nivel", "ALTO");
            resultado.put("mensaje", "🧠 Has completado pocas actividades. ¿Necesitas ayuda?");
            resultado.put("sugerencia", "Prueba el modo auxilio de estudio para obtener recursos y motivación.");
            resultado.put("recursos", generarRecursosEstudio("motivacion", "general"));
        } else if (completadas < 6) {
            resultado.put("bloqueo", true);
            resultado.put("nivel", "MEDIO");
            resultado.put("mensaje", "📚 Vas bien, pero podrías avanzar más. ¡Tú puedes!");
            resultado.put("sugerencia", "Revisa tus tareas prioritarias y usa el método Pomodoro.");
        } else {
            resultado.put("bloqueo", false);
            resultado.put("nivel", "BAJO");
            resultado.put("mensaje", "🔥 ¡Excelente ritmo! Sigue así.");
        }
        return resultado;
    }

    // ===== CHAT COMPAÑERO VIRTUAL =====
    public Map<String, Object> chatCompanero(String mensaje, Usuario usuario) {
        Map<String, Object> resultado = new LinkedHashMap<>();
        String nombre = usuario.getNombre() != null ? usuario.getNombre() : "estudiante";
        String carrera = usuario.getCarrera() != null ? usuario.getCarrera() : "universidad";

        String prompt = """
            Eres un compañero virtual académico amigable para estudiantes de la Universidad Central del Ecuador (UCE).
            Responde en español, con tono cercano y motivador. Máximo 3 párrafos cortos.
            Estudiante: %s (%s).
            Pregunta: %s
            """.formatted(nombre, carrera, mensaje);

        try {
            String respuesta = iaProvider.consultar(prompt);
            resultado.put("ok", true);
            resultado.put("respuesta", respuesta.trim());
            resultado.put("ia", true);
        } catch (Exception e) {
            resultado.put("ok", true);
            resultado.put("respuesta", respuestaChatFallback(mensaje));
            resultado.put("ia", false);
            resultado.put("fallback", true);
        }
        return resultado;
    }

    // ===== RECURSOS EDUCATIVOS PARA ACTIVIDAD =====
    public Map<String, Object> recursosParaActividad(Actividad actividad) {
        Map<String, Object> resultado = new LinkedHashMap<>();
        String tema = actividad.getMateria() != null && !actividad.getMateria().isBlank()
                ? actividad.getMateria()
                : actividad.getTitulo();
        String desc = actividad.getDescripcion() != null ? actividad.getDescripcion() : "";
        String tipo = actividad.getTipo() != null ? actividad.getTipo() : "general";

        String prompt = """
            Recomienda exactamente 4 recursos educativos en línea para ayudar a un estudiante universitario con esta tarea.
            Tema/materia: %s
            Título: %s
            Tipo: %s
            Descripción: %s

            Responde SOLO con un JSON array válido, sin markdown, con este formato:
            [{"titulo":"nombre del recurso","url":"https://..."}]
            Usa URLs reales de sitios educativos conocidos (Khan Academy, YouTube, Coursera, documentación oficial, etc.).
            """.formatted(tema, actividad.getTitulo(), tipo, desc);

        try {
            String respuesta = iaProvider.consultar(prompt);
            List<Map<String, String>> recursos = parsearRecursosJson(respuesta);
            if (recursos.isEmpty()) {
                recursos = recursosFallbackActividad(tema, tipo);
                resultado.put("ia", false);
            } else {
                resultado.put("ia", true);
            }
            resultado.put("ok", true);
            resultado.put("tema", tema);
            resultado.put("recursos", recursos);
            resultado.put("mensaje", "Recursos recomendados para: " + tema);
        } catch (Exception e) {
            resultado.put("ok", true);
            resultado.put("tema", tema);
            resultado.put("recursos", recursosFallbackActividad(tema, tipo));
            resultado.put("mensaje", "Recursos sugeridos (modo offline)");
            resultado.put("ia", false);
            resultado.put("fallback", true);
        }
        return resultado;
    }

    private String respuestaChatFallback(String mensaje) {
        String lower = mensaje.toLowerCase();
        if (lower.contains("estrés") || lower.contains("estres") || lower.contains("ansiedad")) {
            return "Entiendo que te sientes cargado. Prueba una pausa de 5 minutos: respira profundo, estira y vuelve con una sola tarea pequeña. ¡Un paso a la vez!";
        }
        if (lower.contains("motiv") || lower.contains("cansad")) {
            return "Es normal sentirse así. Divide tu meta en bloques de 25 minutos (Pomodoro) y celebra cada avance. Tú puedes con esto 💪";
        }
        if (lower.contains("estudi") || lower.contains("examen")) {
            return "Para estudiar mejor: repasa lo más difícil primero, haz un resumen corto y practica con ejercicios. ¿Quieres que te sugiera recursos para alguna materia?";
        }
        return "¡Hola! Soy tu compañero virtual. Puedo ayudarte con consejos de estudio, organización y bienestar académico. ¿En qué te ayudo hoy?";
    }

    private List<Map<String, String>> parsearRecursosJson(String respuesta) {
        List<Map<String, String>> items = new ArrayList<>();
        if (respuesta == null || respuesta.isBlank()) return items;

        String json = respuesta.trim();
        int start = json.indexOf('[');
        int end = json.lastIndexOf(']');
        if (start >= 0 && end > start) {
            json = json.substring(start, end + 1);
        }

        try {
            com.fasterxml.jackson.databind.JsonNode arr =
                    new com.fasterxml.jackson.databind.ObjectMapper().readTree(json);
            if (!arr.isArray()) return items;
            for (com.fasterxml.jackson.databind.JsonNode node : arr) {
                String titulo = node.path("titulo").asText("").trim();
                String url = node.path("url").asText("").trim();
                if (!titulo.isEmpty()) {
                    Map<String, String> item = new LinkedHashMap<>();
                    item.put("titulo", titulo);
                    item.put("url", url.isEmpty() ? "#" : url);
                    items.add(item);
                }
            }
        } catch (Exception ignored) {
            // fallback vacío
        }
        return items;
    }

    private List<Map<String, String>> recursosFallbackActividad(String tema, String tipo) {
        String clave = tema.toLowerCase();
        if (clave.contains("program") || clave.contains("java") || clave.contains("software")) {
            return (List<Map<String, String>>) generarRecursosEstudio("programacion", tipo).get("recursos");
        }
        if (clave.contains("mat") || clave.contains("calculo") || clave.contains("cálculo")) {
            return (List<Map<String, String>>) generarRecursosEstudio("matematicas", tipo).get("recursos");
        }
        if (clave.contains("fis") || clave.contains("fís")) {
            return (List<Map<String, String>>) generarRecursosEstudio("fisica", tipo).get("recursos");
        }
        if (clave.contains("ingl")) {
            return (List<Map<String, String>>) generarRecursosEstudio("ingles", tipo).get("recursos");
        }
        return (List<Map<String, String>>) generarRecursosEstudio(tema, tipo).get("recursos");
    }
}