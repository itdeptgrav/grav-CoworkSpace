// utils/api.js
export const apiFetch = async (url, options = {}) => {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  const defaultOptions = {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  };

  try {
    const response = await fetch(`${API_URL}${url}`, {
      ...defaultOptions,
      ...options,
    });

    if (response.status === 401) {
      // Clear any invalid tok ens
      document.cookie =
        "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      throw new Error("Authentication required");
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("API fetch error:", error);
    throw error;
  }
};
