/** @type {import('tailwindcss').Config} */
module.exports = {
  // C1 is a single light system — no dark variant exists and no `.dark` class
  // is ever applied. Kept on `class` (rather than removed) so that any stray
  // `dark:` utility in an unconverted component stays inert instead of firing
  // on the operator's OS colour-scheme preference.
  darkMode: ['class'],
  content: [
    './src/renderer/index.html',
    './src/renderer/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
        },

        // ── Blocks C1 vocabulary ────────────────────────────────────
        // Domain names for the same tokens. Prefer these in new code:
        // `bg-live` says what it means where `bg-primary` does not.
        seam: 'hsl(var(--background))',
        field: {
          DEFAULT: 'hsl(var(--card))',
          raised: 'hsl(var(--secondary))',
          press: 'hsl(var(--accent))',
        },
        selected: {
          DEFAULT: 'hsl(var(--selected))',
          foreground: 'hsl(var(--selected-foreground))',
        },
        live: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        settled: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
        owed: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
      },

      // Square corners everywhere — the rule is enforced by the build so a
      // stray `rounded-*` cannot reintroduce one.
      borderRadius: {
        none: '0',
        sm: '0',
        DEFAULT: '0',
        md: '0',
        lg: '0',
        xl: '0',
        '2xl': '0',
        '3xl': '0',
        full: '0',
      },

      // Separation is a seam or a change of fill — never depth. Zeroed in the
      // theme for the same reason as borderRadius: an unconverted component
      // carrying `shadow-sm` should render flat rather than reintroduce
      // elevation the system doesn't use.
      boxShadow: {
        none: 'none',
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
        inner: 'none',
      },

      // Two spacing values and four heights govern the whole surface.
      spacing: {
        seam: 'var(--seam-w)',
        pad: 'var(--pad)',
        moat: 'var(--moat)',
      },
      height: {
        row: 'var(--h-row)',
        control: 'var(--h-control)',
        action: 'var(--h-action)',
        key: 'var(--h-key)',
      },
      minHeight: {
        row: 'var(--h-row)',
        control: 'var(--h-control)',
        action: 'var(--h-action)',
        key: 'var(--h-key)',
      },
      width: {
        control: 'var(--h-control)',
        key: 'var(--h-key)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
