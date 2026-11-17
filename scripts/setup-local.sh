#!/usr/bin/env bash
# setup-local.sh [--all|--deps|--es|--magento]   (ohne Argument = --all)
#
# Installiert die komplette Toolchain auf der lokalen Maschine – kein Docker:
#   --deps     apt: PHP 8.3 + Extensions, Composer, MariaDB; schreibt .local/toolchain.env
#   --es       Elasticsearch-Tarball nach .local/elasticsearch-<version>/
#   --magento  Magento Open Source (GitHub-Tag) nach magento2/ + composer install
#
# Magento kommt vom oeffentlichen GitHub-Tag + Packagist (alle magento/*-Pakete
# werden per "replace" aus dem Repo selbst bedient) – kein repo.magento.com-Login noetig.
set -euo pipefail
# shellcheck disable=SC1091
. "$(dirname "${BASH_SOURCE[0]}")/common.sh"

# LD_LIBRARY_PATH-Sanitizing uebernimmt common.sh (wird oben gesourct).

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  command -v sudo >/dev/null 2>&1 || die "root oder sudo wird fuer die apt-Installation benoetigt"
  sudo -n true 2>/dev/null || die "passwortloses sudo wird fuer die apt-Installation benoetigt"
  SUDO="sudo -n"
fi

MODE="${1:---all}"
case "$MODE" in
  --all|--deps|--es|--magento) ;;
  *) echo "Aufruf: $0 [--all|--deps|--es|--magento]" >&2; exit 2 ;;
esac

# --- PHP ----------------------------------------------------------------------
php_ok() { # php_ok <binary>: Version >= 8.1 und alle von Magento benoetigten Extensions
  local c="$1" m
  "$c" -r 'exit(PHP_VERSION_ID >= 80100 ? 0 : 1);' 2>/dev/null || return 1
  for m in bcmath curl dom gd intl mbstring mysqli pdo_mysql soap sodium xsl zip; do
    "$c" -m 2>/dev/null | grep -qx "$m" || return 1
  done
  return 0
}

resolve_php() {
  local c
  for c in /usr/bin/php8.3 /usr/bin/php8.2 /usr/bin/php8.1 /usr/bin/php "$(command -v php 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if php_ok "$c"; then PHP_BIN="$c"; return 0; fi
  done
  return 1
}

install_deps() {
  log "Installiere Pakete per apt: PHP 8.3 + Extensions, Composer, MariaDB, unzip"
  # policy-rc.d verhindert, dass Paket-Postinsts Systemdienste im Container starten
  if [ -n "$SUDO" ] && [ ! -e /usr/sbin/policy-rc.d ]; then
    printf '#!/bin/sh\nexit 101\n' | $SUDO tee /usr/sbin/policy-rc.d >/dev/null
    $SUDO chmod +x /usr/sbin/policy-rc.d
  fi
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq
  # shellcheck disable=SC2086
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
    mariadb-server mariadb-client git curl ca-certificates unzip composer \
    php8.3-cli php8.3-common php8.3-bcmath php8.3-curl php8.3-gd php8.3-intl \
    php8.3-mbstring php8.3-mysql php8.3-opcache php8.3-soap php8.3-xml php8.3-xsl php8.3-zip
  ok "apt-Pakete installiert"
}

# --- Composer -----------------------------------------------------------------
resolve_composer() {
  local c
  for c in /usr/bin/composer "$(command -v composer 2>/dev/null || true)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if "$c" --version >/dev/null 2>&1; then COMPOSER_BIN="$c"; return 0; fi
  done
  log "Composer-Binary nicht nutzbar – lade composer.phar nach $LOCAL_DIR"
  curl -fsSL -o "$LOCAL_DIR/composer.phar" https://getcomposer.org/download/latest-stable/composer.phar
  COMPOSER_BIN="$PHP_BIN $LOCAL_DIR/composer.phar"
}

# --- toolchain.env ------------------------------------------------------------
write_toolchain_env() {
  resolve_php || die "kein geeignetes PHP (>= 8.1 mit Magento-Extensions) gefunden"
  resolve_composer
  MARIADBD_BIN="$(command -v mariadbd 2>/dev/null || echo /usr/sbin/mariadbd)"
  MARIADB_INSTALL_DB_BIN="$(command -v mariadb-install-db 2>/dev/null || command -v mysql_install_db 2>/dev/null || echo /usr/bin/mariadb-install-db)"
  MARIADB_BIN="$(command -v mariadb 2>/dev/null || echo /usr/bin/mariadb)"
  MARIADB_ADMIN_BIN="$(command -v mariadb-admin 2>/dev/null || echo /usr/bin/mariadb-admin)"
  mkdir -p "$LOCAL_DIR"
  cat > "$LOCAL_DIR/toolchain.env" <<EOF
# automatisch erzeugt durch scripts/setup-local.sh – nicht einchecken (.local/ ist gitignored)
PHP_BIN=$PHP_BIN
COMPOSER_BIN=$COMPOSER_BIN
MARIADBD_BIN=$MARIADBD_BIN
MARIADB_INSTALL_DB_BIN=$MARIADB_INSTALL_DB_BIN
MARIADB_BIN=$MARIADB_BIN
MARIADB_ADMIN_BIN=$MARIADB_ADMIN_BIN
EOF
  ok "Toolchain ermittelt und in .local/toolchain.env abgelegt (PHP: $PHP_BIN)"
}

# --- Elasticsearch ------------------------------------------------------------
install_es() {
  if [ -x "$ES_HOME/bin/elasticsearch" ]; then
    ok "Elasticsearch $ES_VERSION bereits vorhanden ($ES_HOME)"
    return 0
  fi
  local tar="$LOCAL_DIR/elasticsearch-$ES_VERSION-linux-x86_64.tar.gz"
  log "Lade Elasticsearch $ES_VERSION herunter (~330 MB, artifacts.elastic.co)"
  curl -fSL --retry 3 -C - -o "$tar" "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-$ES_VERSION-linux-x86_64.tar.gz"
  log "Entpacke nach $LOCAL_DIR"
  tar -xzf "$tar" -C "$LOCAL_DIR"
  rm -f "$tar"
  ok "Elasticsearch $ES_VERSION installiert nach $ES_HOME"
}

# --- Magento 2 ----------------------------------------------------------------
install_magento() {
  if [ -x "$MAGENTO_DIR/bin/magento" ] && [ -d "$MAGENTO_DIR/vendor" ]; then
    ok "Magento $MAGENTO_VERSION bereits installiert ($MAGENTO_DIR)"
    return 0
  fi
  if [ ! -d "$MAGENTO_DIR/bin" ]; then
    local zip="$LOCAL_DIR/magento2-$MAGENTO_VERSION.zip"
    log "Lade Magento Open Source $MAGENTO_VERSION (GitHub-Tag) herunter"
    curl -fSL --retry 3 -C - -o "$zip" "https://codeload.github.com/magento/magento2/zip/refs/tags/$MAGENTO_VERSION"
    log "Entpacke nach $MAGENTO_DIR"
    unzip -q "$zip" -d "$LOCAL_DIR"
    rm -f "$zip"
    if [ -d "$MAGENTO_DIR" ]; then mv "$MAGENTO_DIR" "$LOCAL_DIR/magento2-vorher.$$"; fi
    mv "$LOCAL_DIR/magento2-$MAGENTO_VERSION" "$MAGENTO_DIR"
  fi
  log "composer install in $MAGENTO_DIR (nur GitHub + Packagist, kein Adobe-Login; dauert einige Minuten)"
  (cd "$MAGENTO_DIR" && \
    COMPOSER_HOME="$LOCAL_DIR/composer" \
    COMPOSER_MEMORY_LIMIT=-1 \
    COMPOSER_ALLOW_SUPERUSER=1 \
    PATH="$(dirname "$PHP_BIN"):$PATH" \
    $COMPOSER_BIN install --no-interaction --no-progress --prefer-dist --no-dev)
  chmod +x "$MAGENTO_DIR/bin/magento" 2>/dev/null || true
  ok "Magento $MAGENTO_VERSION installiert"
}

# --- Hauptprogramm ------------------------------------------------------------
case "$MODE" in
  --deps)
    resolve_php || install_deps
    write_toolchain_env
    ;;
  --es)
    install_es
    ;;
  --magento)
    [ -f "$LOCAL_DIR/toolchain.env" ] || { resolve_php || install_deps; write_toolchain_env; }
    install_magento
    ;;
  --all)
    resolve_php || install_deps
    write_toolchain_env
    install_es
    install_magento
    ;;
esac

ok "setup-local.sh ($MODE) fertig – naechster Schritt: make demo"
