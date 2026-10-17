# Product

Status: working draft, 17 October 2026. Customer demand, achievable savings, and willingness to pay are unvalidated.

## What Japita does

Japita centralizes restaurant suppliers, product offers, purchasing, and spending in one app. Its advisor helps owners compare their existing suppliers with new options and choose a weekly purchasing basket based on quality, delivered price, and their own preferences. It explains trade-offs, identifies missing supplier information, and prepares purchases for human approval.

**Main promise:** Manage your suppliers in one place and choose the right ingredients for your restaurant's goals.

**First demo customer:** a Japanese ramen business in Milan, managing a normal week of purchasing. This refines the previously selected Japanese-business-in-Italy audience from pre-opening planning to recurring operations.

**Core question:** What should we buy this week, from which suppliers, and why are those choices right for our restaurant?

**Confirmed product direction:** support both existing-supplier management and new-supplier discovery. Evaluate price and quality against the owner's preferences. Reduced coordination and better purchasing decisions are complementary benefits.

## Confirmed context

- The team has two people: one Italian and one Japanese.
- The Japanese teammate has more experience building with AI agents.
- The team reports having an AMD API key, Evolus credits, and access to Gemma.
- There is no restaurant contact and no real supplier documentation yet.
- The user initially selected Japanese ramen businesses opening in Italy, then chose a normal purchasing week as the demo workflow.
- The user confirmed both existing suppliers and discovery of new suppliers belong in the product.
- The user wants choices tailored to quality, price, and restaurant preferences, with centralized management and advice.
- Implementation status and the boundary between the current visual mockup and the full website are tracked in [README.md](../README.md#current-design-scope).

An AMD API key does not establish access to a GPU machine or an independently operated vLLM endpoint. The exact infrastructure and Gemma model remain to be confirmed (see [architecture.md](architecture.md)). Do not put credentials in docs or the repository.

## Positioning

Existing restaurant purchasing tools already cover parts of this: [Supy](https://supy.io/platform/restaurant-procurement-software) (procurement and approvals), [Choco](https://choco.com/us/stories/suppliers/from-restaurant-app-to-ai-partner-for-distributors-the-evolution-of-choco) (ordering and distributor automation), [MarketMan](https://www.marketman.com/platform/restaurant-purchasing-software-and-order-management) (centralized vendors, price comparisons, purchasing). Japita's angle is advice tied to the restaurant's own quality, price, and convenience preferences, across existing and new suppliers, including Japanese-language product information.

## Roadmap after the hackathon

Real supplier onboarding, verified catalog feeds, approved external communications, ordering integrations, invoice matching, budget tracking against actual spending, the restaurant's invoice history, and broader price benchmarks when suitable data and permissions exist.

Customer interviews remain a post-demo validation priority. Test whether ramen owners and purchasing managers find enough value in centralized weekly purchasing, supplier discovery, and personalized advice to adopt and pay for it.
