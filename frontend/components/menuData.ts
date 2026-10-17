// Display-only copy of the `menu` key in backend/tests/fixtures/kumo.json (the backend does not persist it).
// Weekly quantities are not here: they come from the purchasing week (GET /state -> week.servings).
export type MenuItem = { id: string; name: string; price_eur: number | null; description: string };

export const MENU: MenuItem[] = [
  { id: "tonkotsu", name: "Classic tonkotsu ramen", price_eur: 14, description: "Pork-bone broth, thin straight noodles, chashu and green onion." },
  { id: "set_full", name: "Kumo full set", price_eur: 19, description: "Classic ramen with extra chashu, kikurage, nori and a half-boiled seasoned egg." },
  { id: "set_kaedama", name: "Kumo refill set", price_eur: 16, description: "Classic ramen with one noodle refill and a half-boiled seasoned egg." },
  { id: "veggie_miso", name: "Veggie miso ramen", price_eur: 14, description: "Kombu and shiitake broth with miso tare. Vegetarian: no pork-based tare or oil." },
  { id: "kaedama", name: "Kaedama (noodle refill)", price_eur: 3, description: "Extra portion of noodles for the remaining broth. Weekly count includes the refill in each refill set." },
  { id: "half_kaedama", name: "Half kaedama", price_eur: 2, description: "Half portion of noodles." },
  { id: "extra_kikurage", name: "Extra kikurage", price_eur: 2, description: "Topping: sliced wood-ear mushroom." },
  { id: "toppings", name: "Other toppings", price_eur: null, description: "Extra chashu, green onion, garlic, nori, seasoned egg." },
  { id: "rice", name: "Rice (regular or small)", price_eur: null, description: "Steamed rice." },
  { id: "sides_drinks", name: "Sides, drinks and dessert", price_eur: null, description: "Chashu rice bowl, beer, soft drinks, matcha almond pudding." },
];

export const MENU_GROUPS: { title: "mn.ramen" | "mn.extras" | "mn.sides"; ids: string[] }[] = [
  { title: "mn.ramen", ids: ["tonkotsu", "set_full", "set_kaedama", "veggie_miso"] },
  { title: "mn.extras", ids: ["kaedama", "half_kaedama", "extra_kikurage", "toppings"] },
  { title: "mn.sides", ids: ["rice", "sides_drinks"] },
];

// Fictional profile text from the mockup (mockup/japita-workspace.html), aligned with docs/demo.md.
export const PROFILE_DEFAULTS = {
  description:
    "Kumo Ramen Milano is an independent, 42-seat Hakata-style tonkotsu restaurant in Milan. It serves casual lunch guests and ramen enthusiasts, with thin, firm noodles, house-made pork-bone broth and kaedama refills. A separate kombu and shiitake broth supports the vegetarian miso bowl.",
  location: "Milan, Italy",
  seats: "42",
  concept: "Hakata-style tonkotsu specialist",
  positioning: "Casual lunch dining and ramen enthusiasts",
  menuPrice: "€14–19 for ramen and sets",
  make: "Pork-bone broth, vegetarian broth, tare blends, chashu and seasoned eggs",
  buy: "Noodles, specialty soy sauce, dried kikurage, Japanese condiments and dried goods",
  ownerNotes:
    "We want a focused Hakata-style ramen shop in Milan: rich pork broth, thin firm noodles and kaedama refills. We make our broths, tare and toppings in-house and buy noodles and specialist Japanese ingredients. Keep the vegetarian bowl separate from pork-based tare and oil. Quality and consistency matter, while purchasing needs to stay manageable.",
};
export type ProfileText = typeof PROFILE_DEFAULTS;
