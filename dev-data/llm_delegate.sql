--
-- PostgreSQL database dump
--

\restrict lxrek6L9qI2okvOeThPfvLW3x5aG3EDgXC8A7as8ZerrPD0WxBwnCIOiwKe8Vj2

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg13+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg13+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_username_fkey;
ALTER TABLE IF EXISTS ONLY public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_username_fkey;
ALTER TABLE IF EXISTS ONLY public.request_reservations DROP CONSTRAINT IF EXISTS request_reservations_username_fkey;
ALTER TABLE IF EXISTS ONLY public.recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_username_fkey;
ALTER TABLE IF EXISTS ONLY public.models DROP CONSTRAINT IF EXISTS models_provider_id_fkey;
ALTER TABLE IF EXISTS ONLY public.external_model_targets DROP CONSTRAINT IF EXISTS external_model_targets_v2_model_id_fkey;
ALTER TABLE IF EXISTS ONLY public.external_model_targets DROP CONSTRAINT IF EXISTS external_model_targets_v2_external_model_name_fkey;
DROP INDEX IF EXISTS public.uq_models_provider_upstream;
DROP INDEX IF EXISTS public.idx_wallet_ledger_username;
DROP INDEX IF EXISTS public.idx_user_api_keys_username;
DROP INDEX IF EXISTS public.idx_stats_events_created_at;
DROP INDEX IF EXISTS public.idx_sessions_expires_at;
DROP INDEX IF EXISTS public.idx_request_reservations_username;
DROP INDEX IF EXISTS public.idx_recharge_orders_username;
DROP INDEX IF EXISTS public.idx_recharge_orders_status;
DROP INDEX IF EXISTS public.idx_recent_requests_username;
DROP INDEX IF EXISTS public.idx_recent_requests_created_at;
DROP INDEX IF EXISTS public.idx_external_model_targets_name_priority;
ALTER TABLE IF EXISTS ONLY public.wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_pkey;
ALTER TABLE IF EXISTS ONLY public.users DROP CONSTRAINT IF EXISTS users_pkey;
ALTER TABLE IF EXISTS ONLY public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_pkey;
ALTER TABLE IF EXISTS ONLY public.user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_api_key_key;
ALTER TABLE IF EXISTS ONLY public.stats_events DROP CONSTRAINT IF EXISTS stats_events_request_id_key;
ALTER TABLE IF EXISTS ONLY public.stats_events DROP CONSTRAINT IF EXISTS stats_events_pkey;
ALTER TABLE IF EXISTS ONLY public.sessions DROP CONSTRAINT IF EXISTS sessions_pkey;
ALTER TABLE IF EXISTS ONLY public.request_reservations DROP CONSTRAINT IF EXISTS request_reservations_pkey;
ALTER TABLE IF EXISTS ONLY public.recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_pkey;
ALTER TABLE IF EXISTS ONLY public.recharge_orders DROP CONSTRAINT IF EXISTS recharge_orders_out_trade_no_key;
ALTER TABLE IF EXISTS ONLY public.recent_requests DROP CONSTRAINT IF EXISTS recent_requests_request_id_key;
ALTER TABLE IF EXISTS ONLY public.recent_requests DROP CONSTRAINT IF EXISTS recent_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.providers DROP CONSTRAINT IF EXISTS providers_pkey;
ALTER TABLE IF EXISTS ONLY public.payment_settings DROP CONSTRAINT IF EXISTS payment_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.models DROP CONSTRAINT IF EXISTS models_pkey;
ALTER TABLE IF EXISTS ONLY public.external_models DROP CONSTRAINT IF EXISTS external_models_pkey;
ALTER TABLE IF EXISTS ONLY public.external_model_targets DROP CONSTRAINT IF EXISTS external_model_targets_v2_pkey;
ALTER TABLE IF EXISTS ONLY public.admins DROP CONSTRAINT IF EXISTS admins_pkey;
ALTER TABLE IF EXISTS public.wallet_ledger ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.stats_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.recent_requests ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.wallet_ledger_id_seq;
DROP TABLE IF EXISTS public.wallet_ledger;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.user_api_keys;
DROP SEQUENCE IF EXISTS public.stats_events_id_seq;
DROP TABLE IF EXISTS public.stats_events;
DROP TABLE IF EXISTS public.sessions;
DROP TABLE IF EXISTS public.request_reservations;
DROP TABLE IF EXISTS public.recharge_orders;
DROP SEQUENCE IF EXISTS public.recent_requests_id_seq;
DROP TABLE IF EXISTS public.recent_requests;
DROP TABLE IF EXISTS public.providers;
DROP TABLE IF EXISTS public.payment_settings;
DROP TABLE IF EXISTS public.models;
DROP TABLE IF EXISTS public.external_models;
DROP TABLE IF EXISTS public.external_model_targets;
DROP TABLE IF EXISTS public.admins;
-- *not* dropping schema, since initdb creates it
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admins (
    username text NOT NULL,
    password text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_model_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_model_targets (
    external_model_name text NOT NULL,
    model_id text NOT NULL,
    priority integer DEFAULT 100 NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: external_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_models (
    name text NOT NULL,
    strategy text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.models (
    id text NOT NULL,
    provider_id text NOT NULL,
    upstream_model text NOT NULL,
    upstream_api text NOT NULL,
    pricing_currency text NOT NULL,
    input_per_million_tokens numeric(18,6) NOT NULL,
    output_per_million_tokens numeric(18,6) NOT NULL,
    cached_input_per_million_tokens numeric(18,6) NOT NULL,
    cache_creation_per_million_tokens numeric(18,6) NOT NULL,
    image_per_unit numeric(18,6) NOT NULL,
    request_flat_fee numeric(18,6) NOT NULL,
    connectivity_status text NOT NULL,
    connectivity_tested_at timestamp with time zone,
    connectivity_message text NOT NULL,
    connectivity_status_code integer NOT NULL,
    connectivity_latency_ms integer NOT NULL
);


--
-- Name: payment_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_settings (
    id text NOT NULL,
    enabled boolean NOT NULL,
    mode text NOT NULL,
    qr_image_path text NOT NULL,
    app_id text NOT NULL,
    private_key text NOT NULL,
    private_key_path text NOT NULL,
    alipay_public_key text NOT NULL,
    alipay_public_key_path text NOT NULL,
    gateway text NOT NULL,
    public_base_url text NOT NULL,
    key_type text NOT NULL,
    min_recharge_usd numeric(18,6) NOT NULL,
    cny_per_usd numeric(18,6) NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.providers (
    id text NOT NULL,
    api_base_url text NOT NULL,
    api_key text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recent_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recent_requests (
    id bigint NOT NULL,
    request_id uuid NOT NULL,
    username text NOT NULL,
    provider_id text NOT NULL,
    provider_name text NOT NULL,
    model_id text NOT NULL,
    model_name text NOT NULL,
    success boolean NOT NULL,
    input_tokens bigint NOT NULL,
    output_tokens bigint NOT NULL,
    cache_read_tokens bigint NOT NULL,
    cache_creation_tokens bigint NOT NULL,
    total_cost numeric(18,6) NOT NULL,
    currency text NOT NULL,
    latency_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: recent_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.recent_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: recent_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.recent_requests_id_seq OWNED BY public.recent_requests.id;


--
-- Name: recharge_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recharge_orders (
    id uuid NOT NULL,
    username text NOT NULL,
    out_trade_no text NOT NULL,
    payment_method text NOT NULL,
    status text NOT NULL,
    amount_usd numeric(18,6) NOT NULL,
    amount_cny numeric(18,2) NOT NULL,
    cny_per_usd numeric(18,6) NOT NULL,
    subject text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    paid_at timestamp with time zone,
    trade_no text NOT NULL,
    buyer_logon_id text NOT NULL,
    trade_status text NOT NULL,
    customer_note text NOT NULL,
    reviewed_by text NOT NULL,
    reviewed_at timestamp with time zone,
    review_note text NOT NULL,
    failure_reason text NOT NULL
);


--
-- Name: request_reservations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_reservations (
    request_id uuid NOT NULL,
    username text NOT NULL,
    route_id text,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    reserved_amount_usd numeric(18,6) NOT NULL,
    actual_amount_usd numeric(18,6),
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    token text NOT NULL,
    username text NOT NULL,
    role text NOT NULL,
    expires_at timestamp with time zone NOT NULL
);


--
-- Name: stats_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stats_events (
    id bigint NOT NULL,
    request_id uuid NOT NULL,
    username text,
    provider_id text NOT NULL,
    model_id text NOT NULL,
    success boolean NOT NULL,
    input_tokens bigint NOT NULL,
    output_tokens bigint NOT NULL,
    cache_read_tokens bigint NOT NULL,
    cache_creation_tokens bigint NOT NULL,
    total_cost numeric(18,6) NOT NULL,
    currency text NOT NULL,
    latency_ms integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: stats_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stats_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stats_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stats_events_id_seq OWNED BY public.stats_events.id;


--
-- Name: user_api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_api_keys (
    id uuid NOT NULL,
    username text NOT NULL,
    name text NOT NULL,
    api_key text NOT NULL,
    created_at timestamp with time zone NOT NULL,
    last_used_at timestamp with time zone
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    username text NOT NULL,
    password text NOT NULL,
    balance_usd numeric(18,6) DEFAULT 0 NOT NULL,
    total_recharged_usd numeric(18,6) DEFAULT 0 NOT NULL,
    total_spent_usd numeric(18,6) DEFAULT 0 NOT NULL,
    last_recharged_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wallet_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wallet_ledger (
    id bigint NOT NULL,
    username text NOT NULL,
    request_id uuid,
    entry_type text NOT NULL,
    amount_usd numeric(18,6) NOT NULL,
    balance_after_usd numeric(18,6) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.wallet_ledger_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.wallet_ledger_id_seq OWNED BY public.wallet_ledger.id;


--
-- Name: recent_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recent_requests ALTER COLUMN id SET DEFAULT nextval('public.recent_requests_id_seq'::regclass);


--
-- Name: stats_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_events ALTER COLUMN id SET DEFAULT nextval('public.stats_events_id_seq'::regclass);


--
-- Name: wallet_ledger id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger ALTER COLUMN id SET DEFAULT nextval('public.wallet_ledger_id_seq'::regclass);


--
-- Data for Name: admins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admins (username, password, updated_at) FROM stdin;
fengyizhou	12345678	2026-03-21 13:26:58.070936+00
liuzhenyu	Lzy_08032211	2026-03-21 13:26:58.072728+00
\.


--
-- Data for Name: external_model_targets; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.external_model_targets (external_model_name, model_id, priority, weight, enabled, updated_at) FROM stdin;
\.


--
-- Data for Name: external_models; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.external_models (name, strategy, updated_at) FROM stdin;
\.


--
-- Data for Name: models; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.models (id, provider_id, upstream_model, upstream_api, pricing_currency, input_per_million_tokens, output_per_million_tokens, cached_input_per_million_tokens, cache_creation_per_million_tokens, image_per_unit, request_flat_fee, connectivity_status, connectivity_tested_at, connectivity_message, connectivity_status_code, connectivity_latency_ms) FROM stdin;
minimax-openai--minimax-m2-7-highspeed	MiniMax-OpenAI	MiniMax-M2.7-highspeed	chat_completions	USD	0.150000	0.600000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:39.63+00	<think> The user says: "Reply with exactly OK". They want the assistant to reply with exactly "OK". There's no disallowed content. So we must obey. The user wants exactly "OK". Likely uppercase O K. We should respond with just "OK". No extra spaces or punctuation? The user says "Reply with exactly OK". So the answer should be exactly "OK". No trailing spaces, no newline maybe. So respond exactly "...	200	3137
n1n-openai-anthropic--claude-opus-4-6	n1n-OpenAI-Anthropic	claude-opus-4-6	messages	USD	2.500000	12.499998	0.000000	0.000000	0.000000	0.000000	unknown	\N		0	0
n1n-openai-anthropic--claude-sonnet-4-6	n1n-OpenAI-Anthropic	claude-sonnet-4-6	messages	USD	1.500000	7.499999	0.000000	0.000000	0.000000	0.000000	unknown	\N		0	0
n1n-openai-anthropic--gpt-5-4	n1n-OpenAI-Anthropic	gpt-5.4	responses	USD	1.250000	7.499999	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:42.777+00	OK	200	2866
n1n-openai-anthropic--gpt-5-4-mini	n1n-OpenAI-Anthropic	gpt-5.4-mini	responses	USD	0.375000	2.250000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:44.811+00	OK	200	1663
n1n-openai-anthropic--gpt-5-4-nano	n1n-OpenAI-Anthropic	gpt-5.4-nano	responses	USD	0.100000	0.600000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:13:04.882+00	OK	200	2867
packycode-anthropic--claude-opus-4-6	PackyCode-Anthropic	claude-opus-4-6	messages	USD	2.500000	12.499998	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:49.134+00	OK	200	2355
packycode-anthropic--claude-sonnet-4-6	PackyCode-Anthropic	claude-sonnet-4-6	messages	USD	1.500000	7.499999	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:50.88+00	OK	200	1685
packycode-openai--gpt-5-4	PackyCode-OpenAI	gpt-5.4	responses	USD	1.250000	7.500000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:52.724+00	OK	200	1611
packycode-openai--gpt-5-4-mini	PackyCode-OpenAI	gpt-5.4-mini	responses	USD	0.375000	2.250000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:53.663+00	OK	200	840
yescode-anthropic--claude-opus-4-6	YesCode-Anthropic	claude-opus-4-6	messages	USD	2.500000	12.500000	0.000000	0.000000	0.000000	0.000000	failed	2026-03-22 16:01:54.287+00	{"error":{"message":"All providers unavailable","type":"provider_error"},"type":"error"}	503	529
yescode-anthropic--claude-sonnet-4-6	YesCode-Anthropic	claude-sonnet-4-6	messages	USD	1.500000	7.500000	0.000000	0.000000	0.000000	0.000000	failed	2026-03-22 16:01:54.66+00	{"error":{"message":"All providers unavailable","type":"provider_error"},"type":"error"}	503	283
yescode-openai--gpt-5-4	YesCode-OpenAI	gpt-5.4	responses	USD	1.250000	7.500000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:55.944+00	OK	200	1197
yescode-openai--gpt-5-4-mini	YesCode-OpenAI	gpt-5.4-mini	responses	USD	0.375000	2.250000	0.000000	0.000000	0.000000	0.000000	ok	2026-03-22 16:01:57.907+00	OK	200	1886
\.


--
-- Data for Name: payment_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.payment_settings (id, enabled, mode, qr_image_path, app_id, private_key, private_key_path, alipay_public_key, alipay_public_key_path, gateway, public_base_url, key_type, min_recharge_usd, cny_per_usd, updated_at) FROM stdin;
alipay	t	manual_qr	/assets/images/alipay-receive-qr.jpg						https://openapi.alipay.com/gateway.do		PKCS8	1.000000	7.000000	2026-03-21 13:26:58.085919+00
\.


--
-- Data for Name: providers; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.providers (id, api_base_url, api_key, updated_at) FROM stdin;
MiniMax-OpenAI	https://api.minimaxi.com/v1	sk-cp-bs1NCIHxNB-YDvNTyTURx8JpGWB-vtEnHHL8lsP3p9LOOqlsJqhAr3fnh67_84LPGmPE-0wREfdD-It5ClojR64q-sF3R66zaENQY0lmezta59U37WssH8g	2026-03-22 16:13:04.894738+00
n1n-Gemini	https://api.n1n.ai/v1	sk-CMXtT0Nd57MHmsqzYN0CSRfW4oLRmt1booNmb4gCYW4pHJfO	2026-03-22 16:13:04.894738+00
n1n-OpenAI-Anthropic	https://api.n1n.ai/v1	sk-KIOiCDP7M7uyhaH0ZP6iHBSaUyChf6y6WYf2xJRfLysYUVvW	2026-03-22 16:13:04.894738+00
PackyCode-Anthropic	https://api-slb.packyapi.com/v1	sk-DYvtoZ2sZue5bCSdus4KYnrxKfhpHTXCRJpfsDdlQc20ZHEw	2026-03-22 16:13:04.894738+00
PackyCode-Google	https://api-slb.packyapi.com/v1	sk-O8vrxyKoD9HZ8IU6vC4oGl2kDHkvKijqvk3Ob6kFfLMqfxJp	2026-03-22 16:13:04.894738+00
PackyCode-OpenAI	https://codex-api-slb.packycode.com/v1	sk-BC5oKmV326ECiFY0i12lxVCbw8dm1DZC	2026-03-22 16:13:04.894738+00
YesCode-Anthropic	https://co-cdn.yes.vg/v1	cr_127ca79d4aea5ee9922163f59341d33bf5d0079176d772a2b7b905f70bb32c43	2026-03-22 16:13:04.894738+00
YesCode-Google	https://co-cdn.yes.vg/v1beta	cr_127ca79d4aea5ee9922163f59341d33bf5d0079176d772a2b7b905f70bb32c43	2026-03-22 16:13:04.894738+00
YesCode-OpenAI	https://co-cdn.yes.vg/v1	cr_127ca79d4aea5ee9922163f59341d33bf5d0079176d772a2b7b905f70bb32c43	2026-03-22 16:13:04.894738+00
\.


--
-- Data for Name: recent_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recent_requests (id, request_id, username, provider_id, provider_name, model_id, model_name, success, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost, currency, latency_ms, created_at) FROM stdin;
1	a5bf8965-9e9b-409e-9efd-331f3f1b97dd	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	2248	2026-03-21 13:19:11.326371+00
2	52eeb3d5-d15a-42fd-8f79-8a001cc0aa63	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1585	2026-03-21 13:19:36.951573+00
3	2c1ce40f-0c0e-45be-9c6e-a77a509094d6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	2029	2026-03-21 13:19:37.401517+00
4	bf4235ec-5d8c-4ceb-8659-f6cd4a5f4782	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1262	2026-03-21 13:19:38.237162+00
5	488701be-7a3a-42c9-b3ce-1033f8727a85	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	765	2026-03-21 13:19:39.021449+00
6	6537a5e5-d00a-4d30-b283-655ce6ed9eb6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1682	2026-03-21 13:19:39.130555+00
7	6efad8d5-2498-4de0-bdfa-c093a220b385	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-mini-X0.5	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	943	2026-03-21 13:19:39.984466+00
8	39bd446b-66bc-41a4-93c2-fe1d6605542c	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	20324	189	0	0	0.026822	USD	1801	2026-03-22 08:06:06.1697+00
9	f7d88595-7d1f-488a-ad68-25f41f6cf81a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	20699	187	0	0	0.027276	USD	1308	2026-03-22 08:06:14.408799+00
10	0933cac9-cd72-4a8c-8a3b-585c621fd878	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	24411	147	0	0	0.031616	USD	965	2026-03-22 08:06:19.740075+00
11	53bbf3d2-714f-4be9-a3e7-151fb57d5d5e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	28408	633	0	0	0.040258	USD	824	2026-03-22 08:06:34.102573+00
12	099e6ae3-718b-40cc-8f39-0923f6d927f6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	29051	685	0	0	0.041451	USD	3003	2026-03-22 08:07:57.955938+00
13	422e219a-7151-4b50-942e-e05598b6920b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	29752	676	0	0	0.042260	USD	1886	2026-03-22 08:09:33.035418+00
14	deb63a47-a112-46e4-bb9f-3cb888bf3c19	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	1572	119	0	0	0.002858	USD	1008	2026-03-22 08:14:00.60476+00
15	63a1d53e-9378-4033-88cc-f15f751684cd	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	16684	147	0	0	0.021958	USD	1691	2026-03-22 08:14:02.356323+00
16	22db9b8e-8b67-442f-be58-d19ecc7f2cdb	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	11478	388	0	0	0.017258	USD	1196	2026-03-22 08:14:11.944463+00
17	06390367-942a-4a90-a32e-1f660064c099	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	14673	214	0	0	0.019946	USD	876	2026-03-22 08:14:20.846667+00
18	8d9a3b6c-b416-4387-a6d2-f9c7ba0fb35e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	15105	214	0	0	0.020486	USD	997	2026-03-22 08:14:26.603324+00
19	f6cfcd77-7487-4f21-9313-cd896b71d38f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	16692	110	0	0	0.021690	USD	1932	2026-03-22 10:52:50.020814+00
20	f8dfe9f4-f26f-470b-a9c8-c7411da08c10	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	1580	117	0	0	0.002853	USD	1856	2026-03-22 10:52:50.229384+00
21	003b97db-2a35-4ff6-8506-5118ac4ca976	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	11441	174	0	0	0.015606	USD	1060	2026-03-22 10:52:56.423301+00
22	760e7c42-63f6-449f-b6b9-06ee76be9e57	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	16723	245	0	0	0.022741	USD	946	2026-03-22 10:53:03.813618+00
23	1bcfb91d-4b12-42d9-9ea3-da692d4142eb	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	17186	261	0	0	0.023440	USD	877	2026-03-22 10:53:10.469223+00
24	a3cd30aa-ce47-4fc4-9fb8-29268b46ec28	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	27938	274	0	0	0.036978	USD	894	2026-03-22 10:53:17.385054+00
25	fdc6bcab-ef1f-4d33-9caf-4479d5f51c84	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	30770	218	0	0	0.040097	USD	863	2026-03-22 10:53:27.762208+00
26	c477479d-554a-4ffb-88ae-dcbb7c812bce	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	31080	60	0	0	0.039300	USD	935	2026-03-22 10:53:32.880849+00
27	3f94a86e-4602-4fb7-8a3b-cc679532d219	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	34465	1243	0	0	0.052404	USD	896	2026-03-22 10:53:59.425531+00
28	6ef27088-47c6-42f5-adf0-6f4a0324c3a9	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	18112	587	0	0	0.027043	USD	1118	2026-03-22 10:54:14.317515+00
29	2a22e866-e139-4379-b511-4f21465f759a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	18738	15	0	0	0.023535	USD	4836	2026-03-22 10:55:37.026611+00
30	0a4d3016-4418-48b1-8bc0-e3dd51796d14	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	19871	224	0	0	0.026519	USD	1004	2026-03-22 10:55:43.460909+00
31	49ca9356-9c36-47cc-b3d7-0a3c57554fbe	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	11432	202	11264	0	0.001725	USD	824	2026-03-22 10:55:48.647186+00
32	7ecab08c-12c6-41b6-af24-f2212993593d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	12479	403	0	0	0.018621	USD	2915	2026-03-22 10:55:59.808919+00
33	56a09b2c-7497-4f27-812b-72f24e88bdf3	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	13567	403	0	0	0.019981	USD	736	2026-03-22 10:56:08.755319+00
34	22713021-99f1-4996-9290-95db6f920fbf	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	31071	232	0	0	0.040579	USD	1278	2026-03-22 10:56:15.613157+00
35	5374248b-535d-49ff-8a89-da71652a8308	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	37336	929	0	0	0.053638	USD	1081	2026-03-22 10:56:34.935158+00
36	999bffec-8580-4dab-970f-0a6cc46ba869	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	21188	116	0	0	0.027355	USD	2389	2026-03-22 10:56:41.435264+00
37	be3a315a-4389-46fb-86d5-dff59befaf85	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	11447	217	0	0	0.015936	USD	817	2026-03-22 10:56:47.251563+00
38	10a3b427-62d0-44ec-a680-0886185fe75f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	14828	463	0	0	0.022007	USD	1698	2026-03-22 10:56:58.258927+00
39	524596d0-f290-494b-8523-0a868ab60959	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	16023	463	0	0	0.023501	USD	889	2026-03-22 10:57:08.616782+00
40	e08126b0-d2be-4707-82d1-a8e2309fd52b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	27614	436	0	0	0.037788	USD	1247	2026-03-22 10:57:19.942168+00
41	ddb2a918-1d1a-462a-a15b-d6d5998da141	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	35717	129	0	0	0.045614	USD	5403	2026-03-22 10:57:29.189896+00
42	8b44b751-fd47-4c99-b9e2-cbc54769b06b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	35909	237	0	0	0.046664	USD	2471	2026-03-22 10:57:37.318254+00
43	17311c8c-bf25-455a-bc41-4afc9f7d6129	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	52215	1224	0	0	0.074449	USD	1633	2026-03-22 10:58:02.537388+00
44	6911efd4-2ef0-4278-b089-3568cd5efeeb	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	22599	232	0	0	0.029989	USD	3347	2026-03-22 10:58:11.539411+00
45	1347ddc2-0daa-41c6-9bc4-e5e2d62f1674	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	23248	186	0	0	0.030455	USD	837	2026-03-22 10:58:19.210062+00
46	c027fe6d-456a-4cdd-b531-dd26788b078e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	32545	170	0	0	0.041956	USD	921	2026-03-22 10:58:28.642889+00
47	33930696-cbf0-4383-95d1-ded51e4e0050	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	11501	173	0	0	0.015674	USD	812	2026-03-22 10:58:33.406211+00
49	44306099-3ad5-4b9a-bf02-deb0fc1d50b6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	16341	428	0	0	0.023636	USD	807	2026-03-22 10:58:53.433125+00
48	220b912c-9ed9-4885-a94f-0dfd5bbe6372	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	15166	400	0	0	0.021958	USD	816	2026-03-22 10:58:43.918004+00
50	962f6559-0a85-41c6-9e4c-eefaa0906092	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	30905	85	0	0	0.039269	USD	1769	2026-03-22 11:07:28.476975+00
51	542ba10a-ad8f-4a55-b547-60999e716b13	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	31030	46	0	0	0.039132	USD	952	2026-03-22 11:07:31.451871+00
52	670819c5-627b-4c3d-a248-2abbe6ef47b6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	32538	48	0	0	0.041032	USD	2280	2026-03-22 11:07:40.284559+00
53	7abe3828-4944-4bd5-9ab5-87a28083970e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	33267	50	0	0	0.041959	USD	894	2026-03-22 11:07:45.264068+00
54	04be6b9b-8f54-4def-bea3-b0f3eefa145a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	33348	43	0	0	0.042008	USD	1208	2026-03-22 11:07:48.194833+00
55	8c66cee8-5405-4f90-b345-9b4967d26aef	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	33396	55	0	0	0.042158	USD	2648	2026-03-22 11:07:59.966907+00
56	39a95170-d0d0-4d49-9b40-eecf80fbc616	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	33474	85	0	0	0.042480	USD	1773	2026-03-22 11:08:18.600783+00
57	952d2f06-2adf-490d-99c8-764489124eba	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	33599	2190	0	0	0.058424	USD	866	2026-03-22 11:09:01.03016+00
58	9cc173e0-1e71-40b7-bed4-6d9418a3aad2	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	35817	47	0	0	0.045124	USD	1187	2026-03-22 11:09:05.918813+00
59	62ec2098-1397-48a4-bb6b-c46a3289670b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	35915	535	0	0	0.048906	USD	1282	2026-03-22 11:09:24.389256+00
60	5e292c7c-3c05-4d3d-9eb4-b5113b8715d6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	36472	288	0	0	0.047750	USD	2594	2026-03-22 11:10:45.182256+00
61	a0edc0ed-8ab6-4caf-af6b-2b8ec3489ba8	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	36778	490	0	0	0.049647	USD	2229	2026-03-22 11:16:37.641522+00
62	27216cd0-cbe6-4641-9fa9-ad4a73fc4618	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	37296	635	0	0	0.051383	USD	2499	2026-03-22 11:18:16.359925+00
63	5c4f9af2-a7a0-4f59-b6d8-06f5d9f501ce	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	37964	98	0	0	0.048190	USD	1827	2026-03-22 11:21:46.997584+00
64	5287393f-ac49-43b9-a339-be5a3dce8510	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	38102	2669	0	0	0.067645	USD	1551	2026-03-22 11:22:41.04413+00
65	68f560ac-308c-4ab2-a64b-3b4905dcb60d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	40800	98	0	0	0.051735	USD	1093	2026-03-22 11:22:50.54984+00
66	26df72d5-d90b-4de4-bfc1-eb34fc833d2f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	40938	301	0	0	0.053430	USD	1170	2026-03-22 11:22:58.681314+00
67	34eb031b-547f-483c-be87-f833331b4d15	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	41258	141	0	0	0.052630	USD	1826	2026-03-22 11:23:43.820717+00
68	2500f66a-d1f9-49db-b135-670b41920dac	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	41439	282	35712	0	0.009274	USD	1294	2026-03-22 11:23:52.787269+00
69	b9545312-6b4a-4597-8823-96a419044915	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	43278	222	0	0	0.055762	USD	11737	2026-03-22 11:24:10.116042+00
70	20c78a62-029b-4da0-9524-f37443bf0a60	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	57407	109	0	0	0.072576	USD	2103	2026-03-22 11:24:15.928711+00
71	dc76ad68-cc8b-4696-b5fd-e0a4b0ee3c81	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	59056	44	0	0	0.074150	USD	2411	2026-03-22 11:24:20.776233+00
72	f0ce9bdd-67d4-4c08-bab1-8de70035a7c7	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	70255	46	0	0	0.088164	USD	1655	2026-03-22 11:24:26.093831+00
73	b5a4365a-af7b-4d35-b395-19399dc14027	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	73512	45	0	0	0.092228	USD	2457	2026-03-22 11:24:31.417176+00
74	6da12a0e-8450-490c-8ba2-e928f3dd7961	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	73829	48	0	0	0.092646	USD	3080	2026-03-22 11:24:37.411398+00
75	dffe8cdb-d64c-4330-9dc7-ca67a78af3b7	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	75404	47	0	0	0.094608	USD	2647	2026-03-22 11:24:42.912125+00
76	2df96eea-0317-4c75-a53a-ba1b62aba16d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	75978	45	0	0	0.095310	USD	10155	2026-03-22 11:24:55.681109+00
77	c4d12919-cc68-4652-b6d8-494d085795e0	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	79945	45	0	0	0.100269	USD	2422	2026-03-22 11:25:00.813752+00
78	36a6485a-e0ad-40bb-986c-c54ae4244ce5	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	82367	45	0	0	0.103296	USD	3124	2026-03-22 11:25:06.331536+00
79	97dad0b2-208d-4f14-8d42-ba378c180f88	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	85060	45	0	0	0.106663	USD	2434	2026-03-22 11:25:11.609865+00
80	1a3cde29-0dc7-4e03-96d8-00f5d88ec9ad	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	85409	42	37120	0	0.060676	USD	2681	2026-03-22 11:25:16.829916+00
81	91fa533d-9e26-4df5-9c2b-38c1f3378f0e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	87559	814	0	0	0.115554	USD	16316	2026-03-22 11:25:51.251371+00
82	3f67fe99-2a5d-4ab8-b766-c6d399477a41	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	88408	764	0	0	0.116240	USD	2315	2026-03-22 11:26:14.818469+00
83	9e576330-8976-4973-b9f7-886427a6236a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89208	105	0	0	0.112297	USD	13873	2026-03-22 11:26:36.978905+00
84	f4131e55-860f-4ea0-9cc3-16787d97559e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89348	98	0	0	0.112420	USD	2259	2026-03-22 11:26:43.86349+00
85	3994023b-3e57-4092-bc2b-f1bb74269c42	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89481	77	0	0	0.112429	USD	2768	2026-03-22 11:26:56.349057+00
86	a5e25277-a2c2-44ff-94a9-a8f15742c610	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89593	78	0	0	0.112576	USD	3151	2026-03-22 11:27:05.971046+00
87	b71dd86c-81af-4aad-8464-eb1d70053599	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89701	214	0	0	0.113731	USD	4103	2026-03-22 11:27:17.003399+00
88	fdcda1bc-1399-4515-b8f7-68b40e0dc938	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89949	176	0	0	0.113756	USD	2674	2026-03-22 11:27:25.953428+00
89	39df9621-2d8f-4251-bb11-85bd7a5e45dc	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90159	80	0	0	0.113299	USD	2450	2026-03-22 11:27:33.135333+00
90	39e0fbb8-204e-40c3-b7e1-a8e887125c59	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90273	76	0	0	0.113411	USD	2405	2026-03-22 11:27:40.002848+00
91	8c29cbeb-b8c6-4bb5-acf8-d034018d1d7f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90554	290	0	0	0.115367	USD	1682	2026-03-22 11:27:49.918107+00
92	8d133223-217d-4aba-88ad-0fbb86bae6f0	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90878	80	0	0	0.114198	USD	1307	2026-03-22 11:27:55.569396+00
93	52046763-f29d-4d5a-bc62-7bf245801f38	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90992	604	0	0	0.118270	USD	8907	2026-03-22 11:28:18.711284+00
94	50cac2a7-7aca-4716-9bea-c29548cac6dd	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	91630	225	0	0	0.116225	USD	2090	2026-03-22 11:28:28.808169+00
95	059e7441-3514-4d5a-80b8-eccabeedb81a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	91889	141	82304	0	0.013039	USD	1143	2026-03-22 11:28:34.659758+00
96	3de69273-741a-48dc-9b62-07e932a985e8	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	78919	7476	0	0	0.154719	USD	2236	2026-03-22 11:31:01.371273+00
97	d16c2a82-635d-4d49-90de-37fc8e5e2beb	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	29512	141	0	0	0.037948	USD	1110	2026-03-22 11:31:06.047832+00
98	7c4f57ea-d1af-40ae-a5b4-ce118e023d00	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	30057	148	0	0	0.038681	USD	8978	2026-03-22 11:31:20.487711+00
99	2bba5fa1-510a-41df-af8a-66c02d6ce726	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	45163	11166	0	0	0.140199	USD	1396	2026-03-22 11:34:45.411614+00
100	1e583e9a-8df9-424c-8ac6-39cb306275bf	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	56363	192	0	0	0.071894	USD	1751	2026-03-22 11:34:53.790315+00
101	634ad4ec-b716-4e66-9b9b-de07e37e5eb1	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	56588	124	56192	0	0.001425	USD	1764	2026-03-22 11:34:58.364643+00
102	adba772f-b384-40fe-ae71-e1284e0830df	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	56745	745	0	0	0.076519	USD	2075	2026-03-22 11:35:18.992919+00
103	60ef8bc0-2c7f-46ac-8963-aff561b7fb30	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	57523	631	0	0	0.076636	USD	1675	2026-03-22 11:35:34.731485+00
104	013b062b-240d-4766-a1d3-70d8fb66187b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58187	204	0	0	0.074264	USD	1049	2026-03-22 11:35:42.186492+00
105	618f61d1-1e43-43f9-8499-ca1e147863fe	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58424	129	57344	0	0.002318	USD	2206	2026-03-22 11:35:49.730695+00
106	c53b255d-cb13-4401-9aab-36c67d400987	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58757	953	30080	0	0.042994	USD	1092	2026-03-22 11:36:10.165488+00
107	c310f31b-32b2-43b9-910e-bf231394ba97	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	59743	4016	0	0	0.104799	USD	1140	2026-03-22 11:37:27.710557+00
108	36ec1ef2-561d-4679-b65f-9170d7353e2d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	63793	187	0	0	0.081144	USD	1205	2026-03-22 11:37:41.27113+00
109	df9c85b9-6840-4196-b61d-7804cd0db4ce	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	79669	451	0	0	0.102969	USD	1582	2026-03-22 11:37:52.952298+00
110	edb4c7f5-f07b-4efa-95be-2b27db13bfe7	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	80153	273	0	0	0.102239	USD	1015	2026-03-22 11:38:02.447366+00
111	1dac869f-9726-4238-b2db-17f02057e0a6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	80458	335	0	0	0.103085	USD	2123	2026-03-22 11:38:21.35883+00
112	38b9cdb9-dd93-43fb-90d4-f1daacba2ec5	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	80826	139	0	0	0.102075	USD	3153	2026-03-22 11:38:42.555106+00
113	3b1a0b74-bdba-4293-9fd2-e7a32c60578b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	81551	158	0	0	0.103124	USD	1077	2026-03-22 11:38:49.258057+00
114	b3289725-490c-4bb0-9062-f4baaed67552	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	81742	241	0	0	0.103985	USD	991	2026-03-22 11:39:05.466143+00
115	7ff92fc4-b42e-4e19-8844-a875ccca3993	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	82016	573	0	0	0.106817	USD	991	2026-03-22 11:39:19.695088+00
116	f11e0375-2839-4ab8-8904-9336b6b85490	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	82622	331	0	0	0.105760	USD	1184	2026-03-22 11:39:31.18203+00
117	99109daf-cc13-4a49-9f72-20cd90b49c51	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	82986	249	0	0	0.105600	USD	1042	2026-03-22 11:39:43.840831+00
118	f5658d02-6db2-4b71-bf6d-f72835e03cdf	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	83268	169	0	0	0.105353	USD	2713	2026-03-22 11:39:54.620978+00
119	87ba6b2d-b3f0-421b-a077-7d847c379131	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	83470	210	0	0	0.105912	USD	1181	2026-03-22 11:40:03.657188+00
120	391a1faa-199b-48e0-9b0d-3f996ba22dbb	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	83713	91	0	0	0.105324	USD	1565	2026-03-22 11:40:11.127453+00
121	7f9b2f2c-3ae6-4806-8d51-beee76adebe5	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	83837	91	0	0	0.105479	USD	1940	2026-03-22 11:40:18.825599+00
122	5932051d-d1c3-4dd6-971a-c63ab4060802	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	83961	115	81792	0	0.003574	USD	1476	2026-03-22 11:40:27.281431+00
123	de9649aa-2ff1-4612-b1b8-15b33ab37de3	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	84370	112	0	0	0.106302	USD	1918	2026-03-22 11:40:37.276593+00
124	25b32490-9e45-4c5e-809d-6320a24e370d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	84522	100	0	0	0.106402	USD	1081	2026-03-22 11:40:41.942151+00
125	13307cfa-8e50-42d0-b6af-feb531c3cdef	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	110093	457	0	0	0.141044	USD	1228	2026-03-22 11:40:55.318044+00
126	2a0e1fba-49d9-4d77-b9c9-222571eaa7d2	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	110580	1696	58240	0	0.078145	USD	1223	2026-03-22 11:41:29.652346+00
127	c71be044-9a01-4cf5-8eda-173509c6440a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	99161	10427	0	0	0.202154	USD	1953	2026-03-22 11:44:44.591962+00
128	c1c1d5db-4076-4710-bc58-99ca227c385b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	37823	45	0	0	0.047616	USD	1435	2026-03-22 11:44:52.998725+00
129	2080dbe2-0a27-4776-bfd5-a145b06a769d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	38279	45	0	0	0.048186	USD	1686	2026-03-22 11:44:57.195334+00
130	381c0fa0-d522-4ef3-af9c-c479050b721e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58312	270	0	0	0.074915	USD	1731	2026-03-22 11:45:06.963859+00
131	477a2d4b-cac3-4005-93ef-1e3504120a7e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58614	162	0	0	0.074482	USD	1843	2026-03-22 11:45:16.309187+00
132	b2d6c0b5-065e-44a7-80c9-025c3d207b3d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	58808	282	0	0	0.075625	USD	1325	2026-03-22 11:45:25.610729+00
133	d86d9358-0efc-469b-bc9e-6b74c9eea809	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	59122	699	0	0	0.079145	USD	2385	2026-03-22 11:45:45.910785+00
134	27cb7a24-36eb-403d-8bd5-918edc8d8ed6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	59853	599	0	0	0.079309	USD	2688	2026-03-22 11:46:02.534188+00
135	889a6791-a026-4dfe-9617-95150652869e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	60484	249	0	0	0.077472	USD	1944	2026-03-22 11:46:15.286865+00
136	6411b0ea-9fed-49e2-92b6-23c9c0a2b6e5	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	60765	370	0	0	0.078731	USD	1631	2026-03-22 11:46:29.211927+00
137	4c6dfb7d-c72c-46b7-9f07-b8a6f69873a5	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	61167	2886	0	0	0.098104	USD	2762	2026-03-22 11:47:26.786121+00
138	a3266452-fcaa-4fac-a589-0a7e715c5269	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	64241	442	16000	0	0.063616	USD	2376	2026-03-22 11:47:41.487508+00
139	994689b3-f5b9-4143-9fb7-0a8a34f8967a	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	64715	122	0	0	0.081809	USD	2535	2026-03-22 11:47:50.964711+00
140	0dbcbf5c-27cd-42fb-9cc3-320a2ae0a758	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	64869	160	16000	0	0.062286	USD	2039	2026-03-22 11:47:58.52845+00
141	61763f42-9eee-46f6-89f2-2261ecc17e68	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	65089	97	0	0	0.082089	USD	1835	2026-03-22 11:48:03.731665+00
142	b4438999-7273-4537-96c9-15c2593210c8	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	65402	45	0	0	0.082090	USD	2406	2026-03-22 11:48:10.177208+00
143	61cdd6aa-955a-40df-8938-4fadc1297068	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	66492	97	0	0	0.083843	USD	2013	2026-03-22 11:48:17.210874+00
144	4b49cb09-1159-4af7-a8b7-f524fe9eeaaa	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	66650	45	0	0	0.083650	USD	2251	2026-03-22 11:48:25.442364+00
145	d2cebb9d-f0b8-4786-9e75-1016e90539cf	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	68111	179	0	0	0.086481	USD	983	2026-03-22 11:48:34.476217+00
146	86980587-c158-428d-94a7-435689920628	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	68322	876	0	0	0.091972	USD	1130	2026-03-22 11:48:54.888613+00
148	d8e79474-ccde-4e1b-b4dd-50d632fb02c6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	69553	117	0	0	0.087819	USD	3335	2026-03-22 11:49:10.03235+00
149	b91c0cb1-883b-4502-a527-4a48fc8ae118	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	69702	939	0	0	0.094170	USD	1936	2026-03-22 11:49:31.681637+00
152	9b5ef436-eb8d-490d-bb0d-b6ca794fe67b	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	71703	91	16000	0	0.070311	USD	2524	2026-03-22 11:50:12.125963+00
155	8b3261c2-66ce-4982-b89a-64624b8d8f8f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	72414	112	0	0	0.091357	USD	1983	2026-03-22 11:50:26.994647+00
147	12becaa0-a015-43cc-b8c9-4470959aec8d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	69230	135	66432	0	0.004510	USD	1980	2026-03-22 11:49:01.519794+00
150	dc29210c-8610-401c-aad0-5654fa7c982f	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	70673	85	0	0	0.088979	USD	2392	2026-03-22 11:49:40.969835+00
151	4b990c66-e120-49ad-a305-0d02c54759ca	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	70790	105	0	0	0.089275	USD	4405	2026-03-22 11:49:50.550626+00
153	e2f20c27-dc37-4349-8e9b-f80675928afd	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	71943	45	59648	0	0.015706	USD	2179	2026-03-22 11:50:16.226948+00
154	3a8b25da-5819-49d4-9723-0d840b46c67d	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	72349	60	0	0	0.090886	USD	1724	2026-03-22 11:50:20.953638+00
156	e79dd076-cdc7-4af6-80fb-aa029ebb971c	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	72566	326	0	0	0.093153	USD	1006	2026-03-22 11:50:36.051181+00
157	b2d0e5e7-8840-4b34-8565-43875ff4ee08	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	75719	192	0	0	0.096089	USD	3791	2026-03-22 12:29:26.873481+00
158	7648ec58-1639-4261-9a3a-dd73d0a0b9da	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	79842	129	0	0	0.100770	USD	3320	2026-03-22 12:29:35.725967+00
159	7425d6f9-3a49-40a4-93b3-9bdc9d5a3aa6	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	89846	135	0	0	0.113320	USD	2644	2026-03-22 12:29:44.363616+00
160	c9f7c287-4e2d-4c2f-9449-82907990a979	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	90734	45	0	0	0.113755	USD	2798	2026-03-22 12:29:51.165255+00
161	de25bee3-8cc2-486d-95fa-4e67948692a9	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	94958	331	0	0	0.121180	USD	2612	2026-03-22 12:30:01.945155+00
162	ce7cd749-99af-4d61-a7d1-5170d7f945e2	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	95323	72	0	0	0.119694	USD	1437	2026-03-22 12:30:07.911632+00
163	5280a67a-822c-493a-91ac-47c2f6822698	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	98810	445	0	0	0.126850	USD	2736	2026-03-22 12:30:22.301512+00
164	121abb5e-5dc6-4005-b866-f5173c43c8da	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	99289	517	0	0	0.127989	USD	3669	2026-03-22 12:30:38.084893+00
165	007f85ee-ff8f-4a40-899a-03fe18a1e398	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	99840	327	0	0	0.127252	USD	3515	2026-03-22 12:30:53.355878+00
166	411d3f45-6d97-4df8-b704-f66d798d7dfc	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	100200	3230	0	0	0.149475	USD	2693	2026-03-22 12:32:02.478669+00
167	84bcb971-5dc2-41b1-835f-2ef7465a7d65	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	103463	209	0	0	0.130896	USD	1256	2026-03-22 12:32:20.959329+00
168	3d36af99-2337-49e9-b973-7523521e65a4	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	103839	112	0	0	0.130639	USD	2350	2026-03-22 12:32:34.753587+00
169	eaf1138c-719f-4d11-9564-ec63d0d3bf4e	user	PackyCode-OpenAI	PackyCode-OpenAI	gpt-5.4-x0.5	gpt-5.4-X0.5	t	103991	347	0	0	0.132591	USD	1393	2026-03-22 12:32:44.142852+00
\.


--
-- Data for Name: recharge_orders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.recharge_orders (id, username, out_trade_no, payment_method, status, amount_usd, amount_cny, cny_per_usd, subject, created_at, updated_at, paid_at, trade_no, buyer_logon_id, trade_status, customer_note, reviewed_by, reviewed_at, review_note, failure_reason) FROM stdin;
\.


--
-- Data for Name: request_reservations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.request_reservations (request_id, username, route_id, provider_id, model_id, reserved_amount_usd, actual_amount_usd, status, created_at, completed_at) FROM stdin;
a5bf8965-9e9b-409e-9efd-331f3f1b97dd	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:09.035751+00	2026-03-21 13:19:11.298528+00
52eeb3d5-d15a-42fd-8f79-8a001cc0aa63	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:35.529947+00	2026-03-21 13:19:36.942283+00
2c1ce40f-0c0e-45be-9c6e-a77a509094d6	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:35.514545+00	2026-03-21 13:19:37.379857+00
bf4235ec-5d8c-4ceb-8659-f6cd4a5f4782	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:36.969587+00	2026-03-21 13:19:38.231105+00
488701be-7a3a-42c9-b3ce-1033f8727a85	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:38.249213+00	2026-03-21 13:19:39.014787+00
6537a5e5-d00a-4d30-b283-655ce6ed9eb6	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:37.418589+00	2026-03-21 13:19:39.118127+00
6efad8d5-2498-4de0-bdfa-c093a220b385	user	gpt-5.4-mini-X0.5	PackyCode-OpenAI	gpt-5.4-mini-X0.5	0.010000	0.000119	settled	2026-03-21 13:19:39.034727+00	2026-03-21 13:19:39.977777+00
39bd446b-66bc-41a4-93c2-fe1d6605542c	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.327608	0.026822	settled	2026-03-22 08:06:00.199756+00	2026-03-22 08:06:06.165034+00
f7d88595-7d1f-488a-ad68-25f41f6cf81a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.328163	0.027276	settled	2026-03-22 08:06:06.204048+00	2026-03-22 08:06:14.404554+00
0933cac9-cd72-4a8c-8a3b-585c621fd878	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.333608	0.031616	settled	2026-03-22 08:06:14.620332+00	2026-03-22 08:06:19.735872+00
53bbf3d2-714f-4be9-a3e7-151fb57d5d5e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.339470	0.040258	settled	2026-03-22 08:06:19.829929+00	2026-03-22 08:06:34.069234+00
099e6ae3-718b-40cc-8f39-0923f6d927f6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.340453	0.041451	settled	2026-03-22 08:07:41.872692+00	2026-03-22 08:07:57.950086+00
422e219a-7151-4b50-942e-e05598b6920b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.341514	0.042260	settled	2026-03-22 08:09:17.379262+00	2026-03-22 08:09:33.031029+00
deb63a47-a112-46e4-bb9f-3cb888bf3c19	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.288400	0.002858	settled	2026-03-22 08:13:57.181166+00	2026-03-22 08:14:00.597223+00
63a1d53e-9378-4033-88cc-f15f751684cd	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.323155	0.021958	settled	2026-03-22 08:13:57.189296+00	2026-03-22 08:14:02.328477+00
22db9b8e-8b67-442f-be58-d19ecc7f2cdb	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.307660	0.017258	settled	2026-03-22 08:14:02.663726+00	2026-03-22 08:14:11.937881+00
06390367-942a-4a90-a32e-1f660064c099	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.311676	0.019946	settled	2026-03-22 08:14:14.240362+00	2026-03-22 08:14:20.839762+00
8d9a3b6c-b416-4387-a6d2-f9c7ba0fb35e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.312300	0.020486	settled	2026-03-22 08:14:20.887477+00	2026-03-22 08:14:26.598098+00
f6cfcd77-7487-4f21-9313-cd896b71d38f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.323171	0.021690	settled	2026-03-22 10:52:44.518635+00	2026-03-22 10:52:50.01728+00
f8dfe9f4-f26f-470b-a9c8-c7411da08c10	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.288410	0.002853	settled	2026-03-22 10:52:44.519904+00	2026-03-22 10:52:50.227244+00
003b97db-2a35-4ff6-8506-5118ac4ca976	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.307604	0.015606	settled	2026-03-22 10:52:50.285902+00	2026-03-22 10:52:56.414874+00
760e7c42-63f6-449f-b6b9-06ee76be9e57	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.314218	0.022741	settled	2026-03-22 10:52:57.596068+00	2026-03-22 10:53:03.806773+00
1bcfb91d-4b12-42d9-9ea3-da692d4142eb	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.314879	0.023440	settled	2026-03-22 10:53:03.867676+00	2026-03-22 10:53:10.463343+00
a3cd30aa-ce47-4fc4-9fb8-29268b46ec28	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.330617	0.036978	settled	2026-03-22 10:53:10.706334+00	2026-03-22 10:53:17.379346+00
fdc6bcab-ef1f-4d33-9caf-4479d5f51c84	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.334696	0.040097	settled	2026-03-22 10:53:17.589498+00	2026-03-22 10:53:27.751553+00
c477479d-554a-4ffb-88ae-dcbb7c812bce	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.335125	0.039300	settled	2026-03-22 10:53:27.959027+00	2026-03-22 10:53:32.874116+00
3f94a86e-4602-4fb7-8a3b-cc679532d219	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.340314	0.052404	settled	2026-03-22 10:53:32.943259+00	2026-03-22 10:53:59.414912+00
6ef27088-47c6-42f5-adf0-6f4a0324c3a9	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.325616	0.027043	settled	2026-03-22 10:53:59.871393+00	2026-03-22 10:54:14.313601+00
2a22e866-e139-4379-b511-4f21465f759a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.326534	0.023535	settled	2026-03-22 10:55:28.865724+00	2026-03-22 10:55:37.023674+00
0a4d3016-4418-48b1-8bc0-e3dd51796d14	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.328625	0.026519	settled	2026-03-22 10:55:37.07376+00	2026-03-22 10:55:43.456781+00
49ca9356-9c36-47cc-b3d7-0a3c57554fbe	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.307592	0.001725	settled	2026-03-22 10:55:43.689176+00	2026-03-22 10:55:48.641441+00
7ecab08c-12c6-41b6-af24-f2212993593d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.309098	0.018621	settled	2026-03-22 10:55:48.855075+00	2026-03-22 10:55:59.804952+00
56a09b2c-7497-4f27-812b-72f24e88bdf3	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.310776	0.019981	settled	2026-03-22 10:55:59.865722+00	2026-03-22 10:56:08.749632+00
22713021-99f1-4996-9290-95db6f920fbf	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.336371	0.040579	settled	2026-03-22 10:56:08.895589+00	2026-03-22 10:56:15.606288+00
5374248b-535d-49ff-8a89-da71652a8308	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.346073	0.053638	settled	2026-03-22 10:56:15.702553+00	2026-03-22 10:56:34.924469+00
999bffec-8580-4dab-970f-0a6cc46ba869	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.330839	0.027355	settled	2026-03-22 10:56:35.252265+00	2026-03-22 10:56:41.430265+00
be3a315a-4389-46fb-86d5-dff59befaf85	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.307613	0.015936	settled	2026-03-22 10:56:41.663622+00	2026-03-22 10:56:47.247878+00
10a3b427-62d0-44ec-a680-0886185fe75f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.311671	0.022007	settled	2026-03-22 10:56:47.49792+00	2026-03-22 10:56:58.255771+00
524596d0-f290-494b-8523-0a868ab60959	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.313488	0.023501	settled	2026-03-22 10:56:58.319285+00	2026-03-22 10:57:08.611588+00
e08126b0-d2be-4707-82d1-a8e2309fd52b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.330788	0.037788	settled	2026-03-22 10:57:08.75393+00	2026-03-22 10:57:19.938614+00
ddb2a918-1d1a-462a-a15b-d6d5998da141	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.341861	0.045614	settled	2026-03-22 10:57:20.122616+00	2026-03-22 10:57:29.187053+00
8b44b751-fd47-4c99-b9e2-cbc54769b06b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.342149	0.046664	settled	2026-03-22 10:57:29.35762+00	2026-03-22 10:57:37.313777+00
17311c8c-bf25-455a-bc41-4afc9f7d6129	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.367880	0.074449	settled	2026-03-22 10:57:37.438667+00	2026-03-22 10:58:02.533766+00
6911efd4-2ef0-4278-b089-3568cd5efeeb	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.333157	0.029989	settled	2026-03-22 10:58:03.002229+00	2026-03-22 10:58:11.535433+00
1347ddc2-0daa-41c6-9bc4-e5e2d62f1674	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.334169	0.030455	settled	2026-03-22 10:58:11.599655+00	2026-03-22 10:58:19.206319+00
c027fe6d-456a-4cdd-b531-dd26788b078e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.347701	0.041956	settled	2026-03-22 10:58:19.335375+00	2026-03-22 10:58:28.63969+00
33930696-cbf0-4383-95d1-ded51e4e0050	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.307864	0.015674	settled	2026-03-22 10:58:28.846548+00	2026-03-22 10:58:33.402684+00
220b912c-9ed9-4885-a94f-0dfd5bbe6372	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.312191	0.021958	settled	2026-03-22 10:58:33.738473+00	2026-03-22 10:58:43.914359+00
44306099-3ad5-4b9a-bf02-deb0fc1d50b6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.314029	0.023636	settled	2026-03-22 10:58:43.966308+00	2026-03-22 10:58:53.42963+00
962f6559-0a85-41c6-9e4c-eefaa0906092	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.344993	0.039269	settled	2026-03-22 11:07:24.015229+00	2026-03-22 11:07:28.470153+00
542ba10a-ad8f-4a55-b547-60999e716b13	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.345284	0.039132	settled	2026-03-22 11:07:28.517573+00	2026-03-22 11:07:31.449174+00
670819c5-627b-4c3d-a248-2abbe6ef47b6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.347611	0.041032	settled	2026-03-22 11:07:35.077063+00	2026-03-22 11:07:40.278425+00
7abe3828-4944-4bd5-9ab5-87a28083970e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.348620	0.041959	settled	2026-03-22 11:07:40.3471+00	2026-03-22 11:07:45.249008+00
04be6b9b-8f54-4def-bea3-b0f3eefa145a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.348768	0.042008	settled	2026-03-22 11:07:45.308261+00	2026-03-22 11:07:48.187883+00
8c66cee8-5405-4f90-b345-9b4967d26aef	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.348882	0.042158	settled	2026-03-22 11:07:49.068382+00	2026-03-22 11:07:59.960715+00
39a95170-d0d0-4d49-9b40-eecf80fbc616	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.349026	0.042480	settled	2026-03-22 11:08:14.106573+00	2026-03-22 11:08:18.594704+00
952d2f06-2adf-490d-99c8-764489124eba	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.349320	0.058424	settled	2026-03-22 11:08:18.642988+00	2026-03-22 11:09:01.019116+00
9cc173e0-1e71-40b7-bed4-6d9418a3aad2	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.352276	0.045124	settled	2026-03-22 11:09:02.25867+00	2026-03-22 11:09:05.915701+00
62ec2098-1397-48a4-bb6b-c46a3289670b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.352475	0.048906	settled	2026-03-22 11:09:05.961516+00	2026-03-22 11:09:24.385792+00
5e292c7c-3c05-4d3d-9eb4-b5113b8715d6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.353257	0.047750	settled	2026-03-22 11:10:34.520602+00	2026-03-22 11:10:45.172781+00
a0edc0ed-8ab6-4caf-af6b-2b8ec3489ba8	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.353724	0.049647	settled	2026-03-22 11:16:22.607129+00	2026-03-22 11:16:37.632404+00
27216cd0-cbe6-4641-9fa9-ad4a73fc4618	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.354450	0.051383	settled	2026-03-22 11:18:01.30181+00	2026-03-22 11:18:16.355347+00
5c4f9af2-a7a0-4f59-b6d8-06f5d9f501ce	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.355392	0.048190	settled	2026-03-22 11:21:42.247753+00	2026-03-22 11:21:46.992717+00
5287393f-ac49-43b9-a339-be5a3dce8510	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.355699	0.067645	settled	2026-03-22 11:21:47.068376+00	2026-03-22 11:22:41.03461+00
68f560ac-308c-4ab2-a64b-3b4905dcb60d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.359177	0.051735	settled	2026-03-22 11:22:43.432279+00	2026-03-22 11:22:50.542653+00
26df72d5-d90b-4de4-bfc1-eb34fc833d2f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.359485	0.053430	settled	2026-03-22 11:22:50.597883+00	2026-03-22 11:22:58.677198+00
34eb031b-547f-483c-be87-f833331b4d15	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.359944	0.052630	settled	2026-03-22 11:23:38.300413+00	2026-03-22 11:23:43.815641+00
2500f66a-d1f9-49db-b135-670b41920dac	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.360335	0.009274	settled	2026-03-22 11:23:43.870795+00	2026-03-22 11:23:52.761332+00
b9545312-6b4a-4597-8823-96a419044915	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.362622	0.055762	settled	2026-03-22 11:23:53.04734+00	2026-03-22 11:24:10.109964+00
20c78a62-029b-4da0-9524-f37443bf0a60	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.382123	0.072576	settled	2026-03-22 11:24:10.28639+00	2026-03-22 11:24:15.922326+00
dc76ad68-cc8b-4696-b5fd-e0a4b0ee3c81	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.384353	0.074150	settled	2026-03-22 11:24:16.084+00	2026-03-22 11:24:20.752896+00
f0ce9bdd-67d4-4c08-bab1-8de70035a7c7	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.398141	0.088164	settled	2026-03-22 11:24:20.836063+00	2026-03-22 11:24:26.082046+00
b5a4365a-af7b-4d35-b395-19399dc14027	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.403350	0.092228	settled	2026-03-22 11:24:26.220503+00	2026-03-22 11:24:31.412809+00
6da12a0e-8450-490c-8ba2-e928f3dd7961	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.403889	0.092646	settled	2026-03-22 11:24:31.483234+00	2026-03-22 11:24:37.403484+00
dffe8cdb-d64c-4330-9dc7-ca67a78af3b7	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.406495	0.094608	settled	2026-03-22 11:24:37.475826+00	2026-03-22 11:24:42.902796+00
2df96eea-0317-4c75-a53a-ba1b62aba16d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.407375	0.095310	settled	2026-03-22 11:24:42.993063+00	2026-03-22 11:24:55.676105+00
c4d12919-cc68-4652-b6d8-494d085795e0	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.413891	0.100269	settled	2026-03-22 11:24:55.77623+00	2026-03-22 11:25:00.808995+00
36a6485a-e0ad-40bb-986c-c54ae4244ce5	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.417360	0.103296	settled	2026-03-22 11:25:00.885127+00	2026-03-22 11:25:06.326762+00
97dad0b2-208d-4f14-8d42-ba378c180f88	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.421440	0.106663	settled	2026-03-22 11:25:06.378216+00	2026-03-22 11:25:11.606412+00
1a3cde29-0dc7-4e03-96d8-00f5d88ec9ad	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.421956	0.060676	settled	2026-03-22 11:25:11.674195+00	2026-03-22 11:25:16.826665+00
91fa533d-9e26-4df5-9c2b-38c1f3378f0e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.425509	0.115554	settled	2026-03-22 11:25:16.908101+00	2026-03-22 11:25:51.245891+00
3f67fe99-2a5d-4ab8-b766-c6d399477a41	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.426966	0.116240	settled	2026-03-22 11:25:52.483037+00	2026-03-22 11:26:14.812365+00
9e576330-8976-4973-b9f7-886427a6236a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428153	0.112297	settled	2026-03-22 11:26:15.959049+00	2026-03-22 11:26:36.96901+00
f4131e55-860f-4ea0-9cc3-16787d97559e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428412	0.112420	settled	2026-03-22 11:26:38.129188+00	2026-03-22 11:26:43.848525+00
3994023b-3e57-4092-bc2b-f1bb74269c42	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428657	0.112429	settled	2026-03-22 11:26:44.968569+00	2026-03-22 11:26:56.343264+00
a5e25277-a2c2-44ff-94a9-a8f15742c610	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428893	0.112576	settled	2026-03-22 11:26:57.445224+00	2026-03-22 11:27:05.96581+00
b71dd86c-81af-4aad-8464-eb1d70053599	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.429120	0.113731	settled	2026-03-22 11:27:07.111371+00	2026-03-22 11:27:16.986573+00
fdcda1bc-1399-4515-b8f7-68b40e0dc938	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.429570	0.113756	settled	2026-03-22 11:27:18.102334+00	2026-03-22 11:27:25.944337+00
39df9621-2d8f-4251-bb11-85bd7a5e45dc	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.429895	0.113299	settled	2026-03-22 11:27:27.063743+00	2026-03-22 11:27:33.130863+00
39e0fbb8-204e-40c3-b7e1-a8e887125c59	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.430123	0.113411	settled	2026-03-22 11:27:34.314445+00	2026-03-22 11:27:40.000166+00
8c29cbeb-b8c6-4bb5-acf8-d034018d1d7f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.430656	0.115367	settled	2026-03-22 11:27:41.09125+00	2026-03-22 11:27:49.91395+00
8d133223-217d-4aba-88ad-0fbb86bae6f0	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.431237	0.114198	settled	2026-03-22 11:27:51.017269+00	2026-03-22 11:27:55.563018+00
52046763-f29d-4d5a-bc62-7bf245801f38	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.431460	0.118270	settled	2026-03-22 11:27:56.703146+00	2026-03-22 11:28:18.704232+00
50cac2a7-7aca-4716-9bea-c29548cac6dd	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.432654	0.116225	settled	2026-03-22 11:28:19.880343+00	2026-03-22 11:28:28.802491+00
059e7441-3514-4d5a-80b8-eccabeedb81a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.433170	0.013039	settled	2026-03-22 11:28:29.944864+00	2026-03-22 11:28:34.653442+00
3de69273-741a-48dc-9b62-07e932a985e8	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.294083	0.154719	settled	2026-03-22 11:28:35.726291+00	2026-03-22 11:31:01.360589+00
d16c2a82-635d-4d49-90de-37fc8e5e2beb	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.345220	0.037948	settled	2026-03-22 11:31:01.548572+00	2026-03-22 11:31:06.041217+00
7c4f57ea-d1af-40ae-a5b4-ce118e023d00	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.346181	0.038681	settled	2026-03-22 11:31:06.094937+00	2026-03-22 11:31:20.483977+00
2bba5fa1-510a-41df-af8a-66c02d6ce726	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.368635	0.140199	settled	2026-03-22 11:31:20.591019+00	2026-03-22 11:34:45.404823+00
1e583e9a-8df9-424c-8ac6-39cb306275bf	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.388248	0.071894	settled	2026-03-22 11:34:46.698838+00	2026-03-22 11:34:53.783887+00
634ad4ec-b716-4e66-9b9b-de07e37e5eb1	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.388615	0.001425	settled	2026-03-22 11:34:53.860195+00	2026-03-22 11:34:58.362474+00
adba772f-b384-40fe-ae71-e1284e0830df	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.388897	0.076519	settled	2026-03-22 11:34:59.436671+00	2026-03-22 11:35:18.986582+00
60ef8bc0-2c7f-46ac-8963-aff561b7fb30	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.390113	0.076636	settled	2026-03-22 11:35:20.184724+00	2026-03-22 11:35:34.706826+00
013b062b-240d-4766-a1d3-70d8fb66187b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.391138	0.074264	settled	2026-03-22 11:35:35.878904+00	2026-03-22 11:35:42.180958+00
618f61d1-1e43-43f9-8499-ca1e147863fe	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.391568	0.002318	settled	2026-03-22 11:35:43.281857+00	2026-03-22 11:35:49.726332+00
c53b255d-cb13-4401-9aab-36c67d400987	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.392179	0.042994	settled	2026-03-22 11:35:50.84846+00	2026-03-22 11:36:10.16051+00
c310f31b-32b2-43b9-910e-bf231394ba97	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.393761	0.104799	settled	2026-03-22 11:36:11.32528+00	2026-03-22 11:37:27.702415+00
36ec1ef2-561d-4679-b65f-9170d7353e2d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.400448	0.081144	settled	2026-03-22 11:37:28.949834+00	2026-03-22 11:37:41.265352+00
df9c85b9-6840-4196-b61d-7804cd0db4ce	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.425153	0.102969	settled	2026-03-22 11:37:41.478033+00	2026-03-22 11:37:52.946278+00
edb4c7f5-f07b-4efa-95be-2b27db13bfe7	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.425964	0.102239	settled	2026-03-22 11:37:54.137912+00	2026-03-22 11:38:02.437642+00
1dac869f-9726-4238-b2db-17f02057e0a6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.426506	0.103085	settled	2026-03-22 11:38:03.569845+00	2026-03-22 11:38:21.352508+00
38b9cdb9-dd93-43fb-90d4-f1daacba2ec5	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.427176	0.102075	settled	2026-03-22 11:38:22.475193+00	2026-03-22 11:38:42.552914+00
3b1a0b74-bdba-4293-9fd2-e7a32c60578b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428263	0.103124	settled	2026-03-22 11:38:42.713222+00	2026-03-22 11:38:49.255932+00
b3289725-490c-4bb0-9062-f4baaed67552	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428574	0.103985	settled	2026-03-22 11:38:50.317639+00	2026-03-22 11:39:05.463789+00
7ff92fc4-b42e-4e19-8844-a875ccca3993	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.428976	0.106817	settled	2026-03-22 11:39:06.5609+00	2026-03-22 11:39:19.691952+00
f11e0375-2839-4ab8-8904-9336b6b85490	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.430021	0.105760	settled	2026-03-22 11:39:20.786586+00	2026-03-22 11:39:31.180081+00
99109daf-cc13-4a49-9f72-20cd90b49c51	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.430642	0.105600	settled	2026-03-22 11:39:32.350749+00	2026-03-22 11:39:43.837344+00
f5658d02-6db2-4b71-bf6d-f72835e03cdf	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.431113	0.105353	settled	2026-03-22 11:39:44.93345+00	2026-03-22 11:39:54.618614+00
87ba6b2d-b3f0-421b-a077-7d847c379131	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.431501	0.105912	settled	2026-03-22 11:39:55.697737+00	2026-03-22 11:40:03.642213+00
391a1faa-199b-48e0-9b0d-3f996ba22dbb	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.431902	0.105324	settled	2026-03-22 11:40:04.737294+00	2026-03-22 11:40:11.123927+00
7f9b2f2c-3ae6-4806-8d51-beee76adebe5	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.432149	0.105479	settled	2026-03-22 11:40:12.227951+00	2026-03-22 11:40:18.821202+00
5932051d-d1c3-4dd6-971a-c63ab4060802	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.432386	0.003574	settled	2026-03-22 11:40:19.914694+00	2026-03-22 11:40:27.278366+00
de9649aa-2ff1-4612-b1b8-15b33ab37de3	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.433042	0.106302	settled	2026-03-22 11:40:27.506469+00	2026-03-22 11:40:37.274029+00
25b32490-9e45-4c5e-809d-6320a24e370d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.433369	0.106402	settled	2026-03-22 11:40:37.375817+00	2026-03-22 11:40:41.938385+00
13307cfa-8e50-42d0-b6af-feb531c3cdef	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.465456	0.141044	settled	2026-03-22 11:40:42.020043+00	2026-03-22 11:40:55.315285+00
2a0e1fba-49d9-4d77-b9c9-222571eaa7d2	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.466169	0.078145	settled	2026-03-22 11:40:56.412188+00	2026-03-22 11:41:29.648837+00
c71be044-9a01-4cf5-8eda-173509c6440a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.329377	0.202154	settled	2026-03-22 11:41:30.891253+00	2026-03-22 11:44:44.58647+00
c1c1d5db-4076-4710-bc58-99ca227c385b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.357616	0.047616	settled	2026-03-22 11:44:44.737695+00	2026-03-22 11:44:52.991821+00
2080dbe2-0a27-4776-bfd5-a145b06a769d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.358343	0.048186	settled	2026-03-22 11:44:53.065549+00	2026-03-22 11:44:57.187121+00
381c0fa0-d522-4ef3-af9c-c479050b721e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.382901	0.074915	settled	2026-03-22 11:44:57.265378+00	2026-03-22 11:45:06.959715+00
477a2d4b-cac3-4005-93ef-1e3504120a7e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.383418	0.074482	settled	2026-03-22 11:45:08.057785+00	2026-03-22 11:45:16.299885+00
b2d6c0b5-065e-44a7-80c9-025c3d207b3d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.383748	0.075625	settled	2026-03-22 11:45:17.503404+00	2026-03-22 11:45:25.603972+00
d86d9358-0efc-469b-bc9e-6b74c9eea809	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.384170	0.079145	settled	2026-03-22 11:45:26.725204+00	2026-03-22 11:45:45.902988+00
27cb7a24-36eb-403d-8bd5-918edc8d8ed6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.385030	0.079309	settled	2026-03-22 11:45:47.035809+00	2026-03-22 11:46:02.529208+00
889a6791-a026-4dfe-9617-95150652869e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.385976	0.077472	settled	2026-03-22 11:46:03.645865+00	2026-03-22 11:46:15.281603+00
6411b0ea-9fed-49e2-92b6-23c9c0a2b6e5	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.386395	0.078731	settled	2026-03-22 11:46:16.418725+00	2026-03-22 11:46:29.203949+00
4c6dfb7d-c72c-46b7-9f07-b8a6f69873a5	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.386990	0.098104	settled	2026-03-22 11:46:30.336948+00	2026-03-22 11:47:26.780644+00
a3266452-fcaa-4fac-a589-0a7e715c5269	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.391531	0.063616	settled	2026-03-22 11:47:27.994543+00	2026-03-22 11:47:41.479313+00
994689b3-f5b9-4143-9fb7-0a8a34f8967a	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.392282	0.081809	settled	2026-03-22 11:47:42.634968+00	2026-03-22 11:47:50.960121+00
0dbcbf5c-27cd-42fb-9cc3-320a2ae0a758	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.392536	0.062286	settled	2026-03-22 11:47:52.116306+00	2026-03-22 11:47:58.520797+00
61763f42-9eee-46f6-89f2-2261ecc17e68	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.392874	0.082089	settled	2026-03-22 11:47:58.580035+00	2026-03-22 11:48:03.724815+00
b4438999-7273-4537-96c9-15c2593210c8	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.393325	0.082090	settled	2026-03-22 11:48:03.93433+00	2026-03-22 11:48:10.168744+00
61cdd6aa-955a-40df-8938-4fadc1297068	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.394765	0.083843	settled	2026-03-22 11:48:10.263284+00	2026-03-22 11:48:17.202871+00
4b49cb09-1159-4af7-a8b7-f524fe9eeaaa	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.394998	0.083650	settled	2026-03-22 11:48:17.378473+00	2026-03-22 11:48:25.437362+00
d2cebb9d-f0b8-4786-9e75-1016e90539cf	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.396822	0.086481	settled	2026-03-22 11:48:25.524872+00	2026-03-22 11:48:34.469957+00
86980587-c158-428d-94a7-435689920628	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.397147	0.091972	settled	2026-03-22 11:48:35.615028+00	2026-03-22 11:48:54.877147+00
12becaa0-a015-43cc-b8c9-4470959aec8d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.398462	0.004510	settled	2026-03-22 11:48:55.977001+00	2026-03-22 11:49:01.514726+00
d8e79474-ccde-4e1b-b4dd-50d632fb02c6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.399035	0.087819	settled	2026-03-22 11:49:02.603192+00	2026-03-22 11:49:10.026714+00
b91c0cb1-883b-4502-a527-4a48fc8ae118	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.399296	0.094170	settled	2026-03-22 11:49:11.193068+00	2026-03-22 11:49:31.674922+00
dc29210c-8610-401c-aad0-5654fa7c982f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.400717	0.088979	settled	2026-03-22 11:49:32.799251+00	2026-03-22 11:49:40.961502+00
4b990c66-e120-49ad-a305-0d02c54759ca	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.400926	0.089275	settled	2026-03-22 11:49:42.148889+00	2026-03-22 11:49:50.543521+00
9b5ef436-eb8d-490d-bb0d-b6ca794fe67b	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.402182	0.070311	settled	2026-03-22 11:49:50.729545+00	2026-03-22 11:50:12.123405+00
e2f20c27-dc37-4349-8e9b-f80675928afd	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.402523	0.015706	settled	2026-03-22 11:50:12.465173+00	2026-03-22 11:50:16.217339+00
3a8b25da-5819-49d4-9723-0d840b46c67d	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.403103	0.090886	settled	2026-03-22 11:50:16.36185+00	2026-03-22 11:50:20.946835+00
8b3261c2-66ce-4982-b89a-64624b8d8f8f	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.403243	0.091357	settled	2026-03-22 11:50:21.209748+00	2026-03-22 11:50:26.987245+00
e79dd076-cdc7-4af6-80fb-aa029ebb971c	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.403573	0.093153	settled	2026-03-22 11:50:27.078035+00	2026-03-22 11:50:36.046469+00
b2d0e5e7-8840-4b34-8565-43875ff4ee08	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.404069	0.096089	settled	2026-03-22 12:29:15.236039+00	2026-03-22 12:29:26.845371+00
7648ec58-1639-4261-9a3a-dd73d0a0b9da	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.409530	0.100770	settled	2026-03-22 12:29:27.213716+00	2026-03-22 12:29:35.69993+00
7425d6f9-3a49-40a4-93b3-9bdc9d5a3aa6	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.424824	0.113320	settled	2026-03-22 12:29:35.851836+00	2026-03-22 12:29:44.35624+00
c9f7c287-4e2d-4c2f-9449-82907990a979	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.426137	0.113755	settled	2026-03-22 12:29:44.63108+00	2026-03-22 12:29:51.136351+00
de25bee3-8cc2-486d-95fa-4e67948692a9	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.433099	0.121180	settled	2026-03-22 12:29:51.269198+00	2026-03-22 12:30:01.912212+00
ce7cd749-99af-4d61-a7d1-5170d7f945e2	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.433716	0.119694	settled	2026-03-22 12:30:03.093671+00	2026-03-22 12:30:07.904627+00
5280a67a-822c-493a-91ac-47c2f6822698	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.439057	0.126850	settled	2026-03-22 12:30:08.025283+00	2026-03-22 12:30:22.274557+00
121abb5e-5dc6-4005-b866-f5173c43c8da	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.439913	0.127989	settled	2026-03-22 12:30:23.383325+00	2026-03-22 12:30:38.055369+00
007f85ee-ff8f-4a40-899a-03fe18a1e398	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.440860	0.127252	settled	2026-03-22 12:30:39.210973+00	2026-03-22 12:30:53.342084+00
411d3f45-6d97-4df8-b704-f66d798d7dfc	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.441455	0.149475	settled	2026-03-22 12:30:54.551445+00	2026-03-22 12:32:02.439965+00
84bcb971-5dc2-41b1-835f-2ef7465a7d65	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.448379	0.130896	settled	2026-03-22 12:32:03.805377+00	2026-03-22 12:32:20.929572+00
3d36af99-2337-49e9-b973-7523521e65a4	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.449052	0.130639	settled	2026-03-22 12:32:22.264114+00	2026-03-22 12:32:34.69401+00
eaf1138c-719f-4d11-9564-ec63d0d3bf4e	user	gpt-5.4-x0.5	PackyCode-OpenAI	gpt-5.4-x0.5	0.449382	0.132591	settled	2026-03-22 12:32:34.898611+00	2026-03-22 12:32:44.119614+00
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.sessions (token, username, role, expires_at) FROM stdin;
\.


--
-- Data for Name: stats_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stats_events (id, request_id, username, provider_id, model_id, success, input_tokens, output_tokens, cache_read_tokens, cache_creation_tokens, total_cost, currency, latency_ms, created_at) FROM stdin;
1	a5bf8965-9e9b-409e-9efd-331f3f1b97dd	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	2248	2026-03-21 13:19:11.331655+00
2	52eeb3d5-d15a-42fd-8f79-8a001cc0aa63	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1585	2026-03-21 13:19:36.953752+00
3	2c1ce40f-0c0e-45be-9c6e-a77a509094d6	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	2029	2026-03-21 13:19:37.404442+00
4	bf4235ec-5d8c-4ceb-8659-f6cd4a5f4782	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1262	2026-03-21 13:19:38.238761+00
5	488701be-7a3a-42c9-b3ce-1033f8727a85	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	765	2026-03-21 13:19:39.023034+00
6	6537a5e5-d00a-4d30-b283-655ce6ed9eb6	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	1682	2026-03-21 13:19:39.133426+00
7	6efad8d5-2498-4de0-bdfa-c093a220b385	user	PackyCode-OpenAI	gpt-5.4-mini-X0.5	t	1566	5	1280	0	0.000119	USD	943	2026-03-21 13:19:39.986133+00
8	39bd446b-66bc-41a4-93c2-fe1d6605542c	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	20324	189	0	0	0.026822	USD	1801	2026-03-22 08:06:06.170827+00
9	f7d88595-7d1f-488a-ad68-25f41f6cf81a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	20699	187	0	0	0.027276	USD	1308	2026-03-22 08:06:14.40984+00
10	0933cac9-cd72-4a8c-8a3b-585c621fd878	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	24411	147	0	0	0.031616	USD	965	2026-03-22 08:06:19.744692+00
11	53bbf3d2-714f-4be9-a3e7-151fb57d5d5e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	28408	633	0	0	0.040258	USD	824	2026-03-22 08:06:34.117043+00
12	099e6ae3-718b-40cc-8f39-0923f6d927f6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	29051	685	0	0	0.041451	USD	3003	2026-03-22 08:07:57.957171+00
13	422e219a-7151-4b50-942e-e05598b6920b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	29752	676	0	0	0.042260	USD	1886	2026-03-22 08:09:33.037017+00
14	deb63a47-a112-46e4-bb9f-3cb888bf3c19	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	1572	119	0	0	0.002858	USD	1008	2026-03-22 08:14:00.607098+00
15	63a1d53e-9378-4033-88cc-f15f751684cd	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	16684	147	0	0	0.021958	USD	1691	2026-03-22 08:14:02.361296+00
16	22db9b8e-8b67-442f-be58-d19ecc7f2cdb	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	11478	388	0	0	0.017258	USD	1196	2026-03-22 08:14:11.945665+00
17	06390367-942a-4a90-a32e-1f660064c099	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	14673	214	0	0	0.019946	USD	876	2026-03-22 08:14:20.84848+00
18	8d9a3b6c-b416-4387-a6d2-f9c7ba0fb35e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	15105	214	0	0	0.020486	USD	997	2026-03-22 08:14:26.604061+00
19	f6cfcd77-7487-4f21-9313-cd896b71d38f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	16692	110	0	0	0.021690	USD	1932	2026-03-22 10:52:50.024958+00
20	f8dfe9f4-f26f-470b-a9c8-c7411da08c10	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	1580	117	0	0	0.002853	USD	1856	2026-03-22 10:52:50.229979+00
21	003b97db-2a35-4ff6-8506-5118ac4ca976	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	11441	174	0	0	0.015606	USD	1060	2026-03-22 10:52:56.424517+00
22	760e7c42-63f6-449f-b6b9-06ee76be9e57	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	16723	245	0	0	0.022741	USD	946	2026-03-22 10:53:03.81492+00
23	1bcfb91d-4b12-42d9-9ea3-da692d4142eb	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	17186	261	0	0	0.023440	USD	877	2026-03-22 10:53:10.471717+00
24	a3cd30aa-ce47-4fc4-9fb8-29268b46ec28	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	27938	274	0	0	0.036978	USD	894	2026-03-22 10:53:17.387211+00
25	fdc6bcab-ef1f-4d33-9caf-4479d5f51c84	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	30770	218	0	0	0.040097	USD	863	2026-03-22 10:53:27.76539+00
26	c477479d-554a-4ffb-88ae-dcbb7c812bce	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	31080	60	0	0	0.039300	USD	935	2026-03-22 10:53:32.88191+00
27	3f94a86e-4602-4fb7-8a3b-cc679532d219	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	34465	1243	0	0	0.052404	USD	896	2026-03-22 10:53:59.426715+00
28	6ef27088-47c6-42f5-adf0-6f4a0324c3a9	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	18112	587	0	0	0.027043	USD	1118	2026-03-22 10:54:14.318373+00
29	2a22e866-e139-4379-b511-4f21465f759a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	18738	15	0	0	0.023535	USD	4836	2026-03-22 10:55:37.027693+00
30	0a4d3016-4418-48b1-8bc0-e3dd51796d14	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	19871	224	0	0	0.026519	USD	1004	2026-03-22 10:55:43.461682+00
31	49ca9356-9c36-47cc-b3d7-0a3c57554fbe	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	11432	202	11264	0	0.001725	USD	824	2026-03-22 10:55:48.647984+00
32	7ecab08c-12c6-41b6-af24-f2212993593d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	12479	403	0	0	0.018621	USD	2915	2026-03-22 10:55:59.809482+00
33	56a09b2c-7497-4f27-812b-72f24e88bdf3	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	13567	403	0	0	0.019981	USD	736	2026-03-22 10:56:08.755978+00
34	22713021-99f1-4996-9290-95db6f920fbf	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	31071	232	0	0	0.040579	USD	1278	2026-03-22 10:56:15.614173+00
35	5374248b-535d-49ff-8a89-da71652a8308	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	37336	929	0	0	0.053638	USD	1081	2026-03-22 10:56:34.935673+00
36	999bffec-8580-4dab-970f-0a6cc46ba869	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	21188	116	0	0	0.027355	USD	2389	2026-03-22 10:56:41.43783+00
37	be3a315a-4389-46fb-86d5-dff59befaf85	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	11447	217	0	0	0.015936	USD	817	2026-03-22 10:56:47.252124+00
38	10a3b427-62d0-44ec-a680-0886185fe75f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	14828	463	0	0	0.022007	USD	1698	2026-03-22 10:56:58.25983+00
39	524596d0-f290-494b-8523-0a868ab60959	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	16023	463	0	0	0.023501	USD	889	2026-03-22 10:57:08.617665+00
40	e08126b0-d2be-4707-82d1-a8e2309fd52b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	27614	436	0	0	0.037788	USD	1247	2026-03-22 10:57:19.942788+00
41	ddb2a918-1d1a-462a-a15b-d6d5998da141	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	35717	129	0	0	0.045614	USD	5403	2026-03-22 10:57:29.190454+00
42	8b44b751-fd47-4c99-b9e2-cbc54769b06b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	35909	237	0	0	0.046664	USD	2471	2026-03-22 10:57:37.31895+00
43	17311c8c-bf25-455a-bc41-4afc9f7d6129	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	52215	1224	0	0	0.074449	USD	1633	2026-03-22 10:58:02.537935+00
44	6911efd4-2ef0-4278-b089-3568cd5efeeb	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	22599	232	0	0	0.029989	USD	3347	2026-03-22 10:58:11.539953+00
45	1347ddc2-0daa-41c6-9bc4-e5e2d62f1674	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	23248	186	0	0	0.030455	USD	837	2026-03-22 10:58:19.21229+00
46	c027fe6d-456a-4cdd-b531-dd26788b078e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	32545	170	0	0	0.041956	USD	921	2026-03-22 10:58:28.644055+00
47	33930696-cbf0-4383-95d1-ded51e4e0050	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	11501	173	0	0	0.015674	USD	812	2026-03-22 10:58:33.406903+00
48	220b912c-9ed9-4885-a94f-0dfd5bbe6372	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	15166	400	0	0	0.021958	USD	816	2026-03-22 10:58:43.91878+00
49	44306099-3ad5-4b9a-bf02-deb0fc1d50b6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	16341	428	0	0	0.023636	USD	807	2026-03-22 10:58:53.433689+00
50	962f6559-0a85-41c6-9e4c-eefaa0906092	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	30905	85	0	0	0.039269	USD	1769	2026-03-22 11:07:28.478319+00
51	542ba10a-ad8f-4a55-b547-60999e716b13	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	31030	46	0	0	0.039132	USD	952	2026-03-22 11:07:31.452739+00
52	670819c5-627b-4c3d-a248-2abbe6ef47b6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	32538	48	0	0	0.041032	USD	2280	2026-03-22 11:07:40.286198+00
53	7abe3828-4944-4bd5-9ab5-87a28083970e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	33267	50	0	0	0.041959	USD	894	2026-03-22 11:07:45.26463+00
54	04be6b9b-8f54-4def-bea3-b0f3eefa145a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	33348	43	0	0	0.042008	USD	1208	2026-03-22 11:07:48.196526+00
55	8c66cee8-5405-4f90-b345-9b4967d26aef	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	33396	55	0	0	0.042158	USD	2648	2026-03-22 11:07:59.967891+00
56	39a95170-d0d0-4d49-9b40-eecf80fbc616	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	33474	85	0	0	0.042480	USD	1773	2026-03-22 11:08:18.602069+00
57	952d2f06-2adf-490d-99c8-764489124eba	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	33599	2190	0	0	0.058424	USD	866	2026-03-22 11:09:01.031089+00
58	9cc173e0-1e71-40b7-bed4-6d9418a3aad2	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	35817	47	0	0	0.045124	USD	1187	2026-03-22 11:09:05.919714+00
59	62ec2098-1397-48a4-bb6b-c46a3289670b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	35915	535	0	0	0.048906	USD	1282	2026-03-22 11:09:24.390274+00
60	5e292c7c-3c05-4d3d-9eb4-b5113b8715d6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	36472	288	0	0	0.047750	USD	2594	2026-03-22 11:10:45.184032+00
61	a0edc0ed-8ab6-4caf-af6b-2b8ec3489ba8	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	36778	490	0	0	0.049647	USD	2229	2026-03-22 11:16:37.642892+00
62	27216cd0-cbe6-4641-9fa9-ad4a73fc4618	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	37296	635	0	0	0.051383	USD	2499	2026-03-22 11:18:16.36105+00
63	5c4f9af2-a7a0-4f59-b6d8-06f5d9f501ce	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	37964	98	0	0	0.048190	USD	1827	2026-03-22 11:21:46.998725+00
64	5287393f-ac49-43b9-a339-be5a3dce8510	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	38102	2669	0	0	0.067645	USD	1551	2026-03-22 11:22:41.04586+00
65	68f560ac-308c-4ab2-a64b-3b4905dcb60d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	40800	98	0	0	0.051735	USD	1093	2026-03-22 11:22:50.551027+00
66	26df72d5-d90b-4de4-bfc1-eb34fc833d2f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	40938	301	0	0	0.053430	USD	1170	2026-03-22 11:22:58.682011+00
67	34eb031b-547f-483c-be87-f833331b4d15	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	41258	141	0	0	0.052630	USD	1826	2026-03-22 11:23:43.82453+00
68	2500f66a-d1f9-49db-b135-670b41920dac	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	41439	282	35712	0	0.009274	USD	1294	2026-03-22 11:23:52.789435+00
69	b9545312-6b4a-4597-8823-96a419044915	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	43278	222	0	0	0.055762	USD	11737	2026-03-22 11:24:10.117668+00
70	20c78a62-029b-4da0-9524-f37443bf0a60	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	57407	109	0	0	0.072576	USD	2103	2026-03-22 11:24:15.929943+00
71	dc76ad68-cc8b-4696-b5fd-e0a4b0ee3c81	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	59056	44	0	0	0.074150	USD	2411	2026-03-22 11:24:20.77686+00
72	f0ce9bdd-67d4-4c08-bab1-8de70035a7c7	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	70255	46	0	0	0.088164	USD	1655	2026-03-22 11:24:26.095143+00
73	b5a4365a-af7b-4d35-b395-19399dc14027	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	73512	45	0	0	0.092228	USD	2457	2026-03-22 11:24:31.418051+00
74	6da12a0e-8450-490c-8ba2-e928f3dd7961	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	73829	48	0	0	0.092646	USD	3080	2026-03-22 11:24:37.413319+00
75	dffe8cdb-d64c-4330-9dc7-ca67a78af3b7	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	75404	47	0	0	0.094608	USD	2647	2026-03-22 11:24:42.913236+00
76	2df96eea-0317-4c75-a53a-ba1b62aba16d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	75978	45	0	0	0.095310	USD	10155	2026-03-22 11:24:55.682169+00
77	c4d12919-cc68-4652-b6d8-494d085795e0	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	79945	45	0	0	0.100269	USD	2422	2026-03-22 11:25:00.814832+00
78	36a6485a-e0ad-40bb-986c-c54ae4244ce5	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	82367	45	0	0	0.103296	USD	3124	2026-03-22 11:25:06.332262+00
79	97dad0b2-208d-4f14-8d42-ba378c180f88	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	85060	45	0	0	0.106663	USD	2434	2026-03-22 11:25:11.610359+00
80	1a3cde29-0dc7-4e03-96d8-00f5d88ec9ad	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	85409	42	37120	0	0.060676	USD	2681	2026-03-22 11:25:16.83058+00
81	91fa533d-9e26-4df5-9c2b-38c1f3378f0e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	87559	814	0	0	0.115554	USD	16316	2026-03-22 11:25:51.252123+00
82	3f67fe99-2a5d-4ab8-b766-c6d399477a41	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	88408	764	0	0	0.116240	USD	2315	2026-03-22 11:26:14.820064+00
83	9e576330-8976-4973-b9f7-886427a6236a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89208	105	0	0	0.112297	USD	13873	2026-03-22 11:26:36.983915+00
84	f4131e55-860f-4ea0-9cc3-16787d97559e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89348	98	0	0	0.112420	USD	2259	2026-03-22 11:26:43.864136+00
85	3994023b-3e57-4092-bc2b-f1bb74269c42	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89481	77	0	0	0.112429	USD	2768	2026-03-22 11:26:56.359188+00
86	a5e25277-a2c2-44ff-94a9-a8f15742c610	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89593	78	0	0	0.112576	USD	3151	2026-03-22 11:27:05.973611+00
87	b71dd86c-81af-4aad-8464-eb1d70053599	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89701	214	0	0	0.113731	USD	4103	2026-03-22 11:27:17.004184+00
88	fdcda1bc-1399-4515-b8f7-68b40e0dc938	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89949	176	0	0	0.113756	USD	2674	2026-03-22 11:27:25.95404+00
89	39df9621-2d8f-4251-bb11-85bd7a5e45dc	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90159	80	0	0	0.113299	USD	2450	2026-03-22 11:27:33.136068+00
90	39e0fbb8-204e-40c3-b7e1-a8e887125c59	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90273	76	0	0	0.113411	USD	2405	2026-03-22 11:27:40.003413+00
91	8c29cbeb-b8c6-4bb5-acf8-d034018d1d7f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90554	290	0	0	0.115367	USD	1682	2026-03-22 11:27:49.918936+00
92	8d133223-217d-4aba-88ad-0fbb86bae6f0	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90878	80	0	0	0.114198	USD	1307	2026-03-22 11:27:55.570048+00
93	52046763-f29d-4d5a-bc62-7bf245801f38	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90992	604	0	0	0.118270	USD	8907	2026-03-22 11:28:18.712062+00
94	50cac2a7-7aca-4716-9bea-c29548cac6dd	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	91630	225	0	0	0.116225	USD	2090	2026-03-22 11:28:28.80927+00
95	059e7441-3514-4d5a-80b8-eccabeedb81a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	91889	141	82304	0	0.013039	USD	1143	2026-03-22 11:28:34.660388+00
96	3de69273-741a-48dc-9b62-07e932a985e8	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	78919	7476	0	0	0.154719	USD	2236	2026-03-22 11:31:01.373478+00
97	d16c2a82-635d-4d49-90de-37fc8e5e2beb	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	29512	141	0	0	0.037948	USD	1110	2026-03-22 11:31:06.048839+00
98	7c4f57ea-d1af-40ae-a5b4-ce118e023d00	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	30057	148	0	0	0.038681	USD	8978	2026-03-22 11:31:20.490261+00
99	2bba5fa1-510a-41df-af8a-66c02d6ce726	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	45163	11166	0	0	0.140199	USD	1396	2026-03-22 11:34:45.412572+00
100	1e583e9a-8df9-424c-8ac6-39cb306275bf	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	56363	192	0	0	0.071894	USD	1751	2026-03-22 11:34:53.792123+00
101	634ad4ec-b716-4e66-9b9b-de07e37e5eb1	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	56588	124	56192	0	0.001425	USD	1764	2026-03-22 11:34:58.365447+00
102	adba772f-b384-40fe-ae71-e1284e0830df	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	56745	745	0	0	0.076519	USD	2075	2026-03-22 11:35:18.994585+00
103	60ef8bc0-2c7f-46ac-8963-aff561b7fb30	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	57523	631	0	0	0.076636	USD	1675	2026-03-22 11:35:34.732395+00
104	013b062b-240d-4766-a1d3-70d8fb66187b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58187	204	0	0	0.074264	USD	1049	2026-03-22 11:35:42.187254+00
105	618f61d1-1e43-43f9-8499-ca1e147863fe	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58424	129	57344	0	0.002318	USD	2206	2026-03-22 11:35:49.731679+00
106	c53b255d-cb13-4401-9aab-36c67d400987	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58757	953	30080	0	0.042994	USD	1092	2026-03-22 11:36:10.16634+00
107	c310f31b-32b2-43b9-910e-bf231394ba97	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	59743	4016	0	0	0.104799	USD	1140	2026-03-22 11:37:27.711555+00
108	36ec1ef2-561d-4679-b65f-9170d7353e2d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	63793	187	0	0	0.081144	USD	1205	2026-03-22 11:37:41.273913+00
109	df9c85b9-6840-4196-b61d-7804cd0db4ce	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	79669	451	0	0	0.102969	USD	1582	2026-03-22 11:37:52.953738+00
110	edb4c7f5-f07b-4efa-95be-2b27db13bfe7	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	80153	273	0	0	0.102239	USD	1015	2026-03-22 11:38:02.449207+00
111	1dac869f-9726-4238-b2db-17f02057e0a6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	80458	335	0	0	0.103085	USD	2123	2026-03-22 11:38:21.35982+00
112	38b9cdb9-dd93-43fb-90d4-f1daacba2ec5	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	80826	139	0	0	0.102075	USD	3153	2026-03-22 11:38:42.555778+00
113	3b1a0b74-bdba-4293-9fd2-e7a32c60578b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	81551	158	0	0	0.103124	USD	1077	2026-03-22 11:38:49.258746+00
114	b3289725-490c-4bb0-9062-f4baaed67552	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	81742	241	0	0	0.103985	USD	991	2026-03-22 11:39:05.467142+00
115	7ff92fc4-b42e-4e19-8844-a875ccca3993	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	82016	573	0	0	0.106817	USD	991	2026-03-22 11:39:19.695831+00
116	f11e0375-2839-4ab8-8904-9336b6b85490	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	82622	331	0	0	0.105760	USD	1184	2026-03-22 11:39:31.182921+00
117	99109daf-cc13-4a49-9f72-20cd90b49c51	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	82986	249	0	0	0.105600	USD	1042	2026-03-22 11:39:43.84182+00
118	f5658d02-6db2-4b71-bf6d-f72835e03cdf	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	83268	169	0	0	0.105353	USD	2713	2026-03-22 11:39:54.621441+00
119	87ba6b2d-b3f0-421b-a077-7d847c379131	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	83470	210	0	0	0.105912	USD	1181	2026-03-22 11:40:03.657635+00
120	391a1faa-199b-48e0-9b0d-3f996ba22dbb	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	83713	91	0	0	0.105324	USD	1565	2026-03-22 11:40:11.128221+00
121	7f9b2f2c-3ae6-4806-8d51-beee76adebe5	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	83837	91	0	0	0.105479	USD	1940	2026-03-22 11:40:18.826142+00
122	5932051d-d1c3-4dd6-971a-c63ab4060802	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	83961	115	81792	0	0.003574	USD	1476	2026-03-22 11:40:27.282185+00
123	de9649aa-2ff1-4612-b1b8-15b33ab37de3	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	84370	112	0	0	0.106302	USD	1918	2026-03-22 11:40:37.277115+00
124	25b32490-9e45-4c5e-809d-6320a24e370d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	84522	100	0	0	0.106402	USD	1081	2026-03-22 11:40:41.94275+00
125	13307cfa-8e50-42d0-b6af-feb531c3cdef	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	110093	457	0	0	0.141044	USD	1228	2026-03-22 11:40:55.318608+00
126	2a0e1fba-49d9-4d77-b9c9-222571eaa7d2	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	110580	1696	58240	0	0.078145	USD	1223	2026-03-22 11:41:29.653066+00
127	c71be044-9a01-4cf5-8eda-173509c6440a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	99161	10427	0	0	0.202154	USD	1953	2026-03-22 11:44:44.592922+00
128	c1c1d5db-4076-4710-bc58-99ca227c385b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	37823	45	0	0	0.047616	USD	1435	2026-03-22 11:44:53.002249+00
129	2080dbe2-0a27-4776-bfd5-a145b06a769d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	38279	45	0	0	0.048186	USD	1686	2026-03-22 11:44:57.197481+00
130	381c0fa0-d522-4ef3-af9c-c479050b721e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58312	270	0	0	0.074915	USD	1731	2026-03-22 11:45:06.965259+00
131	477a2d4b-cac3-4005-93ef-1e3504120a7e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58614	162	0	0	0.074482	USD	1843	2026-03-22 11:45:16.311261+00
132	b2d6c0b5-065e-44a7-80c9-025c3d207b3d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	58808	282	0	0	0.075625	USD	1325	2026-03-22 11:45:25.612587+00
133	d86d9358-0efc-469b-bc9e-6b74c9eea809	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	59122	699	0	0	0.079145	USD	2385	2026-03-22 11:45:45.912118+00
134	27cb7a24-36eb-403d-8bd5-918edc8d8ed6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	59853	599	0	0	0.079309	USD	2688	2026-03-22 11:46:02.535132+00
135	889a6791-a026-4dfe-9617-95150652869e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	60484	249	0	0	0.077472	USD	1944	2026-03-22 11:46:15.287837+00
136	6411b0ea-9fed-49e2-92b6-23c9c0a2b6e5	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	60765	370	0	0	0.078731	USD	1631	2026-03-22 11:46:29.213971+00
137	4c6dfb7d-c72c-46b7-9f07-b8a6f69873a5	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	61167	2886	0	0	0.098104	USD	2762	2026-03-22 11:47:26.786936+00
138	a3266452-fcaa-4fac-a589-0a7e715c5269	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	64241	442	16000	0	0.063616	USD	2376	2026-03-22 11:47:41.489305+00
139	994689b3-f5b9-4143-9fb7-0a8a34f8967a	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	64715	122	0	0	0.081809	USD	2535	2026-03-22 11:47:50.965658+00
140	0dbcbf5c-27cd-42fb-9cc3-320a2ae0a758	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	64869	160	16000	0	0.062286	USD	2039	2026-03-22 11:47:58.529902+00
141	61763f42-9eee-46f6-89f2-2261ecc17e68	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	65089	97	0	0	0.082089	USD	1835	2026-03-22 11:48:03.733431+00
142	b4438999-7273-4537-96c9-15c2593210c8	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	65402	45	0	0	0.082090	USD	2406	2026-03-22 11:48:10.178585+00
143	61cdd6aa-955a-40df-8938-4fadc1297068	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	66492	97	0	0	0.083843	USD	2013	2026-03-22 11:48:17.212154+00
144	4b49cb09-1159-4af7-a8b7-f524fe9eeaaa	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	66650	45	0	0	0.083650	USD	2251	2026-03-22 11:48:25.443003+00
145	d2cebb9d-f0b8-4786-9e75-1016e90539cf	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	68111	179	0	0	0.086481	USD	983	2026-03-22 11:48:34.477267+00
146	86980587-c158-428d-94a7-435689920628	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	68322	876	0	0	0.091972	USD	1130	2026-03-22 11:48:54.889827+00
147	12becaa0-a015-43cc-b8c9-4470959aec8d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	69230	135	66432	0	0.004510	USD	1980	2026-03-22 11:49:01.520685+00
148	d8e79474-ccde-4e1b-b4dd-50d632fb02c6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	69553	117	0	0	0.087819	USD	3335	2026-03-22 11:49:10.033381+00
149	b91c0cb1-883b-4502-a527-4a48fc8ae118	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	69702	939	0	0	0.094170	USD	1936	2026-03-22 11:49:31.682568+00
150	dc29210c-8610-401c-aad0-5654fa7c982f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	70673	85	0	0	0.088979	USD	2392	2026-03-22 11:49:40.971415+00
151	4b990c66-e120-49ad-a305-0d02c54759ca	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	70790	105	0	0	0.089275	USD	4405	2026-03-22 11:49:50.551958+00
152	9b5ef436-eb8d-490d-bb0d-b6ca794fe67b	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	71703	91	16000	0	0.070311	USD	2524	2026-03-22 11:50:12.126604+00
153	e2f20c27-dc37-4349-8e9b-f80675928afd	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	71943	45	59648	0	0.015706	USD	2179	2026-03-22 11:50:16.227621+00
154	3a8b25da-5819-49d4-9723-0d840b46c67d	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	72349	60	0	0	0.090886	USD	1724	2026-03-22 11:50:20.955007+00
155	8b3261c2-66ce-4982-b89a-64624b8d8f8f	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	72414	112	0	0	0.091357	USD	1983	2026-03-22 11:50:26.995666+00
156	e79dd076-cdc7-4af6-80fb-aa029ebb971c	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	72566	326	0	0	0.093153	USD	1006	2026-03-22 11:50:36.052666+00
157	b2d0e5e7-8840-4b34-8565-43875ff4ee08	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	75719	192	0	0	0.096089	USD	3791	2026-03-22 12:29:26.876231+00
158	7648ec58-1639-4261-9a3a-dd73d0a0b9da	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	79842	129	0	0	0.100770	USD	3320	2026-03-22 12:29:35.728799+00
159	7425d6f9-3a49-40a4-93b3-9bdc9d5a3aa6	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	89846	135	0	0	0.113320	USD	2644	2026-03-22 12:29:44.36552+00
160	c9f7c287-4e2d-4c2f-9449-82907990a979	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	90734	45	0	0	0.113755	USD	2798	2026-03-22 12:29:51.168102+00
161	de25bee3-8cc2-486d-95fa-4e67948692a9	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	94958	331	0	0	0.121180	USD	2612	2026-03-22 12:30:01.948313+00
162	ce7cd749-99af-4d61-a7d1-5170d7f945e2	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	95323	72	0	0	0.119694	USD	1437	2026-03-22 12:30:07.913203+00
163	5280a67a-822c-493a-91ac-47c2f6822698	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	98810	445	0	0	0.126850	USD	2736	2026-03-22 12:30:22.302736+00
164	121abb5e-5dc6-4005-b866-f5173c43c8da	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	99289	517	0	0	0.127989	USD	3669	2026-03-22 12:30:38.08668+00
165	007f85ee-ff8f-4a40-899a-03fe18a1e398	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	99840	327	0	0	0.127252	USD	3515	2026-03-22 12:30:53.357895+00
166	411d3f45-6d97-4df8-b704-f66d798d7dfc	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	100200	3230	0	0	0.149475	USD	2693	2026-03-22 12:32:02.480868+00
167	84bcb971-5dc2-41b1-835f-2ef7465a7d65	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	103463	209	0	0	0.130896	USD	1256	2026-03-22 12:32:20.963406+00
168	3d36af99-2337-49e9-b973-7523521e65a4	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	103839	112	0	0	0.130639	USD	2350	2026-03-22 12:32:34.759135+00
169	eaf1138c-719f-4d11-9564-ec63d0d3bf4e	user	PackyCode-OpenAI	gpt-5.4-x0.5	t	103991	347	0	0	0.132591	USD	1393	2026-03-22 12:32:44.147312+00
\.


--
-- Data for Name: user_api_keys; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_api_keys (id, username, name, api_key, created_at, last_used_at) FROM stdin;
d49dd690-cff0-4ee4-b667-0ce29da24128	user	API Key 1	lpk_9c0ec4307a8da03561a9473dee23d8d932ff22400a44610e	2026-03-17 12:24:39.513+00	2026-03-22 12:41:12.949+00
84cf6607-ab96-46bb-bd94-b24f687d3c9e	user	API Key 2	lpk_1e829352f10936e9481301018f4e562e6bca2dfceceb4eeb	2026-03-19 07:10:47.173+00	2026-03-20 14:27:30.451+00
d3a9c90f-5211-4eb5-92eb-45361b3e1638	user1	API Key 1	lpk_c595331d504292bd5485071e88c7abf5efa770cf8fc4981a	2026-03-19 07:49:49.093+00	\N
826c3537-03f4-4be8-85fc-eb94f715fd9d	xujianhua9	API Key 1	lpk_cf208eb4c6a1d24d48904a78762f8c40ed4f5805cd5ff444	2026-03-19 12:50:05.127+00	2026-03-20 08:32:06.654+00
8369660f-6b78-4434-8109-a8036c2034f4	zhangtao	API Key 1	lpk_708f1dee7e9ac7e162e63194b86d9c15bf145375ae9c1ef8	2026-03-19 11:40:51.07+00	2026-03-20 08:30:07.52+00
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (username, password, balance_usd, total_recharged_usd, total_spent_usd, last_recharged_at, updated_at) FROM stdin;
lwx	a839274116	0.000000	0.000000	0.000000	\N	2026-03-21 13:26:58.075513+00
user1	Lzy_08032211	0.000000	0.000000	0.000000	\N	2026-03-21 13:26:58.077865+00
xujianhua9	FAMILY0702	1.418834	1.420000	0.001166	2026-03-19 12:53:53.148+00	2026-03-21 13:26:58.078797+00
zhangtao	Hik2601;	1.383610	2.840000	1.508431	2026-03-19 12:31:46.391+00	2026-03-21 13:26:58.079703+00
user	123456	86.172792	100.000000	13.827208	2026-03-19 07:49:36.269+00	2026-03-22 12:32:44.119614+00
\.


--
-- Data for Name: wallet_ledger; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.wallet_ledger (id, username, request_id, entry_type, amount_usd, balance_after_usd, created_at) FROM stdin;
1	user	a5bf8965-9e9b-409e-9efd-331f3f1b97dd	reserve	-0.010000	97.567019	2026-03-21 13:19:09.035751+00
2	user	a5bf8965-9e9b-409e-9efd-331f3f1b97dd	refund	0.009881	97.576900	2026-03-21 13:19:11.298528+00
3	user	2c1ce40f-0c0e-45be-9c6e-a77a509094d6	reserve	-0.010000	97.566900	2026-03-21 13:19:35.514545+00
4	user	52eeb3d5-d15a-42fd-8f79-8a001cc0aa63	reserve	-0.010000	97.556900	2026-03-21 13:19:35.529947+00
5	user	52eeb3d5-d15a-42fd-8f79-8a001cc0aa63	refund	0.009881	97.566781	2026-03-21 13:19:36.942283+00
6	user	bf4235ec-5d8c-4ceb-8659-f6cd4a5f4782	reserve	-0.010000	97.556781	2026-03-21 13:19:36.969587+00
7	user	2c1ce40f-0c0e-45be-9c6e-a77a509094d6	refund	0.009881	97.566662	2026-03-21 13:19:37.379857+00
8	user	6537a5e5-d00a-4d30-b283-655ce6ed9eb6	reserve	-0.010000	97.556662	2026-03-21 13:19:37.418589+00
9	user	bf4235ec-5d8c-4ceb-8659-f6cd4a5f4782	refund	0.009881	97.566543	2026-03-21 13:19:38.231105+00
10	user	488701be-7a3a-42c9-b3ce-1033f8727a85	reserve	-0.010000	97.556543	2026-03-21 13:19:38.249213+00
11	user	488701be-7a3a-42c9-b3ce-1033f8727a85	refund	0.009881	97.566424	2026-03-21 13:19:39.014787+00
12	user	6efad8d5-2498-4de0-bdfa-c093a220b385	reserve	-0.010000	97.556424	2026-03-21 13:19:39.034727+00
13	user	6537a5e5-d00a-4d30-b283-655ce6ed9eb6	refund	0.009881	97.566305	2026-03-21 13:19:39.118127+00
14	user	6efad8d5-2498-4de0-bdfa-c093a220b385	refund	0.009881	97.576186	2026-03-21 13:19:39.977777+00
15	user	39bd446b-66bc-41a4-93c2-fe1d6605542c	reserve	-0.327608	97.249411	2026-03-22 08:06:00.199756+00
16	user	39bd446b-66bc-41a4-93c2-fe1d6605542c	refund	0.300786	97.550197	2026-03-22 08:06:06.165034+00
17	user	f7d88595-7d1f-488a-ad68-25f41f6cf81a	reserve	-0.328163	97.222034	2026-03-22 08:06:06.204048+00
18	user	f7d88595-7d1f-488a-ad68-25f41f6cf81a	refund	0.300887	97.522921	2026-03-22 08:06:14.404554+00
19	user	0933cac9-cd72-4a8c-8a3b-585c621fd878	reserve	-0.333608	97.189313	2026-03-22 08:06:14.620332+00
20	user	0933cac9-cd72-4a8c-8a3b-585c621fd878	refund	0.301992	97.491305	2026-03-22 08:06:19.735872+00
21	user	53bbf3d2-714f-4be9-a3e7-151fb57d5d5e	reserve	-0.339470	97.151835	2026-03-22 08:06:19.829929+00
22	user	53bbf3d2-714f-4be9-a3e7-151fb57d5d5e	refund	0.299212	97.451047	2026-03-22 08:06:34.069234+00
23	user	099e6ae3-718b-40cc-8f39-0923f6d927f6	reserve	-0.340453	97.110594	2026-03-22 08:07:41.872692+00
24	user	099e6ae3-718b-40cc-8f39-0923f6d927f6	refund	0.299002	97.409596	2026-03-22 08:07:57.950086+00
25	user	422e219a-7151-4b50-942e-e05598b6920b	reserve	-0.341514	97.068082	2026-03-22 08:09:17.379262+00
26	user	422e219a-7151-4b50-942e-e05598b6920b	refund	0.299254	97.367336	2026-03-22 08:09:33.031029+00
27	user	deb63a47-a112-46e4-bb9f-3cb888bf3c19	reserve	-0.288400	97.078936	2026-03-22 08:13:57.181166+00
28	user	63a1d53e-9378-4033-88cc-f15f751684cd	reserve	-0.323155	96.755781	2026-03-22 08:13:57.189296+00
29	user	deb63a47-a112-46e4-bb9f-3cb888bf3c19	refund	0.285542	97.041323	2026-03-22 08:14:00.597223+00
30	user	63a1d53e-9378-4033-88cc-f15f751684cd	refund	0.301197	97.342520	2026-03-22 08:14:02.328477+00
31	user	22db9b8e-8b67-442f-be58-d19ecc7f2cdb	reserve	-0.307660	97.034860	2026-03-22 08:14:02.663726+00
32	user	22db9b8e-8b67-442f-be58-d19ecc7f2cdb	refund	0.290402	97.325262	2026-03-22 08:14:11.937881+00
33	user	06390367-942a-4a90-a32e-1f660064c099	reserve	-0.311676	97.013586	2026-03-22 08:14:14.240362+00
34	user	06390367-942a-4a90-a32e-1f660064c099	refund	0.291730	97.305316	2026-03-22 08:14:20.839762+00
35	user	8d9a3b6c-b416-4387-a6d2-f9c7ba0fb35e	reserve	-0.312300	96.993016	2026-03-22 08:14:20.887477+00
36	user	8d9a3b6c-b416-4387-a6d2-f9c7ba0fb35e	refund	0.291814	97.284830	2026-03-22 08:14:26.598098+00
37	user	f8dfe9f4-f26f-470b-a9c8-c7411da08c10	reserve	-0.288410	96.996420	2026-03-22 10:52:44.519904+00
38	user	f6cfcd77-7487-4f21-9313-cd896b71d38f	reserve	-0.323171	96.673249	2026-03-22 10:52:44.518635+00
39	user	f6cfcd77-7487-4f21-9313-cd896b71d38f	refund	0.301481	96.974730	2026-03-22 10:52:50.01728+00
40	user	f8dfe9f4-f26f-470b-a9c8-c7411da08c10	refund	0.285557	97.260287	2026-03-22 10:52:50.227244+00
41	user	003b97db-2a35-4ff6-8506-5118ac4ca976	reserve	-0.307604	96.952683	2026-03-22 10:52:50.285902+00
42	user	003b97db-2a35-4ff6-8506-5118ac4ca976	refund	0.291998	97.244681	2026-03-22 10:52:56.414874+00
43	user	760e7c42-63f6-449f-b6b9-06ee76be9e57	reserve	-0.314218	96.930463	2026-03-22 10:52:57.596068+00
44	user	760e7c42-63f6-449f-b6b9-06ee76be9e57	refund	0.291477	97.221940	2026-03-22 10:53:03.806773+00
45	user	1bcfb91d-4b12-42d9-9ea3-da692d4142eb	reserve	-0.314879	96.907061	2026-03-22 10:53:03.867676+00
46	user	1bcfb91d-4b12-42d9-9ea3-da692d4142eb	refund	0.291439	97.198500	2026-03-22 10:53:10.463343+00
47	user	a3cd30aa-ce47-4fc4-9fb8-29268b46ec28	reserve	-0.330617	96.867883	2026-03-22 10:53:10.706334+00
48	user	a3cd30aa-ce47-4fc4-9fb8-29268b46ec28	refund	0.293639	97.161522	2026-03-22 10:53:17.379346+00
49	user	fdc6bcab-ef1f-4d33-9caf-4479d5f51c84	reserve	-0.334696	96.826826	2026-03-22 10:53:17.589498+00
50	user	fdc6bcab-ef1f-4d33-9caf-4479d5f51c84	refund	0.294599	97.121425	2026-03-22 10:53:27.751553+00
51	user	c477479d-554a-4ffb-88ae-dcbb7c812bce	reserve	-0.335125	96.786300	2026-03-22 10:53:27.959027+00
52	user	c477479d-554a-4ffb-88ae-dcbb7c812bce	refund	0.295825	97.082125	2026-03-22 10:53:32.874116+00
53	user	3f94a86e-4602-4fb7-8a3b-cc679532d219	reserve	-0.340314	96.741811	2026-03-22 10:53:32.943259+00
54	user	3f94a86e-4602-4fb7-8a3b-cc679532d219	refund	0.287910	97.029721	2026-03-22 10:53:59.414912+00
55	user	6ef27088-47c6-42f5-adf0-6f4a0324c3a9	reserve	-0.325616	96.704105	2026-03-22 10:53:59.871393+00
56	user	6ef27088-47c6-42f5-adf0-6f4a0324c3a9	refund	0.298573	97.002678	2026-03-22 10:54:14.313601+00
57	user	2a22e866-e139-4379-b511-4f21465f759a	reserve	-0.326534	96.676144	2026-03-22 10:55:28.865724+00
58	user	2a22e866-e139-4379-b511-4f21465f759a	refund	0.302999	96.979143	2026-03-22 10:55:37.023674+00
59	user	0a4d3016-4418-48b1-8bc0-e3dd51796d14	reserve	-0.328625	96.650518	2026-03-22 10:55:37.07376+00
60	user	0a4d3016-4418-48b1-8bc0-e3dd51796d14	refund	0.302106	96.952624	2026-03-22 10:55:43.456781+00
61	user	49ca9356-9c36-47cc-b3d7-0a3c57554fbe	reserve	-0.307592	96.645032	2026-03-22 10:55:43.689176+00
62	user	49ca9356-9c36-47cc-b3d7-0a3c57554fbe	refund	0.305867	96.950899	2026-03-22 10:55:48.641441+00
63	user	7ecab08c-12c6-41b6-af24-f2212993593d	reserve	-0.309098	96.641801	2026-03-22 10:55:48.855075+00
64	user	7ecab08c-12c6-41b6-af24-f2212993593d	refund	0.290477	96.932278	2026-03-22 10:55:59.804952+00
65	user	56a09b2c-7497-4f27-812b-72f24e88bdf3	reserve	-0.310776	96.621502	2026-03-22 10:55:59.865722+00
66	user	56a09b2c-7497-4f27-812b-72f24e88bdf3	refund	0.290795	96.912297	2026-03-22 10:56:08.749632+00
67	user	22713021-99f1-4996-9290-95db6f920fbf	reserve	-0.336371	96.575926	2026-03-22 10:56:08.895589+00
68	user	22713021-99f1-4996-9290-95db6f920fbf	refund	0.295792	96.871718	2026-03-22 10:56:15.606288+00
69	user	5374248b-535d-49ff-8a89-da71652a8308	reserve	-0.346073	96.525645	2026-03-22 10:56:15.702553+00
70	user	5374248b-535d-49ff-8a89-da71652a8308	refund	0.292435	96.818080	2026-03-22 10:56:34.924469+00
71	user	999bffec-8580-4dab-970f-0a6cc46ba869	reserve	-0.330839	96.487241	2026-03-22 10:56:35.252265+00
72	user	999bffec-8580-4dab-970f-0a6cc46ba869	refund	0.303484	96.790725	2026-03-22 10:56:41.430265+00
73	user	be3a315a-4389-46fb-86d5-dff59befaf85	reserve	-0.307613	96.483112	2026-03-22 10:56:41.663622+00
74	user	be3a315a-4389-46fb-86d5-dff59befaf85	refund	0.291677	96.774789	2026-03-22 10:56:47.247878+00
75	user	10a3b427-62d0-44ec-a680-0886185fe75f	reserve	-0.311671	96.463118	2026-03-22 10:56:47.49792+00
76	user	10a3b427-62d0-44ec-a680-0886185fe75f	refund	0.289664	96.752782	2026-03-22 10:56:58.255771+00
77	user	524596d0-f290-494b-8523-0a868ab60959	reserve	-0.313488	96.439294	2026-03-22 10:56:58.319285+00
78	user	524596d0-f290-494b-8523-0a868ab60959	refund	0.289987	96.729281	2026-03-22 10:57:08.611588+00
79	user	e08126b0-d2be-4707-82d1-a8e2309fd52b	reserve	-0.330788	96.398493	2026-03-22 10:57:08.75393+00
80	user	e08126b0-d2be-4707-82d1-a8e2309fd52b	refund	0.293000	96.691493	2026-03-22 10:57:19.938614+00
81	user	ddb2a918-1d1a-462a-a15b-d6d5998da141	reserve	-0.341861	96.349632	2026-03-22 10:57:20.122616+00
82	user	ddb2a918-1d1a-462a-a15b-d6d5998da141	refund	0.296247	96.645879	2026-03-22 10:57:29.187053+00
83	user	8b44b751-fd47-4c99-b9e2-cbc54769b06b	reserve	-0.342149	96.303730	2026-03-22 10:57:29.35762+00
84	user	8b44b751-fd47-4c99-b9e2-cbc54769b06b	refund	0.295485	96.599215	2026-03-22 10:57:37.313777+00
85	user	17311c8c-bf25-455a-bc41-4afc9f7d6129	reserve	-0.367880	96.231335	2026-03-22 10:57:37.438667+00
86	user	17311c8c-bf25-455a-bc41-4afc9f7d6129	refund	0.293431	96.524766	2026-03-22 10:58:02.533766+00
87	user	6911efd4-2ef0-4278-b089-3568cd5efeeb	reserve	-0.333157	96.191609	2026-03-22 10:58:03.002229+00
88	user	6911efd4-2ef0-4278-b089-3568cd5efeeb	refund	0.303168	96.494777	2026-03-22 10:58:11.535433+00
89	user	1347ddc2-0daa-41c6-9bc4-e5e2d62f1674	reserve	-0.334169	96.160608	2026-03-22 10:58:11.599655+00
90	user	1347ddc2-0daa-41c6-9bc4-e5e2d62f1674	refund	0.303714	96.464322	2026-03-22 10:58:19.206319+00
93	user	33930696-cbf0-4383-95d1-ded51e4e0050	reserve	-0.307864	96.114502	2026-03-22 10:58:28.846548+00
94	user	33930696-cbf0-4383-95d1-ded51e4e0050	refund	0.292190	96.406692	2026-03-22 10:58:33.402684+00
97	user	44306099-3ad5-4b9a-bf02-deb0fc1d50b6	reserve	-0.314029	96.070705	2026-03-22 10:58:43.966308+00
98	user	44306099-3ad5-4b9a-bf02-deb0fc1d50b6	refund	0.290393	96.361098	2026-03-22 10:58:53.42963+00
91	user	c027fe6d-456a-4cdd-b531-dd26788b078e	reserve	-0.347701	96.116621	2026-03-22 10:58:19.335375+00
92	user	c027fe6d-456a-4cdd-b531-dd26788b078e	refund	0.305745	96.422366	2026-03-22 10:58:28.63969+00
95	user	220b912c-9ed9-4885-a94f-0dfd5bbe6372	reserve	-0.312191	96.094501	2026-03-22 10:58:33.738473+00
96	user	220b912c-9ed9-4885-a94f-0dfd5bbe6372	refund	0.290233	96.384734	2026-03-22 10:58:43.914359+00
99	user	962f6559-0a85-41c6-9e4c-eefaa0906092	reserve	-0.344993	96.016105	2026-03-22 11:07:24.015229+00
100	user	962f6559-0a85-41c6-9e4c-eefaa0906092	refund	0.305724	96.321829	2026-03-22 11:07:28.470153+00
101	user	542ba10a-ad8f-4a55-b547-60999e716b13	reserve	-0.345284	95.976545	2026-03-22 11:07:28.517573+00
102	user	542ba10a-ad8f-4a55-b547-60999e716b13	refund	0.306152	96.282697	2026-03-22 11:07:31.449174+00
103	user	670819c5-627b-4c3d-a248-2abbe6ef47b6	reserve	-0.347611	95.935086	2026-03-22 11:07:35.077063+00
104	user	670819c5-627b-4c3d-a248-2abbe6ef47b6	refund	0.306579	96.241665	2026-03-22 11:07:40.278425+00
105	user	7abe3828-4944-4bd5-9ab5-87a28083970e	reserve	-0.348620	95.893045	2026-03-22 11:07:40.3471+00
106	user	7abe3828-4944-4bd5-9ab5-87a28083970e	refund	0.306661	96.199706	2026-03-22 11:07:45.249008+00
107	user	04be6b9b-8f54-4def-bea3-b0f3eefa145a	reserve	-0.348768	95.850938	2026-03-22 11:07:45.308261+00
108	user	04be6b9b-8f54-4def-bea3-b0f3eefa145a	refund	0.306760	96.157698	2026-03-22 11:07:48.187883+00
109	user	8c66cee8-5405-4f90-b345-9b4967d26aef	reserve	-0.348882	95.808816	2026-03-22 11:07:49.068382+00
110	user	8c66cee8-5405-4f90-b345-9b4967d26aef	refund	0.306724	96.115540	2026-03-22 11:07:59.960715+00
111	user	39a95170-d0d0-4d49-9b40-eecf80fbc616	reserve	-0.349026	95.766514	2026-03-22 11:08:14.106573+00
112	user	39a95170-d0d0-4d49-9b40-eecf80fbc616	refund	0.306546	96.073060	2026-03-22 11:08:18.594704+00
113	user	952d2f06-2adf-490d-99c8-764489124eba	reserve	-0.349320	95.723740	2026-03-22 11:08:18.642988+00
114	user	952d2f06-2adf-490d-99c8-764489124eba	refund	0.290896	96.014636	2026-03-22 11:09:01.019116+00
115	user	9cc173e0-1e71-40b7-bed4-6d9418a3aad2	reserve	-0.352276	95.662360	2026-03-22 11:09:02.25867+00
116	user	9cc173e0-1e71-40b7-bed4-6d9418a3aad2	refund	0.307152	95.969512	2026-03-22 11:09:05.915701+00
117	user	62ec2098-1397-48a4-bb6b-c46a3289670b	reserve	-0.352475	95.617037	2026-03-22 11:09:05.961516+00
118	user	62ec2098-1397-48a4-bb6b-c46a3289670b	refund	0.303569	95.920606	2026-03-22 11:09:24.385792+00
119	user	5e292c7c-3c05-4d3d-9eb4-b5113b8715d6	reserve	-0.353257	95.567349	2026-03-22 11:10:34.520602+00
120	user	5e292c7c-3c05-4d3d-9eb4-b5113b8715d6	refund	0.305507	95.872856	2026-03-22 11:10:45.172781+00
121	user	a0edc0ed-8ab6-4caf-af6b-2b8ec3489ba8	reserve	-0.353724	95.519132	2026-03-22 11:16:22.607129+00
122	user	a0edc0ed-8ab6-4caf-af6b-2b8ec3489ba8	refund	0.304077	95.823209	2026-03-22 11:16:37.632404+00
123	user	27216cd0-cbe6-4641-9fa9-ad4a73fc4618	reserve	-0.354450	95.468759	2026-03-22 11:18:01.30181+00
124	user	27216cd0-cbe6-4641-9fa9-ad4a73fc4618	refund	0.303067	95.771826	2026-03-22 11:18:16.355347+00
125	user	5c4f9af2-a7a0-4f59-b6d8-06f5d9f501ce	reserve	-0.355392	95.416434	2026-03-22 11:21:42.247753+00
126	user	5c4f9af2-a7a0-4f59-b6d8-06f5d9f501ce	refund	0.307202	95.723636	2026-03-22 11:21:46.992717+00
127	user	5287393f-ac49-43b9-a339-be5a3dce8510	reserve	-0.355699	95.367937	2026-03-22 11:21:47.068376+00
128	user	5287393f-ac49-43b9-a339-be5a3dce8510	refund	0.288054	95.655991	2026-03-22 11:22:41.03461+00
129	user	68f560ac-308c-4ab2-a64b-3b4905dcb60d	reserve	-0.359177	95.296814	2026-03-22 11:22:43.432279+00
130	user	68f560ac-308c-4ab2-a64b-3b4905dcb60d	refund	0.307442	95.604256	2026-03-22 11:22:50.542653+00
131	user	26df72d5-d90b-4de4-bfc1-eb34fc833d2f	reserve	-0.359485	95.244771	2026-03-22 11:22:50.597883+00
132	user	26df72d5-d90b-4de4-bfc1-eb34fc833d2f	refund	0.306055	95.550826	2026-03-22 11:22:58.677198+00
133	user	34eb031b-547f-483c-be87-f833331b4d15	reserve	-0.359944	95.190882	2026-03-22 11:23:38.300413+00
134	user	34eb031b-547f-483c-be87-f833331b4d15	refund	0.307314	95.498196	2026-03-22 11:23:43.815641+00
135	user	2500f66a-d1f9-49db-b135-670b41920dac	reserve	-0.360335	95.137861	2026-03-22 11:23:43.870795+00
136	user	2500f66a-d1f9-49db-b135-670b41920dac	refund	0.351061	95.488922	2026-03-22 11:23:52.761332+00
137	user	b9545312-6b4a-4597-8823-96a419044915	reserve	-0.362622	95.126300	2026-03-22 11:23:53.04734+00
138	user	b9545312-6b4a-4597-8823-96a419044915	refund	0.306860	95.433160	2026-03-22 11:24:10.109964+00
139	user	20c78a62-029b-4da0-9524-f37443bf0a60	reserve	-0.382123	95.051037	2026-03-22 11:24:10.28639+00
140	user	20c78a62-029b-4da0-9524-f37443bf0a60	refund	0.309547	95.360584	2026-03-22 11:24:15.922326+00
141	user	dc76ad68-cc8b-4696-b5fd-e0a4b0ee3c81	reserve	-0.384353	94.976231	2026-03-22 11:24:16.084+00
142	user	dc76ad68-cc8b-4696-b5fd-e0a4b0ee3c81	refund	0.310203	95.286434	2026-03-22 11:24:20.752896+00
143	user	f0ce9bdd-67d4-4c08-bab1-8de70035a7c7	reserve	-0.398141	94.888293	2026-03-22 11:24:20.836063+00
144	user	f0ce9bdd-67d4-4c08-bab1-8de70035a7c7	refund	0.309977	95.198270	2026-03-22 11:24:26.082046+00
145	user	b5a4365a-af7b-4d35-b395-19399dc14027	reserve	-0.403350	94.794920	2026-03-22 11:24:26.220503+00
146	user	b5a4365a-af7b-4d35-b395-19399dc14027	refund	0.311122	95.106042	2026-03-22 11:24:31.412809+00
147	user	6da12a0e-8450-490c-8ba2-e928f3dd7961	reserve	-0.403889	94.702153	2026-03-22 11:24:31.483234+00
148	user	6da12a0e-8450-490c-8ba2-e928f3dd7961	refund	0.311243	95.013396	2026-03-22 11:24:37.403484+00
149	user	dffe8cdb-d64c-4330-9dc7-ca67a78af3b7	reserve	-0.406495	94.606901	2026-03-22 11:24:37.475826+00
150	user	dffe8cdb-d64c-4330-9dc7-ca67a78af3b7	refund	0.311887	94.918788	2026-03-22 11:24:42.902796+00
151	user	2df96eea-0317-4c75-a53a-ba1b62aba16d	reserve	-0.407375	94.511413	2026-03-22 11:24:42.993063+00
152	user	2df96eea-0317-4c75-a53a-ba1b62aba16d	refund	0.312065	94.823478	2026-03-22 11:24:55.676105+00
153	user	c4d12919-cc68-4652-b6d8-494d085795e0	reserve	-0.413891	94.409587	2026-03-22 11:24:55.77623+00
154	user	c4d12919-cc68-4652-b6d8-494d085795e0	refund	0.313622	94.723209	2026-03-22 11:25:00.808995+00
155	user	36a6485a-e0ad-40bb-986c-c54ae4244ce5	reserve	-0.417360	94.305849	2026-03-22 11:25:00.885127+00
156	user	36a6485a-e0ad-40bb-986c-c54ae4244ce5	refund	0.314064	94.619913	2026-03-22 11:25:06.326762+00
157	user	97dad0b2-208d-4f14-8d42-ba378c180f88	reserve	-0.421440	94.198473	2026-03-22 11:25:06.378216+00
158	user	97dad0b2-208d-4f14-8d42-ba378c180f88	refund	0.314777	94.513250	2026-03-22 11:25:11.606412+00
159	user	1a3cde29-0dc7-4e03-96d8-00f5d88ec9ad	reserve	-0.421956	94.091294	2026-03-22 11:25:11.674195+00
160	user	1a3cde29-0dc7-4e03-96d8-00f5d88ec9ad	refund	0.361280	94.452574	2026-03-22 11:25:16.826665+00
161	user	91fa533d-9e26-4df5-9c2b-38c1f3378f0e	reserve	-0.425509	94.027065	2026-03-22 11:25:16.908101+00
162	user	91fa533d-9e26-4df5-9c2b-38c1f3378f0e	refund	0.309955	94.337020	2026-03-22 11:25:51.245891+00
163	user	3f67fe99-2a5d-4ab8-b766-c6d399477a41	reserve	-0.426966	93.910054	2026-03-22 11:25:52.483037+00
164	user	3f67fe99-2a5d-4ab8-b766-c6d399477a41	refund	0.310726	94.220780	2026-03-22 11:26:14.812365+00
165	user	9e576330-8976-4973-b9f7-886427a6236a	reserve	-0.428153	93.792627	2026-03-22 11:26:15.959049+00
166	user	9e576330-8976-4973-b9f7-886427a6236a	refund	0.315856	94.108483	2026-03-22 11:26:36.96901+00
167	user	f4131e55-860f-4ea0-9cc3-16787d97559e	reserve	-0.428412	93.680071	2026-03-22 11:26:38.129188+00
168	user	f4131e55-860f-4ea0-9cc3-16787d97559e	refund	0.315992	93.996063	2026-03-22 11:26:43.848525+00
169	user	3994023b-3e57-4092-bc2b-f1bb74269c42	reserve	-0.428657	93.567406	2026-03-22 11:26:44.968569+00
170	user	3994023b-3e57-4092-bc2b-f1bb74269c42	refund	0.316228	93.883634	2026-03-22 11:26:56.343264+00
171	user	a5e25277-a2c2-44ff-94a9-a8f15742c610	reserve	-0.428893	93.454741	2026-03-22 11:26:57.445224+00
172	user	a5e25277-a2c2-44ff-94a9-a8f15742c610	refund	0.316317	93.771058	2026-03-22 11:27:05.96581+00
173	user	b71dd86c-81af-4aad-8464-eb1d70053599	reserve	-0.429120	93.341938	2026-03-22 11:27:07.111371+00
174	user	b71dd86c-81af-4aad-8464-eb1d70053599	refund	0.315389	93.657327	2026-03-22 11:27:16.986573+00
175	user	fdcda1bc-1399-4515-b8f7-68b40e0dc938	reserve	-0.429570	93.227757	2026-03-22 11:27:18.102334+00
176	user	fdcda1bc-1399-4515-b8f7-68b40e0dc938	refund	0.315814	93.543571	2026-03-22 11:27:25.944337+00
177	user	39df9621-2d8f-4251-bb11-85bd7a5e45dc	reserve	-0.429895	93.113676	2026-03-22 11:27:27.063743+00
178	user	39df9621-2d8f-4251-bb11-85bd7a5e45dc	refund	0.316596	93.430272	2026-03-22 11:27:33.130863+00
179	user	39e0fbb8-204e-40c3-b7e1-a8e887125c59	reserve	-0.430123	93.000149	2026-03-22 11:27:34.314445+00
180	user	39e0fbb8-204e-40c3-b7e1-a8e887125c59	refund	0.316712	93.316861	2026-03-22 11:27:40.000166+00
181	user	8c29cbeb-b8c6-4bb5-acf8-d034018d1d7f	reserve	-0.430656	92.886205	2026-03-22 11:27:41.09125+00
182	user	8c29cbeb-b8c6-4bb5-acf8-d034018d1d7f	refund	0.315289	93.201494	2026-03-22 11:27:49.91395+00
183	user	8d133223-217d-4aba-88ad-0fbb86bae6f0	reserve	-0.431237	92.770257	2026-03-22 11:27:51.017269+00
184	user	8d133223-217d-4aba-88ad-0fbb86bae6f0	refund	0.317039	93.087296	2026-03-22 11:27:55.563018+00
185	user	52046763-f29d-4d5a-bc62-7bf245801f38	reserve	-0.431460	92.655836	2026-03-22 11:27:56.703146+00
186	user	52046763-f29d-4d5a-bc62-7bf245801f38	refund	0.313190	92.969026	2026-03-22 11:28:18.704232+00
187	user	50cac2a7-7aca-4716-9bea-c29548cac6dd	reserve	-0.432654	92.536372	2026-03-22 11:28:19.880343+00
188	user	50cac2a7-7aca-4716-9bea-c29548cac6dd	refund	0.316429	92.852801	2026-03-22 11:28:28.802491+00
189	user	059e7441-3514-4d5a-80b8-eccabeedb81a	reserve	-0.433170	92.419631	2026-03-22 11:28:29.944864+00
190	user	059e7441-3514-4d5a-80b8-eccabeedb81a	refund	0.420131	92.839762	2026-03-22 11:28:34.653442+00
191	user	3de69273-741a-48dc-9b62-07e932a985e8	reserve	-0.294083	92.545679	2026-03-22 11:28:35.726291+00
192	user	3de69273-741a-48dc-9b62-07e932a985e8	refund	0.139364	92.685043	2026-03-22 11:31:01.360589+00
193	user	d16c2a82-635d-4d49-90de-37fc8e5e2beb	reserve	-0.345220	92.339823	2026-03-22 11:31:01.548572+00
194	user	d16c2a82-635d-4d49-90de-37fc8e5e2beb	refund	0.307272	92.647095	2026-03-22 11:31:06.041217+00
195	user	7c4f57ea-d1af-40ae-a5b4-ce118e023d00	reserve	-0.346181	92.300914	2026-03-22 11:31:06.094937+00
196	user	7c4f57ea-d1af-40ae-a5b4-ce118e023d00	refund	0.307500	92.608414	2026-03-22 11:31:20.483977+00
197	user	2bba5fa1-510a-41df-af8a-66c02d6ce726	reserve	-0.368635	92.239779	2026-03-22 11:31:20.591019+00
198	user	2bba5fa1-510a-41df-af8a-66c02d6ce726	refund	0.228436	92.468215	2026-03-22 11:34:45.404823+00
199	user	1e583e9a-8df9-424c-8ac6-39cb306275bf	reserve	-0.388248	92.079967	2026-03-22 11:34:46.698838+00
200	user	1e583e9a-8df9-424c-8ac6-39cb306275bf	refund	0.316354	92.396321	2026-03-22 11:34:53.783887+00
201	user	634ad4ec-b716-4e66-9b9b-de07e37e5eb1	reserve	-0.388615	92.007706	2026-03-22 11:34:53.860195+00
202	user	634ad4ec-b716-4e66-9b9b-de07e37e5eb1	refund	0.387190	92.394896	2026-03-22 11:34:58.362474+00
203	user	adba772f-b384-40fe-ae71-e1284e0830df	reserve	-0.388897	92.005999	2026-03-22 11:34:59.436671+00
204	user	adba772f-b384-40fe-ae71-e1284e0830df	refund	0.312378	92.318377	2026-03-22 11:35:18.986582+00
205	user	60ef8bc0-2c7f-46ac-8963-aff561b7fb30	reserve	-0.390113	91.928264	2026-03-22 11:35:20.184724+00
206	user	60ef8bc0-2c7f-46ac-8963-aff561b7fb30	refund	0.313477	92.241741	2026-03-22 11:35:34.706826+00
207	user	013b062b-240d-4766-a1d3-70d8fb66187b	reserve	-0.391138	91.850603	2026-03-22 11:35:35.878904+00
208	user	013b062b-240d-4766-a1d3-70d8fb66187b	refund	0.316874	92.167477	2026-03-22 11:35:42.180958+00
209	user	618f61d1-1e43-43f9-8499-ca1e147863fe	reserve	-0.391568	91.775909	2026-03-22 11:35:43.281857+00
210	user	618f61d1-1e43-43f9-8499-ca1e147863fe	refund	0.389250	92.165159	2026-03-22 11:35:49.726332+00
211	user	c53b255d-cb13-4401-9aab-36c67d400987	reserve	-0.392179	91.772980	2026-03-22 11:35:50.84846+00
212	user	c53b255d-cb13-4401-9aab-36c67d400987	refund	0.349185	92.122165	2026-03-22 11:36:10.16051+00
213	user	c310f31b-32b2-43b9-910e-bf231394ba97	reserve	-0.393761	91.728404	2026-03-22 11:36:11.32528+00
214	user	c310f31b-32b2-43b9-910e-bf231394ba97	refund	0.288962	92.017366	2026-03-22 11:37:27.702415+00
215	user	36ec1ef2-561d-4679-b65f-9170d7353e2d	reserve	-0.400448	91.616918	2026-03-22 11:37:28.949834+00
216	user	36ec1ef2-561d-4679-b65f-9170d7353e2d	refund	0.319304	91.936222	2026-03-22 11:37:41.265352+00
217	user	df9c85b9-6840-4196-b61d-7804cd0db4ce	reserve	-0.425153	91.511069	2026-03-22 11:37:41.478033+00
218	user	df9c85b9-6840-4196-b61d-7804cd0db4ce	refund	0.322184	91.833253	2026-03-22 11:37:52.946278+00
219	user	edb4c7f5-f07b-4efa-95be-2b27db13bfe7	reserve	-0.425964	91.407289	2026-03-22 11:37:54.137912+00
220	user	edb4c7f5-f07b-4efa-95be-2b27db13bfe7	refund	0.323725	91.731014	2026-03-22 11:38:02.437642+00
221	user	1dac869f-9726-4238-b2db-17f02057e0a6	reserve	-0.426506	91.304508	2026-03-22 11:38:03.569845+00
222	user	1dac869f-9726-4238-b2db-17f02057e0a6	refund	0.323421	91.627929	2026-03-22 11:38:21.352508+00
223	user	38b9cdb9-dd93-43fb-90d4-f1daacba2ec5	reserve	-0.427176	91.200753	2026-03-22 11:38:22.475193+00
224	user	38b9cdb9-dd93-43fb-90d4-f1daacba2ec5	refund	0.325101	91.525854	2026-03-22 11:38:42.552914+00
225	user	3b1a0b74-bdba-4293-9fd2-e7a32c60578b	reserve	-0.428263	91.097591	2026-03-22 11:38:42.713222+00
226	user	3b1a0b74-bdba-4293-9fd2-e7a32c60578b	refund	0.325139	91.422730	2026-03-22 11:38:49.255932+00
227	user	b3289725-490c-4bb0-9062-f4baaed67552	reserve	-0.428574	90.994156	2026-03-22 11:38:50.317639+00
228	user	b3289725-490c-4bb0-9062-f4baaed67552	refund	0.324589	91.318745	2026-03-22 11:39:05.463789+00
229	user	7ff92fc4-b42e-4e19-8844-a875ccca3993	reserve	-0.428976	90.889769	2026-03-22 11:39:06.5609+00
230	user	7ff92fc4-b42e-4e19-8844-a875ccca3993	refund	0.322159	91.211928	2026-03-22 11:39:19.691952+00
231	user	f11e0375-2839-4ab8-8904-9336b6b85490	reserve	-0.430021	90.781907	2026-03-22 11:39:20.786586+00
232	user	f11e0375-2839-4ab8-8904-9336b6b85490	refund	0.324261	91.106168	2026-03-22 11:39:31.180081+00
233	user	99109daf-cc13-4a49-9f72-20cd90b49c51	reserve	-0.430642	90.675526	2026-03-22 11:39:32.350749+00
234	user	99109daf-cc13-4a49-9f72-20cd90b49c51	refund	0.325042	91.000568	2026-03-22 11:39:43.837344+00
235	user	f5658d02-6db2-4b71-bf6d-f72835e03cdf	reserve	-0.431113	90.569455	2026-03-22 11:39:44.93345+00
236	user	f5658d02-6db2-4b71-bf6d-f72835e03cdf	refund	0.325760	90.895215	2026-03-22 11:39:54.618614+00
237	user	87ba6b2d-b3f0-421b-a077-7d847c379131	reserve	-0.431501	90.463714	2026-03-22 11:39:55.697737+00
238	user	87ba6b2d-b3f0-421b-a077-7d847c379131	refund	0.325589	90.789303	2026-03-22 11:40:03.642213+00
239	user	391a1faa-199b-48e0-9b0d-3f996ba22dbb	reserve	-0.431902	90.357401	2026-03-22 11:40:04.737294+00
240	user	391a1faa-199b-48e0-9b0d-3f996ba22dbb	refund	0.326578	90.683979	2026-03-22 11:40:11.123927+00
241	user	7f9b2f2c-3ae6-4806-8d51-beee76adebe5	reserve	-0.432149	90.251830	2026-03-22 11:40:12.227951+00
242	user	7f9b2f2c-3ae6-4806-8d51-beee76adebe5	refund	0.326670	90.578500	2026-03-22 11:40:18.821202+00
243	user	5932051d-d1c3-4dd6-971a-c63ab4060802	reserve	-0.432386	90.146114	2026-03-22 11:40:19.914694+00
244	user	5932051d-d1c3-4dd6-971a-c63ab4060802	refund	0.428812	90.574926	2026-03-22 11:40:27.278366+00
245	user	de9649aa-2ff1-4612-b1b8-15b33ab37de3	reserve	-0.433042	90.141884	2026-03-22 11:40:27.506469+00
246	user	de9649aa-2ff1-4612-b1b8-15b33ab37de3	refund	0.326740	90.468624	2026-03-22 11:40:37.274029+00
247	user	25b32490-9e45-4c5e-809d-6320a24e370d	reserve	-0.433369	90.035255	2026-03-22 11:40:37.375817+00
248	user	25b32490-9e45-4c5e-809d-6320a24e370d	refund	0.326967	90.362222	2026-03-22 11:40:41.938385+00
249	user	13307cfa-8e50-42d0-b6af-feb531c3cdef	reserve	-0.465456	89.896766	2026-03-22 11:40:42.020043+00
250	user	13307cfa-8e50-42d0-b6af-feb531c3cdef	refund	0.324412	90.221178	2026-03-22 11:40:55.315285+00
251	user	2a0e1fba-49d9-4d77-b9c9-222571eaa7d2	reserve	-0.466169	89.755009	2026-03-22 11:40:56.412188+00
252	user	2a0e1fba-49d9-4d77-b9c9-222571eaa7d2	refund	0.388024	90.143033	2026-03-22 11:41:29.648837+00
253	user	c71be044-9a01-4cf5-8eda-173509c6440a	reserve	-0.329377	89.813656	2026-03-22 11:41:30.891253+00
254	user	c71be044-9a01-4cf5-8eda-173509c6440a	refund	0.127223	89.940879	2026-03-22 11:44:44.58647+00
255	user	c1c1d5db-4076-4710-bc58-99ca227c385b	reserve	-0.357616	89.583263	2026-03-22 11:44:44.737695+00
256	user	c1c1d5db-4076-4710-bc58-99ca227c385b	refund	0.310000	89.893263	2026-03-22 11:44:52.991821+00
257	user	2080dbe2-0a27-4776-bfd5-a145b06a769d	reserve	-0.358343	89.534920	2026-03-22 11:44:53.065549+00
258	user	2080dbe2-0a27-4776-bfd5-a145b06a769d	refund	0.310157	89.845077	2026-03-22 11:44:57.187121+00
259	user	381c0fa0-d522-4ef3-af9c-c479050b721e	reserve	-0.382901	89.462176	2026-03-22 11:44:57.265378+00
260	user	381c0fa0-d522-4ef3-af9c-c479050b721e	refund	0.307986	89.770162	2026-03-22 11:45:06.959715+00
261	user	477a2d4b-cac3-4005-93ef-1e3504120a7e	reserve	-0.383418	89.386744	2026-03-22 11:45:08.057785+00
262	user	477a2d4b-cac3-4005-93ef-1e3504120a7e	refund	0.308936	89.695680	2026-03-22 11:45:16.299885+00
263	user	b2d6c0b5-065e-44a7-80c9-025c3d207b3d	reserve	-0.383748	89.311932	2026-03-22 11:45:17.503404+00
264	user	b2d6c0b5-065e-44a7-80c9-025c3d207b3d	refund	0.308123	89.620055	2026-03-22 11:45:25.603972+00
265	user	d86d9358-0efc-469b-bc9e-6b74c9eea809	reserve	-0.384170	89.235885	2026-03-22 11:45:26.725204+00
266	user	d86d9358-0efc-469b-bc9e-6b74c9eea809	refund	0.305025	89.540910	2026-03-22 11:45:45.902988+00
267	user	27cb7a24-36eb-403d-8bd5-918edc8d8ed6	reserve	-0.385030	89.155880	2026-03-22 11:45:47.035809+00
268	user	27cb7a24-36eb-403d-8bd5-918edc8d8ed6	refund	0.305721	89.461601	2026-03-22 11:46:02.529208+00
269	user	889a6791-a026-4dfe-9617-95150652869e	reserve	-0.385976	89.075625	2026-03-22 11:46:03.645865+00
270	user	889a6791-a026-4dfe-9617-95150652869e	refund	0.308504	89.384129	2026-03-22 11:46:15.281603+00
271	user	6411b0ea-9fed-49e2-92b6-23c9c0a2b6e5	reserve	-0.386395	88.997734	2026-03-22 11:46:16.418725+00
272	user	6411b0ea-9fed-49e2-92b6-23c9c0a2b6e5	refund	0.307664	89.305398	2026-03-22 11:46:29.203949+00
273	user	4c6dfb7d-c72c-46b7-9f07-b8a6f69873a5	reserve	-0.386990	88.918408	2026-03-22 11:46:30.336948+00
274	user	4c6dfb7d-c72c-46b7-9f07-b8a6f69873a5	refund	0.288886	89.207294	2026-03-22 11:47:26.780644+00
275	user	a3266452-fcaa-4fac-a589-0a7e715c5269	reserve	-0.391531	88.815763	2026-03-22 11:47:27.994543+00
276	user	a3266452-fcaa-4fac-a589-0a7e715c5269	refund	0.327915	89.143678	2026-03-22 11:47:41.479313+00
277	user	994689b3-f5b9-4143-9fb7-0a8a34f8967a	reserve	-0.392282	88.751396	2026-03-22 11:47:42.634968+00
278	user	994689b3-f5b9-4143-9fb7-0a8a34f8967a	refund	0.310473	89.061869	2026-03-22 11:47:50.960121+00
279	user	0dbcbf5c-27cd-42fb-9cc3-320a2ae0a758	reserve	-0.392536	88.669333	2026-03-22 11:47:52.116306+00
280	user	0dbcbf5c-27cd-42fb-9cc3-320a2ae0a758	refund	0.330250	88.999583	2026-03-22 11:47:58.520797+00
281	user	61763f42-9eee-46f6-89f2-2261ecc17e68	reserve	-0.392874	88.606709	2026-03-22 11:47:58.580035+00
282	user	61763f42-9eee-46f6-89f2-2261ecc17e68	refund	0.310785	88.917494	2026-03-22 11:48:03.724815+00
283	user	b4438999-7273-4537-96c9-15c2593210c8	reserve	-0.393325	88.524169	2026-03-22 11:48:03.93433+00
284	user	b4438999-7273-4537-96c9-15c2593210c8	refund	0.311235	88.835404	2026-03-22 11:48:10.168744+00
285	user	61cdd6aa-955a-40df-8938-4fadc1297068	reserve	-0.394765	88.440639	2026-03-22 11:48:10.263284+00
286	user	61cdd6aa-955a-40df-8938-4fadc1297068	refund	0.310922	88.751561	2026-03-22 11:48:17.202871+00
287	user	4b49cb09-1159-4af7-a8b7-f524fe9eeaaa	reserve	-0.394998	88.356563	2026-03-22 11:48:17.378473+00
288	user	4b49cb09-1159-4af7-a8b7-f524fe9eeaaa	refund	0.311348	88.667911	2026-03-22 11:48:25.437362+00
289	user	d2cebb9d-f0b8-4786-9e75-1016e90539cf	reserve	-0.396822	88.271089	2026-03-22 11:48:25.524872+00
290	user	d2cebb9d-f0b8-4786-9e75-1016e90539cf	refund	0.310341	88.581430	2026-03-22 11:48:34.469957+00
291	user	86980587-c158-428d-94a7-435689920628	reserve	-0.397147	88.184283	2026-03-22 11:48:35.615028+00
292	user	86980587-c158-428d-94a7-435689920628	refund	0.305175	88.489458	2026-03-22 11:48:54.877147+00
295	user	d8e79474-ccde-4e1b-b4dd-50d632fb02c6	reserve	-0.399035	88.085913	2026-03-22 11:49:02.603192+00
296	user	d8e79474-ccde-4e1b-b4dd-50d632fb02c6	refund	0.311216	88.397129	2026-03-22 11:49:10.026714+00
297	user	b91c0cb1-883b-4502-a527-4a48fc8ae118	reserve	-0.399296	87.997833	2026-03-22 11:49:11.193068+00
298	user	b91c0cb1-883b-4502-a527-4a48fc8ae118	refund	0.305126	88.302959	2026-03-22 11:49:31.674922+00
303	user	9b5ef436-eb8d-490d-bb0d-b6ca794fe67b	reserve	-0.402182	87.722523	2026-03-22 11:49:50.729545+00
304	user	9b5ef436-eb8d-490d-bb0d-b6ca794fe67b	refund	0.331871	88.054394	2026-03-22 11:50:12.123405+00
309	user	8b3261c2-66ce-4982-b89a-64624b8d8f8f	reserve	-0.403243	87.544559	2026-03-22 11:50:21.209748+00
310	user	8b3261c2-66ce-4982-b89a-64624b8d8f8f	refund	0.311886	87.856445	2026-03-22 11:50:26.987245+00
293	user	12becaa0-a015-43cc-b8c9-4470959aec8d	reserve	-0.398462	88.090996	2026-03-22 11:48:55.977001+00
294	user	12becaa0-a015-43cc-b8c9-4470959aec8d	refund	0.393952	88.484948	2026-03-22 11:49:01.514726+00
299	user	dc29210c-8610-401c-aad0-5654fa7c982f	reserve	-0.400717	87.902242	2026-03-22 11:49:32.799251+00
300	user	dc29210c-8610-401c-aad0-5654fa7c982f	refund	0.311738	88.213980	2026-03-22 11:49:40.961502+00
301	user	4b990c66-e120-49ad-a305-0d02c54759ca	reserve	-0.400926	87.813054	2026-03-22 11:49:42.148889+00
302	user	4b990c66-e120-49ad-a305-0d02c54759ca	refund	0.311651	88.124705	2026-03-22 11:49:50.543521+00
305	user	e2f20c27-dc37-4349-8e9b-f80675928afd	reserve	-0.402523	87.651871	2026-03-22 11:50:12.465173+00
306	user	e2f20c27-dc37-4349-8e9b-f80675928afd	refund	0.386817	88.038688	2026-03-22 11:50:16.217339+00
307	user	3a8b25da-5819-49d4-9723-0d840b46c67d	reserve	-0.403103	87.635585	2026-03-22 11:50:16.36185+00
308	user	3a8b25da-5819-49d4-9723-0d840b46c67d	refund	0.312217	87.947802	2026-03-22 11:50:20.946835+00
311	user	e79dd076-cdc7-4af6-80fb-aa029ebb971c	reserve	-0.403573	87.452872	2026-03-22 11:50:27.078035+00
312	user	e79dd076-cdc7-4af6-80fb-aa029ebb971c	refund	0.310420	87.763292	2026-03-22 11:50:36.046469+00
313	user	b2d0e5e7-8840-4b34-8565-43875ff4ee08	reserve	-0.404069	87.359223	2026-03-22 12:29:15.236039+00
314	user	b2d0e5e7-8840-4b34-8565-43875ff4ee08	refund	0.307980	87.667203	2026-03-22 12:29:26.845371+00
315	user	7648ec58-1639-4261-9a3a-dd73d0a0b9da	reserve	-0.409530	87.257673	2026-03-22 12:29:27.213716+00
316	user	7648ec58-1639-4261-9a3a-dd73d0a0b9da	refund	0.308760	87.566433	2026-03-22 12:29:35.69993+00
317	user	7425d6f9-3a49-40a4-93b3-9bdc9d5a3aa6	reserve	-0.424824	87.141609	2026-03-22 12:29:35.851836+00
318	user	7425d6f9-3a49-40a4-93b3-9bdc9d5a3aa6	refund	0.311504	87.453113	2026-03-22 12:29:44.35624+00
319	user	c9f7c287-4e2d-4c2f-9449-82907990a979	reserve	-0.426137	87.026976	2026-03-22 12:29:44.63108+00
320	user	c9f7c287-4e2d-4c2f-9449-82907990a979	refund	0.312382	87.339358	2026-03-22 12:29:51.136351+00
321	user	de25bee3-8cc2-486d-95fa-4e67948692a9	reserve	-0.433099	86.906259	2026-03-22 12:29:51.269198+00
322	user	de25bee3-8cc2-486d-95fa-4e67948692a9	refund	0.311919	87.218178	2026-03-22 12:30:01.912212+00
323	user	ce7cd749-99af-4d61-a7d1-5170d7f945e2	reserve	-0.433716	86.784462	2026-03-22 12:30:03.093671+00
324	user	ce7cd749-99af-4d61-a7d1-5170d7f945e2	refund	0.314022	87.098484	2026-03-22 12:30:07.904627+00
325	user	5280a67a-822c-493a-91ac-47c2f6822698	reserve	-0.439057	86.659427	2026-03-22 12:30:08.025283+00
326	user	5280a67a-822c-493a-91ac-47c2f6822698	refund	0.312207	86.971634	2026-03-22 12:30:22.274557+00
327	user	121abb5e-5dc6-4005-b866-f5173c43c8da	reserve	-0.439913	86.531721	2026-03-22 12:30:23.383325+00
328	user	121abb5e-5dc6-4005-b866-f5173c43c8da	refund	0.311924	86.843645	2026-03-22 12:30:38.055369+00
329	user	007f85ee-ff8f-4a40-899a-03fe18a1e398	reserve	-0.440860	86.402785	2026-03-22 12:30:39.210973+00
330	user	007f85ee-ff8f-4a40-899a-03fe18a1e398	refund	0.313608	86.716393	2026-03-22 12:30:53.342084+00
331	user	411d3f45-6d97-4df8-b704-f66d798d7dfc	reserve	-0.441455	86.274938	2026-03-22 12:30:54.551445+00
332	user	411d3f45-6d97-4df8-b704-f66d798d7dfc	refund	0.291980	86.566918	2026-03-22 12:32:02.439965+00
333	user	84bcb971-5dc2-41b1-835f-2ef7465a7d65	reserve	-0.448379	86.118539	2026-03-22 12:32:03.805377+00
334	user	84bcb971-5dc2-41b1-835f-2ef7465a7d65	refund	0.317483	86.436022	2026-03-22 12:32:20.929572+00
335	user	3d36af99-2337-49e9-b973-7523521e65a4	reserve	-0.449052	85.986970	2026-03-22 12:32:22.264114+00
336	user	3d36af99-2337-49e9-b973-7523521e65a4	refund	0.318413	86.305383	2026-03-22 12:32:34.69401+00
337	user	eaf1138c-719f-4d11-9564-ec63d0d3bf4e	reserve	-0.449382	85.856001	2026-03-22 12:32:34.898611+00
338	user	eaf1138c-719f-4d11-9564-ec63d0d3bf4e	refund	0.316791	86.172792	2026-03-22 12:32:44.119614+00
\.


--
-- Name: recent_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.recent_requests_id_seq', 169, true);


--
-- Name: stats_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stats_events_id_seq', 169, true);


--
-- Name: wallet_ledger_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wallet_ledger_id_seq', 338, true);


--
-- Name: admins admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admins
    ADD CONSTRAINT admins_pkey PRIMARY KEY (username);


--
-- Name: external_model_targets external_model_targets_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_model_targets
    ADD CONSTRAINT external_model_targets_v2_pkey PRIMARY KEY (external_model_name, model_id);


--
-- Name: external_models external_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_models
    ADD CONSTRAINT external_models_pkey PRIMARY KEY (name);


--
-- Name: models models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_pkey PRIMARY KEY (id);


--
-- Name: payment_settings payment_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_settings
    ADD CONSTRAINT payment_settings_pkey PRIMARY KEY (id);


--
-- Name: providers providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.providers
    ADD CONSTRAINT providers_pkey PRIMARY KEY (id);


--
-- Name: recent_requests recent_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recent_requests
    ADD CONSTRAINT recent_requests_pkey PRIMARY KEY (id);


--
-- Name: recent_requests recent_requests_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recent_requests
    ADD CONSTRAINT recent_requests_request_id_key UNIQUE (request_id);


--
-- Name: recharge_orders recharge_orders_out_trade_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_out_trade_no_key UNIQUE (out_trade_no);


--
-- Name: recharge_orders recharge_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_pkey PRIMARY KEY (id);


--
-- Name: request_reservations request_reservations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_reservations
    ADD CONSTRAINT request_reservations_pkey PRIMARY KEY (request_id);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (token);


--
-- Name: stats_events stats_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_events
    ADD CONSTRAINT stats_events_pkey PRIMARY KEY (id);


--
-- Name: stats_events stats_events_request_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stats_events
    ADD CONSTRAINT stats_events_request_id_key UNIQUE (request_id);


--
-- Name: user_api_keys user_api_keys_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_api_keys
    ADD CONSTRAINT user_api_keys_api_key_key UNIQUE (api_key);


--
-- Name: user_api_keys user_api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_api_keys
    ADD CONSTRAINT user_api_keys_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (username);


--
-- Name: wallet_ledger wallet_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_pkey PRIMARY KEY (id);


--
-- Name: idx_external_model_targets_name_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_external_model_targets_name_priority ON public.external_model_targets USING btree (external_model_name, priority, model_id);


--
-- Name: idx_recent_requests_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recent_requests_created_at ON public.recent_requests USING btree (created_at DESC);


--
-- Name: idx_recent_requests_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recent_requests_username ON public.recent_requests USING btree (username, created_at DESC);


--
-- Name: idx_recharge_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_status ON public.recharge_orders USING btree (status, created_at DESC);


--
-- Name: idx_recharge_orders_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_recharge_orders_username ON public.recharge_orders USING btree (username, created_at DESC);


--
-- Name: idx_request_reservations_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_reservations_username ON public.request_reservations USING btree (username, created_at DESC);


--
-- Name: idx_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_expires_at ON public.sessions USING btree (expires_at);


--
-- Name: idx_stats_events_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stats_events_created_at ON public.stats_events USING btree (created_at DESC);


--
-- Name: idx_user_api_keys_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_api_keys_username ON public.user_api_keys USING btree (username);


--
-- Name: idx_wallet_ledger_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wallet_ledger_username ON public.wallet_ledger USING btree (username, created_at DESC);


--
-- Name: uq_models_provider_upstream; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_models_provider_upstream ON public.models USING btree (provider_id, upstream_model);


--
-- Name: external_model_targets external_model_targets_v2_external_model_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_model_targets
    ADD CONSTRAINT external_model_targets_v2_external_model_name_fkey FOREIGN KEY (external_model_name) REFERENCES public.external_models(name) ON DELETE CASCADE;


--
-- Name: external_model_targets external_model_targets_v2_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_model_targets
    ADD CONSTRAINT external_model_targets_v2_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.models(id) ON DELETE CASCADE;


--
-- Name: models models_provider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.models
    ADD CONSTRAINT models_provider_id_fkey FOREIGN KEY (provider_id) REFERENCES public.providers(id) ON DELETE CASCADE;


--
-- Name: recharge_orders recharge_orders_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recharge_orders
    ADD CONSTRAINT recharge_orders_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: request_reservations request_reservations_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_reservations
    ADD CONSTRAINT request_reservations_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- Name: user_api_keys user_api_keys_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_api_keys
    ADD CONSTRAINT user_api_keys_username_fkey FOREIGN KEY (username) REFERENCES public.users(username) ON DELETE CASCADE;


--
-- Name: wallet_ledger wallet_ledger_username_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wallet_ledger
    ADD CONSTRAINT wallet_ledger_username_fkey FOREIGN KEY (username) REFERENCES public.users(username);


--
-- PostgreSQL database dump complete
--

\unrestrict lxrek6L9qI2okvOeThPfvLW3x5aG3EDgXC8A7as8ZerrPD0WxBwnCIOiwKe8Vj2

