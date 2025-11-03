# Truth or Dare Game - Design Guidelines (Compact)

## Design Principles

Modern gaming interface inspired by Discord/Among Us focusing on:
- **Immediate Clarity** - Always visible game state and turn order
- **Celebratory Moments** - Rewarding feedback for spins, joins, votes
- **Effortless Interaction** - One-tap actions with clear feedback
- **Inclusive Design** - Perfect for 2-12 players, mobile-first

---

## Typography

**Font Stack:**
- Display: Montserrat Bold (900) - titles, CTAs, room codes
- UI: Inter (400/500/600) - body, buttons, chat
- Mono: JetBrains Mono (500) - room codes only

**Scale:**
```
Hero: text-6xl/leading-none/font-black
Headers: text-4xl/leading-tight/font-bold
Section Titles: text-2xl/leading-snug/font-semibold
Player Names: text-xl/leading-normal/font-semibold
Room Code: text-3xl/font-mono/tracking-wider
Body: text-base/leading-relaxed
Labels: text-sm/leading-tight/font-medium
Micro: text-xs/leading-tight
```

---

## Layout & Spacing

**Spacing Units:** 2, 4, 8, 12, 16
- Micro (8px): p-2, gap-2 - inline elements
- Standard (16px): p-4, gap-4 - cards, buttons
- Section (32px): p-8, gap-8 - UI sections
- Large (48px): p-12 - page sections
- XL (64px): p-16 - landing padding

**Responsive Containers:**
```
Mobile: px-4, max-w-full
Tablet (md:): px-6, max-w-3xl mx-auto
Desktop (lg:): px-8, max-w-6xl mx-auto
Wide (xl:): max-w-7xl mx-auto
```

**Key Layouts:**
- Players: CSS Grid, circular arrangement via transforms
- Chat: Flex column, gap-2, reversed
- Landing CTAs: grid-cols-1 md:grid-cols-2 gap-4
- Votes: Flex row, space-between

---

## Components

### Landing Page
**Hero:**
- min-h-screen, centered
- 3D bottle illustration (isometric, colorful glass, max-w-md mobile/max-w-lg desktop)
- Title with tracking-wide
- CTAs: h-16, full-width mobile/max-w-xs desktop, rounded-2xl
- Primary "Create" (vibrant), Secondary "Join" (outlined)
- Pressed: scale-95

### Game Room
**Main Area:**
- Bottle: 1:1 aspect, max-w-lg, centered
- Players: w-16 h-16 circles in CSS transform circle
- Active turn: pulsing glow (animate-pulse, 3s)
- Selected: bold highlight with arrow

**Top Bar:**
- Fixed, h-16, backdrop-blur
- Room code (left, one-tap copy), player count (center), leave (right)

**Chat:**
- Mobile: slide-up drawer
- Desktop: fixed right, w-80
- Messages: rounded-2xl bubbles
- Input: fixed bottom, file upload, emoji, send

**Question Modal:**
- Centered, backdrop-blur-sm, max-w-md, p-8
- Large textarea (500 char limit)
- Truth/Dare badge top, send button bottom

### Forms
**Inputs:**
- h-12, rounded-lg, 2px border, ring-4 focus
- Labels: text-sm font-medium, mb-2
- Room code: text-2xl font-mono tracking-widest, center-aligned, auto-dashes

**Buttons:**
- Standard: h-12 px-6 rounded-lg text-base font-semibold
- Large: h-16 px-8 rounded-xl text-lg font-bold
- Icon: w-12 h-12 rounded-full
- Pressed: scale-95, duration-75

**Dropdown (Skips):**
- h-12, custom chevron-down
- Options: 0, 1, 2, 3, 5, 10, Unlimited

### Bottle Spin
- SVG/WebGL with realistic shading
- Duration: 2s/4.5s/7s random, cubic-bezier easing
- Overshoot then settle physics
- "Spin" button: w-20 h-20 circular, below bottle, disabled during spin
- 2s highlight on landing

### Voting
**Prompt Card:**
- Slides from top, max-w-sm, p-6
- Question: text-lg font-semibold centered
- Buttons: h-14 flex-1 rounded-xl, gap-4 between
- Live count: "3/5 voted"

**Inactivity Warning:**
- Yellow banner, h-12, text-sm
- "Username hasn't responded in 2 minutes"
- Countdown timer

### Status Indicators
- **Skip Badge:** w-6 h-6, top-right of avatar, shows count or ∞
- **Online Dot:** w-3 h-3, bottom-right, pulsing
- **Host Crown:** w-5 h-5, above avatar, gold shimmer

### Chat Messages
**Text:** rounded-2xl p-3, username text-sm font-semibold mb-1, timestamp text-xs mt-1
**Media:** rounded-lg, max-h-64, tap to expand
**System:** centered, italic text-sm, reduced opacity

### Feedback
**Toasts:**
- max-w-sm p-4, slide from top-right/top
- Auto-dismiss 4s
- Types: Success (✓), Error (✗), Info (i)

**Loading:** Spinner, skeleton shimmer, indeterminate progress
**Errors:** Inline text-sm with icon, empty states with helpful CTA

---

## Animations (Strategic Only)

**Essential:**
1. **Bottle Spin:** 2s/4.5s/7s rotation, overshoot landing
2. **Player Join/Leave:** Scale-fade in (300ms), out (200ms), rearrange (500ms ease-in-out)
3. **Turn Indicator:** Pulsing glow (3s), "Your Turn" slide-in (300ms)

**Secondary:**
4. **Vote Results:** Confetti (2s pass), shake (150ms fail)
5. **Button Press:** scale-95 (75ms), return (150ms)

**No Animations:** Page transitions, chat, text, hover, validation

---

## Accessibility

**Keyboard:**
- Visible focus rings (ring-4 offset)
- Tab order: Top bar → Game → Chat → CTAs
- Enter/Space triggers bottle spin

**Screen Reader:**
- ARIA labels on icon buttons
- Live regions: "It's [Player]'s turn", "Bottle landed on [Player]"
- Vote prompts announced immediately
- Chat messages announced on receive

**Touch/Visual:**
- 44×44px minimum targets (h-12/w-12)
- gap-4 minimum between elements
- High contrast text
- Multiple turn signals (color + icon + animation)
- Inline form validation with icons

---

## Color & Visual Hierarchy
*(Implement with your chosen color scheme)*
- Primary action buttons: Vibrant, high contrast
- Secondary: Outlined style
- Active states: Pulsing glow
- Warnings: Yellow banner
- Errors: Red with icon
- Success: Green with checkmark
- System messages: Reduced opacity

**Icons:** Heroicons library throughout
**Player Avatars:** Generated initials in colored circles (no images)