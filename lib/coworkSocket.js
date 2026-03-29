/**
 * GRAV-CMS/lib/coworkSocket.js
 * Socket.io singleton — one connection per browser session.
 * Import and call getCoworkSocket(employeeId) anywhere.
 */
import { io } from "socket.io-client";

let socket = null;

export function getCoworkSocket(employeeId) {
  if (!socket || socket.disconnected) {
    socket = io(process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000", {
      transports: ["websocket", "polling"],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
    });

    socket.on("connect", () => {
      console.log("✅ Socket connected:", socket.id);
      if (employeeId) {
        socket.emit("join_cowork", employeeId);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });
  }

  // If already connected but employeeId is provided, join the room
  if (socket.connected && employeeId) {
    socket.emit("join_cowork", employeeId);
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}