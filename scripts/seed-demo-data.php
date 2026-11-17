<?php
declare(strict_types=1);
/**
 * Seed fuer den lokalen Demo-Shop (ersetzt die Sample Data des frueheren Docker-Images,
 * braucht keinen repo.magento.com-Login): Kategorien, einfache Produkte, eine CMS-Seite.
 * Idempotent – vorhandene SKUs/Identifier werden uebersprungen.
 *
 * Aufruf: MAGENTO_DIR=magento2 php scripts/seed-demo-data.php   (aus scripts/magento.sh)
 */

$magentoDir = getenv('MAGENTO_DIR') ?: dirname(__DIR__) . '/magento2';
require $magentoDir . '/app/bootstrap.php';

use Magento\Catalog\Api\CategoryRepositoryInterface;
use Magento\Catalog\Api\ProductRepositoryInterface;
use Magento\Catalog\Model\CategoryFactory;
use Magento\Catalog\Model\Product\Attribute\Source\Status;
use Magento\Catalog\Model\Product\Type;
use Magento\Catalog\Model\Product\Visibility;
use Magento\Catalog\Model\ProductFactory;
use Magento\Cms\Api\PageRepositoryInterface;
use Magento\Cms\Model\PageFactory;
use Magento\Framework\App\Area;
use Magento\Framework\App\Bootstrap;
use Magento\Store\Model\StoreManagerInterface;

$bootstrap = Bootstrap::create(BP, $_SERVER);
$om = $bootstrap->getObjectManager();
$om->get(\Magento\Framework\App\State::class)->setAreaCode(Area::AREA_ADMINHTML);

$websiteId = (int) $om->get(StoreManagerInterface::class)->getWebsite()->getId();
$parentCategoryId = 2; // Default Category

/** @var CategoryRepositoryInterface $catRepo */
$catRepo = $om->get(CategoryRepositoryInterface::class);
/** @var CategoryFactory $catFactory */
$catFactory = $om->get(CategoryFactory::class);

$catIds = [];
foreach (['Elektronik', 'Bekleidung'] as $name) {
    $existing = $catFactory->create()->getCollection()
        ->addAttributeToFilter('name', $name)
        ->addAttributeToFilter('parent_id', $parentCategoryId)
        ->getFirstItem();
    if ($existing->getId()) {
        $catIds[$name] = (int) $existing->getId();
        continue;
    }
    $cat = $catFactory->create();
    $cat->setName($name)->setParentId($parentCategoryId)->setIsActive(true)->setIncludeInMenu(true);
    $catIds[$name] = (int) $catRepo->save($cat)->getId();
}

$products = [
    ['sku' => 'EL-KOPFHOERER-01', 'name' => 'Kabellose Over-Ear-Kopfhörer', 'price' => 129.99, 'qty' => 25, 'cat' => 'Elektronik',
     'desc' => 'Kabellose Over-Ear-Kopfhörer mit aktivem Noise-Cancelling, 30 h Akkulaufzeit und Bluetooth 5.3.'],
    ['sku' => 'EL-SMARTWATCH-02', 'name' => 'Smartwatch Fitness Tracker', 'price' => 89.90, 'qty' => 40, 'cat' => 'Elektronik',
     'desc' => 'Smartwatch mit Herzfrequenzmesser, GPS und wasserdicht bis 50 m.'],
    ['sku' => 'EL-TASTATUR-03', 'name' => 'Mechanische Tastatur RGB', 'price' => 74.50, 'qty' => 18, 'cat' => 'Elektronik',
     'desc' => 'Mechanische Tastatur mit hot-swappable Switches und RGB-Beleuchtung.'],
    ['sku' => 'EL-LAUTSPRECHER-04', 'name' => 'Bluetooth-Lautsprecher wasserdicht', 'price' => 59.99, 'qty' => 0, 'cat' => 'Elektronik',
     'desc' => 'Kompakter Bluetooth-Lautsprecher, wasserdicht nach IPX7, 12 h Spielzeit.'],
    ['sku' => 'BE-TSHIRT-01', 'name' => 'Bio-Baumwoll-T-Shirt', 'price' => 24.99, 'qty' => 120, 'cat' => 'Bekleidung',
     'desc' => 'T-Shirt aus 100 % Bio-Baumwolle, Unisex, in diversen Farben erhältlich.'],
    ['sku' => 'BE-HOODIE-02', 'name' => 'Kapuzenpullover Premium', 'price' => 54.90, 'qty' => 60, 'cat' => 'Bekleidung',
     'desc' => 'Dicker Kapuzenpullover aus Bio-Baumwoll-Fleece, innen angeraut.'],
    ['sku' => 'BE-JACKE-03', 'name' => 'Wasserdichte Outdoor-Jacke', 'price' => 149.00, 'qty' => 15, 'cat' => 'Bekleidung',
     'desc' => 'Wasserdichte und atmungsaktive 3-Lagen-Jacke mit verschweißten Nähten.'],
    ['sku' => 'BE-RUCKSACK-04', 'name' => 'Laptop-Rucksack 15 Zoll', 'price' => 69.99, 'qty' => 35, 'cat' => 'Bekleidung',
     'desc' => 'Rucksack mit gepolstertem 15-Zoll-Laptopfach und wasserabweisendem Material.'],
];

/** @var ProductRepositoryInterface $productRepo */
$productRepo = $om->get(ProductRepositoryInterface::class);
/** @var ProductFactory $productFactory */
$productFactory = $om->get(ProductFactory::class);

$created = 0;
foreach ($products as $p) {
    try {
        $productRepo->get($p['sku']);
        continue; // existiert bereits
    } catch (\Throwable $e) {
        // neu anlegen
    }
    $product = $productFactory->create();
    $product->setSku($p['sku'])
        ->setName($p['name'])
        ->setAttributeSetId(4) // Default
        ->setStatus(Status::STATUS_ENABLED)
        ->setVisibility(Visibility::VISIBILITY_BOTH) // Katalog + Suche
        ->setTypeId(Type::TYPE_SIMPLE)
        ->setPrice($p['price'])
        ->setTaxClassId(2)
        ->setWebsiteIds([$websiteId])
        ->setDescription($p['desc'])
        ->setShortDescription($p['desc'])
        ->setStockData([
            'use_config_manage_stock' => 0,
            'manage_stock' => 1,
            'is_in_stock' => $p['qty'] > 0 ? 1 : 0,
            'qty' => $p['qty'],
        ])
        ->setCategoryIds(array_values(array_unique([$parentCategoryId, $catIds[$p['cat']]])));
    $productRepo->save($product);
    $created++;
}

// CMS-Seite als Korpus fuer das Support-Tool (cms_page mit numerischer page_id)
/** @var PageRepositoryInterface $pageRepo */
$pageRepo = $om->get(PageRepositoryInterface::class);
/** @var PageFactory $pageFactory */
$pageFactory = $om->get(PageFactory::class);
$pageId = null;
$existingPage = $pageFactory->create()->getCollection()->addFieldToFilter('identifier', 'versand')->getFirstItem();
if ($existingPage->getId()) {
    $pageId = (int) $existingPage->getId();
} else {
    $page = $pageFactory->create();
    $page->setTitle('Versand & Lieferung')
        ->setIdentifier('versand')
        ->setIsActive(true)
        ->setStoreId([0])
        ->setPageLayout('1column')
        ->setContentHeading('Versand & Lieferung')
        ->setContent('<p>Versandkostenfrei ab 50 € Bestellwert, darunter 4,95 €. Lieferzeit 2–4 Werktage. '
            . 'Rückgabe innerhalb von 30 Tagen kostenfrei.</p>');
    $pageId = (int) $pageRepo->save($page)->getId();
}

echo "Seed fertig: $created neue Produkte, Kategorien " . json_encode($catIds) . ", CMS-Seite 'versand' page_id=$pageId\n";
