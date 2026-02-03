-- Fix existing pos_integrations with NULL restaurant_id by deriving from location
UPDATE pos_integrations 
SET restaurant_id = locations.restaurant_id
FROM locations
WHERE pos_integrations.location_id = locations.id
AND pos_integrations.restaurant_id IS NULL;

-- Fix existing pos_sales_import with NULL restaurant_id
UPDATE pos_sales_import 
SET restaurant_id = locations.restaurant_id
FROM locations
WHERE pos_sales_import.location_id = locations.id
AND pos_sales_import.restaurant_id IS NULL;