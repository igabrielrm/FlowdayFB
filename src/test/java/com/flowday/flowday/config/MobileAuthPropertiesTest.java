package com.flowday.flowday.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Duration;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MobileAuthPropertiesTest {

    @Test
    void productionRejectsDevelopmentSecret() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        MobileAuthProperties properties = new MobileAuthProperties(environment);
        ReflectionTestUtils.setField(properties, "jwtSecret",
                "dev-only-mobile-jwt-secret-change-before-production-2026");
        ReflectionTestUtils.setField(properties, "accessTtl", Duration.ofMinutes(15));
        ReflectionTestUtils.setField(properties, "refreshTtl", Duration.ofDays(30));
        ReflectionTestUtils.setField(properties, "allowedOrigins", List.of("https://localhost"));

        assertThatThrownBy(properties::validate)
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("MOBILE_JWT_SECRET");
    }
}
