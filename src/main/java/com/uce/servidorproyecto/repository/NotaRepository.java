package com.uce.servidorproyecto.repository;

import com.uce.servidorproyecto.model.Nota;
import com.uce.servidorproyecto.model.Usuario;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotaRepository extends JpaRepository<Nota, String> {

    List<Nota> findByUsuarioOrderByPinnedDescUpdatedAtDesc(Usuario usuario);
}
