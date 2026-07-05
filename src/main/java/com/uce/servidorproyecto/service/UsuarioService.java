package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class UsuarioService {

    @Autowired
    private UsuarioRepository usuarioRepository;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    public boolean correoValido(String correo) {
        return correo != null && correo.endsWith("@uce.edu.ec");
    }

    public boolean correoExiste(String correo) {
        return usuarioRepository.findByCorreo(correo).isPresent();
    }

    public Usuario registrar(Usuario usuario) {
        usuario.setContrasena(encoder.encode(usuario.getContrasena()));
        usuario.setFechaRegistro(LocalDateTime.now());
        usuario.setEstado("ACTIVO");
        usuario.setRol("ESTUDIANTE");
        usuario.setTema("dark");
        return usuarioRepository.save(usuario);
    }

    public Optional<Usuario> autenticar(String correo, String contrasenaPlana) {
        Optional<Usuario> usuarioOpt = usuarioRepository.findByCorreo(correo);
        if (usuarioOpt.isPresent()) {
            Usuario u = usuarioOpt.get();
            if ("ACTIVO".equals(u.getEstado()) && encoder.matches(contrasenaPlana, u.getContrasena())) {
                u.setUltimoAcceso(LocalDateTime.now());
                usuarioRepository.save(u);
                return Optional.of(u);
            }
        }
        return Optional.empty();
    }

    public void guardar(Usuario usuario) {
        usuarioRepository.save(usuario);
    }

    public boolean telefonoValido(String telefono) {
        return telefono != null && telefono.matches("\\d{10}");
    }

    public Optional<Usuario> buscarPorId(Long id) {
        return usuarioRepository.findById(id);
    }

    public Optional<Usuario> buscarPorCorreo(String correo) {
        return usuarioRepository.findByCorreo(correo);
    }

    /** Verifica correo + teléfono para recuperación. @return null si ok */
    public String verificarRecuperacion(String correo, String telefono) {
        if (correo == null || correo.isBlank()) {
            return "Ingresa tu correo institucional.";
        }
        if (telefono == null || !telefonoValido(telefono.trim())) {
            return "Ingresa tu teléfono registrado (10 dígitos).";
        }
        Optional<Usuario> u = usuarioRepository.findByCorreo(correo.trim());
        if (u.isEmpty()) {
            return "No encontramos una cuenta con ese correo.";
        }
        if ("ADMIN".equals(u.get().getRol())) {
            return "Los administradores deben contactar soporte interno para restablecer acceso.";
        }
        String telReg = u.get().getTelefono();
        if (telReg == null || !telReg.equals(telefono.trim())) {
            return "El teléfono no coincide con el registrado en tu perfil.";
        }
        return null;
    }

    public void restablecerContrasena(Long userId, String nuevaPlana) {
        Usuario u = usuarioRepository.findById(userId)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setContrasena(encoder.encode(nuevaPlana));
        usuarioRepository.save(u);
    }

    public Iterable<Usuario> listarTodos() {
        return usuarioRepository.findAll();
    }

    public void eliminar(Long id) {
        usuarioRepository.deleteById(id);
    }

    public void actualizarPerfil(Long id, String nombre, String carrera, String telefono,
                                 LocalDate fechaNacimiento, String genero) {
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setNombre(nombre);
        u.setCarrera(carrera);
        u.setTelefono(telefono);
        u.setFechaNacimiento(fechaNacimiento);
        u.setGenero(genero);
        usuarioRepository.save(u);
    }

    public void actualizarEmergencia(Long id, String nombre, String telefono, String relacion) {
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setNombreEmergencia(nombre);
        u.setTelefonoEmergencia(telefono);
        u.setRelacionEmergencia(relacion);
        usuarioRepository.save(u);
    }

    public void cambiarTema(Long id, String tema) {
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setTema(tema);
        usuarioRepository.save(u);
    }

    /** @return null si ok; mensaje de error si falla */
    public String cambiarContrasena(Long id, String actualPlana, String nuevaPlana) {
        if (nuevaPlana == null || nuevaPlana.length() < 4) {
            return "La nueva contraseña debe tener al menos 4 caracteres.";
        }
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        if (!encoder.matches(actualPlana, u.getContrasena())) {
            return "La contraseña actual es incorrecta.";
        }
        u.setContrasena(encoder.encode(nuevaPlana));
        usuarioRepository.save(u);
        return null;
    }

    public void desactivarCuenta(Long id) {
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setEstado("INACTIVO");
        usuarioRepository.save(u);
    }

    public void cambiarRol(Long id) {
        Usuario u = usuarioRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Usuario no encontrado"));
        u.setRol("ADMIN".equals(u.getRol()) ? "ESTUDIANTE" : "ADMIN");
        usuarioRepository.save(u);
    }

    public long contarUsuarios() {
        return usuarioRepository.count();
    }

    public long contarUsuariosActivos() {
        return usuarioRepository.countUsuariosActivos();
    }

    public long contarAdmins() {
        return usuarioRepository.countAdmins();
    }

    public long contarEstudiantes() {
        return usuarioRepository.countEstudiantes();
    }

    public void crearAdminSiNoExiste() {
        if (!usuarioRepository.findByCorreo("admin@uce.edu.ec").isPresent()) {
            Usuario admin = new Usuario();
            admin.setNombre("Administrador");
            admin.setCorreo("admin@uce.edu.ec");
            admin.setContrasena(encoder.encode("admin123"));
            admin.setRol("ADMIN");
            admin.setEstado("ACTIVO");
            admin.setFechaRegistro(LocalDateTime.now());
            usuarioRepository.save(admin);
        }
    }
}