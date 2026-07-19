package com.flowday.flowday.security;

import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.UsuarioRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MobileBearerAuthenticationFilterTest {

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void authenticatesActiveUserWithUsuarioPrincipal() throws Exception {
        MobileJwtService jwtService = mock(MobileJwtService.class);
        UsuarioRepository repository = mock(UsuarioRepository.class);
        Usuario usuario = new Usuario();
        usuario.setId(9L);
        usuario.setCorreo("mobile@example.com");
        usuario.setEstado("ACTIVO");
        when(jwtService.parseUserId("valid-token")).thenReturn(Optional.of(9L));
        when(repository.findById(9L)).thenReturn(Optional.of(usuario));

        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/mobile-auth/me");
        request.addHeader("Authorization", "Bearer valid-token");
        MockHttpServletResponse response = new MockHttpServletResponse();
        new MobileBearerAuthenticationFilter(jwtService, repository)
                .doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(200);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isInstanceOf(UsuarioPrincipal.class);
        assertThat(SecurityUtils.getCurrentUsuario()).isSameAs(usuario);
    }

    @Test
    void rejectsInvalidBearerBeforeController() throws Exception {
        MobileJwtService jwtService = mock(MobileJwtService.class);
        UsuarioRepository repository = mock(UsuarioRepository.class);
        when(jwtService.parseUserId("invalid")).thenReturn(Optional.empty());
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/v1/mobile-auth/me");
        request.addHeader("Authorization", "Bearer invalid");
        MockHttpServletResponse response = new MockHttpServletResponse();

        new MobileBearerAuthenticationFilter(jwtService, repository)
                .doFilter(request, response, new MockFilterChain());

        assertThat(response.getStatus()).isEqualTo(401);
        assertThat(response.getContentAsString()).contains("inválido");
    }
}
