# Hotel guest website

This standalone hotel website runs separately from the staff PMS and hotel backend.

1. Start the DMS backend.
2. In the PMS, save the customer website address under IBE Config, then generate a Website API key.
3. Copy `.env.example` to `.env` in this guest website directory. Set `GUEST_IBE_API_KEY` to that secret. The server loads `.env` at startup. Restart it after changing the key.

Then:

1. Run `npm run dev` in this directory (Node.js 22 or later).
2. Open `http://localhost:3003/`.

The homepage uses the TestAPI2 property by default. Its room search, prices,
currency and booking confirmations come from the public IBE API. Confirming
a booking saves a Website reservation and an unpaid invoice in that property.

Set `GUEST_PROPERTY_ID` before starting the server to use another property's
ID. Set `GUEST_API_ORIGIN` when the backend runs at another origin. The
default API origin is `http://localhost:3500`.

In the staff PMS, open the property and select **IBE ? IBE Config ? Online
booking**. Choose an active Room Only plan, enable **Pay at the Property**
and **Enable online booking**, then save.

Under **Website connection**, enter `http://localhost:3003` for local testing.
Choose the public data-sharing checkboxes and save. Searches require
**Available room types, rates and currency**. New reservations also require
**Accept website bookings**.

**API activity** shows the latest 50 requests and keeps them for 30 days.
Connection status reflects successful activity in the last 15 minutes. Successful activity is authenticated using the current website key. The website name and address come from its registered integration, not a caller-supplied Origin header. Replacing or revoking a key immediately disables new requests with that key.

The `/book/<property-id>` route remains available for a standalone booking
page. The PMS generates those links using
`NEXT_PUBLIC_GUEST_BOOKING_ORIGIN`, which defaults to
`http://localhost:3003`.

Run `npm run check` to verify the JavaScript syntax.

## Sample photography

The built-in imagegen tool created the site's original sample hotel imagery. The production-size WebP assets are saved under `public/images/`.
x
- `coast.webp` — Photorealistic editorial wide landscape website hero for a fictional boutique hotel on the south coast of Sri Lanka. View across a long dark turquoise infinity pool toward the Indian Ocean at warm golden hour. A beautifully designed low Sri Lankan tropical modernist pavilion in stone and dark teak is positioned on the right, palms silhouetted overhead, natural greenery and ocean visible to the left. Rich deep greens, soft amber, calming ocean. Distinctive credible travel photography, wide horizontal composition, no people, no text, no logos.
- `garden.webp` — Photorealistic boutique hotel room interior landscape photograph for a fictional south coast Sri Lanka hotel. Refined teak platform king bed with white linen, woven pendant lamps, plaster walls, and tall windows opening to a lush tropical walled garden. Warm natural light, elevated editorial travel photography. No people, text or logos.
- `ocean.webp` — Photorealistic boutique hotel room interior landscape photo for a fictional south coast Sri Lanka hotel. An elegant corner suite with teak furniture, neutral linens and a generous window framing palms and the Indian Ocean, subtle olive green textiles and warm afternoon light. Elevated editorial travel photography. No people, text or logos.

## Website API authentication

Browser requests go to this site's `/api/ibe/<configured-property-id>` proxy. Only this server attaches `X-IBE-API-Key` to the upstream PMS request. The browser configuration contains no secret. All three PMS IBE endpoints require a valid property key. This proxy only forwards hotel details, availability and booking requests for its configured property.

Keep `.env` private and out of GitHub. The example file has an empty key and can be committed. Production PMS connections use HTTPS. A key authenticates the website integration; it does not verify guest identity or prevent all automated bookings. OTP/CAPTCHA are not included. See the backend `docs/ibe-website-api-keys.md` for setup and tests.
