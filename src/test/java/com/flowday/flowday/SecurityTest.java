package com.flowday.flowday;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
class SecurityTest {

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Test
    void testPasswordEncoder() {
        String password = "password123";
        String encoded = passwordEncoder.encode(password);

        assertThat(encoded).isNotEqualTo(password);
        assertThat(passwordEncoder.matches(password, encoded)).isTrue();
        assertThat(passwordEncoder.matches("wrong", encoded)).isFalse();
    }

    @Test
    void testBCryptStrength() {
        assertThat(passwordEncoder).isInstanceOf(BCryptPasswordEncoder.class);
    }
}
