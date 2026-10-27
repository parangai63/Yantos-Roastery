import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type Toast = (msg: string, isError?: boolean) => void;
const Ctx = createContext<Toast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; err: boolean } | null>(null);
  const timer = useRef<number>();
  const show = useCallback<Toast>((text, err = false) => {
    setMsg({ text, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), err ? 5000 : 2600);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      {msg && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2.5 text-sm shadow-lg ${msg.err ? "bg-bad text-white" : "bg-ink text-bg"}`}>
          {msg.text}
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
