// app/utils/websocket.js
import { io } from "socket.io-client";

class WebSocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.eventQueue = [];
        this.isProcessingQueue = false;
    }

    connect() {
        if (this.socket?.connected) return;

        const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

        this.socket = io(API_URL, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: this.reconnectDelay,
            reconnectionDelayMax: 5000,
            timeout: 20000,
            autoConnect: true,
            forceNew: false,
            withCredentials: true,
        });

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.socket.on("connect", () => {
            console.log("✅ WebSocket connected:", this.socket.id);
            this.reconnectAttempts = 0;

            // Join production schedule room
            this.socket.emit("join-production-schedule");
            console.log("📢 Joined production-schedule room");

            // Process any queued events
            this.processEventQueue();
        });

        this.socket.on("connect_error", (error) => {
            console.error("❌ WebSocket connection error:", error.message);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.warn("⚠️ Max reconnection attempts reached");
                this.queueEvent("websocket:connection-failed", {
                    error: error.message,
                    attempts: this.reconnectAttempts
                });
            }
        });

        this.socket.on("disconnect", (reason) => {
            console.log("❌ WebSocket disconnected:", reason);
            this.notifyListeners("websocket:disconnected", { reason });

            if (reason === "io server disconnect") {
                // Server initiated disconnect, try to reconnect
                setTimeout(() => this.socket.connect(), 2000);
            }
        });

        this.socket.on("production-schedule:initial", (data) => {
            console.log("📦 Received initial production schedule data");
            this.notifyListeners("production-schedule:initial", data);
        });

        this.socket.on("production-schedule:update", (data) => {
            console.log("📦 Production schedule update received:", data.type);
            this.notifyListeners("production-schedule:update", data);

            // Also trigger specific event type
            this.notifyListeners(data.type, data);
        });

        this.socket.on("manufacturing-order:updated", (data) => {
            console.log("📦 Manufacturing order update received:", data.type);
            this.notifyListeners("manufacturing-order:updated", data);
        });

        this.socket.on("work-order:updated", (data) => {
            console.log("📦 Work order update received:", data.type);
            this.notifyListeners("work-order:updated", data);
        });

        this.socket.on("day-settings:updated", (data) => {
            console.log("📦 Day settings update received");
            this.notifyListeners("day-settings:updated", data);
        });

        this.socket.on("error", (error) => {
            console.error("WebSocket error:", error);
            this.notifyListeners("websocket:error", error);
        });
    }

    queueEvent(event, data) {
        this.eventQueue.push({ event, data, timestamp: Date.now() });

        if (!this.isProcessingQueue) {
            this.processEventQueue();
        }
    }

    async processEventQueue() {
        if (this.isProcessingQueue || this.eventQueue.length === 0) return;

        this.isProcessingQueue = true;

        while (this.eventQueue.length > 0) {
            const queuedEvent = this.eventQueue.shift();

            // Check if event is still relevant (less than 30 seconds old)
            if (Date.now() - queuedEvent.timestamp < 30000) {
                this.notifyListeners(queuedEvent.event, queuedEvent.data);
            }

            // Small delay between processing events
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        this.isProcessingQueue = false;
    }

    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }

        const listeners = this.listeners.get(event);
        listeners.add(callback);

        // Return unsubscribe function
        return () => {
            const callbacks = this.listeners.get(event);
            if (callbacks) {
                callbacks.delete(callback);

                // Clean up empty listener sets
                if (callbacks.size === 0) {
                    this.listeners.delete(event);
                }
            }
        };
    }

    notifyListeners(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            // Use setTimeout to avoid blocking
            setTimeout(() => {
                callbacks.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in ${event} listener:`, error);
                    }
                });
            }, 0);
        }
    }

    emit(event, data, callback) {
        if (this.socket?.connected) {
            if (callback) {
                this.socket.emit(event, data, callback);
            } else {
                this.socket.emit(event, data);
            }
        } else {
            console.warn(`⚠️ Socket not connected, queuing event: ${event}`);
            this.queueEvent(event, { type: "queued-emit", event, data });

            // Try to reconnect
            if (!this.socket) {
                this.connect();
            }
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.emit("leave-production-schedule");
            this.socket.disconnect();
            this.socket = null;
            this.listeners.clear();
            this.eventQueue = [];
        }
    }

    isConnected() {
        return this.socket?.connected || false;
    }

    getSocketId() {
        return this.socket?.id || null;
    }
}

// Create singleton instance
const webSocketService = new WebSocketService();

export default webSocketService;