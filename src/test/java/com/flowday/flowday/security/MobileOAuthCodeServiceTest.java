package com.flowday.flowday.security;

import com.flowday.flowday.model.MobileOAuthCode;
import com.flowday.flowday.model.Usuario;
import com.flowday.flowday.repository.MobileOAuthCodeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MobileOAuthCodeServiceTest {

    @Mock MobileOAuthCodeRepository repository;
    @Mock MobileTokenService tokenService;

    @Test
    void exchangesPkceCodeOnlyOnce() throws Exception {
        MobileOAuthCodeService service = new MobileOAuthCodeService(repository, tokenService);
        Usuario user = new Usuario();
        user.setId(8L);
        user.setEstado("ACTIVO");
        String verifier = "a".repeat(43);
        String challenge = challenge(verifier);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String rawCode = service.issueCode(user, challenge);
        ArgumentCaptor<MobileOAuthCode> persisted = ArgumentCaptor.forClass(MobileOAuthCode.class);
        verify(repository).save(persisted.capture());
        MobileOAuthCode code = persisted.getValue();
        when(repository.findByCodeHashForUpdate(code.getCodeHash())).thenReturn(Optional.of(code));
        MobileTokenService.TokenPair pair =
                new MobileTokenService.TokenPair("access", "refresh", 900, user);
        when(tokenService.issue(user)).thenReturn(pair);

        assertThat(service.exchange(rawCode, verifier)).isSameAs(pair);
        assertThat(code.getConsumedAt()).isNotNull();
        assertThatThrownBy(() -> service.exchange(rawCode, verifier))
                .isInstanceOf(MobileOAuthCodeService.InvalidOAuthCodeException.class);
        verify(tokenService, times(1)).issue(user);
    }

    @Test
    void rejectsWrongPkceVerifierWithoutIssuingTokens() throws Exception {
        MobileOAuthCodeService service = new MobileOAuthCodeService(repository, tokenService);
        Usuario user = new Usuario();
        user.setEstado("ACTIVO");
        String verifier = "b".repeat(43);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String rawCode = service.issueCode(user, challenge(verifier));
        ArgumentCaptor<MobileOAuthCode> persisted = ArgumentCaptor.forClass(MobileOAuthCode.class);
        verify(repository).save(persisted.capture());
        when(repository.findByCodeHashForUpdate(persisted.getValue().getCodeHash()))
                .thenReturn(Optional.of(persisted.getValue()));

        assertThatThrownBy(() -> service.exchange(rawCode, "c".repeat(43)))
                .isInstanceOf(MobileOAuthCodeService.InvalidOAuthCodeException.class);
        verifyNoInteractions(tokenService);
    }

    private String challenge(String verifier) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256")
                .digest(verifier.getBytes(StandardCharsets.US_ASCII));
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest);
    }
}
