// Satır içi SVG ikonlar (harici kaynak yok). Hepsi dekoratif: aria-hidden.
import type { JSX } from 'preact';

interface Boyut {
  boyut?: number;
}

const Svg = ({ children, boyut = 22 }: { children: JSX.Element | JSX.Element[] } & Boyut) => (
  <svg
    width={boyut}
    height={boyut}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IkonEv = () => (
  <Svg>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </Svg>
);
export const IkonGrafik = () => (
  <Svg>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </Svg>
);
export const IkonTekrar = () => (
  <Svg>
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15.5 6.2L3 16" />
    <path d="M3 21v-5h5" />
  </Svg>
);
export const IkonAyar = () => (
  <Svg>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Svg>
);
export const IkonTakvim = () => (
  <Svg>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M16 3v4M8 3v4M3 10h18" />
  </Svg>
);
export const IkonGeri = () => (
  <Svg>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);
export const IkonIleri = ({ boyut }: Boyut) => (
  <Svg boyut={boyut}>
    <path d="m9 18 6-6-6-6" />
  </Svg>
);
export const IkonTik = ({ boyut }: Boyut) => (
  <Svg boyut={boyut}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);
export const IkonCarpi = ({ boyut }: Boyut) => (
  <Svg boyut={boyut}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Svg>
);
export const IkonTire = ({ boyut }: Boyut) => (
  <Svg boyut={boyut}>
    <path d="M5 12h14" />
  </Svg>
);
export const IkonBayrak = ({ boyut, dolu }: Boyut & { dolu?: boolean }) => (
  <Svg boyut={boyut}>
    <path d="M5 21V4" />
    <path d="M5 4h12l-2.5 4 2.5 4H5" fill={dolu ? 'currentColor' : 'none'} />
  </Svg>
);
export const IkonKamera = () => (
  <Svg>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Svg>
);
