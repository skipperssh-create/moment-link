-- Add one optional four-photo set. Historical catalog versions and bookings stay untouched.
DO $migration$
DECLARE
  source record;
  next_products jsonb;
  photo_option constant jsonb := '{"id":"paper-frame-photos","name":"종이액자 사진 출력 4개","amount":10000}'::jsonb;
  changed boolean := false;
BEGIN
  -- Catalog publishing takes this same row lock, so an editor cannot be overwritten.
  PERFORM 1 FROM moment_link.config WHERE id='catalog_draft' FOR UPDATE;
  IF EXISTS(SELECT 1 FROM moment_link.migrations WHERE version=9) THEN RETURN; END IF;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM moment_link.catalog_versions) THEN
    RAISE EXCEPTION 'Catalog must be seeded before adding the photo option';
  END IF;

  FOR source IN
    SELECT 'draft' AS kind,version,data AS products FROM moment_link.config WHERE id='catalog_draft'
    UNION ALL
    SELECT 'published',version,products FROM moment_link.catalog_versions
      WHERE version=(SELECT max(version) FROM moment_link.catalog_versions)
  LOOP
    IF (SELECT count(*) FROM jsonb_array_elements(source.products) p,
        LATERAL jsonb_array_elements(p->'packages') pk
        WHERE p->>'id'='visit' AND p->>'category'='visit' AND pk->>'id' IN ('light','all')) <> 2 THEN
      RAISE EXCEPTION 'Expected visit light and all packages';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(source.products) p,
        LATERAL jsonb_array_elements(p->'packages') pk,
        LATERAL jsonb_array_elements(coalesce(pk->'options','[]'::jsonb)) o
        WHERE p->>'id'='visit' AND p->>'category'='visit' AND pk->>'id' IN ('light','all')
          AND o->>'id'='paper-frame-photos' AND o<>photo_option) THEN
      RAISE EXCEPTION 'Photo option already exists with different terms';
    END IF;
    SELECT jsonb_agg(CASE WHEN p->>'id'='visit' AND p->>'category'='visit'
      THEN jsonb_set(p,'{packages}',(
        SELECT jsonb_agg(CASE WHEN pk->>'id' IN ('light','all') AND NOT EXISTS(
          SELECT 1 FROM jsonb_array_elements(coalesce(pk->'options','[]'::jsonb)) o
          WHERE o->>'id'='paper-frame-photos')
          THEN jsonb_set(pk,'{options}',coalesce(pk->'options','[]'::jsonb)||jsonb_build_array(photo_option))
          ELSE pk END ORDER BY package_order)
        FROM jsonb_array_elements(p->'packages') WITH ORDINALITY AS packages(pk,package_order)))
      ELSE p END ORDER BY product_order)
    INTO next_products
    FROM jsonb_array_elements(source.products) WITH ORDINALITY AS products(p,product_order);

    IF next_products IS DISTINCT FROM source.products THEN
      IF source.kind='draft' THEN
        UPDATE moment_link.config SET data=next_products,version=version+1,updated_at=now() WHERE id='catalog_draft';
      ELSE
        INSERT INTO moment_link.catalog_versions(version,products) VALUES(source.version+1,next_products);
      END IF;
      changed := true;
    END IF;
  END LOOP;
  IF changed THEN
    INSERT INTO moment_link.audit_logs(id,action,entity_id,detail)
    VALUES(gen_random_uuid(),'catalog.visit_photos.updated','catalog',jsonb_build_object('migration',9,'option',photo_option));
  END IF;
  INSERT INTO moment_link.migrations(version) VALUES(9);
END
$migration$;
