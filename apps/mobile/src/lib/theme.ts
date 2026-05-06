export const theme = {
  colors: {
    primary: '#2563eb', // blue-600
    primaryLight: '#eff6ff', // blue-50
    success: '#16a34a', // green-600
    successLight: '#f0fdf4', // green-50
    warning: '#d97706', // amber-600
    warningLight: '#fffbeb', // amber-50
    danger: '#dc2626', // red-600
    dangerLight: '#fef2f2', // red-50
    info: '#7c3aed', // violet-600
    infoLight: '#faf5ff', // violet-50
    slate: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  typography: {
    h1: { fontSize: 28, fontWeight: 'bold' as const },
    h2: { fontSize: 24, fontWeight: 'bold' as const },
    h3: { fontSize: 20, fontWeight: 'bold' as const },
    body: { fontSize: 16, fontWeight: 'normal' as const },
    bodyBold: { fontSize: 16, fontWeight: 'bold' as const },
    caption: { fontSize: 14, color: '#64748b' },
    small: { fontSize: 12, color: '#64748b' },
  },
  shadows: {
    sm: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 2,
    },
    md: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
  },
};
