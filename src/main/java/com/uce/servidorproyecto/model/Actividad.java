/*
 * Click nbfs://nbhost/SystemFileSystem/Templates/Licenses/license-default.txt to change this license
 * Click nbfs://nbhost/SystemFileSystem/Templates/Classes/Class.java to edit this template
 */
package com.uce.servidorproyecto.model;

import jakarta.persistence.*;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Entity
@Table(name = "actividades")
public class Actividad {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Version
    @Column(nullable = false, columnDefinition = "bigint not null default 0")
    private Long version = 0L;

    @ManyToOne
    @JoinColumn(name = "usuario_id", nullable = false)
    private Usuario usuario;

    @Column(nullable = false)
    private String titulo;

    private String descripcion;
    private String materia;

    // Tipo: CLASE, DEBER, REUNION_GRUPAL, TRABAJO_GRUPO, CITA_MEDICA, CITA_LABORAL, OTRO
    @Column(nullable = false)
    private String tipo;

    // Formateadores automáticos para evitar errores 500 al recibir datos del HTML
    @Column(nullable = false)
    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate fechaInicio;

    @DateTimeFormat(pattern = "HH:mm")
    private LocalTime horaInicio;
    
    private Integer duracionMinutos;

    @DateTimeFormat(pattern = "yyyy-MM-dd")
    private LocalDate fechaEntrega;

    // Prioridad: ALTA, MEDIA, BAJA
    private String prioridad;

    // Estado: PENDIENTE, EN_PROCESO, COMPLETADA
    @Column(nullable = false)
    private String estado;

    private boolean esAcademico;
    private Integer tiempoPomodoro;
    private String color; // Almacena el valor hexadecimal (#22c55e, #3b82f6, etc.)

    /** Peso de prioridad estricta (100=inamovible, 25=baja). Calculado desde tipo al guardar. */
    private Integer pesoPrioridad;

    // ===== CONSTRUCTOR =====
    public Actividad() {
        this.estado = "PENDIENTE";
        this.esAcademico = true;
        this.prioridad = "MEDIA";
        this.color = "#06b6d4"; 
    }

    // ===== GETTERS Y SETTERS =====
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }

    public Usuario getUsuario() { return usuario; }
    public void setUsuario(Usuario usuario) { this.usuario = usuario; }

    public String getTitulo() { return titulo; }
    public void setTitulo(String titulo) { this.titulo = titulo; }

    public String getDescripcion() { return descripcion; }
    public void setDescripcion(String descripcion) { this.descripcion = descripcion; }

    public String getMateria() { return materia; }
    public void setMateria(String materia) { this.materia = materia; }

    public String getTipo() { return tipo; }
    public void setTipo(String tipo) { this.tipo = tipo; }

    public LocalDate getFechaInicio() { return fechaInicio; }
    public void setFechaInicio(LocalDate fechaInicio) { this.fechaInicio = fechaInicio; }

    public LocalTime getHoraInicio() { return horaInicio; }
    public void setHoraInicio(LocalTime horaInicio) { this.horaInicio = horaInicio; }

    public Integer getDuracionMinutos() { return duracionMinutos; }
    public void setDuracionMinutos(Integer duracionMinutos) { this.duracionMinutos = duracionMinutos; }

    public LocalDate getFechaEntrega() { return fechaEntrega; }
    public void setFechaEntrega(LocalDate fechaEntrega) { this.fechaEntrega = fechaEntrega; }

    public String getPrioridad() { return prioridad; }
    public void setPrioridad(String prioridad) { this.prioridad = prioridad; }

    public String getEstado() { return estado; }
    public void setEstado(String estado) { this.estado = estado; }

    public boolean isEsAcademico() { return esAcademico; }
    public void setEsAcademico(boolean esAcademico) { this.esAcademico = esAcademico; }

    public Integer getTiempoPomodoro() { return tiempoPomodoro; }
    public void setTiempoPomodoro(Integer tiempoPomodoro) { this.tiempoPomodoro = tiempoPomodoro; }

    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }

    public Integer getPesoPrioridad() { return pesoPrioridad; }
    public void setPesoPrioridad(Integer pesoPrioridad) { this.pesoPrioridad = pesoPrioridad; }

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