"use client";
import { createAuthClient } from "better-auth/react";
import { clearOfflineData } from "./offline/idb-store";

export const authClient = createAuthClient();

export const signOut = () =>
  authClient.signOut({
    fetchOptions: {
      onSuccess: async () => {
        await clearOfflineData(); // não deixa dados nem pendências da conta neste aparelho
        // recarga completa de propósito: descarta qualquer estado do cliente da sessão encerrada
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/login");
      },
    },
  });
