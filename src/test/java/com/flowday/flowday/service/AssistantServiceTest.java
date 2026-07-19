package com.flowday.flowday.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flowday.flowday.api.dto.AssistantHistoryMessage;
import com.flowday.flowday.api.dto.AssistantMessageRequest;
import com.flowday.flowday.api.dto.AssistantMessageResponse;
import com.flowday.flowday.dto.ConflictoEvento;
import com.flowday.flowday.model.Actividad;
import com.flowday.flowday.model.AssistantAction;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.AssistantActionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AssistantServiceTest {

    @Mock ActividadService actividadService;
    @Mock ActividadCompartidaService actividadCompartidaService;
    @Mock HorarioService horarioService;
    @Mock IAProviderService iaProviderService;
    @Mock ConflictDetectionService conflictDetectionService;
    @Mock AssistantActionRepository actionRepository;

    private AssistantService service;
    private Usuario user;

    @BeforeEach
    void setUp() {
        service = new AssistantService(actividadService, actividadCompartidaService, horarioService,
                iaProviderService, conflictDetectionService, actionRepository, new ObjectMapper());
        user = new Usuario();
        user.setId(7L);
        user.setNombre("Ana");
    }

    @Test
    void answersTodayFromRealContextWithoutCallingModel() {
        when(horarioService.listarPorUsuario(user)).thenReturn(List.of());
        Actividad activity = activity(15L, "Examen de Redes", LocalDate.now(), LocalTime.of(10, 0));
        when(actividadService.listarPorUsuario(user)).thenReturn(List.of(activity));

        AssistantMessageResponse response = service.message(user,
                new AssistantMessageRequest("¿Qué tengo hoy?", List.of(), null));

        assertThat(response.respuesta()).contains("Examen de Redes", "10:00");
        assertThat(response.proposal()).isNull();
        assertThat(response.ia()).isFalse();
        verifyNoInteractions(iaProviderService);
    }

    @Test
    void persistsDeterministicCreateProposalWithoutUserId() {
        when(horarioService.listarPorUsuario(user)).thenReturn(List.of());
        when(actividadService.listarPorUsuario(user)).thenReturn(List.of());
        when(actionRepository.findByUsuarioAndIdempotencyKey(any(), any())).thenReturn(Optional.empty());
        when(actionRepository.save(any())).thenAnswer(invocation -> {
            AssistantAction action = invocation.getArgument(0);
            action.setId(UUID.randomUUID());
            return action;
        });

        AssistantMessageResponse response = service.message(user, new AssistantMessageRequest(
                "Crea una tarea llamada estudiar redes mañana a las 10:30 prioridad alta",
                List.of(), "request-1"));

        assertThat(response.proposal()).isNotNull();
        assertThat(response.proposal().type()).isEqualTo("CREATE_ACTIVITY");
        assertThat(response.proposal().payload().path("title").asText()).isEqualTo("estudiar redes");
        assertThat(response.proposal().payload().path("date").asText()).isEqualTo(LocalDate.now().plusDays(1).toString());
        assertThat(response.proposal().payload().path("time").asText()).isEqualTo("10:30");
        assertThat(response.proposal().payload().has("userId")).isFalse();
        verifyNoInteractions(iaProviderService);
    }

    @Test
    void normalizesBotHistoryToAssistantForModel() throws Exception {
        when(horarioService.listarPorUsuario(user)).thenReturn(List.of());
        when(actividadService.listarPorUsuario(user)).thenReturn(List.of());
        when(actionRepository.findByUsuarioAndIdempotencyKey(any(), any())).thenReturn(Optional.empty());
        when(iaProviderService.consultar(any())).thenReturn(
                "{\"respuesta\":\"Respuesta contextual\",\"proposal\":null}");

        AssistantMessageResponse response = service.message(user, new AssistantMessageRequest(
                "Ayúdame a organizarme", List.of(new AssistantHistoryMessage("bot", "Mensaje anterior")), null));

        ArgumentCaptor<String> prompt = ArgumentCaptor.forClass(String.class);
        verify(iaProviderService).consultar(prompt.capture());
        assertThat(prompt.getValue()).contains("assistant: Mensaje anterior");
        assertThat(response.respuesta()).isEqualTo("Respuesta contextual");
    }

    @Test
    void confirmsOwnedCreateProposalThroughExistingServices() {
        UUID id = UUID.randomUUID();
        AssistantAction action = new AssistantAction();
        action.setId(id);
        action.setUsuario(user);
        action.setTipo(AssistantAction.Type.CREATE_ACTIVITY);
        action.setEstado(AssistantAction.Status.PENDING);
        action.setExpiraEn(Instant.now().plusSeconds(300));
        action.setPayloadJson("""
                {"title":"Preparar exposición","type":"DEBER","date":"%s","time":"09:00",
                 "durationMinutes":45,"priority":"ALTA"}
                """.formatted(LocalDate.now().plusDays(1)));
        when(actionRepository.findOwnedForUpdate(id, user.getId())).thenReturn(Optional.of(action));
        when(actionRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));
        doAnswer(invocation -> {
            Actividad created = invocation.getArgument(0);
            created.setId(99L);
            return null;
        }).when(actividadService).guardar(any());
        when(actividadService.validarActividad(any())).thenReturn(List.of());

        var result = service.confirm(user, id);

        assertThat(result.status()).isEqualTo("CONFIRMED");
        assertThat(result.activityId()).isEqualTo(99L);
        verify(actividadService).guardar(argThat(a -> a.getUsuario() == user
                && a.getTitulo().equals("Preparar exposición")));
        verify(actividadCompartidaService).registrarPropietario(any(), eq(user));
    }

    @Test
    void rejectsExpiredAndCrossUserProposals() {
        UUID expiredId = UUID.randomUUID();
        AssistantAction expired = new AssistantAction();
        expired.setId(expiredId);
        expired.setUsuario(user);
        expired.setTipo(AssistantAction.Type.CREATE_ACTIVITY);
        expired.setEstado(AssistantAction.Status.PENDING);
        expired.setExpiraEn(Instant.now().minusSeconds(1));
        when(actionRepository.findOwnedForUpdate(expiredId, user.getId())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.confirm(user, expiredId))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("expiró");
        assertThat(expired.getEstado()).isEqualTo(AssistantAction.Status.EXPIRED);

        UUID foreignId = UUID.randomUUID();
        when(actionRepository.findOwnedForUpdate(foreignId, user.getId())).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.confirm(user, foreignId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("no encontrada");
    }

    @Test
    void revalidatesScheduleConflictsBeforeConfirming() {
        UUID id = UUID.randomUUID();
        AssistantAction action = new AssistantAction();
        action.setId(id);
        action.setUsuario(user);
        action.setTipo(AssistantAction.Type.CREATE_ACTIVITY);
        action.setEstado(AssistantAction.Status.PENDING);
        action.setExpiraEn(Instant.now().plusSeconds(300));
        action.setPayloadJson("""
                {"title":"Tutoría","type":"OTRO","date":"%s","time":"09:00",
                 "durationMinutes":60,"priority":"MEDIA"}
                """.formatted(LocalDate.now().plusDays(1)));
        ConflictoEvento conflict = new ConflictoEvento();
        conflict.setTitulo("Clase de Redes");
        conflict.setHoraInicio(LocalTime.of(9, 0));
        conflict.setHoraFin(LocalTime.of(10, 0));
        when(actionRepository.findOwnedForUpdate(id, user.getId())).thenReturn(Optional.of(action));
        when(conflictDetectionService.detectarConflictos(
                eq(user), any(LocalDate.class), eq(LocalTime.of(9, 0)), eq(60), isNull()))
                .thenReturn(List.of(conflict));

        assertThatThrownBy(() -> service.confirm(user, id))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Clase de Redes");
        verify(actividadService, never()).guardar(any());
    }

    private Actividad activity(Long id, String title, LocalDate date, LocalTime time) {
        Actividad activity = new Actividad();
        activity.setId(id);
        activity.setUsuario(user);
        activity.setTitulo(title);
        activity.setTipo("EXAMEN");
        activity.setFechaInicio(date);
        activity.setHoraInicio(time);
        activity.setEstado("PENDIENTE");
        return activity;
    }
}
