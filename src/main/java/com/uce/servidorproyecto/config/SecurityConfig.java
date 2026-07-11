package com.uce.servidorproyecto.config;

import com.uce.servidorproyecto.security.LoginRateLimitFilter;
import com.uce.servidorproyecto.security.OAuth2LoginSuccessHandler;
import com.uce.servidorproyecto.security.SessionUsuarioSyncFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

import java.util.Arrays;

@Configuration
@EnableWebSecurity
@Profile("!test")
public class SecurityConfig {

    @Autowired
    private AppProperties appProperties;

    @Autowired
    private LoginRateLimitFilter loginRateLimitFilter;

    @Autowired
    private SessionUsuarioSyncFilter sessionUsuarioSyncFilter;

    @Autowired
    private Environment environment;

    @Autowired(required = false)
    private ClientRegistrationRepository clientRegistrationRepository;

    @Autowired(required = false)
    private OAuth2LoginSuccessHandler oauth2LoginSuccessHandler;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        String adminPrefix = normalizePrefix(appProperties.getAdmin().getPathPrefix());
        String internalLogin = adminPrefix + "/login";
        boolean isProd = Arrays.asList(environment.getActiveProfiles()).contains("prod");

        CsrfTokenRequestAttributeHandler csrfHandler = new CsrfTokenRequestAttributeHandler();
        csrfHandler.setCsrfRequestAttributeName(null);

        http
            .csrf(csrf -> csrf
                .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(csrfHandler)
                .ignoringRequestMatchers("/api/**")
            )
            .headers(headers -> {
                headers.contentSecurityPolicy(csp -> csp.policyDirectives(
                    "default-src 'self'; " +
                    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
                    "style-src 'self' 'unsafe-inline'; " +
                    "img-src 'self' data: blob:; " +
                    "connect-src 'self' ws: wss:; " +
                    "font-src 'self' data:; " +
                    "frame-ancestors 'self'"
                ));
                headers.frameOptions(Customizer.withDefaults());
                headers.contentTypeOptions(Customizer.withDefaults());
                headers.referrerPolicy(referrer -> referrer.policy(
                    ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN
                ));
                if (isProd) {
                    headers.httpStrictTransportSecurity(hsts -> hsts
                        .includeSubDomains(true)
                        .maxAgeInSeconds(31536000)
                    );
                }
            })
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(
                    "/", "/login", "/logout",
                    "/registro", "/registro/**",
                    "/recuperar-contrasena", "/recuperar-contrasena/**",
                    "/css/**", "/js/**", "/images/**", "/icons/**", "/uploads/**",
                    "/sw.js", "/manifest.json", "/manifest.webmanifest", "/webjars/**",
                    "/error/**", "/robots.txt",
                    "/actuator/health",
                    "/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html",
                    "/oauth2/**", "/login/oauth2/**",
                    "/app/**", "/app"
                ).permitAll()
                .requestMatchers(HttpMethod.GET, internalLogin).permitAll()
                .requestMatchers(HttpMethod.POST, internalLogin).permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/admin-login").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/register").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/forgot-password").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/auth/reset-password/session").permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/reset-password").permitAll()
                .requestMatchers(HttpMethod.GET, "/api/v1/auth/oauth-providers").permitAll()
                .requestMatchers("/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/v1/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/**").authenticated()
                .anyRequest().authenticated()
            )
            .exceptionHandling(ex -> ex
                .authenticationEntryPoint((request, response, authException) -> {
                    if (request.getRequestURI().startsWith("/api/")) {
                        response.setStatus(401);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"error\":\"No autenticado\"}");
                    } else {
                        response.sendRedirect("/login");
                    }
                })
                .accessDeniedHandler((request, response, accessDeniedException) -> {
                    if (request.getRequestURI().startsWith("/api/")) {
                        response.setStatus(403);
                        response.setContentType("application/json");
                        response.getWriter().write("{\"error\":\"Acceso denegado\"}");
                    } else if (request.getRequestURI().startsWith("/admin")) {
                        response.sendRedirect("/app/admin/login");
                    } else {
                        response.sendRedirect("/app/access-denied");
                    }
                })
            )
            .formLogin(form -> form.disable())
            .httpBasic(basic -> basic.disable())
            .logout(logout -> logout.disable());

        if (clientRegistrationRepository != null && oauth2LoginSuccessHandler != null) {
            http.oauth2Login(oauth2 -> oauth2
                    .loginPage("/login")
                    .successHandler(oauth2LoginSuccessHandler)
            );
        }

        http.addFilterBefore(loginRateLimitFilter, UsernamePasswordAuthenticationFilter.class);
        http.addFilterAfter(sessionUsuarioSyncFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    private String normalizePrefix(String prefix) {
        if (prefix == null || prefix.isBlank()) {
            return "/internal";
        }
        return prefix.startsWith("/") ? prefix.replaceAll("/$", "") : "/" + prefix.replaceAll("/$", "");
    }
}
