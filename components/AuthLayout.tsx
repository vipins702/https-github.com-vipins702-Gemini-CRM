import React from 'react';

// Product name shown on the sign-in screens. Change it here and in scripts/build-site.mjs when renaming.
export const BRAND_NAME = 'FlowCRM';

const display: React.CSSProperties = { fontFamily: '"Bricolage Grotesque", "Segoe UI", system-ui, sans-serif', fontVariationSettings: '"wdth" 88' };

const STAGES: [string, number][] = [['New', 3], ['Contacted', 2], ['Proposal', 1], ['Won', 4]];

/** Shared frame for sign-in, forgot-password and reset screens: brand panel left, form right. */
export const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-white text-[#253341]" style={{ fontFamily: '"Figtree", "Segoe UI", system-ui, sans-serif' }}>
    <aside className="hidden lg:flex flex-col justify-between bg-[#0d2b3e] text-[#c9d6df] p-12 xl:p-16">
      <a href="/" className="flex items-center gap-2.5 text-white text-xl font-bold tracking-tight w-fit" style={display}>
        <img src="/site/mark.svg" alt="" width={30} height={30} />
        {BRAND_NAME}
      </a>
      <div>
        <h1 className="text-white text-[44px] xl:text-[52px] leading-[1.04] font-bold tracking-[-0.02em] max-w-[13ch]" style={display}>
          Every lead from every client, in one pipeline.
        </h1>
        <ul className="mt-12 max-w-sm border-t border-white/10" aria-label="Example pipeline">
          {STAGES.map(([name, n]) => (
            <li key={name} className="flex items-center justify-between py-3.5 border-b border-white/10 text-[15px]">
              <span className="text-[#e6edf2]">{name}</span>
              <span className="min-w-8 text-center rounded-full bg-white/10 px-2.5 py-0.5 text-sm text-white tabular-nums">{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-[#9fb3c1]">WhatsApp, Instagram, Facebook and website leads, in one place.</p>
    </aside>

    <main className="flex items-center justify-center p-6 sm:p-10">
      <div className="w-full max-w-[400px]">
        <a href="/" className="lg:hidden flex items-center gap-2.5 mb-10 text-[#0d2b3e] text-lg font-bold w-fit" style={display}>
          <img src="/site/mark.svg" alt="" width={28} height={28} />
          {BRAND_NAME}
        </a>
        {children}
      </div>
    </main>
  </div>
);

export const authHeading = 'text-[30px] leading-tight font-bold tracking-[-0.02em] text-[#0d2b3e]';
export const authDisplay = display;
export const authInput = 'w-full h-12 px-3.5 text-[15px] text-[#253341] bg-white border-[1.5px] border-[#dde3e8] rounded-[10px] outline-none transition-[border-color,box-shadow] focus:border-[#0d2b3e] focus:shadow-[0_0_0_3px_rgba(244,166,33,0.35)] placeholder:text-[#9aa6b2]';
export const authButton = 'w-full h-12 rounded-full bg-[#f4a621] hover:bg-[#d98e0f] text-[#0d2b3e] text-[15px] font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#0d2b3e]';
export const authLink = 'font-semibold text-[#0d2b3e] underline decoration-[#f4a621] decoration-2 underline-offset-4 hover:decoration-[#0d2b3e]';
export const authLabel = 'block text-sm font-semibold text-[#0d2b3e] mb-1.5';

export const AuthError: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" aria-live="assertive" className="p-3 rounded-[10px] bg-[#fdecea] text-[#8a2a20] text-sm font-medium">{message}</div>
);
