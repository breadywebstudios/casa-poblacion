# Casa Poblacion Events Place · Plaridel

Website and booking system for [Casa Poblacion Events Place](https://www.facebook.com/profile.php?id=61580503473499), an events venue at 227 Governor Padilla Hi-way, Plaridel, Bulacan.

Static site — no build step. Deploy the repo root as-is (e.g. Vercel, Netlify, GitHub Pages).

| Page | Purpose |
|---|---|
| `index.html` | Public site: venue, occasions, gallery, booking calendar + request form, location |
| `admin.html` | Staff page: sign in, review requests, approve / decline / cancel, private notes |

## Backend (Supabase — breadywebstudios project)

- `public.casa_bookings` — booking requests (`pending` → `approved` / `declined` / `cancelled`)
- `public.casa_admins` — emails allowed into `admin.html`
- `casa_request_booking(p jsonb)` — the only way the public can write; validates, blocks past or already-booked slots, light spam limit
- `casa_booked_slots()` — approved upcoming date/slot pairs for the calendar (no personal data)
- A trigger blocks approving two bookings that overlap (`Whole day` overlaps both `Daytime` and `Evening`)
- Photos live in the public storage bucket `casa-media/site/`

### Add another admin
The person signs up / already has an account in this Supabase project, then run:

```sql
insert into public.casa_admins (email) values ('staff@example.com');
```

Settings (Supabase URL, publishable key, phone, links) are in `config.js`.
