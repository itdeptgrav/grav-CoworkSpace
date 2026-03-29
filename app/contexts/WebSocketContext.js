// app/contexts/WebSocketContext.js 
"use client";

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import webSocketService from '../utils/websocket';

const WebSocketContext = createContext({});

export const useWebSocket = () => useContext(WebSocketContext);

export const WebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [connectionError, setConnectionError] = useState(null);

  const connect = useCallback(() => {
    webSocketService.connect();
  }, []);

  const disconnect = useCallback(() => {
    webSocketService.disconnect();
    setIsConnected(false);
  }, []);

  const subscribe = useCallback((event, callback) => {
    return webSocketService.subscribe(event, callback);
  }, []);

  useEffect(() => {
    // Connect on mount
    connect();

    // Subscribe to connection status
    const checkConnection = () => {
      setIsConnected(webSocketService.isConnected());
    };

    const interval = setInterval(checkConnection, 3000);

    return () => {
      clearInterval(interval);
      disconnect();
    };
  }, [connect, disconnect]);

  const value = {
    isConnected,
    lastMessage,
    connectionError,
    connect,
    disconnect,
    subscribe,
    emit: webSocketService.emit.bind(webSocketService),
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};
