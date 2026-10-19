// Sala de cada item do feed de atividades: o evento guarda o id da sala ("sala3"), mas a tela precisa do nome ("SAI AÊ").
// Evento sem sala (conversa de agente) usa a sala de casa do agente, a mesma regra do snapshot: a sala escolhida dele, ou a
// primeira sala de trabalho. Sem agente e sem sala, o rótulo é "Escritório" (nunca o código nem vazio).
export function feedRoomOf(roomList, agents, e, nameOf = (id, name) => name) {
  const work = roomList.filter((r) => r.kind !== 'meeting');
  const agent = e.agent ? agents.find((a) => a.id === e.agent) : undefined;
  const wanted = e.room || agent?.room;
  const room = roomList.find((r) => r.id === wanted) || (agent ? work[0] : undefined);
  if (!room) return { roomId: '', roomName: 'Escritório' };
  return { roomId: room.id, roomName: nameOf(room.id, room.name) };
}
