package com.flowday.flowday.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.flowday.flowday.api.dto.SyncOperationRequest;
import com.flowday.flowday.api.dto.SyncRequest;
import com.flowday.flowday.model.Actividad;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.ActividadRepository;
import com.flowday.flowday.repository.RegistroBienestarRepository;
import com.flowday.flowday.repository.SyncOperationRepository;
import com.flowday.flowday.repository.UsuarioRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class SyncServiceTest {

    @Autowired private SyncService syncService;
    @Autowired private ObjectMapper mapper;
    @Autowired private UsuarioRepository usuarioRepository;
    @Autowired private ActividadRepository actividadRepository;
    @Autowired private RegistroBienestarRepository bienestarRepository;
    @Autowired private SyncOperationRepository syncOperationRepository;

    @Test
    void retryIsDeduplicatedAndAppendRunsExactlyOnce() {
        Usuario user = user("dedupe");
        UUID operationId = UUID.randomUUID();
        ObjectNode payload = mapper.createObjectNode().put("duracion", 25);
        SyncOperationRequest operation = new SyncOperationRequest(
                operationId, "wellbeing.pomodoro", null, payload, "local-pomodoro");

        var first = syncService.processOne(user, "phone-1", operation);
        var retry = syncService.processOne(user, "phone-1", operation);

        assertThat(first.status()).isEqualTo("APPLIED");
        assertThat(retry.status()).isEqualTo("DUPLICATE");
        assertThat(retry.data().toString()).isEqualTo(first.data().toString());
        assertThat(bienestarRepository.findByUsuarioOrderByFechaDesc(user)).hasSize(1);
        assertThat(syncOperationRepository.findByUsuarioIdAndDeviceIdAndOperationId(
                user.getId(), "phone-1", operationId)).isPresent();
    }

    @Test
    void updateRejectsEntityOwnedByAnotherUser() {
        Usuario owner = user("owner");
        Usuario attacker = user("attacker");
        Actividad activity = activity(owner, "Original");
        ObjectNode payload = fullActivityPayload(activity.getId(), "Hack");

        var result = syncService.processOne(attacker, "phone-2", new SyncOperationRequest(
                UUID.randomUUID(), "activity.update", activity.getVersion(), payload, null));

        assertThat(result.status()).isEqualTo("REJECTED");
        assertThat(actividadRepository.findById(activity.getId()).orElseThrow().getTitulo())
                .isEqualTo("Original");
    }

    @Test
    void staleExpectedVersionReturnsConflictBeforeMutation() {
        Usuario owner = user("conflict");
        Actividad activity = activity(owner, "Server title");
        ObjectNode payload = fullActivityPayload(activity.getId(), "Offline title");

        var result = syncService.processOne(owner, "phone-3", new SyncOperationRequest(
                UUID.randomUUID(), "activity.update", activity.getVersion() + 1, payload, null));

        assertThat(result.status()).isEqualTo("CONFLICT");
        assertThat(result.serverVersion()).isEqualTo(activity.getVersion());
        assertThat(result.data().get("titulo").asText()).isEqualTo("Server title");
        assertThat(actividadRepository.findById(activity.getId()).orElseThrow().getTitulo())
                .isEqualTo("Server title");
    }

    @Test
    void rejectedOperationDoesNotBlockFollowingBatchItem() {
        Usuario user = user("batch");
        SyncRequest request = new SyncRequest("phone-4", List.of(
                new SyncOperationRequest(UUID.randomUUID(), "unsupported.kind", null,
                        mapper.createObjectNode(), null),
                new SyncOperationRequest(UUID.randomUUID(), "profile.theme", null,
                        mapper.createObjectNode().put("tema", "light"), null)
        ));

        var response = syncService.process(user, request);

        assertThat(response.results()).extracting(r -> r.status())
                .containsExactly("REJECTED", "APPLIED");
        assertThat(usuarioRepository.findById(user.getId()).orElseThrow().getTema()).isEqualTo("light");
    }

    private Usuario user(String prefix) {
        Usuario user = new Usuario();
        user.setNombre(prefix);
        user.setCorreo(prefix + "-" + UUID.randomUUID() + "@example.test");
        user.setContrasena("encoded");
        return usuarioRepository.saveAndFlush(user);
    }

    private Actividad activity(Usuario owner, String title) {
        Actividad activity = new Actividad();
        activity.setUsuario(owner);
        activity.setTitulo(title);
        activity.setTipo("DEBER");
        activity.setFechaInicio(LocalDate.now().plusDays(1));
        activity.setDuracionMinutos(60);
        return actividadRepository.saveAndFlush(activity);
    }

    private ObjectNode fullActivityPayload(Long id, String title) {
        return mapper.createObjectNode()
                .put("id", id)
                .put("titulo", title)
                .put("tipo", "DEBER")
                .put("fechaInicio", LocalDate.now().plusDays(1).toString())
                .put("duracionMinutos", 60)
                .put("prioridad", "MEDIA")
                .put("estado", "PENDIENTE");
    }
}
