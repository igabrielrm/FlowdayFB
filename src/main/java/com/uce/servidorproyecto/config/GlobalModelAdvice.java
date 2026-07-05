package com.uce.servidorproyecto.config;

import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.NotificacionService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.context.request.WebRequest;

@ControllerAdvice
public class GlobalModelAdvice {

    @Autowired
    private NotificacionService notificacionService;

    @Autowired
    private HttpServletRequest httpServletRequest;

    @ModelAttribute
    public void agregarNotificacionesGlobales(WebRequest request, org.springframework.ui.Model model) {
        Usuario usuario = (Usuario) request.getAttribute("usuarioLogueado", WebRequest.SCOPE_SESSION);
        if (usuario != null) {
            model.addAttribute("notificacionesNoLeidas",
                    notificacionService.contarNoLeidas(usuario));
            model.addAttribute("chatUserId", usuario.getId());
            String path = httpServletRequest.getRequestURI();
            if ("ADMIN".equals(usuario.getRol()) && path != null && !path.startsWith("/admin")) {
                model.addAttribute("adminVistaEstudiante", true);
            }
        }
    }

    @ModelAttribute("activeNav")
    public String activeNav() {
        String path = httpServletRequest.getRequestURI();
        if (path == null) return "";
        if (path.equals("/dashboard") || path.startsWith("/dashboard/")) return "inicio";
        if (path.startsWith("/actividades")) return "actividades";
        if (path.startsWith("/calendario")) return "calendario";
        if (path.startsWith("/horario")) return "horario";
        if (path.startsWith("/comunidad")) return "comunidad";
        if (path.startsWith("/perfil")) return "perfil";
        return "";
    }
}
