import type { ActividadDetail, ActividadListItem, CreateActividadPayload, UpdateActividadPayload } from '../types/activity';
import type { CreateScheduleBlockPayload, ScheduleBlock } from '../types/schedule';
import { cacheApiGet, isTempEntityId, readApiGet, removeApiGet, updateApiGet } from './cache';

const DAY_NAMES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function detailToListItem(detail: ActividadDetail): ActividadListItem {
  return {
    id: detail.id,
    titulo: detail.titulo,
    tipo: detail.tipo,
    estado: detail.estado,
    materia: detail.materia,
    fechaInicio: detail.fechaInicio,
    horaInicio: detail.horaInicio,
    prioridad: detail.prioridad,
    duracionMinutos: detail.duracionMinutos,
    color: detail.color,
    esPropietario: detail.esPropietario,
    esCompartida: (detail.companerosIds?.length ?? 0) > 0,
  };
}

function monthPathFromDate(fecha?: string | null) {
  if (!fecha) return null;
  const [y, m] = fecha.split('-').map(Number);
  if (!y || !m) return null;
  return `/api/v1/activities/by-month?year=${y}&month=${m}`;
}

function datePathFromDate(fecha?: string | null) {
  if (!fecha) return null;
  return `/api/v1/activities/by-date?fecha=${encodeURIComponent(fecha)}`;
}

function patchActivityLists(mutator: (list: ActividadListItem[]) => ActividadListItem[]) {
  updateApiGet<ActividadListItem[]>('/api/v1/activities', (list) => mutator(list ?? []));
}

function patchActivityInDateCaches(item: ActividadListItem, oldFecha?: string | null) {
  const paths = new Set<string>();
  const datePath = datePathFromDate(item.fechaInicio);
  const monthPath = monthPathFromDate(item.fechaInicio);
  if (datePath) paths.add(datePath);
  if (monthPath) paths.add(monthPath);
  if (oldFecha && oldFecha !== item.fechaInicio) {
    const oldDatePath = datePathFromDate(oldFecha);
    const oldMonthPath = monthPathFromDate(oldFecha);
    if (oldDatePath) paths.add(oldDatePath);
    if (oldMonthPath) paths.add(oldMonthPath);
  }

  for (const path of paths) {
    updateApiGet<ActividadListItem[]>(path, (list) => {
      const base = (list ?? []).filter((a) => a.id !== item.id);
      const shouldInclude =
        path.startsWith('/api/v1/activities/by-date?') &&
        item.fechaInicio &&
        path.includes(encodeURIComponent(item.fechaInicio));
      const shouldIncludeMonth =
        path.startsWith('/api/v1/activities/by-month?') &&
        item.fechaInicio &&
        path.includes(`year=${item.fechaInicio.split('-')[0]}`) &&
        path.includes(`month=${Number(item.fechaInicio.split('-')[1])}`);
      if (shouldInclude || shouldIncludeMonth) {
        return [...base, item];
      }
      return base;
    });
  }
}

export function buildOptimisticActivity(
  payload: CreateActividadPayload,
  tempId: number,
): ActividadDetail {
  return {
    id: tempId,
    titulo: payload.titulo,
    descripcion: payload.descripcion ?? null,
    tipo: payload.tipo,
    estado: 'PENDIENTE',
    fechaInicio: payload.fechaInicio,
    horaInicio: payload.horaInicio ?? null,
    duracionMinutos: payload.duracionMinutos ?? null,
    materia: payload.materia ?? null,
    prioridad: payload.prioridad ?? null,
    fechaEntrega: payload.fechaEntrega ?? null,
    color: payload.color ?? null,
    esPropietario: true,
    puedeEditar: true,
    companerosIds: payload.companerosIds ?? [],
  };
}

export function applyActivityCreate(detail: ActividadDetail) {
  const item = detailToListItem(detail);
  patchActivityLists((list) => [...list.filter((a) => a.id !== item.id), item]);
  cacheApiGet(`/api/v1/activities/${detail.id}`, detail);
  patchActivityInDateCaches(item);
}

export function applyActivityUpdate(id: number, payload: UpdateActividadPayload) {
  const detailPath = `/api/v1/activities/${id}`;
  const current =
    readApiGet<ActividadDetail>(detailPath) ??
    (() => {
      const fromList = readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((a) => a.id === id);
      if (!fromList) return null;
      return {
        id: fromList.id,
        titulo: fromList.titulo,
        tipo: fromList.tipo,
        estado: fromList.estado,
        fechaInicio: fromList.fechaInicio,
        horaInicio: fromList.horaInicio,
        duracionMinutos: fromList.duracionMinutos,
        materia: fromList.materia,
        prioridad: fromList.prioridad,
        color: fromList.color,
        esPropietario: fromList.esPropietario,
        puedeEditar: fromList.esPropietario,
        companerosIds: [],
      } satisfies ActividadDetail;
    })();
  if (!current) return;
  const oldFecha = current.fechaInicio;
  const next: ActividadDetail = {
    ...current,
    ...payload,
    estado: payload.estado ?? current.estado,
    companerosIds: payload.companerosIds ?? current.companerosIds,
  };
  const item = detailToListItem(next);
  cacheApiGet(detailPath, next);
  patchActivityLists((list) => list.map((a) => (a.id === id ? item : a)));
  patchActivityInDateCaches(item, oldFecha);
}

export function applyActivityStatus(id: number, estado: string) {
  const detailPath = `/api/v1/activities/${id}`;
  const current = readApiGet<ActividadDetail>(detailPath);
  if (current) {
    const next = { ...current, estado };
    cacheApiGet(detailPath, next);
  }
  const itemFromList = readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((a) => a.id === id);
  const item: ActividadListItem = itemFromList
    ? { ...itemFromList, estado }
    : {
        id,
        titulo: current?.titulo ?? 'Actividad',
        tipo: current?.tipo ?? 'OTRO',
        estado,
        materia: current?.materia,
        fechaInicio: current?.fechaInicio,
        horaInicio: current?.horaInicio,
        prioridad: current?.prioridad,
        duracionMinutos: current?.duracionMinutos,
        color: current?.color,
        esPropietario: current?.esPropietario ?? true,
        esCompartida: (current?.companerosIds?.length ?? 0) > 0,
      };
  patchActivityLists((list) => list.map((a) => (a.id === id ? { ...a, estado } : a)));
  patchActivityInDateCaches(item);
}

export function applyActivityReschedule(id: number, fecha: string, hora?: string | null) {
  const detailPath = `/api/v1/activities/${id}`;
  const current = readApiGet<ActividadDetail>(detailPath);
  const oldFecha = current?.fechaInicio;
  if (current) {
    const next = { ...current, fechaInicio: fecha, horaInicio: hora ?? null };
    cacheApiGet(detailPath, next);
  }
  const itemFromList = readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((a) => a.id === id);
  const item: ActividadListItem = itemFromList
    ? { ...itemFromList, fechaInicio: fecha, horaInicio: hora ?? null }
    : {
        id,
        titulo: current?.titulo ?? 'Actividad',
        tipo: current?.tipo ?? 'OTRO',
        estado: current?.estado ?? 'PENDIENTE',
        materia: current?.materia,
        fechaInicio: fecha,
        horaInicio: hora ?? null,
        prioridad: current?.prioridad,
        duracionMinutos: current?.duracionMinutos,
        color: current?.color,
        esPropietario: current?.esPropietario ?? true,
        esCompartida: (current?.companerosIds?.length ?? 0) > 0,
      };
  patchActivityLists((list) =>
    list.map((a) => (a.id === id ? { ...a, fechaInicio: fecha, horaInicio: hora ?? null } : a)),
  );
  patchActivityInDateCaches(item, oldFecha);
}

export function applyActivityDelete(id: number) {
  removeApiGet(`/api/v1/activities/${id}`);
  patchActivityLists((list) => list.filter((a) => a.id !== id));
}

export function replaceActivityTempId(tempId: number, realId: number, detail: ActividadDetail) {
  applyActivityDelete(tempId);
  applyActivityCreate({ ...detail, id: realId });
}

export function buildOptimisticScheduleBlock(
  payload: CreateScheduleBlockPayload,
  tempId: number,
): ScheduleBlock {
  return {
    id: tempId,
    materia: payload.materia,
    diaSemana: payload.diaSemana,
    diaNombre: DAY_NAMES[payload.diaSemana] ?? '',
    horaInicio: payload.horaInicio,
    horaFin: payload.horaFin,
    aula: payload.aula ?? null,
    profesor: payload.profesor ?? null,
    color: payload.color ?? '#5082ef',
  };
}

export function applyScheduleCreate(block: ScheduleBlock) {
  updateApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks', (list) => [
    ...(list ?? []).filter((b) => b.id !== block.id),
    block,
  ]);
}

export function applyScheduleUpdate(id: number, payload: CreateScheduleBlockPayload) {
  updateApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks', (list) =>
    (list ?? []).map((block) =>
      block.id === id
        ? {
            ...block,
            ...payload,
            diaNombre: DAY_NAMES[payload.diaSemana] ?? block.diaNombre,
            color: payload.color ?? block.color,
          }
        : block,
    ),
  );
}

export function applyScheduleDelete(id: number) {
  updateApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks', (list) =>
    (list ?? []).filter((block) => block.id !== id),
  );
}

export function replaceScheduleTempId(tempId: number, realId: number, block: ScheduleBlock) {
  applyScheduleDelete(tempId);
  applyScheduleCreate({ ...block, id: realId });
}

export { isTempEntityId };
