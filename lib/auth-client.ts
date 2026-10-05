"use client";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

// Recarga completa de propósito: descarta qualquer estado do cliente da sessão encerrada.
// eslint-disable-next-line @next/next/no-location-assign-relative-destination
export const signOut = () => authClient.signOut({ fetchOptions: { onSuccess: () => window.location.assign("/login") } });
