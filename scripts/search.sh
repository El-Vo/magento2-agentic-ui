#!/usr/bin/env bash
# Elasticsearch lokal verwalten (Magento 2.4 braucht einen Suchserver fuer
# Katalogsuche und GraphQL products(search:)). Lauft als aktueller Benutzer
# auf 127.0.0.1:9200, Daten unter .local/es-data, ohne Docker.
#
# Aufruf: search.sh up|down|status|fg
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# ES 7.17 bringt ein eigenes JDK mit. Ein System-Java >= 24 verweigert den von ES 7.x
# benoetigten Security-Manager-Support – daher JAVA_HOME ignorieren und das gebundelte
# JDK explizit ueber ES_JAVA_HOME auswaehlen.
unset JAVA_HOME
if [ -d "$ES_HOME/jdk" ]; then
  export ES_JAVA_HOME="$ES_HOME/jdk"
fi

write_config() {
  local conf="$ES_HOME/config/elasticsearch.yml"
  mkdir -p "$ES_HOME/config" "$ES_DATA/data" "$ES_DATA/logs"
  touch "$conf"
  grep -q '^discovery.type:' "$conf" || cat >> "$conf" <<EOF
cluster.name: magento-local
node.name: magento-local
discovery.type: single-node
network.host: $ES_HOST
http.port: $ES_PORT
xpack.security.enabled: false
path.data: $ES_DATA/data
path.logs: $ES_DATA/logs
EOF
}

es_running() {
  curl -sf "http://$ES_HOST:$ES_PORT" >/dev/null 2>&1
}

cmd_up() {
  if es_running; then
    ok "Elasticsearch laeuft bereits auf $ES_HOST:$ES_PORT"
    return 0
  fi
  [ -x "$ES_HOME/bin/elasticsearch" ] || die "Elasticsearch nicht gefunden in $ES_HOME – bitte 'make setup' ausfuehren"
  write_config
  log "Starte Elasticsearch $ES_VERSION (erster Start dauert ~30-60s)"
  ES_JAVA_OPTS="-Xms512m -Xmx512m" nohup "$ES_HOME/bin/elasticsearch" -p "$ES_PID" >"$LOG_DIR/elasticsearch.log" 2>&1 &
  wait_for 180 curl -sf "http://$ES_HOST:$ES_PORT" \
    || die "Elasticsearch startet nicht – siehe $LOG_DIR/elasticsearch.log"
  ok "Elasticsearch laeuft auf http://$ES_HOST:$ES_PORT"
}

cmd_down() {
  if [ -f "$ES_PID" ] && pid_alive "$ES_PID"; then
    log "Stoppe Elasticsearch (pid $(cat "$ES_PID"))"
    kill "$(cat "$ES_PID")" || true
    wait_for 60 sh -c "! kill -0 $(cat "$ES_PID") 2>/dev/null" || true
  fi
  rm -f "$ES_PID"
  ok "Elasticsearch gestoppt"
}

cmd_status() {
  if es_running; then
    ok "Elasticsearch: laeuft (http://$ES_HOST:$ES_PORT)"
  else
    warn "Elasticsearch: gestoppt"
    return 1
  fi
}

cmd_fg() {
  [ -x "$ES_HOME/bin/elasticsearch" ] || die "Elasticsearch nicht gefunden in $ES_HOME – bitte 'make setup' ausfuehren"
  write_config
  exec env ES_JAVA_OPTS="-Xms512m -Xmx512m" "$ES_HOME/bin/elasticsearch" -p "$ES_PID"
}

case "${1:-}" in
  up) cmd_up ;;
  down) cmd_down ;;
  status) cmd_status ;;
  fg) cmd_fg ;;
  *) echo "Aufruf: $0 up|down|status|fg" >&2; exit 2 ;;
esac
