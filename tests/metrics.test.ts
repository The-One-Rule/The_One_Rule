import { describe, expect, it } from "vitest";
import { formatMetrics } from "../server/metrics";

describe("exposition Prometheus", () => {
  it("publie les métriques opérationnelles sans étiquette à cardinalité variable", () => {
    expect(
      formatMetrics({
        rooms: 2,
        players: 7,
        websocketConnections: 9,
        uptimeSeconds: 123,
        residentMemoryBytes: 456_789,
        caughtErrors: 3,
      }),
    ).toBe(
      [
        "# HELP tor_rooms Nombre de salons actifs.",
        "# TYPE tor_rooms gauge",
        "tor_rooms 2",
        "# HELP tor_players Nombre de joueurs dans les salons.",
        "# TYPE tor_players gauge",
        "tor_players 7",
        "# HELP tor_websocket_connections Nombre de connexions WebSocket actives.",
        "# TYPE tor_websocket_connections gauge",
        "tor_websocket_connections 9",
        "# HELP tor_process_uptime_seconds Temps de fonctionnement du processus.",
        "# TYPE tor_process_uptime_seconds gauge",
        "tor_process_uptime_seconds 123",
        "# HELP tor_process_resident_memory_bytes Mémoire résidente du processus.",
        "# TYPE tor_process_resident_memory_bytes gauge",
        "tor_process_resident_memory_bytes 456789",
        "# HELP tor_caught_errors_total Nombre d'exceptions rattrapées depuis le démarrage.",
        "# TYPE tor_caught_errors_total counter",
        "tor_caught_errors_total 3",
        "",
      ].join("\n"),
    );
  });
});
