// app/privacy/layout.js
// This layout overrides the global overflow:hidden set in globals.css
// so the privacy page can scroll normally

export const metadata = {
    title: "Privacy Policy — CoWork by Grav Clothing",
    description: "Privacy Policy for CoWork, the internal collaboration platform by Grav Clothing.",
};

export default function PrivacyLayout({ children }) {
    return (
        <>
            <style>{`
        html, body {
          overflow: auto !important;
          height: auto !important;
          overscroll-behavior: auto !important;
        }
      `}</style>
            {children}
        </>
    );
}