package com.uce.servidorproyecto.controller;

import com.uce.servidorproyecto.model.Anuncio;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.AnuncioRepository;
import com.uce.servidorproyecto.repository.UsuarioRepository;
import com.uce.servidorproyecto.service.AdminService;
import com.uce.servidorproyecto.service.NotificacionService;
import com.uce.servidorproyecto.service.UsuarioService;
import org.springframework.beans.factory.annotation.Autowired;  // ✅ IMPORTANTE
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import jakarta.servlet.http.HttpServletResponse;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Controller
@RequestMapping("/admin")
public class AdminController {

    // ===== INYECCIÓN DE DEPENDENCIAS =====
    @Autowired  // ✅ ¡ESTA ANOTACIÓN ES LA QUE FALTA!
    private UsuarioService usuarioService;

    @Autowired  // ✅ ¡ESTA ANOTACIÓN ES LA QUE FALTA!
    private UsuarioRepository usuarioRepository;

    @Autowired  // ✅ ¡ESTA ANOTACIÓN ES LA QUE FALTA!
    private AnuncioRepository anuncioRepository;

    @Autowired
    private AdminService adminService;

    @Autowired
    private NotificacionService notificacionService;

    // ===== DASHBOARD ADMIN =====
    @GetMapping("/dashboard")
    public String dashboard(WebRequest request, Model model) {
        Usuario usuario = (Usuario) request.getAttribute("usuarioLogueado", WebRequest.SCOPE_SESSION);
        if (usuario == null) return "redirect:/login";
        if (!"ADMIN".equals(usuario.getRol())) return "redirect:/dashboard";

        List<Usuario> usuarios = usuarioRepository.findAll();
        List<Anuncio> anuncios = anuncioRepository.findAllByOrderByFechaLimiteDesc();
        List<Anuncio> anunciosActivos = anuncios.stream().filter(a -> "ACTIVO".equals(a.getEstado())).toList();
        List<Anuncio> anunciosArchivados = anuncios.stream().filter(a -> "ARCHIVADO".equals(a.getEstado())).toList();
        Map<String, Object> estadisticas = adminService.getEstadisticasGenerales();

        model.addAttribute("adminNombre", usuario.getNombre());
        model.addAttribute("usuarios", usuarios);
        model.addAttribute("anuncios", anuncios);
        model.addAttribute("anunciosActivos", anunciosActivos);
        model.addAttribute("anunciosArchivados", anunciosArchivados);
        model.addAttribute("totalUsuarios", estadisticas.get("totalUsuarios"));
        model.addAttribute("totalAnuncios", estadisticas.get("totalAnuncios"));
        model.addAttribute("conteoAnunciosActivos", estadisticas.get("anunciosActivos"));
        model.addAttribute("totalActividades", estadisticas.get("totalActividades"));
        model.addAttribute("actividadesPendientes", estadisticas.get("actividadesPendientes"));
        model.addAttribute("actividadesCompletadas", estadisticas.get("actividadesCompletadas"));
        model.addAttribute("totalEstudiantes", estadisticas.get("totalEstudiantes"));
        model.addAttribute("totalAdmins", estadisticas.get("totalAdmins"));
        model.addAttribute("totalConexiones", estadisticas.get("totalConexiones"));
        model.addAttribute("actividadesPorMateria", estadisticas.get("actividadesPorMateria"));
        model.addAttribute("actividadesPorDia", estadisticas.get("actividadesPorDia"));
        model.addAttribute("promedioActividades", estadisticas.get("promedioActividadesPorUsuario"));

        Map<String, Object> bienestar = adminService.getMonitoreoBienestar();
        model.addAttribute("bienestarAdmin", bienestar);
        model.addAttribute("cargaPorCarrera", bienestar.get("cargaPorCarrera"));
        model.addAttribute("semanasCriticas", bienestar.get("semanasCriticas"));
        model.addAttribute("totalPomodorosSemana", bienestar.get("totalPomodorosSemana"));
        model.addAttribute("totalPausasSemana", bienestar.get("totalPausasSemana"));
        model.addAttribute("topUsuarios", adminService.getTopUsuarios(8));

        return "admin-dashboard";
    }

    // ===== PUBLICAR ANUNCIO =====
    @PostMapping("/anuncio")
    public String publicarAnuncio(@RequestParam String titulo,
                                  @RequestParam String descripcion,
                                  @RequestParam String fechaLimite,
                                  WebRequest request,
                                  RedirectAttributes ra) {
        Usuario admin = (Usuario) request.getAttribute("usuarioLogueado", WebRequest.SCOPE_SESSION);
        if (admin == null) return "redirect:/login";

        Anuncio anuncio = new Anuncio();
        anuncio.setTitulo(titulo);
        anuncio.setDescripcion(descripcion);
        anuncio.setFechaLimite(LocalDate.parse(fechaLimite));
        anuncio.setCreador(admin);

        Anuncio guardado = anuncioRepository.save(anuncio);
        notificacionService.notificarAnuncioGlobal(guardado);
        ra.addFlashAttribute("exito", "✅ Anuncio publicado y notificado a los estudiantes");
        return "redirect:/admin/dashboard";
    }

    // ===== CAMBIAR ROL =====
    @GetMapping("/usuarios/cambiar-rol/{id}")
    public String cambiarRol(@PathVariable Long id, RedirectAttributes ra) {
        Usuario usuario = usuarioRepository.findById(id).orElse(null);
        if (usuario != null) {
            if ("ADMIN".equals(usuario.getRol())) {
                usuario.setRol("ESTUDIANTE");
                ra.addFlashAttribute("exito", "🔽 Usuario cambiado a ESTUDIANTE");
            } else {
                usuario.setRol("ADMIN");
                ra.addFlashAttribute("exito", "🔼 Usuario ascendido a ADMIN");
            }
            usuarioRepository.save(usuario);
        }
        return "redirect:/admin/dashboard";
    }

    // ===== ELIMINAR USUARIO =====
    @GetMapping("/usuarios/eliminar/{id}")
    public String eliminarUsuario(@PathVariable Long id, RedirectAttributes ra) {
        usuarioRepository.deleteById(id);
        ra.addFlashAttribute("exito", "🗑️ Usuario eliminado correctamente");
        return "redirect:/admin/dashboard";
    }

    // ===== DESARCHIVAR ANUNCIO =====
    @GetMapping("/anuncio/desarchivar/{id}")
    public String desarchivarAnuncio(@PathVariable Long id, RedirectAttributes ra) {
        Anuncio anuncio = anuncioRepository.findById(id).orElse(null);
        if (anuncio != null) {
            anuncio.setEstado("ACTIVO");
            anuncioRepository.save(anuncio);
            ra.addFlashAttribute("exito", "Anuncio restaurado");
        }
        return "redirect:/admin/dashboard";
    }

    // ===== ELIMINAR ANUNCIO =====
    @GetMapping("/anuncio/eliminar/{id}")
    public String eliminarAnuncio(@PathVariable Long id, RedirectAttributes ra) {
        anuncioRepository.deleteById(id);
        ra.addFlashAttribute("exito", "🗑️ Anuncio eliminado");
        return "redirect:/admin/dashboard";
    }

    // ===== ARCHIVAR ANUNCIO =====
    @GetMapping("/anuncio/archivar/{id}")
    public String archivarAnuncio(@PathVariable Long id, RedirectAttributes ra) {
        Anuncio anuncio = anuncioRepository.findById(id).orElse(null);
        if (anuncio != null) {
            anuncio.setEstado("ARCHIVADO");
            anuncioRepository.save(anuncio);
            ra.addFlashAttribute("exito", "📦 Anuncio archivado");
        }
        return "redirect:/admin/dashboard";
    }

    // ===== API: ESTADÍSTICAS (JSON) =====
    @GetMapping("/estadisticas")
    @ResponseBody
    public Map<String, Object> getEstadisticas() {
        return adminService.getEstadisticasGenerales();
    }

    // ===== API: TOP USUARIOS =====
    @GetMapping("/top-usuarios")
    @ResponseBody
    public List<Map<String, Object>> getTopUsuarios(@RequestParam(defaultValue = "5") int limite) {
        return adminService.getTopUsuarios(limite);
    }

    @GetMapping("/export/usuarios.csv")
    public void exportarUsuariosCsv(HttpServletResponse response) throws Exception {
        response.setContentType("text/csv; charset=UTF-8");
        response.setHeader("Content-Disposition", "attachment; filename=productividad-usuarios.csv");
        response.setCharacterEncoding("UTF-8");
        PrintWriter w = response.getWriter();
        w.write('\ufeff');
        w.println("Nombre,Correo,Rol,Carrera,Total actividades,Completadas");
        for (Map<String, Object> u : adminService.getTopUsuarios(500)) {
            w.printf("\"%s\",\"%s\",\"%s\",\"%s\",%s,%s%n",
                    escCsv(String.valueOf(u.get("nombre"))),
                    escCsv(String.valueOf(u.get("correo"))),
                    escCsv(String.valueOf(u.get("rol"))),
                    escCsv(String.valueOf(u.getOrDefault("carrera", ""))),
                    u.get("totalActividades"),
                    u.get("completadas"));
        }
        w.flush();
    }

    private String escCsv(String s) {
        return s == null ? "" : s.replace("\"", "\"\"");
    }
}