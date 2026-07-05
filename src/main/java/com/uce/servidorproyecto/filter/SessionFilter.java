package com.uce.servidorproyecto.filter;

import com.uce.servidorproyecto.model.Usuario;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.LocalDateTime;

@Component
public class SessionFilter extends OncePerRequestFilter {

    private static final String USUARIO_LOGEADO_ATTRIBUTE = "usuarioLogueado";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Excluir rutas públicas
        if (path.startsWith("/login") || path.startsWith("/registro") ||
            path.startsWith("/recuperar-contrasena") ||
            path.startsWith("/css") || path.startsWith("/js") ||
            path.startsWith("/images") || path.startsWith("/icons") ||
            path.startsWith("/uploads") || path.equals("/sw.js") ||
            path.startsWith("/manifest") ||
            path.startsWith("/webjars") ||
            path.startsWith("/error")) {
            filterChain.doFilter(request, response);
            return;
        }

        // Verificar sesión
        HttpSession session = request.getSession(false);
        if (session != null) {
            Usuario usuario = (Usuario) session.getAttribute(USUARIO_LOGEADO_ATTRIBUTE);
            if (usuario != null) {
                // Actualizar último acceso cada 5 minutos
                if (usuario.getUltimoAcceso() == null ||
                    usuario.getUltimoAcceso().isBefore(LocalDateTime.now().minusMinutes(5))) {
                    usuario.setUltimoAcceso(LocalDateTime.now());
                }
                filterChain.doFilter(request, response);
                return;
            }
        }

        // Si no hay sesión, redirigir a login
        response.sendRedirect("/login");
    }
}