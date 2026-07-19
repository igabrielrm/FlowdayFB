package com.uce.servidorproyecto.model;

import jakarta.persistence.*;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "horarios_clase")
public class BloqueRecurrente {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private Long version = 0L;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(nullable = false)
    private String materia;

    /** 1 = Lunes … 7 = Domingo (java.time.DayOfWeek) */
    @Column(nullable = false)
    private Integer diaSemana;

    @Column(nullable = false)
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime horaInicio;

    @Column(nullable = false)
    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime horaFin;

    private String aula;
    private String profesor;
    private String color;

    public BloqueRecurrente() {
        this.color = "#5082ef";
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }

    public Usuario getUsuario() { return usuario; }
    public void setUsuario(Usuario usuario) { this.usuario = usuario; }

    public String getMateria() { return materia; }
    public void setMateria(String materia) { this.materia = materia; }

    public Integer getDiaSemana() { return diaSemana; }
    public void setDiaSemana(Integer diaSemana) { this.diaSemana = diaSemana; }

    public LocalTime getHoraInicio() { return horaInicio; }
    public void setHoraInicio(LocalTime horaInicio) { this.horaInicio = horaInicio; }

    public LocalTime getHoraFin() { return horaFin; }
    public void setHoraFin(LocalTime horaFin) { this.horaFin = horaFin; }

    public String getAula() { return aula; }
    public void setAula(String aula) { this.aula = aula; }

    public String getProfesor() { return profesor; }
    public void setProfesor(String profesor) { this.profesor = profesor; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        if (updatedAt == null) {
            updatedAt = LocalDateTime.now();
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
