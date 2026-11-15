# DineFlow — Restaurant Order & Billing Management System

A beginner-friendly DBMS project frontend built with **HTML, CSS and JavaScript**, connected to **Supabase (PostgreSQL)**.

## Scope follows the supplied project brief

The database uses exactly these five core tables:

1. `menu_items`
2. `restaurant_tables`
3. `orders`
4. `order_items`
5. `bills`

The project also includes the requested bill-details view, price and bill-total triggers, atomic bill-closing function, reports, and CSV import/export guidance. Report views are database views, not additional tables.

## Files

- `index.html` — application layout
- `styles.css` — responsive styling
- `app.js` — Supabase connection and frontend operations
- `supabase.sql` — schema, constraints, triggers, function, views and demo policies

## Setup

### 1. Create a Supabase project

Create a project at https://supabase.com and open **SQL Editor**.

### 2. Create the database

Open `supabase.sql`, copy its contents into the SQL Editor, and run it.

### 3. Add starter data

At the bottom of `supabase.sql`, uncomment and run the optional starter-data statements (or run them separately). They add 10 restaurant tables and five example menu items. The script does not create any extra tables.

### 4. Connect the frontend

In Supabase, open **Project Settings → API** (or the project's API settings page). Copy:
- Project URL
- anon / publishable public key

Open `app.js` and replace:

```js
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";
```

Use only the anon/publishable key in browser code. **Never put the `service_role` key in frontend JavaScript or GitHub.**

### 5. Run locally

You can open `index.html` directly for a simple test. Prefer VS Code Live Server for local development.

### 6. Publish on GitHub Pages

1. Create a GitHub repository named `dineflow`.
2. Upload `index.html`, `styles.css`, `app.js`, `supabase.sql`, and this README.
3. In GitHub, open **Settings → Pages**.
4. Select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
5. Open the published Pages URL.

## Features

- Add menu items
- View menu and table availability
- Create an order for an available table
- Copy the current menu price into each order item through a `BEFORE INSERT` trigger
- Add item totals to the bill automatically through an `AFTER INSERT` trigger
- Keep totals accurate on item update/delete too
- Close a bill and free the table through the `close_bill` database function
- View bill totals and sales reports

## CSV import / export

The supplied brief asks for menu CSV import and daily sales export. Supabase supports importing CSV data through the Table Editor: choose `menu_items` → **Insert** → **Import data from CSV** (menu CSV headers should match columns such as `item_name,category,price,is_available`; omit `id` and `created_at`).

For daily sales export, open the `revenue_by_day` view in the Supabase Table Editor and use its export/download option, or run:

```sql
select * from public.revenue_by_day order by sale_day desc;
```

You can also export query results from the Supabase SQL Editor.

## Important security note

The SQL file enables Row Level Security but adds permissive anon/authenticated policies so this learning demo can work without a login screen. This is **not production security**. For a real restaurant deployment, add Supabase Auth and restrict policies to authorized staff. Never expose a service-role key.

## Notes

- Currency is displayed as INR (₹) in the UI; change the `money()` formatter in `app.js` if needed.
- Daily revenue and busiest-hour views use `Asia/Kolkata` as the reporting timezone. Change this in `supabase.sql` if your restaurant uses another timezone.
- `close_bill` is a PostgreSQL function called using Supabase RPC. Its updates run atomically as one database transaction.
