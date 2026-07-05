package com.uce.servidorproyecto.controller;

import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.service.UsuarioService;
import jakarta.servlet.http.HttpSession;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.time.LocalDate;
import java.util.Optional;

@Controller
public class AuthController {

    @Autowired
    private UsuarioService usuarioService;

    @GetMapping("/")
    public String raiz() {
        return "redirect:/login";
    }

    @GetMapping("/login")
    public String login(@RequestParam(required = false) Boolean admin, Model model) {
        model.addAttribute("modoAdmin", Boolean.TRUE.equals(admin));
        return "login";
    }

    @PostMapping("/login")
    public String procesarLogin(@RequestParam String correo,
                                @RequestParam String contrasena,
                                @RequestParam(required = false) String modoAdmin,
                                HttpSession session,
                                Model model) {
        Optional<Usuario> usuarioOpt = usuarioService.autenticar(correo, contrasena);
        boolean accesoAdmin = "true".equalsIgnoreCase(modoAdmin);

        if (usuarioOpt.isPresent()) {
            Usuario usuario = usuarioOpt.get();
            boolean esAdmin = "ADMIN".equals(usuario.getRol());

            if (accesoAdmin && !esAdmin) {
                model.addAttribute("error", "Esta cuenta no tiene permisos de administrador.");
                model.addAttribute("modoAdmin", true);
                return "login";
            }
            if (!accesoAdmin && esAdmin) {
                model.addAttribute("error", "Los administradores deben ingresar por «Acceso administrativo».");
                model.addAttribute("modoAdmin", false);
                return "login";
            }

            session.setAttribute("usuarioLogueado", usuario);
            return esAdmin ? "redirect:/admin/dashboard" : "redirect:/dashboard";
        }

        model.addAttribute("error", "Correo o contraseña incorrectos");
        model.addAttribute("modoAdmin", accesoAdmin);
        return "login";
    }

    @GetMapping("/recuperar-contrasena")
    public String recuperarContrasenaForm() {
        return "recuperar-contrasena";
    }

    @PostMapping("/recuperar-contrasena")
    public String recuperarContrasenaVerificar(@RequestParam String correo,
                                               @RequestParam String telefono,
                                               HttpSession session,
                                               RedirectAttributes ra) {
        String error = usuarioService.verificarRecuperacion(correo, telefono);
        if (error != null) {
            ra.addFlashAttribute("error", error);
            return "redirect:/recuperar-contrasena";
        }
        Optional<Usuario> u = usuarioService.buscarPorCorreo(correo);
        if (u.isPresent()) {
            session.setAttribute("resetUserId", u.get().getId());
        }
        return "redirect:/recuperar-contrasena/nueva";
    }

    @GetMapping("/recuperar-contrasena/nueva")
    public String recuperarContrasenaNueva(HttpSession session, RedirectAttributes ra) {
        if (session.getAttribute("resetUserId") == null) {
            ra.addFlashAttribute("error", "Sesión de recuperación expirada. Intenta de nuevo.");
            return "redirect:/recuperar-contrasena";
        }
        return "recuperar-contrasena-nueva";
    }

    @PostMapping("/recuperar-contrasena/nueva")
    public String recuperarContrasenaRestablecer(@RequestParam String contrasenaNueva,
                                                 @RequestParam String contrasenaConfirmacion,
                                                 HttpSession session,
                                                 RedirectAttributes ra) {
        Long userId = (Long) session.getAttribute("resetUserId");
        if (userId == null) {
            ra.addFlashAttribute("error", "Sesión de recuperación expirada.");
            return "redirect:/recuperar-contrasena";
        }
        if (!contrasenaNueva.equals(contrasenaConfirmacion)) {
            ra.addFlashAttribute("error", "Las contraseñas no coinciden.");
            return "redirect:/recuperar-contrasena/nueva";
        }
        if (contrasenaNueva.length() < 4) {
            ra.addFlashAttribute("error", "La contraseña debe tener al menos 4 caracteres.");
            return "redirect:/recuperar-contrasena/nueva";
        }
        usuarioService.restablecerContrasena(userId, contrasenaNueva);
        session.removeAttribute("resetUserId");
        ra.addFlashAttribute("exito", "Contraseña actualizada. Ya puedes iniciar sesión.");
        return "redirect:/login";
    }

    // ===== REGISTRO =====
    @GetMapping("/registro")
    public String registro(Model model) {
        model.addAttribute("usuario", new Usuario());
        return "registro-paso1";
    }

    @PostMapping("/registro/paso1")
    public String procesarPaso1(@RequestParam String nombre,
                                @RequestParam String correo,
                                @RequestParam String contrasena,
                                HttpSession session,
                                Model model) {
        if (!usuarioService.correoValido(correo)) {
            model.addAttribute("error", "Solo se permiten correos institucionales @uce.edu.ec");
            model.addAttribute("usuario", new Usuario());
            return "registro-paso1";
        }
        if (usuarioService.correoExiste(correo)) {
            model.addAttribute("error", "Este correo ya está registrado");
            model.addAttribute("usuario", new Usuario());
            return "registro-paso1";
        }

        Usuario temporal = new Usuario();
        temporal.setNombre(nombre);
        temporal.setCorreo(correo);
        temporal.setContrasena(contrasena);
        session.setAttribute("registroTemporal", temporal);

        return "redirect:/registro/paso2";
    }

    @GetMapping("/registro/paso2")
    public String registroPaso2(HttpSession session, Model model) {
        if (session.getAttribute("registroTemporal") == null) {
            return "redirect:/registro";
        }
        return "registro-paso2";
    }

    @PostMapping("/registro/paso2")
    public String procesarPaso2(@RequestParam String carrera,
                                @RequestParam String telefono,
                                @RequestParam String fechaNacimiento,
                                @RequestParam String genero,
                                HttpSession session,
                                RedirectAttributes ra) {
        Usuario temporal = (Usuario) session.getAttribute("registroTemporal");
        if (temporal == null) return "redirect:/registro";

        if (telefono == null || telefono.isBlank()) {
            ra.addFlashAttribute("error", "El teléfono celular es obligatorio.");
            return "redirect:/registro/paso2";
        }
        if (!usuarioService.telefonoValido(telefono.trim())) {
            ra.addFlashAttribute("error", "El teléfono debe tener exactamente 10 dígitos numéricos (ej: 0991234567).");
            return "redirect:/registro/paso2";
        }

        temporal.setCarrera(carrera);
        temporal.setTelefono(telefono.trim());
        if (!fechaNacimiento.isEmpty()) {
            temporal.setFechaNacimiento(LocalDate.parse(fechaNacimiento));
        }
        temporal.setGenero(genero);
        session.setAttribute("registroTemporal", temporal);

        return "redirect:/registro/paso3";
    }

    @GetMapping("/registro/paso3")
    public String registroPaso3(HttpSession session) {
        if (session.getAttribute("registroTemporal") == null) {
            return "redirect:/registro";
        }
        return "registro-paso3";
    }

    @PostMapping("/registro/paso3")
    public String procesarPaso3(@RequestParam String nombreEmergencia,
                                @RequestParam String telefonoEmergencia,
                                @RequestParam String relacionEmergencia,
                                HttpSession session,
                                RedirectAttributes ra) {
        Usuario temporal = (Usuario) session.getAttribute("registroTemporal");
        if (temporal == null) return "redirect:/registro";

        temporal.setNombreEmergencia(nombreEmergencia);
        temporal.setTelefonoEmergencia(telefonoEmergencia);
        temporal.setRelacionEmergencia(relacionEmergencia);

        usuarioService.registrar(temporal);
        session.removeAttribute("registroTemporal");

        ra.addFlashAttribute("exito", "✅ Cuenta creada exitosamente");
        return "redirect:/login?registrado=true";
    }

    @GetMapping("/logout")
    public String logout(HttpSession session) {
        session.invalidate();
        return "redirect:/login";
    }
}