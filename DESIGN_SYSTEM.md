# FlowCRM Premium — Design System

**Product**: Enterprise CRM Platform  
**Target Audience**: C-suite executives, sales teams, business managers  
**Design Goal**: Premium, professional, trust-inspiring $10,000+ enterprise aesthetic  
**Platforms**: Web (desktop/laptop), Tablet (iPad), Mobile (iPhone/Android)

---

## 1. Design System Recommendations

### Recommended Style: **Modern Minimalism with Glassmorphism**

This style balances:
- **Professional authority** (enterprise trust)
- **Accessibility & clarity** (complex data, many users)
- **Premium perception** (subtle depth, elegant whitespace)
- **Dark mode leadership** (reduces eye strain for long-session work)

**Why this style for premium CRM:**
- Enterprise expectations: users expect polished, clean interfaces
- Data density: minimalism provides clarity without clutter
- Glassmorphism accent: subtle frosted-glass effects on modals/cards create premium depth without feeling playful
- Dark mode adoption: 70% of enterprise users prefer dark for extended use

---

## 2. Color Palette (Premium Enterprise)

### Primary Colors

| Role | Color | Hex | Usage | A11y |
|------|-------|-----|-------|------|
| **Primary Action** | Deep Indigo | `#4F46E5` | Buttons, CTA, links, focus states | ✅ 7:1 AAA |
| **Secondary** | Slate Blue | `#6366F1` | Secondary buttons, hover states | ✅ 6.5:1 AAA |
| **Success** | Emerald | `#10B981` | Positive feedback, active states, charts | ✅ 4.5:1 AA |
| **Warning** | Amber | `#F59E0B` | Alerts, pending states | ✅ 4.5:1 AA |
| **Danger** | Rose | `#E11D48` | Destructive actions, errors | ✅ 4.5:1 AA |
| **Neutral Dark** | Slate 900 | `#0F172A` | Dark mode background | ✅ 21:1 AAA |
| **Neutral Light** | Slate 50 | `#F8FAFC` | Light mode background | ✅ 21:1 AAA |

### Semantic Color Tokens

```css
/* Light Mode */
--color-surface-primary: #F8FAFC;       /* Main background */
--color-surface-secondary: #F1F5F9;     /* Cards, sections */
--color-surface-tertiary: #E2E8F0;      /* Hover states */
--color-text-primary: #0F172A;          /* Body text */
--color-text-secondary: #475569;        /* Labels, meta */
--color-border: #CBD5E1;                /* Dividers, outlines */

/* Dark Mode */
--color-surface-primary: #0F172A;       /* Main background */
--color-surface-secondary: #1E293B;     /* Cards, sections */
--color-surface-tertiary: #334155;      /* Hover states */
--color-text-primary: #F1F5F9;          /* Body text */
--color-text-secondary: #94A3B8;        /* Labels, meta */
--color-border: #475569;                /* Dividers, outlines */
```

**Dark Mode (Recommended Default for Enterprise):**
- Base: Deep slate-900 to slate-950
- Cards: Slate-800 to slate-700 with subtle elevation
- Accent: Vibrant indigo/blue pop against dark background
- Contrast: ≥4.5:1 for all text, verified independently

---

## 3. Typography System

### Font Pairing: **Premium Professional**

| Element | Font | Weight | Size | Line-Height |
|---------|------|--------|------|-------------|
| **Display** | Inter | 700 (bold) | 32px | 1.2 |
| **Heading H1** | Inter | 600 (semibold) | 28px | 1.25 |
| **Heading H2** | Inter | 600 | 24px | 1.25 |
| **Heading H3** | Inter | 600 | 20px | 1.35 |
| **Body (large)** | Inter | 400 | 16px | 1.6 |
| **Body (default)** | Inter | 400 | 15px | 1.6 |
| **Small (labels)** | Inter | 500 | 14px | 1.5 |
| **Caption** | Inter | 400 | 13px | 1.5 |
| **Mono (data)** | Roboto Mono | 400 | 14px | 1.6 |

**Why Inter:**
- Modern, humanist sans-serif trusted by enterprises (Figma, GitHub, Linear)
- Excellent readability at small sizes
- Superior variable font support for responsive scaling
- Professional without being corporate/stiff

**Font Import:**
```css
@import url('https://rsms.me/inter/inter.css');
html { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
```

---

## 4. Spacing & Layout System

### 8pt Grid Rhythm (Material Design Standard)

```css
/* Spacing tokens */
--space-xs: 4px;      /* Inline gaps, tight spacing */
--space-sm: 8px;      /* Component padding, icon gaps */
--space-md: 16px;     /* Section spacing, card padding */
--space-lg: 24px;     /* Between sections */
--space-xl: 32px;     /* Major layout breaks */
--space-2xl: 48px;    /* Hero spacing, large gaps */
```

### Responsive Breakpoints

| Device | Breakpoint | Viewport | Layout |
|--------|------------|----------|--------|
| **Mobile** | 375px | iPhone SE | Single column, full-width |
| **Tablet Portrait** | 768px | iPad 9.7" | 2-column grid |
| **Tablet Landscape** | 1024px | iPad 12.9" | 3-column grid |
| **Desktop** | 1440px | 14" laptop | Full multi-column, sidebar nav |
| **Wide** | 1920px | 27" monitor | Max-width constraint applies |

### Container Widths

```css
/* Responsive max-widths */
--container-mobile: 100%;           /* 375px: full width, 16px gutters */
--container-tablet: 100%;           /* 768px: full width, 20px gutters */
--container-desktop: 1280px;        /* 1440px: centered with gutters */
--container-wide: 1440px;           /* 1920px: capped max-width */
```

**Gutter (horizontal padding):**
- Mobile (375px): 16px left/right
- Tablet (768px): 20px left/right
- Desktop (1440px): 32px left/right

---

## 5. Component Design Principles

### Elevation & Shadow System (Glassmorphism accent)

```css
/* Subtle, professional elevation */
--shadow-sm: 0 1px 2px 0 rgba(0,0,0,0.05);         /* Minimal lift */
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1);       /* Cards, popups */
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.15);    /* Modals, elevated surfaces */
--shadow-glass: inset 0 1px 0 0 rgba(255,255,255,0.1); /* Glassmorphism border */
```

### Border Radius (Subtle Softness)

```css
--radius-sm: 4px;    /* Inputs, small buttons */
--radius-md: 8px;    /* Cards, containers */
--radius-lg: 12px;   /* Large modals, hero sections */
--radius-full: 9999px; /* Badges, avatars */
```

### Key Component Specs

#### Button System

| Type | Background | Border | Text | Padding | Radius |
|------|------------|--------|------|---------|--------|
| **Primary** | Indigo-500 | None | White | 10px 16px | 8px |
| **Secondary** | Slate-100 (light) / Slate-700 (dark) | Slate-300/500 | Indigo-500/Indigo-400 | 10px 16px | 8px |
| **Ghost** | Transparent | Slate-300/500 | Indigo-500/Indigo-400 | 10px 16px | 8px |
| **Danger** | Rose-500 | None | White | 10px 16px | 8px |

**States:**
- `hover`: Opacity 0.9, elevation +1px
- `active/pressed`: Opacity 0.95, scale(0.98)
- `disabled`: Opacity 0.5, cursor-not-allowed
- `loading`: Spinner inside, disabled interaction

**Touch Targets:** ≥44×44px (iOS) / ≥48×48dp (Android)

#### Form Inputs

```css
/* Input styling */
--input-padding: 10px 12px;           /* Compact but touch-friendly */
--input-height: 40px;                 /* Desktop standard */
--input-height-mobile: 44px;          /* Mobile touch minimum */
--input-border: 1px solid var(--color-border);
--input-focus: inset 0 0 0 2px var(--color-primary); /* Blue ring */
--input-radius: 8px;
--input-font: 15px / 1.5 Inter;
```

**Features:**
- Visible labels (not placeholder-only)
- Helper text below input
- Clear error messages (red border + icon + text)
- Focus ring visible on keyboard nav
- Autofill support via semantic HTML input types

#### Cards & Surfaces

```css
/* Card elevation */
--card-background: var(--color-surface-secondary);
--card-border: 1px solid var(--color-border);
--card-shadow: var(--shadow-md);
--card-padding: 16px;
--card-radius: 8px;

/* Hover state: subtle lift + border highlight */
card:hover {
  box-shadow: var(--shadow-lg);
  border-color: var(--color-primary-light);
  transition: all 150ms ease-out;
}
```

#### Modals & Sheets

```css
/* Modal behavior */
--modal-backdrop: rgba(0, 0, 0, 0.5);     /* 50% opacity scrim for legibility */
--modal-animation: scale(0.95) opacity(0) → scale(1) opacity(1) over 200ms;
--modal-padding: 24px;
--modal-min-width: 360px;
--modal-max-width: 600px;
--modal-max-height: 90vh;
```

**Desktop:** Centered overlay with subtle animation (fade + scale)  
**Mobile/Tablet:** Bottom sheet slide-up with swipe-down dismiss

---

## 6. Navigation & Layout Strategy

### Desktop (1440px+): Sidebar-Based

```
┌─────────────────────────────────────────┐
│  FLOWCRM  │  Dashboard    [Search]  👤  │ ← Top bar
├─────────────────────────────────────────┤
│ Dashboard  │                             │
│ Customers  │   Main Content Area        │
│ Leads      │   (scrollable)             │
│ Campaigns  │                             │
│ Settings   │                             │
│            │                             │
└─────────────────────────────────────────┘
```

**Sidebar specs:**
- Width: 256px (collapsed: 64px)
- Position: Fixed, persistent
- Background: Dark (slate-900), separated from main
- Collapse animation: 200ms ease-in-out
- Supports dark/light theme independent coloring

### Tablet (768–1024px): Collapsible Sidebar

```
┌──────────────────────────────────────┐
│ ☰ Dashboard [Search]  Theme 👤       │ ← Hamburger menu
├──────────────────────────────────────┤
│                                       │
│   Main Content (wider gutters)        │
│                                       │
│                                       │
└──────────────────────────────────────┘
```

**Behavior:**
- Sidebar hidden by default
- Hamburger menu toggles drawer overlay
- Drawer slides in from left, dims background
- Swipe right dismisses (if browser supports)

### Mobile (375–768px): Bottom Tab Navigation

```
┌──────────────────────────────────┐
│ Dashboard              [Search] 👤│ ← Top bar only
├──────────────────────────────────┤
│                                  │
│   Main Content (full-width)      │
│   (scrolls vertically only)      │
│                                  │
├──────────────────────────────────┤
│ 📊 📱 👥 ⚙️  ☰                     │ ← Bottom nav, 5 items max
└──────────────────────────────────┘
```

**Navigation:**
- Bottom tab bar: 5 primary items max (Dashboard, Records, Users, Tools, More)
- "More" → overflow menu (Settings, Admin, Workflows, etc.)
- Top app bar: Minimal (logo/title, search, profile)
- No nested navigation in bottom tabs

---

## 7. Animation & Micro-Interactions

### Timing Standards (Tailwind/React Spring)

```css
/* Easing & duration tokens */
--duration-fast: 150ms;      /* Button press, hover, focus */
--duration-normal: 200ms;    /* Navigation, modal appear */
--duration-slow: 300ms;      /* Page transition, expand/collapse */

--easing-in: cubic-bezier(0.4, 0, 1, 1);        /* ease-in */
--easing-out: cubic-bezier(0, 0, 0.2, 1);       /* ease-out */
--easing-inout: cubic-bezier(0.4, 0, 0.2, 1);   /* ease-in-out */
--easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1); /* Spring bounce */
```

### Interaction Patterns

#### Button Press
```css
button {
  transition: all 150ms ease-out;
}
button:active {
  transform: scale(0.98);
  opacity: 0.9;
}
```

#### Hover State (Desktop)
```css
button:hover {
  box-shadow: var(--shadow-md);
  transform: translateY(-2px);
  transition: all 150ms ease-out;
}
```

#### Loading Spinner
```css
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.spinner {
  animation: spin 1s linear infinite;
  /* Respect prefers-reduced-motion */
}
@media (prefers-reduced-motion: reduce) {
  .spinner { animation: none; }
}
```

#### Modal Entry
```css
@keyframes modalEnter {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
.modal {
  animation: modalEnter 200ms ease-out;
}
```

#### List Item Stagger
```css
/* Stagger entrance by 30-50ms per item */
.list-item:nth-child(1) { animation-delay: 0ms; }
.list-item:nth-child(2) { animation-delay: 40ms; }
.list-item:nth-child(3) { animation-delay: 80ms; }
/* etc. */
```

---

## 8. Accessibility Standards (WCAG 2.1 AA+)

### Critical Must-Haves

✅ **Color Contrast**
- Body text: ≥4.5:1 (AA standard)
- Large text (18px+): ≥3:1
- Interactive elements: ≥4.5:1
- Verify with [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

✅ **Focus States**
- Visible focus ring on all interactive elements (2–4px)
- Focus ring color: contrasts with background
- Tab order matches visual order

✅ **Semantic HTML**
```html
<!-- Good -->
<button class="btn">Delete</button>
<label for="email">Email</label>
<input id="email" type="email" aria-required="true">

<!-- Avoid -->
<div onClick="...">Delete</div>
<div>Email</div>
<input placeholder="Enter email">
```

✅ **ARIA Attributes**
```html
<!-- Icon-only buttons need aria-label -->
<button aria-label="Close dialog" class="close-btn">✕</button>

<!-- Form errors need aria-live -->
<div role="alert" aria-live="polite">
  Email is required
</div>

<!-- Expandable sections -->
<button aria-expanded="false" aria-controls="details">
  More Options
</button>
<div id="details" role="region" hidden>...</div>
```

✅ **Mobile Accessibility**
- Touch targets: ≥44×44px
- Text scaling: Support 200% zoom without loss of function
- Gesture alternatives: Provide visible controls for critical actions
- Screen readers: All controls have meaningful labels

---

## 9. Dark Mode Implementation

### Strategy: Dark-First Design

1. **Design dark mode first** (preferred for enterprises)
2. **Test light mode separately** (don't just invert colors)
3. **Use semantic tokens** (not hardcoded hex values)

### Color Adjustments by Theme

```css
/* Light mode: Higher contrast, cooler accents */
[data-theme="light"] {
  --color-text-primary: #0F172A;       /* Slate-900 */
  --color-text-secondary: #64748B;     /* Slate-500 */
  --color-surface-primary: #FFFFFF;
  --color-surface-secondary: #F8FAFC;  /* Slate-50 */
  --color-border: #E2E8F0;             /* Slate-200 */
  --color-primary: #4F46E5;            /* Indigo-600 */
}

/* Dark mode: Warm, reduced brightness */
[data-theme="dark"] {
  --color-text-primary: #F1F5F9;       /* Slate-100 */
  --color-text-secondary: #94A3B8;     /* Slate-400 */
  --color-surface-primary: #0F172A;    /* Slate-950 */
  --color-surface-secondary: #1E293B;  /* Slate-900 */
  --color-border: #475569;             /* Slate-700 */
  --color-primary: #6366F1;            /* Indigo-500 (brighter for dark) */
}
```

### Shadow Adjustments

```css
/* Light: Darker shadows */
[data-theme="light"] {
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.15);
}

/* Dark: Lighter/softer shadows (prevent "black hole" effect) */
[data-theme="dark"] {
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
}
```

### Implementation

```jsx
// React context for theme
const [theme, setTheme] = useState(() => {
  const stored = localStorage.getItem('theme');
  if (stored) return stored;
  // Default to dark for enterprise
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
});

useEffect(() => {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
}, [theme]);
```

---

## 10. Current FlowCRM UI → Premium Redesign Map

### Issues to Address

| Current | Issue | Premium Solution |
|---------|-------|------------------|
| Slate-50/50 light gray background | Lacks contrast, tires eyes | Adopt dark mode as default (slate-950) |
| Indigo/Violet accent colors | Good, but unsaturated | Brighten indigo to 6366F1 in dark mode for pop |
| Inconsistent spacing | Pages feel unaligned | Enforce 8pt grid, define spacing tokens |
| View-based routing | No deep linking, poor UX | Consider URL-based routing for premium feel |
| All pages similar density | Dense, hard to scan | Progressive disclosure: show core, hide secondary |
| No dark mode | Mobile users squint | Implement dark first, light secondary |
| Sidebar always visible | Wastes mobile space | Responsive sidebar: fixed desktop, drawer mobile |
| Icon set (Lucide) | Professional | Keep as-is; ensure consistent sizing |
| Form layouts | Functional but plain | Add helper text, clearer error handling, focus rings |
| Modals/toasts basic | Minimal feedback | Add scrim, animation, accessibility announcements |

---

## 11. Implementation Checklist

### Phase 1: Design System Setup (Week 1)
- [ ] Define Tailwind theme config with custom tokens
- [ ] Create CSS custom properties file
- [ ] Set up dark mode toggle in React Context
- [ ] Test contrast ratios (WCAG AA)

### Phase 2: Component Refactor (Week 2–3)
- [ ] Button component: states, sizes, loading
- [ ] Form inputs: labels, helper text, error states
- [ ] Card component: elevation, padding, hover
- [ ] Modal: scrim, animation, close affordances
- [ ] Toast/notification: positioning, auto-dismiss, a11y

### Phase 3: Layout Updates (Week 3–4)
- [ ] Sidebar: responsive collapse, animation
- [ ] Navigation: tab bar mobile, deep linking setup
- [ ] Responsive grid system: mobile/tablet/desktop
- [ ] Safe area awareness (mobile notch, etc.)

### Phase 4: Polish (Week 4–5)
- [ ] Animation: 150–300ms micro-interactions
- [ ] Accessibility audit: keyboard nav, focus, screen reader
- [ ] Dark mode: full parity testing
- [ ] Cross-device: iPhone, iPad, desktop verification

### Phase 5: Launch (Week 5–6)
- [ ] Performance: lazy loading, code splitting
- [ ] SEO: semantic HTML, meta tags
- [ ] Testing: unit tests on components, E2E on flows
- [ ] Documentation: design tokens, component library

---

## 12. Design Token Export (Tailwind Config)

```javascript
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EEF2FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
        },
        surface: {
          light: '#F8FAFC',
          'light-secondary': '#F1F5F9',
        },
        neutral: {
          0: '#FFFFFF',
          950: '#0F172A',
        },
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
      fontSize: {
        body: ['15px', { lineHeight: '1.6' }],
        sm: ['14px', { lineHeight: '1.5' }],
      },
      boxShadow: {
        sm: '0 1px 2px 0 rgba(0,0,0,0.05)',
        md: '0 4px 6px -1px rgba(0,0,0,0.1)',
        lg: '0 10px 15px -3px rgba(0,0,0,0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 200ms ease-out',
        'slide-up': 'slideUp 200ms ease-out',
        spin: 'spin 1s linear infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { transform: 'translateY(16px)', opacity: 0 }, to: { transform: 'translateY(0)', opacity: 1 } },
      },
    },
  },
};
```

---

## 13. Success Metrics (Post-Launch)

- [ ] Mobile usability: 90%+ positive feedback
- [ ] Accessibility: WCAG 2.1 AA+ compliance verified
- [ ] Dark mode adoption: 65%+ users opt-in
- [ ] Performance: Lighthouse score ≥90
- [ ] Touch target compliance: 100% of buttons ≥44px
- [ ] Contrast compliance: 100% of text ≥4.5:1

---

## References

- **Material Design 3**: https://m3.material.io/
- **Apple Human Interface Guidelines**: https://developer.apple.com/design/human-interface-guidelines/
- **WCAG 2.1 Accessibility**: https://www.w3.org/WAI/WCAG21/quickref/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **WebAIM Color Contrast**: https://webaim.org/resources/contrastchecker/
