CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.dl_hash(_token text) RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest(convert_to(_token, 'UTF8'), 'sha256'), 'base64')
$$;

CREATE OR REPLACE FUNCTION public.dl_rate(_bucket text, _max int, _minutes int) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT count(*) FROM rate_events WHERE bucket = _bucket AND at >= now() - make_interval(mins => _minutes)) >= _max THEN
    RAISE EXCEPTION 'Too many attempts. Please wait a few minutes and try again.' USING ERRCODE = 'P0429';
  END IF;
  INSERT INTO rate_events(bucket) VALUES (_bucket);
END $$;

CREATE OR REPLACE FUNCTION public.dl_taken_ids(_ids text[], _ip text) RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM dl_rate('check:' || coalesce(_ip, 'unknown'), 120, 5);
  RETURN coalesce((SELECT array_agg(login_id) FROM accounts WHERE login_id = ANY (SELECT lower(x) FROM unnest(_ids[1:20]) x)), '{}');
END $$;

CREATE OR REPLACE FUNCTION public.dl_salt(_id text, _ip text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM dl_rate('salt:' || coalesce(_ip, 'unknown'), 60, 5);
  RETURN (SELECT salt FROM accounts WHERE login_id = lower(_id));
END $$;

CREATE OR REPLACE FUNCTION public.dl_register(_id text, _display text, _token text, _salt text, _iv text, _ct text, _ip text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM dl_rate('reg:' || coalesce(_ip, 'unknown'), 10, 60);
  IF length(_token) < 40 OR length(_salt) > 100 OR length(_iv) > 100 OR length(_ct) > 1000 THEN RAISE EXCEPTION 'invalid input'; END IF;
  INSERT INTO accounts(login_id, display_id, salt, auth_hash, iv, ct)
  VALUES (lower(_id), left(coalesce(nullif(trim(_display), ''), _id), 32), _salt, dl_hash(_token), _iv, _ct);
  RETURN 'ok';
EXCEPTION WHEN unique_violation THEN RETURN 'taken';
END $$;

CREATE OR REPLACE FUNCTION public.dl_login(_id text, _token text, _ip text) RETURNS TABLE(display text, iv text, ct text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM dl_rate('login:' || lower(_id), 10, 15);
  PERFORM dl_rate('loginip:' || coalesce(_ip, 'unknown'), 30, 15);
  RETURN QUERY SELECT a.display_id, a.iv, a.ct FROM accounts a WHERE a.login_id = lower(_id) AND a.auth_hash = dl_hash(_token);
END $$;

CREATE OR REPLACE FUNCTION public.dl_save(_id text, _token text, _iv text, _ct text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE accounts SET iv = _iv, ct = _ct, updated_at = now() WHERE login_id = lower(_id) AND auth_hash = dl_hash(_token);
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.dl_verify(_id text, _token text, _bucket text, _max int, _minutes int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE login_id = lower(_id) AND auth_hash = dl_hash(_token)) THEN RETURN false; END IF;
  PERFORM dl_rate(_bucket || ':' || lower(_id), _max, _minutes);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.dl_rate(text,int,int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dl_taken_ids(text[],text), public.dl_salt(text,text), public.dl_register(text,text,text,text,text,text,text),
  public.dl_login(text,text,text), public.dl_save(text,text,text,text), public.dl_verify(text,text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dl_taken_ids(text[],text), public.dl_salt(text,text), public.dl_register(text,text,text,text,text,text,text),
  public.dl_login(text,text,text), public.dl_save(text,text,text,text), public.dl_verify(text,text,text,int,int) TO anon, authenticated, service_role;