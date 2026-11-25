export interface MesuresPrometheus {
  rooms: number;
  players: number;
  websocketConnections: number;
  uptimeSeconds: number;
  residentMemoryBytes: number;
  caughtErrors: number;
}

export function formatMetrics(m: MesuresPrometheus): string {
  return [
    "# HELP tor_rooms Nombre de salons actifs.",
    "# TYPE tor_rooms gauge",
    `tor_rooms ${m.rooms}`,
    "# HELP tor_players Nombre de joueurs dans les salons.",
    "# TYPE tor_players gauge",
    `tor_players ${m.players}`,
    "# HELP tor_websocket_connections Nombre de connexions WebSocket actives.",
    "# TYPE tor_websocket_connections gauge",
    `tor_websocket_connections ${m.websocketConnections}`,
    "# HELP tor_process_uptime_seconds Temps de fonctionnement du processus.",
    "# TYPE tor_process_uptime_seconds gauge",
    `tor_process_uptime_seconds ${m.uptimeSeconds}`,
    "# HELP tor_process_resident_memory_bytes Mémoire résidente du processus.",
    "# TYPE tor_process_resident_memory_bytes gauge",
    `tor_process_resident_memory_bytes ${m.residentMemoryBytes}`,
    "# HELP tor_caught_errors_total Nombre d'exceptions rattrapées depuis le démarrage.",
    "# TYPE tor_caught_errors_total counter",
    `tor_caught_errors_total ${m.caughtErrors}`,
    "",
  ].join("\n");
}
