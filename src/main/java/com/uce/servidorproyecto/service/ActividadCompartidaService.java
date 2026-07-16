package com.uce.servidorproyecto.service;

import com.uce.servidorproyecto.model.Actividad;
import com.uce.servidorproyecto.model.Usuario;
import com.uce.servidorproyecto.model.UsuarioActividad;
import com.uce.servidorproyecto.repository.ConexionRepository;
import com.uce.servidorproyecto.repository.UsuarioActividadRepository;
import com.uce.servidorproyecto.repository.UsuarioRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class ActividadCompartidaService {

    @Autowired
    private UsuarioActividadRepository usuarioActividadRepository;

    @Autowired
    private UsuarioRepository usuarioRepository;

    @Autowired
    private ConexionRepository conexionRepository;

    @Autowired
    private NotificacionService notificacionService;

    @Transactional
    public void registrarPropietario(Actividad actividad, Usuario propietario) {
        if (actividad == null || actividad.getId() == null) {
            throw new IllegalStateException("La actividad debe estar guardada antes de registrar el propietario");
        }
        if (usuarioActividadRepository.findByActividadAndUsuario(actividad, propietario).isPresent()) {
            return;
        }
        UsuarioActividad ua = new UsuarioActividad();
        ua.setActividad(actividad);
        ua.setUsuario(propietario);
        ua.setEsPropietario(true);
        ua.setEstadoProgreso(actividad.getEstado() != null ? actividad.getEstado() : "PENDIENTE");
        usuarioActividadRepository.save(ua);
    }

    @Transactional
    public void vincularCompaneros(Actividad actividad, Usuario propietario, List<Long> companeroIds) {
        if (companeroIds == null || companeroIds.isEmpty()) return;

        for (Long companeroId : companeroIds) {
            if (companeroId == null || companeroId.equals(propietario.getId())) continue;

            Usuario companero = usuarioRepository.findById(companeroId).orElse(null);
            if (companero == null) continue;

            if (!conexionRepository.existenConectados(propietario, companero)) continue;

            if (usuarioActividadRepository.findByActividadAndUsuario(actividad, companero).isPresent()) {
                continue;
            }

            UsuarioActividad ua = new UsuarioActividad();
            ua.setActividad(actividad);
            ua.setUsuario(companero);
            ua.setEsPropietario(false);
            ua.setEstadoProgreso("PENDIENTE");
            usuarioActividadRepository.save(ua);

            notificacionService.crear(companero, "ACTIVIDAD",
                    "Actividad compartida contigo",
                    propietario.getNombre() + " te vinculó a: " + actividad.getTitulo(),
                    "/app/activities");
        }
    }

    @Transactional
    public void actualizarCompaneros(Actividad actividad, Usuario propietario, List<Long> companeroIds) {
        List<UsuarioActividad> actuales = usuarioActividadRepository.findByActividadAndActivoTrue(actividad);
        List<Long> nuevos = companeroIds != null ? companeroIds : List.of();

        for (UsuarioActividad ua : actuales) {
            if (ua.isEsPropietario()) continue;
            Long uid = ua.getUsuario().getId();
            if (!nuevos.contains(uid)) {
                ua.setActivo(false);
                usuarioActividadRepository.save(ua);
            }
        }

        vincularCompaneros(actividad, propietario, nuevos);
    }

    public List<Long> obtenerIdsCompanerosVinculados(Actividad actividad) {
        List<Long> ids = new ArrayList<>();
        for (Usuario u : usuarioActividadRepository.findCompanerosInvitados(actividad)) {
            ids.add(u.getId());
        }
        return ids;
    }
}
