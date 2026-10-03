-- Lead sources: Facebook and Instagram are merged into "Social Media" (owner's request, R28).
UPDATE "Lead" SET "source" = 'Social Media' WHERE "source" IN ('Facebook', 'Instagram');
