"use client"

import toast from "react-hot-toast"

export const Toast = {
  success: (message = "Operation successful") => {
    toast.success(message)
  },
  
  error: (message = "Something went wrong") => {
    toast.error(message)
  },
  
  info: (message) => {
    toast(message)
  },
  
  loading: (message = "Loading...") => {
    return toast.loading(message)
  },
  
  dismiss: (toastId) => {
    toast.dismiss(toastId)
  },
  
  // Common toast messages
  saved: () => toast.success("Saved successfully"),
  updated: () => toast.success("Updated successfully"),
  deleted: () => toast.success("Deleted successfully"),
  created: () => toast.success("Created successfully"),
  
  // Error messages
  saveError: () => toast.error("Failed to save"),
  updateError: () => toast.error("Failed to update"),
  deleteError: () => toast.error("Failed to delete"),
  createError: () => toast.error("Failed to create"),
  fetchError: () => toast.error("Failed to fetch data"),
  
  // Form validation
  validationError: (field) => toast.error(`Please check ${field}`),
  
  // Auth messages
  loginSuccess: () => toast.success("Login successful"),
  logoutSuccess: () => toast.success("Logged out successfully"),
  authError: () => toast.error("Authentication failed"),
  
  // Network
  networkError: () => toast.error("Network error. Please check your connection"),
  serverError: () => toast.error("Server error. Please try again later"),
}