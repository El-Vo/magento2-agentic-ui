<?php
/**
 * Router fuer den PHP-Built-in-Webserver (php -S), damit Magento 2 lokal
 * ohne Apache/nginx laeuft: echte Dateien aus pub/ werden direkt ausgeliefert,
 * alles andere geht an den Magento-Front-Controller.
 *
 * Aufruf: php -S 127.0.0.1:8080 -t magento2/pub scripts/php-router.php
 */
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$file = $_SERVER['DOCUMENT_ROOT'] . $path;
if ($path !== '/' && is_file($file)) {
    return false; // statische Datei direkt ausliefern
}
// Im Developer-Mode generiert Magento fehlende Static-Assets on the fly
// (normalerweise per Apache-Rewrite auf pub/static.php).
if (str_starts_with($path, '/static/') && is_file($_SERVER['DOCUMENT_ROOT'] . '/static.php')) {
    require $_SERVER['DOCUMENT_ROOT'] . '/static.php';
    return true;
}
require $_SERVER['DOCUMENT_ROOT'] . '/index.php';
