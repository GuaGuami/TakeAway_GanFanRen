-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.dish_ingredients (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  dish_id bigint NOT NULL,
  ingredient_id bigint NOT NULL,
  weight_kg numeric NOT NULL CHECK (weight_kg >= 0::numeric),
  CONSTRAINT dish_ingredients_pkey PRIMARY KEY (id),
  CONSTRAINT dish_ingredients_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id),
  CONSTRAINT dish_ingredients_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id)
);
CREATE TABLE public.dishes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  note text,
  recommended_price numeric,
  CONSTRAINT dishes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ingredients (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  name text NOT NULL UNIQUE,
  category text NOT NULL,
  CONSTRAINT ingredients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.purchase_records (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  supermarket text NOT NULL,
  ingredient_id bigint NOT NULL,
  quantity_kg numeric NOT NULL CHECK (quantity_kg >= 0::numeric),
  price_per_kg numeric NOT NULL CHECK (price_per_kg >= 0::numeric),
  total_price numeric DEFAULT (quantity_kg * price_per_kg),
  date date NOT NULL DEFAULT now(),
  note text,
  CONSTRAINT purchase_records_pkey PRIMARY KEY (id),
  CONSTRAINT purchase_records_ingredient_id_fkey FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id)
);
CREATE TABLE public.sales (
  id bigint NOT NULL DEFAULT nextval('sales_id_seq'::regclass),
  date timestamp without time zone NOT NULL DEFAULT now(),
  scenario_id integer NOT NULL,
  dish_id integer NOT NULL,
  quantity numeric NOT NULL CHECK (quantity > 0::numeric),
  unit_price numeric NOT NULL,
  total_cost numeric NOT NULL,
  total_profit numeric NOT NULL,
  menu_type text,
  CONSTRAINT sales_pkey PRIMARY KEY (id),
  CONSTRAINT sales_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES public.settings(id),
  CONSTRAINT sales_dish_id_fkey FOREIGN KEY (dish_id) REFERENCES public.dishes(id)
);
CREATE TABLE public.settings (
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  scenario text NOT NULL DEFAULT '默认情景'::text UNIQUE,
  standard_price numeric NOT NULL DEFAULT 10,
  plus_price numeric NOT NULL DEFAULT 13,
  CONSTRAINT settings_pkey PRIMARY KEY (id)
);