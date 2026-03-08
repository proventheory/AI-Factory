-- Give every email template a generic name for the builder (Template step in Email Marketing wizard).
-- Match by current name (case-insensitive, trim); leaves other templates unchanged.
UPDATE email_templates SET name = 'Newsletter 1' WHERE trim(name) ILIKE trim('12 reasons to say bye to boring soda');
UPDATE email_templates SET name = 'Newsletter 2' WHERE trim(name) ILIKE trim('architecture as a public service');
UPDATE email_templates SET name = 'Product - Emma' WHERE trim(name) ILIKE trim('introducing emma');
UPDATE email_templates SET name = 'Product 1' WHERE trim(name) ILIKE trim('canyons labor day sale is live 1');
UPDATE email_templates SET name = 'Product 2' WHERE trim(name) ILIKE trim('in or out 1');
UPDATE email_templates SET name = 'Newsletter 3' WHERE trim(name) ILIKE trim('the beauty of consistency');
UPDATE email_templates SET name = 'Product 3' WHERE trim(name) ILIKE trim('shop fathers day gifts loaded with character');
UPDATE email_templates SET name = 'Newsletter 4' WHERE trim(name) ILIKE trim('get to know r2');
UPDATE email_templates SET name = 'Product 4' WHERE trim(name) ILIKE trim('guess what christmas vacation is back 1');
UPDATE email_templates SET name = 'Newsletter 5' WHERE trim(name) ILIKE trim('do more than drive introducing ford energy solutions');
