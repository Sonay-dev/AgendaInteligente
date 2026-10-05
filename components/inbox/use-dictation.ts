"use client";
// Ditado por voz em pt-BR com a Web Speech API (Chrome/Edge/Safari; o Firefox não tem).
// Atenção: no Chrome o áudio é processado pelos servidores do Google.
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

interface Recognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const subscribe = () => () => {};

const ERRORS: Record<string, string> = {
  "not-allowed": "Permita o uso do microfone para ditar.",
  "service-not-allowed": "O navegador bloqueou o reconhecimento de voz.",
  "no-speech": "Não ouvi nada. Tente de novo.",
  "audio-capture": "Nenhum microfone encontrado.",
  network: "Sem conexão com o serviço de voz.",
};

/** onFinal recebe cada trecho reconhecido; `interim` mostra o que está sendo ouvido. */
export function useDictation(onFinal: (text: string) => void) {
  // false no servidor, real no navegador (sem divergência de hidratação)
  const supported = useSyncExternalStore(subscribe, () => !!getCtor(), () => false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalRef = useRef(onFinal);

  useEffect(() => {
    finalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor || rec.current) return;
    const r = new Ctor();
    r.lang = "pt-BR";
    r.continuous = false; // para sozinho após uma pausa
    r.interimResults = true;
    r.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalRef.current(res[0].transcript.trim());
        else partial += res[0].transcript;
      }
      setInterim(partial);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORS[e.error] ?? `Erro no ditado (${e.error}).`);
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      setInterim("");
    };
    setError(null);
    rec.current = r;
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
