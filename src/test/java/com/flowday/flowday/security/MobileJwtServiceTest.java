package com.flowday.flowday.security;

import com.flowday.flowday.config.MobileAuthProperties;
import com.flowday.flowday.model.Usuario;
import org.junit.jupiter.api.Test;

import java.time.Duration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MobileJwtServiceTest {

    @Test
    void createsAndValidatesShortLivedAccessToken() {
        MobileAuthProperties properties = mock(MobileAuthProperties.class);
        when(properties.getJwtSecret()).thenReturn(
                "test-mobile-jwt-secret-with-at-least-thirty-two-characters");
        when(properties.getIssuer()).thenReturn("flowday-test");
        when(properties.getAccessTtl()).thenReturn(Duration.ofMinutes(15));
        MobileJwtService service = new MobileJwtService(properties);

        Usuario usuario = new Usuario();
        usuario.setId(42L);
        usuario.setCorreo("mobile@example.com");
        usuario.setRol("USER");

        String token = service.createAccessToken(usuario);

        assertThat(service.parseUserId(token)).contains(42L);
        assertThat(service.accessExpiresInSeconds()).isEqualTo(900);
        assertThat(service.parseUserId(token + "altered")).isEmpty();
    }
}
