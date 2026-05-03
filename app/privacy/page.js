"use client";

export default function PrivacyPolicy() {
    const lastUpdated = "April 30, 2026";
    const companyName = "Grav Clothing";
    const appName = "CoWork";
    const website = "https://cowork.grav.in";
    const contactEmail = "itdeptgrav@gmail.com";

    return (
        <div style={{ fontFamily: "'Inter', 'Segoe UI', sans-serif", background: "#f8fafc", minHeight: "100vh" }}>
            <style>{`
        html { scroll-behavior: smooth; }
        .toc-link:hover { background: #f8fafc; color: #6366f1; }
        .toc-link { transition: background 0.15s, color 0.15s; border-radius: 6px; margin: 1px 8px; display: block; padding: 7px 12px !important; }
        @media (max-width: 768px) {
          .privacy-toc { display: none !important; }
          .privacy-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

            {/* Header */}
            <header style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 24px" }}>
                <div style={{ maxWidth: 860, margin: "0 auto", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, background: "linear-gradient(135deg, #6366f1, #8b5cf6)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                            </svg>
                        </div>
                        <span style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>CoWork</span>
                        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>by {companyName}</span>
                    </div>
                    <a href="/" style={{ fontSize: 13, color: "#6366f1", textDecoration: "none", fontWeight: 500 }}>← Back to App</a>
                </div>
            </header>

            {/* Hero */}
            <div style={{ background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", padding: "48px 24px", textAlign: "center" }}>
                <div style={{ maxWidth: 600, margin: "0 auto" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", borderRadius: 99, padding: "6px 16px", marginBottom: 16, fontSize: 12, color: "#fff", fontWeight: 500 }}>
                        🔒 Your privacy matters to us
                    </div>
                    <h1 style={{ margin: "0 0 12px", fontSize: 36, fontWeight: 800, color: "#fff", letterSpacing: "-0.03em" }}>
                        Privacy Policy
                    </h1>
                    <p style={{ margin: 0, fontSize: 15, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
                        Last updated: {lastUpdated}
                    </p>
                </div>
            </div>

            {/* Content */}
            <div style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px" }}>
                <div className="privacy-grid" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 40, alignItems: "start" }}>

                    {/* Sidebar TOC */}
                    <div className="privacy-toc" style={{ position: "sticky", top: 24, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 0", fontSize: 13 }}>
                        <p style={{ margin: "0 20px 12px", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#94a3b8" }}>Contents</p>
                        {[
                            ["#overview", "Overview"],
                            ["#information", "Information We Collect"],
                            ["#google", "Google Account & Gmail"],
                            ["#use", "How We Use Data"],
                            ["#sharing", "Data Sharing"],
                            ["#storage", "Data Storage"],
                            ["#rights", "Your Rights"],
                            ["#security", "Security"],
                            ["#contact", "Contact Us"],
                        ].map(([href, label]) => (
                            <a key={href} href={href} className="toc-link" style={{ display: "block", padding: "7px 20px", color: "#475569", textDecoration: "none", lineHeight: 1.4 }}>
                                {label}
                            </a>
                        ))}
                    </div>

                    {/* Main content */}
                    <div style={{ fontSize: 15, lineHeight: 1.8, color: "#334155" }}>

                        {/* Intro box */}
                        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 12, padding: "20px 24px", marginBottom: 40 }}>
                            <p style={{ margin: 0, fontSize: 14, color: "#0369a1", lineHeight: 1.7 }}>
                                <strong>Plain English summary:</strong> CoWork is an internal company tool used only by {companyName} employees.
                                We only access your Google data (Gmail, Calendar) to show it inside CoWork — we never sell it, share it, or use it for ads.
                                You can disconnect at any time.
                            </p>
                        </div>

                        <Section id="overview" title="1. Overview">
                            <p>
                                {appName} ("{appName}", "we", "us", or "our") is an internal collaboration platform operated by <strong>{companyName}</strong>,
                                a garment manufacturing company based in India. This Privacy Policy describes how we collect, use, and protect
                                information when you use our platform at <a href={website} style={{ color: "#6366f1" }}>{website}</a>.
                            </p>
                            <p>
                                {appName} is exclusively available to authorized employees of {companyName}. By using {appName},
                                you agree to the practices described in this policy.
                            </p>
                        </Section>

                        <Section id="information" title="2. Information We Collect">
                            <SubTitle>2.1 Account Information</SubTitle>
                            <p>When your account is created by an administrator, we store:</p>
                            <List items={[
                                "Full name and employee ID",
                                "Email address (company or personal, used for login)",
                                "Department, role, and designation",
                                "Profile picture (if uploaded)",
                                "Encrypted password",
                            ]} />

                            <SubTitle>2.2 Usage Data</SubTitle>
                            <p>We automatically collect limited usage data including:</p>
                            <List items={[
                                "Messages sent within CoWork (stored in Firebase Firestore)",
                                "Tasks created, assigned, and completed",
                                "Meeting schedules and attendance",
                                "Login timestamps and session activity",
                            ]} />

                            <SubTitle>2.3 Google Account Data (Optional)</SubTitle>
                            <p>
                                If you voluntarily connect your personal Google account (via the "Connect Gmail" feature in Settings),
                                we access the following data from Google's APIs:
                            </p>
                            <List items={[
                                "Gmail inbox messages (read-only) — to display your emails inside CoWork",
                                "Your Google account email address — to identify your connected account",
                                "Your Google profile name and picture — for display purposes",
                            ]} />
                            <p>
                                This connection is <strong>entirely optional</strong>. CoWork functions fully without it.
                                You can disconnect your Google account at any time from Settings.
                            </p>
                        </Section>

                        <Section id="google" title="3. Google Account & Gmail Access">
                            <div style={{ background: "#fefce8", border: "1px solid #fde68a", borderRadius: 10, padding: "16px 20px", marginBottom: 20 }}>
                                <p style={{ margin: 0, fontSize: 14, color: "#92400e", fontWeight: 500 }}>
                                    ⚠️ Important: CoWork's use of Google user data complies with the
                                    <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" style={{ color: "#92400e", marginLeft: 4 }}>
                                        Google API Services User Data Policy
                                    </a>, including the Limited Use requirements.
                                </p>
                            </div>

                            <SubTitle>3.1 What we access</SubTitle>
                            <p>When you connect your Gmail account, we request the following OAuth scopes:</p>
                            <List items={[
                                "gmail.readonly — to read your inbox messages",
                                "userinfo.email — to know which Gmail account is connected",
                                "userinfo.profile — to display your name",
                            ]} />

                            <SubTitle>3.2 How we use Google data</SubTitle>
                            <List items={[
                                "Gmail messages are fetched and displayed only to you — no other user can see your inbox",
                                "We do NOT store Gmail message content in our databases — it is fetched live each time you open the Gmail view",
                                "We store only your OAuth refresh token (encrypted) in Firebase, to maintain your connection",
                                "We do NOT use Gmail data for advertising, analytics, or any purpose other than displaying it to you",
                            ]} />

                            <SubTitle>3.3 Data retention</SubTitle>
                            <p>
                                Your Google OAuth token is stored only in your employee record in Firebase Firestore.
                                When you disconnect Gmail from Settings, the token is permanently deleted.
                                We do not retain any Gmail content after your session ends.
                            </p>

                            <SubTitle>3.4 Limited Use Disclosure</SubTitle>
                            <p>
                                CoWork's use of information received from Google APIs adheres to the
                                <strong> Google API Services User Data Policy</strong>, including the Limited Use requirements.
                                Specifically:
                            </p>
                            <List items={[
                                "We only use Google data to provide the in-app Gmail inbox feature",
                                "We do not transfer Google data to third parties",
                                "We do not use Google data for serving advertisements",
                                "We do not allow humans to read your Gmail data (it is only machine-processed to display to you)",
                            ]} />
                        </Section>

                        <Section id="use" title="4. How We Use Your Data">
                            <p>We use the information we collect to:</p>
                            <List items={[
                                "Operate and maintain the CoWork platform",
                                "Enable communication between employees (messages, groups, meetings)",
                                "Manage tasks, deadlines, and work progress",
                                "Display your Gmail inbox (only if you choose to connect Gmail)",
                                "Send push notifications for messages, tasks, and meetings",
                                "Maintain security and prevent unauthorized access",
                            ]} />
                            <p>
                                We do <strong>not</strong> use your data for advertising, marketing to third parties,
                                or any purpose beyond operating CoWork as a workplace tool for {companyName} employees.
                            </p>
                        </Section>

                        <Section id="sharing" title="5. Data Sharing & Disclosure">
                            <p>We do not sell, trade, or share your personal data with third parties, except:</p>
                            <List items={[
                                "Firebase (Google) — for database, authentication, and real-time messaging infrastructure",
                                "Cloudinary — for storing uploaded images and audio files",
                                "LiveKit — for real-time video/audio meeting infrastructure",
                                "Render — for backend hosting",
                                "Legal requirements — if required by law or to protect rights and safety",
                            ]} />
                            <p>
                                All third-party services we use are industry-standard platforms with their own privacy policies and security practices.
                            </p>
                        </Section>

                        <Section id="storage" title="6. Data Storage & Security">
                            <p>
                                Your data is stored in <strong>Google Firebase Firestore</strong>, a cloud database operated by Google LLC.
                                Data is encrypted at rest and in transit using industry-standard TLS encryption.
                            </p>
                            <p>
                                CoWork is accessible only to employees with valid credentials issued by a company administrator.
                                All API endpoints are protected by Firebase Authentication tokens.
                            </p>
                        </Section>

                        <Section id="rights" title="7. Your Rights">
                            <p>As a CoWork user, you have the right to:</p>
                            <List items={[
                                "Access your personal data stored in CoWork",
                                "Request correction of inaccurate data",
                                "Disconnect your Google account at any time (Settings → Connect Gmail → Disconnect)",
                                "Request deletion of your account — contact your administrator or IT department",
                            ]} />
                        </Section>

                        <Section id="security" title="8. Security">
                            <p>
                                We implement appropriate technical and organizational measures to protect your information against
                                unauthorized access, alteration, disclosure, or destruction. These include:
                            </p>
                            <List items={[
                                "Firebase Authentication for all user sessions",
                                "Role-based access control (CEO, Team Lead, Employee)",
                                "Encrypted token storage for Google OAuth credentials",
                                "HTTPS-only communication between frontend and backend",
                            ]} />
                        </Section>

                        <Section id="contact" title="9. Contact Us">
                            <p>
                                If you have any questions about this Privacy Policy or how we handle your data, please contact:
                            </p>
                            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "20px 24px", marginTop: 12 }}>
                                <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#0f172a" }}>{companyName} — IT Department</p>
                                <p style={{ margin: "0 0 4px", fontSize: 14, color: "#475569" }}>
                                    📧 Email: <a href={`mailto:${contactEmail}`} style={{ color: "#6366f1" }}>{contactEmail}</a>
                                </p>
                                <p style={{ margin: "0 0 4px", fontSize: 14, color: "#475569" }}>
                                    🌐 Website: <a href={website} style={{ color: "#6366f1" }}>{website}</a>
                                </p>
                                <p style={{ margin: 0, fontSize: 14, color: "#475569" }}>
                                    📍 India
                                </p>
                            </div>
                        </Section>

                        {/* Footer note */}
                        <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid #e2e8f0", fontSize: 13, color: "#94a3b8", textAlign: "center" }}>
                            <p style={{ margin: "0 0 4px" }}>This policy is effective as of {lastUpdated}.</p>
                            <p style={{ margin: 0 }}>© {new Date().getFullYear()} {companyName}. All rights reserved.</p>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Helper components ─────────────────────────────────────────────────────────
function Section({ id, title, children }) {
    return (
        <section id={id} style={{ marginBottom: 40, scrollMarginTop: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 16px", letterSpacing: "-0.02em", paddingBottom: 10, borderBottom: "2px solid #f1f5f9" }}>
                {title}
            </h2>
            {children}
        </section>
    );
}

function SubTitle({ children }) {
    return (
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1e293b", margin: "20px 0 8px", letterSpacing: "-0.01em" }}>
            {children}
        </h3>
    );
}

function List({ items }) {
    return (
        <ul style={{ margin: "8px 0 16px", paddingLeft: 20 }}>
            {items.map((item, i) => (
                <li key={i} style={{ marginBottom: 6, color: "#475569" }}>{item}</li>
            ))}
        </ul>
    );
}