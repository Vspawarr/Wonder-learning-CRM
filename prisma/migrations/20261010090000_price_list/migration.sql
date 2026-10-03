-- MRP on products, and the client's price list (R28): Nursery Core / Focus / Plus kits and the
-- optional items with school price (SP) and MRP. The placeholder add-ons A01–A07 (no prices) are replaced,
-- the same way "Delete product" works; only rows still carrying their original names are touched.
ALTER TABLE "Product" ADD COLUMN "mrp" DECIMAL(12,2);

UPDATE "QuotationItem" SET "productId" = NULL WHERE "productId" IN (SELECT "id" FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2'));
UPDATE "SalesOrderItem" SET "productId" = NULL WHERE "productId" IN (SELECT "id" FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2'));
UPDATE "InvoiceItem" SET "productId" = NULL WHERE "productId" IN (SELECT "id" FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2'));
DELETE FROM "OpportunityItem" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2'));
DELETE FROM "LeadInterest" WHERE "productId" IN (SELECT "id" FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2'));
DELETE FROM "Product" WHERE ("code" = 'A01' AND "name" = 'Hindi Swar TB & NB') OR ("code" = 'A02' AND "name" = 'Hindi Vyanjan TB & NB') OR ("code" = 'A03' AND "name" = 'Hindi Shabad Gyan TB & NB') OR ("code" = 'A04' AND "name" = 'Hindi Matra Gyan TB & NB') OR ("code" = 'A05' AND "name" = 'Cursive Text Book') OR ("code" = 'A06' AND "name" = 'My Reader Book- Phonics') OR ("code" = 'A07' AND "name" = 'Nursery Practice Notebooks- 2');

INSERT INTO "Product" ("id", "code", "name", "type", "category", "price", "mrp", "gstRate", "active", "sortOrder", "contents", "color", "updatedAt") VALUES
  ('cat_k05', 'K05', 'Nursery Core Kit', 'MATERIAL', 'Student kit', 2112, 3248, 0, true, 5, '[{"title":"Core Kit","items":["Book 1 to 9","Portfolio Book","Portfolio File","Report Card","Assessments"]}]'::jsonb, '#EE2A50', CURRENT_TIMESTAMP),
  ('cat_k06', 'K06', 'Nursery Focus Kit', 'MATERIAL', 'Student kit', 2954, 4430, 0, true, 6, '[{"title":"Class Connect","items":["Book 1 to 9"]},{"title":"Home Connect","items":["Flash Cards","10 Academic Posters","3 Tracing Sheets","Marker","Portfolio Book","Portfolio File"]},{"title":"Skill Booster","items":["Shape Kit","20 Art & Craft activities (Take Aways)"]},{"title":"Essential Kit","items":["I-card - Student","Escort Card 2","3 Greetings with Envelopes","Sports Certificate","Graduation Certificate","Report Card","Kit Box & Packaging","Assessments","Kit Box","Freight Transport"]}]'::jsonb, '#EE2A50', CURRENT_TIMESTAMP),
  ('cat_k07', 'K07', 'Nursery Plus Kit', 'MATERIAL', 'Student kit', 3244, 4970, 0, true, 7, '[{"title":"Class Connect","items":["Book 1 to 9","Practice Notebook - Letters Nursery","Practice Notebook - Numbers Nursery"]},{"title":"Home Connect","items":["Flash Cards","10 Academic Posters","3 Tracing Sheets","Marker","Portfolio Book","Portfolio File"]},{"title":"Skill Booster","items":["Shape Kit","20 Art & Craft activities (Take Aways)"]},{"title":"Essential Kit","items":["I-card - Student","Escort Card 2","3 Greetings with Envelopes","Sports Certificate","Graduation Certificate","Report Card","Diary","Memory album","Sports Medal","Kit Box & Packaging","Assessments","Kit Box","Freight Transport"]}]'::jsonb, '#EE2A50', CURRENT_TIMESTAMP),
  ('cat_o01', 'O01', 'Swar Book Hindi', 'MATERIAL', 'Optional – Book', 140, 180, 0, true, 21, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o02', 'O02', 'Vyanjan Book Hindi', 'MATERIAL', 'Optional – Book', 160, 195, 0, true, 22, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o03', 'O03', 'Matra Book Hindi', 'MATERIAL', 'Optional – Book', 135, 190, 0, true, 23, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o04', 'O04', 'Shabda Book Hindi', 'MATERIAL', 'Optional – Book', 140, 195, 0, true, 24, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o05', 'O05', 'Reading book 1', 'MATERIAL', 'Optional – Book', 150, 195, 0, true, 25, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o06', 'O06', 'Reading book 2', 'MATERIAL', 'Optional – Book', 150, 195, 0, true, 26, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o07', 'O07', 'Swar Marathi', 'MATERIAL', 'Optional – Book', 150, 195, 0, true, 27, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o08', 'O08', 'Vyanjan Marathi', 'MATERIAL', 'Optional – Book', 160, 195, 0, true, 28, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o09', 'O09', 'Pattern Book', 'MATERIAL', 'Optional – Book', 160, 195, 0, true, 29, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o10', 'O10', 'Cursive Book', 'MATERIAL', 'Optional – Book', 140, 195, 0, true, 30, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o11', 'O11', 'Practice Notebook - Letters Nursery', 'MATERIAL', 'Optional – Notebook', 55, 90, 0, true, 31, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o12', 'O12', 'Practice Notebook - Numbers Nursery', 'MATERIAL', 'Optional – Notebook', 55, 90, 0, true, 32, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o13', 'O13', 'English Writing LKG Notebook - Book 1', 'MATERIAL', 'Optional – Notebook', 48, 90, 0, true, 33, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o14', 'O14', 'English Writing LKG Notebook - Book 2', 'MATERIAL', 'Optional – Notebook', 44, 90, 0, true, 34, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o15', 'O15', 'My Number Notebook LKG - Book 1', 'MATERIAL', 'Optional – Notebook', 48, 90, 0, true, 35, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o16', 'O16', 'My Number Notebook LKG - Book 2', 'MATERIAL', 'Optional – Notebook', 47, 90, 0, true, 36, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o17', 'O17', 'My Five Line Notebook', 'MATERIAL', 'Optional – Notebook', 25, 90, 0, true, 37, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o18', 'O18', 'Akshar Gyan - Swar (Hindi) Notebook', 'MATERIAL', 'Optional – Notebook', 55, 90, 0, true, 38, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o19', 'O19', 'Akshar Gyan - Vyanjan (Hindi) Notebook', 'MATERIAL', 'Optional – Notebook', 55, 90, 0, true, 39, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o20', 'O20', 'My Phonics Notebook UKG - Book 1', 'MATERIAL', 'Optional – Notebook', 39.6, 90, 0, true, 40, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o21', 'O21', 'My Phonics Notebook UKG - Book 2', 'MATERIAL', 'Optional – Notebook', 40, 90, 0, true, 41, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o22', 'O22', 'My Number Notebook UKG - Book 1', 'MATERIAL', 'Optional – Notebook', 39.6, 90, 0, true, 42, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o23', 'O23', 'My Number Notebook UKG - Book 2', 'MATERIAL', 'Optional – Notebook', 37.4, 90, 0, true, 43, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o24', 'O24', 'Notation Writing Notebook UKG - Book 1', 'MATERIAL', 'Optional – Notebook', 35.2, 90, 0, true, 44, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o25', 'O25', 'Bag', 'MATERIAL', 'Optional – Other', 225, 300, 0, true, 45, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o26', 'O26', 'Diary', 'MATERIAL', 'Optional – Other', 60, 120, 0, true, 46, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o27', 'O27', 'Memory album', 'MATERIAL', 'Optional – Other', 90, 200, 0, true, 47, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o28', 'O28', 'Sports Medal', 'MATERIAL', 'Optional – Other', 30, 40, 0, true, 48, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o29', 'O29', 'Jumbo Crayon box', 'MATERIAL', 'Optional – Other', 55, 65, 0, true, 49, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o30', 'O30', 'Plastic Scissor', 'MATERIAL', 'Optional – Other', 18, 25, 0, true, 50, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o31', 'O31', 'Play Dough', 'MATERIAL', 'Optional – Other', 120, 150, 0, true, 51, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o32', 'O32', 'Conical Crayons', 'MATERIAL', 'Optional – Other', 120, 150, 0, true, 52, NULL, NULL, CURRENT_TIMESTAMP),
  ('cat_o33', 'O33', 'Apron', 'MATERIAL', 'Optional – Other', 100, 120, 0, true, 53, NULL, NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
