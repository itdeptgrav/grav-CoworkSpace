"use client";
import { useState, useEffect } from 'react';

export default function GoogleDriveAuth({ onAuthSuccess, children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        checkAuth();
    }, []);

    const checkAuth = async () => {
        try {
            const token = localStorage.getItem('google_drive_token');
            if (token) {
                // Verify token
                const response = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                if (response.ok) {
                    setIsAuthenticated(true);
                    onAuthSuccess?.(true);
                } else {
                    localStorage.removeItem('google_drive_token');
                    setIsAuthenticated(false);
                }
            }
        } catch (err) {
            console.error('Auth check error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAuth = async () => {
        setError(null);
        try {
            // Import dynamically to avoid SSR issues
            const { initGoogleDrive, getAccessToken } = await import('../../../lib/googleDriveService');
            await initGoogleDrive();
            const token = await getAccessToken();
            if (token) {
                setIsAuthenticated(true);
                onAuthSuccess?.(true);
            }
        } catch (err) {
            console.error('Auth error:', err);
            setError('Failed to authenticate with Google Drive. Please try again.');
        }
    };

    if (isLoading) {
        return (
            <div style={styles.container}>
                <div style={styles.loader}>Loading...</div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return (
            <div style={styles.container}>
                <div style={styles.message}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1A73E8" strokeWidth="1.5">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                        <circle cx="12" cy="12" r="3" />
                    </svg>
                    <h3>Google Drive Access Required</h3>
                    <p>To upload PDFs and documents, please connect your Google Drive account.</p>
                    <button onClick={handleAuth} style={styles.button}>
                        Connect Google Drive
                    </button>
                    {error && <p style={styles.error}>{error}</p>}
                </div>
            </div>
        );
    }

    return children;
}

const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '200px',
        padding: '20px',
    },
    message: {
        textAlign: 'center',
        maxWidth: '400px',
    },
    loader: {
        textAlign: 'center',
        color: '#64748B',
    },
    button: {
        marginTop: '16px',
        padding: '10px 24px',
        backgroundColor: '#1A73E8',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: '500',
        fontFamily: 'inherit',
    },
    error: {
        marginTop: '12px',
        color: '#EA4335',
        fontSize: '12px',
    },
};