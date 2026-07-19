package com.flowday.flowday.security;

import com.flowday.flowday.config.MobileAuthProperties;
import com.flowday.flowday.model.MobileRefreshToken;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.MobileRefreshTokenRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.Duration;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MobileTokenServiceTest {

    private MobileRefreshTokenRepository repository;
    private MobileJwtService jwtService;
    private MobileTokenService service;
    private Usuario usuario;

    @BeforeEach
    void setUp() {
        repository = mock(MobileRefreshTokenRepository.class);
        jwtService = mock(MobileJwtService.class);
        MobileAuthProperties properties = mock(MobileAuthProperties.class);
        when(properties.getRefreshTtl()).thenReturn(Duration.ofDays(30));
        when(jwtService.createAccessToken(any())).thenReturn("signed-access-token");
        when(jwtService.accessExpiresInSeconds()).thenReturn(900L);
        service = new MobileTokenService(repository, jwtService, properties);

        usuario = new Usuario();
        usuario.setId(7L);
        usuario.setCorreo("user@example.com");
        usuario.setEstado("ACTIVO");
    }

    @Test
    void persistsOnlyHashAndReturnsOpaqueRefreshToken() {
        MobileTokenService.TokenPair pair = service.issue(usuario);

        ArgumentCaptor<MobileRefreshToken> captor = ArgumentCaptor.forClass(MobileRefreshToken.class);
        verify(repository).save(captor.capture());
        MobileRefreshToken stored = captor.getValue();

        assertThat(pair.refreshToken()).hasSize(43);
        assertThat(stored.getTokenHash()).hasSize(64);
        assertThat(stored.getTokenHash()).isNotEqualTo(pair.refreshToken());
        assertThat(stored.getTokenHash()).isEqualTo(MobileTokenService.hash(pair.refreshToken()));
    }

    @Test
    void rotatesRefreshTokenAndRevokesPreviousToken() {
        String presented = "valid-refresh-token-value-with-more-than-forty-characters";
        MobileRefreshToken current = token(MobileTokenService.hash(presented));
        when(repository.findByTokenHashForUpdate(current.getTokenHash())).thenReturn(Optional.of(current));

        MobileTokenService.TokenPair replacement = service.rotate(presented);

        assertThat(current.getRevokedAt()).isNotNull();
        assertThat(current.getReplacedByHash()).isEqualTo(MobileTokenService.hash(replacement.refreshToken()));
        assertThat(replacement.refreshToken()).isNotEqualTo(presented);
    }

    @Test
    void rejectsExpiredRefreshToken() {
        String presented = "expired-refresh-token-value-with-more-than-forty-characters";
        MobileRefreshToken expired = token(MobileTokenService.hash(presented));
        expired.setExpiresAt(Instant.now().minusSeconds(1));
        when(repository.findByTokenHashForUpdate(expired.getTokenHash())).thenReturn(Optional.of(expired));

        assertThatThrownBy(() -> service.rotate(presented))
                .isInstanceOf(MobileTokenService.InvalidRefreshTokenException.class);
        assertThat(expired.getRevokedAt()).isNotNull();
    }

    private MobileRefreshToken token(String hash) {
        MobileRefreshToken token = new MobileRefreshToken();
        token.setTokenHash(hash);
        token.setUsuario(usuario);
        token.setCreatedAt(Instant.now().minusSeconds(60));
        token.setExpiresAt(Instant.now().plusSeconds(3600));
        return token;
    }
}
