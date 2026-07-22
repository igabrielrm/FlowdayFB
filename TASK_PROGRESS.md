# Refactorización Integral - Plan de Trabajo

## MÓDULO 1: Guest Mode en localStorage
- [ ] 1.1 Modificar `firebase/data.ts` - Agregar localStorage fallback para todas las funciones (listActivities, createActivity, updateActivity, removeActivity, listNotes, createNote, updateNote, removeNote, listSchedule, createScheduleBlock, updateScheduleBlock, removeScheduleBlock, getWellbeingStats, savePomodoro, savePause)
- [ ] 1.2 Modificar `api/client.ts` - Eliminar `authRequired()` para Activities, Calendar, Schedule, Notes, Wellbeing. Usar localStorage cuando no hay usuario.
- [ ] 1.3 Modificar `api/client.ts` - Mantener `authRequired()` solo para Chat y Comunidad.

## MÓDULO 2: Limpieza Asistente Virtual
- [ ] 2.1 Eliminar import de VirtualCompanion en `AppLayout.tsx`
- [ ] 2.2 Buscar y eliminar referencias a Groq, IA, assistant en todo el frontend
- [ ] 2.3 Eliminar endpoints `ia` y `assistant` de `api/client.ts`

## MÓDULO 3: Reparación CRUD
- [ ] 3.1 Corregir `ActivityEditPage.tsx` - Manejar IDs de guest (string) correctamente
- [ ] 3.2 Corregir `NotesPage.tsx` - Asegurar FAB funcione en modo guest
- [ ] 3.3 Corregir `SchedulePage.tsx` - Asegurar guardado funcione en modo guest
- [ ] 3.4 Agregar deepSanitizeForFirestore en `activities.ts` para evitar errores de undefined

## MÓDULO 4: Visibilidad de Usuarios
- [ ] 4.1 Modificar `AuthContext.tsx` - Guardar usuario en Firestore collection `users` al registrarse/login
- [ ] 4.2 Modificar `firebase/community.ts` - Implementar listado de usuarios
- [ ] 4.3 Modificar `firebase/chat.ts` - Implementar listado de conversaciones/usuarios
- [ ] 4.4 Modificar `api/client.ts` - Conectar community y chat a Firebase real

## MÓDULO 5: Limpieza MUI Warnings
- [ ] 5.1 Revisar y corregir props de estilo directas en elementos DOM
- [ ] 5.2 Reemplazar `inputProps` por `slotProps.htmlInput` en TextField/Select
- [ ] 5.3 Revisar modales para manejo de foco/aria-hidden