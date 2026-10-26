-- Golden Star V41: mark Arabic products reviewed even when translation is already correct.
-- Run once in Supabase SQL Editor after V40_RUN_IN_SUPABASE_FIRST.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gs_arabic_review_confirmations (
 product_id bigint PRIMARY KEY REFERENCES public.gs_sales_products(id) ON DELETE CASCADE,
 reviewed_by uuid NOT NULL REFERENCES auth.users(id),
 reviewed_at timestamptz NOT NULL DEFAULT now(),
 reviewed_arabic text NOT NULL
);
REVOKE ALL ON TABLE public.gs_arabic_review_confirmations FROM PUBLIC, anon, authenticated;
ALTER TABLE public.gs_arabic_review_confirmations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.gs_get_arabic_review_status(p_ids bigint[])
RETURNS TABLE(product_id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
 IF NOT public.gs_can_review_arabic() THEN
   RAISE EXCEPTION 'Arabic reviewer access required' USING ERRCODE='42501';
 END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>1000 THEN RAISE EXCEPTION 'Invalid review list'; END IF;
 RETURN QUERY SELECT r.product_id
 FROM public.gs_arabic_review_confirmations r
 JOIN public.gs_sales_products p ON p.id=r.product_id
 JOIN public.gs_arabic_review_scope sc ON sc.product_id=p.id
 WHERE p.id=ANY(p_ids) AND coalesce(p.pick_category,'')<>'SPICES'
 AND r.reviewed_arabic IS NOT DISTINCT FROM p.arabic;
END $$;
REVOKE ALL ON FUNCTION public.gs_get_arabic_review_status(bigint[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gs_get_arabic_review_status(bigint[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.gs_save_arabic_review(p_id bigint,p_arabic text)
RETURNS TABLE(id bigint, arabic text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE old_name text; new_name text := btrim(coalesce(p_arabic,''));
BEGIN
 IF NOT public.gs_can_review_arabic() THEN
   RAISE EXCEPTION 'Arabic reviewer access required' USING ERRCODE='42501';
 END IF;
 IF char_length(new_name)>500 THEN RAISE EXCEPTION 'Arabic name is too long'; END IF;
 IF new_name='' THEN RAISE EXCEPTION 'Please enter an Arabic name'; END IF;
 IF new_name !~ '[ء-ي]' THEN RAISE EXCEPTION 'Arabic writing is required'; END IF;
 SELECT p.arabic INTO old_name FROM public.gs_sales_products p
 WHERE p.id=p_id AND EXISTS(SELECT 1 FROM public.gs_arabic_review_scope sc WHERE sc.product_id=p.id)
 AND coalesce(p.pick_category,'')<>'SPICES' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable for Arabic review'; END IF;
 IF new_name IS DISTINCT FROM old_name THEN
   UPDATE public.gs_sales_products p SET arabic=new_name WHERE p.id=p_id;
   INSERT INTO public.gs_arabic_review_history(product_id,previous_arabic,new_arabic,changed_by)
   VALUES(p_id,old_name,new_name,auth.uid());
 END IF;
 INSERT INTO public.gs_arabic_review_confirmations(product_id,reviewed_by,reviewed_at,reviewed_arabic)
 VALUES(p_id,auth.uid(),now(),new_name)
 ON CONFLICT(product_id) DO UPDATE SET reviewed_by=EXCLUDED.reviewed_by,
 reviewed_at=EXCLUDED.reviewed_at, reviewed_arabic=EXCLUDED.reviewed_arabic;
 RETURN QUERY SELECT p.id,p.arabic FROM public.gs_sales_products p WHERE p.id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.gs_save_arabic_review(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gs_save_arabic_review(bigint,text) TO authenticated;
COMMIT;
