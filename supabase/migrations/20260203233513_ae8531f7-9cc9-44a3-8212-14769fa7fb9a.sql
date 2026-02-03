-- Fix the location to have the correct restaurant_id
UPDATE locations 
SET restaurant_id = 'a0b99d43-c1c5-40d6-9bf9-7a8f8f4bdf7c'
WHERE id = '461a2edc-108d-4923-89c4-ac7a9f8cb9e1'
AND restaurant_id IS NULL;

-- Fix pos_integrations for this location
UPDATE pos_integrations 
SET restaurant_id = 'a0b99d43-c1c5-40d6-9bf9-7a8f8f4bdf7c'
WHERE location_id = '461a2edc-108d-4923-89c4-ac7a9f8cb9e1'
AND restaurant_id IS NULL;

-- Fix pos_sales_import for this location
UPDATE pos_sales_import 
SET restaurant_id = 'a0b99d43-c1c5-40d6-9bf9-7a8f8f4bdf7c'
WHERE location_id = '461a2edc-108d-4923-89c4-ac7a9f8cb9e1'
AND restaurant_id IS NULL;